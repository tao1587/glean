export async function enrichPodcastEpisodes(items, overview, { fetch, cache, buildId }) {
  const originals = new Map(overview.map((episode) => [episode.eid, episode]));
  const results = new Array(items.length);
  let next = 0;
  let rateLimitError;
  async function enrich(item) {
    try {
      return await cache.tryGet(item.link, async () => {
        // Cached full detail remains usable after another episode hits a limit.
        if (rateLimitError) throw rateLimitError;
        try {
          const detail = (await fetch(`https://www.xiaoyuzhoufm.com/_next/data/${buildId}/episode/${item.eid}.json`)).pageProps.episode;
          return { ...item, description: detail.shownotes || detail.description || detail.title || '' };
        } catch (error) {
          if ((error.response?.status ?? error.statusCode ?? error.status) === 429) rateLimitError = error;
          throw error;
        }
      });
    } catch (error) {
      if ((error.response?.status ?? error.statusCode ?? error.status) !== 429) throw error;
      const original = originals.get(item.eid);
      const description = [original?.shownotes, original?.description]
        .find((value) => typeof value === 'string' && value.trim());
      if (!description) throw error;
      // Overview fallback stays outside tryGet, so it never replaces cached full detail.
      return { ...item, description };
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await enrich(items[index]);
    }
  }));
  return results;
}
