import { readFile } from 'node:fs/promises';
import { tryInstallPublicBridge } from './public-ca-chain.mjs';

try {
  tryInstallPublicBridge(await readFile(new URL('./certs/root-yr-by-x1.pem', import.meta.url), 'utf8'));
} catch {
  console.warn('RSSHub CA chain completion unavailable; existing TLS trust retained.');
}
