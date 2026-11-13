import type { Knobs, StopId } from './progress.ts';

/**
 * Where the tour points. Every hook into devknobs' own DOM is in this file, so
 * a change there is mended in one place, and so the package can give the tour
 * stable hooks one day. A lookup that finds nothing never throws: the tour
 * then points at the control that leads there.
 */

export const DUO = 'iphone-duo';
export const IPHONE = 'iphone-18-pro';

const HOOKS = {
  // The panel's "add knob" button under the rows, which opens the search. No stable hook: a class.
  add: 'button.add',
  // One capsule beside the address in Safari's bars, such as back or the tab row. It fades out as
  // the bars minimize: its computed opacity is read. No stable hook: a class.
  barSide: '.side',
  // The one shape of Safari's bars that stays: the address capsule, or Bottom's card, which
  // shrinks to the domain pill as the page scrolls. Its box and corners are read every frame.
  // No stable hook: a class.
  barSurface: '.surface',
  // Safari's bars over the page, inside the device's screen (`.browser` is the bars' layer,
  // `.safari` the drawing in it). Chrome's have another drawing. No stable hook: two classes.
  bars: '.browser .safari',
  // The field over a long list of values, which narrows it as the visitor types. No stable hook: a class.
  filter: 'input.filter',
  // The device row's fold slider, inside the device knob's line.
  foldSlider: '[role="slider"][aria-label="fold"]',
  // The page in a device's frame, inside the frame host's shadow root.
  frame: 'iframe[data-knobs-frame], iframe[data-devknobs-frame]',
  // The device's screen around that page, bars and all. No stable hook: a class.
  glass: '.glass',
  // The footer's grab button.
  grab: 'button[data-command="grab"]',
  // Grab's overlay, on the page for as long as grab is on, in the document grab runs in.
  grabOverlay: 'div[data-knobs="grab"], div[data-devknobs="grab"]',
  // The handle on the window's edge, by the start of its aria-label.
  handle: 'button[aria-label^="knobs"], button[aria-label^="devknobs"]',
  // One knob's line inside an open row's editor.
  knob: (id: string) => `[data-knob="${id}"]`,
  // A long list of values, such as the devices, and the mat's swatches.
  listbox: '[role="listbox"]',
  // The drawing of the device's body around its screen, in the frame host's shadow root: the
  // caption goes outside it. No stable hook: a class.
  mock: 'svg.mock',
  // A value in a list, and an entry of the search results.
  option: '[role="option"]',
  // The panel's host in the page. Its shadow root is open.
  panel: '[data-knobs="panel"], [data-devknobs="panel"]',
  // The open panel's own box, for the final bubble. No stable hook: a class.
  panelBox: '.panel',
  // The search results' list.
  results: '#devknobs-results',
  // A row's box. It carries `hidden` while the row is not listed.
  row: (id: string) => `[data-row="${id}"]`,
  // A row's line, the button that opens its editor: the first with aria-expanded in the row.
  rowLine: 'button[aria-expanded]',
  // The search field.
  search: 'input[role="combobox"]',
  // The footer's gear, which also leads back from the settings.
  settings: 'button[aria-label="settings"]',
  // The mat's swatches, inside the mat knob's line.
  swatches: '[role="radiogroup"]',
  // The frame host in the page, there for as long as a device or a width is up.
  viewport: '[data-knobs="viewport"], [data-devknobs="viewport"]',
  // The panel's wrapper, which says the view shown: rows, results, browse or keys.
  wrap: '[data-mode]',
} as const;

// The words devknobs itself shows, which the tour finds a control by.
const WORDS = {
  // The device knob's name in the search results.
  device: 'device',
  // The mat knob's name in the search results.
  mat: 'mat',
  // The fold chip of a device that is shut.
  unfold: 'unfold',
} as const;

/** One caption each: the words name the control the frame is on, hop by hop. */
export type Say =
  | 'addDevice'
  | 'addMat'
  | 'bars'
  | 'browser'
  | 'duo'
  | 'entryDevice'
  | 'entryMat'
  | 'explore'
  | 'filter'
  | 'grab'
  | 'iphone'
  | 'mat'
  | 'open'
  | 'pick'
  | 'rowDevice'
  | 'rowMat'
  | 'scroll'
  | 'searchDevice'
  | 'searchMat'
  | 'settings'
  | 'unfold';

/** A box in the window, and how round the corners of what it holds are. */
export type Spot = {
  readonly bottom: number;
  readonly left: number;
  readonly radius: number;
  readonly right: number;
  readonly top: number;
};

export type Aim = {
  /** What the caption never goes over, such as the panel and its handle where the target is outside them. */
  readonly avoid?: ReadonlyArray<Element>;
  /** No frame here, only the caption beside the target, such as while grab draws its own box. */
  readonly bare?: boolean;
  /**
   * The boxes the caption goes outside of, as one, where there is room: the phone around its
   * screen, or the panel and its handle around a control in the panel.
   */
  readonly beside?: ReadonlyArray<Element>;
  /** The box the target scrolls in, which it is cut to, such as an option's list. */
  readonly clip: Element | null;
  /** The control to frame, or null where there is none to show. */
  readonly el: Element | null;
  /** What to say beside it, or null to say and draw nothing. */
  readonly say: Say | null;
  /** Where the frame goes when that is not the control's own box. Read every frame, never kept. */
  readonly spot?: () => Spot | null;
};

/** Is the node laid out? A hidden row and a folded editor are not. */
function shown(node: Element | null | undefined): node is Element {
  return node !== null && node !== undefined && node.getClientRects().length > 0;
}

function panelRoot(): ShadowRoot | null {
  return document.querySelector(HOOKS.panel)?.shadowRoot ?? null;
}

function frameRoot(): ShadowRoot | null {
  return document.querySelector(HOOKS.viewport)?.shadowRoot ?? null;
}

/** Is grab on, here or in the page inside the device's frame? */
export function grabbing(): boolean {
  if (document.querySelector(HOOKS.grabOverlay) !== null) {
    return true;
  }
  try {
    const frame = frameRoot()?.querySelector<HTMLIFrameElement>(HOOKS.frame);
    return (frame?.contentDocument?.querySelector(HOOKS.grabOverlay) ?? null) !== null;
  } catch {
    return false;
  }
}

/**
 * A hop on the way to a row's editor: out of the settings, "add knob", the
 * search field, the knob's entry in the results, an entry that sets the value
 * itself, or the row's own line.
 */
type Hop = 'add' | 'entry' | 'line' | 'search' | 'settings' | 'value';

/** A row's open editor, or the control that leads to it. */
type Lead = Pick<Aim, 'clip' | 'el'> & { readonly hop: Hop };
type Way = { readonly row: Element } | Lead;

/** What each hop says, for the two knobs the tour leads to. */
const HOPS: Record<'device' | 'mat', Record<Exclude<Hop, 'settings' | 'value'>, Say>> = {
  device: { add: 'addDevice', entry: 'entryDevice', line: 'rowDevice', search: 'searchDevice' },
  mat: { add: 'addMat', entry: 'entryMat', line: 'rowMat', search: 'searchMat' },
};

function shownOr(el: Element | null | undefined): Element | null {
  return shown(el) ? el : null;
}

function lead(hop: Hop, el: Element | null | undefined, clip: Element | null = null): Lead {
  return { clip, el: shownOr(el), hop };
}

/** A hop framed, with its own words. `say` is what the entry that sets the value itself does. */
function hopTo(way: Lead, knob: keyof typeof HOPS, say: Say): Aim {
  const words =
    way.hop === 'settings' ? 'settings' : way.hop === 'value' ? say : HOPS[knob][way.hop];
  return { clip: way.clip, el: way.el, say: words };
}

/**
 * The way to a row's editor from wherever the panel is: out of the settings,
 * through the search to the knob's entry, or to "add knob" for a row taken off
 * the list.
 */
function wayTo(root: ShadowRoot, row: string, knob: string, value?: string): Way {
  const mode = root.querySelector(HOOKS.wrap)?.getAttribute('data-mode');
  if (mode === 'keys') {
    return lead('settings', root.querySelector(HOOKS.settings));
  }
  if (mode === 'results' || mode === 'browse') {
    const list = root.querySelector(HOOKS.results);
    // An entry starts with its knob's name, in a span of its own.
    const entries = Array.from(list?.querySelectorAll(HOOKS.option) ?? []).filter(
      (entry) => entry.querySelector('span')?.textContent === knob,
    );
    const valued = entries.find((item) => value !== undefined && item.textContent.includes(value));
    const entry = valued ?? entries[0];
    return entry === undefined
      ? lead('search', root.querySelector(HOOKS.search))
      : lead(valued === undefined ? 'entry' : 'value', entry, list);
  }
  const box = root.querySelector(HOOKS.row(row));
  if (!shown(box)) {
    return lead('add', root.querySelector(HOOKS.add));
  }
  const line = box.querySelector(HOOKS.rowLine);
  return line?.getAttribute('aria-expanded') === 'true'
    ? { row: box }
    : lead('line', line, box.parentElement);
}

/** A device in the device row's list, or the way to it. */
function atDevice(root: ShadowRoot, knobs: Knobs, id: string, say: Say): Aim {
  const label = knobs.PRESETS.device.find((device) => device.id === id)?.label;
  const way = wayTo(root, 'device', WORDS.device, label);
  if (!('row' in way)) {
    return hopTo(way, 'device', say);
  }
  const list = way.row.querySelector(`${HOOKS.knob('device')} ${HOOKS.listbox}`);
  const option = Array.from(list?.querySelectorAll(HOOKS.option) ?? []).find(
    (item) => item.textContent === label,
  );
  if (shown(option)) {
    return { clip: list, el: option, say };
  }
  // A filter typed in the list hides the device: the filter is the place, to clear it.
  const filter = way.row.querySelector(`${HOOKS.knob('device')} ${HOOKS.filter}`);
  if (shown(filter)) {
    return { clip: way.row.parentElement, el: filter, say: 'filter' };
  }
  return { clip: null, el: shown(list) ? list : way.row, say };
}

function atFold(root: ShadowRoot): Aim {
  const way = wayTo(root, 'device', WORDS.device);
  if (!('row' in way)) {
    return hopTo(way, 'device', 'unfold');
  }
  const line = way.row.querySelector(HOOKS.knob('device'));
  const chip = Array.from(line?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === WORDS.unfold,
  );
  const slider = line?.querySelector(HOOKS.foldSlider);
  const el = shown(chip) ? chip : shown(slider) ? slider : way.row;
  return { clip: way.row.parentElement, el, say: 'unfold' };
}

/** The device row's browser knob: with the browser off there are no bars for a scroll to move. */
function atBrowser(root: ShadowRoot): Aim {
  const way = wayTo(root, 'device', WORDS.device);
  if (!('row' in way)) {
    return hopTo(way, 'device', 'browser');
  }
  const line = way.row.querySelector(HOOKS.knob('browser'));
  return { clip: way.row.parentElement, el: shown(line) ? line : way.row, say: 'browser' };
}

function atMat(root: ShadowRoot): Aim {
  const way = wayTo(root, 'viewport', WORDS.mat);
  if (!('row' in way)) {
    return hopTo(way, 'mat', 'mat');
  }
  const swatches = way.row.querySelector(`${HOOKS.knob('mat')} ${HOOKS.swatches}`);
  return { clip: way.row.parentElement, el: shown(swatches) ? swatches : way.row, say: 'mat' };
}

/** The screen of the device on the mat. */
function atScreen(): Element | null {
  const root = frameRoot();
  const glass = root?.querySelector(HOOKS.glass);
  return shown(glass) ? glass : (root?.querySelector(HOOKS.frame) ?? null);
}

/**
 * The open panel's box and its handle's. A floating panel shows its handle while open too, on its
 * outer side, past the panel's own box; a pinned one shows none.
 */
function panelParts(root: ShadowRoot | null | undefined): ReadonlyArray<Element> {
  return [root?.querySelector(HOOKS.panelBox), root?.querySelector(HOOKS.handle)].filter(shown);
}

/** What a caption about the device keeps clear of: the phone it goes outside of, and the panel. */
function around(screen: Element): Pick<Aim, 'avoid' | 'beside'> {
  const mock = frameRoot()?.querySelector(HOOKS.mock);
  return { avoid: panelParts(panelRoot()), beside: [shown(mock) ? mock : screen] };
}

/** A caption about a control in the panel goes outside the panel and its handle. */
function besidePanel(root: ShadowRoot): Pick<Aim, 'avoid' | 'beside'> {
  const parts = panelParts(root);
  return { avoid: parts, beside: parts };
}

function opacityOf(node: Element): number {
  const value = Number.parseFloat(getComputedStyle(node).opacity);
  return Number.isNaN(value) ? 1 : value;
}

/** A box's corner radius as drawn: its css radius by the scale it is drawn at, a capsule's at most. */
function roundOf(node: Element, box: DOMRect): number {
  const style = getComputedStyle(node);
  const css = Number.parseFloat(style.borderTopLeftRadius) || 0;
  // Its height in its own px, before the device's zoom: these boxes have no border or padding.
  const tall = Number.parseFloat(style.height) || 0;
  return Math.min(tall > 0 ? (css * box.height) / tall : css, box.height / 2, box.width / 2);
}

/**
 * Where Safari's bars are now. devknobs draws them as elements (`buildSafari` in its
 * `src/engine/safaridraw.ts`): one surface that is the address capsule, or Bottom's card, and
 * morphs into the domain pill, and capsules beside it that fade out. So the frame is the surface's
 * box, grown over the capsules in its row by as much as they still show, and it shrinks with the
 * bars. Every value is read off the live elements, in the middle of their transitions too. Turned
 * across there is no surface: the row of capsules for as long as it shows, then the screen.
 */
function barsSpot(
  screen: Element,
  surface: Element | null,
  sides: ReadonlyArray<Element>,
): Spot | null {
  const lit = sides
    .filter((side) => side.isConnected)
    .map((side) => ({ box: side.getBoundingClientRect(), show: opacityOf(side) }));
  if (surface === null) {
    const row = lit.filter(({ show }) => show >= 0.5);
    if (row.length === 0) {
      const all = screen.getBoundingClientRect();
      const { bottom, left, right, top } = all;
      return { bottom, left, radius: roundOf(screen, all), right, top };
    }
    const bottom = Math.max(...row.map(({ box }) => box.bottom));
    const top = Math.min(...row.map(({ box }) => box.top));
    return {
      bottom,
      left: Math.min(...row.map(({ box }) => box.left)),
      radius: (bottom - top) / 2,
      right: Math.max(...row.map(({ box }) => box.right)),
      top,
    };
  }
  if (!surface.isConnected) {
    return null;
  }
  const base = surface.getBoundingClientRect();
  // The capsules in the surface's own row. Top's tab row, at the other end of the screen, is not.
  const row = lit.filter(({ box }) => box.top < base.bottom && box.bottom > base.top);
  const show = Math.max(0, ...row.map(({ show: each }) => each));
  const grow = (from: number, to: number) => from + (to - from) * show;
  const bottom = grow(base.bottom, Math.max(base.bottom, ...row.map(({ box }) => box.bottom)));
  const top = grow(base.top, Math.min(base.top, ...row.map(({ box }) => box.top)));
  return {
    bottom,
    left: grow(base.left, Math.min(base.left, ...row.map(({ box }) => box.left))),
    radius: Math.min(roundOf(surface, base), (bottom - top) / 2),
    right: grow(base.right, Math.max(base.right, ...row.map(({ box }) => box.right))),
    top,
  };
}

/** Safari's bars on the device's screen, or null where it draws none of them. */
function atBars(screen: Element): Aim | null {
  const bars = screen.querySelector(HOOKS.bars);
  const surface = bars?.querySelector(HOOKS.barSurface) ?? null;
  const sides = Array.from(bars?.querySelectorAll(HOOKS.barSide) ?? []);
  const el = surface ?? sides[0];
  if (!shown(el)) {
    return null;
  }
  return {
    ...around(screen),
    clip: null,
    el,
    say: 'bars',
    spot: () => barsSpot(screen, surface, sides),
  };
}

function find(stop: StopId, knobs: Knobs, watching: boolean): Aim {
  const state = knobs.getState();
  if (stop === 'grab' && grabbing()) {
    // Grab draws its own box on what the pointer is over: the tour only says what to do, beside
    // the device's screen, or at the bottom of the window where there is none.
    const screen = atScreen();
    return shown(screen)
      ? { ...around(screen), bare: true, clip: null, el: screen, say: 'pick' }
      : { bare: true, clip: null, el: null, say: 'pick' };
  }
  const phone = knobs.PRESETS.device.find(({ id }) => id === state.device)?.kind === 'phone';
  if (stop === 'scroll') {
    const screen = phone && state.browser !== 'off' ? atScreen() : null;
    if (shown(screen)) {
      const bars = watching ? atBars(screen) : null;
      return (
        bars ?? { ...around(screen), clip: null, el: screen, say: watching ? 'bars' : 'scroll' }
      );
    }
  }
  const root = panelRoot();
  if (root === null) {
    return { clip: null, el: null, say: 'open' };
  }
  if (!state.panel.open || stop === 'open') {
    return { clip: null, el: shownOr(root.querySelector(HOOKS.handle)), say: 'open' };
  }
  return { ...besidePanel(root), ...inPanel(stop, knobs, root) };
}

/** The control in the open panel for a stop. */
function inPanel(stop: StopId, knobs: Knobs, root: ShadowRoot): Aim {
  const state = knobs.getState();
  const phone = knobs.PRESETS.device.find(({ id }) => id === state.device)?.kind === 'phone';
  if (stop === 'grab') {
    return { clip: null, el: shownOr(root.querySelector(HOOKS.grab)), say: 'grab' };
  }
  if (stop === 'iphone') {
    return atDevice(root, knobs, IPHONE, 'iphone');
  }
  // The fold belongs to the Duo and the mat to a frame: without one, back to picking the Duo.
  if (stop === 'unfold' && state.device === DUO) {
    return atFold(root);
  }
  if (stop === 'mat' && document.querySelector(HOOKS.viewport) !== null) {
    return atMat(root);
  }
  if (stop === 'scroll' && phone && state.browser === 'off') {
    return atBrowser(root);
  }
  return atDevice(root, knobs, DUO, 'duo');
}

/**
 * The control the visitor should use for a stop, as the page stands now. `watching` is the moment
 * after the scroll, when the place to look is the browser's bars.
 */
export function aimAt(stop: StopId, knobs: Knobs, watching: boolean): Aim {
  try {
    return find(stop, knobs, watching);
  } catch {
    return { clip: null, el: null, say: 'open' };
  }
}

/** The open panel, or its handle: where the final bubble sits. */
export function aimAtPanel(knobs: Knobs): Aim {
  try {
    const root = panelRoot();
    const open = knobs.getState().panel.open;
    const el = root?.querySelector(open ? HOOKS.panelBox : HOOKS.handle);
    const near = open && root !== null && root !== undefined ? besidePanel(root) : {};
    return { ...near, clip: null, el: shown(el) ? el : null, say: null };
  } catch {
    return { clip: null, el: null, say: null };
  }
}

/**
 * Open the panel's list of every knob, the one its "add knob" button opens. devknobs has no public
 * way to do it, so the real button is pressed, out of the settings first. False where it is not
 * there to press.
 */
export function openBrowse(): boolean {
  try {
    const root = panelRoot();
    const mode = () => root?.querySelector(HOOKS.wrap)?.getAttribute('data-mode');
    if (mode() === 'keys') {
      root?.querySelector<HTMLElement>(HOOKS.settings)?.click();
    }
    if (mode() === 'results' || mode() === 'browse') {
      return true;
    }
    const add = root?.querySelector<HTMLElement>(HOOKS.add);
    add?.click();
    return add !== null && add !== undefined;
  } catch {
    return false;
  }
}

/** The panel's search field, or the panel: where to look for the other knobs when the list did not open. */
export function aimAtSearch(): Aim {
  try {
    const root = panelRoot();
    const search = root?.querySelector(HOOKS.search);
    const el = shown(search) ? search : shownOr(root?.querySelector(HOOKS.panelBox));
    const near = root === null || root === undefined ? {} : besidePanel(root);
    return { ...near, clip: null, el, say: el === null ? null : 'explore' };
  } catch {
    return { clip: null, el: null, say: null };
  }
}
