import { createFileRoute } from '@tanstack/react-router';
import { starsCacheKey } from '../lib/stars.ts';

const REPO_API = 'https://api.github.com/repos/vinenastudio/knobs';
/** An hour for a count; a minute for a miss, so GitHub is asked again soon. */
const CACHE_OK = 'public, max-age=3600, s-maxage=3600';
const CACHE_MISS = 'public, max-age=60';

function answer(stars: number | null): Response {
  return Response.json(
    { stars },
    { headers: { 'cache-control': stars === null ? CACHE_MISS : CACHE_OK } },
  );
}

/** The repo's star count from GitHub's public API, with no token. GitHub refuses a request with no user agent. */
async function count(): Promise<number | null> {
  try {
    const response = await fetch(REPO_API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'knobs.dev' },
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('stargazers_count' in body)) {
      return null;
    }
    const stars = body.stargazers_count;
    return typeof stars === 'number' && Number.isFinite(stars) ? stars : null;
  } catch {
    return null;
  }
}

// The Workers runtime's cache storage, as far as this file uses it. A runtime without one (the tests)
// has no `caches`, or one with no `default`.
declare const caches: { default?: Cache } | undefined;

function edgeCache(): Cache | null {
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- where the global is missing, only `typeof` does not throw
  return typeof caches === 'undefined' ? null : (caches.default ?? null);
}

/**
 * `/api/stars`: `{ stars }` for the header's GitHub button, `{ stars: null }` when GitHub does not answer.
 * A count is kept in the edge cache for an hour, whatever the query: a Worker's own answer is not
 * cached from its `cache-control` alone, and GitHub allows 60 requests an hour with no token.
 * A miss is not kept.
 */
async function stars({ request }: { request: Request }): Promise<Response> {
  const cache = edgeCache();
  const key = starsCacheKey(request.url);
  const kept = await cache?.match(key);
  if (kept !== undefined) {
    // A copy, since a cached answer's headers cannot be changed further up.
    return new Response(kept.body, kept);
  }
  const found = await count();
  const response = answer(found);
  if (cache !== null && found !== null) {
    await cache.put(key, response.clone());
  }
  return response;
}

export const Route = createFileRoute('/api/stars')({
  server: {
    handlers: {
      GET: stars,
    },
  },
});
