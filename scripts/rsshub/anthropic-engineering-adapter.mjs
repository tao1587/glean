const ENGINEERING_URL = 'https://www.anthropic.com/engineering';
const DATE_CACHE_PREFIX = 'glean-anthropic-engineering-publication-v1:';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function publicationDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : new Date(value);
  if (typeof value !== 'string') return;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/);
  const human = text.match(/^(?:Published\s+)?([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!iso && !human) return;
  const year = Number(iso?.[1] ?? human[3]);
  const month = iso ? Number(iso[2]) : MONTHS.indexOf(human[1].toLowerCase()) + 1;
  const day = Number(iso?.[3] ?? human[2]);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return;
  if (iso?.[4] && (Number(iso[4]) > 23 || Number(iso[5]) > 59 || Number(iso[6]) > 59)) return;
  const date = iso?.[4] ? new Date(text) : new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function schemaPublicationDate(value, articleUrl) {
  if (Array.isArray(value)) {
    for (const node of value) {
      const date = schemaPublicationDate(node, articleUrl);
      if (date) return date;
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some((type) => ['Article', 'BlogPosting', 'NewsArticle'].includes(type))) {
    const identity = value.url || (typeof value.mainEntityOfPage === 'string' ? value.mainEntityOfPage : value.mainEntityOfPage?.['@id']) || value['@id'];
    if (!identity) return;
    try {
      const url = new URL(identity, articleUrl);
      url.hash = '';
      if (url.href !== articleUrl) return;
    } catch { return; }
    const date = publicationDate(value.datePublished);
    if (date) return date;
  }
  return schemaPublicationDate(value['@graph'], articleUrl);
}

function articlePublicationDate($, articleUrl) {
  const published = publicationDate($('meta[property="article:published_time"]').first().attr('content'));
  if (published) return published;
  for (const node of $('script[type="application/ld+json"]').toArray()) {
    try {
      const date = schemaPublicationDate(JSON.parse($(node).text()), articleUrl);
      if (date) return date;
    } catch { /* An invalid schema does not make a visible publication date invalid. */ }
  }
  for (const node of $('article header time[datetime], p[class*="date"] time[datetime], time[itemprop="datePublished"][datetime]').toArray()) {
    const time = $(node);
    if (time.attr('itemprop') !== 'datePublished' && !/^Published(?:\s|$)/.test(time.parent().text().trim())) continue;
    const date = publicationDate(time.attr('datetime'));
    if (date) return date;
  }
  for (const node of $('p[class*="date"]').toArray()) {
    const text = $(node).text().trim();
    if (!text.startsWith('Published ')) continue;
    const date = publicationDate(text);
    if (date) return date;
  }
}

export function createEngineeringHandler({ load, fetch, cache, pMap, originalHandler }) {
  return async (ctx) => {
    const $ = load(await fetch(ENGINEERING_URL));
    // Keep the original route available if its publication-card layout disappears.
    const cards = $('a[class*="cardLink"]');
    if (!cards.length) return originalHandler(ctx);
    const limit = ctx.req.query('limit') ? Number(ctx.req.query('limit')) : 20;
    const posts = cards.toArray().map((node) => {
      const anchor = $(node);
      const href = anchor.attr('href') ?? '';
      const link = href.startsWith('http') ? href : `https://www.anthropic.com${href}`;
      const dateArea = anchor.find('div[class*="date"]');
      const dateText = dateArea.text().trim();
      const time = anchor.find('time[datetime]').first();
      const modified = /\b(?:Updated|Modified)\b/i.test(dateText) || time.attr('itemprop') === 'dateModified';
      return { title: anchor.find('h2, h3').text().trim(), link,
        pubDate: modified ? undefined : publicationDate(time.attr('datetime')) || publicationDate(dateText) };
    }).filter((post) => {
      if (!post.title) return false;
      try {
        const url = new URL(post.link);
        return url.origin === 'https://www.anthropic.com' && /^\/engineering\/[^/]+\/?$/.test(url.pathname);
      } catch { return false; }
    }).slice(0, limit);
    const item = await pMap(posts, async (post) => {
      let fetched = false;
      const cached = await cache.tryGet(post.link, async () => {
        fetched = true;
        const article = load(await fetch(post.link));
        const body = article('article > div > div[class*="__body"]');
        body.find('img').each((_, node) => {
          const image = article(node);
          image.removeAttr('style srcset');
          const original = new URLSearchParams(image.attr('src')).get('/_next/image?url');
          if (original) image.attr('src', original);
        });
        return { ...post, description: body.html() ?? undefined,
          pubDate: post.pubDate || articlePublicationDate(article, post.link) };
      });
      let pubDate = post.pubDate || publicationDate(cached.pubDate);
      if (!pubDate && !fetched) {
        const verified = await cache.tryGet(`${DATE_CACHE_PREFIX}${post.link}`, async () => {
          const article = load(await fetch(post.link));
          return { pubDate: articlePublicationDate(article, post.link)?.toISOString() };
        });
        pubDate = publicationDate(verified?.pubDate);
      }
      // Cached bodies remain usable; current listing metadata cannot be frozen
      // by an old full-item cache record. Do not mutate existing cache objects.
      return { ...cached, ...post, pubDate };
    }, { concurrency: 2 });
    return { title: 'Anthropic Engineering', link: ENGINEERING_URL,
      description: 'Latest engineering posts from Anthropic',
      image: 'https://www.anthropic.com/images/icons/apple-touch-icon.png', item };
  };
}
