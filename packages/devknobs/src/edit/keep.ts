/**
 * Edits kept after a reload. With the Elements view's switch on, the edits
 * in force are kept for the page, its address without the query, as plain
 * json: each one's kind, target, property and values, no node of the page.
 * As the page loads again and settles, the kept edits are made again in
 * order, each only where the page still has its target and the value before
 * it, through the same log as the panel's, so undo and the changes list take
 * them as any other. An html or attribute edit, which could change what a
 * script of the page does, is never made as the page loads: it and all after
 * it wait for the user's click on `apply`, as a page script may have planted
 * them. Turning the switch off forgets them. Forced states are no edits, and
 * are never kept, nor are edits made in the width knob's frame, nor one that
 * could run a script (`risk.ts`).
 *
 * Without the extension they are in the page's `localStorage`, one item per
 * page (`EDITS_KEY` and the path), none in fresh mode; the extension keeps
 * them in its own storage through an `EditsStore`. To use it:
 *
 *   const keep = startKeep();      // at mount: replays what the page kept
 *   keep.set(true); keep.on();     // the switch
 *   stopKeep();                    // at unmount, before the edits are undone
 */

import { realNow } from "../engine/clock";
import { webStorage } from "../engine/fresh";
import { newer, stamped } from "../engine/stored";
import { type Edit, type EditKind, type EditLog, type EditPlace, edits } from "./log";
import { riskyEdit } from "./risk";

/** An edit as kept and as `setEdits` takes it: an `edits()` entry, its id left out. */
export type SavedEdit = Omit<Edit, "id">;

/** What is kept for a page: its edits, oldest first, with their version. */
export interface KeptEdits {
  v: number;
  edits: SavedEdit[];
}

/** An edit that was not made again, and why. */
export interface Skipped {
  edit: unknown;
  reason: string;
}

/** What making a list of edits again came to. */
export interface Replayed {
  applied: Edit[];
  skipped: Skipped[];
}

/** Where the edits of a page are kept in `localStorage`, its path after it. */
export const EDITS_KEY = "devknobs:edits:";

/** The version `EDITS_KEY` keeps. Bump it with a new shape, see stored.ts. */
export const EDITS_VERSION = 1;

/** The most edits kept for a page: the first ones, as a later edit goes on from those before. */
export const MAX_EDITS = 200;

/** The most a page's kept edits take, as json, in characters. */
export const MAX_BYTES = 256 * 1024;

/** The most pages edits are kept for: the page kept longest ago goes first. */
export const MAX_PAGES = 20;

/** The longest text one field of a kept edit takes, past which it is not read. */
const FIELD_MAX = 64 * 1024;

const KINDS: readonly EditKind[] = ["css-value", "css-toggle", "css-add", "css-rule", "text", "attr", "html", "hide", "delete", "move"];

/** Why an edit was not made again. */
export const REASONS = {
  invalid: "not an edit devknobs reads",
  missing: "not found on the page",
  rule: "its rule is not on the page",
  changed: "the page has another value now",
  refused: "the page did not take it",
} as const;

function isFields(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = FIELD_MAX): value is string {
  return typeof value === "string" && value.length <= max;
}

function textOrNull(value: unknown): value is string | null {
  return value === null || text(value);
}

function readPlace(value: unknown): EditPlace | null {
  if (!isFields(value) || !text(value.parent) || value.parent === "" || !(value.next === null || (text(value.next) && value.next !== ""))) return null;
  return { parent: value.parent, next: value.next };
}

function readRule(value: unknown): Edit["target"]["rule"] | null {
  if (!isFields(value)) return null;
  const { selectorText, sheet, owner, sheetId, path, context } = value;
  if (!text(selectorText) || !text(sheet) || !textOrNull(owner)) return null;
  if (typeof sheetId !== "number" || !Number.isSafeInteger(sheetId)) return null;
  if (!Array.isArray(path) || path.length > 64 || !path.every((step) => typeof step === "number" && Number.isSafeInteger(step) && step >= 0)) return null;
  if (!Array.isArray(context) || context.length > 64 || !context.every((one) => text(one))) return null;
  return { selectorText, sheet, owner, sheetId, path: path.map(Number), context: context.map(String) };
}

/** One edit in `edits()`'s shape, read field by field, or null where it is not one. Its id, where it has one, is left out. */
export function readSavedEdit(value: unknown): SavedEdit | null {
  if (!isFields(value)) return null;
  const kind = KINDS.find((one) => one === value.kind);
  const target = value.target;
  if (!kind || !isFields(target) || !text(target.selector) || target.selector === "") return null;
  if (!text(value.property) || !textOrNull(value.before) || !textOrNull(value.after)) return null;
  const read: SavedEdit = { kind, target: { selector: target.selector }, property: value.property, before: value.before, after: value.after };
  if (target.source !== undefined) {
    if (!text(target.source)) return null;
    read.target.source = target.source;
  }
  if (target.rule !== undefined) {
    const rule = readRule(target.rule);
    if (!rule) return null;
    read.target.rule = rule;
  }
  if (kind === "move") {
    const from = readPlace(value.from);
    const to = readPlace(value.to);
    if (!from || !to) return null;
    read.from = from;
    read.to = to;
  }
  return read;
}

/**
 * What a page keeps, or null where it keeps nothing devknobs reads: no
 * object, a newer version, too many edits, one that is none, or one that
 * could run a script, which devknobs never keeps, so a script planted it.
 */
export function readKept(value: unknown): KeptEdits | null {
  if (!isFields(value) || newer(value, EDITS_VERSION) || !Array.isArray(value.edits) || value.edits.length > MAX_EDITS) return null;
  const list: SavedEdit[] = [];
  for (const one of value.edits) {
    const read = readSavedEdit(one);
    if (!read || riskyEdit(read)) return null;
    list.push(read);
  }
  return { v: EDITS_VERSION, edits: list };
}

/**
 * Edits as kept: the first that fit in `MAX_EDITS` and `MAX_BYTES`, as the
 * list's json counts them, up to the first that `readSavedEdit` would not
 * read back or that could run a script, and how many more there were. A
 * later edit goes on from those before it, so none past that point is kept.
 */
export function toKept(list: readonly Edit[]): { kept: KeptEdits; cut: number } {
  const kept: SavedEdit[] = [];
  // The list's brackets, and a comma or the closing bracket after each edit.
  let size = 1;
  for (const edit of list) {
    const { id: _id, ...saved } = edit;
    size += JSON.stringify(saved).length + 1;
    if (kept.length >= MAX_EDITS || size > MAX_BYTES || !readSavedEdit(saved) || riskyEdit(saved)) break;
    kept.push(saved);
  }
  return { kept: stamped({ edits: kept }, EDITS_VERSION), cut: list.length - kept.length };
}

/**
 * @internal Where a mount keeps the edits of the page in place of
 * `localStorage`, for the devknobs extension. `load` gives what is kept for
 * this page, read as `readKept` reads it, null for nothing, and undefined
 * until it is known. `save` keeps the edits for this page, or with null
 * forgets them. `subscribe` hears what is kept change and returns the way to stop.
 */
export interface EditsStore {
  load(): unknown;
  save(kept: KeptEdits | null): void;
  subscribe(listener: () => void): () => void;
}

/** When a kept item was written, 0 where it does not say. */
function writtenAt(text: string | null): number {
  try {
    const at: unknown = text ? Reflect.get(Object(JSON.parse(text)), "at") : 0;
    return typeof at === "number" ? at : 0;
  } catch {
    return 0;
  }
}

/** The other pages kept, newest first, never `kept`. */
function otherPages(storage: Storage, kept: string): string[] {
  const pages: { key: string; at: number }[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(EDITS_KEY) && key !== kept) pages.push({ key, at: writtenAt(storage.getItem(key)) });
  }
  return pages.sort((a, b) => b.at - a.at).map((page) => page.key);
}

/** Forget the pages kept longest ago, past `MAX_PAGES`, never `kept`, the one just written. */
function evict(storage: Storage, kept: string): void {
  for (const key of otherPages(storage, kept).slice(MAX_PAGES - 1)) storage.removeItem(key);
}

/** Write a page's item; where the storage is full, forget the pages kept longest ago, one at a time, until it fits. */
function write(storage: Storage, key: string, text: string): void {
  const older = otherPages(storage, key);
  for (;;) {
    try {
      storage.setItem(key, text);
      return;
    } catch (error) {
      const oldest = older.pop();
      if (!oldest) throw error;
      storage.removeItem(oldest);
    }
  }
}

/** The page's path now, `/` where it has none to read. */
function pathNow(): string {
  try {
    return window.location?.pathname ?? "/";
  } catch {
    return "/";
  }
}

/**
 * The page's own `localStorage`, an item per path. The path is the one the
 * page loaded at, read once, so a move of the app's router to another path
 * keeps and forgets the edits of the page they were made on. In fresh mode
 * nothing is read or written.
 */
export function localEditsStore(path: string = pathNow()): EditsStore {
  const pageKey = (): string => `${EDITS_KEY}${path}`;
  return {
    load() {
      try {
        const kept = webStorage("local")?.getItem(pageKey());
        return kept ? JSON.parse(kept) : null;
      } catch {
        return null;
      }
    },
    save(kept) {
      const storage = webStorage("local");
      if (!storage) return;
      try {
        if (kept === null) storage.removeItem(pageKey());
        else {
          write(storage, pageKey(), JSON.stringify({ ...kept, at: realNow() }));
          evict(storage, pageKey());
        }
      } catch {
        // Private mode, a full storage: the edits hold until the page goes.
      }
    },
    subscribe(listener) {
      const onStorage = (event: StorageEvent): void => {
        if (event.key === null || event.key === pageKey()) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}

/** What making kept edits again came to, with those that wait for the user. */
export interface Replaying extends Replayed {
  /** The edits from the first one that waits for the user's click on: an html or attribute edit. */
  waiting: SavedEdit[];
}

/** Makes kept edits again on the page, through the log. With `hold`, an html or attribute edit and all after it wait. */
export type Replay = (log: EditLog, list: readonly unknown[], hold: boolean) => Replaying;

/** What the replay on load came to: how many edits were made again, and those that were not. */
export interface Restored {
  kept: number;
  missed: Skipped[];
}

export interface Keeper {
  /** Whether the page keeps its edits: the switch. */
  on(): boolean;
  /** Turn the switch on, which keeps the edits in force now, or off, which forgets them, those that wait too. */
  set(on: boolean): void;
  /** What the replay on load came to, or null where none ran. */
  restored(): Restored | null;
  /**
   * The kept edits that wait for the user: from the first html or attribute
   * edit on, which could change what a script of the page does, so none is
   * made as the page loads. Until they are made, nothing new is kept.
   */
  waiting(): readonly SavedEdit[];
  /** Make the edits that wait. Only for a trusted click on the panel's own button. */
  applyWaiting(): void;
  /** How many edits in force are kept. */
  kept(): number;
  /** How many edits in force are past the caps, and not kept. */
  cut(): number;
  /** Hear the switch, the replay or the cut change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  stop(): void;
}

export interface KeeperOptions {
  log: EditLog;
  store: EditsStore;
  /** The page's window: an edit made in another, as the width knob's frame, is not kept. */
  view: Window;
  /** Loads what makes edits again. Defaults to `replay.ts`, loaded once there is something to make. */
  replay?: () => Promise<Replay>;
  /** Waits for the page to be loaded and still. */
  settled?: () => Promise<void>;
}

/** On the page's window once its kept edits were made again, until they are undone with the panel's unmount. */
const REPLAYED = Symbol.for("devknobs.edits.replayed");

/** How long the page has to be still before kept edits are made again, and the longest it is waited for, in ms. */
export const QUIET = 300;
export const SETTLE_MAX = 3000;

/** The page loaded, and nothing on it changed for `quiet` ms, or `longest` ms went by: a framework has drawn it. */
export function settled(view: Window, quiet = QUIET, longest = SETTLE_MAX): Promise<void> {
  return new Promise((resolve) => {
    const watch = (): void => {
      let timer = 0;
      const done = (): void => {
        observer?.disconnect();
        view.clearTimeout(timer);
        view.clearTimeout(limit);
        resolve();
      };
      const observer =
        typeof MutationObserver === "function"
          ? new MutationObserver(() => {
              view.clearTimeout(timer);
              timer = view.setTimeout(done, quiet);
            })
          : null;
      observer?.observe(view.document.documentElement, { childList: true, subtree: true });
      timer = view.setTimeout(done, quiet);
      const limit = view.setTimeout(done, longest);
    };
    if (view.document.readyState === "complete") watch();
    else view.addEventListener("load", watch, { once: true });
  });
}

export function createKeeper(options: KeeperOptions): Keeper {
  const { log, store, view } = options;
  const loadReplay = options.replay ?? (() => import("./replay").then(({ replayEdits }) => replayEdits));
  const wait = options.settled ?? (() => settled(view));
  const listeners = new Set<() => void>();
  let known = false;
  let on = false;
  let restored: Restored | null = null;
  let waiting: SavedEdit[] = [];
  /** What makes edits again, once loaded, for those that wait. */
  let run: Replay | null = null;
  let kept = 0;
  let cut = 0;
  /** The kept edits wait to be made again, or are being made: nothing is kept meanwhile. */
  let pending = false;
  /** The edits changed while pending: they are kept once it ends. */
  let dirty = false;
  let stopped = false;

  function tell(): void {
    for (const listener of Array.from(listeners)) listener();
  }

  /** The edits in force made on this page, as recorded, and not in another window. */
  function keepable(): Edit[] {
    const recorded = log.recorded();
    return log.list().filter((_edit, at) => {
      const made = recorded[at]?.view;
      return !made || made === view;
    });
  }

  /** Keep the edits in force, unless kept edits are still to be made, which would be lost. */
  function save(): void {
    if (pending || waiting.length > 0) {
      dirty = true;
      return;
    }
    dirty = false;
    const list = keepable();
    const result = toKept(list);
    kept = result.kept.edits.length;
    cut = result.cut;
    try {
      store.save(result.kept);
    } catch {
      // A store that went, as an extension reloaded: the edits hold until the page goes.
    }
  }

  /** Make edits again through the log, and add what came of it to what the panel says. */
  function make(replay: Replay, list: readonly unknown[], hold: boolean): void {
    let result: Replaying;
    // The edits it makes are those kept already: only a change of the user's meanwhile is new.
    const changed = dirty;
    pending = true;
    try {
      result = replay(log, list, hold);
    } finally {
      pending = false;
      dirty = changed;
    }
    waiting = result.waiting;
    restored = { kept: (restored?.kept ?? 0) + result.applied.length, missed: [...(restored?.missed ?? []), ...result.skipped] };
    // Those not made stay kept until the next change; the ones that waited, once made, are kept in the order they were made.
    if (on && (dirty || !hold)) save();
    tell();
  }

  async function replay(list: SavedEdit[]): Promise<void> {
    pending = true;
    try {
      await wait();
      const loaded = await loadReplay();
      if (stopped) return;
      Reflect.set(view, REPLAYED, true);
      run = loaded;
      make(loaded, list, true);
    } catch {
      // What makes them again did not load: the page stays as it was written, and the next mount tries again.
      pending = false;
      if (dirty && on && !stopped) save();
    }
  }

  function heard(): void {
    let value: unknown;
    try {
      value = store.load();
    } catch {
      value = null;
    }
    if (value === undefined) return;
    const read = readKept(value);
    on = read !== null;
    if (!known) {
      known = true;
      if (read && read.edits.length > 0 && Reflect.get(view, REPLAYED) !== true) void replay(read.edits);
    }
    if (!on) {
      restored = null;
      waiting = [];
    }
    tell();
  }

  const stopStore = store.subscribe(heard);
  const stopLog = log.subscribe(() => {
    if (on && known) save();
    // The cut is told whatever the switch: it shows only while it is on.
    tell();
  });
  heard();

  return {
    on: () => on,
    set(next) {
      if (!known) return;
      on = next;
      if (next) save();
      else {
        restored = null;
        waiting = [];
        cut = 0;
        try {
          store.save(null);
        } catch {
          // As above.
        }
      }
      tell();
    },
    restored: () => restored,
    waiting: () => waiting,
    applyWaiting() {
      if (!run || waiting.length === 0 || pending) return;
      make(run, waiting, false);
    },
    kept: () => (on ? kept : 0),
    cut: () => (on ? cut : 0),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      stopped = true;
      stopStore();
      stopLog();
      listeners.clear();
    },
  };
}

let running: Keeper | null = null;

/** Start keeping the page's edits, in `store` or the page's `localStorage`, and make those it kept again. */
export function startKeep(store: EditsStore = localEditsStore()): Keeper {
  running?.stop();
  running = createKeeper({ log: edits, store, view: window });
  return running;
}

/** Stop keeping them: what the page does to its edits from now on is not kept. */
export function stopKeep(): void {
  running?.stop();
  running = null;
}

/** The page's kept edits were undone: the next mount makes them again. */
export function forgetReplay(): void {
  if (typeof window !== "undefined") Reflect.deleteProperty(window, REPLAYED);
}

/** The keeper of the page, or null while devknobs is not mounted. */
export function keeper(): Keeper | null {
  return running;
}
