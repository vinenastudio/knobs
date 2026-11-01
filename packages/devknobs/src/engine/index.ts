import type { DevknobsState, DevknobsStatePatch } from "../types";
import * as requests from "../requests";
import { hasTouch } from "./devices";
import {
  EXITED,
  type FrameNavigation,
  framed,
  isDevknobsFrame,
  leaveFor,
  nativeScheme,
  needsFrame,
  post,
  readMessage,
} from "./frame";
import * as geo from "./geo";
import * as header from "./header";
import * as locale from "./locale";
import * as media from "./media";
import {
  drive,
  driveUa,
  enableNative,
  framing,
  inPage,
  type NativeDriver,
  nativeEnabled,
  type NativeSetting,
  nativeViewport,
  release,
} from "./native";
import * as network from "./network";
import * as outlines from "./outlines";
import * as overflow from "./overflow";
import * as pseudo from "./pseudo";
import { whenSettled } from "./ready";
import { replay as replayAnimations } from "./replay";
import * as screen from "./screen";
import * as scrollbars from "./scrollbars";
import { resume as resumeScroll } from "./scrollkeep";
import * as spacing from "./spacing";
import * as tabIcon from "./tabicon";
import * as speed from "./speed";
import { DEFAULT_STATE, keepPlace as keepPlaceOf, load, merge, resetState, save } from "./store";
import * as text from "./text";
import * as time from "./time";
import * as touch from "./touch";
import * as touchPointer from "./touchpointer";
import * as ua from "./ua";
import * as width from "./frames";

export interface EngineOptions {
  /** Keep the knobs in sessionStorage across reloads. Defaults to true. */
  persist?: boolean;
  /** Knobs to apply on top of the stored state. */
  state?: DevknobsStatePatch;
  /**
   * A host that sets text size, offline, the prefers knobs or the viewport
   * for real. Those knobs leave the page alone and go to it instead.
   */
  native?: NativeDriver;
}

export type Listener = (state: DevknobsState) => void;

let state: DevknobsState = { ...DEFAULT_STATE };
let persist = true;
let running = false;
let native: NativeDriver | null = null;
/** Why the driver last went off or on, for the panel, null with nothing to say. */
let nativeNote: string | null = null;
/** Running inside the width knob's frame, where the page above drives the knobs. */
let inFrame = false;
let stopRelay: (() => void) | null = null;
/** Says the panel is on its way out or away, null with no panel. */
let panelMoving: (() => boolean) | null = null;
const listeners = new Set<Listener>();

export function getState(): DevknobsState {
  return state;
}

/** Hear about every knob change, whoever made it. Returns the way to stop. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The driver in force: none while its switch is off. */
function driver(): NativeDriver | null {
  return nativeEnabled() ? native : null;
}

export function applyState(next: DevknobsState): void {
  const before = state.panel.realPhone;
  state = inFrame ? framed(next) : next;
  // The host keeps real phone mode for every tab: it hears each turn the page makes.
  if (running && !inFrame && native?.realPhone && before !== state.panel.realPhone) native.realPhone(state.panel.realPhone);
  const active = driver();
  // What a native driver takes stays out of the page.
  const page = inPage(state, active);
  // In a frame that gets the scheme natively, the rewrite and the patch step aside.
  const scheme = inFrame && nativeScheme(page.scheme) ? "system" : page.scheme;
  // The frame is the device's screen, so its touch screen goes there.
  const touchScreen = inFrame && hasTouch(state.device);
  // A host that sizes the tab gives its touch screen the pointer media, the
  // touch points and the finger; the browser adds `ontouchstart` only on a load.
  const nativeTouch = !inFrame && active?.viewport !== undefined && nativeViewport(state)?.touch === true;
  media.apply({
    scheme,
    motion: page.motion,
    contrast: page.contrast,
    transparency: page.transparency,
    touch: touchScreen,
  });
  // A ua preset reports `maxTouchPoints` for its own browser, so the touch
  // screen only does while the ua knob has none.
  touch.apply({
    on: touchScreen || nativeTouch,
    points: !nativeTouch && ua.uaPreset(state.ua.preset) === undefined,
  });
  touchPointer.apply(touchScreen && state.touchPointer);
  screen.apply(inFrame ? screen.screenSizeOf(state) : null);
  scrollbars.apply(touchScreen);
  speed.apply(state.speed);
  locale.apply(state.locale);
  pseudo.apply(state.pseudo);
  geo.apply(state.geo);
  time.apply(time.resolveTimeZone(state.timeZone, state.geo), state.clock);
  header.apply(state.clock);
  network.apply(page.network);
  text.apply(page.text);
  // The page above drives the tab its frame is in.
  if (active && !inFrame) drive(active, state);
  else if (native && !inFrame) driveUa(native, state);
  spacing.apply(state.spacing);
  // A size the driver sets brings no frame up.
  const sized = inFrame ? state : framing(state, active);
  // The page around the frame stays the real browser: the copy inside is the device.
  ua.apply(!inFrame && needsFrame(sized) ? DEFAULT_STATE.ua : state.ua);
  width.apply(sized);
  // While the frame is up, the copy inside it looks at the page at that width.
  overflow.apply(state.overflow && !needsFrame(sized));
  outlines.apply(state.outlines);
  tabIcon.apply(!inFrame && tabIcon.shownHere(state.panel.devIcon));
  if (persist) save(state);
  width.sync(sized);
  for (const listener of Array.from(listeners)) listener(state);
}

/**
 * Turn the host's driver off or on, every knob kept. Off, it is handed its
 * defaults and the page emulates its knobs as with no driver; on, it takes
 * them back from the page. `note` says why, for the panel, and null clears it.
 */
export function setNative(on: boolean, note?: string | null): void {
  if (note !== undefined) nativeNote = note;
  const changed = on !== nativeEnabled();
  enableNative(on);
  if (changed && !on && native && !inFrame) release(native, false);
  if (running && (changed || note !== undefined)) applyState(state);
}

/** Can the host send requests as another browser, so real phone mode does something? */
export function hostSendsUa(): boolean {
  return native?.ua !== undefined && native.realPhone !== undefined;
}

/** The driver's switch for the panel: null where the host gives none. */
export function nativeSwitch(): { setting: NativeSetting; on: boolean; note: string | null } | null {
  if (!native?.setting) return null;
  return { setting: native.setting, on: nativeEnabled(), note: nativeNote };
}

export function setState(patch: DevknobsStatePatch): DevknobsState {
  applyState(merge(state, patch));
  return state;
}

/**
 * The knobs, once the frame has caught up with them and the panel has slid
 * where it goes. A page devknobs reloads never resolves it: ask again on the
 * next page. Rejects while devknobs is not mounted, and when it unmounts
 * during the wait.
 */
export function ready(): Promise<DevknobsState> {
  return whenSettled(
    () => width.idle() && !locale.retrying() && !pseudo.pending() && !panelMoving?.(),
    locale.reloading,
    () => state,
    () => running,
  );
}

/**
 * The panel says how to tell it is still sliding, open or closed, its handle
 * with it, so `ready()` waits for it to land. Returns the way to stop.
 */
export function watchPanel(moving: () => boolean): () => void {
  panelMoving = moving;
  return () => {
    if (panelMoving === moving) panelMoving = null;
  };
}

/**
 * Keep the panel's place for new tabs and sessions, as the user just put it.
 * Like a save, never from the copy in the width knob's frame.
 */
export function keepPlace(): void {
  if (persist) keepPlaceOf(state);
}

/**
 * Put every knob back to its default and list the default rows again. The
 * panel keeps its place and stays open or closed, across a reload too.
 */
export function reset(): void {
  applyState(resetState(state));
}

/** Inside the frame, take the knobs and replays the page above sends down. */
function onMessage(event: MessageEvent): void {
  const message = readMessage(event, window.parent, window.location.origin);
  if (message?.type === "state") {
    if (message.native !== undefined) enableNative(message.native);
    applyState(message.state);
  }
  else if (message?.type === "replay") replayAnimations();
}

/**
 * Inside the frame, a navigation of its page to another origin, which no knob
 * follows and which a page that refuses frames, such as a sign-in provider,
 * would leave as an error: the window above goes there instead.
 */
function onNavigate(event: Event): void {
  const navigate = event as Event & FrameNavigation;
  const url = leaveFor(navigate, window.location.origin);
  if (!url) return;
  navigate.preventDefault();
  post(window.parent, { source: "devknobs", type: "leave", url });
}

/** The frame's Navigation API, where the browser has one. */
function navigation(): EventTarget | null {
  const found: unknown = Reflect.get(window, "navigation");
  return found instanceof EventTarget ? found : null;
}

/** Inside the frame, tell the panel above how many boxes stick out here. */
function relay(count: number): void {
  post(window.parent, { source: "devknobs", type: "overflow", count });
}

export function start(options: EngineOptions = {}): void {
  if (running) return;
  running = true;
  inFrame = isDevknobsFrame();
  native = options.native ?? null;
  // For a page with no early script, which takes it first where there is one.
  resumeScroll();
  const stored = options.persist !== false;
  // The frame shares sessionStorage with the page above, which owns the stored
  // state. It reads it, so the first paint is right, but a save would clobber it.
  persist = stored && !inFrame;
  if (inFrame) {
    window.addEventListener("message", onMessage);
    navigation()?.addEventListener("navigate", onNavigate);
  }
  // Before any knob, so a patch a knob puts on `fetch` wraps the log's and comes off first.
  requests.start();
  // A page that will not load in the frame offers this way out, of a pinned panel's frame too.
  width.onExit(() => setState(EXITED));
  // The letterbox zooms the frame from its own control, the wheel and the keys.
  width.onZoom((zoom) => setState({ zoom }));
  // A host can say why a page refused the frame.
  width.onRefused(native?.refused ?? null);
  width.onFramed(native?.framed ?? null);
  width.onLoader(native?.load ?? null);
  applyState(merge(stored ? load() : { ...DEFAULT_STATE }, options.state ?? {}));
  if (!inFrame) return;
  relay(overflow.overflowCount());
  stopRelay = overflow.onCount(relay);
  post(window.parent, { source: "devknobs", type: "ready" });
}

/** Undo every patch and hand the page back to the browser. */
export function stop(): void {
  if (!running) return;
  running = false;
  window.removeEventListener("message", onMessage);
  navigation()?.removeEventListener("navigate", onNavigate);
  stopRelay?.();
  stopRelay = null;
  inFrame = false;
  width.onExit(null);
  width.onZoom(null);
  width.onRefused(null);
  width.onFramed(null);
  width.onLoader(null);
  media.destroy();
  touch.reset();
  touchPointer.reset();
  screen.reset();
  scrollbars.reset();
  speed.reset();
  locale.reset();
  pseudo.reset();
  geo.reset();
  time.reset();
  header.reset();
  network.reset();
  text.reset();
  spacing.reset();
  ua.reset();
  width.reset();
  overflow.reset();
  outlines.reset();
  tabIcon.reset();
  if (native) release(native);
  native = null;
  enableNative(true);
  nativeNote = null;
  requests.stop();
  state = { ...DEFAULT_STATE };
}

/** Restart every CSS animation, in the width knob's frame too. */
export function replay(): void {
  replayAnimations();
  post(width.frameWindow(), { source: "devknobs", type: "replay" });
}
