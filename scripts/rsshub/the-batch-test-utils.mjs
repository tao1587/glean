import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const batchUrl = 'https://www.deeplearning.ai/the-batch/';
export const latestUrl = 'https://www.deeplearning.ai/the-batch/issue-374';
export const weeklyCard = (id, title, heading = 'h3', headingClass = 'subtitle1') => `<article class="card bg-base-100 relative h-full">
  <div><span class="pointer-events-auto"><a href="/the-batch/tag/oct-09-2026">Oct 09, 2026</a></span>
  <${heading} class="${headingClass}">${title}</${heading}><p>Weekly fixture excerpt.</p></div>
  <a class="absolute inset-0" href="/the-batch/issue-${id}"></a></article>`;
export const weeklyIndex = `<html lang="en"><head><title>The Batch | DeepLearning.AI</title><meta property="og:description" content="Weekly AI news">
  <meta property="og:image" content="https://images.test/batch.jpg"><meta property="og:site_name" content="DeepLearning.AI"></head><body><main>
  ${weeklyCard(374, 'Latest weekly fixture', 'h2', 'headline4')}
  <aside><article class="card grid grid-cols-3"><a class="absolute inset-0" href="/the-batch/issue-286"></a><h3 class="subtitle2">Popular older issue</h3></article></aside>
  ${weeklyCard(373, 'Prior weekly fixture')}
  ${weeklyCard(372, 'Earlier weekly fixture')}
  </main></body></html>`;

export const issuePage = (id = 374, { body = true, schema = true, accessible = true } = {}) => `<html lang="en"><head>
  <link rel="canonical" href="https://www.deeplearning.ai/the-batch/issue-${id}">
  ${schema ? `<script type="application/ld+json">${JSON.stringify({
    '@type': 'NewsArticle', url: `https://www.deeplearning.ai/the-batch/issue-${id}`,
    headline: `Weekly fixture ${id}`, description: 'Weekly intro fixture.',
    datePublished: id === 374 ? '2026-10-09T07:00:25.000-07:00' : '2026-10-02T07:00:25.000-07:00',
    dateModified: '2026-10-10T08:00:00.000-07:00', author: [{ '@type': 'Person', name: 'Fixture author' }],
    image: ['https://images.test/cover.jpg'], articleSection: 'The Batch Newsletter',
    isAccessibleForFree: accessible, inLanguage: 'en',
  })}</script>` : '<meta property="article:modified_time" content="2026-10-10T08:00:00-07:00">'}
  </head><body><article><header>Issue header</header><div class="container">
  ${body ? '<div class="prose prose-a:text-secondary mx-auto"><p>Dear friends, public weekly body fixture.</p><h2>News section</h2><p>Independent news text.</p><a href="https://news.test/story?utm_campaign=fixture&amp;utm_source=mail&amp;keep=1">Read source</a></div>' : '<section>Subscribe teaser only</section>'}
  <form>Subscribe CTA outside article body</form></div></article><nav>Global navigation</nav></body></html>`;

export async function loadBatchRoute({ html = weeklyIndex, fetchIssue, source, patched = !process.env.RSSHUB_BATCH_BASELINE } = {}) {
  source ??= await readFile(new URL('./fixtures/deeplearning-the-batch-legacy.mjs', import.meta.url), 'utf8');
  if (patched) {
    const { patchRouteSource } = await import('./patch-the-batch.mjs');
    source = patchRouteSource(source, new URL('./the-batch-adapter.mjs', import.meta.url).href);
  }
  const requests = [];
  const values = new Map();
  const environment = {
    fetch: async (url) => {
      requests.push(url);
      if (url === batchUrl || url.startsWith('https://www.deeplearning.ai/the-batch/tag/')) return html;
      if (fetchIssue) return fetchIssue(url);
      const id = url.match(/\/issue-(\d+)$/)?.[1];
      if (id) return issuePage(Number(id));
      throw new Error('Unexpected The Batch fixture URL');
    },
    cache: { tryGet: async (key, fill) => {
      if (values.has(key)) return values.get(key);
      const result = await fill(); values.set(key, result); return result;
    } },
    parseDate: (date) => new Date(date),
  };
  const key = randomUUID();
  globalThis.__gleanBatchTestEnvironments ||= new Map();
  globalThis.__gleanBatchTestEnvironments.set(key, environment);
  const module = (field) => 'data:text/javascript,' + encodeURIComponent(`export const t=globalThis.__gleanBatchTestEnvironments.get(${JSON.stringify(key)}).${field};`);
  for (const [prefix, field] of [['ofetch', 'fetch'], ['cache', 'cache'], ['parse-date', 'parseDate']]) {
    source = source.replace(new RegExp(`(["'])\\./${prefix}-[^"']+\\1`, 'g'), JSON.stringify(module(field)));
  }
  if (process.env.RSSHUB_CHEERIO_MODULE) source = source.replace(/(["'])cheerio\1/g, JSON.stringify(process.env.RSSHUB_CHEERIO_MODULE));
  if (process.env.RSSHUB_HONO_ROOT) {
    const root = new URL(process.env.RSSHUB_HONO_ROOT);
    const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
    for (const name of ['jsx/jsx-runtime', 'jsx/dom/server', 'html']) {
      source = source.replace(`"hono/${name}"`, JSON.stringify(new URL(pkg.exports[`./${name}`].import, root).href));
    }
  }
  const exports = await import('data:text/javascript,' + encodeURIComponent(source + `\n// ${key}`));
  const compactError = (handler) => async (...args) => {
    try { return await handler(...args); }
    catch (error) {
      if (error.stack) error.stack = error.stack.split('\n').map((line) => line.includes('data:text/javascript,') ? '    at compiled public fixture' : line).join('\n');
      throw error;
    }
  };
  exports.route.handler = compactError(exports.route.handler);
  return { ...exports, requests, values, close: () => globalThis.__gleanBatchTestEnvironments.delete(key) };
}

export const batchContext = (limit, tag) => ({ req: { param: () => ({ tag }), query: (key) => key === 'limit' ? limit : undefined } });
