import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBatchRoute, batchUrl, latestUrl, weeklyIndex, weeklyCard, issuePage, batchContext } from './the-batch-test-utils.mjs';

test('actual compiled Next-data route recovers the current public weekly HTML with stable issue GUID', async () => {
  const runtime = await loadBatchRoute();
  try {
    const result = await runtime.route.handler(batchContext());
    assert.equal(result.item.length, 1);
    const item = result.item[0];
    assert.equal(item.link, latestUrl);
    assert.equal(item.guid, 'the-batch-issue-374');
    assert.equal(item.id, 'the-batch-issue-374');
    assert.equal(item.title, 'Weekly fixture 374');
    assert.equal(new Date(item.pubDate).toISOString(), '2026-10-09T14:00:25.000Z');
    assert.equal(item.author, 'Fixture author');
    assert.ok(item.description.includes('public weekly body fixture.'));
    assert.ok(item.description.includes('<blockquote>Weekly intro fixture.</blockquote>'));
    assert.ok(item.description.includes('src="https://images.test/cover.jpg"'));
    assert.ok(!item.description.includes('Subscribe CTA outside'));
    assert.ok(!item.description.includes('utm_campaign'));
    assert.ok(item.description.includes('keep=1'));
    assert.deepEqual(runtime.requests, [batchUrl, latestUrl]);
  } finally { runtime.close(); }
});

test('requested limit excludes popular sidebar issues and retains weekly order', async () => {
  const runtime = await loadBatchRoute();
  try {
    const items = (await runtime.route.handler(batchContext('2'))).item;
    assert.deepEqual(items.map((item) => item.guid), ['the-batch-issue-374', 'the-batch-issue-373']);
    assert.equal(runtime.requests.length, 3);
  } finally { runtime.close(); }
});

test('successful complete issues remain cached across default feed requests', async () => {
  const runtime = await loadBatchRoute();
  try {
    const first = await runtime.route.handler(batchContext());
    const second = await runtime.route.handler(batchContext());
    assert.deepEqual(second.item, first.item);
    assert.deepEqual(runtime.requests, [batchUrl, latestUrl, batchUrl]);
  } finally { runtime.close(); }
});

test('tagged route executes the original compiled handler', async () => {
  const post = { slug: 'legacy-tag-fixture', title: 'Original tag title', published_at: '2026-01-01T00:00:00Z', tags: [], authors: [], excerpt: 'Original intro', html: '<p>Original tag body</p>' };
  const html = `<html lang="en"><head><title>Original tag feed</title><meta property="og:image" content="https://images.test/tag.png"></head><script id="__NEXT_DATA__">${JSON.stringify({ buildId: 'legacy-build', props: { pageProps: { posts: [post] } } })}</script></html>`;
  const runtime = await loadBatchRoute({ html, fetchIssue: async (url) => {
    assert.equal(url, 'https://www.deeplearning.ai/_next/data/legacy-build/the-batch/legacy-tag-fixture.json');
    return { pageProps: { post } };
  } });
  try {
    const result = await runtime.route.handler(batchContext(undefined, 'letters'));
    assert.equal(result.title, 'Original tag feed');
    assert.equal(result.item[0].guid, 'the-batch-legacy-tag-fixture');
    assert.ok(result.item[0].description.includes('Original tag body'));
    assert.equal(runtime.requests[0], 'https://www.deeplearning.ai/the-batch/tag/letters/');
  } finally { runtime.close(); }
});

test('unknown body, missing publication metadata and paid issue fail instead of fabricated feed content', async () => {
  for (const options of [{ body: false }, { schema: false }, { accessible: false }]) {
    const runtime = await loadBatchRoute({ fetchIssue: async () => issuePage(374, options) });
    try { await assert.rejects(runtime.route.handler(batchContext()), /Unsupported|publicly accessible/); }
    finally { runtime.close(); }
  }
});

test('foreign, tag and duplicate cards cannot consume the weekly limit', async () => {
  const html = weeklyIndex.replace('<main>', `<main>${weeklyCard(999, 'Foreign card').replace('/the-batch/issue-999', 'https://unrelated.test/the-batch/issue-999')}${weeklyCard(998, 'Tag card').replace('/the-batch/issue-998', '/the-batch/tag/letters')}`) + weeklyCard(374, 'Duplicate');
  const runtime = await loadBatchRoute({ html });
  try { assert.deepEqual((await runtime.route.handler(batchContext('3'))).item.map((item) => item.guid), ['the-batch-issue-374', 'the-batch-issue-373', 'the-batch-issue-372']); }
  finally { runtime.close(); }
});

test('weekly detail requests are bounded at two and preserve card order', async () => {
  let active = 0;
  let peak = 0;
  const runtime = await loadBatchRoute({ fetchIssue: async (url) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 10)); active--;
    return issuePage(Number(url.match(/issue-(\d+)$/)[1]));
  } });
  try {
    assert.deepEqual((await runtime.route.handler(batchContext('3'))).item.map((item) => item.guid), ['the-batch-issue-374', 'the-batch-issue-373', 'the-batch-issue-372']);
    assert.equal(peak, 2);
  } finally { runtime.close(); }
});

test('foreign canonical identity and invalid publication dates cannot become weekly entries', async () => {
  for (const html of [
    issuePage().replace(`href="${latestUrl}"`, 'href="https://unrelated.test/the-batch/issue-374"'),
    issuePage().replace('2026-10-09T07:00:25.000-07:00', '2026-02-31T07:00:25.000-07:00'),
    issuePage().replace(`"url":"${latestUrl}"`, '"url":"https://unrelated.test/the-batch/issue-374"'),
  ]) {
    const runtime = await loadBatchRoute({ fetchIssue: async () => html });
    try { await assert.rejects(runtime.route.handler(batchContext()), /Unsupported/); }
    finally { runtime.close(); }
  }
});

test('the exported handler uses the same repaired weekly behavior as route.handler', async () => {
  const runtime = await loadBatchRoute();
  try {
    assert.equal((await runtime.handler(batchContext())).item[0].guid, 'the-batch-issue-374');
    assert.equal((await runtime.route.handler(batchContext())).item[0].guid, 'the-batch-issue-374');
    assert.deepEqual(runtime.requests, [batchUrl, latestUrl, batchUrl]);
  } finally { runtime.close(); }
});

test('an unrelated global article cache cannot replace the weekly issue identity', async () => {
  const runtime = await loadBatchRoute();
  runtime.values.set(latestUrl, { link: 'https://unrelated.test/article', guid: 'foreign-guid', title: 'Foreign cached body', pubDate: new Date('2000-01-01'), description: '<p>Foreign cache content</p>' });
  try {
    const item = (await runtime.route.handler(batchContext())).item[0];
    assert.equal(item.link, latestUrl);
    assert.equal(item.guid, 'the-batch-issue-374');
    assert.equal(new Date(item.pubDate).toISOString(), '2026-10-09T14:00:25.000Z');
    assert.deepEqual(runtime.requests, [batchUrl, latestUrl]);
  } finally { runtime.close(); }
});

test('malformed route-owned cache fails closed without mutation or a speculative refetch', async () => {
  const complete = '<p>Complete cached introduction.</p><h2>News</h2><p>Complete cached news.</p>';
  for (const invalid of [
    { link: 'https://unrelated.test/article', guid: 'foreign-guid', title: 'Foreign cached body', pubDate: '2000-01-01T00:00:00Z', description: '<p>Foreign cache content</p>' },
    { link: latestUrl, guid: 'the-batch-issue-374', id: 'the-batch-issue-374', title: 'Teaser', pubDate: '2026-10-09T14:00:25Z', description: '<p>Teaser</p>', content: { html: '<p>Teaser</p>' } },
    { link: latestUrl, guid: 'wrong-guid', id: 'the-batch-issue-374', title: 'Wrong GUID', pubDate: '2026-10-09T14:00:25Z', description: complete, content: { html: complete } },
    { link: latestUrl, guid: 'the-batch-issue-374', id: 'wrong-id', title: 'Wrong ID', pubDate: '2026-10-09T14:00:25Z', description: complete, content: { html: complete } },
    { link: latestUrl, guid: 'the-batch-issue-374', id: 'the-batch-issue-374', title: 'Future cache', pubDate: new Date('2099-10-09T14:00:25Z'), description: complete, content: { html: complete } },
  ]) {
    const runtime = await loadBatchRoute();
    const cacheKey = `glean-the-batch-weekly-v1:${latestUrl}`;
    const value = Object.freeze(invalid);
    runtime.values.set(cacheKey, value);
    try {
      await assert.rejects(runtime.route.handler(batchContext()), /Unsupported The Batch weekly cached item/);
      assert.equal(runtime.values.get(cacheKey), value);
      assert.deepEqual(runtime.requests, [batchUrl]);
    } finally { runtime.close(); }
  }
});

test('serialized complete route-owned cache remains usable with its verified identity', async () => {
  const runtime = await loadBatchRoute();
  try {
    const first = (await runtime.route.handler(batchContext())).item[0];
    const key = `glean-the-batch-weekly-v1:${latestUrl}`;
    runtime.values.clear();
    runtime.values.set(key, JSON.parse(JSON.stringify(first)));
    const second = (await runtime.route.handler(batchContext())).item[0];
    assert.equal(second.guid, 'the-batch-issue-374');
    assert.equal(new Date(second.pubDate).toISOString(), '2026-10-09T14:00:25.000Z');
    assert.equal(second.description, first.description);
    assert.deepEqual(runtime.requests, [batchUrl, latestUrl, batchUrl]);
  } finally { runtime.close(); }
});

test('far-future weekly publication is rejected even when ISO formatting is valid', async () => {
  const runtime = await loadBatchRoute({ fetchIssue: async () => issuePage().replace('2026-10-09T07:00:25.000-07:00', '2099-10-09T07:00:25.000-07:00') });
  try { await assert.rejects(runtime.route.handler(batchContext()), /Unsupported The Batch weekly publication metadata/); }
  finally { runtime.close(); }
});

test('publication clock skew below one hour is allowed while the boundary and later dates are rejected', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-10-11T00:00:00.000Z');
  try {
    for (const [date, accepted] of [
      ['2026-10-11T00:59:59.000Z', true],
      ['2026-10-11T01:00:00.000Z', false],
      ['2026-10-11T01:00:01.000Z', false],
    ]) {
      const runtime = await loadBatchRoute({ fetchIssue: async () => issuePage().replace('2026-10-09T07:00:25.000-07:00', date) });
      try {
        if (accepted) assert.equal(new Date((await runtime.route.handler(batchContext())).item[0].pubDate).toISOString(), '2026-10-11T00:59:59.000Z');
        else await assert.rejects(runtime.route.handler(batchContext()), /Unsupported The Batch weekly publication metadata/);
      } finally { runtime.close(); }
    }
  } finally { Date.now = originalNow; }
});
