import type {
  EditKind,
  EditPlace,
  KeptEdits,
  NativeUa,
  NativeViewport,
  PreferValue,
  StoredKeys,
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
 * `realPhone` keeps real phone mode, for every tab and site, `keys` keeps
 * the shortcuts the user set in the panel, for every site, and `edits` keeps the
 * edits of the page at `path` on the tab's origin after a reload, or with null forgets them:
 * the bridge puts the path the page loaded at in place of the one the page sent.
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
  | { keys: Keys; type: 'keys' }
  | { kept: KeptEdits | null; path: string; type: 'edits' }
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

/**
 * In `chrome.storage.local`: the shortcuts the user set in the panel, one set for every
 * site, in place of each page's `localStorage`. The bridge reads it as the page starts and
 * hands it on as it changes, in any tab. Keys a page's `localStorage` kept from before
 * are not brought over: that would take a write with no hand of the user's in it.
 */
export const KEYS_KEY = 'keys';

/**
 * devknobs' bindings, the names its kept keys have: one devknobs adds and this leaves out, or
 * one this has and devknobs dropped, is a type error.
 */
const BINDINGS: Record<keyof StoredKeys, true> = {
  elements: true,
  grab: true,
  inspect: true,
  panel: true,
  replay: true,
  requests: true,
  reset: true,
  settings: true,
  storage: true,
};
/** Whether a name is one of devknobs' bindings. */
const isBinding = (name: string): name is keyof StoredKeys => Object.hasOwn(BINDINGS, name);

/** The longest key devknobs writes, such as `meta+ctrl+alt+shift+backspace`, with room. */
const KEY_MAX = 64;

/** The shortcuts as devknobs keeps them: its version and each binding's key it set, as text. */
export type Keys = { v?: number } & StoredKeys;

/**
 * In `chrome.storage.local`, before the page's origin and path: the edits kept after a reload
 * for that page, with when they were kept (`at`), in place of the page's `localStorage`. The
 * bridge reads the tab's page's as it starts and hands them on as they change; the service
 * worker keeps those of `EDITS_PAGES` pages at most, forgetting the page kept longest ago.
 */
export const EDITS_PREFIX = 'edits:';
export const EDITS_PAGES = 20;

/** Where the edits of a page are kept: its origin and path, as devknobs keeps them per page. */
export const editsKey = (origin: string, path: string) => `${EDITS_PREFIX}${origin}${path}`;

// devknobs' caps on what it keeps for a page (`MAX_EDITS` and `MAX_BYTES` in its edit/keep.ts),
// and on a field of one edit.
const EDITS_MAX = 200;
const EDITS_BYTES = 256 * 1024;
const FIELD_MAX = 64 * 1024;
const PATH_MAX = 2048;

/** devknobs' edit kinds: one it adds that this leaves out, or one it dropped, is a type error. */
const EDIT_KINDS: Record<EditKind, true> = {
  attr: true,
  'css-add': true,
  'css-rule': true,
  'css-toggle': true,
  'css-value': true,
  delete: true,
  hide: true,
  html: true,
  move: true,
  text: true,
};
/** Whether a value is one of devknobs' edit kinds. */
const isKind = (value: unknown): value is EditKind =>
  typeof value === 'string' && Object.hasOwn(EDIT_KINDS, value);

const isField = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= FIELD_MAX;

const isFieldOrNull = (value: unknown): value is string | null => value === null || isField(value);

function readPlace(value: unknown): EditPlace | null {
  if (!isFields(value) || !isField(value.parent) || value.parent === '') {
    return null;
  }
  const { next, parent } = value;
  if (next !== null && (!isField(next) || next === '')) {
    return null;
  }
  return { next, parent };
}

type Rule = NonNullable<KeptEdits['edits'][number]['target']['rule']>;

function readRule(value: unknown): Rule | null {
  if (!isFields(value)) {
    return null;
  }
  const { context, owner, path, selectorText, sheet, sheetId } = value;
  const steps =
    Array.isArray(path) &&
    path.length <= 64 &&
    path.every(
      (step: unknown) => typeof step === 'number' && Number.isSafeInteger(step) && step >= 0,
    )
      ? path.map(Number)
      : null;
  const around =
    Array.isArray(context) && context.length <= 64 && context.every(isField)
      ? context.map(String)
      : null;
  if (
    !isField(selectorText) ||
    !isField(sheet) ||
    !isFieldOrNull(owner) ||
    typeof sheetId !== 'number' ||
    !Number.isSafeInteger(sheetId) ||
    !steps ||
    !around
  ) {
    return null;
  }
  return { context: around, owner, path: steps, selectorText, sheet, sheetId };
}

type SavedEdit = KeptEdits['edits'][number];

function readEdit(value: unknown): SavedEdit | null {
  if (!isFields(value) || !isFields(value.target)) {
    return null;
  }
  const kind = isKind(value.kind) ? value.kind : null;
  const { after, before, property } = value;
  const { rule, selector, source } = value.target;
  if (
    !kind ||
    !isField(selector) ||
    selector === '' ||
    !isField(property) ||
    !isFieldOrNull(before) ||
    !isFieldOrNull(after) ||
    (source !== undefined && !isField(source))
  ) {
    return null;
  }
  const edit: SavedEdit = { after, before, kind, property, target: { selector } };
  if (source !== undefined) {
    edit.target.source = source;
  }
  if (rule !== undefined) {
    const read = readRule(rule);
    if (!read) {
      return null;
    }
    edit.target.rule = read;
  }
  if (kind === 'move') {
    const from = readPlace(value.from);
    const to = readPlace(value.to);
    if (!from || !to) {
      return null;
    }
    edit.from = from;
    edit.to = to;
  }
  return edit;
}

/** What a script could run through: devknobs' `URL_ATTRIBUTES` in its edit/risk.ts. */
const URL_ATTRIBUTES = new Set([
  'action',
  'by',
  'formaction',
  'from',
  'href',
  'src',
  'to',
  'values',
  'xlink:href',
]);
// Control characters and spaces, which the browser drops from an address before it reads its scheme.
// oxlint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0020\u007f]/g;

/**
 * Whether an edit could run a script, from its text alone, as devknobs' `riskyEdit` reads it
 * (edit/risk.ts; the two stay the same): an attribute that is an `on…` handler or `srcdoc`, or
 * a `javascript:` address, or markup that names an element that runs or loads a script, has an
 * `on…=`, a `srcdoc`, a `javascript:` or a character reference. devknobs never keeps one.
 */
export function riskyEdit(edit: { after: string | null; kind: string; property: string }): boolean {
  const { after, kind, property } = edit;
  if (kind === 'attr') {
    const name = property.trim().toLowerCase();
    return (
      name.startsWith('on') ||
      name === 'srcdoc' ||
      (after !== null &&
        URL_ATTRIBUTES.has(name) &&
        // svg's `values` is a list, `;` between its items, each of which the animation sets.
        (name === 'values' ? after.split(';') : [after]).some((item) =>
          item.replaceAll(CONTROLS, '').toLowerCase().startsWith('javascript:'),
        ))
    );
  }
  if (kind !== 'html' || after === null) {
    return false;
  }
  return (
    /<\s*(script|iframe|frame|object|embed|base|meta|link)\b/i.test(after) ||
    /[\s"'/]on[a-z]+\s*=/i.test(after) ||
    /srcdoc/i.test(after) ||
    /javascript\s*:/i.test(after.replaceAll(CONTROLS, '')) ||
    /&#|&colon;|&tab;|&newline;/i.test(after)
  );
}

/**
 * The edits a page sent or storage holds for a page, or null for anything that is no object,
 * has a bad version, more edits than devknobs keeps, more text than it keeps, an entry that
 * is no edit of a kind it makes, or one that could run a script. devknobs reads each edit again
 * itself, and makes no html or attribute edit as the page loads.
 */
export function readKept(value: unknown): KeptEdits | null {
  if (
    !isFields(value) ||
    !Array.isArray(value.edits) ||
    value.edits.length > EDITS_MAX ||
    typeof value.v !== 'number' ||
    !Number.isSafeInteger(value.v) ||
    value.v < 0 ||
    JSON.stringify(value.edits).length > EDITS_BYTES
  ) {
    return null;
  }
  const edits: Array<SavedEdit> = [];
  for (const one of value.edits) {
    const edit = readEdit(one);
    if (!edit || riskyEdit(edit)) {
      return null;
    }
    edits.push(edit);
  }
  return { edits, v: value.v };
}

/**
 * The keys of kept pages to forget so `max` stay, `kept` among them: the pages kept longest ago,
 * by their `at`, past the newest `max - 1` others.
 */
export function editsToForget(
  stored: Record<string, unknown>,
  kept: string,
  max = EDITS_PAGES,
): Array<string> {
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(EDITS_PREFIX) && key !== kept)
    .map(([key, value]) => {
      const at: unknown = isFields(value) ? value.at : 0;
      return { at: typeof at === 'number' ? at : 0, key };
    })
    .toSorted((a, b) => b.at - a.at)
    .slice(max - 1)
    .map(({ key }) => key);
}

/** A page's path as a page sent it: one that starts with `/`, with no query or hash, or null. */
export function readPath(value: unknown): string | null {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    value.length <= PATH_MAX &&
    !/[?#]/.test(value)
    ? value
    : null;
}

/** The preference as stored, the extension's copy where none is. */
export function readPrefer(value: unknown): PreferValue {
  return value === 'page' ? 'page' : 'extension';
}

/** From the bridge to the page's devknobs: the tab's knobs once loaded, the preference, or a tab message. */
export type PageMessage =
  | TabMessage
  | { prefer: PreferValue; type: 'prefer' }
  | { on: boolean; type: 'realPhone' }
  /** The shortcuts kept for every site, null where the user set none yet. */
  | { keys: Keys | null; type: 'keys' }
  /** The edits kept for the page after a reload, null where it keeps none. */
  | { kept: KeptEdits | null; type: 'edits' }
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

/**
 * The shortcuts a page sent or storage holds, or null for anything that is no object, has a
 * bad version, or a key that is no short text. A name this build does not know, such as a
 * binding of a newer devknobs, is left out. devknobs reads each key itself.
 */
export function readKeys(value: unknown): Keys | null {
  if (!isFields(value)) {
    return null;
  }
  const keys: Keys = {};
  for (const [name, text] of Object.entries(value)) {
    if (name === 'v') {
      if (typeof text !== 'number' || !Number.isSafeInteger(text) || text < 0) {
        return null;
      }
      keys.v = text;
      continue;
    }
    if (!isBinding(name)) {
      continue;
    }
    const binding = name;
    if (!isText(text) || text.length > KEY_MAX) {
      return null;
    }
    keys[binding] = text;
  }
  return keys;
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
    case 'keys': {
      const keys = readKeys(value.keys);
      return keys ? { id, keys, type: 'keys' } : null;
    }
    case 'edits': {
      const path = readPath(value.path);
      const kept = value.kept === null ? null : readKept(value.kept);
      return path && (kept || value.kept === null) ? { id, kept, path, type: 'edits' } : null;
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
