import { afterEach, describe, expect, test, vi } from 'vitest';
import { Route } from './api.stars.ts';

type Handler = (context: { request: Request }) => Promise<Response>;

const get = (Route.options.server as { handlers: { GET: Handler } }).handlers.GET;

function call(url: string): Promise<Response> {
  return get({ request: new Request(url) });
}

function mapCache(): { cache: Cache; store: Map<string, Response> } {
  const store = new Map<string, Response>();
  const cache = {
    match: async (key: string) => store.get(key)?.clone(),
    put: async (key: string, response: Response) => {
      store.set(key, response);
    },
  } as unknown as Cache;
  return { cache, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/stars', () => {
  test('keeps a count for an hour under the address with no query', async () => {
    const fetch = vi.fn(async () => Response.json({ stargazers_count: 321 }));
    const { cache, store } = mapCache();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('caches', { default: cache });

    const first = await call('https://knobs.dev/api/stars?x=1');
    expect(first.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600');
    expect(await first.json()).toEqual({ stars: 321 });
    expect([...store.keys()]).toEqual(['https://knobs.dev/api/stars']);

    const second = await call('https://knobs.dev/api/stars?y=2');
    expect(await second.json()).toEqual({ stars: 321 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('answers a GitHub refusal with no count for a minute, and keeps nothing', async () => {
    const { cache, store } = mapCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 403 })),
    );
    vi.stubGlobal('caches', { default: cache });

    const response = await call('https://knobs.dev/api/stars');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await response.json()).toEqual({ stars: null });
    expect(store.size).toBe(0);
  });

  test('answers a failed fetch with no count when there is no cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const response = await call('https://knobs.dev/api/stars');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stars: null });
  });
});
