import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { patchRouteSource } from './patch-anthropic-engineering.mjs';

const source = await readFile(new URL('./fixtures/anthropic-engineering-legacy.mjs', import.meta.url), 'utf8');
const adapter = '/opt/glean-rsshub/anthropic-engineering-adapter.mjs';

test('patch is idempotent and keeps the actual compiled module executable', () => {
  const patched = patchRouteSource(source, adapter);
  assert.equal(patchRouteSource(patched, adapter), patched);
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: patched, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
});

test('unknown route, import, selector, duplicate bindings and false patch marker fail closed', () => {
  for (const changed of [
    source.replace('/engineering', '/unrelated'),
    source.replace('./ofetch-BQj_JZr9.mjs', './unsupported.mjs'),
    source.replace('cardLink', 'unknownCards'),
    `import{t as extra}from"./ofetch-other.mjs";${source}`,
    `/* glean-anthropic-engineering-v1 */\n${source}`,
  ]) assert.throws(() => patchRouteSource(changed, adapter), /Unsupported/);
});

test('CLI dry-run validates actual bundle without writes and refuses an unknown bundle unchanged', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'glean-engineering-patcher-'));
  try {
    const file = path.join(dir, 'anthropic-engineering-known.mjs');
    await writeFile(file, source);
    const cli = new URL('./patch-anthropic-engineering.mjs', import.meta.url).pathname;
    const dry = spawnSync(process.execPath, [cli, '--dist-dir', dir, '--dry-run'], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(await readFile(file, 'utf8'), source);
    const bad = source.replace('cardLink', 'unknownCards');
    await writeFile(file, bad);
    const rejected = spawnSync(process.execPath, [cli, '--dist-dir', dir], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.equal(await readFile(file, 'utf8'), bad);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
