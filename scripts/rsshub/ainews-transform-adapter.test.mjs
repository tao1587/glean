import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAinewsRoute, homeUrl, latestUrl, latestTitle, bodyText, card, homepage, articlePage, context, legacyRules } from './ainews-transform-test-utils.mjs';

test('official daily recipe supplies a real publication date with full body and stable URL GUID', async () => {
  const runtime = await loadAinewsRoute();
  try {
    const result = await runtime.route.handler(context());
    assert.equal(result.item.length, 1);
    const item = result.item[0];
    assert.equal(item.pubDate, '2026-09-14T00:00:00.000Z');
    assert.equal(item.guid, latestUrl);
    assert.equal(item.link, latestUrl);
    assert.equal(item.title, latestTitle);
    assert.ok(item.description.includes(bodyText));
    assert.ok(item.description.includes('<img src="https://images.example/cover.png"'));
    assert.ok(!item.description.includes('onerror'));
    assert.ok(!item.description.includes('<script'));
    assert.ok(!item.description.includes('Inactive podcast panel'));
    assert.ok(!item.description.includes('Global navigation'));
  } finally { runtime.close(); }
});

test('unmodified legacy recipe demonstrates body-only enrichment without article publication date', async () => {
  const runtime = await loadAinewsRoute({ patched: false });
  try {
    const item = (await runtime.route.handler(context(homeUrl, legacyRules))).item[0];
    assert.ok(item.description.includes(bodyText));
    assert.equal(Number.isFinite(Date.parse(item.pubDate)), false);
  } finally { runtime.close(); }
});

test('other URL and recipe pairs keep the original generic gate and handler', async () => {
  const runtime = await loadAinewsRoute({ allowUnsafe: false });
  try {
    for (const [url, recipe] of [
      [homeUrl, legacyRules], [homeUrl, 'glean-ainews-v2'],
      ['https://liduos.com/weekly', 'glean-ainews-v1'],
      ['https://ainews.liduos.com', 'glean-ainews-v1'],
      ['https://ainews.liduos.com/?url=https://foreign.example', 'glean-ainews-v1'],
    ]) await assert.rejects(runtime.route.handler(context(url, recipe)), /ALLOW_USER_SUPPLY_UNSAFE_DOMAIN/);
    assert.deepEqual(runtime.requests, []);
    assert.equal((await runtime.route.handler(context())).item[0].guid, latestUrl);
  } finally { runtime.close(); }
});

test('foreign, navigation, invalid-date paths and duplicates cannot become article fetches', async () => {
  const invalid = [
    card('2026-10-01', 'Foreign', 'https://foreign.example/post/2026-10-01'),
    card('2026-10-02', 'Credentials', 'https://user:password@ainews.liduos.com/post/2026-10-02'),
    card('2026-10-03', 'Query', '/post/2026-10-03?redirect=https://foreign.example'),
    card('2026-10-04', 'Encoded', '/post/%2e%2e/2026-10-04'),
    card('2026-02-31'),
    `<nav>${card('2026-10-05')}</nav><aside>${card('2026-10-06')}</aside>`,
  ].join('');
  const runtime = await loadAinewsRoute({ html: homepage.replace('<main>', `<main>${invalid}`).replace('</main>', `${card()}</main>`) });
  try {
    const items = (await runtime.route.handler(context())).item;
    assert.deepEqual(items.map((item) => item.guid), [latestUrl]);
    assert.deepEqual(runtime.requests.map((request) => request.url), [homeUrl, latestUrl]);
    assert.ok(runtime.requests.every((request) => request.redirect === 'error'));
  } finally { runtime.close(); }
});

test('missing or invalid published time, foreign identity and teaser-only body fail without caching success', async () => {
  for (const html of [
    articlePage({ published: undefined }).replace(/<meta property="article:published_time"[^>]*>/, ''),
    articlePage({ published: '2026-02-31T00:00:00Z' }),
    articlePage({ identity: 'https://foreign.example/post/2026-09-14' }),
    articlePage({ body: 'Teaser.' }),
    articlePage().replace('data-state="active"', 'data-state="inactive"'),
  ]) {
    const runtime = await loadAinewsRoute({ fetchArticle: async () => html });
    try {
      await assert.rejects(runtime.route.handler(context()), /Unsupported AI daily/);
      assert.equal(runtime.values.size, 0);
    } finally { runtime.close(); }
  }
});

test('an empty or navigation-only listing fails instead of reporting a successful empty feed', async () => {
  for (const html of ['<main></main>', `<main><nav>${card()}</nav></main>`]) {
    const runtime = await loadAinewsRoute({ html });
    try { await assert.rejects(runtime.route.handler(context()), /Unsupported AI daily/); }
    finally { runtime.close(); }
  }
});

test('cache hits preserve real article metadata while current listing titles and future editions remain visible', async () => {
  const values = new Map();
  const first = await loadAinewsRoute({ values });
  try { await first.route.handler(context()); } finally { first.close(); }
  const updatedTitle = 'AI 开发者日报 2026-09-14 — Updated listing title';
  const second = await loadAinewsRoute({ values, html: `<main>${card('2026-09-15')}${card('2026-09-14', updatedTitle)}</main>` });
  try {
    const items = (await second.route.handler(context())).item;
    assert.deepEqual(items.map((item) => item.guid), [`${homeUrl}post/2026-09-15`, latestUrl]);
    assert.equal(items[1].title, updatedTitle);
    assert.equal(items[1].pubDate, '2026-09-14T00:00:00.000Z');
    assert.deepEqual(second.requests.map((request) => request.url), [homeUrl, `${homeUrl}post/2026-09-15`]);
  } finally { second.close(); }
});

test('old generic body-only cached items cannot turn into undated repaired items', async () => {
  const originalCacheKey = `transform:${latestUrl}:main .prose[role="tabpanel"][data-state="active"]`;
  const old = { title: 'Legacy stale title', link: latestUrl, description: '<p>Old cached body</p>' };
  const values = new Map([[originalCacheKey, old]]);
  const runtime = await loadAinewsRoute({ values });
  try {
    const item = (await runtime.route.handler(context())).item[0];
    assert.equal(item.pubDate, '2026-09-14T00:00:00.000Z');
    assert.ok(item.description.includes(bodyText));
    assert.deepEqual(values.get(originalCacheKey), old);
  } finally { runtime.close(); }
});

test('article requests never exceed concurrency two or twenty editions and retain index order', async () => {
  let active = 0;
  let peak = 0;
  const cards = Array.from({ length: 25 }, (_, i) => card(`2026-09-${String(25 - i).padStart(2, '0')}`)).join('');
  const runtime = await loadAinewsRoute({ html: `<main>${cards}</main>`, fetchArticle: async (url) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return articlePage({ day: url.slice(-10) });
  } });
  try {
    const items = (await runtime.route.handler(context(homeUrl, 'glean-ainews-v1', { limit: '1000', url: 'https://foreign.example', itemContent: 'html' }))).item;
    assert.equal(items.length, 20);
    assert.equal(peak, 2);
    assert.equal(runtime.requests.length, 21);
    assert.equal(items[0].guid, `${homeUrl}post/2026-09-25`);
    assert.equal(items[19].guid, `${homeUrl}post/2026-09-06`);
  } finally { runtime.close(); }
});

test('provider redirect failure cannot be accepted as a publication or cached', async () => {
  const runtime = await loadAinewsRoute({ fetchArticle: async (_url, options) => {
    assert.equal(options.redirect, 'error');
    throw new Error('Fixture transport refused redirect');
  } });
  try {
    await assert.rejects(runtime.route.handler(context()), /refused redirect/);
    assert.equal(runtime.values.size, 0);
  } finally { runtime.close(); }
});

test('an explicit publisher timezone is normalized without using modification or edition-path dates', async () => {
  const runtime = await loadAinewsRoute({ fetchArticle: async () => articlePage({ published: '2026-09-13T17:23:45-07:00' }) });
  try { assert.equal((await runtime.route.handler(context())).item[0].pubDate, '2026-09-14T00:23:45.000Z'); }
  finally { runtime.close(); }
});

test('failed article metadata is not cached and a subsequent correct provider response recovers', async () => {
  let attempts = 0;
  const runtime = await loadAinewsRoute({ fetchArticle: async () => articlePage({ published: ++attempts === 1 ? '' : '2026-09-14T00:00:00.000Z' }) });
  try {
    await assert.rejects(runtime.route.handler(context()), /Unsupported AI daily/);
    assert.equal(runtime.values.size, 0);
    assert.equal((await runtime.route.handler(context())).item[0].pubDate, '2026-09-14T00:00:00.000Z');
    assert.equal(runtime.values.size, 1);
    assert.equal(runtime.requests.length, 4);
  } finally { runtime.close(); }
});

test('malformed cached identity, date and body fail closed rather than returning damaged feed items', async () => {
  for (const record of [
    { link: latestUrl, description: `<p>${bodyText}</p>` },
    { link: 'https://foreign.example/post/2026-09-14', pubDate: '2026-09-14T00:00:00.000Z', description: `<p>${bodyText}</p>` },
    { link: latestUrl, pubDate: '2026-02-31T00:00:00.000Z', description: `<p>${bodyText}</p>` },
    { link: latestUrl, pubDate: '2026-09-14T00:00:00.000Z', description: '<p>Teaser only</p>' },
  ]) {
    const values = new Map([[`glean-ainews-publication-v1:${latestUrl}`, record]]);
    const runtime = await loadAinewsRoute({ values });
    try { await assert.rejects(runtime.route.handler(context()), /Unsupported AI daily cached/); }
    finally { runtime.close(); }
  }
});

test('the first provider metadata failure stops new detail dispatch while at most two requests finish', async () => {
  const runtime = await loadAinewsRoute({ html: `<main>${card('2026-09-25')}${card('2026-09-24')}${card('2026-09-23')}${card('2026-09-22')}</main>`, fetchArticle: async (url) => {
    if (url.endsWith('2026-09-25')) return articlePage({ day: '2026-09-25', published: '' });
    await new Promise((resolve) => setImmediate(resolve));
    return articlePage({ day: url.slice(-10) });
  } });
  try {
    await assert.rejects(runtime.route.handler(context()), /Unsupported AI daily/);
    assert.deepEqual(runtime.requests.map((request) => request.url), [homeUrl, `${homeUrl}post/2026-09-25`, `${homeUrl}post/2026-09-24`]);
  } finally { runtime.close(); }
});

test('weekly generic requests retain identical original selection, publication dates and full bodies', async () => {
  const weeklyUrl = 'https://liduos.com/weekly';
  const weeklyArticleUrl = 'https://liduos.com/weekly/the-weekly-gradient-120';
  const rules = new URLSearchParams({ item: 'main > ul > li:nth-child(-n+4)', itemTitle: 'a', itemLink: 'a', itemPubDate: 'time', itemPubDateAttr: 'datetime', itemContent: 'article#article' }).toString();
  const options = { fetchArticle: async (url) => {
    if (url === weeklyUrl) return '<main><ul><li><a href="/weekly/the-weekly-gradient-120">Weekly fixture</a><time datetime="2026-10-04T08:00:00.000Z">October 4</time></li></ul></main>';
    if (url === weeklyArticleUrl) return `<article id="article"><p>${bodyText}</p></article>`;
    throw new Error('Unexpected weekly fixture URL');
  } };
  const original = await loadAinewsRoute({ ...options, patched: false });
  const wrapped = await loadAinewsRoute(options);
  try {
    const expected = await original.route.handler(context(weeklyUrl, rules));
    const actual = await wrapped.route.handler(context(weeklyUrl, rules));
    assert.deepEqual(actual, expected);
    assert.deepEqual(wrapped.requests, original.requests);
    assert.equal(actual.item[0].pubDate, '2026-10-04T08:00:00.000Z');
    assert.equal(actual.item[0].link, weeklyArticleUrl);
  } finally { original.close(); wrapped.close(); }
});
