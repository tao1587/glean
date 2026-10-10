import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';
const { verifyPublicBridge, installPublicBridge, tryInstallPublicBridge } = await import(process.env.RSSHUB_CA_MODULE || './public-ca-chain.mjs');
const pem = process.env.RSSHUB_CA_PEM || await readFile(new URL('./certs/root-yr-by-x1.pem', import.meta.url), 'utf8');

test('official pinned bridge is verified against existing trusted issuer', () => {
  const metadata = verifyPublicBridge(pem);
  assert.equal(metadata.sha256, '072639d0b140d5bffae16ad9c3f6cc6086040621f51ee61a6d46a8915c07cf76');
  assert.equal(metadata.issuer, 'ISRG Root X1');
});

test('corrupt and self-signed wrong bridges are rejected', () => {
  assert.throws(() => verifyPublicBridge('not a certificate'), /Invalid|bridge/i);
  assert.throws(() => verifyPublicBridge(tls.rootCertificates[0]), /fingerprint|bridge/i);
});

test('missing trusted issuer and out-of-validity bridge are rejected', () => {
  assert.throws(() => verifyPublicBridge(pem, { trusted: [] }), /trusted issuer/i);
  assert.throws(() => verifyPublicBridge(pem, { now: new Date('2100-01-01') }), /validity/i);
});

test('preload adds bridge while retaining every existing default CA and extra-CA setting', () => {
  const prior = tls.getCACertificates('default');
  const priorExtra = process.env.NODE_EXTRA_CA_CERTS;
  try {
    installPublicBridge(pem);
    const after = new Set(tls.getCACertificates('default').map((ca) => new X509Certificate(ca).fingerprint256));
    assert.equal(after.has(new X509Certificate(pem).fingerprint256), true);
    for (const ca of prior) assert.equal(after.has(new X509Certificate(ca).fingerprint256), true);
    assert.equal(process.env.NODE_EXTRA_CA_CERTS, priorExtra);
  } finally { tls.setDefaultCACertificates(prior); }
});

test('failed verification leaves the existing default trust set unchanged', () => {
  const prior = tls.getCACertificates('default');
  assert.throws(() => installPublicBridge(tls.rootCertificates[0]), /fingerprint|bridge/i);
  assert.deepEqual(tls.getCACertificates('default'), prior);
});

test('optional runtime completion failure retains TLS defaults and emits only a fixed diagnostic', () => {
  const prior = tls.getCACertificates('default');
  const warnings = [];
  const installed = tryInstallPublicBridge('corrupt public bridge', (message) => warnings.push(message));
  assert.equal(installed, false);
  assert.deepEqual(tls.getCACertificates('default'), prior);
  assert.deepEqual(warnings, ['RSSHub CA chain completion unavailable; existing TLS trust retained.']);
});
