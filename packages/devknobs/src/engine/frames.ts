import type { DevknobsState, ZoomValue } from "../types";
import { needsFrame, type ZoomAction } from "./frame";
import type { FrameRefusal } from "./native";
import type * as Kit from "./framekit";
import { dropEarly } from "./placeholder";

/**
 * The frame's side of the engine and the panel, which load the frame, its
 * devices and their folds, `framekit.ts`, only the first time the knobs need
 * a frame. Until then there is none, so each call answers as the frame does
 * while it is down. Knobs that need one wait for it to load, the early
 * script's stand-in over the page meanwhile, and the frame then draws from
 * the knobs before them, as it would have.
 */

type FrameKit = typeof Kit;

let kit: FrameKit | null = null;
/** Brings the kit in. Tests hand in their own with `loadKitWith`. */
let load: () => Promise<FrameKit> = () => import("./framekit");
/** The one load of the kit. A failed one stays failed: the browser keeps a module that did not load. */
let loading: Promise<void> | null = null;
/** The kit did not load, so no frame can come. */
let down = false;
/** Calls to make once the kit is in, before it draws. */
const waiting: ((kit: FrameKit) => void)[] = [];
/** The last knobs that needed no frame, before the ones that load it. */
let before: DevknobsState | null = null;
/** The last knobs applied while the kit loads. */
let latest: DevknobsState | null = null;
let exit: (() => void) | null = null;
let zoomTo: ((zoom: ZoomValue) => void) | null = null;
let askWhy: ((url: string) => Promise<FrameRefusal | null>) | null = null;
let framed: ((open: boolean) => void | Promise<void>) | null = null;
let loader: ((frame: HTMLIFrameElement, url: string) => boolean) | null = null;

function arrived(loaded: FrameKit): void {
  kit = loaded;
  loaded.width.onExit(exit);
  loaded.width.onZoom(zoomTo);
  loaded.width.onRefused(askWhy);
  loaded.width.onFramed(framed);
  loaded.width.onLoader(loader);
  for (const run of waiting.splice(0)) run(loaded);
  for (const state of [before, latest]) {
    if (!state) continue;
    loaded.width.apply(state);
    loaded.width.sync(state);
  }
  before = null;
  latest = null;
}

/** Load the frame's kit, once. Resolves once it is in and has drawn what the knobs ask. */
export function loadFrames(): Promise<void> {
  loading ??= load().then(arrived);
  return loading;
}

/** For tests: load the kit from `next` in place of `framekit.ts`. */
export function loadKitWith(next: () => Promise<FrameKit>): void {
  load = next;
}

/** The kit did not load: no frame comes, so the knobs that asked for one go back to none. */
function failed(error: unknown): void {
  console.error("devknobs: the device frame could not load", error);
  down = true;
  before = null;
  latest = null;
  dropEarly();
  exit?.();
}

/** Run `watch` now if the kit is in, else once it is. Returns the way to stop either. */
function whenIn(watch: (kit: FrameKit) => () => void): () => void {
  if (kit) return watch(kit);
  let stop: (() => void) | null = null;
  const run = (loaded: FrameKit) => {
    stop = watch(loaded);
  };
  waiting.push(run);
  return () => {
    const at = waiting.indexOf(run);
    if (at >= 0) waiting.splice(at, 1);
    stop?.();
  };
}

export function apply(state: DevknobsState): void {
  if (kit) {
    kit.width.apply(state);
    return;
  }
  if (latest === null && !needsFrame(state)) {
    before = state;
    // No frame was drawn, so the early script's stand-in goes, as the frame does with none.
    dropEarly();
    return;
  }
  if (down) {
    // Each pick of a device after that goes back to none, which needs no frame and so ends here.
    exit?.();
    return;
  }
  latest = state;
  if (!loading) loadFrames().catch(failed);
}

export function sync(state: DevknobsState): void {
  kit?.width.sync(state);
}

export function reset(): void {
  kit?.width.reset();
  before = null;
  latest = null;
}

export function onExit(handler: (() => void) | null): void {
  exit = handler;
  kit?.width.onExit(handler);
}

export function onZoom(handler: ((zoom: ZoomValue) => void) | null): void {
  zoomTo = handler;
  kit?.width.onZoom(handler);
}

export function onRefused(handler: ((url: string) => Promise<FrameRefusal | null>) | null): void {
  askWhy = handler;
  kit?.width.onRefused(handler);
}

export function onFramed(handler: ((open: boolean) => void | Promise<void>) | null): void {
  framed = handler;
  kit?.width.onFramed(handler);
}

export function onLoader(handler: ((frame: HTMLIFrameElement, url: string) => boolean) | null): void {
  loader = handler;
  kit?.width.onLoader(handler);
}

/** The window inside the frame, while there is one. */
export function frameWindow(): Window | null {
  return kit?.width.frameWindow() ?? null;
}

/**
 * Has the frame caught up with the knobs? Not while its kit loads for knobs
 * that need one. A failed load clears the knobs it waited on.
 */
export function idle(): boolean {
  if (kit) return kit.width.idle();
  return latest === null;
}

export function panelSized(glide: boolean): void {
  kit?.width.panelSized(glide);
}

export function zoomKey(action: ZoomAction): boolean {
  return kit?.width.zoomKey(action) ?? false;
}

export function landSplash(): void {
  kit?.landSplash();
}

export function takeHinge(state: DevknobsState): boolean {
  return kit?.takeHinge(state) ?? false;
}

export function moveHinge(target: number): boolean {
  return kit?.moveHinge(target) ?? false;
}

export function letGo(stop: number): boolean {
  return kit?.letGo(stop) ?? false;
}

export function holdingHinge(): boolean {
  return kit?.holdingHinge() ?? false;
}

export function foldRest(): number | null {
  return kit?.foldRest() ?? null;
}

export function watchFold(watcher: () => void): () => void {
  return whenIn((loaded) => loaded.watchFold(watcher));
}

export function watchHinge(watcher: (open: number, hand: boolean) => void): () => void {
  return whenIn((loaded) => loaded.watchHinge(watcher));
}
