import type { KnobsState } from "../types";
import { deviceOf, formOf, turn } from "./devices";

/**
 * A phone's or a tablet's screen as the page reads it in `window.screen`:
 * `width`, `height`, `availWidth` and `availHeight` in css px, all of the
 * screen, as iOS 26.5 Safari reports 402 x 874 on the 17 Pro on the
 * simulator. iOS keeps them upright however the phone is held; Android turns
 * them with it. The iPhone Duo reports its cover screen, 466 x 678, on
 * either screen, and the cover held across is 466 high to `availHeight`,
 * measured on the iOS 27.1 simulator. The getters go on the window's own `screen`, over its
 * prototype's, and taking them off puts back what the screen had.
 */

export interface ScreenSize {
  width: number;
  height: number;
  /** Where not the height. */
  availHeight?: number;
}

const KEYS = ["width", "height", "availWidth", "availHeight"] as const;

type ScreenKnobs = Pick<KnobsState, "device" | "posture" | "orientation">;

/** The screen a page in the frame reads for these knobs, null for the window's own. */
export function screenSizeOf(state: ScreenKnobs): ScreenSize | null {
  const device = formOf(state.device, state.posture);
  if (!device || (device.kind !== "phone" && device.kind !== "tablet")) return null;
  if (device.ua !== "iphone-safari") return turn(device, state.orientation);
  // A foldable iPhone's base preset is its cover screen.
  const { width, height } = turn(deviceOf(state.device) ?? device, "portrait");
  const across = device.postures !== undefined && state.posture !== "open" && state.orientation === "landscape";
  return across ? { width, height, availHeight: width } : { width, height };
}

/**
 * The screen's own descriptors from before the first patch, kept on the
 * screen itself so every copy of devknobs on that window puts back the same
 * ones. Undefined for a key the screen read from its prototype.
 */
const ORIGINALS = Symbol.for("devknobs.screen");

type Originals = Map<(typeof KEYS)[number], PropertyDescriptor | undefined>;

function originalsOf(own: object): Originals | undefined {
  const held: unknown = Reflect.get(own, ORIGINALS);
  return held instanceof Map ? (held as Originals) : undefined;
}

/** Put `size` on the screen of the window `scope`, or null to give it back what it had. */
export function apply(size: ScreenSize | null, scope: object = globalThis): void {
  const own: unknown = Reflect.get(scope, "screen");
  if (typeof own !== "object" || own === null) return;
  const originals = originalsOf(own);
  if (!size) {
    if (!originals) return;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(own, key, descriptor);
      else Reflect.deleteProperty(own, key);
    }
    Reflect.deleteProperty(own, ORIGINALS);
    return;
  }
  if (!originals) {
    const kept: Originals = new Map(KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(own, key)]));
    Object.defineProperty(own, ORIGINALS, { configurable: true, value: kept });
  }
  for (const key of KEYS) {
    const value =
      key === "width" || key === "availWidth" ? size.width : key === "availHeight" ? (size.availHeight ?? size.height) : size.height;
    Object.defineProperty(own, key, { configurable: true, enumerable: true, get: () => value });
  }
}

export function reset(): void {
  apply(null);
}
