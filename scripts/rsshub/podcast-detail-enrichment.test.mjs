import assert from 'node:assert/strict';
import test from 'node:test';
const { enrichPodcastEpisodes } = await import(process.env.RSSHUB_ENRICH_MODULE || './podcast-detail-enrichment.mjs');

const items = Array.from({ length: 8 }, (_, i) => ({
  eid: `episode-${i}`, title: `Episode ${i}`, link: `https://www.xiaoyuzhoufm.com/episode/episode-${i}`,
  pubDate: `2026-10-${String(i + 1).padStart(2, '0')}`, enclosure_url: `https://audio.example.test/${i}.mp3`,
}));
const overview = items.map((item) => ({ eid: item.eid, description: `Overview ${item.eid}` }));
const rateLimit = () => Object.assign(new Error('rate limited'), { response: { status: 429 } });
const cache = { tryGet: async (_key, callback) => callback() };
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

test('episode detail concurrency is bounded at two while preserving order and metadata', async () => {
  let active = 0, peak = 0;
  const result = await enrichPodcastEpisodes(items, overview, {
    cache, buildId: 'public-build', fetch: async (url) => {
      active++; peak = Math.max(peak, active); await pause(); active--;
      return { pageProps: { episode: { shownotes: `Full ${url.split('/').at(-1)}` } } };
    },
  });
  assert.equal(peak, 2);
  assert.deepEqual(result.map(({ description, ...metadata }) => metadata), items);
  assert.equal(result.every((item) => item.description.startsWith('Full ')), true);
});

test('one 429 stops further detail requests and uses sufficient overview descriptions', async () => {
  let attempts = 0;
  const result = await enrichPodcastEpisodes(items, overview, {
    cache, buildId: 'public-build', fetch: async () => {
      attempts++; await pause(); throw rateLimit();
    },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(result, items.map((item) => ({ ...item, description: `Overview ${item.eid}` })));
});

test('rate limited overview fallbacks do not replace full episode cache entries', async () => {
  const saved = new Map([[items[0].link, { ...items[0], description: 'Cached full body' }]]);
  const caching = { tryGet: async (key, callback) => {
    if (saved.has(key)) return saved.get(key);
    const value = await callback(); saved.set(key, value); return value;
  } };
  const result = await enrichPodcastEpisodes(items, overview, {
    cache: caching, buildId: 'public-build', fetch: async () => { throw rateLimit(); },
  });
  assert.equal(result[0].description, 'Cached full body');
  assert.equal(saved.size, 1);
});

test('missing overview body remains an explicit failure instead of invented article text', async () => {
  await assert.rejects(enrichPodcastEpisodes(items, [], {
    cache, buildId: 'public-build', fetch: async () => { throw rateLimit(); },
  }), (error) => error.response?.status === 429);
});

test('other detail errors retain the original failure behavior', async () => {
  const failure = Object.assign(new Error('server failure'), { response: { status: 500 } });
  await assert.rejects(enrichPodcastEpisodes(items, overview, {
    cache, buildId: 'public-build', fetch: async () => { throw failure; },
  }), (error) => error === failure);
});
