// devknobs' frame loads the tab's own page. A server can send that load to another origin of
// the same site, such as a site that sends a phone's browser to its mobile host: the tab follows
// it there, as the phone would get sent, with its knobs. A load sent to another site, such as a
// sign-in host, is not followed.

/** The address without its fragment, which no load sends, or null for no address. */
function unhashed(url: string): string | null {
  const parsed = URL.parse(url);
  if (!parsed) {
    return null;
  }
  parsed.hash = '';
  return parsed.href;
}

/** Is `url` a load of `page`, the address devknobs' frame was sent to, its fragment aside? */
export function isFramePage(page: string, url: string): boolean {
  const want = unhashed(page);
  return want !== null && want === unhashed(url);
}

// Hosts that give each of their customers a name of their own under them: alice.github.io and
// bob.github.io are two sites.
const SHARED_HOSTS = [
  'github.io',
  'gitlab.io',
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'workers.dev',
  'herokuapp.com',
  'web.app',
  'firebaseapp.com',
  'blogspot.com',
  'azurewebsites.net',
  'cloudfront.net',
  'appspot.com',
  'onrender.com',
  'fly.dev',
];

// Second levels under a country's domain that anyone can take a name under (co.uk, com.tr).
const PUBLIC_SECOND = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gov',
  'go',
  'gob',
  'mil',
  'ne',
  'net',
  'nic',
  'or',
  'org',
]);

/**
 * The host's registrable domain, near enough: its last two labels, or three where the second to
 * last is a public second level under a country (co.uk, com.tr). An address or a host of one
 * label is its own.
 */
function siteOf(host: string): string {
  const labels = host.split('.');
  const [second = '', tld = ''] = labels.slice(-2);
  if (labels.length < 2 || host.includes(':') || /^\d+$/.test(tld)) {
    return host;
  }
  const shared = SHARED_HOSTS.find((suffix) => host.endsWith(`.${suffix}`));
  if (shared) {
    return labels.slice(-(shared.split('.').length + 1)).join('.');
  }
  const take = tld.length === 2 && PUBLIC_SECOND.has(second) && labels.length > 2 ? 3 : 2;
  return labels.slice(-take).join('.');
}

/** Are the two hosts of one site? */
export function sameSite(a: string, b: string): boolean {
  return a === b || siteOf(a) === siteOf(b);
}

/**
 * Where a frame sent to `sent` landed on another origin of the same site, by the same scheme:
 * `landed`, or null for the same origin, another scheme or site, or no web page.
 */
export function movedTo(sent: string, landed: string): string | null {
  const from = URL.parse(sent);
  const to = URL.parse(landed);
  if (!from || !to || (to.protocol !== 'https:' && to.protocol !== 'http:')) {
    return null;
  }
  return from.origin === to.origin ||
    from.protocol !== to.protocol ||
    !sameSite(from.hostname, to.hostname)
    ? null
    : to.href;
}

/** Knobs a page handed on, for the tab's next page on `origin`, loaded from `url`, until `until` (ms). */
export type Handoff<T> = { origin: string; state: T; until: number; url: string };

/**
 * Does a handoff outlive the tab loading `url`, or its frame going (no `url`)? Only the load it
 * was made for keeps it: one the user started instead, or a canceled follow, drops it.
 */
export function keepsHandoff<T>(handoff: Handoff<T> | undefined, url: string | undefined): boolean {
  return handoff !== undefined && url !== undefined && isFramePage(handoff.url, url);
}

/**
 * What becomes of a handoff as the tab's page at `url` asks at `now`: the knobs, once, for a page
 * on its origin in time (`keep` false); nothing for a page elsewhere, the handoff kept; nothing
 * once it is too late, the handoff dropped.
 */
export function takeHandoff<T>(
  handoff: Handoff<T> | undefined,
  url: string | undefined,
  now: number,
): { keep: boolean; state?: T } {
  if (!handoff) {
    return { keep: false };
  }
  if (handoff.until < now) {
    return { keep: false };
  }
  if (URL.parse(url ?? '')?.origin !== handoff.origin) {
    return { keep: true };
  }
  return { keep: false, state: handoff.state };
}
