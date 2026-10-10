import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';

const { createFetch } = await import(process.env.RSSHUB_OFETCH_MODULE || 'ofetch');
const { patchOfetchRetrySource } = await import(process.env.RSSHUB_PATCHER_MODULE || './patch-source-reliability.mjs');

const fixture = 'export const options={retryStatusCodes:[400,408,409,425,429,500,502,503,504],retry:2,retryDelay:1};';

test('429 is requested once with two configured retries', async () => {
  let attempts = 0;
  const server = createServer((_request, response) => { attempts++; response.writeHead(429); response.end('limited'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { options } = await import('data:text/javascript,' + encodeURIComponent(patchOfetchRetrySource(fixture)));
    const fetch = createFetch({ fetch: globalThis.fetch }).create(options);
    await assert.rejects(fetch(`http://127.0.0.1:${server.address().port}/feed`), (error) => error.response.status === 429);
    assert.equal(attempts, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('500 preserves the two bounded retries and can recover', async () => {
  let attempts = 0;
  const server = createServer((_request, response) => {
    attempts++; response.writeHead(attempts < 3 ? 500 : 200); response.end(attempts < 3 ? 'server error' : 'recovered');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { options } = await import('data:text/javascript,' + encodeURIComponent(patchOfetchRetrySource(fixture)));
    const fetch = createFetch({ fetch: globalThis.fetch }).create(options);
    assert.equal(await fetch(`http://127.0.0.1:${server.address().port}/feed`), 'recovered');
    assert.equal(attempts, 3);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('transport reset still receives a bounded retry', async () => {
  let attempts = 0;
  const server = createServer((request, response) => {
    attempts++;
    if (attempts === 1) { request.socket.destroy(); return; }
    response.writeHead(200); response.end('recovered reset');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { options } = await import('data:text/javascript,' + encodeURIComponent(patchOfetchRetrySource(fixture)));
    const fetch = createFetch({ fetch: globalThis.fetch }).create(options);
    assert.equal(await fetch(`http://127.0.0.1:${server.address().port}/feed`), 'recovered reset');
    assert.equal(attempts, 2);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
