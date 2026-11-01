import {
  BARS_START,
  type Bars,
  type BarsEvent,
  type BarsMotion,
  barsOf,
  barsStep,
  runsUnderBars,
  viewportOf,
} from "./browserui";
import { type Actions, el, FONT, type Look, MORPH, type Painted, place } from "./browserkit";
import { buildChrome, CHROME_CSS } from "./chromedraw";
import { type Color, luminance, parseColor } from "./color";
import { turn } from "./devices";
import { baseMatchMedia } from "./matchmedia";
import type { Rect } from "./mock";
import { navigationOf } from "./reload";
import { buildSafari, SAFARI_CSS, underAt } from "./safaridraw";
import { keep } from "./scrollkeep";
import { bandRect, createUnderbar, showsBand, UNDERBAR_CSS } from "./underbar";

/**
 * The browser's bars drawn in the screen around the frame, in the viewport's
 * shadow root. They live in the page above, so they keep its cursor, or the
 * touch cursor drawn over them there, and never take the focus, and only
 * back, forward and reload do anything.
 */

type Builder = (full: Bars, mini: Bars, look: Look, actions: Actions) => Painted;

export const BARS_CSS = `
.browser {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  transform-origin: 0 0;
  pointer-events: none;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  font-family: ${FONT};
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  line-height: 1;
}
.browser > *,
.browser > * > *,
.browser .group > * {
  position: absolute;
  box-sizing: border-box;
}
.browser svg { overflow: visible; }
.browser .press { pointer-events: auto; cursor: default; }
${SAFARI_CSS}
${CHROME_CSS}
${UNDERBAR_CSS}
`;

const BUILDERS: Record<Bars["platform"], Builder> = { safari: buildSafari, chrome: buildChrome };

/** Any css color as a color, through a canvas for the forms `parseColor` leaves. */
function toRgb(color: string): Color | null {
  const parsed = parseColor(color);
  if (parsed) return parsed;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
    return { red: r, green: g, blue: b, alpha: a / 255 };
  } catch {
    return null;
  }
}

/**
 * The color the page paints its canvas in: the body's background over the
 * root's, over the browser's own canvas, which is dark only for a page that
 * takes a dark color scheme while the preference is dark. A body that covers
 * the page hides the root's color, as the simulator shows a white body on a
 * dark root as white.
 */
function backgroundOf(doc: Document, view: Window, dark: boolean): [number, number, number] {
  const root = view.getComputedStyle(doc.documentElement);
  const schemes = root.colorScheme ?? "";
  const canvasDark = schemes.includes("dark") && (dark || !schemes.includes("light"));
  let base: [number, number, number] = canvasDark ? [18, 18, 18] : [255, 255, 255];
  const layers = [doc.documentElement, doc.body].filter((node): node is HTMLElement => !!node);
  for (const node of layers) {
    const color = toRgb(view.getComputedStyle(node).backgroundColor);
    if (!color || color.alpha === 0) continue;
    const { red, green, blue, alpha } = color;
    const [r, g, b] = base;
    const over = (top: number, under: number) => Math.round(top * alpha + under * (1 - alpha));
    base = [over(red, r), over(green, g), over(blue, b)];
  }
  return base;
}

function rgbOf(color: Color): string {
  return `rgb(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)})`;
}

type Rgb = [number, number, number];

/** `color` laid over `under`, as the page paints it. */
function blend({ red, green, blue, alpha }: Color, [r, g, b]: Rgb): Rgb {
  const over = (top: number, below: number) => Math.round(top * alpha + below * (1 - alpha));
  return [over(red, r), over(green, g), over(blue, b)];
}

function rgbText([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** A node's background, where it paints one. */
function paintOf(view: Window, node: Element): Color | null {
  const color = toRgb(view.getComputedStyle(node).backgroundColor);
  return color && color.alpha > 0 ? color : null;
}

/** A background that hides what is under it, or nearly. */
function solidOf(view: Window, node: Element): Color | null {
  const color = paintOf(view, node);
  return color && color.alpha >= 0.5 ? color : null;
}

/**
 * The color of a fixed or sticky bar at `x`, `y` of the viewport whose box
 * touches its top or bottom edge: the first solid background from what is
 * there up to the bar, over the page's `base` where it lets it through.
 */
function barAt(doc: Document, view: Window, x: number, y: number, edge: "top" | "bottom", base: Rgb) {
  let paint: Color | null = null;
  for (let node = doc.elementFromPoint(x, y); node; node = node.parentElement) {
    if (node === doc.body || node === doc.documentElement) return null;
    paint ??= solidOf(view, node);
    const { position } = view.getComputedStyle(node);
    if (position !== "fixed" && position !== "sticky") continue;
    const box = node.getBoundingClientRect();
    const touches = edge === "top" ? box.top <= 0.5 : box.bottom >= view.innerHeight - 0.5;
    return touches && paint ? rgbText(blend(paint, base)) : null;
  }
  return null;
}

/**
 * The color of a bar across the viewport's top or bottom edge, as iOS 27
 * Safari carries it into the strip over the page and the screen under it,
 * measured on the iOS 26.5 simulator and the same on 27.0. A bar only part
 * of the way across does not count.
 */
function edgeBar(doc: Document, view: Window, edge: "top" | "bottom", base: Rgb): string | null {
  const width = view.innerWidth;
  // A whole px up from the bottom: a zoomed frame finds nothing in its last half px.
  const y = edge === "top" ? 0.5 : view.innerHeight - 1;
  const colors = [width / 2, 1, width - 1].map((x) => barAt(doc, view, x, y, edge, base));
  const [middle = null] = colors;
  return colors.every((color) => color !== null) ? middle : null;
}

/**
 * The first solid background at `x`, `y` of the viewport, from the top down,
 * over what shows through it: the layers under it down to an opaque one, or
 * the page's `base`. Null where only the page's own background is there.
 */
function colorAt(doc: Document, view: Window, x: number, y: number, base: Rgb): string | null {
  const layers: Color[] = [];
  for (const node of doc.elementsFromPoint(x, y)) {
    if (node === doc.body || node === doc.documentElement) break;
    const color = layers.length === 0 ? solidOf(view, node) : paintOf(view, node);
    if (!color) continue;
    layers.push(color);
    if (color.alpha >= 1) break;
  }
  if (layers.length === 0) return null;
  return rgbText(layers.reduceRight<Rgb>((under, color) => blend(color, under), base));
}

/** Points of the screen to read the page's color under, with the page's box in it. */
export interface Probe {
  page: Rect;
  points: { x: number; y: number }[];
}

/**
 * What the bars show for the page in the frame, white and empty while it is
 * out of reach. `probe` reads the page's color under the glass.
 */
export function readLook(frame: HTMLIFrameElement, probe: Probe | null = null): Look {
  const white = "rgb(255, 255, 255)";
  const fallback: Look = {
    background: white,
    top: white,
    bottom: white,
    header: false,
    footer: false,
    under: [],
    dark: false,
    scheme: "light",
    host: "",
    canBack: false,
    canForward: false,
  };
  try {
    const view = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!view || !doc?.documentElement) return fallback;
    const scheme = view.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const base = backgroundOf(doc, view, scheme === "dark");
    const [r, g, b] = base;
    const background = rgbText(base);
    const header = edgeBar(doc, view, "top", base);
    const top = header ?? background;
    // Under the bars the phone shows the page's content, so the content at its bottom edge stands for it.
    const last = () => colorAt(doc, view, view.innerWidth / 2, view.innerHeight - 1, base);
    const footer = edgeBar(doc, view, "bottom", base);
    const bottom = footer ?? last() ?? background;
    const under = (probe?.points ?? []).map(({ x, y }) => {
      const { page } = probe ?? { page: { x: 0, y: 0, width: 0, height: 0 } };
      const inside = { x: x - page.x, y: y - page.y };
      if (inside.y < 0) return { x, y, color: top };
      // Beside the page, the Duo's column takes the page's own color.
      if (inside.x < 0 || inside.x >= page.width) return { x, y, color: background };
      if (inside.y >= page.height) return { x, y, color: bottom };
      const across = Math.min(Math.max(inside.x, 0), page.width - 1);
      return { x, y, color: colorAt(doc, view, across, inside.y, base) ?? background };
    });
    const navigation = navigationOf(view);
    const can = (key: string): boolean | null => {
      const value: unknown = navigation && Reflect.get(navigation, key);
      return typeof value === "boolean" ? value : null;
    };
    return {
      background,
      top,
      bottom,
      header: header !== null,
      footer: footer !== null,
      under,
      dark: luminance(r, g, b) < 0.4,
      scheme,
      host: view.location.host,
      canBack: can("canGoBack") ?? view.history.length > 1,
      canForward: can("canGoForward") ?? false,
    };
  } catch {
    return fallback;
  }
}

/**
 * What fills Safari's screen around the frame: the strip's color over the
 * page and the bottom's under it, the page's color everywhere else. Under
 * the bars the phone shows the page's content, or a fixed footer's color
 * carried down. The frame ends above them: the band's picture of the page
 * goes over the fill there, which is the content's color at the frame's
 * bottom edge, or the footer's, where it has none. A
 * minimized Safari has no strip: the page's content goes up under the status
 * bar, with the scrim over it, unless a fixed or sticky bar holds the top.
 */
export function screenFill(look: Look, bars: Bars, page: Rect | null, height: number): string {
  // Turned across an iPhone has no status bar, and its screen takes the page's
  // color. The Duo keeps its strip at the top held either way, status or not.
  const strip = bars.status || bars.column || !runsUnderBars(bars.screen.id);
  if (bars.platform !== "safari" || !strip || !page) return look.background;
  const held = look.top !== look.background;
  const top = bars.scrim && !held ? rgbOf(underAt(look, bars.scrim.at.x, bars.scrim.at.y)) : look.top;
  if (top === look.background && look.bottom === look.background) return look.background;
  const start = (page.y / height) * 100;
  const end = ((page.y + page.height) / height) * 100;
  const { background: middle, bottom } = look;
  const strips = `linear-gradient(to bottom, ${top} ${start}%, ${middle} ${start}%, ${middle} ${end}%, ${bottom} ${end}%)`;
  const W = turn(bars.screen, bars.orientation).width;
  const [left, right] = [(page.x / W) * 100, ((page.x + page.width) / W) * 100];
  if (left <= 0 && right >= 100) return strips;
  // The Duo cover's column takes the page's color all the way down, over the strips.
  const column = `linear-gradient(to right, ${middle} ${left}%, transparent ${left}%, transparent ${right}%, ${middle} ${right}%)`;
  return `${column}, ${strips}`;
}

/** Can the frame's page be read? Not on another origin, or behind an error page. */
function reaches(frame: HTMLIFrameElement): boolean {
  try {
    return !!frame.contentDocument?.documentElement;
  } catch {
    return false;
  }
}

/** What the bars are drawn for. */
export interface BrowserView {
  bars: Bars | null;
  /** Where the page sits in the screen. */
  page: Rect | null;
  /** The screen, in css px. */
  size: { width: number; height: number };
  /** The frame's zoom, which the bars are drawn at too. */
  zoom: number;
  /** The bars follow the page's scroll, so the minimized one expands on a tap. */
  follow: boolean;
  /** Puts the frame at the page's size and place. */
  sizeFrame(): void;
}

export interface BrowserLayer {
  /**
   * Draw the bars, or take them away. Bars that only minimize or expand move
   * between their two states in place, and the frame takes a new size when
   * that never leaves a gap: at once when it grows, at the end of the morph
   * when it shrinks.
   */
  show(view: BrowserView): void;
  /** Read the page again: its background, scheme, address and history. */
  refresh(): void;
  /** Has the page's scroll minimized the bars? */
  minimized(): boolean;
  /** Where the frame's page sits in the screen now, or null where it fills it. */
  page(): Rect | null;
  /**
   * Blank the screen in the page's color and show the page loading, as
   * Safari shows a reload, until the frame's page can paint. While it loads
   * the bars keep what they showed, or `seed`, over the blank page.
   */
  startLoading(seed: Look | null): void;
  /** Show the page as far as it got, and the bars done loading. */
  stopLoading(): void;
  /** What the bars show for the page now. */
  look(): Look | null;
  remove(): void;
}

/** How long after a knob moves the page has had to restyle, in ms. */
const RESTYLE = 120;

/**
 * How long a reloading page keeps the screen blank at most, in ms. One that
 * never finishes loading shows as far as it got.
 */
const LOAD_WAIT = 5000;

function same(a: Rect | null, b: Rect | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The bars over the frame in `glass`, which fills with the page's background
 * around the frame, as Safari and Chrome tint the screen around their bars.
 * The page's scroll moves `minimized()`, and `onChange` hears when it does.
 * `onReload` hears the reload button before the page reloads, and `ready`
 * says when the frame's page is in and ready to paint, with no reload on its way.
 */
export function createBrowser(
  glass: HTMLElement,
  frame: HTMLIFrameElement,
  onChange: () => void,
  onReload: () => void = () => {},
  ready: () => boolean = () => true,
): BrowserLayer {
  /** Blanks the screen while its page reloads. */
  const blank = el("div", "screenblank");
  blank.hidden = true;
  glass.append(blank);
  /** The page under the bottom bars, past the viewport. */
  const band = createUnderbar(glass, frame);
  const layer = el("div", "browser");
  layer.setAttribute("aria-hidden", "true");
  /** Over the frame's top and bottom edges, in a fixed bar's color, under the bars. */
  const seams = [el("div", "seam"), el("div", "seam")];
  for (const seam of seams) {
    seam.setAttribute("aria-hidden", "true");
    seam.style.cssText = "position:absolute;pointer-events:none";
    seam.hidden = true;
  }
  let view: BrowserView | null = null;
  let look: Look | null = null;
  let painted: Painted | null = null;
  /** What the bars were built for: everything but minimized. */
  let built = "";
  /** The page box the frame has now, and the wait to give it a smaller one. */
  let applied: Rect | null = null;
  let shrinking = 0;
  /** The page box a pending shrink gives the frame. */
  let shrinkTo: Rect | null = null;
  let later = 0;
  /** The frame's scheme query, which tells when the page changes scheme, and its page. */
  let query: MediaQueryList | null = null;
  let watched: Document | null = null;
  let href = "";
  let motion: BarsMotion = BARS_START;
  /** A new page came in, and the frame has not been sized for it since, nor has it scrolled. */
  let landed = false;
  /** A page is loading, and the bars keep the look they had. */
  let busy = false;
  /** The wait for the reloaded page to paint. */
  let loadWait = 0;
  /** The frame to read the page under the glass again in, after a scroll. */
  let sampling = 0;
  const still = () => baseMatchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = (event: BarsEvent) => {
    const before = motion.minimized;
    motion = barsStep(motion, event);
    // Heard after the step, so a step taken while the frame is drawn never redraws inside it.
    if (motion.minimized !== before) queueMicrotask(onChange);
  };
  /** The centers of Safari's capsules in both states, to read the page's color under. */
  const probe = (): Probe | null => {
    const bars = view?.bars ?? null;
    if (!view || !bars || bars.platform !== "safari") return null;
    const { screen, orientation, layout, minimized, edge } = bars;
    const other = barsOf(screen, orientation, layout, !minimized, edge);
    const shapes = [...bars.shapes, ...(other?.shapes ?? [])];
    // A pill's x is its middle already: its width is 0 until its text sets it.
    const points = shapes.map((shape) => ({
      x: shape.x + shape.width / 2,
      y: shape.y + shape.height / 2,
    }));
    const scrim = bars.scrim ?? other?.scrim;
    if (scrim) points.push(scrim.at);
    return { page: view.page ?? { x: 0, y: 0, ...view.size }, points };
  };
  const lookNow = () => readLook(frame, probe());
  /** The band under the frame as it is now, and the page in it. */
  const placeBand = () => {
    const bars = view?.bars ?? null;
    const shown = view && showsBand(bars, look) && reaches(frame) ? bandRect(applied, view.size.height) : null;
    band.show(shown, view?.zoom ?? 1, look);
    placeSeams();
  };
  /**
   * The frame's edges fall between device pixels, where the page's scrolling
   * content and its fixed bar are snapped apart, and a row of the content
   * shows past the bar. A seam in the bar's color covers that row.
   */
  const placeSeams = () => {
    const ratio = glass.offsetWidth > 0 ? glass.getBoundingClientRect().width / glass.offsetWidth : 1;
    const unit = 1 / ((window.devicePixelRatio || 1) * (ratio || 1));
    const rects = look && reaches(frame) ? seamRects(applied, view?.zoom ?? 1, unit, look) : { top: null, bottom: null };
    const colors = [look?.top ?? "", look?.bottom ?? ""];
    [rects.top, rects.bottom].forEach((rect, index) => {
      const seam = seams[index];
      if (!seam) return;
      seam.hidden = rect === null;
      if (!rect) return;
      if (!seam.isConnected) glass.insertBefore(seam, layer.isConnected ? layer : null);
      place(seam, rect.x, rect.y, rect.width, rect.height);
      seam.style.background = colors[index] ?? "";
    });
  };
  /**
   * The page moved under the glass: read it again once a frame, and repaint
   * only for a change. Only the colors move: the bars and the frame's box
   * stay as they are.
   */
  const resample = () => {
    sampling = 0;
    const bars = view?.bars;
    if (busy || !look || !view || !bars || bars.platform !== "safari") return;
    const next = lookNow();
    if (JSON.stringify(next) === JSON.stringify(look)) return;
    look = next;
    glass.style.background = screenFill(look, bars, view.page, view.size.height);
    back();
    placeBand();
    painted?.apply(bars.minimized, look);
  };
  /**
   * How far up minimizing moves the page's top, the room top bars give it,
   * and how much taller the frame gets.
   */
  const growth = (): { room: number; grow: number } => {
    const bars = view?.bars;
    if (!bars) return { room: 0, grow: 0 };
    const { screen, orientation, layout, edge } = bars;
    const [full, mini] = [false, true].map((minimized) => viewportOf(screen, orientation, layout, minimized, edge));
    if (!full || !mini) return { room: 0, grow: 0 };
    return { room: Math.max(0, full.y - mini.y), grow: Math.max(0, mini.height - full.height) };
  };
  const onScroll = () => {
    band.move();
    landed = false;
    const page = frame.contentWindow;
    if (page) {
      const { room, grow } = growth();
      // How far the page can still be scrolled once the frame grows for minimized bars.
      const tall = frame.contentDocument?.documentElement?.scrollHeight;
      const rest = typeof tall === "number" ? tall - page.innerHeight - grow : Number.POSITIVE_INFINITY;
      step({ type: "scroll", y: page.scrollY, time: performance.now(), room, rest });
    }
    if (!sampling) sampling = window.requestAnimationFrame(resample);
  };
  const actions: Actions = {
    back: () => frame.contentWindow?.history.back(),
    forward: () => frame.contentWindow?.history.forward(),
    reload: () => {
      // While a page loads the button is Safari's stop, and the page shows as far as it got.
      if (busy) {
        frame.contentWindow?.stop();
        stopLoading();
        return;
      }
      onReload();
      keep(frame.contentWindow, "frame");
      frame.contentWindow?.location.reload();
    },
    expand: () => step({ type: "tap" }),
  };
  /**
   * Give the frame its page box. A new size locks the scroll, as the page
   * settles into it. Top bars that minimize or expand move the page's top,
   * and the page scrolls as far, so its content stays where it is on the
   * screen, as Safari's does: the bars give or take room, never push it.
   */
  const sizeFrame = () => {
    if (!view) return;
    const before = applied;
    view.sizeFrame();
    const page = view.page;
    if (!same(page, applied)) step({ type: "resize", time: performance.now() });
    applied = page;
    const moved = before && page && before.y !== page.y && before.x === page.x && before.width === page.width;
    if (moved) {
      // A new page starts at its own place, which the bars coming back for it never move.
      const fresh = landed;
      landed = false;
      try {
        // Instant, past a page's own smooth scrolling.
        if (!fresh) frame.contentWindow?.scrollBy({ top: page.y - before.y, behavior: "instant" });
      } catch {
        // The frame went to another origin.
      }
    }
    placeBand();
  };
  const stopShrink = () => {
    clearTimeout(shrinking);
    shrinking = 0;
    shrinkTo = null;
  };
  /**
   * The frame grows at once, under bars that are leaving, and shrinks once
   * the bars are in. Under top bars it takes its box at once either way, as
   * the page scrolls with its top and its content stays put: a wait would
   * let the page reach its top first, with no room left to scroll. A redraw
   * while it waits to shrink to the same box leaves the wait be, so the
   * frame still gets there.
   */
  const placeFrame = (instant: boolean) => {
    const page = view?.page ?? null;
    const shrinks = !instant && page && applied && page.height < applied.height && page.y === applied.y;
    if (shrinks && shrinking && same(page, shrinkTo)) return;
    stopShrink();
    if (!shrinks) {
      sizeFrame();
      return;
    }
    shrinkTo = page;
    shrinking = window.setTimeout(() => {
      shrinking = 0;
      shrinkTo = null;
      if (same(view?.page ?? null, page)) sizeFrame();
    }, MORPH.expand);
  };
  /**
   * The frame's own background takes the page's color. The frame's edges fall
   * between device pixels at most scales, where its background is drawn into
   * the part of a pixel the page is not, and its stylesheet's white there is a
   * hairline along the edge of a dark page, which comes and goes as the page
   * is drawn in new layers. A page out of reach keeps the stylesheet's.
   */
  const back = () => {
    frame.style.background = reaches(frame) ? (look ??= lookNow()).background : "";
  };
  const draw = () => {
    const bars = view?.bars ?? null;
    if (!view || !bars) {
      stopShrink();
      layer.replaceChildren();
      glass.style.background = "";
      back();
      painted = null;
      built = "";
      if (view) sizeFrame();
      placeBand();
      return;
    }
    look ??= lookNow();
    glass.style.background = screenFill(look, bars, view.page, view.size.height);
    back();
    placeBand();
    const { platform, layout, screen, orientation, edge } = bars;
    const base = JSON.stringify([platform, layout, screen, orientation, edge, view.follow]);
    const fresh = base !== built || !painted;
    const instant = fresh || still();
    if (fresh) {
      const other = barsOf(screen, orientation, layout, !bars.minimized, edge);
      const full = bars.minimized ? other : bars;
      const mini = bars.minimized ? bars : other;
      const shown = { ...actions, expand: view.follow ? actions.expand : undefined };
      if (!full || !mini) return;
      painted = BUILDERS[bars.platform](full, mini, look, shown);
      layer.replaceChildren(painted.root);
      built = base;
      if (busy) painted.loading?.(true, true);
    }
    // A first drawing, or reduced motion, takes the state without a transition.
    if (instant) layer.setAttribute("data-instant", "");
    painted?.apply(bars.minimized, look);
    if (instant) {
      void layer.offsetWidth;
      layer.removeAttribute("data-instant");
    }
    placeFrame(instant);
  };
  /** The page in the frame, or null once it is on another origin, or an error page. */
  const pageOf = (): Document | null => {
    try {
      return frame.contentDocument;
    } catch {
      return null;
    }
  };
  const showLoading = (on: boolean, seed: Look | null) => {
    busy = on;
    if (seed) {
      look = seed;
      draw();
    }
    painted?.loading?.(on, still());
    if (!on) browser.refresh();
  };
  const stopLoading = () => {
    if (loadWait) window.cancelAnimationFrame(loadWait);
    loadWait = 0;
    if (!busy) return;
    blank.hidden = true;
    showLoading(false, null);
  };
  const startLoading = (seed: Look | null) => {
    blank.style.background = (seed ?? look ?? lookNow()).background;
    blank.hidden = false;
    showLoading(true, seed);
    if (loadWait) window.cancelAnimationFrame(loadWait);
    const end = performance.now() + LOAD_WAIT;
    // The page that asked for the reload stays ready to paint until the next one takes its place.
    const gone = pageOf();
    const check = () => {
      loadWait = 0;
      const next = gone === null || pageOf() !== gone;
      if ((next && ready()) || performance.now() >= end) stopLoading();
      else loadWait = window.requestAnimationFrame(check);
    };
    loadWait = window.requestAnimationFrame(check);
  };
  const read = () => {
    try {
      // The window stays the same across loads, its document does not.
      const page = frame.contentWindow;
      const doc = frame.contentDocument;
      // A new document, not a new address the page gave itself.
      const arrived = doc !== watched;
      if (page && doc && doc !== watched) {
        query?.removeEventListener("change", read);
        query = page.matchMedia("(prefers-color-scheme: dark)");
        query.addEventListener("change", read);
        page.addEventListener("scroll", onScroll, { passive: true });
        watched = doc;
      }
      // A new page, or a new address in this one, starts with the bars out.
      const now = page?.location.href ?? "";
      if (now !== href) {
        href = now;
        landed = arrived;
        step({ type: "navigate" });
      }
    } catch {
      query = null;
    }
    if (!busy || !look) look = lookNow();
    draw();
  };
  const browser: BrowserLayer = {
    show(next) {
      view = next;
      if (next.bars && !layer.isConnected) glass.append(layer);
      // Under the bars, over the page.
      for (const seam of seams) if (seam.isConnected) glass.insertBefore(seam, layer.isConnected ? layer : null);
      if (!next.bars) layer.remove();
      place(layer, 0, 0, next.size.width, next.size.height);
      layer.style.transform = next.zoom === 1 ? "" : `scale(${next.zoom})`;
      draw();
    },
    refresh() {
      if (!view) return;
      // Without bars only the frame's background follows the page.
      const again = view.bars
        ? read
        : () => {
            if (!busy || !look) look = lookNow();
            back();
          };
      again();
      band.refresh();
      // A knob's change reaches the page a message later, and its styles after that.
      clearTimeout(later);
      later = window.setTimeout(again, RESTYLE);
    },
    minimized: () => motion.minimized,
    page: () => applied,
    startLoading,
    stopLoading,
    look: () => look,
    remove() {
      clearTimeout(later);
      if (sampling) window.cancelAnimationFrame(sampling);
      sampling = 0;
      if (loadWait) window.cancelAnimationFrame(loadWait);
      loadWait = 0;
      stopShrink();
      query?.removeEventListener("change", read);
      try {
        frame.contentWindow?.removeEventListener("scroll", onScroll);
      } catch {
        // The frame went to another origin.
      }
      query = null;
      watched = null;
      layer.remove();
      for (const seam of seams) seam.remove();
      blank.remove();
      band.remove();
    },
  };
  return browser;
}

/** The seams over the frame's top and bottom edges, in the glass's px, 2 device px each side of it. */
export function seamRects(
  page: Rect | null,
  zoom: number,
  unit: number,
  look: Pick<Look, "header" | "footer">,
): { top: Rect | null; bottom: Rect | null } {
  if (!page) return { top: null, bottom: null };
  const x = page.x * zoom;
  const width = page.width * zoom;
  const edge = (y: number): Rect => ({ x, y: y - 2 * unit, width, height: 4 * unit });
  return {
    top: look.header ? edge(page.y * zoom) : null,
    bottom: look.footer ? edge((page.y + page.height) * zoom) : null,
  };
}
