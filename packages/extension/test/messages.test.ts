import { describe, expect, test } from 'bun:test';
import type { KeptEdits } from '@vinena/knobs';
import { DEFAULT_STATE } from '../src/knobs.ts';
import {
  detachMessage,
  editsKey,
  editsToForget,
  readCarry,
  readKept,
  readKeys,
  readPageMessage,
  readPath,
  readPrefer,
  readState,
  readSystemChange,
  readTabRequest,
  readUa,
  riskyEdit,
} from '../src/messages.ts';

describe('detachMessage', () => {
  test('the user closing the bar turns the switch off and keeps the knobs', () => {
    expect(detachMessage('canceled_by_user')).toEqual({
      on: false,
      reason: 'bar-closed',
      type: 'native',
    });
  });

  test('the tab going away puts the knobs back', () => {
    expect(detachMessage('target_closed')).toEqual({ type: 'detached' });
  });
});

describe('readPageMessage', () => {
  test("passes real phone mode's turn, one setting for every tab", () => {
    expect(readPageMessage({ id: 3, on: true, type: 'realPhone' })).toEqual({
      id: 3,
      on: true,
      type: 'realPhone',
    });
    expect(readPageMessage({ id: 3, on: 'yes', type: 'realPhone' })).toBeNull();
  });

  test('passes what devknobs sends', () => {
    expect(readPageMessage({ state: DEFAULT_STATE, type: 'set' })).toEqual({
      state: DEFAULT_STATE,
      type: 'set',
    });
    expect(readPageMessage({ on: false, type: 'native' })).toEqual({ on: false, type: 'native' });
    expect(readPageMessage({ id: 1, open: true, type: 'frame' })).toEqual({
      id: 1,
      open: true,
      type: 'frame',
    });
    expect(readPageMessage({ id: 2, type: 'why', url: 'https://a.test/' })).toEqual({
      id: 2,
      type: 'why',
      url: 'https://a.test/',
    });
    expect(readPageMessage({ extra: 1, id: 3, type: 'watch' })).toEqual({ id: 3, type: 'watch' });
    expect(readPageMessage({ id: 4, type: 'ua', ua: null })).toEqual({
      id: 4,
      type: 'ua',
      ua: null,
    });
    expect(readPageMessage({ id: 5, prefer: 'page', type: 'prefer' })).toEqual({
      id: 5,
      prefer: 'page',
      type: 'prefer',
    });
    expect(readPageMessage({ id: 6, state: { device: 'iphone-18-pro' }, type: 'carry' })).toEqual({
      id: 6,
      state: { device: 'iphone-18-pro' },
      type: 'carry',
    });
  });

  test("drops the extension's own messages and anything malformed", () => {
    for (const message of [
      { media: { motion: 'reduce', scheme: 'dark' }, type: 'system' },
      { type: 'read-system' },
      { type: 'get' },
      { on: 'yes', type: 'native' },
      { id: 1, open: 1, type: 'frame' },
      { type: 'watch' },
      { id: 1, type: 'ua', ua: { userAgent: 7 } },
      { id: 1, prefer: 'both', type: 'prefer' },
      { prefer: 'page', type: 'prefer' },
      { id: 1, state: 'iphone', type: 'carry' },
      { state: {}, type: 'carry' },
      { state: { ...DEFAULT_STATE, scheme: 'sepia' }, type: 'set' },
      null,
      'set',
      [],
    ]) {
      expect(readPageMessage(message)).toBeNull();
    }
  });

  test('the bridge alone asks for the knobs', () => {
    expect(readTabRequest({ type: 'get' })).toEqual({ type: 'get' });
  });
});

describe('the shortcuts', () => {
  test('pass with their version, each a known binding with its key as text', () => {
    const keys = { elements: 'alt+e', grab: 'shift+j', settings: 'o', v: 1 };
    expect(readPageMessage({ id: 6, keys, type: 'keys' })).toEqual({ id: 6, keys, type: 'keys' });
    expect(readPageMessage({ id: 6, keys: {}, type: 'keys' })).toEqual({
      id: 6,
      keys: {},
      type: 'keys',
    });
  });

  test('drop a key that is no text or too long, and a bad version', () => {
    const bad: Array<unknown> = [
      null,
      'shift+j',
      ['shift+j'],
      { grab: 7 },
      { grab: null },
      { grab: 'shift+'.repeat(20) },
      { v: -1 },
      { v: 1.5 },
      { v: '1' },
    ];
    for (const keys of bad) {
      expect(readPageMessage({ id: 7, keys, type: 'keys' })).toBeNull();
    }
    expect(readPageMessage({ keys: { grab: 'shift+j' }, type: 'keys' })).toBeNull();
  });

  test("leave out a name this build does not know, a newer devknobs' binding say", () => {
    expect(readKeys({ grab: 'shift+j', later: 'shift+q', v: 2 })).toEqual({
      grab: 'shift+j',
      v: 2,
    });
    expect(readPageMessage({ id: 8, keys: { other: 7 }, type: 'keys' })).toEqual({
      id: 8,
      keys: {},
      type: 'keys',
    });
  });

  test('read from storage as from a page, nothing where none were kept', () => {
    expect(readKeys({ grab: 'shift+j', v: 1 })).toEqual({ grab: 'shift+j', v: 1 });
    expect(readKeys(undefined)).toBeNull();
  });
});

describe('readCarry', () => {
  test('takes an object of knobs, not one too big or of another kind', () => {
    expect(readCarry({ device: 'pixel-10' })).toEqual({ device: 'pixel-10' });
    expect(readCarry({ big: 'x'.repeat(70_000) })).toBeNull();
    expect(readCarry([])).toBeNull();
    expect(readCarry(null)).toBeNull();
  });
});

describe('readPrefer', () => {
  test("is the page's copy only where the page's was chosen", () => {
    expect(readPrefer('page')).toBe('page');
    expect(readPrefer('extension')).toBe('extension');
    expect(readPrefer(undefined)).toBe('extension');
    expect(readPrefer('PAGE')).toBe('extension');
  });
});

describe('readState', () => {
  test("holds a viewport and text size to devknobs' bounds", () => {
    const viewport = {
      dpr: 50,
      height: null,
      mobile: false,
      touch: false,
      touchPointer: false,
      width: 20_000_000,
    };
    expect(readState({ ...DEFAULT_STATE, textSize: 900, viewport })).toEqual({
      ...DEFAULT_STATE,
      textSize: 72,
      viewport: { ...viewport, dpr: 5, width: 8192 },
    });
    expect(
      readState({ ...DEFAULT_STATE, viewport: { ...viewport, width: -5 } })?.viewport?.width,
    ).toBe(120);
  });

  test('drops a state with a field missing or of another kind', () => {
    expect(readState({ ...DEFAULT_STATE, offline: 'no' })).toBeNull();
    expect(readState({ ...DEFAULT_STATE, textSize: Number.NaN })).toBeNull();
    expect(readState({ ...DEFAULT_STATE, viewport: { width: 400 } })).toBeNull();
    const { scheme: _, ...unschemed } = DEFAULT_STATE;
    expect(readState(unschemed)).toBeNull();
  });
});

describe('readUa', () => {
  const ua = {
    brands: [],
    mobile: true,
    platform: 'iPhone',
    uaPlatform: '',
    userAgent: 'Mozilla/5.0',
  };

  test('keeps a user agent with its brands and hints', () => {
    expect(readUa(ua)).toEqual(ua);
    const brand = { brand: 'Chromium', version: '154' };
    const hints = {
      architecture: '',
      bitness: '',
      fullVersionList: [brand],
      model: 'Pixel',
      platformVersion: '16',
      uaFullVersion: '154.0',
    };
    expect(readUa({ ...ua, brands: [brand], hints })).toEqual({ ...ua, brands: [brand], hints });
  });

  test('drops one with a field of another kind', () => {
    expect(readUa({ ...ua, brands: [{ brand: 1 }] })).toBeUndefined();
    expect(readUa({ ...ua, hints: 'none' })).toBeUndefined();
    expect(readUa({ ...ua, userAgent: null })).toBeUndefined();
    expect(readUa({ ...ua, frame: false })).toBeUndefined();
  });

  test("keeps real phone mode's word that it is for the frame alone", () => {
    expect(readUa({ ...ua, frame: true })).toEqual({ ...ua, frame: true });
  });
});

describe('readSystemChange', () => {
  test("reads the offscreen document's word", () => {
    expect(
      readSystemChange({ media: { motion: 'reduce', scheme: 'dark' }, type: 'system' }),
    ).toEqual({ motion: 'reduce', scheme: 'dark' });
    expect(
      readSystemChange({ media: { motion: 'fast', scheme: 'dark' }, type: 'system' }),
    ).toBeNull();
  });
});

describe('kept edits', () => {
  const rule = {
    context: ['@media (min-width: 640px)'],
    owner: 'style#theme',
    path: [2, 0],
    selectorText: '.cta',
    sheet: '<style>',
    sheetId: 3,
  };
  const edits: KeptEdits['edits'] = [
    {
      after: '10px',
      before: '8px',
      kind: 'css-value',
      property: 'padding',
      target: { rule, selector: 'a.cta', source: 'src/Hero.tsx:4' },
    },
    {
      after: 'before <li> in <ul>',
      before: 'at the end of <ul>',
      from: { next: null, parent: 'ul' },
      kind: 'move',
      property: 'node',
      target: { selector: 'li.c' },
      to: { next: 'li.a', parent: 'ul' },
    },
  ];

  test('reads what devknobs keeps, every field checked, and nothing else', () => {
    expect(readKept({ at: 5, edits, v: 1 })).toEqual({ edits, v: 1 });
    expect(readKept({ edits: [], v: 1 })).toEqual({ edits: [], v: 1 });
    expect(readKept({ edits, v: -1 })).toBeNull();
    expect(readKept({ edits: [{ ...edits[0], kind: 'eval' }], v: 1 })).toBeNull();
    expect(readKept({ edits: [{ ...edits[1], to: undefined }], v: 1 })).toBeNull();
    expect(
      readKept({
        edits: [{ ...edits[0], target: { rule: { ...rule, path: ['x'] }, selector: 'a' } }],
        v: 1,
      }),
    ).toBeNull();
    expect(readKept({ edits: [{ ...edits[0], target: { selector: '' } }], v: 1 })).toBeNull();
    expect(readKept({ edits: Array.from({ length: 201 }, () => edits[1]), v: 1 })).toBeNull();
    const big = { ...edits[0], after: 'x'.repeat(60 * 1024) };
    expect(readKept({ edits: Array.from({ length: 5 }, () => big), v: 1 })).toBeNull();
    expect(readKept('[]')).toBeNull();
  });

  test('a page asks to keep them for a path of its own origin, or forget them', () => {
    expect(readPageMessage({ id: 9, kept: { edits, v: 1 }, path: '/shop', type: 'edits' })).toEqual(
      {
        id: 9,
        kept: { edits, v: 1 },
        path: '/shop',
        type: 'edits',
      },
    );
    expect(readPageMessage({ id: 9, kept: null, path: '/', type: 'edits' })).toEqual({
      id: 9,
      kept: null,
      path: '/',
      type: 'edits',
    });
    expect(
      readPageMessage({ id: 9, kept: { edits: 'x', v: 1 }, path: '/', type: 'edits' }),
    ).toBeNull();
    expect(
      readPageMessage({ id: 9, kept: null, path: 'https://other.test/', type: 'edits' }),
    ).toBeNull();
    expect(readPageMessage({ kept: null, path: '/', type: 'edits' })).toBeNull();
    expect(readPath('/a?b')).toBeNull();
    expect(readPath('/a#b')).toBeNull();
    expect(readPath(`/${'a'.repeat(3000)}`)).toBeNull();
    expect(editsKey('https://site.test', '/shop')).toBe('edits:https://site.test/shop');
  });
});

/** A kept list of one edit of a paragraph. */
const kept = (edit: Record<string, unknown>) => ({
  edits: [{ before: null, property: 'html', target: { selector: 'p' }, ...edit }],
  v: 1,
});

describe('kept edits that could run a script', () => {
  test('a list with one is not read at all', () => {
    for (const after of [
      '<img src=x onerror="a()">',
      '<script>a()</script>',
      '<iframe srcdoc="x">',
      '<a href="javascript:a()">',
      '<a href="jav&#x61;script:a()">',
      '<base href="//evil.test/">',
    ]) {
      expect(readKept(kept({ after, kind: 'html' }))).toBeNull();
    }
    expect(readKept(kept({ after: 'a()', kind: 'attr', property: 'onerror' }))).toBeNull();
    expect(readKept(kept({ after: ' JavaScript:a()', kind: 'attr', property: 'href' }))).toBeNull();
    expect(readKept(kept({ after: '<p>Buy <b>now</b></p>', kind: 'html' }))).not.toBeNull();
    expect(readKept(kept({ after: '/shop', kind: 'attr', property: 'href' }))).not.toBeNull();
  });

  test('reads as devknobs reads it', () => {
    expect(riskyEdit({ after: 'x', kind: 'attr', property: 'srcdoc' })).toBe(true);
    expect(riskyEdit({ after: '<script>', kind: 'text', property: 'text' })).toBe(false);
    expect(riskyEdit({ after: '<a onclick = "x">', kind: 'html', property: 'html' })).toBe(true);
    expect(riskyEdit({ after: 'x;javascript:alert(1)', kind: 'attr', property: 'values' })).toBe(
      true,
    );
    expect(riskyEdit({ after: 'javascript:x', kind: 'attr', property: 'by' })).toBe(true);
    expect(riskyEdit({ after: '0;1', kind: 'attr', property: 'values' })).toBe(false);
  });
});

describe('the pages kept edits are forgotten for', () => {
  test('the oldest by when they were kept, never the one just written, nor other keys', () => {
    const stored: Record<string, unknown> = { keys: { v: 1 } };
    for (let page = 0; page < 22; page += 1) {
      stored[editsKey('https://a.test', `/p${page}`)] = { at: 100 + page, edits: [], v: 1 };
    }
    const now = editsKey('https://a.test', '/p0');
    expect(editsToForget(stored, now, 20)).toEqual([
      editsKey('https://a.test', '/p2'),
      editsKey('https://a.test', '/p1'),
    ]);
    expect(editsToForget({ [now]: {} }, now, 20)).toEqual([]);
  });
});
