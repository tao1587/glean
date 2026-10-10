import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MARKER = '/* glean-anthropic-research-v1 */';

export function patchRouteSource(source, adapterPath) {
  if (source.includes(MARKER)) return source;
  const imports = [...source.matchAll(/import\s*\{\s*([^}]+)\s*\}\s*from\s*(['"])([^'"]+)\2/g)];
  function binding(prefix, exported = 't') {
    const declaration = imports.find((m) => m[3].startsWith(prefix));
    const selected = declaration?.[1].match(new RegExp(`\\b${exported}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\b`));
    if (!selected) throw new Error(`Unsupported RSSHub import layout: ${prefix}`);
    return selected[1] || exported;
  }
  const fetch = binding('./ofetch-');
  const cache = binding('./cache-');
  const parseDate = binding('./parse-date-');
  const load = binding('cheerio', 'load');
  const pMap = source.match(/import\s+([A-Za-z_$][\w$]*)\s+from\s*(['"])p-map\2/)?.[1];
  const exported = source.match(/export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+route\s*\}\s*;?\s*$/);
  if (!pMap || !exported) throw new Error('Unsupported RSSHub route export/import layout');
  const route = exported[1];
  const wrapper = `${MARKER}\nimport { createResearchHandler as gleanCreateResearchHandler } from ${JSON.stringify(adapterPath)};\n${route}.handler = gleanCreateResearchHandler({fetch:${fetch},cache:${cache},parseDate:${parseDate},load:${load},pMap:${pMap},originalHandler:${route}.handler});\n`;
  return source.slice(0, exported.index) + wrapper + exported[0];
}

async function main() {
  const args = process.argv.slice(2);
  const distAt = args.indexOf('--dist-dir');
  const adapterAt = args.indexOf('--adapter-dir');
  const dist = distAt >= 0 ? args[distAt + 1] : '/app/dist';
  const adapterDirectory = adapterAt >= 0 ? args[adapterAt + 1] : '/opt/glean-rsshub';
  const candidates = (await readdir(dist)).filter((name) => /^anthropic-research-[\w-]+\.mjs$/.test(name));
  if (candidates.length !== 1) throw new Error('Unsupported RSSHub build: expected one compiled research route');
  const file = path.join(dist, candidates[0]);
  const patched = patchRouteSource(await readFile(file, 'utf8'), path.join(adapterDirectory, 'anthropic-research-adapter.mjs'));
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: patched, encoding: 'utf8' });
  if (checked.status !== 0) throw new Error('Patched RSSHub route failed syntax validation');
  if (!args.includes('--dry-run')) await writeFile(file, patched);
  console.log(JSON.stringify({ patch: 'glean-anthropic-research-v1', file: candidates[0], dry_run: args.includes('--dry-run') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
