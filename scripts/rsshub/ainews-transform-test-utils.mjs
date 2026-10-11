import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const homeUrl = 'https://ainews.liduos.com/';
export const latestUrl = `${homeUrl}post/2026-09-14`;
export const latestTitle = 'AI 开发者日报 2026-09-14';
export const bodyText = 'Public daily edition fixture with substantive analysis, independent news references, and developer tooling notes. '.repeat(3);
export const card = (day = '2026-09-14', title = `AI 开发者日报 ${day}`, href = `/post/${day}`) => `<div class="rounded-lg border mb-4"><a href="${href}"><img src="/cover.png"></a><a title="${title}" href="${href}">${title}</a></div>`;
export const homepage = `<html><head><title>AI 开发者日报</title></head><body><nav><a title="Navigation edition" href="/post/2026-01-01">Navigation</a></nav><main><div>${card()}</div></main></body></html>`;
export const articlePage = ({ day = '2026-09-14', identity = `${homeUrl}post/${day}`, published = `${day}T00:00:00.000Z`, body = bodyText } = {}) => `<html><head><title>AI 开发者日报 ${day}</title><meta property="og:url" content="${identity}"><meta property="og:title" content="AI 开发者日报 ${day}">
${published ? `<meta property="article:published_time" content="${published}">` : ''}<meta property="article:modified_time" content="2026-10-11T05:00:00Z"></head><body><nav>Global navigation</nav><main><div class="max-w-3xl"><div class="prose" role="tabpanel" data-state="active"><p>${body}</p><img src="https://images.example/cover.png" onerror="alert(1)"><script>alert('private fixture')</script></div><div class="prose" role="tabpanel" data-state="inactive">Inactive podcast panel</div></div></main><footer>Subscribe footer</footer></body></html>`;
export const legacyRules = new URLSearchParams({
  title: 'AI 开发者日报', item: 'main a[href^="/post/"][title]',
  itemPubDate: 'time', itemPubDateAttr: 'datetime',
  itemContent: 'main .prose[role="tabpanel"][data-state="active"]',
}).toString();
export const context = (url = homeUrl, recipe = 'glean-ainews-v1', query = {}) => ({ req: {
  param: (key) => key === 'url' ? url : key === 'routeParams' ? recipe : undefined,
  query: (key) => query[key],
} });

// Replay the original compiled handler with real Cheerio and sanitize-html.
// Only external HTTP, cache storage and benign route configuration are replaced.
export async function loadAinewsRoute({ html = homepage, fetchArticle, source, values = new Map(), allowUnsafe = true, patched = !process.env.RSSHUB_AINEWS_BASELINE } = {}) {
  source ??= await readFile(new URL('./fixtures/rsshub-html-transform-legacy.mjs', import.meta.url), 'utf8');
  if (patched) {
    const { patchRouteSource } = await import('./patch-html-ainews.mjs');
    source = patchRouteSource(source, new URL('./ainews-transform-adapter.mjs', import.meta.url).href);
  }
  const requests = [];
  const environment = {
    config: { feature: { allow_user_supply_unsafe_domain: allowUnsafe } },
    got: async (options) => {
      requests.push({ ...options });
      if (options.url === homeUrl) return { data: Buffer.from(html) };
      if (fetchArticle) {
        const result = await fetchArticle(options.url, options);
        return typeof result === 'string' ? { data: Buffer.from(result) } : result;
      }
      const day = options.url.match(/^https:\/\/ainews\.liduos\.com\/post\/(\d{4}-\d{2}-\d{2})$/)?.[1];
      if (!day) throw new Error('Unexpected fixture URL');
      return { data: Buffer.from(articlePage({ day })) };
    },
    cache: { tryGet: async (key, fill) => {
      if (values.has(key)) return values.get(key);
      const result = await fill();
      if (result !== undefined) values.set(key, result);
      return result;
    } },
  };
  const key = randomUUID();
  globalThis.__gleanAinewsFixtures ||= new Map();
  globalThis.__gleanAinewsFixtures.set(key, environment);
  const dependency = (field) => 'data:text/javascript,' + encodeURIComponent(`export const t=globalThis.__gleanAinewsFixtures.get(${JSON.stringify(key)}).${field};`);
  source = source.replace(/(["'])\.\/config-not-found-[^"']+\1/g, JSON.stringify('data:text/javascript,export class t extends Error {}'));
  for (const [prefix, field] of [['config', 'config'], ['got', 'got'], ['cache', 'cache']]) {
    source = source.replace(new RegExp(`(["'])\\./${prefix}-[^"']+\\1`, 'g'), JSON.stringify(dependency(field)));
  }
  if (process.env.RSSHUB_CHEERIO_MODULE) source = source.replace(/(["'])cheerio\1/g, JSON.stringify(process.env.RSSHUB_CHEERIO_MODULE));
  if (process.env.RSSHUB_SANITIZE_MODULE) source = source.replace(/(["'])sanitize-html\1/g, JSON.stringify(process.env.RSSHUB_SANITIZE_MODULE));
  const { route } = await import('data:text/javascript,' + encodeURIComponent(source + `\n// ${key}`));
  const original = route.handler;
  route.handler = async (...args) => {
    try { return await original(...args); }
    catch (error) {
      if (error.stack) error.stack = error.stack.split('\n').map((line) => line.includes('data:text/javascript,') ? '    at compiled public HTML-transform fixture' : line).join('\n');
      throw error;
    }
  };
  return { route, requests, values, close: () => globalThis.__gleanAinewsFixtures.delete(key) };
}
