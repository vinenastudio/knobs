import type { KnobsState, DprValue } from "../types";
import { hasTouch } from "./devices";
import { coarse } from "./media";
import * as screen from "./screen";
import * as scrollbars from "./scrollbars";
import { equip } from "./touch";
import * as ua from "./ua";

/**
 * What a page reads once as it loads and keeps: the browser, the touch screen
 * and the pixel ratio. A script that sniffed the user agent or set a canvas up
 * for the ratio never looks again, so the frame reloads when any of it moves.
 */
export interface Identity {
  /** The ua preset, which brings its platform and touch points, a custom string, or empty for the browser's own. */
  agent: string;
  /** A touch screen in the frame: `ontouchstart`, touch points and a coarse pointer. */
  touch: boolean;
  dpr: DprValue;
  /** Real phone mode: the frame's page loads go to servers as the device, so the page loads again when it turns. */
  served?: boolean;
}

type IdentityKnobs = Pick<KnobsState, "ua" | "device" | "dpr"> & { panel?: Pick<KnobsState["panel"], "realPhone"> };

/** What the frame's new window is patched with: its identity, and the screen it reads. */
type PatchKnobs = IdentityKnobs & Pick<KnobsState, "posture" | "orientation">;

export function identityOf(state: IdentityKnobs): Identity {
  const agent = ua.uaPreset(state.ua.preset) ? state.ua.preset : ua.userAgentOf(state.ua);
  return { agent, touch: hasTouch(state.device), dpr: state.dpr, ...(state.panel?.realPhone ? { served: true } : {}) };
}

/** Does a page loaded as `loaded` read wrong under `next`? Not while no page has loaded. */
export function stale(loaded: Identity | null, next: Identity): boolean {
  return (
    loaded !== null &&
    (loaded.agent !== next.agent ||
      loaded.touch !== next.touch ||
      loaded.dpr !== next.dpr ||
      (loaded.served ?? false) !== (next.served ?? false))
  );
}

/** On a window patched from above: the identity it was patched as. */
const PATCHED = Symbol.for("devknobs.identity");

function isIdentity(value: unknown): value is Identity {
  return typeof value === "object" && value !== null && "agent" in value && "touch" in value;
}

/** The identity a window was patched as from the page above, if it was. */
export function patchedAs(view: object): Identity | undefined {
  const identity: unknown = Reflect.get(view, PATCHED);
  return isIdentity(identity) ? identity : undefined;
}

/**
 * Patch the frame's new window from the page above, as the frame's own copy
 * would on mount: the user agent, the touch screen, its pointer queries, its
 * scrollbars and the device's screen size, before the window's first script.
 * The copy there takes them over. A window patched already keeps what it
 * has, and says what that is.
 */
export function patchWindow(view: Window, state: PatchKnobs): Identity {
  const had = patchedAs(view);
  if (had) return had;
  const identity = identityOf(state);
  Reflect.set(view, PATCHED, identity);
  ua.apply(state.ua, view);
  screen.apply(screen.screenSizeOf(state), view);
  if (identity.touch) {
    equip(view, ua.uaPreset(state.ua.preset) === undefined);
    coarse(view);
    scrollbars.equip(view);
  }
  return identity;
}
