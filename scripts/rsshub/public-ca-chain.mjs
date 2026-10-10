import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPECTED_SHA256 = '072639d0b140d5bffae16ad9c3f6cc6086040621f51ee61a6d46a8915c07cf76';

export function verifyPublicBridge(pem, { trusted = tls.getCACertificates('default'), now = new Date() } = {}) {
  let bridge;
  try { bridge = new X509Certificate(pem); } catch { throw new Error('Invalid public CA bridge'); }
  const sha256 = bridge.fingerprint256.replaceAll(':', '').toLowerCase();
  if (sha256 !== EXPECTED_SHA256 || !bridge.ca) throw new Error('Unexpected CA bridge fingerprint/properties');
  if (now < new Date(bridge.validFrom) || now >= new Date(bridge.validTo)) throw new Error('CA bridge is outside its validity period');
  const issuer = trusted.map((certificate) => new X509Certificate(certificate)).find((certificate) =>
    certificate.ca && certificate.subject.includes('CN=ISRG Root X1')
    && bridge.checkIssued(certificate) && bridge.verify(certificate.publicKey)
    && now >= new Date(certificate.validFrom) && now < new Date(certificate.validTo));
  if (!issuer) throw new Error('CA bridge lacks an already trusted issuer');
  return { sha256, issuer: 'ISRG Root X1' };
}

export function installPublicBridge(pem) {
  const trusted = tls.getCACertificates('default');
  verifyPublicBridge(pem, { trusted });
  // Preserve the current defaults, including any existing NODE_EXTRA_CA_CERTS.
  tls.setDefaultCACertificates([...trusted, pem]);
}

export function tryInstallPublicBridge(pem, diagnostic = console.warn) {
  try {
    installPublicBridge(pem);
    return true;
  } catch {
    diagnostic('RSSHub CA chain completion unavailable; existing TLS trust retained.');
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') {
    throw new Error('Unsupported Node CA runtime');
  }
  console.log(JSON.stringify(verifyPublicBridge(await readFile(process.argv[2], 'utf8'))));
}
