import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchRouteSource } from './patch-anthropic-research.mjs';

const fixture = `import{t as e}from"./ofetch-hash.mjs";import{t as t}from"./cache-hash.mjs";import{t as n}from"./parse-date-hash.mjs";import{load as r}from"cheerio";import i from"p-map";const a={path:'/research',handler:async()=>({title:'Legacy'})};export{a as route};`;

test('patcher preserves hashed imports and actually replaces the exported route handler', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'glean-rsshub-patcher-'));
  try {
    await writeFile(path.join(directory, 'ofetch-hash.mjs'), 'export const t=()=>{};');
    await writeFile(path.join(directory, 'cache-hash.mjs'), 'export const t={tryGet(){}};');
    await writeFile(path.join(directory, 'parse-date-hash.mjs'), 'export const t=()=>{};');
    await writeFile(path.join(directory, 'load.mjs'), 'export const load=()=>{};');
    await writeFile(path.join(directory, 'map.mjs'), 'export default ()=>{};');
    const adapter = path.join(directory, 'adapter.mjs');
    await writeFile(adapter, `export function createResearchHandler(deps){
      if(typeof deps.fetch!=='function'||typeof deps.load!=='function'||typeof deps.pMap!=='function'||!deps.cache.tryGet||typeof deps.parseDate!=='function')throw new Error('Missing dependency');
      return async()=>({title:'Patched'});
    }`);
    let patched = patchRouteSource(fixture, adapter);
    // The installed third-party packages are replaced only at this import boundary.
    patched = patched.replace('from"cheerio"', 'from"./load.mjs"').replace('from"p-map"', 'from"./map.mjs"');
    const moduleFile = path.join(directory, 'route.mjs');
    await writeFile(moduleFile, patched);
    const { route } = await import(pathToFileURL(moduleFile));
    assert.deepEqual(await route.handler({}), { title: 'Patched' });
    assert.equal(route.path, '/research');
    assert.equal(await readFile(path.join(directory, 'ofetch-hash.mjs'), 'utf8'), 'export const t=()=>{};');
    assert.equal(patchRouteSource(patched, adapter), patched);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unknown upstream bundling fails before mutating a route', () => {
  assert.throws(() => patchRouteSource("export const route={handler:()=>{}};", '/opt/adapter.mjs'), /Unsupported/);
});
