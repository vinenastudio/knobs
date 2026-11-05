import { DOCK_WIDTH, PAGE_MIN } from "../engine/dock";
import type { SideValue } from "../types";
import { between } from "./place";
import type { LivePrefs } from "./prefs";

/**
 * How wide the panel is, and the strip on its page side that changes it, as
 * the edge of a docked devtools does. The rows, the settings and every
 * feature's view share one width, kept with the preferences, and a window too
 * narrow for it shows the panel narrower without changing what is kept. Pinned, the panel is a column the page gives
 * its room to, and the strip leaves the page the least it is laid out at.
 */

/** How wide the panel is until the user says otherwise, in px. */
export const PANEL_WIDTH = DOCK_WIDTH;

/** The narrowest the strip makes the panel, in px. */
export const WIDTH_MIN = 240;

/** The widest the strip makes the panel, and what it leaves the page of the window's width, in px. */
export const WIDTH_MAX = 720;
export const PAGE_ROOM = 96;

/**
 * What the strip leaves the page of the window's width, in px. A pinned
 * panel takes its room from the page, which keeps its least.
 */
export function pageRoom(docked: boolean): number {
  return docked ? PAGE_MIN : PAGE_ROOM;
}

/** How far an arrow key moves the strip, in px. */
export const WIDTH_STEP = 16;

/** How far the handle stands out of the panel, in px: its width less the pixel it sits over the panel. */
export const HANDLE_REACH = 21;

/** The widths the strip can set. */
export interface Limits {
  min: number;
  max: number;
}

/**
 * The widths the strip can set in a window `view` wide, which leave the page
 * `page` of it. With no room to spare, only the least.
 */
export function widthLimits(view: number, page = PAGE_ROOM): Limits {
  return { min: WIDTH_MIN, max: Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, view - page)) };
}

/**
 * The width the panel takes for the one that is wanted, in a window `view`
 * wide that keeps `page` of it: held between the strip's limits, so never
 * under the least, even in a window too narrow for it.
 */
export function widthIn(wanted: number, view: number, page = PAGE_ROOM): number {
  const { min, max } = widthLimits(view, page);
  return Math.round(between(wanted, min, max));
}

/**
 * The width a drag of the strip asks for, from the width it started at and
 * how far the pointer went across: away from the edge the panel is on is wider.
 */
export function dragWidth(from: number, travel: number, side: SideValue): number {
  return from + (side === "right" ? -travel : travel);
}

/**
 * The width a key on the strip asks for, or null for a key that is not the
 * strip's. An arrow moves the strip the way it points, so the one that points
 * away from the panel's edge of the window widens it. Home is the least and
 * End the most.
 */
export function keyWidth(
  key: string,
  width: number,
  limits: Limits,
  side: SideValue,
): number | null {
  if (key === "Home") return limits.min;
  if (key === "End") return limits.max;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const wider = (key === "ArrowLeft") === (side === "right");
  return between(width + (wider ? WIDTH_STEP : -WIDTH_STEP), limits.min, limits.max);
}

/**
 * Does the panel glide to a new width? Not to its first one, not under the
 * strip, which it follows one to one, and not as the window resizes.
 */
export function widthGlides(cue: { first: boolean; dragging: boolean; resizing: boolean }): boolean {
  return !cue.first && !cue.dragging && !cue.resizing;
}

/** What the strip needs from the panel. */
export interface SizerContext {
  /** The host, which is as wide as the panel and its handle. */
  host: HTMLElement;
  /** The wrapper, which carries the width as `--panel-width`. */
  wrap: HTMLElement;
  panel: HTMLElement;
  prefs: LivePrefs;
  /** Whether the panel is open, the side of the window it is on, and whether it is pinned there. */
  place(): { open: boolean; side: SideValue; docked: boolean };
  /** The panel is `px` wide from now, or on its way there: its first width too. */
  wide(px: number): void;
  /** The panel has a new width, which it glides to or not. */
  sized(glide: boolean): void;
}

export interface Sizer {
  /** The strip, which goes in the panel. */
  strip: HTMLElement;
  /**
   * Give the panel its width. `draw` draws what it shows, at the width the
   * panel ends at, so what is measured there holds once it has glided. A
   * closed panel keeps its width until it opens, as its handle would jump
   * with it.
   */
  size(draw?: () => void): void;
  /** The window resized: the panel takes the width that leaves, at once. */
  fit(): void;
  /** End a drag the window took away, back at the width that is kept. */
  cancel(): void;
}

/** The strip's drag: the pointer that drags, where it started and where it is. */
interface Held {
  pointer: number;
  from: number;
  x: number;
  width: number;
  moved: boolean;
}

export function createSizer(context: SizerContext): Sizer {
  const { host, wrap, panel, prefs } = context;

  const strip = document.createElement("div");
  strip.className = "sizer";
  strip.tabIndex = 0;
  strip.setAttribute("role", "separator");
  strip.setAttribute("aria-orientation", "vertical");
  strip.setAttribute("aria-label", "panel width");

  /** The width the panel has, null before its first. */
  let shown: number | null = null;
  let held: Held | null = null;

  /** The window's width less a scrollbar, the room the host is fixed in. */
  function viewWidth(): number {
    return document.documentElement.clientWidth || window.innerWidth;
  }

  function put(width: number): void {
    wrap.style.setProperty("--panel-width", `${width}px`);
  }

  /**
   * The host takes the new width at once, so the frame is fitted beside where
   * the panel ends up, once, as the glide starts. The panel takes it with no
   * transition for `draw`, and where it glides, goes back to the width it had
   * and is let go from there.
   */
  function apply(draw: (() => void) | undefined, resizing: boolean): void {
    const view = viewWidth();
    const page = pageRoom(context.place().docked);
    const next = widthIn(held ? held.width : prefs.get().width, view, page);
    const from = shown;
    const limits = widthLimits(view, page);
    strip.setAttribute("aria-valuemin", String(limits.min));
    strip.setAttribute("aria-valuemax", String(limits.max));
    if (next === from || (from !== null && !context.place().open)) {
      draw?.();
      return;
    }
    strip.setAttribute("aria-valuenow", String(next));
    const glide = widthGlides({ first: from === null, dragging: held !== null, resizing });
    shown = next;
    context.wide(next);
    host.style.width = `${HANDLE_REACH + next}px`;
    panel.style.transitionProperty = "none";
    put(next);
    draw?.();
    if (glide && from !== null) put(from);
    // Read the layout, so the width is in before the transition returns.
    panel.getBoundingClientRect();
    panel.style.transitionProperty = "";
    put(next);
    if (from !== null) context.sized(glide);
  }

  /** End the drag: the width it reached is kept, or dropped for the one that was. */
  function end(keep: boolean): void {
    if (!held) return;
    const { pointer, width, moved } = held;
    held = null;
    delete wrap.dataset.sizing;
    if (strip.hasPointerCapture(pointer)) strip.releasePointerCapture(pointer);
    if (keep && moved) prefs.setWidth(width);
    else apply(undefined, false);
  }

  // The capture keeps the drag while the pointer is over the page, or a frame in it.
  strip.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || held || shown === null) return;
    held = {
      pointer: event.pointerId,
      from: shown,
      x: event.clientX,
      width: shown,
      moved: false,
    };
    wrap.dataset.sizing = "true";
    strip.setPointerCapture(event.pointerId);
  });
  strip.addEventListener("pointermove", (event: PointerEvent) => {
    if (!held || event.pointerId !== held.pointer) return;
    const { side, docked } = context.place();
    const wanted = dragWidth(held.from, event.clientX - held.x, side);
    const width = widthIn(wanted, viewWidth(), pageRoom(docked));
    if (width === held.width) return;
    held.width = width;
    held.moved = true;
    // Not through the preferences: a pointermove is no reason to write them.
    apply(undefined, false);
  });
  strip.addEventListener("pointerup", (event: PointerEvent) => {
    if (event.pointerId === held?.pointer) end(true);
  });
  strip.addEventListener("pointercancel", (event: PointerEvent) => {
    if (event.pointerId === held?.pointer) end(false);
  });
  // The browser can take the pointer away. The capture a pointerup lets go of
  // finds the drag already ended.
  strip.addEventListener("lostpointercapture", (event: PointerEvent) => {
    if (event.pointerId === held?.pointer) end(false);
  });
  strip.addEventListener("dblclick", () => prefs.setWidth(PANEL_WIDTH));
  strip.addEventListener("keydown", (event: KeyboardEvent) => {
    if (shown === null || event.altKey || event.ctrlKey || event.metaKey) return;
    const { side, docked } = context.place();
    const limits = widthLimits(viewWidth(), pageRoom(docked));
    const next = keyWidth(event.key, shown, limits, side);
    if (next === null) return;
    event.preventDefault();
    prefs.setWidth(next);
  });

  return {
    strip,
    size: (draw) => apply(draw, false),
    fit: () => apply(undefined, true),
    cancel: () => end(false),
  };
}
