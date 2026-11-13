import { type BoxRing, RINGS } from "../grab/boxmodel";
import type { KnobsState, KnobsStatePatch, PanelValue, SchemeValue } from "../types";
import { parse } from "./store";
import { ATTRIBUTES, hasMark } from "../mark";

/** Marks the iframe the width knob renders the page in. */
export const FRAME_ATTRIBUTE = ATTRIBUTES.frame;

/**
 * The same frame by window name. A page that cannot reach its frame element,
 * such as one on `file:`, still knows it is framed and never opens a frame of
 * its own.
 */
export const FRAME_NAME = "devknobs-frame";

/** The smallest and the largest frame width or height, in px. */
export const SIZE_MIN = 120;
export const SIZE_MAX = 8192;

/** The smallest and the largest device pixel ratio inside the frame. */
export const DPR_MIN = 0.25;
export const DPR_MAX = 5;

/** What a zoom key asks of the frame: a step in or out, or back to fit. */
export type ZoomAction = "zoom-in" | "zoom-out" | "zoom-fit";

/** What a key pressed inside the frame asks of the panel above it. */
export type KeyAction =
  | "toggle"
  | "close"
  | "replay"
  | "requests"
  | "reset"
  | "storage"
  | "elements"
  | "settings"
  | "search"
  | ZoomAction;

const KEY_ACTIONS: readonly KeyAction[] = [
  "toggle",
  "close",
  "replay",
  "requests",
  "reset",
  "storage",
  "elements",
  "settings",
  "search",
  "zoom-in",
  "zoom-out",
  "zoom-fit",
];

/** Everything the page and its frame say to each other. */
export type DevknobsMessage =
  /** `native`: whether the host's driver is on above, so the frame emulates its knobs while it is off. */
  | { source: "devknobs"; type: "state"; state: KnobsState; native?: boolean }
  | { source: "devknobs"; type: "key"; action: KeyAction }
  | { source: "devknobs"; type: "overflow"; count: number }
  | { source: "devknobs"; type: "grab" | "inspect"; on: boolean; scheme?: "light" | "dark" }
  /** `picked`: inspect took an element in the frame. `outline`: the frame is to box another. */
  | { source: "devknobs"; type: "ready" | "replay" | "picked" | "outline" }
  /** The frame is to tint one area of the box it outlines, or with null all four. */
  | { source: "devknobs"; type: "area"; ring: BoxRing | null }
  /** The frame's page is going to another origin, which the window above goes to instead. */
  | { source: "devknobs"; type: "leave"; url: string };

/** The parts of a `MessageEvent` that decide whether devknobs reads it. */
export interface Envelope {
  data: unknown;
  origin: string;
  source: unknown;
}

/** Is this page the one the width knob renders inside its frame? */
export function isDevknobsFrame(): boolean {
  try {
    const owner = window.frameElement;
    if (owner && hasMark(owner, FRAME_ATTRIBUTE)) return true;
  } catch {
    // A parent on another origin. The name still tells.
  }
  return window.name === FRAME_NAME;
}

/**
 * Inside the frame: does the frame element carry the scheme? The page above
 * only sets it there when the browser hands it down as this page's real
 * `prefers-color-scheme`, so there is nothing left to emulate.
 */
export function nativeScheme(scheme: SchemeValue): boolean {
  if (scheme === "system") return false;
  try {
    const owner = window.frameElement as HTMLElement | null;
    return owner?.style.getPropertyValue("color-scheme") === scheme;
  } catch {
    return false;
  }
}

/**
 * Does the browser hand a frame element's `color-scheme` to the page inside
 * as its `prefers-color-scheme`? css color adjust says it should (csswg #7493,
 * chrome 129, firefox 105). Asked once, of a blank probe frame that takes each
 * scheme in turn, so a dark system cannot pass for support.
 */
let schemeHandover: boolean | null = null;

export function handsSchemeDown(root: Node): boolean {
  if (schemeHandover !== null) return schemeHandover;
  if (!root.isConnected) return false;
  const probe = document.createElement("iframe");
  probe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  root.appendChild(probe);
  const ask = (scheme: "light" | "dark"): boolean => {
    probe.style.colorScheme = scheme;
    // The frame only sees the scheme once the style above it is current.
    getComputedStyle(probe).getPropertyValue("color-scheme");
    return probe.contentWindow?.matchMedia(`(prefers-color-scheme: ${scheme})`).matches === true;
  };
  try {
    schemeHandover = ask("dark") && ask("light");
  } catch {
    schemeHandover = false;
  }
  probe.remove();
  return schemeHandover;
}

/** The knobs that bring the frame up. */
export type FrameKnobs = Pick<KnobsState, "width" | "height" | "frame" | "dpr" | "vision">;

/** Each of those knobs at the value that leaves the frame down. */
export const UNFRAMED: FrameKnobs = {
  width: "full",
  height: "full",
  frame: false,
  dpr: "system",
  vision: "none",
};

/**
 * The frame leaving on its own: every knob that keeps it up off and the panel
 * unpinned. No device as well, so the browser it brought goes as picking none does.
 */
export const EXITED: KnobsStatePatch = { ...UNFRAMED, device: "none", panel: { docked: false } };

function positive(value: number | string): boolean {
  return typeof value === "number" && value > 0;
}

/** The frame knobs, with the panel where it can be pinned to its side. */
export type Framing = FrameKnobs & { panel?: Pick<PanelValue, "docked"> };

/**
 * Does any knob need the page inside the frame? Device pixels only exist in a
 * frame. Vision does too: its filter on the frame leaves the panel alone and
 * fixed elements in place, where one on `<html>` would not.
 */
export function knobFrame(knobs: FrameKnobs): boolean {
  return (
    positive(knobs.width) ||
    positive(knobs.height) ||
    knobs.frame ||
    positive(knobs.dpr) ||
    knobs.vision !== "none"
  );
}

/**
 * Is the page inside the frame? A knob puts it there, and so does a panel
 * pinned to its side: only a frame gives the page a viewport that ends where
 * the panel starts, for its media queries, `100vw` and fixed boxes alike.
 */
export function needsFrame(knobs: Framing): boolean {
  return knobFrame(knobs) || knobs.panel?.docked === true;
}

/**
 * Is the frame up for a pinned panel alone? Then it is the page as it was,
 * edge to edge in the room the panel leaves: no mat shows, and no zoom.
 */
export function plainFrame(knobs: Framing): boolean {
  return knobs.panel?.docked === true && !knobFrame(knobs);
}

/**
 * Is the frame up whatever the frame knob says? A size, a ratio or a vision
 * deficiency brings it up alone, and the knob then changes nothing to see.
 */
export function frameForced(knobs: Framing): boolean {
  return needsFrame({ ...knobs, frame: false });
}

/**
 * The knobs a framed page runs with. It is the viewport already, so it never
 * frames itself, for a knob or for a pinned panel.
 */
export function framed(state: KnobsState): KnobsState {
  if (!needsFrame(state)) return state;
  return { ...state, ...UNFRAMED, panel: { ...state.panel, docked: false } };
}

/**
 * Read a devknobs message sent by `from` on `origin`. Anything from another
 * window or origin, or in another shape, is null.
 */
export function readMessage(
  event: Envelope,
  from: object | null,
  origin: string,
): DevknobsMessage | null {
  if (from === null || event.source !== from || event.origin !== origin) return null;
  const data = event.data;
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.source !== "devknobs") return null;
  const type = message.type;
  if (type === "state") {
    if (typeof message.state !== "object" || message.state === null) return null;
    const state = parse(JSON.stringify(message.state));
    return typeof message.native === "boolean"
      ? { source: "devknobs", type, state, native: message.native }
      : { source: "devknobs", type, state };
  }
  if (type === "key") {
    const action = KEY_ACTIONS.find((known) => known === message.action);
    return action ? { source: "devknobs", type, action } : null;
  }
  if (type === "overflow") {
    const count = message.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    return { source: "devknobs", type, count };
  }
  if (type === "grab" || type === "inspect") {
    if (typeof message.on !== "boolean") return null;
    const scheme =
      message.scheme === "light" || message.scheme === "dark" ? message.scheme : undefined;
    return scheme
      ? { source: "devknobs", type, on: message.on, scheme }
      : { source: "devknobs", type, on: message.on };
  }
  if (type === "area") {
    const ring = RINGS.find((known) => known === message.ring) ?? null;
    return ring === null && message.ring !== null ? null : { source: "devknobs", type, ring };
  }
  if (type === "leave") {
    const url = typeof message.url === "string" ? URL.parse(message.url) : null;
    return url && (url.protocol === "https:" || url.protocol === "http:")
      ? { source: "devknobs", type, url: url.href }
      : null;
  }
  if (type === "ready" || type === "replay" || type === "picked" || type === "outline") {
    return { source: "devknobs", type };
  }
  return null;
}

/** What the frame needs of a Navigation API `navigate` event, where the browser has it. */
export interface FrameNavigation {
  navigationType: string;
  hashChange: boolean;
  cancelable: boolean;
  downloadRequest: string | null;
  formData: FormData | null;
  destination: { url: string };
}

/**
 * Where the window above goes in place of the frame's page, which sets off for
 * another origin, or null where the frame goes itself. A form's post keeps its
 * body in the frame: the window above could only follow it with a get.
 */
export function leaveFor(navigate: FrameNavigation, origin: string): string | null {
  if (navigate.navigationType === "traverse" || navigate.hashChange || navigate.downloadRequest !== null) return null;
  if (!navigate.cancelable || navigate.formData !== null) return null;
  const url = URL.parse(navigate.destination.url);
  if (!url || url.origin === origin) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.href;
}

/**
 * Post to a window on this origin. A window on any other origin never sees it,
 * nor does a frame that holds the browser's error page for a refused load:
 * reading its origin throws, where posting to it would log an error.
 */
export function post(target: Window | null, message: DevknobsMessage): void {
  if (!target) return;
  try {
    void target.location?.origin;
  } catch {
    return;
  }
  target.postMessage(message, "/");
}
