import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const engineeringUrl = 'https://www.anthropic.com/engineering';
export const articleUrl = `${engineeringUrl}/featured-fixture`;
export const listing = (date = '') => `<a class="ArticleList-module-scss-module__hash__cardLink" href="/engineering/featured-fixture">
  <h2>Featured engineering fixture</h2>${date ? `<div class="ArticleList__date"><time datetime="2026-05-25">${date}</time></div>` : ''}</a>`;
export const article = `<html><head>
  <meta property="article:published_time" content="2026-05-25T00:00:00.000Z">
  <meta property="article:modified_time" content="2026-06-06T00:28:16.000Z">
  <script type="application/ld+json">{"@type":"BlogPosting","url":"${articleUrl}","datePublished":"2026-05-25T00:00:00.000Z","dateModified":"2026-06-06T00:28:16.000Z"}</script>
  </head><body><article><div><p class="HeroEngineering__date">Published <time datetime="2026-05-25">May 25, 2026</time></p>
  <div class="Body-module-scss-module__hash__body"><p>Public engineering body fixture.</p>
  <img style="width:100%" srcset="old" src="/_next/image?url=https%3A%2F%2Fimages.test%2Ffixture.png"></div></div></article></body></html>`;

// Only the external HTTP/cache boundary is substituted; the compiled route,
// Cheerio and p-map remain executable real code.
export async function loadCompiledRoute({ html = listing(), articleHtml = article, fetchArticle, cached, source, patched = !process.env.RSSHUB_ENGINEERING_BASELINE } = {}) {
  source ??= await readFile(new URL('./fixtures/anthropic-engineering-legacy.mjs', import.meta.url), 'utf8');
  if (patched) {
    const { patchRouteSource } = await import('./patch-anthropic-engineering.mjs');
    source = patchRouteSource(source, pathToFileURL(new URL('./anthropic-engineering-adapter.mjs', import.meta.url).pathname).href);
  }
  const requests = [];
  const values = new Map(cached === undefined ? [] : [[articleUrl, cached]]);
  const environment = {
    fetch: async (url) => {
      requests.push(url);
      if (url === engineeringUrl) return html;
      if (fetchArticle) return fetchArticle(url);
      if (url === articleUrl) return articleHtml;
      throw new Error('Unexpected fixture request');
    },
    cache: { tryGet: async (key, fill) => {
      if (values.has(key)) return values.get(key);
      const value = await fill();
      if (value !== undefined) values.set(key, value);
      return value;
    } },
  };
  const key = randomUUID();
  globalThis.__gleanEngineeringTestEnvironments ||= new Map();
  globalThis.__gleanEngineeringTestEnvironments.set(key, environment);
  const dependency = (field) => 'data:text/javascript,' + encodeURIComponent(`export const t=globalThis.__gleanEngineeringTestEnvironments.get(${JSON.stringify(key)}).${field};`);
  source = source.replace(/(["'])\.\/ofetch-[^"']+\1/g, JSON.stringify(dependency('fetch')));
  source = source.replace(/(["'])\.\/cache-[^"']+\1/g, JSON.stringify(dependency('cache')));
  if (process.env.RSSHUB_CHEERIO_MODULE) source = source.replace(/(["'])cheerio\1/g, JSON.stringify(process.env.RSSHUB_CHEERIO_MODULE));
  if (process.env.RSSHUB_PMAP_MODULE) source = source.replace(/(["'])p-map\1/g, JSON.stringify(process.env.RSSHUB_PMAP_MODULE));
  const { route } = await import('data:text/javascript,' + encodeURIComponent(source + `\n// ${key}`));
  return { route, requests, values, close: () => globalThis.__gleanEngineeringTestEnvironments.delete(key) };
}

export const ctx = (limit) => ({ req: { query: (key) => key === 'limit' ? limit : undefined } });
export const iso = (value) => value ? new Date(value).toISOString() : undefined;
