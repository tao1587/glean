import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MARKER = '/* glean-the-batch-weekly-v1 */';

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
  const parseDate = binding('./parse-date-');
  const load = binding('cheerio', 'load');
  const exported = source.match(/export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+handler\s*,\s*([A-Za-z_$][\w$]*)\s+as\s+route\s*\}\s*;?\s*$/);
  const renderer = source.match(/([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)=>[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*,\{\.\.\.\2\}\)\)/)?.[1];
  if (!exported || !renderer) throw new Error('Unsupported RSSHub The Batch export/renderer layout');
  const route = exported[2];
  const definition = source.match(new RegExp(`\\b${route}=\\{path:[\x22\x27\x60]/the-batch/:tag\\{\\.\\+\\}\\?[\x22\x27\x60],[\\s\\S]*?handler:([A-Za-z_$][\\w$]*),example:`));
  if (!definition || !source.includes('script#__NEXT_DATA__') || !source.includes(`${cache}.tryGet(`)) throw new Error('Unsupported RSSHub The Batch handler layout');
  const original = definition[1];
  const wrapper = `${MARKER}\nimport { createWeeklyHandler as gleanCreateWeeklyHandler } from ${JSON.stringify(adapterPath)};\nconst gleanTheBatchHandler = gleanCreateWeeklyHandler({fetch:${fetch},cache:${cache},parseDate:${parseDate},load:${load},renderDescription:${renderer},originalHandler:${original}});\n${route}.handler = gleanTheBatchHandler;\n`;
  if (source.includes(MARKER)) {
    if (!source.includes(wrapper) || exported[1] !== 'gleanTheBatchHandler') throw new Error('Unsupported existing The Batch patch');
    return source;
  }
  if (exported[1] !== original) throw new Error('Unsupported RSSHub The Batch handler export binding');
  return source.slice(0, exported.index) + wrapper + `export{gleanTheBatchHandler as handler,${route} as route};`;
}

async function main() {
  const args = process.argv.slice(2);
  const distAt = args.indexOf('--dist-dir');
  const adapterAt = args.indexOf('--adapter-dir');
  const dist = distAt >= 0 ? args[distAt + 1] : '/app/dist';
  const adapter = adapterAt >= 0 ? args[adapterAt + 1] : '/opt/glean-rsshub';
  const candidates = (await readdir(dist)).filter((name) => /^deeplearning-the-batch-[\w-]+\.mjs$/.test(name));
  if (candidates.length !== 1) throw new Error('Unsupported RSSHub build: expected one The Batch module');
  const file = path.join(dist, candidates[0]);
  const patched = patchRouteSource(await readFile(file, 'utf8'), path.join(adapter, 'the-batch-adapter.mjs'));
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: patched, encoding: 'utf8' });
  if (checked.status !== 0) throw new Error('Patched The Batch route failed syntax validation');
  if (!args.includes('--dry-run')) await writeFile(file, patched);
  console.log(JSON.stringify({ patch: 'glean-the-batch-weekly-v1', file: candidates[0], dry_run: args.includes('--dry-run') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
