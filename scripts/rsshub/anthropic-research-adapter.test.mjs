import assert from 'node:assert/strict';
import test from 'node:test';

const { load } = await import(process.env.RSSHUB_CHEERIO_MODULE || 'cheerio');
const { extractResearchPosts, createResearchHandler } = await import(
  process.env.RSSHUB_ADAPTER_MODULE || './anthropic-research-adapter.mjs'
);

const fixture = `
  <a href="/research/alignment" class="HeroTwoColumn__textLink">Alignment</a>
  <a class="PublicationList-module-scss-module__hash__listItem" href="/research/latest">
    <div class="PublicationList-module-scss-module__hash__meta"><time>Oct 9, 2026</time><span>Economics</span></div>
    <span class="PublicationList-module-scss-module__hash__title body-3">Newest &amp; useful study</span>
  </a>
  <a class="PublicationList-module-scss-module__hash__listItem" href="https://www.anthropic.com/research/older?utm_source=test">
    <div><time datetime="2026-10-02">Oct 2, 2026</time></div><span class="PublicationList__title">Older study</span>
  </a>
  <a class="PublicationList-module-scss-module__hash__listItem" href="/research/latest?utm_source=duplicate">
    <time>Oct 9, 2026</time><span class="PublicationList__title">Duplicate</span>
  </a>
  <a class="PublicationList-module-scss-module__hash__listItem" href="https://unrelated.test/research/external">
    <time>Oct 10, 2026</time><span class="PublicationList__title">External</span>
  </a>
  <a class="PublicationList-module-scss-module__hash__listItem" href="/news/not-research">
    <time>Oct 10, 2026</time><span class="PublicationList__title">News</span>
  </a>`;

const parseDate = (text) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text + ' UTC');

test('new publication markup yields deduplicated research articles with title/date', () => {
  const posts = extractResearchPosts(fixture, { load, parseDate });
  assert.deepEqual(posts.map((p) => [p.title, p.link, p.pubDate.toISOString()]), [
    ['Newest & useful study', 'https://www.anthropic.com/research/latest', '2026-10-09T00:00:00.000Z'],
    ['Older study', 'https://www.anthropic.com/research/older', '2026-10-02T00:00:00.000Z'],
  ]);
});

test('missing or unusable publication markup leaves original parser available', async () => {
  const expected = { title: 'Original', item: [{ title: 'Legacy publication' }] };
  const handler = createResearchHandler({
    load, parseDate, fetch: async () => '<a href="/research/alignment">Alignment</a>',
    originalHandler: async () => expected,
  });
  assert.equal(await handler({}), expected);
});

test('handler limits article extraction and preserves sanitized content', async () => {
  const requested = [];
  const handler = createResearchHandler({
    load, parseDate,
    fetch: async (url) => {
      requested.push(url);
      return url === 'https://www.anthropic.com/research' ? fixture : `
        <main id="main-content"><article><header class="Article__header">Remove header</header>
        <p>Research body</p><img src="/_next/image?url=https%3A%2F%2Fimages.test%2Fstudy.png" style="width:100%" srcset="old" /></article></main>`;
    },
    cache: { tryGet: async (_url, callback) => callback() },
    pMap: async (items, mapper) => Promise.all(items.map(mapper)),
    originalHandler: async () => { throw new Error('Unexpected legacy parser'); },
  });
  const result = await handler({ req: { query: () => '1' } });
  assert.equal(result.item.length, 1);
  assert.equal(result.item[0].title, 'Newest & useful study');
  assert.equal(result.item[0].description.includes('Research body'), true);
  assert.equal(result.item[0].description.includes('Remove header'), false);
  assert.equal(result.item[0].description.includes('src="https://images.test/study.png"'), true);
  assert.equal(result.item[0].description.includes('srcset'), false);
  assert.deepEqual(requested, [
    'https://www.anthropic.com/research', 'https://www.anthropic.com/research/latest',
  ]);
});
