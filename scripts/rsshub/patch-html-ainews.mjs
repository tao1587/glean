import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKER = '/* glean-ainews-transform-v1 */';
// Exact known compiled module: unknown upstream changes abort the build.
const UPSTREAM_SHA256 = '96c70122e4b10d62c14867a135b6021474eaa2976e66205f68de9ac59358f03b';

export function patchRouteSource(source, adapterPath) {
  const exported = source.match(/export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+route\s*\}\s*;?\s*$/);
  if (!exported) throw new Error('Unsupported RSSHub HTML-transform export');
  const imports = [...source.matchAll(/import\s*\{\s*([^}]+)\s*\}\s*from\s*(['"])([^'"]+)\2/g)];
  function binding(prefix, symbol = 't') {
    const candidates = imports.filter((match) => match[3].startsWith(prefix));
    const selected = candidates.length === 1 && candidates[0][1].match(new RegExp(`^\\s*${symbol}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\s*$`));
    if (!selected) throw new Error(`Unsupported RSSHub HTML-transform import: ${prefix}`);
    return selected[1] || symbol;
  }
  const got = binding('./got-');
  const cache = binding('./cache-');
  const load = binding('cheerio', 'load');
  const sanitizer = source.match(/import\s+([A-Za-z_$][\w$]*)\s+from\s*(['"])sanitize-html\2/)?.[1];
  if (!sanitizer) throw new Error('Unsupported RSSHub HTML-transform sanitizer import');
  const route = exported[1];
  const wrapper = `${MARKER}\nimport { createAinewsHandler as gleanCreateAinewsHandler } from ${JSON.stringify(adapterPath)};\n${route}.handler = gleanCreateAinewsHandler({got:${got},cache:${cache},load:${load},sanitizeHtml:${sanitizer},originalHandler:${route}.handler});\n`;
  let original = source;
  if (source.includes(MARKER)) {
    const position = source.indexOf(wrapper);
    if (position < 0 || position + wrapper.length !== exported.index || source.indexOf(MARKER) !== position) {
      throw new Error('Unsupported existing AI daily transform patch');
    }
    original = source.slice(0, position) + exported[0];
  }
  if (createHash('sha256').update(original.trim()).digest('hex') !== UPSTREAM_SHA256) {
    throw new Error('Unsupported RSSHub HTML-transform compiled source');
  }
  if (source !== original) return source;
  return source.slice(0, exported.index) + wrapper + exported[0];
}

async function main() {
  const args = process.argv.slice(2);
  const distAt = args.indexOf('--dist-dir');
  const adapterAt = args.indexOf('--adapter-dir');
  const dist = distAt >= 0 ? args[distAt + 1] : '/app/dist';
  const adapterDir = adapterAt >= 0 ? args[adapterAt + 1] : '/opt/glean-rsshub';
  const candidates = (await readdir(dist)).filter((name) => /^rsshub-html-[\w-]+\.mjs$/.test(name));
  if (candidates.length !== 1) throw new Error('Unsupported RSSHub build: expected one HTML-transform module');
  const file = path.join(dist, candidates[0]);
  const patched = patchRouteSource(await readFile(file, 'utf8'), path.join(adapterDir, 'ainews-transform-adapter.mjs'));
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: patched, encoding: 'utf8' });
  if (checked.status !== 0) throw new Error('Patched AI daily transform failed syntax validation');
  if (!args.includes('--dry-run')) await writeFile(file, patched);
  console.log(JSON.stringify({ patch: 'glean-ainews-transform-v1', file: candidates[0], dry_run: args.includes('--dry-run') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
