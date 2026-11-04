import * as engine from "./engine";
import { checkPatch } from "./engine/check";
import { describe as describeKnobs, type KnobDescription } from "./engine/describe";
import { DEVICES } from "./engine/devices";
import { isDevknobsFrame } from "./engine/frame";
import { GEO_PRESETS } from "./engine/geo";
import { LOCALE_PRESETS } from "./engine/locale";
import { TIME_ZONE_PRESETS } from "./engine/time";
import { UA_PRESETS } from "./engine/ua";
import { type EditsStore, forgetReplay, type Replayed, startKeep, stopKeep } from "./edit/keep";
import { type Edit, edits as editLog } from "./edit/log";
import { clearForced, type ForcedState, forceState as forceOn } from "./styles/force";
import { createGrab, type GrabControl } from "./grab/control";
import { createInspect, type InspectControl, oneAtATime } from "./grab/inspect";
import type { GrabOptions, GrabResult } from "./grab/types";
import {
  type HostBuild,
  type HostRank,
  outranks,
  pageChoices,
  type PreferSetting,
  type PreferValue,
  preferOf,
  rankOf,
  stepsAside,
  stoodDownNote,
  takesBack,
} from "./host";
import { claim, expose, free, type Host, hostOf, owned, superseded, type Take, withdraw } from "./instance";
import { applyOnLoad } from "./storage/onload";
import type { DevknobsState, DevknobsStatePatch, GrabColorValue } from "./types";
import { createKeys, type KeysStore, type LiveKeys } from "./ui/bindings";
import { runtimeLabel } from "./ui/footer";
import { forwardKeys } from "./ui/keys";
import { createPanel, type Panel, type PanelPrefer } from "./ui/panel";
import { VERSION } from "./version";

export type {
  BarsValue,
  BrowserValue,
  ClockMode,
  ClockValue,
  ConnectionValue,
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DevIconValue,
  DirValue,
  DprValue,
  EdgeValue,
  GeoErrorValue,
  GeoValue,
  GrabColorValue,
  HeightValue,
  Knob,
  LocaleValue,
  MotionValue,
  NetworkValue,
  OnlineValue,
  OrientationValue,
  PanelValue,
  SaveDataValue,
  SchemeValue,
  SideValue,
  SpeedValue,
  TextValue,
  TimeZoneValue,
  TransparencyValue,
  UaValue,
  VisionValue,
  WidthValue,
  ZoomValue,
} from "./types";
export type {
  KnobDescription,
  KnobField,
  KnobReload,
  KnobShape,
  KnobValue,
} from "./engine/describe";
export type { DeviceKind, DevicePreset } from "./engine/devices";
export type { Edit, EditKind, EditPlace, EditTarget } from "./edit/log";
export type { Replayed, SavedEdit, Skipped } from "./edit/keep";
export type { ForcedState } from "./styles/force";
export type { GeoPreset } from "./engine/geo";
export type { UaBrand, UaHints, UaPreset } from "./engine/ua";
export type { EngineOptions } from "./engine";
export type { FrameRefusal, NativeDriver, NativeMedia, NativeSetting, NativeUa, NativeViewport } from "./engine/native";
export type { SystemMedia } from "./engine/system";
export type { HostBuild, PreferSetting, PreferValue } from "./host";
/** @internal For the devknobs extension, with `keysStore`: not public api. */
export type { KeysStore, StoredKeys } from "./ui/bindings";
/** @internal For the devknobs extension, with `editsStore`: not public api. */
export type { EditsStore, KeptEdits } from "./edit/keep";
export type {
  GrabEntry,
  GrabFrame,
  GrabOptions,
  GrabPayload,
  GrabResult,
  ResolvedSource,
} from "./grab/types";

export interface MountOptions extends engine.EngineOptions {
  /**
   * The letter that with shift toggles the panel. Defaults to `k`. A key the
   * user sets in the panel wins over it.
   */
  hotkey?: string;
  /** Start the panel open or closed. Defaults to the stored state, closed at first. */
  open?: boolean;
  /** Press a key to grab elements for an agent. Defaults to true. */
  grab?: boolean;
  /**
   * The key that grabs, such as `alt+shift+g`. Defaults to `shift+g`. A key
   * the user sets in the panel wins over it.
   */
  grabKey?: string;
  /**
   * The color grab draws its boxes in. Defaults to the stored one, `auto` at
   * first: blue, and green where the page behind the element is blue.
   */
  grabColor?: GrabColorValue;
  /**
   * Show the handle on the window's edge while the panel is closed. Defaults
   * to true. With false, the panel key opens it. What the user sets in the
   * panel's settings wins over it.
   */
  handle?: boolean;
  /**
   * Mount as the page's host, as the devknobs extension does. A copy the page
   * mounts later does not take over: its `hotkey`, `grabKey`, `grab`, `open`
   * and `grabColor` go to this one, and its `unmount` leaves this one up.
   * Defaults to false.
   */
  host?: boolean;
  /**
   * For a host: who runs the panel where the page mounts its own copy, its
   * choice in the panel's settings and the footer naming the copy that runs.
   * With `page`, a copy the page mounts takes the page from this one, now or
   * once `setPrefer` says so, and this one does not take it back.
   */
  prefer?: PreferSetting;
  /**
   * For a host: which build it is. Where two hosts meet on a page, such as a
   * store and a local build of the extension, the one that ranks higher holds
   * it whichever mounted first, and the other stands down for that page load:
   * a local build over a store one, then the newer version. A host with none
   * takes the page as before, from any copy.
   */
  build?: HostBuild;
  /** For a host with a `build`: it stood down for another host, which holds the page for this load. */
  stoodDown?: () => void;
  /**
   * @internal For the devknobs extension: where the keys the user sets are
   * kept in place of the page's `localStorage`, so they are the same on every
   * site. Not public api: it may change in any release.
   */
  keysStore?: KeysStore;
  /**
   * @internal For the devknobs extension: where the edits kept after a
   * reload are kept in place of the page's `localStorage`. Not public api:
   * it may change in any release.
   */
  editsStore?: EditsStore;
}

export const PRESETS = {
  locale: LOCALE_PRESETS,
  geo: GEO_PRESETS,
  timeZone: TIME_ZONE_PRESETS,
  ua: UA_PRESETS,
  device: DEVICES,
};

let panel: Panel | null = null;
let stopKeys: (() => void) | null = null;
let grabControl: GrabControl | null = null;
let inspectControl: InspectControl | null = null;
let keys: LiveKeys | null = null;
/** The options of the mount in force, with what a host took from the page's on top. Null unmounted. */
let mounted: MountOptions | null = null;
/** The host this copy's mount deferred to. Its calls go there while that host holds the page. */
let hostedBy: Host | null = null;

/** How often a host takes the page back from copies that know no hosts, before it lets them have it. */
const RETAKES = 3;
let retaken = 0;

/** A host's preference now: its mount's, then what `setPrefer` brings. Null for a copy that is no host. */
let preferNow: PreferValue | null = null;
/** The way a page copy that deferred to this host left to take the page, should it step aside. */
let waiting: Take | null = null;
/** This copy's mount that deferred to a host, until it takes the page from it or unmounts. */
let deferred: MountOptions | null = null;
/**
 * The preference a host handed this copy as it stepped aside, kept for the
 * page's next mount of it, such as a remount on a hot update, until it defers to a host again.
 */
let handedPrefer: PreferSetting | null = null;
/** The host that stood down for this one on this page load, for the footer: its rank, null for an older host. */
let beaten: { other: HostRank | null } | null = null;

/**
 * Start the knobs and put the panel on the page. Patches go in right away, even
 * mid-parse, so that a theme script running before `DOMContentLoaded` sees the
 * emulated values. The panel host waits for the body. Inside the width knob's
 * frame there is no panel: the page above has it, and gets the frame's keys.
 * A second copy of devknobs on the page, such as a hot update loads, takes
 * over from the first, which unmounts. Where a host holds the page, such as
 * the extension's copy, it takes this mount's choices instead.
 */
export function mount(options: MountOptions = {}): void {
  if (panel || stopKeys) return;
  const host = options.host ? null : hostOf(window);
  if (host) {
    handedPrefer = null;
    hostedBy = host;
    deferred = options;
    const take: Take = Object.assign((handed: object) => takeFrom(options, handed), {
      pending: () => deferred === options && !panel && !stopKeys,
    });
    host.adopt(options, take);
    return;
  }
  if (options.host && options.build) {
    const holder = hostOf(window);
    if (holder && !beats(options.build, holder)) {
      standDown(options, holder);
      return;
    }
    if (holder) beaten = { other: rankOf(holder) };
  }
  // A copy that is no host shows the preference it was handed, as it was handed.
  preferNow = options.host ? (options.prefer?.value ?? null) : null;
  if (!options.host && !options.prefer && handedPrefer) options = { ...options, prefer: handedPrefer };
  // Before anything else: the presets marked to apply on load, unless the early script did.
  applyOnLoad();
  if (options.host) claim(window, unmount, adopt, api, options.build ? { rank: rankFor(options.build), outranked } : {});
  else claim(window, unmount);
  expose(window, api);
  engine.start(options);
  mounted = options;
  attach(options);
  // The edits kept for the page, made again once it settles. The width knob's frame keeps none.
  if (!isDevknobsFrame()) startKeep(options.editsStore);
}

/** The panel, its keys, grab and inspect, for the engine that runs. */
function attach(options: MountOptions): void {
  // The mount's keys, with the ones the user set in the panel on top.
  const live = createKeys({
    hotkey: options.hotkey,
    grabKey: options.grabKey,
    grab: options.grab !== false,
    store: options.keysStore,
  });
  keys = live;
  // Ahead of the panel's keys, so escape ends grab before it closes the panel.
  // A key the panel records is never grab's.
  if (options.grab !== false) {
    grabControl = createGrab({ key: () => (live.recording ? null : live.get().grab) });
  }
  // Inspect is the same picking with another end, so one of the two is on at a time.
  const inspect = createInspect({ key: () => (live.recording ? null : live.get().inspect) });
  inspectControl = inspect;
  if (grabControl) oneAtATime(grabControl, inspect);
  if (isDevknobsFrame()) {
    stopKeys = forwardKeys(live.get, () => engine.getState().panel.open);
    return;
  }
  choose(options);
  panel = createPanel({
    keys: live,
    grab: grabControl,
    inspect,
    handle: options.handle,
    prefer: panelPrefer(options),
  });
}

/** The preference's row in the settings and the footer's name for this copy, where there is a preference. */
function panelPrefer(options: MountOptions): PanelPrefer | undefined {
  const setting = options.prefer;
  if (!setting) return undefined;
  return {
    value: () => preferNow ?? setting.now?.() ?? setting.value,
    change: (value) => {
      // The host hears it first, as with the native switch.
      setting.change(value);
      setPrefer(value);
    },
    runtime: [runtimeLabel(options.host === true, VERSION), ...(options.host && beaten ? [stoodDownNote(beaten.other)] : [])].join(" · "),
  };
}

/** This copy's rank as a host of `build`. */
function rankFor(build: HostBuild): HostRank {
  return { build, version: VERSION };
}

/**
 * Does this copy, a host of `build`, outrank `holder`? A rank this version cannot read, a
 * newer build's say, outranks it, so two hosts never take the page from each other in turn.
 */
function beats(build: HostBuild, holder: Host): boolean {
  const theirs = rankOf(holder);
  if (!theirs && holder.rank !== undefined) return false;
  return outranks(rankFor(build), theirs);
}

/** A host that outranks this one holds the page: hold nothing on this load, and let both say so. */
function standDown(options: MountOptions, holder: Host): void {
  options.stoodDown?.();
  if (options.build) holder.outranked?.(rankFor(options.build));
}

/** A host stood down for this one: the footer names it. */
function outranked(other: object): void {
  beaten = { other: rankOf({ rank: other }) };
  if (!mounted || !panel) return;
  detach();
  attach(mounted);
}

/** A host stepped aside for this copy: mount as on a page with no host, its preference in the settings. */
function takeFrom(options: MountOptions, handed: object): boolean {
  if (deferred !== options || panel || stopKeys || hostOf(window)) return false;
  deferred = null;
  hostedBy = null;
  const prefer = preferOf(handed);
  handedPrefer = prefer;
  mount(prefer ? { ...options, prefer } : options);
  return true;
}

/** Open or close the panel and set grab's color, where the options say. */
function choose(options: MountOptions): void {
  if (options.open !== undefined) engine.setState({ panel: { open: options.open } });
  if (options.grabColor !== undefined) engine.setState({ grabColor: options.grabColor });
}

function detach(): void {
  panel?.destroy();
  panel = null;
  grabControl?.destroy();
  grabControl = null;
  inspectControl?.destroy();
  inspectControl = null;
  stopKeys?.();
  stopKeys = null;
  keys?.destroy();
  keys = null;
}

/**
 * A host's side of a page's mount: step aside for it where the user prefers
 * the page's, or take its choices, with a new panel where the keys or grab change.
 */
function adopt(options: object, take?: Take): void {
  if (!mounted) return;
  if (typeof take === "function") waiting = take;
  if (stepsAside(preferNow, waiting)) {
    handOver();
    return;
  }
  const chosen = pageChoices(options);
  const rebuild = (["hotkey", "grabKey", "grab"] as const).some(
    (key) => chosen[key] !== undefined && chosen[key] !== mounted?.[key],
  );
  mounted = { ...mounted, ...chosen };
  if (!rebuild) {
    if (!isDevknobsFrame()) choose(chosen);
    return;
  }
  detach();
  attach(mounted);
}

/**
 * Let the page go to the page copy that waits, and hand it the preference.
 * Where it does not take the page, the host mounts again, its switch as it was.
 */
/** The panel goes to another copy, which leaves the page's edits on it. */
let handing = false;

function handOver(): void {
  const take = waiting;
  const options = mounted;
  if (!take || !options?.host) return;
  // A page copy that unmounted since it deferred takes nothing: the host stays.
  const pending: unknown = Reflect.get(take, "pending");
  if (typeof pending === "function" && Reflect.apply(pending, take, []) !== true) {
    waiting = null;
    return;
  }
  const native = engine.nativeSwitch();
  // The page keeps its edits: the copy that takes it, or this one again, goes on from them.
  handing = true;
  try {
    unmount();
  } finally {
    handing = false;
  }
  const prefer = options.prefer;
  let took = false;
  try {
    took = take(prefer ? { prefer: { value: "page", change: prefer.change, now: prefer.now } } : {}) === true;
  } catch {
    // A copy that broke as it mounted leaves the page to the host.
  }
  if (took) return;
  if (native && !native.on) engine.setNative(false, native.note);
  mount(current(options));
}

/** A host's options with its preference as it is now, to mount with again. */
function current(options: MountOptions): MountOptions {
  return options.prefer && preferNow ? { ...options, prefer: { ...options.prefer, value: preferNow } } : options;
}

/**
 * The host's preference changed, or came in after its mount: with `page`, it
 * steps aside at once for a page copy that waits. The settings show it.
 */
export function setPrefer(value: PreferValue): void {
  preferNow = value;
  panel?.drawPrefer();
  if (mounted?.host && stepsAside(value, waiting)) handOver();
}

/** Remove the panel and undo every knob. A copy that was taken over has done so already. */
export function unmount(): void {
  hostedBy = null;
  deferred = null;
  waiting = null;
  if (superseded(window, unmount)) return;
  detach();
  // Before the edits are undone, so that is not kept for the page.
  stopKeep();
  // The page goes back to how it was written, unless the panel is only handed over.
  if (!handing) {
    editLog.undoAll();
    forgetReplay();
    clearForced();
  }
  // A host keeps its switch's choice through a take-back: off stays off.
  const native = mounted?.host ? engine.nativeSwitch() : null;
  engine.stop();
  withdraw(window, api);
  free(window, unmount);
  const was = mounted;
  mounted = null;
  // A host taken over by a copy that knows no hosts, such as an older one the
  // page loads, takes the page back once that copy is in.
  if (was?.host) queueMicrotask(() => retake(was, native));
}

function retake(options: MountOptions, native: { on: boolean; note: string | null } | null): void {
  if (mounted || !owned(window)) return;
  const holder = hostOf(window);
  // Another host took the page: where this one outranks it, such as an older
  // build that takes the page from any copy, it takes the page back; else it stands down.
  if (holder) {
    if (!options.build) return;
    if (!beats(options.build, holder)) {
      standDown(options, holder);
      return;
    }
    if (native && !native.on) engine.setNative(false, native.note);
    mount(current(options));
    return;
  }
  // The user prefers the page's copy: it keeps the page.
  if (!takesBack(preferNow)) {
    options.prefer?.yielded?.();
    return;
  }
  if (retaken++ >= RETAKES) {
    if (retaken === RETAKES + 1) {
      console.warn("devknobs: this page runs its own copy of devknobs, which does not know hosts; it keeps the page");
    }
    return;
  }
  // Before the mount, so the driver is never handed the knobs the page emulates.
  if (native && !native.on) engine.setNative(false, native.note);
  mount(current(options));
}

/**
 * The host's own `name`, while this copy's mount deferred to a host that still
 * holds the page, so the page's calls move the host's knobs. Null otherwise.
 */
function hosted<K extends keyof DevknobsApi>(name: K): DevknobsApi[K] | null {
  if (!hostedBy) return null;
  const host = hostOf(window);
  if (!host?.api || host.release !== hostedBy.release) return null;
  const found: unknown = Reflect.get(host.api, name);
  return typeof found === "function" ? (found as DevknobsApi[K]) : null;
}

/**
 * The user's own scheme and motion, for the panel and grab, from a host whose
 * `native` media hides them from every media query in the tab. Null goes back
 * to those queries.
 */
export { setSystemMedia } from "./engine/system";
export { holdInTopLayer, LAYER, type TopLayerHold } from "./engine/toplayer";

/**
 * Turn the `native` driver off or on, every knob kept: off, the page emulates
 * them as with no driver. For a host that keeps the choice of its `setting`
 * switch. `note` shows on that switch, such as why it went off.
 */
export const setNative = engine.setNative;

export function getState(): DevknobsState {
  return (hosted("getState") ?? engine.getState)();
}

/**
 * Apply a patch of knobs. A knob or a field the state does not have, or a
 * value it does not take, throws a TypeError, and then nothing changes. The
 * whole of `getState()` goes back in.
 */
export function setState(patch: DevknobsStatePatch): DevknobsState {
  const host = hosted("setState");
  if (host) return host(patch);
  checkPatch(patch);
  return engine.setState(patch);
}

export function reset(): void {
  (hosted("reset") ?? engine.reset)();
}

export function replay(): void {
  (hosted("replay") ?? engine.replay)();
}

export function ready(): Promise<DevknobsState> {
  return (hosted("ready") ?? engine.ready)();
}

export function describe(): KnobDescription[] {
  return (hosted("describe") ?? describeKnobs)();
}

/**
 * Copy what an agent needs to find the elements in the code: their html, the
 * components that rendered them and where. Takes an element, an array or a
 * NodeList of them. Loads on first use, so the page never pays for it until
 * then. The payload comes back even when the copy fails, with `copied` false. Entries that are
 * not elements, such as a `querySelector` that found nothing, are skipped.
 * Null when the elements gave nothing.
 */
export async function grab(
  elements?: Element | Iterable<Element | null | undefined> | null,
  options?: GrabOptions,
): Promise<GrabResult | null> {
  const host = hosted("grab");
  if (host) return host(elements, options);
  const loaded = await import("./grab");
  return loaded.grab(elements, options);
}

/**
 * The edits made in inspect's Elements view that are in force, oldest first,
 * as plain data: each one's kind, the element's selector, its source file and
 * line where grab finds it, the rule and stylesheet, the property and its
 * value before and after (null where it is not set). An html edit has in
 * place of a css property `text` (`text 2` and on), the attribute's name,
 * `html`, `hidden` or `node`, and a delete of a text or a comment `text` or
 * `comment`. A move has `node`, and `from` and `to`, the places as selectors. Undo and the panel's
 * reset take edits back, and so does `unmount`. `reset()` leaves them, so an
 * agent can loop over conditions with the edits on.
 */
export function edits(): Edit[] {
  return (hosted("edits") ?? editLog.list)();
}

/**
 * Make edits on the page from their plain data, in the shape `edits()` gives,
 * oldest first: an agent can read `edits()`, save the list, and make the same
 * edits again with this on a fresh load. Each edit is made only where its
 * element is found by its selector (and its rule by its selector, what it
 * sits in and its stylesheet) and the value there is still its `before`.
 * They go to the same log as the panel's, so the panel lists them and undo
 * takes them back. Resolves to the edits made and those skipped, each with
 * why. Not a list throws a TypeError.
 */
export async function setEdits(list: readonly unknown[]): Promise<Replayed> {
  const host = hosted("setEdits");
  if (host) return host(list);
  if (!Array.isArray(list)) throw new TypeError("devknobs.setEdits takes a list of edits, as edits() gives them");
  const { replayEdits } = await import("./edit/replay");
  return replayEdits(editLog, list);
}

/** Undo the last edit in force, as Z does in the panel. Returns it, or null with none. */
export function undoEdit(): Edit | null {
  return (hosted("undoEdit") ?? editLog.undo)();
}

/**
 * Force states on an element, so it renders as if hovered, focused or
 * pressed, for a screenshot of that state: `hover`, `focus`,
 * `focus-visible`, `active` and `focus-within`, with or without the colon.
 * Takes the element or a selector for it. One element at a time: the states
 * on another come off first, and with no states, or no element found,
 * nothing is forced. Returns the states forced. Not an edit, so not in
 * `edits()`; the panel's reset and `unmount` take them off, `reset()` leaves them.
 */
export function forceState(target: Element | string | null, states: readonly string[] = []): ForcedState[] {
  const host = hosted("forceState");
  if (host) return host(target, states);
  const element = typeof target === "string" ? document.querySelector(target) : target;
  return forceOn(element, states);
}

const api = { mount, unmount, getState, setState, reset, replay, grab, describe, ready, edits, setEdits, undoEdit, forceState };

/** What `mount` puts at `window.devknobs`, for agents that run code in the page. */
export type DevknobsApi = typeof api;

declare global {
  interface Window {
    devknobs?: DevknobsApi;
  }
}
