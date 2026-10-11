import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MARKER = '/* glean-anthropic-engineering-v1 */';

export function patchRouteSource(source, adapterPath) {
  const imports = [...source.matchAll(/import\s*\{\s*([^}]+)\s*\}\s*from\s*(['"])([^'"]+)\2/g)];
  function binding(prefix, exported = 't') {
    const candidates = imports.filter((match) => match[3].startsWith(prefix));
    const selected = candidates.length === 1 && candidates[0][1].match(new RegExp(`^\\s*${exported}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\s*$`));
    if (!selected) throw new Error(`Unsupported RSSHub import layout: ${prefix}`);
    return selected[1] || exported;
  }
  const fetch = binding('./ofetch-');
  const cache = binding('./cache-');
  const load = binding('cheerio', 'load');
  const pMap = source.match(/import\s+([A-Za-z_$][\w$]*)\s+from\s*(['"])p-map\2/)?.[1];
  const exported = source.match(/export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+route\s*\}\s*;?\s*$/);
  if (!pMap || !exported) throw new Error('Unsupported RSSHub route export/import layout');
  const route = exported[1];
  const routeDeclaration = new RegExp(`\\bconst\\s+${route}=\\{path:[\x22\x27\x60]/engineering[\x22\x27\x60],`);
  if (!routeDeclaration.test(source) || !source.includes('a[class*="cardLink"]') ||
      !source.includes('article > div > div[class*="__body"]') || !source.includes(`${cache}.tryGet(`)) {
    throw new Error('Unsupported RSSHub Engineering handler layout');
  }
  const wrapper = `${MARKER}\nimport { createEngineeringHandler as gleanCreateEngineeringHandler } from ${JSON.stringify(adapterPath)};\n${route}.handler = gleanCreateEngineeringHandler({fetch:${fetch},cache:${cache},load:${load},pMap:${pMap},originalHandler:${route}.handler});\n`;
  if (source.includes(MARKER)) {
    if (!source.includes(wrapper)) throw new Error('Unsupported existing Engineering patch');
    return source;
  }
  return source.slice(0, exported.index) + wrapper + exported[0];
}

async function main() {
  const args = process.argv.slice(2);
  const distAt = args.indexOf('--dist-dir');
  const adapterAt = args.indexOf('--adapter-dir');
  const dist = distAt >= 0 ? args[distAt + 1] : '/app/dist';
  const adapterDir = adapterAt >= 0 ? args[adapterAt + 1] : '/opt/glean-rsshub';
  const candidates = (await readdir(dist)).filter((name) => /^anthropic-engineering-[\w-]+\.mjs$/.test(name));
  if (candidates.length !== 1) throw new Error('Unsupported RSSHub build: expected one Engineering route');
  const file = path.join(dist, candidates[0]);
  const patched = patchRouteSource(await readFile(file, 'utf8'), path.join(adapterDir, 'anthropic-engineering-adapter.mjs'));
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: patched, encoding: 'utf8' });
  if (checked.status !== 0) throw new Error('Patched Engineering route failed syntax validation');
  if (!args.includes('--dry-run')) await writeFile(file, patched);
  console.log(JSON.stringify({ patch: 'glean-anthropic-engineering-v1', file: candidates[0], dry_run: args.includes('--dry-run') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
