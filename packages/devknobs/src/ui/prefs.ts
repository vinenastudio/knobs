import { fresh, webStorage } from "../engine/fresh";
import { newer, stamped, versionOf } from "../engine/stored";
import { PANEL_WIDTH } from "./size";

/**
 * Where the panel's preferences the user set are kept, in `localStorage`, so
 * they hold across reloads and in new tabs of the origin. Reset all leaves them.
 */
export const PREFS_KEY = "devknobs:prefs";

/** The version of the preferences `PREFS_KEY` keeps. Bump it with a new shape, see stored.ts. */
export const PREFS_VERSION = 6;

/** How the styles view shows an element: what applies to it, or every rule in cascade order. */
export type StylesMode = "simple" | "advanced";

/** The mode the styles view starts in. */
export const STYLES_MODE: StylesMode = "simple";

/** Whether the styles view starts with the element's box folded out. */
export const STYLES_BOX = true;

/** Whether the changes of the Elements view start with their diff lines shown. */
export const CHANGES_DIFF = false;

/** How tall the box of the html editor starts, in px. */
export const HTML_HEIGHT = 200;

/**
 * The panel's preferences: whether the handle shows while the panel is
 * closed, how wide the panel is, in px, whatever it shows, the mode of the
 * styles view, whether the box in it is folded out, whether the changes show
 * their diff, and how tall the html editor is, in px, or whether it takes the
 * panel's height. Version 1 kept the handle alone, version 2 had no mode,
 * version 3 had no word on the box, and version 4 none on the diff and the
 * html editor. Up to version 5 the panel had a width for the rows and the
 * settings, `listWidth`, read as the one width, and another for a view,
 * `viewWidth`, which is dropped.
 */
export interface Prefs {
  handle: boolean;
  width: number;
  stylesMode: StylesMode;
  stylesBox: boolean;
  changesDiff: boolean;
  htmlHeight: number;
  htmlFull: boolean;
}

/** How tall the html editor is: its height in px, and whether it takes the panel's height instead. */
export interface HtmlSize {
  height: number;
  full: boolean;
}

/** The preferences the user set, over the mount options. */
export type StoredPrefs = Partial<Prefs>;

/** Read the stored preferences, keeping only the ones that read. */
export function readPrefs(json: string | null | undefined): StoredPrefs {
  let value: unknown = null;
  try {
    value = json ? JSON.parse(json) : null;
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  if (newer(value, PREFS_VERSION)) return {};
  const prefs: StoredPrefs = {};
  const handle: unknown = Reflect.get(value, "handle");
  if (typeof handle === "boolean") prefs.handle = handle;
  const width: unknown = Reflect.get(value, versionOf(value) < 6 ? "listWidth" : "width");
  if (typeof width === "number" && Number.isFinite(width) && width > 0) prefs.width = width;
  const mode: unknown = Reflect.get(value, "stylesMode");
  if (mode === "simple" || mode === "advanced") prefs.stylesMode = mode;
  const box: unknown = Reflect.get(value, "stylesBox");
  if (typeof box === "boolean") prefs.stylesBox = box;
  const diff: unknown = Reflect.get(value, "changesDiff");
  if (typeof diff === "boolean") prefs.changesDiff = diff;
  const height: unknown = Reflect.get(value, "htmlHeight");
  if (typeof height === "number" && Number.isFinite(height) && height > 0) prefs.htmlHeight = height;
  const full: unknown = Reflect.get(value, "htmlFull");
  if (typeof full === "boolean") prefs.htmlFull = full;
  return prefs;
}

/** The preferences in force: one the user set wins over `base`, the mount options. */
export function resolvePrefs(base: Prefs, stored: StoredPrefs): Prefs {
  return { ...base, ...stored };
}

function loadPrefs(): StoredPrefs {
  try {
    return readPrefs(webStorage("local")?.getItem(PREFS_KEY));
  } catch {
    return {};
  }
}

function keepPrefs(prefs: StoredPrefs): void {
  try {
    if (Object.keys(prefs).length === 0) webStorage("local")?.removeItem(PREFS_KEY);
    else webStorage("local")?.setItem(PREFS_KEY, JSON.stringify(stamped(prefs, PREFS_VERSION)));
  } catch {
    // Private mode, disabled storage: the preference holds until the page goes.
  }
}

/** The preferences in force, kept in step with the ones the user sets, here or in another tab. */
export interface LivePrefs {
  get(): Prefs;
  /** Show or hide the handle of a closed panel. One the same as the mount's is not kept. */
  setHandle(on: boolean): void;
  /** Keep the panel's width. The one a panel starts with is not kept. */
  setWidth(px: number): void;
  /** Keep the mode of the styles view. The one it starts in is not kept. */
  setStylesMode(mode: StylesMode): void;
  /** Keep whether the box in the styles view is folded out. The way it starts is not kept. */
  setStylesBox(open: boolean): void;
  /** Keep whether the changes show their diff. The way they start is not kept. */
  setChangesDiff(open: boolean): void;
  /** Keep the html editor's height, in px, and whether it takes the panel's height. The size it starts at is not kept. */
  setHtmlSize(size: HtmlSize): void;
  /** Hear the preferences change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/** The preferences for a mount's options, with the ones the user set on top. */
export function createPrefs(options: { handle?: boolean } = {}): LivePrefs {
  const base: Prefs = {
    handle: options.handle !== false,
    width: PANEL_WIDTH,
    stylesMode: STYLES_MODE,
    stylesBox: STYLES_BOX,
    changesDiff: CHANGES_DIFF,
    htmlHeight: HTML_HEIGHT,
    htmlFull: false,
  };
  let stored = loadPrefs();
  let prefs = resolvePrefs(base, stored);
  const listeners = new Set<() => void>();

  function changed(): void {
    prefs = resolvePrefs(base, stored);
    for (const listener of Array.from(listeners)) listener();
  }

  /** Keep what the user set, and say so. */
  function keep(next: StoredPrefs): void {
    stored = next;
    keepPrefs(stored);
    changed();
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== PREFS_KEY && event.key !== null) return;
    // In fresh mode nothing kept is read: a choice made here holds, whatever another tab keeps.
    if (fresh()) return;
    stored = loadPrefs();
    changed();
  }

  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    get: () => prefs,
    setHandle(on) {
      const next = { ...stored };
      if (on === base.handle) delete next.handle;
      else next.handle = on;
      keep(next);
    },
    setWidth(px) {
      const next = { ...stored };
      if (px === base.width) delete next.width;
      else next.width = px;
      keep(next);
    },
    setStylesMode(mode) {
      const next = { ...stored };
      if (mode === base.stylesMode) delete next.stylesMode;
      else next.stylesMode = mode;
      keep(next);
    },
    setStylesBox(open) {
      const next = { ...stored };
      if (open === base.stylesBox) delete next.stylesBox;
      else next.stylesBox = open;
      keep(next);
    },
    setChangesDiff(open) {
      const next = { ...stored };
      if (open === base.changesDiff) delete next.changesDiff;
      else next.changesDiff = open;
      keep(next);
    },
    setHtmlSize({ height, full }) {
      const next = { ...stored };
      if (height === base.htmlHeight) delete next.htmlHeight;
      else next.htmlHeight = height;
      if (full === base.htmlFull) delete next.htmlFull;
      else next.htmlFull = full;
      keep(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      listeners.clear();
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    },
  };
}
