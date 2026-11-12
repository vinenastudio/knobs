/** Below this many stars the header's GitHub button shows no count. */
export const STAR_COUNT_MIN = 100;

/** A star count as the button writes it: `1,234` below 10,000, `12.3k` from there, never rounded up. */
export function formatStars(stars: number): string {
  return stars < 10_000 ? stars.toLocaleString('en-US') : `${Math.floor(stars / 100) / 10}k`;
}

/** The count out of `/api/stars`' answer, or null when it holds none. */
export function readStars(body: unknown): number | null {
  if (typeof body !== 'object' || body === null || !('stars' in body)) {
    return null;
  }
  return typeof body.stars === 'number' && Number.isFinite(body.stars) ? body.stars : null;
}

let loaded: Promise<number | null> | undefined;

async function fetchStars(): Promise<number | null> {
  // Local preview only: `?stars=1234` on the page stands in for the real count.
  if (import.meta.env.DEV) {
    const preview = new URLSearchParams(window.location.search).get('stars');
    if (preview !== null && preview !== '' && Number.isFinite(Number(preview))) {
      return Number(preview);
    }
  }
  try {
    const response = await fetch('/api/stars');
    return response.ok ? readStars(await response.json()) : null;
  } catch {
    return null;
  }
}

/** The repo's star count, asked for once per page load however many buttons want it. */
export function loadStars(): Promise<number | null> {
  loaded ??= fetchStars();
  return loaded;
}
