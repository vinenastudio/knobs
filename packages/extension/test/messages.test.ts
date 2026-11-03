import { describe, expect, test } from 'bun:test';
import { DEFAULT_STATE } from '../src/knobs.ts';
import {
  detachMessage,
  readCarry,
  readKeys,
  readPageMessage,
  readPrefer,
  readState,
  readSystemChange,
  readTabRequest,
  readUa,
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
