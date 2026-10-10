import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchOfetchRetrySource, patchPodcastSource } from './patch-source-reliability.mjs';

const source = 'import{t as e}from"./ofetch-hash.mjs";import{t}from"./cache-hash.mjs";import{t as n}from"./parse-date-hash.mjs";import{load as r}from"cheerio";const i={path:"/podcast/:id",handler:a};async function a(){let l={buildId:"build",props:{pageProps:{podcast:{title:"Example podcast",episodes:[{eid:"episode-one",title:"Episode one",description:"Overview body"}]}}}};let u=l.props.pageProps.podcast.episodes.map(e=>({eid:e.eid,title:e.title,link:`https://www.xiaoyuzhoufm.com/episode/${e.eid}`}));return u=await Promise.all(u.map(n=>t.tryGet(n.link,async()=>{let t=(await e(`https://www.xiaoyuzhoufm.com/_next/data/${l.buildId}/episode/${n.eid}.json`)).pageProps.episode;return n.description=t.shownotes||t.description||t.title||``,n}))),{title:l.props.pageProps.podcast.title,item:u}}export{i as route};';

test('patched compiled podcast handler preserves feed metadata and returns sufficient overview on 429', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'glean-podcast-patch-'));
  try {
    await writeFile(path.join(directory, 'ofetch-hash.mjs'), 'export const t=async()=>{throw Object.assign(new Error("limited"),{response:{status:429}})};');
    await writeFile(path.join(directory, 'cache-hash.mjs'), 'export const t={tryGet:async(_key,callback)=>callback()};');
    await writeFile(path.join(directory, 'parse-date-hash.mjs'), 'export const t=()=>{};');
    await writeFile(path.join(directory, 'load.mjs'), 'export const load=()=>{};');
    const helper = path.resolve('scripts/rsshub/podcast-detail-enrichment.mjs');
    const patched = patchPodcastSource(source, helper).replace('from"cheerio"', 'from"./load.mjs"');
    const moduleFile = path.join(directory, 'route.mjs');
    await writeFile(moduleFile, patched);
    const { route } = await import(pathToFileURL(moduleFile));
    assert.deepEqual(await route.handler({}), {
      title: 'Example podcast', item: [{ eid: 'episode-one', title: 'Episode one', link: 'https://www.xiaoyuzhoufm.com/episode/episode-one', description: 'Overview body' }],
    });
    assert.equal(route.path, '/podcast/:id');
    assert.equal(patchPodcastSource(patched, helper), patched);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unknown or duplicate upstream layouts fail before writing', () => {
  assert.throws(() => patchOfetchRetrySource('export const retry=2;'), /Unsupported/);
  assert.throws(() => patchOfetchRetrySource('const a={retryStatusCodes:[429,500]},b={retryStatusCodes:[429,500]};'), /Unsupported/);
  assert.throws(() => patchPodcastSource('export const route={handler:()=>{}};', '/opt/helper.mjs'), /Unsupported/);
});

test('CLI validates both modules before changing either file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'glean-source-patch-'));
  try {
    const original = 'export const options={retryStatusCodes:[400,408,409,425,429,500,502,503,504],retry:2};';
    const ofetch = path.join(directory, 'ofetch-hash.mjs');
    await writeFile(ofetch, original);
    await writeFile(path.join(directory, 'xiaoyuzhou-podcast-hash.mjs'), 'export const route={};');
    const result = spawnSync(process.execPath, [path.resolve('scripts/rsshub/patch-source-reliability.mjs'), '--dist-dir', directory, '--adapter-dir', directory]);
    assert.equal(result.status, 1);
    assert.equal(await readFile(ofetch, 'utf8'), original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
