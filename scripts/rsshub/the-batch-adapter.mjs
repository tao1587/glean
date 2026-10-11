const ROOT = 'https://www.deeplearning.ai';
const WEEKLY_URL = `${ROOT}/the-batch/`;
const CACHE_PREFIX = 'glean-the-batch-weekly-v1:';
const PUBLICATION_CLOCK_SKEW_MS = 60 * 60 * 1000;

function weeklyUrl(value) {
  try {
    const url = new URL(value, ROOT);
    if (url.origin !== ROOT || !/^\/the-batch\/issue-\d+\/?$/.test(url.pathname)) return;
    url.pathname = url.pathname.replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { /* Ignore navigation or malformed card URLs. */ }
}

function articleSchema(value, link) {
  if (Array.isArray(value)) {
    for (const node of value) {
      const schema = articleSchema(node, link);
      if (schema) return schema;
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  const identity = value.url || (typeof value.mainEntityOfPage === 'string' ? value.mainEntityOfPage : value.mainEntityOfPage?.['@id']) || value['@id'];
  if (types.includes('NewsArticle') && identity && weeklyUrl(identity) === link) return value;
  return articleSchema(value['@graph'], link);
}

function dated(value, parseDate) {
  if (typeof value !== 'string') return;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match) return;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return;
  if (Number.isNaN(new Date(value).getTime())) return;
  const date = parseDate(value);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : undefined;
}

function publishedDate(value, parseDate) {
  const date = value instanceof Date ? value : dated(value, parseDate);
  return date && Number.isFinite(date.getTime()) && date.getTime() < Date.now() + PUBLICATION_CLOCK_SKEW_MS ? date : undefined;
}

function validCachedItem(item, post, load, parseDate) {
  const guid = `the-batch-${post.slug}`;
  if (!item || typeof item !== 'object' || item.link !== post.link || item.guid !== guid || item.id !== guid ||
      typeof item.title !== 'string' || !item.title.trim() || !publishedDate(item.pubDate, parseDate) ||
      typeof item.description !== 'string' || item.content?.html !== item.description) return false;
  const body = load(item.description);
  return body('p').length >= 2 && body('h1,h2,h3').length > 0;
}

export function createWeeklyHandler({ load, fetch, cache, parseDate, renderDescription, originalHandler }) {
  return async (ctx) => {
    // Other tag routes retain their upstream CMS parser and behavior.
    if (ctx.req.param()?.tag) return originalHandler(ctx);
    const $ = load(await fetch(WEEKLY_URL));
    const seen = new Set();
    const posts = [];
    for (const node of $('article.card').toArray()) {
      const card = $(node);
      // Popular sidebar cards use subtitle2 and are not the weekly issue list.
      const title = card.find('h2.headline4, h3.subtitle1').first().text().trim();
      const link = weeklyUrl(card.children('a.absolute.inset-0[href]').first().attr('href'));
      if (!title || !link || seen.has(link)) continue;
      seen.add(link);
      posts.push({ title, link, slug: new URL(link).pathname.split('/').at(-1) });
    }
    if (posts.length === 0) {
      if ($('script#__NEXT_DATA__').text().trim()) return originalHandler(ctx);
      throw new Error('Unsupported The Batch weekly listing layout');
    }
    const limit = ctx.req.query('limit') ? Number(ctx.req.query('limit')) : 1;
    const selected = posts.slice(0, limit);
    const items = new Array(selected.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(2, selected.length) }, async () => {
      while (cursor < selected.length) {
        const index = cursor++;
        const post = selected[index];
        const item = await cache.tryGet(`${CACHE_PREFIX}${post.link}`, async () => {
          const article = load(await fetch(post.link));
          const canonical = weeklyUrl(article('link[rel="canonical"]').attr('href'));
          if (canonical !== post.link) throw new Error('Unsupported The Batch weekly canonical identity');
          let schema;
          for (const node of article('script[type="application/ld+json"]').toArray()) {
            try { schema = articleSchema(JSON.parse(article(node).text()), post.link); }
            catch { /* Other malformed schemas cannot provide article metadata. */ }
            if (schema) break;
          }
          const pubDate = publishedDate(schema?.datePublished, parseDate);
          if (!schema || typeof schema.headline !== 'string' || !schema.headline.trim() || !pubDate) throw new Error('Unsupported The Batch weekly publication metadata');
          if (schema.isAccessibleForFree === false) throw new Error('The Batch weekly issue is not publicly accessible');
          const body = article('article div.prose');
          if (body.length !== 1 || body.find('p').length < 2 || body.find('h1,h2,h3').length === 0) throw new Error('Unsupported The Batch weekly article body');
          body.find('a[href]').each((_, node) => {
            const anchor = article(node);
            if (!anchor.attr('href').includes('utm_campaign')) return;
            const url = new URL(anchor.attr('href'), post.link);
            for (const key of ['utm_campaign', 'utm_source', 'utm_medium', '_hsenc']) url.searchParams.delete(key);
            anchor.attr('href', url.href);
          });
          const image = Array.isArray(schema.image) ? schema.image[0] : schema.image;
          const intro = typeof schema.description === 'string' ? schema.description : undefined;
          const description = renderDescription({ images: typeof image === 'string' ? [{ src: image }] : undefined, intro, description: body.html() });
          const authors = Array.isArray(schema.author) ? schema.author : [schema.author];
          const guid = `the-batch-${post.slug}`;
          return { title: schema.headline, description, pubDate, link: post.link,
            category: schema.articleSection ? [schema.articleSection].flat() : undefined,
            author: authors.map((author) => typeof author === 'string' ? author : author?.name).filter(Boolean).join('/'),
            guid, id: guid, content: { html: description, text: intro }, image, banner: image,
            updated: dated(schema.dateModified, parseDate), language: schema.inLanguage || $('html').prop('lang') };
        });
        if (!validCachedItem(item, post, load, parseDate)) throw new Error('Unsupported The Batch weekly cached item');
        items[index] = item;
      }
    }));
    const image = $('meta[property="og:image"]').attr('content');
    return { title: $('title').text(), description: $('meta[property="og:description"]').attr('content'),
      link: WEEKLY_URL, item: items, allowEmpty: true,
      image: image ? new URL(image, ROOT).href : undefined,
      author: $('meta[property="og:site_name"]').attr('content'), language: $('html').prop('lang') };
  };
}
