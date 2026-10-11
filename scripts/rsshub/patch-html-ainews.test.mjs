import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const source = await readFile(new URL('./fixtures/rsshub-html-transform-legacy.mjs', import.meta.url), 'utf8');
const adapter = '/opt/glean-rsshub/ainews-transform-adapter.mjs';
const cli = new URL('./patch-html-ainews.mjs', import.meta.url).pathname;

test('CLI patches the known module after syntax verification and dry-run leaves it unchanged', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'glean-ainews-patcher-'));
  try {
    const file = path.join(dir, 'rsshub-html-IRdB04TT.mjs');
    await writeFile(file, source);
    const dry = spawnSync(process.execPath, [cli, '--dist-dir', dir, '--dry-run'], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(await readFile(file, 'utf8'), source);
    const write = spawnSync(process.execPath, [cli, '--dist-dir', dir], { encoding: 'utf8' });
    assert.equal(write.status, 0, write.stderr);
    const patched = await readFile(file, 'utf8');
    assert.notEqual(patched, source);
    const again = spawnSync(process.execPath, [cli, '--dist-dir', dir], { encoding: 'utf8' });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(await readFile(file, 'utf8'), patched);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('changed upstream imports, handler, gate or marker fail closed without changing files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'glean-ainews-patcher-'));
  try {
    const file = path.join(dir, 'rsshub-html-IRdB04TT.mjs');
    for (const changed of [
      source.replace('./got-BrbY6dDA.mjs', './unknown.mjs'),
      source.replace('slice(0,20)', 'slice(0,200)'),
      source.replace('if(!e.feature.allow_user_supply_unsafe_domain)', 'if(false)'),
      source.replace('/transform/html/:url/:routeParams', '/another-route'),
      `/* glean-ainews-transform-v1 */\n${source}`,
    ]) {
      await writeFile(file, changed);
      const rejected = spawnSync(process.execPath, [cli, '--dist-dir', dir], { encoding: 'utf8' });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /Unsupported/);
      assert.equal(await readFile(file, 'utf8'), changed);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('duplicate candidate modules fail closed before writing either file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'glean-ainews-patcher-'));
  try {
    const files = ['rsshub-html-first.mjs', 'rsshub-html-second.mjs'];
    for (const file of files) await writeFile(path.join(dir, file), source);
    const rejected = spawnSync(process.execPath, [cli, '--dist-dir', dir], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /expected one HTML-transform module/);
    for (const file of files) assert.equal(await readFile(path.join(dir, file), 'utf8'), source);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
