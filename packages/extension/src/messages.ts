import type {
  NativeUa,
  NativeViewport,
  PreferValue,
  SystemMedia,
  UaBrand,
  UaHints,
} from '@vinena/knobs';
import type { KnobState } from './knobs.ts';
import type { FrameLoad } from './refusal.ts';

/**
 * From a tab's content script to the service worker, which knows the tab from the sender.
 * `native` is the panel's switch for the debugger, kept for every tab.
 */
export type Request =
  | { type: 'get' }
  | { state: KnobState; type: 'set' }
  | { on: boolean; type: 'native' };

export type Response = {
  /** Knobs a page on another origin handed this one, as the tab followed its frame here. */
  carry?: Carry;
  error?: string;
  native?: boolean;
  state: KnobState;
  system?: SystemMedia | undefined;
};

/**
 * From the page's devknobs, through the bridge, about its frame: `why` asks
 * what the tab's debugger saw of `url`'s load, `watch` turns the debugger on to
 * see the next one, `frame` says the frame opened or went, `bypass` has the
 * tab's loads skip service workers while it stays open, and `ua` is the user
 * agent the tab's requests carry, null for the browser's own. `prefer` keeps
 * whose copy of devknobs runs the panel on a page with its own, for every site,
 * and `realPhone` keeps real phone mode, for every tab and site.
 * `carry` hands the page's knobs on, as the tab follows its frame to another
 * origin the service worker saw it land on. `id` pairs the answer.
 */
export type Ask =
  | { type: 'why'; url: string }
  | { type: 'watch' }
  | { open: boolean; type: 'frame' }
  | { type: 'bypass' }
  | { type: 'ua'; ua: NativeUa | null }
  | { prefer: PreferValue; type: 'prefer' }
  | { on: boolean; type: 'realPhone' }
  | { state: Carry; type: 'carry' };
export type Question = Ask & { id: number };

/** What a page sends, through the bridge: the bridge asks for the tab's knobs itself. */
export type PageRequest = Exclude<Request, { type: 'get' }> | Question;

/** `native` false: the switch is off, so the debugger saw nothing. */
export type Answer = { error?: string; native?: boolean; record?: FrameLoad | null };

/**
 * devknobs' knobs as the page had them, for the page the tab goes to next. What a page sends is
 * the page's to forge: devknobs' own `setState` checks each field as the next page takes it.
 */
export type Carry = Record<string, unknown>;

// More than devknobs' knobs ever take.
const CARRY_MAX = 64 * 1024;

/** Knobs to carry, as a page sent them, or null for anything that is no object or too big. */
export function readCarry(value: unknown): Carry | null {
  return isFields(value) && JSON.stringify(value).length <= CARRY_MAX ? value : null;
}

/** Why the switch went off by itself: the user closed Chrome's debugging bar. */
export type NativeReason = 'bar-closed';

/** From the service worker to a tab's top frame. */
export type TabMessage =
  | { type: 'detached' }
  | { type: 'carry' }
  | { on: boolean; reason?: NativeReason; type: 'native' }
  | { type: 'toggle' }
  | { media: SystemMedia; type: 'system' };

/** Between the service worker and the offscreen document, which reads the user's own media. */
export type SystemMessage = { type: 'read-system' } | { media: SystemMedia; type: 'system' };

/**
 * In `chrome.storage.local`: who runs the panel on a page that mounts its own
 * devknobs, the extension's copy or the page's, for every site in the profile.
 * The bridge reads it as the page starts and hands it on as it changes.
 */
export const PREFER_KEY = 'prefer';

/**
 * In `chrome.storage.local`: real phone mode, one setting for every tab and site. The bridge
 * reads it as the page starts and hands it on as it changes, in any tab.
 */
export const REAL_PHONE_KEY = 'realPhone';

/** The preference as stored, the extension's copy where none is. */
export function readPrefer(value: unknown): PreferValue {
  return value === 'page' ? 'page' : 'extension';
}

/** From the bridge to the page's devknobs: the tab's knobs once loaded, the preference, or a tab message. */
export type PageMessage =
  | TabMessage
  | { prefer: PreferValue; type: 'prefer' }
  | { on: boolean; type: 'realPhone' }
  | (Answer & { id: number; type: 'answer' })
  | {
      base: string;
      carry?: Carry | undefined;
      native: boolean;
      state: KnobState;
      system?: SystemMedia | undefined;
      type: 'state';
    };

/**
 * What the tab hears when the debugger leaves it without the extension asking. The user
 * closing Chrome's bar turns the switch off and the panel keeps its knobs in the page;
 * anything else, such as the tab going away, puts the knobs back to their defaults.
 */
export function detachMessage(reason: `${chrome.debugger.DetachReason}`): TabMessage {
  return reason === 'canceled_by_user'
    ? { on: false, reason: 'bar-closed', type: 'native' }
    : { type: 'detached' };
}

/**
 * Events on `document` between the page world, where devknobs runs, and the
 * bridge in the extension's own world: a `Request` up, a `PageMessage` down.
 * The detail is json: an object would not cross between the worlds. Each build's
 * names are its own (`KNOBS_CHANNEL`).
 */
const CHANNEL = typeof KNOBS_CHANNEL === 'string' ? `:${KNOBS_CHANNEL}` : '';
export const TO_BRIDGE = `devknobs-extension:native${CHANNEL}`;
export const TO_PAGE = `devknobs-extension:tab${CHANNEL}`;
/**
 * Sent by the page world on devknobs' frame itself, with the address to load as its detail: the
 * bridge sets the frame's address from its own world and cancels the event, or, where it does
 * not, devknobs sets it.
 */
export const LOAD_FRAME = `devknobs-extension:load${CHANNEL}`;

/** `TO_PAGE` of the store's 0.5 builds and older, one name for every copy of the extension. */
export const LEGACY_TO_PAGE = 'devknobs-extension:tab';

// What a tab sends is the page's to forge: each message is read field by field, and anything
// else is dropped. devknobs' own bounds hold the numbers in.
const TEXT_MIN = 6;
const TEXT_MAX = 72;
const SIZE_MIN = 120;
const SIZE_MAX = 8192;
const DPR_MIN = 0.25;
const DPR_MAX = 5;

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function oneOf<T extends string>(value: unknown, options: ReadonlyArray<T>): T | null {
  return options.find((option) => option === value) ?? null;
}

function bounded(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : null;
}

/** A side or ratio the tab takes: within devknobs' bounds, or null for the window's own. */
function side(value: unknown, min: number, max: number): number | null | undefined {
  return value === null ? null : (bounded(value, min, max) ?? undefined);
}

function readViewport(value: unknown): NativeViewport | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isFields(value)) {
    return undefined;
  }
  const width = side(value.width, SIZE_MIN, SIZE_MAX);
  const height = side(value.height, SIZE_MIN, SIZE_MAX);
  const dpr = side(value.dpr, DPR_MIN, DPR_MAX);
  const { mobile, touch, touchPointer } = value;
  if (
    width === undefined ||
    height === undefined ||
    dpr === undefined ||
    typeof mobile !== 'boolean' ||
    typeof touch !== 'boolean' ||
    typeof touchPointer !== 'boolean'
  ) {
    return undefined;
  }
  return { dpr, height, mobile, touch, touchPointer, width };
}

/** A tab's knobs as its page sent them, or null for anything else. */
export function readState(value: unknown): KnobState | null {
  if (!isFields(value)) {
    return null;
  }
  const scheme = oneOf(value.scheme, ['system', 'light', 'dark'] as const);
  const motion = oneOf(value.motion, ['system', 'reduce'] as const);
  const contrast = oneOf(value.contrast, ['system', 'more'] as const);
  const transparency = oneOf(value.transparency, ['system', 'reduce'] as const);
  const textSize =
    value.textSize === 'system' ? 'system' : bounded(value.textSize, TEXT_MIN, TEXT_MAX);
  const viewport = readViewport(value.viewport);
  const { offline } = value;
  if (
    !scheme ||
    !motion ||
    !contrast ||
    !transparency ||
    textSize === null ||
    viewport === undefined ||
    typeof offline !== 'boolean'
  ) {
    return null;
  }
  return { contrast, motion, offline, scheme, textSize, transparency, viewport };
}

const isText = (value: unknown): value is string => typeof value === 'string';

function readBrands(value: unknown): Array<UaBrand> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const brands = value.flatMap((brand: unknown) =>
    isFields(brand) && isText(brand.brand) && isText(brand.version)
      ? [{ brand: brand.brand, version: brand.version }]
      : [],
  );
  return brands.length === value.length ? brands : null;
}

function readHints(value: unknown): UaHints | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isFields(value)) {
    return null;
  }
  const { architecture, bitness, model, platformVersion, uaFullVersion } = value;
  const fullVersionList = readBrands(value.fullVersionList);
  return isText(architecture) &&
    isText(bitness) &&
    isText(model) &&
    isText(platformVersion) &&
    isText(uaFullVersion) &&
    fullVersionList
    ? { architecture, bitness, fullVersionList, model, platformVersion, uaFullVersion }
    : null;
}

/** The user agent a page asks its tab's requests to carry, or undefined for anything else. */
export function readUa(value: unknown): NativeUa | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isFields(value)) {
    return undefined;
  }
  const { mobile, platform, uaPlatform, userAgent } = value;
  const brands = readBrands(value.brands);
  const hints = readHints(value.hints);
  if (
    !isText(userAgent) ||
    !isText(platform) ||
    !isText(uaPlatform) ||
    typeof mobile !== 'boolean' ||
    !brands ||
    hints === null ||
    (value.frame !== undefined && value.frame !== true)
  ) {
    return undefined;
  }
  return {
    brands,
    mobile,
    platform,
    uaPlatform,
    userAgent,
    ...(hints ? { hints } : {}),
    ...(value.frame ? { frame: true as const } : {}),
  };
}

/** What a tab's page may send the service worker, through the bridge, or null for anything else. */
export function readPageMessage(value: unknown): PageRequest | null {
  if (!isFields(value)) {
    return null;
  }
  switch (value.type) {
    case 'set': {
      const state = readState(value.state);
      return state ? { state, type: 'set' } : null;
    }
    case 'native': {
      return typeof value.on === 'boolean' ? { on: value.on, type: 'native' } : null;
    }
    default: {
      break;
    }
  }
  const { id } = value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) {
    return null;
  }
  switch (value.type) {
    case 'why': {
      return isText(value.url) ? { id, type: 'why', url: value.url } : null;
    }
    case 'watch':
    case 'bypass': {
      return { id, type: value.type };
    }
    case 'frame': {
      return typeof value.open === 'boolean' ? { id, open: value.open, type: 'frame' } : null;
    }
    case 'ua': {
      const ua = readUa(value.ua);
      return ua === undefined ? null : { id, type: 'ua', ua };
    }
    case 'prefer': {
      return value.prefer === 'extension' || value.prefer === 'page'
        ? { id, prefer: value.prefer, type: 'prefer' }
        : null;
    }
    case 'realPhone': {
      return typeof value.on === 'boolean' ? { id, on: value.on, type: 'realPhone' } : null;
    }
    case 'carry': {
      const state = readCarry(value.state);
      return state ? { id, state, type: 'carry' } : null;
    }
    default: {
      return null;
    }
  }
}

/** What a tab's bridge may send the service worker, or null for anything else. */
export function readTabRequest(value: unknown): Request | Question | null {
  return isFields(value) && value.type === 'get' ? { type: 'get' } : readPageMessage(value);
}

/** The user's own scheme and motion, from the offscreen document's word of a change, or null. */
export function readSystemChange(value: unknown): SystemMedia | null {
  if (!isFields(value) || value.type !== 'system' || !isFields(value.media)) {
    return null;
  }
  const scheme = oneOf(value.media.scheme, ['light', 'dark'] as const);
  const motion = oneOf(value.media.motion, ['reduce', 'no-preference'] as const);
  return scheme && motion ? { motion, scheme } : null;
}
