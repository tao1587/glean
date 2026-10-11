import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { loadCompiledRoute, articleUrl, engineeringUrl, listing, article, ctx, iso } from './engineering-date-test-utils.mjs';

test('actual legacy compiled route gets a featured publication date from the article', async () => {
  const runtime = await loadCompiledRoute();
  try {
    const result = await runtime.route.handler(ctx('1'));
    assert.equal(iso(result.item[0].pubDate), '2026-05-25T00:00:00.000Z');
    assert.equal(result.item[0].link, articleUrl);
    assert.equal(result.item[0].title, 'Featured engineering fixture');
    assert.ok(result.item[0].description.includes('Public engineering body fixture.'));
    assert.ok(result.item[0].description.includes('src="https://images.test/fixture.png"'));
    assert.ok(!result.item[0].description.includes('srcset='));
    assert.deepEqual(runtime.requests, [engineeringUrl, articleUrl]);
  } finally { runtime.close(); }
});

test('date-less old full-item cache is repaired without replacing the cached body', async () => {
  const cached = Object.freeze({ title: 'Old cached title', link: articleUrl, pubDate: '', description: '<p>Existing retained body</p>' });
  const runtime = await loadCompiledRoute({ cached });
  try {
    const result = await runtime.route.handler(ctx());
    assert.equal(iso(result.item[0].pubDate), '2026-05-25T00:00:00.000Z');
    assert.equal(result.item[0].description, '<p>Existing retained body</p>');
    assert.equal(result.item[0].title, 'Featured engineering fixture');
    assert.equal(cached.pubDate, '');
    await runtime.route.handler(ctx());
    assert.deepEqual(runtime.requests, [engineeringUrl, articleUrl, engineeringUrl]);
  } finally { runtime.close(); }
});

test('current listing date repairs an old cache hit without an extra article request', async () => {
  const runtime = await loadCompiledRoute({ html: listing('May 25, 2026'), cached: { link: articleUrl, pubDate: '', description: '<p>Retained</p>' } });
  try {
    const result = await runtime.route.handler(ctx());
    assert.equal(iso(result.item[0].pubDate), '2026-05-25T00:00:00.000Z');
    assert.equal(result.item[0].description, '<p>Retained</p>');
    assert.deepEqual(runtime.requests, [engineeringUrl]);
  } finally { runtime.close(); }
});

test('existing valid date survives a date-less list without refetching the article', async () => {
  const runtime = await loadCompiledRoute({ cached: { title: 'Cached', link: articleUrl, pubDate: '2026-05-20T00:00:00.000Z', description: '<p>Retained</p>' } });
  try {
    const result = await runtime.route.handler(ctx());
    assert.equal(iso(result.item[0].pubDate), '2026-05-20T00:00:00.000Z');
    assert.deepEqual(runtime.requests, [engineeringUrl]);
  } finally { runtime.close(); }
});

test('JSON-LD publication date is used when publication meta and visible date are absent', async () => {
  const articleHtml = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite","datePublished":"1999-01-01"},{"@type":"BlogPosting","url":"${articleUrl}","datePublished":"2026-05-25","dateModified":"2026-06-06"}]}</script><article><div><div class="Body__body"><p>Body</p></div></div></article>`;
  const runtime = await loadCompiledRoute({ articleHtml });
  try { assert.equal(iso((await runtime.route.handler(ctx())).item[0].pubDate), '2026-05-25T00:00:00.000Z'); }
  finally { runtime.close(); }
});

test('article publication time datetime is accepted without CSS-date text or schema', async () => {
  const articleHtml = `<article><header>Published <time datetime="2026-05-25"></time></header><div><div class="Body__body"><p>Body</p></div></div></article>`;
  const runtime = await loadCompiledRoute({ articleHtml });
  try { assert.equal(iso((await runtime.route.handler(ctx())).item[0].pubDate), '2026-05-25T00:00:00.000Z'); }
  finally { runtime.close(); }
});

test('a machine-readable Updated time is not mistaken for publication time', async () => {
  const articleHtml = `<article><div><p class="HeroEngineering__date">Updated <time datetime="2026-06-06">Jun 6, 2026</time></p><div class="Body__body"><p>Body</p></div></div></article>`;
  const runtime = await loadCompiledRoute({ articleHtml });
  try { assert.equal(iso((await runtime.route.handler(ctx())).item[0].pubDate), undefined); }
  finally { runtime.close(); }
});

test('fresh public listing metadata is merged over a stale dated full-item cache', async () => {
  const runtime = await loadCompiledRoute({ html: listing('May 25, 2026'), cached: { link: articleUrl, pubDate: '2026-04-01', description: '<p>Retained</p>' } });
  try {
    const item = (await runtime.route.handler(ctx())).item[0];
    assert.equal(iso(item.pubDate), '2026-05-25T00:00:00.000Z');
    assert.equal(item.description, '<p>Retained</p>');
    assert.deepEqual(runtime.requests, [engineeringUrl]);
  } finally { runtime.close(); }
});

test('an Updated listing timestamp cannot override the article publication date', async () => {
  for (const marker of ['Updated ', '']) {
    const html = `<a class="ArticleList__cardLink" href="/engineering/featured-fixture"><h2>Featured engineering fixture</h2><div class="ArticleList__date">${marker}<time datetime="2026-06-06" ${marker ? '' : 'itemprop="dateModified"'}>Jun 6, 2026</time></div></a>`;
    const runtime = await loadCompiledRoute({ html });
    try { assert.equal(iso((await runtime.route.handler(ctx())).item[0].pubDate), '2026-05-25T00:00:00.000Z'); }
    finally { runtime.close(); }
  }
});

test('unidentified and foreign schema cannot take the current article publication date', async () => {
  for (const mainEntityOfPage of [articleUrl, { '@id': articleUrl }]) {
    const articleHtml = `<script type="application/ld+json">${JSON.stringify({ '@graph': [
      { '@type': 'Article', datePublished: '1999-01-01' },
      { '@type': 'BlogPosting', mainEntityOfPage: 'https://unrelated.test/post', datePublished: '2000-01-01' },
      { '@type': 'BlogPosting', mainEntityOfPage, datePublished: '2026-05-25' },
    ] })}</script><article><div><div class="Body__body"><p>Body</p></div></div></article>`;
    const runtime = await loadCompiledRoute({ articleHtml });
    try { assert.equal(iso((await runtime.route.handler(ctx())).item[0].pubDate), '2026-05-25T00:00:00.000Z'); }
    finally { runtime.close(); }
  }
});

test('modification dates and invalid or unrelated publication metadata never become a publication date', async () => {
  const articleHtml = `<meta property="article:published_time" content="2026-02-31"><meta property="article:modified_time" content="2026-06-06"><script type="application/ld+json">{"@type":"BlogPosting","url":"https://unrelated.test/post","datePublished":"2026-01-01"}</script><article><div><p class="HeroEngineering__date">Updated June 6, 2026</p><div class="Body__body"><p>Body</p></div></div></article>`;
  const runtime = await loadCompiledRoute({ articleHtml });
  try { assert.equal(iso((await runtime.route.handler(ctx())).item[0].pubDate), undefined); }
  finally { runtime.close(); }
});

test('featured article precedes ordinary cards while navigation and unrelated cards do not consume limit', async () => {
  const html = `<a class="ArticleList__cardLink" href="/engineering"><h2>Engineering navigation</h2></a>
    <a class="ArticleList__cardLink" href="https://unrelated.test/engineering/foreign"><h2>Foreign card</h2></a>
    <a class="ArticleList__cardLink" href="/research/not-engineering"><h3>Research navigation</h3></a>
    ${listing()}
    <a class="ArticleList__cardLink" href="/engineering/ordinary-fixture"><h3>Ordinary fixture</h3><div class="ArticleList__date">Apr 23, 2026</div></a>`;
  const runtime = await loadCompiledRoute({ html });
  try {
    const result = await runtime.route.handler(ctx('1'));
    assert.deepEqual(result.item.map((item) => [item.title, item.link, iso(item.pubDate)]), [
      ['Featured engineering fixture', articleUrl, '2026-05-25T00:00:00.000Z'],
    ]);
    assert.deepEqual(runtime.requests, [engineeringUrl, articleUrl]);
  } finally { runtime.close(); }
});

test('publication dates are identical under UTC and Asia/Shanghai', () => {
  const code = `const {loadCompiledRoute, listing, ctx, iso}=await import(${JSON.stringify(new URL('./engineering-date-test-utils.mjs', import.meta.url).href)});
    const runtime=await loadCompiledRoute({html:listing('May 25, 2026')});
    console.log(JSON.stringify(iso((await runtime.route.handler(ctx())).item[0].pubDate)));runtime.close();`;
  for (const TZ of ['UTC', 'Asia/Shanghai']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], { input: code, encoding: 'utf8', env: { ...process.env, TZ } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout), '2026-05-25T00:00:00.000Z');
  }
});

test('article concurrency is bounded at two and input card order is retained', async () => {
  let active = 0;
  let maximum = 0;
  const html = Array.from({ length: 5 }, (_, i) => `<a class="ArticleList__cardLink" href="/engineering/fixture-${i}"><h3>Fixture ${i}</h3><div class="ArticleList__date">May 25, 2026</div></a>`).join('');
  const runtime = await loadCompiledRoute({ html, fetchArticle: async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return article;
  } });
  try {
    const result = await runtime.route.handler(ctx('3'));
    assert.deepEqual(result.item.map((item) => item.title), ['Fixture 0', 'Fixture 1', 'Fixture 2']);
    assert.equal(maximum, 2);
    assert.equal(runtime.requests.length, 4);
  } finally { runtime.close(); }
});
