import { createFileRoute } from '@tanstack/react-router';

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

/** `/api/stars`: `{ stars }` for the header's GitHub button, `{ stars: null }` when GitHub does not answer. */
async function stars(): Promise<Response> {
  return answer(await count());
}

export const Route = createFileRoute('/api/stars')({
  server: {
    handlers: {
      GET: stars,
    },
  },
});
