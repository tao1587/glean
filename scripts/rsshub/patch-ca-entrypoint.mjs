import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKER = '/* glean-verified-ca-entrypoint-v1 */';

export function patchCaEntrypointSource(source, installerPath) {
  if (source.includes(MARKER)) return source;
  const imports = [...source.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)].map((match) => match[2]);
  if (!['./ofetch-', './config-', './proxy-'].every((prefix) => imports.some((specifier) => specifier.startsWith(prefix)))
    || !imports.includes('node:cluster') || !source.includes('.fork(')) {
    throw new Error('Unsupported RSSHub app entrypoint layout');
  }
  return `import ${JSON.stringify(installerPath)};\n${source}\n${MARKER}`;
}

async function main() {
  const args = process.argv.slice(2);
  const distAt = args.indexOf('--dist-dir');
  const adapterAt = args.indexOf('--adapter-dir');
  const dist = distAt >= 0 ? args[distAt + 1] : '/app/dist';
  const adapters = adapterAt >= 0 ? args[adapterAt + 1] : '/opt/glean-rsshub';
  const file = path.join(dist, 'index.mjs');
  const patched = patchCaEntrypointSource(await readFile(file, 'utf8'), path.join(adapters, 'install-ca-chain.mjs'));
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: patched, encoding: 'utf8' });
  if (checked.status !== 0) throw new Error('Patched RSSHub app entrypoint failed syntax validation');
  if (!args.includes('--dry-run')) await writeFile(file, patched);
  console.log(JSON.stringify({ patch: 'glean-verified-ca-entrypoint-v1', dry_run: args.includes('--dry-run') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
