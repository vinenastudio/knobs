import { el, type Look, place } from "./browserkit";
import type { Bars } from "./browserui";
import type { Rect } from "./mock";
import { copyPage, drawing, layoutZoom, rootSize, rootZoom, svgUrl } from "./pageshot";

/**
 * The page under Safari's bottom bars. The frame ends where Safari's viewport
 * does, so `innerHeight`, `dvh` and a fixed `bottom: 0` read as on the phone,
 * but the phone paints the page on below it, under the glass, to the bottom
 * of the screen. The band there shows a picture of the document past the
 * viewport's bottom edge: one picture of the whole document, drawn by the
 * browser through an svg, which a scroll only moves. It is pictured again
 * when the page changes, at most as often as keeps its cost to a tenth of
 * the time. What is pinned to the screen is left out of it, as it stays in
 * the viewport on the phone, and a fixed footer's color is carried down
 * instead, by the screen's fill under the band. A page out of reach shows
 * that fill too.
 */

export const UNDERBAR_CSS = `
.underbar {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
  transform-origin: 0 0;
}
.underbar[hidden] { display: none; }
.underbar > img {
  position: absolute;
  left: 0;
  top: 0;
  max-width: none;
  will-change: transform;
}
`;

/** The least time between two pictures of a page that keeps changing, in ms. */
const GAP = 250;

/** How many times its own cost a picture waits before the next, so pictures take a tenth of the time at most. */
const SHARE = 10;

/** The band under the viewport, in the screen's css px, or null where the page reaches the screen's bottom. */
export function bandRect(page: Rect | null, height: number): Rect | null {
  if (!page) return null;
  const top = page.y + page.height;
  const tall = height - top;
  return tall >= 0.5 ? { x: page.x, y: top, width: page.width, height: tall } : null;
}

/**
 * Does Safari show the page under its bars here? Only where its bars leave a
 * band under the viewport, upright or with a status column, for a page the
 * frame can read, with no fixed footer to carry its color down instead.
 */
export function showsBand(bars: Bars | null, look: Look | null): boolean {
  if (!bars || bars.platform !== "safari" || (!bars.status && !bars.column)) return false;
  return !!look && !look.footer;
}

/**
 * How far up the picture of the document moves in the band, in the screen's
 * css px: the band starts at the viewport's bottom edge, `scrollY` and
 * `innerHeight` down the document, each of its px `scale` of the screen's.
 */
export function bandShift(scrollY: number, innerHeight: number, scale: number): number {
  return -(scrollY + innerHeight) * scale;
}

/** A length in the viewport's units, `vh` and its small, large and dynamic forms. */
const VH = /(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[sld]?vh\b/gi;

/**
 * `css` with every length in viewport heights as the px they come to in a
 * viewport `height` px tall. The picture's own viewport is as tall as the
 * whole document, which would stretch them.
 */
export function viewportUnits(css: string, height: number): string {
  return css.replace(VH, (_, amount: string) => `${Math.round(Number(amount) * height) / 100}px`);
}

/** The picture of a page as an svg, `width` by `height` css px, and its markup's address. */
export interface Picture {
  src: string;
  width: number;
  height: number;
}

/**
 * The whole page in `frame` as an svg as tall as the document, laid out as
 * the frame lays it out, or null where it is out of reach. Its viewport
 * lengths and the root's height are the frame's, and what is fixed to the
 * screen is left out.
 */
export function pictureOf(frame: HTMLIFrameElement): Picture | null {
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc?.documentElement || !view || view.innerWidth <= 0) return null;
  const { innerWidth: width, innerHeight: tall } = view;
  const copy = copyPage(frame, (node) => view.getComputedStyle(node).position === "fixed");
  if (!copy) return null;
  for (const style of copy.querySelectorAll("style")) {
    style.textContent = viewportUnits(style.textContent ?? "", tall);
  }
  for (const node of copy.querySelectorAll("[style]")) {
    node.setAttribute("style", viewportUnits(node.getAttribute("style") ?? "", tall));
  }
  const full = Math.max(doc.documentElement.scrollHeight, tall);
  // The root as tall as the frame's, so a body at 100% is too, as the picture's own viewport is not.
  const root = doc.documentElement.getBoundingClientRect().height;
  const sized = rootSize(doc, view);
  const zoom = layoutZoom(view);
  const zoomed = rootZoom(doc, view, zoom);
  copy.setAttribute("style", `${copy.getAttribute("style") ?? ""};${sized};height:${root}px !important${zoomed}`);
  const markup = new XMLSerializer().serializeToString(copy);
  return { src: svgUrl(drawing(markup, width, full, sized, zoom)), width, height: full };
}

export interface Underbar {
  /** Lay the band over `rect` of the screen, at `zoom`, in the page's `look`, or hide it with null. */
  show(rect: Rect | null, zoom: number, look: Look | null): void;
  /** Follow the page's scroll. */
  move(): void;
  /** Picture the page again: a knob changed how it looks. */
  refresh(): void;
  remove(): void;
}

/** The band under the viewport of `frame`, in `glass`, under the bars. */
export function createUnderbar(glass: HTMLElement, frame: HTMLIFrameElement): Underbar {
  const band = el("div", "underbar");
  band.setAttribute("aria-hidden", "true");
  band.hidden = true;
  glass.append(band);
  let image: HTMLImageElement | null = null;
  let picture: Picture | null = null;
  /** What the picture was taken of: the page, its viewport and the document's height. */
  let taken = "";
  let watched: Document | null = null;
  let observer: MutationObserver | null = null;
  let changed = true;
  let waiting = 0;
  let painting = false;
  let last = 0;
  let cost = 0;
  /** The band's width, in the screen's css px. */
  let wide = 0;

  const keyOf = (): string | null => {
    try {
      const doc = frame.contentDocument;
      const view = frame.contentWindow;
      if (!doc?.documentElement || !view) return null;
      if (doc !== watched) {
        observer?.disconnect();
        const next = new MutationObserver(() => {
          changed = true;
          soon();
        });
        next.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
        observer = next;
        watched = doc;
        changed = true;
        // The last page's picture never shows under the next one.
        image?.remove();
        image = null;
        picture = null;
        taken = "";
      }
      return `${view.innerWidth}|${view.innerHeight}|${doc.documentElement.scrollHeight}`;
    } catch {
      return null;
    }
  };

  const move = () => {
    if (band.hidden || !image || !picture) return;
    try {
      const view = frame.contentWindow;
      if (!view) return;
      const shift = bandShift(view.scrollY, view.innerHeight, wide / picture.width);
      image.style.transform = `translate3d(0, ${shift}px, 0)`;
    } catch {
      // The frame went to another origin.
    }
  };

  const paint = async () => {
    waiting = 0;
    if (band.hidden || painting) return;
    const key = keyOf();
    if (key === null) {
      image?.remove();
      image = null;
      picture = null;
      return;
    }
    if (!changed && key === taken) return;
    painting = true;
    changed = false;
    const start = performance.now();
    let next: Picture | null = null;
    try {
      next = pictureOf(frame);
    } catch {
      next = null;
    }
    const fresh = new Image();
    let drawn = false;
    if (next) {
      fresh.src = next.src;
      drawn = await fresh.decode().then(
        () => true,
        () => false,
      );
    }
    cost = performance.now() - start;
    last = performance.now();
    performance.measure("devknobs underbar picture", { start, duration: cost });
    painting = false;
    if (!next || !drawn) return;
    fresh.alt = "";
    if (image) image.replaceWith(fresh);
    else band.append(fresh);
    image = fresh;
    picture = next;
    taken = key;
    fit();
    // The page may have changed while it was pictured.
    if (changed) soon();
  };

  /** Picture the page again once enough time has gone by since the last. */
  function soon() {
    if (waiting || band.hidden) return;
    const wait = Math.max(0, last + Math.max(GAP, cost * SHARE) - performance.now());
    waiting = window.setTimeout(() => void paint(), wait);
  }

  /** The picture at the band's width, from the document's. */
  function fit() {
    if (!image || !picture) return;
    image.style.width = `${wide}px`;
    image.style.height = `${(picture.height * wide) / picture.width}px`;
    move();
  }

  return {
    show(rect, zoom, look) {
      const on = rect !== null && look !== null;
      band.hidden = !on;
      if (!rect || !look) {
        clearTimeout(waiting);
        waiting = 0;
        return;
      }
      // Drawn at the frame's zoom, from where it sits at that zoom, as the frame is.
      place(band, rect.x * zoom, rect.y * zoom, rect.width, rect.height);
      wide = rect.width;
      band.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
      band.style.background = look.background;
      const key = keyOf();
      if (key !== taken || changed) soon();
      fit();
    },
    move,
    refresh() {
      changed = true;
      soon();
    },
    remove() {
      clearTimeout(waiting);
      observer?.disconnect();
      observer = null;
      watched = null;
      band.remove();
    },
  };
}
