import type { NativeUa, UaBrand } from '@vinena/knobs';
import type { Command } from './knobs.ts';

/** A request header a rule sets or removes. */
export interface HeaderChange {
  header: string;
  operation: 'remove' | 'set';
  value?: string;
}

// Every UA client hint Chrome sends, the low entropy ones on every request and the rest once a site asks.
export const CLIENT_HINTS = [
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-ch-ua-arch',
  'sec-ch-ua-bitness',
  'sec-ch-ua-form-factors',
  'sec-ch-ua-full-version',
  'sec-ch-ua-full-version-list',
  'sec-ch-ua-model',
  'sec-ch-ua-platform-version',
  'sec-ch-ua-wow64',
] as const;

// Every kind of request: a rule with none listed would leave out the page's own load.
export const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as const;

const quoted = (value: string) => `"${value}"`;

/** A brand list as the `Sec-CH-UA` structured header has it. */
function brandList(brands: ReadonlyArray<UaBrand>): string {
  return brands.map(({ brand, version }) => `${quoted(brand)};v=${quoted(version)}`).join(', ');
}

/**
 * The request headers that send `ua` to servers: its user agent, and the low entropy client
 * hints of a Chromium browser. A browser with no client hints (Safari, Firefox, a custom
 * string) sends none, and the high entropy ones go too: they are sent only to a site that asked.
 */
export function uaHeaders(ua: NativeUa): Array<HeaderChange> {
  const set = new Map<string, string>([['user-agent', ua.userAgent]]);
  if (ua.brands.length > 0) {
    set.set('sec-ch-ua', brandList(ua.brands));
    set.set('sec-ch-ua-mobile', ua.mobile ? '?1' : '?0');
    set.set('sec-ch-ua-platform', quoted(ua.uaPlatform));
  }
  return [
    ...[...set].map(([header, value]): HeaderChange => ({ header, operation: 'set', value })),
    ...CLIENT_HINTS.filter((header) => !set.has(header)).map((header): HeaderChange => ({
      header,
      operation: 'remove',
    })),
  ];
}

/**
 * The DevTools protocol's user agent override for `ua`, so what the page's scripts and workers
 * read matches the requests. Null clears it. A browser with no client hints gets no metadata.
 */
export function uaCommand(ua: NativeUa | null): Command {
  if (!ua) {
    return { method: 'Emulation.setUserAgentOverride', params: { userAgent: '' } };
  }
  const hints = ua.hints;
  return {
    method: 'Emulation.setUserAgentOverride',
    params: {
      userAgent: ua.userAgent,
      ...(ua.platform ? { platform: ua.platform } : {}),
      ...(ua.brands.length > 0
        ? {
            userAgentMetadata: {
              architecture: hints?.architecture ?? '',
              bitness: hints?.bitness ?? '',
              brands: ua.brands,
              fullVersion: hints?.uaFullVersion ?? '',
              fullVersionList: hints?.fullVersionList ?? [],
              mobile: ua.mobile,
              model: hints?.model ?? '',
              platform: ua.uaPlatform,
              platformVersion: hints?.platformVersion ?? '',
              wow64: false,
            },
          }
        : {}),
    },
  };
}

/** A tab's user agent, as the background keeps it, with the host of its page. */
export interface TabUa {
  host: string | null;
  ua: NativeUa;
}

/**
 * The rules that send each tab's user agent: on that tab's requests to its page's own host
 * alone, never on a service worker's, which no tab owns. A tab with no host gets none. Real
 * phone mode's (`frame`) goes on the frame's own page loads alone: a rule has no frame id to
 * tell the frame's other requests from the page's, so those keep the real browser.
 */
export function uaRules(
  tabs: ReadonlyMap<number, TabUa>,
  free: () => number,
  navigations: ReadonlyMap<number, TabUa> = new Map(),
): Array<chrome.declarativeNetRequest.Rule> {
  // The tab following real phone mode's frame to another origin of its site: that one load of
  // the page there goes as the device, as the frame's did, so the server sends the same page.
  const following: Array<chrome.declarativeNetRequest.Rule> = [...navigations].flatMap(
    ([tabId, { host, ua }]) =>
      host
        ? [
            {
              action: { requestHeaders: uaHeaders(ua), type: 'modifyHeaders' as const },
              condition: {
                requestDomains: [host],
                resourceTypes: ['main_frame' as const],
                tabIds: [tabId],
              },
              id: free(),
            },
          ]
        : [],
  );
  return following.concat(
    [...tabs].flatMap(([tabId, { host, ua }]) =>
      host
        ? [
            {
              action: { requestHeaders: uaHeaders(ua), type: 'modifyHeaders' as const },
              condition: {
                requestDomains: [host],
                resourceTypes: ua.frame ? ['sub_frame' as const] : [...RESOURCE_TYPES],
                tabIds: [tabId],
              },
              id: free(),
            },
          ]
        : [],
    ),
  );
}

/** Does the tab's page at `url` load under its user agent rule, so its server sees that browser? */
export function loadsUnder(tabs: ReadonlyMap<number, TabUa>, tabId: number, url: string): boolean {
  const host = URL.parse(url)?.hostname;
  const tab = tabs.get(tabId);
  return host !== undefined && tab?.host === host && !tab.ua.frame;
}
