import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { patchRouteSource } from './patch-the-batch.mjs';

const source = await readFile(new URL('./fixtures/deeplearning-the-batch-legacy.mjs', import.meta.url), 'utf8');
const adapter = '/opt/glean-rsshub/the-batch-adapter.mjs';

test('actual compiled weekly patch is idempotent and valid JavaScript', () => {
  const patched = patchRouteSource(source, adapter);
  assert.equal(patchRouteSource(patched, adapter), patched);
  const result = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: patched, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('unknown handler, renderer, imports, duplicate bindings and false marker fail closed', () => {
  for (const changed of [
    source.replace('path:`/the-batch/:tag{.+}?`', 'path:`/unrelated`'),
    source.replace('u=e=>s(i(l,{...e}))', 'u=e=>unknown(e)'),
    source.replace('./parse-date-BUfQUPYy.mjs', './unknown-date.mjs'),
    `import{t as extra}from"./ofetch-duplicate.mjs";${source}`,
    `/* glean-the-batch-weekly-v1 */\n${source}`,
  ]) assert.throws(() => patchRouteSource(changed, adapter), /Unsupported/);
});

test('CLI validates without changing dry-run or malformed module input', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'glean-batch-patch-'));
  try {
    const file = path.join(dir, 'deeplearning-the-batch-known.mjs');
    const cli = new URL('./patch-the-batch.mjs', import.meta.url).pathname;
    await writeFile(file, source);
    const dry = spawnSync(process.execPath, [cli, '--dist-dir', dir, '--dry-run'], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(await readFile(file, 'utf8'), source);
    const bad = `const = 1;\n${source}`;
    await writeFile(file, bad);
    const failed = spawnSync(process.execPath, [cli, '--dist-dir', dir], { encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.equal(await readFile(file, 'utf8'), bad);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
