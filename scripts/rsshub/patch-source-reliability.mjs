import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const RETRY_MARKER = '/* glean-no-429-retry-v1 */';
const PODCAST_MARKER = '/* glean-podcast-detail-limit-v1 */';

export function patchOfetchRetrySource(source) {
  if (source.includes(RETRY_MARKER)) return source;
  const pattern = /retryStatusCodes\s*:\s*\[([\d,\s]+)\]/g;
  const matches = [...source.matchAll(pattern)];
  const codes = matches[0]?.[1].split(',').map((value) => Number(value.trim()));
  if (matches.length !== 1 || codes?.join(',') !== '400,408,409,425,429,500,502,503,504') {
    throw new Error('Unsupported RSSHub ofetch retry policy layout');
  }
  return source.replace(pattern, `retryStatusCodes:[${codes.filter((code) => code !== 429).join(',')}]`) + '\n' + RETRY_MARKER;
}

export function patchPodcastSource(source, adapterPath) {
  if (source.includes(PODCAST_MARKER)) return source;
  function binding(prefix) {
    const pattern = /import\s*\{\s*([^}]+)\s*\}\s*from\s*(['"])([^'"]+)\2/g;
    const declaration = [...source.matchAll(pattern)].find((match) => match[3].startsWith(prefix));
    const selected = declaration?.[1].match(/\bt(?:\s+as\s+([A-Za-z_$][\w$]*))?\b/);
    if (!selected) throw new Error('Unsupported RSSHub podcast import layout');
    return selected[1] || 't';
  }
  const fetch = binding('./ofetch-');
  const cache = binding('./cache-');
  const declaration = source.match(/let ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.props\.pageProps\.podcast\.episodes\.map\(/);
  const blocks = [...source.matchAll(/return ([A-Za-z_$][\w$]*)=await Promise\.all\(\1\.map\([\s\S]*?\)\)\),\{title:([A-Za-z_$][\w$]*)\.props\.pageProps\.podcast\.title/g)];
  if (!declaration || blocks.length !== 1 || blocks[0][1] !== declaration[1] || blocks[0][2] !== declaration[2]
    || !blocks[0][0].includes(`${cache}.tryGet(`) || !blocks[0][0].includes(`await ${fetch}(`)
    || !blocks[0][0].includes('/_next/data/') || !blocks[0][0].includes('.pageProps.episode;')) {
    throw new Error('Unsupported RSSHub podcast detail enrichment layout');
  }
  const [collection, metadata] = declaration.slice(1);
  const replacement = `return ${collection}=await gleanEnrichPodcastEpisodes(${collection},${metadata}.props.pageProps.podcast.episodes,{fetch:${fetch},cache:${cache},buildId:${metadata}.buildId}),{title:${metadata}.props.pageProps.podcast.title`;
  const patched = source.replace(blocks[0][0], replacement);
  return `import { enrichPodcastEpisodes as gleanEnrichPodcastEpisodes } from ${JSON.stringify(adapterPath)};\n${patched}\n${PODCAST_MARKER}`;
}

async function main() {
  const args = process.argv.slice(2);
  const distAt = args.indexOf('--dist-dir');
  const adapterAt = args.indexOf('--adapter-dir');
  const dist = distAt >= 0 ? args[distAt + 1] : '/app/dist';
  const adapterDirectory = adapterAt >= 0 ? args[adapterAt + 1] : '/opt/glean-rsshub';
  const files = await readdir(dist);
  const targets = [
    { pattern: /^ofetch-[\w-]+\.mjs$/, patch: patchOfetchRetrySource },
    { pattern: /^xiaoyuzhou-podcast-[\w-]+\.mjs$/, patch: (source) => patchPodcastSource(source, path.join(adapterDirectory, 'podcast-detail-enrichment.mjs')) },
  ];
  const prepared = [];
  for (const { pattern, patch } of targets) {
    const candidates = files.filter((name) => pattern.test(name));
    if (candidates.length !== 1) throw new Error('Unsupported RSSHub build: expected one target module');
    const file = path.join(dist, candidates[0]);
    const source = patch(await readFile(file, 'utf8'));
    const checked = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: source, encoding: 'utf8' });
    if (checked.status !== 0) throw new Error('Patched RSSHub module failed syntax validation');
    prepared.push({ file, source });
  }
  // Validate every target before mutating either module.
  if (!args.includes('--dry-run')) for (const { file, source } of prepared) await writeFile(file, source);
  console.log(JSON.stringify({ patch: 'glean-source-reliability-v1', modules: prepared.map(({ file }) => path.basename(file)), dry_run: args.includes('--dry-run') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
