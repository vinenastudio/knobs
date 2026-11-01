import type {
  ContrastValue,
  DevknobsState,
  MotionValue,
  SchemeValue,
  TextValue,
  TransparencyValue,
  UaValue,
} from "../types";
import { layoutOf } from "./browserui";
import { deviceOf, formId, formOf } from "./devices";
import { knobFrame } from "./frame";
import { mockOf } from "./mock";
import { type UaPreset, uaPreset, userAgentOf } from "./ua";

/** The prefers knobs, as a host sets them for real. */
export interface NativeMedia {
  scheme: SchemeValue;
  motion: MotionValue;
  contrast: ContrastValue;
  transparency: TransparencyValue;
}

/**
 * The page's viewport as a host sets it for real, in place of the frame: a
 * size knob or a device with nothing drawn around the page.
 */
export interface NativeViewport {
  /** In css px, or null for the window's own. */
  width: number | null;
  height: number | null;
  /** The device pixel ratio, or null for the screen's own. */
  dpr: number | null;
  /** A phone or a tablet: the browser lays the page out as on one. */
  mobile: boolean;
  /** A touch screen: a coarse pointer that cannot hover, and touch points. */
  touch: boolean;
  /** The mouse acts as a finger, the touch pointer knob on a touch screen. */
  touchPointer: boolean;
}

/**
 * The browser the page's requests go out as: the ua knob's preset, a
 * device's browser too. A custom string has the user agent alone, with an
 * empty `platform` and `uaPlatform` and no brands.
 */
export type NativeUa = Pick<UaPreset, "userAgent" | "platform" | "mobile" | "brands" | "uaPlatform" | "hints">;

/**
 * A host that sets some knobs for real, in the browser itself, such as a
 * browser extension through the DevTools protocol. Each part it has takes its
 * knob over: devknobs leaves that knob's emulation in the page out and hands
 * the value here instead, each time it changes. The panel, the state, its
 * storage and `describe()` stay as they are. Unmount hands every part its
 * default.
 */
export interface NativeDriver {
  /** The browser's default font size, in px, or `system` for its own. */
  text?: (value: TextValue) => void;
  /** Cut the network, for the network knob's `online` field. */
  offline?: (offline: boolean) => void;
  /** The prefers media features. */
  media?: (value: NativeMedia) => void;
  /**
   * The viewport's size, ratio and touch screen, null for the window's own.
   * Only while nothing is drawn around the page: a device's body or browser,
   * a fold, a vision filter, a zoom or a docked panel keep the frame, and the
   * host is handed null meanwhile, so the two never stack.
   */
  viewport?: (value: NativeViewport | null) => void;
  /**
   * The user agent the page's requests carry to servers, null for the
   * browser's own. Unlike the parts above, it takes nothing from the page,
   * whose navigator keeps its patches, and it is handed with the switch off
   * too. A promise holds the frame's next load until it settles, so the
   * server sees the new one.
   */
  ua?: (value: NativeUa | null) => void | Promise<void>;
  /**
   * A switch in the panel's settings that turns the driver off and on, shown
   * only where the host gives one. Off, the page emulates every knob as with
   * no driver, and the driver is handed its defaults first. `change` hears
   * the user's choice for the host to keep; the host hands one back with
   * `setNative`.
   */
  setting?: NativeSetting;
  /**
   * Asked each time the frame's page is refused, with the address the frame
   * was given, for why: a line under the notice. Asked with the switch off
   * too. Null adds nothing.
   */
  refused?: (url: string) => Promise<FrameRefusal | null>;
  /**
   * Told as the frame that loads the page opens, before its first load, and as
   * it goes. A promise on the way in holds the frame's first load until it
   * settles, so the host can let it in first.
   */
  framed?: (open: boolean) => void | Promise<void>;
  /**
   * Load the frame's page at `url`, an address on the page's own origin, in
   * place of devknobs setting the frame's `src`, as a browser extension can
   * from its own world, which the page's own `frame-src` policy does not
   * reach. False leaves it to devknobs.
   */
  load?: (frame: HTMLIFrameElement, url: string) => boolean;
}

/** Why the frame's page was refused, as the host knows it. */
export interface FrameRefusal {
  /** One short line under the notice. */
  why: string;
  /** What the notice's "copy details" button puts on the clipboard. */
  details?: string;
  /**
   * A button that runs `run`, then loads the frame again, to find out more.
   * `now` runs it at once, unpressed, with the notice kept hidden meanwhile.
   */
  retry?: { label: string; run: () => Promise<void>; now?: boolean };
}

/** The words of the driver's switch in the panel's settings, and who hears it. */
export interface NativeSetting {
  label: string;
  /** One short line under the label: what the driver costs. */
  hint: string;
  change: (on: boolean) => void;
}

/** The parts of a driver that take a knob. */
type Part = "text" | "offline" | "media" | "viewport" | "ua";

/** How long the frame waits at most for a part's promise, in ms. */
const HAND_WAIT = 2000;

const SYSTEM_MEDIA: NativeMedia = {
  scheme: "system",
  motion: "system",
  contrast: "system",
  transparency: "system",
};

/** Does the frame draw something around the page, beside giving it a size? */
export function drawnAround(state: DevknobsState): boolean {
  if (state.panel.docked || state.frame || state.vision !== "none" || state.zoom !== "fit") return true;
  const device = deviceOf(state.device);
  if (!device) return false;
  if (device.postures) return true;
  const id = formId(state.device, state.posture);
  if (state.mock && mockOf(id, state.orientation) !== null) return true;
  const layout = layoutOf(id, state.browser);
  return layout !== null && layout !== "off";
}

/** The viewport a host can set for these knobs, null where they need no size or the frame draws. */
export function nativeViewport(state: DevknobsState): NativeViewport | null {
  if (!knobFrame(state) || drawnAround(state)) return null;
  const device = deviceOf(state.device);
  const touch = device?.touch === true;
  return {
    width: typeof state.width === "number" ? state.width : null,
    height: typeof state.height === "number" ? state.height : null,
    dpr: typeof state.dpr === "number" ? state.dpr : null,
    mobile: device?.kind === "phone" || device?.kind === "tablet",
    touch,
    touchPointer: touch && state.touchPointer,
  };
}

/** The browser a host sends requests as for the ua knob, null for the browser's own. */
export function nativeUa(value: UaValue): NativeUa | null {
  const preset = uaPreset(value.preset);
  if (preset) {
    const { userAgent, platform, mobile, brands, uaPlatform, hints } = preset;
    return { userAgent, platform, mobile, brands, uaPlatform, ...(hints ? { hints } : {}) };
  }
  const userAgent = userAgentOf(value);
  return userAgent === "" ? null : { userAgent, platform: "", mobile: false, brands: [], uaPlatform: "" };
}

/** The state the page's own emulation runs with: each knob the driver takes is left at system. */
export function inPage(state: DevknobsState, driver: NativeDriver | null): DevknobsState {
  if (!driver) return state;
  let next = state;
  if (driver.text) next = { ...next, text: "system" };
  if (driver.offline) next = { ...next, network: { ...next.network, online: "system" } };
  if (driver.media) next = { ...next, ...SYSTEM_MEDIA };
  return next;
}

/** The state the frame runs with: no size of its own while the driver sets the viewport. */
export function framing(state: DevknobsState, driver: NativeDriver | null): DevknobsState {
  if (!driver?.viewport || !nativeViewport(state)) return state;
  return { ...state, width: "full", height: "full", dpr: "system" };
}

/** Whether the host's driver is on, as its switch says. Off, devknobs runs as with none. */
let enabled = true;

export function nativeEnabled(): boolean {
  return enabled;
}

export function enableNative(on: boolean): void {
  enabled = on;
}

/** What each part was last handed, so a change elsewhere hands it nothing. */
const sent = new Map<Part, string>();
/** A part's promise that has not settled yet, or null. */
let pending: Promise<void> | null = null;

/** What the frame's next load waits for: a part the host is still setting, or null. */
export function handing(): Promise<void> | null {
  return pending;
}

function hand<K extends Part>(
  driver: NativeDriver,
  part: K,
  value: Parameters<NonNullable<NativeDriver[K]>>[0],
): void {
  const call = driver[part] as ((value: unknown) => void) | undefined;
  if (!call) return;
  const key = JSON.stringify(value);
  if (sent.get(part) === key) return;
  sent.set(part, key);
  const settled = settles(call(value))?.then(() => {
    if (pending === settled) pending = null;
  });
  if (settled) pending = settled;
}

/** What a host's answer holds the frame's load for: until it settles, at most `HAND_WAIT`, or null for none. */
export function settles(result: unknown): Promise<void> | null {
  if (!(result instanceof Promise)) return null;
  return Promise.race([
    result.then(
      () => {},
      () => {},
    ),
    new Promise<void>((resolve) => setTimeout(resolve, HAND_WAIT)),
  ]);
}

/** Hand the driver the knobs it takes, those that changed since. */
export function drive(driver: NativeDriver, state: DevknobsState): void {
  hand(driver, "text", state.text);
  hand(driver, "offline", state.network.online === "offline");
  const { scheme, motion, contrast, transparency } = state;
  hand(driver, "media", { scheme, motion, contrast, transparency });
  if (driver.viewport) hand(driver, "viewport", nativeViewport(state));
  driveUa(driver, state, driver.viewport !== undefined && nativeViewport(state) !== null);
}

/**
 * The browser a host sends requests as: the ua knob, unless it is the one the
 * device brought and the device stays in the frame. The frame emulates that
 * browser in its page alone, so a site's session never meets two browsers at
 * once. A host sizing the whole tab as the device (`sized`) sends it too.
 */
export function hostUa(state: DevknobsState, sized: boolean): NativeUa | null {
  const brought = [deviceOf(state.device)?.ua, formOf(state.device, state.posture)?.ua];
  if (!sized && brought.includes(state.ua.preset)) return null;
  return nativeUa(state.ua);
}

/** Hand the driver the ua knob, which it takes with its switch off too. */
export function driveUa(driver: NativeDriver, state: DevknobsState, sized = false): void {
  if (driver.ua) hand(driver, "ua", hostUa(state, sized));
}

/**
 * Hand the driver every default, for an unmount, and forget what it had. A
 * driver never handed anything gets nothing. `ua` false keeps the ua part as
 * it is, for the switch going off.
 */
export function release(driver: NativeDriver, ua = true): void {
  if (sent.size === 0) return;
  hand(driver, "text", "system");
  hand(driver, "offline", false);
  hand(driver, "media", SYSTEM_MEDIA);
  hand(driver, "viewport", null);
  if (ua) hand(driver, "ua", null);
  for (const part of Array.from(sent.keys())) if (ua || part !== "ua") sent.delete(part);
}
