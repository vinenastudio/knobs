import { describe, expect, test } from 'bun:test';
import { type NativeUa, PRESETS } from '@vinena/knobs';
import {
  CLIENT_HINTS,
  loadsUnder,
  type HeaderChange,
  RESOURCE_TYPES,
  uaCommand,
  uaHeaders,
  uaRules,
} from '../src/ua.ts';

const UA_PRESETS = PRESETS.ua;

const uaOf = (id: string): NativeUa => {
  const { brands, hints, mobile, platform, uaPlatform, userAgent } = UA_PRESETS.find(
    (preset) => preset.id === id,
  )!;
  return { brands, mobile, platform, uaPlatform, userAgent, ...(hints ? { hints } : {}) };
};

const asMap = (changes: Array<HeaderChange>) =>
  Object.fromEntries(
    changes.map(({ header, operation, value }) => [header, operation === 'set' ? value : null]),
  );

const removed = (except: Array<string>) =>
  Object.fromEntries(
    CLIENT_HINTS.filter((header) => !except.includes(header)).map((header) => [header, null]),
  );

const LOW = ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'];

describe('uaHeaders', () => {
  test('every preset sets its user agent and touches every client hint once', () => {
    for (const preset of UA_PRESETS) {
      const changes = uaHeaders(uaOf(preset.id));
      expect(asMap(changes)['user-agent']).toBe(preset.userAgent);
      expect(changes.map(({ header }) => header).toSorted()).toEqual(
        ['user-agent', ...CLIENT_HINTS].toSorted(),
      );
    }
  });

  test('Safari, Firefox and a custom string send no client hints', () => {
    for (const id of ['iphone-safari', 'ipad-safari', 'mac-safari', 'linux-firefox']) {
      expect(asMap(uaHeaders(uaOf(id)))).toEqual({
        'user-agent': uaOf(id).userAgent,
        ...removed([]),
      });
    }
    const custom: NativeUa = {
      brands: [],
      mobile: false,
      platform: '',
      uaPlatform: '',
      userAgent: 'Bot/1',
    };
    expect(asMap(uaHeaders(custom))).toEqual({ 'user-agent': 'Bot/1', ...removed([]) });
  });

  test('Android Chrome is a mobile Android with its brands, and no high entropy hints', () => {
    expect(asMap(uaHeaders(uaOf('android-chrome')))).toEqual({
      'sec-ch-ua': '"Chromium";v="154", "Not/A)Brand";v="24", "Google Chrome";v="154"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'user-agent': uaOf('android-chrome').userAgent,
      ...removed(LOW),
    });
  });

  test('desktop Chromium presets are not mobile, on their own platform', () => {
    const cases: Array<[string, string, string]> = [
      ['mac-chrome', '"macOS"', '"Google Chrome";v="154"'],
      ['windows-chrome', '"Windows"', '"Google Chrome";v="154"'],
      ['windows-edge', '"Windows"', '"Microsoft Edge";v="154"'],
    ];
    for (const [id, platform, own] of cases) {
      const headers = asMap(uaHeaders(uaOf(id)));
      expect(headers['sec-ch-ua-mobile']).toBe('?0');
      expect(headers['sec-ch-ua-platform']).toBe(platform);
      expect(headers['sec-ch-ua']).toEndWith(own);
    }
  });

  test('Googlebot is a mobile Android with no brand of its own', () => {
    const headers = asMap(uaHeaders(uaOf('googlebot')));
    expect(headers['sec-ch-ua']).toBe('"Chromium";v="154", "Not/A)Brand";v="24"');
    expect(headers['sec-ch-ua-mobile']).toBe('?1');
    expect(headers['sec-ch-ua-platform']).toBe('"Android"');
  });
});

describe('uaCommand', () => {
  test('null clears the override', () => {
    expect(uaCommand(null)).toEqual({
      method: 'Emulation.setUserAgentOverride',
      params: { userAgent: '' },
    });
  });

  test('a browser with no client hints gets no metadata', () => {
    expect(uaCommand(uaOf('iphone-safari')).params).toEqual({
      platform: 'iPhone',
      userAgent: uaOf('iphone-safari').userAgent,
    });
  });

  test('a Chromium preset carries its hints as metadata', () => {
    const android = uaOf('android-chrome');
    expect(uaCommand(android).params).toEqual({
      platform: 'Linux armv81',
      userAgent: android.userAgent,
      userAgentMetadata: {
        architecture: '',
        bitness: '',
        brands: android.brands,
        fullVersion: android.hints!.uaFullVersion,
        fullVersionList: android.hints!.fullVersionList,
        mobile: true,
        model: 'Pixel 10',
        platform: 'Android',
        platformVersion: '16.0.0',
        wow64: false,
      },
    });
  });
});

const counter = () => {
  let id = 100;
  return () => (id += 1);
};

describe('uaRules', () => {
  test("a tab's rule takes only that tab's requests to its page's own host", () => {
    const iphone = uaOf('iphone-safari');
    const rules = uaRules(new Map([[7, { host: 'example.com', ua: iphone }]]), counter());
    expect(rules).toEqual([
      {
        action: { requestHeaders: uaHeaders(iphone), type: 'modifyHeaders' },
        condition: {
          requestDomains: ['example.com'],
          resourceTypes: [...RESOURCE_TYPES],
          tabIds: [7],
        },
        id: 101,
      },
    ]);
  });

  test("real phone mode's rule takes only the frame's page loads of the tab's host", () => {
    const iphone = { ...uaOf('iphone-safari'), frame: true as const };
    const [rule] = uaRules(new Map([[7, { host: 'example.com', ua: iphone }]]), counter());
    expect(rule?.condition).toEqual({
      requestDomains: ['example.com'],
      resourceTypes: ['sub_frame'],
      tabIds: [7],
    });
  });

  test("following real phone mode's frame, the tab's one load of the new host goes as the device", () => {
    const iphone = { ...uaOf('iphone-safari'), frame: true as const };
    const rules = uaRules(
      new Map([[7, { host: 'm.example.com', ua: iphone }]]),
      counter(),
      new Map([[7, { host: 'm.example.com', ua: iphone }]]),
    );
    expect(rules.map(({ condition }) => condition)).toEqual([
      { requestDomains: ['m.example.com'], resourceTypes: ['main_frame'], tabIds: [7] },
      { requestDomains: ['m.example.com'], resourceTypes: ['sub_frame'], tabIds: [7] },
    ]);
    for (const { action } of rules) {
      expect(action).toEqual({ requestHeaders: uaHeaders(iphone), type: 'modifyHeaders' });
    }
  });

  test('a device in the frame with real phone mode off sets no rule at all', () => {
    expect(uaRules(new Map(), counter())).toEqual([]);
  });

  test("no rule reaches a service worker's requests, nor a tab with no host", () => {
    const rules = uaRules(
      new Map([
        [7, { host: 'example.com', ua: uaOf('iphone-safari') }],
        [8, { host: null, ua: uaOf('android-chrome') }],
      ]),
      counter(),
    );
    expect(rules.map(({ condition }) => condition.tabIds)).toEqual([[7]]);
    expect(rules.every(({ condition }) => !condition.tabIds?.includes(-1))).toBe(true);
  });

  test('no header a session rides on is touched', () => {
    const rules = uaRules(
      new Map([[7, { host: 'example.com', ua: uaOf('iphone-safari') }]]),
      counter(),
    );
    const headers = rules
      .flatMap(({ action }) => action.requestHeaders ?? [])
      .map(({ header }) => header);
    for (const header of ['cookie', 'set-cookie', 'origin', 'referer']) {
      expect(headers).not.toContain(header);
    }
    expect(headers.some((header) => header.startsWith('sec-fetch-'))).toBe(false);
    expect(rules.every(({ action }) => action.responseHeaders === undefined)).toBe(true);
  });
});

describe('loadsUnder', () => {
  const tabs = new Map([[7, { host: 'example.com', ua: uaOf('iphone-safari') }]]);

  test("a page of the rule's host loads under it, so it loads again once the rule goes", () => {
    expect(loadsUnder(tabs, 7, 'https://example.com/feed')).toBe(true);
  });

  test("real phone mode's rule never reaches the page itself, so nothing loads again", () => {
    const frameOnly = new Map([
      [7, { host: 'example.com', ua: { ...uaOf('iphone-safari'), frame: true as const } }],
    ]);
    expect(loadsUnder(frameOnly, 7, 'https://example.com/')).toBe(false);
  });

  test('another host, another tab or no rule loads as the real browser', () => {
    expect(loadsUnder(tabs, 7, 'https://other.com/')).toBe(false);
    expect(loadsUnder(tabs, 8, 'https://example.com/')).toBe(false);
    expect(loadsUnder(new Map(), 7, 'https://example.com/')).toBe(false);
    expect(loadsUnder(tabs, 7, 'not a url')).toBe(false);
  });
});
