import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { patchCaEntrypointSource } from './patch-ca-entrypoint.mjs';

const fixture = `import{t as e}from"./ofetch-fixture.mjs";import{t as n}from"./config-fixture.mjs";import{t as o}from"./proxy-fixture.mjs";import cluster from"node:cluster";
import tls from 'node:tls';import {X509Certificate} from 'node:crypto';
const snapshot=()=>({bridgePresent:tls.getCACertificates('default').some(p=>new X509Certificate(p).fingerprint256.replaceAll(':','').toLowerCase()==='072639d0b140d5bffae16ad9c3f6cc6086040621f51ee61a6d46a8915c07cf76'),beforeTls:o.bridgePresent,issuerPresent:tls.getCACertificates('default').some(p=>new X509Certificate(p).subject.includes('CN=ISRG Root X1')),args:process.argv.slice(2),nodeOptions:process.env.NODE_OPTIONS});
if(cluster.isPrimary){const parent=snapshot(),worker=cluster.fork({NODE_OPTIONS:''});worker.once('message',child=>console.log(JSON.stringify({parent,child})));worker.once('exit',code=>process.exit(code||0));}else{process.send(snapshot());process.disconnect();}`;

test('parent and real cluster child load verified bridge before TLS contexts despite cleared Node options', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'glean-ca-entrypoint-'));
  try {
    await writeFile(path.join(directory, 'ofetch-fixture.mjs'), 'export const t=()=>{};');
    await writeFile(path.join(directory, 'config-fixture.mjs'), 'export const t={};');
    await writeFile(path.join(directory, 'proxy-fixture.mjs'), `import tls from 'node:tls';import{X509Certificate}from'node:crypto';export const t={bridgePresent:tls.getCACertificates('default').some(p=>new X509Certificate(p).fingerprint256.replaceAll(':','').toLowerCase()==='072639d0b140d5bffae16ad9c3f6cc6086040621f51ee61a6d46a8915c07cf76')};`);
    const installer = path.resolve('scripts/rsshub/install-ca-chain.mjs');
    const patched = patchCaEntrypointSource(fixture, installer);
    const entry = path.join(directory, 'index.mjs');
    await writeFile(entry, patched);
    const completed = spawnSync(process.execPath, [entry, 'sentinel', 'argument with spaces'], { env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(completed.status, 0, completed.stderr);
    const result = JSON.parse(completed.stdout.trim());
    for (const processResult of [result.parent, result.child]) {
      assert.equal(processResult.bridgePresent, true);
      assert.equal(processResult.beforeTls, true);
      assert.equal(processResult.issuerPresent, true);
      assert.deepEqual(processResult.args, ['sentinel', 'argument with spaces']);
      assert.equal(processResult.nodeOptions, '');
    }
    assert.equal(patchCaEntrypointSource(patched, installer), patched);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unrecognized app entrypoint fails before a patch can be written', () => {
  assert.throws(() => patchCaEntrypointSource('console.log("unknown app")', '/opt/glean-rsshub/install-ca-chain.mjs'), /Unsupported/);
});
