const HOME_URL = 'https://ainews.liduos.com/';
const RECIPE = 'glean-ainews-v1';
const BODY_SELECTOR = 'main .prose[role="tabpanel"][data-state="active"]';
const CACHE_PREFIX = 'glean-ainews-publication-v1:';

function validDay(year, month, day) {
  return year >= 1970 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function publicationDate(value) {
  if (typeof value !== 'string') return;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match || !validDay(Number(match[1]), Number(match[2]), Number(match[3])) ||
      Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) return;
  if (match[7] !== 'Z' && (Number(match[7].slice(1, 3)) > 23 || Number(match[7].slice(4)) > 59)) return;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function articleUrl(href) {
  if (typeof href !== 'string') return;
  try {
    const url = new URL(href, HOME_URL);
    const day = url.pathname.match(/^\/post\/(\d{4})-(\d{2})-(\d{2})$/);
    if (url.origin !== new URL(HOME_URL).origin || url.username || url.password || url.search || url.hash ||
        !day || !validDay(Number(day[1]), Number(day[2]), Number(day[3]))) return;
    return url.href;
  } catch { return; }
}

function unsupported(detail) {
  return new Error(`Unsupported AI daily ${detail}`);
}

export function createAinewsHandler({ got, cache, load, sanitizeHtml, originalHandler }) {
  async function fetchPage(url) {
    // Use RSSHub's existing proxy/TLS/retry transport. This fixed publication
    // never follows a redirect into another URL or forwards caller headers.
    const response = await got({ method: 'get', url, responseType: 'arrayBuffer', redirect: 'error' });
    if (!response?.data) throw unsupported('page response');
    return load(new TextDecoder('utf-8', { fatal: true }).decode(response.data));
  }

  function bodyHtml($) {
    const body = $(BODY_SELECTOR);
    if (body.length !== 1) throw unsupported('article body layout');
    body.find('nav, aside, header, footer, form, button, input, select, textarea, script, style').remove();
    const description = sanitizeHtml(body.html() || '', { allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'] });
    if (load(description).text().trim().length <= 100) throw unsupported('article body content');
    return description;
  }

  async function loadArticle(post) {
    const record = await cache.tryGet(`${CACHE_PREFIX}${post.link}`, async () => {
      const $ = await fetchPage(post.link);
      const identity = $('meta[property="og:url"]');
      const published = $('meta[property="article:published_time"]');
      const pubDate = published.length === 1 ? publicationDate(published.attr('content')) : undefined;
      if (identity.length !== 1 || identity.attr('content') !== post.link || !pubDate) {
        throw unsupported('publication identity or date');
      }
      return { link: post.link, pubDate, description: bodyHtml($) };
    });
    if (!record || record.link !== post.link || !publicationDate(record.pubDate) || typeof record.description !== 'string') {
      throw unsupported('cached publication metadata');
    }
    // Never freeze the current listing title in the article-body cache or
    // mutate a cached object. Only successful, dated article bodies are reused.
    const description = sanitizeHtml(record.description, { allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'] });
    if (load(description).text().trim().length <= 100) throw unsupported('cached article body');
    return { ...post, guid: post.link, pubDate: record.pubDate, description };
  }

  return async function handler(ctx) {
    if (ctx.req.param('url') !== HOME_URL || ctx.req.param('routeParams') !== RECIPE) return originalHandler(ctx);
    const $ = await fetchPage(HOME_URL);
    const posts = [];
    const seen = new Set();
    for (const node of $('main a[href][title]').toArray()) {
      const anchor = $(node);
      if (anchor.closest('nav, aside, header, footer').length) continue;
      const link = articleUrl(anchor.attr('href'));
      const title = anchor.text().trim();
      if (!link || !title || seen.has(link)) continue;
      seen.add(link);
      posts.push({ link, title });
      if (posts.length === 20) break;
    }
    if (!posts.length) throw unsupported('publication listing');
    const items = new Array(posts.length);
    let next = 0;
    let failure;
    async function worker() {
      while (!failure && next < posts.length) {
        const index = next++;
        try { items[index] = await loadArticle(posts[index]); }
        catch (error) { failure ||= error; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, posts.length) }, worker));
    if (failure) throw failure;
    return { title: 'AI 开发者日报', link: HOME_URL, description: '莫尔索维护的 AI 开发者日报', item: items };
  };
}
