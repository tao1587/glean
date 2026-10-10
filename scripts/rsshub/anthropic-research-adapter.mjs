const RESEARCH_URL = 'https://www.anthropic.com/research';

export function extractResearchPosts(html, { load, parseDate }) {
  const $ = load(html);
  const posts = [];
  const seen = new Set();
  // Publication cards are separate from topic navigation and featured taxonomy links.
  for (const element of $('a[class*="PublicationList"][class*="listItem"][href]').toArray()) {
    const anchor = $(element);
    const title = anchor.find('[class*="__title"]').first().text().trim();
    if (!title) continue;
    let url;
    try { url = new URL(anchor.attr('href'), RESEARCH_URL); } catch { continue; }
    if (url.origin !== 'https://www.anthropic.com' || !/^\/research\/[^/]+\/?$/.test(url.pathname)) continue;
    url.search = '';
    url.hash = '';
    const link = url.toString();
    if (seen.has(link)) continue;
    const time = anchor.find('time').first();
    const rawDate = time.attr('datetime') || time.text().trim();
    let pubDate;
    if (rawDate) {
      const parsed = parseDate(rawDate);
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) pubDate = parsed;
    }
    seen.add(link);
    posts.push({ title, link, ...(pubDate ? { pubDate } : {}) });
  }
  return posts;
}

export function createResearchHandler({ load, fetch, cache, parseDate, pMap, originalHandler }) {
  return async (ctx) => {
    const posts = extractResearchPosts(await fetch(RESEARCH_URL), { load, parseDate });
    // Keep the upstream Next.js parser available when publication markup changes again.
    if (posts.length === 0) return originalHandler(ctx);
    const requestedLimit = Number(ctx?.req?.query?.('limit'));
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(100, Math.floor(requestedLimit)) : 20;
    const item = await pMap(posts.slice(0, limit), (post) => cache.tryGet(post.link, async () => {
      const $ = load(await fetch(post.link));
      const content = $('#main-content > article');
      content.find('[class$="__header"], [class$="__sidebar-container"], [class$="__controls"], [class$="__socialShare"], [class^="LandingPageSection-module-scss-module__"], [class^="SubjectNewsletter-module-scss-module__"]').remove();
      content.find('img').each((_, element) => {
        const image = $(element);
        image.removeAttr('style srcset');
        const source = image.attr('src');
        if (!source) return;
        const original = new URLSearchParams(source).get('/_next/image?url');
        if (original) image.attr('src', original);
      });
      return { ...post, description: content.html() };
    }), { concurrency: 2 });
    return {
      title: 'Anthropic Research', link: RESEARCH_URL,
      description: 'Latest research from Anthropic', item,
    };
  };
}
