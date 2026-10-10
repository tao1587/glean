import { readFileSync } from 'node:fs';
import { tryInstallPublicBridge } from './public-ca-chain.mjs';

try {
  tryInstallPublicBridge(readFileSync(new URL('./certs/root-yr-by-x1.pem', import.meta.url), 'utf8'));
} catch {
  console.warn('RSSHub CA chain completion unavailable; existing TLS trust retained.');
}
