import { bandMedia, bandSpan, forgetPixels, inSpan, meets, type Overlay, overlayOf, type Span } from "./bandmedia";
import { el, type Look, place } from "./browserkit";
import type { Bars } from "./browserui";
import type { Rect } from "./mock";
import { copyPage, cuts, drawing, layoutZoom, MEDIA, ownZoom, rootSize, rootZoom, svgUrl, viewportOverflow } from "./pageshot";

/**
 * The page under Safari's bottom bars. The frame ends where Safari's viewport
 * does, so `innerHeight`, `dvh` and a fixed `bottom: 0` read as on the phone,
 * but the phone paints the page on below it, under the glass, to the bottom
 * of the screen. The band there shows a picture of the document past the
 * viewport's bottom edge: one picture of the whole document, drawn by the
 * browser through an svg, which a scroll only moves. It is pictured again
 * when the page changes, at most as often as keeps its cost to a tenth of
 * the time, and when the band scrolls past the pictures read for it. The
 * pictures, videos and drawings near the band are in it as they show, which
 * a drawing of the copy could not load (see `bandmedia.ts`). What is pinned
 * to the screen is left out of it, as it stays in the viewport on the phone,
 * and a fixed footer's color is carried down instead, by the screen's fill
 * under the band. A page out of reach shows that fill too. A page that
 * scrolls in its body, not in its document, shows its body's content past
 * the viewport, as far down as the body is scrolled.
 */

export const UNDERBAR_CSS = `
.underbar {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
  transform-origin: 0 0;
}
.underbar[hidden] { display: none; }
.underbar > img,
.underbar > canvas {
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

/**
 * The body of the page in `doc`, where the page scrolls in it and not in its
 * document: the root's overflow went to the viewport, so the body keeps its
 * own, which scrolls up and down. Null where the document scrolls.
 */
export function bodyScroller(doc: Document, view: Window): HTMLElement | null {
  const { body } = doc;
  if (!body || viewportOverflow(doc, view) !== doc.documentElement) return null;
  const { overflowY } = view.getComputedStyle(body);
  // One that clips makes no scroll container.
  return cuts(overflowY) && overflowY !== "clip" ? body : null;
}

/** How far down the page in `doc` is scrolled, in its document and in a body that scrolls, in css px. */
export function scrollOf(doc: Document, view: Window): number {
  return view.scrollY + (bodyScroller(doc, view)?.scrollTop ?? 0);
}

/** How tall the page in `doc` is laid out in its copy, a body that scrolls laid out whole, in css px. */
function heightOf(doc: Document, view: Window): number {
  const full = doc.documentElement.scrollHeight;
  const body = bodyScroller(doc, view);
  if (!body) return full;
  return Math.max(full, body.getBoundingClientRect().top + view.scrollY + body.clientTop + body.scrollHeight);
}

/**
 * Lay the copy of a body that scrolls, `copy`, out whole, cut off at its
 * sides only, as it shows past the viewport. It stays a formatting context of
 * its own, so its content's margins lay out as the page's do.
 */
function unscroll(copy: Element, body: HTMLElement, view: Window): void {
  const style = view.getComputedStyle(body);
  const own = style.display === "block" ? ";display:flow-root !important" : "";
  copy.setAttribute("style", `${copy.getAttribute("style") ?? ""};overflow-x:clip !important;overflow-y:visible !important${own}`);
}

/** The picture of a page as an svg, `width` by `height` css px, and its markup's address. */
export interface Picture {
  src: string;
  width: number;
  height: number;
  /** The stretch of the document whose pictures it shows, or null where the page has none to show. */
  span: Span | null;
  /** What the frame may not read near the band, drawn by hand over it. */
  overlay: Overlay | null;
}

/** Is `target` a picture or a video? Told apart by what it has, as the frame's elements are not of this window's classes. */
function isMedia(target: EventTarget | null): target is HTMLImageElement | HTMLVideoElement {
  return target !== null && "currentSrc" in target;
}

/** Is a load of `target`, in a page scrolled `scrollY`, one of a picture or video that meets `span`? */
function nearLoad(target: EventTarget | null, scrollY: number, span: Span): boolean {
  if (!isMedia(target)) return false;
  return meets(target.getBoundingClientRect(), scrollY, span);
}

/**
 * The whole page in `frame` as an svg as tall as the document, laid out as
 * the frame lays it out, or null where it is out of reach. Its viewport
 * lengths and the root's height are the frame's, and what is fixed to the
 * screen is left out. The pictures near the band, `band` of the document's
 * css px tall under the viewport, are in it, and `loaded` is told when one
 * comes that was not there yet.
 */
export function pictureOf(frame: HTMLIFrameElement, band = 0, loaded: () => void = () => {}): Picture | null {
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc?.documentElement || !view || view.innerWidth <= 0) return null;
  const { innerWidth: width, innerHeight: tall } = view;
  const scrolled = scrollOf(doc, view);
  const span = bandSpan(scrolled, tall, band);
  const media = bandMedia(doc, view, span, loaded, scrolled);
  /** What goes into the copies of the pictures, once the copy's viewport lengths are px: data has none. */
  const puts: (() => void)[] = [];
  const copy = copyPage(
    frame,
    (node) => view.getComputedStyle(node).position === "fixed",
    (node, copied) => {
      const put = media.fills.get(node);
      if (put) puts.push(() => put(copied));
    },
  );
  if (!copy) return null;
  for (const style of copy.querySelectorAll("style")) {
    style.textContent = viewportUnits(style.textContent ?? "", tall);
  }
  for (const node of copy.querySelectorAll("[style]")) {
    node.setAttribute("style", viewportUnits(node.getAttribute("style") ?? "", tall));
  }
  for (const put of puts) put();
  const scroller = bodyScroller(doc, view);
  const body = scroller ? copy.querySelector("body") : null;
  if (scroller && body) unscroll(body, scroller, view);
  const full = Math.max(heightOf(doc, view), tall);
  // The root as tall as the frame's, so a body at 100% is too, as the picture's own viewport is not.
  // Its box has the root's own zoom in it already, which its zoomed height would add again.
  const root = doc.documentElement.getBoundingClientRect().height / ownZoom(doc, view);
  const sized = rootSize(doc, view);
  const zoom = layoutZoom(view);
  const zoomed = rootZoom(doc, view, zoom);
  copy.setAttribute("style", `${copy.getAttribute("style") ?? ""};${sized};height:${root}px !important${zoomed}`);
  const markup = new XMLSerializer().serializeToString(copy);
  // A page with no pictures anywhere needs no new picture as it scrolls.
  const shows = doc.querySelector(MEDIA) !== null || /url\(\s*(?!["']?data:|&quot;data:)/i.test(markup);
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  return {
    src: svgUrl(drawing(markup, width, full, sized, zoom)),
    width,
    height: full,
    span: shows ? span : null,
    overlay: overlayOf(media.unread, span, width, ratio),
  };
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
  /** What the frame may not read near the band, over the picture. */
  let cover: HTMLCanvasElement | null = null;
  /** What the picture was taken of: the page, its viewport and the document's height. */
  let taken = "";
  let watched: Document | null = null;
  let observer: MutationObserver | null = null;
  let changed = true;
  let waiting = 0;
  let painting = false;
  let last = 0;
  let cost = 0;
  /** The band's width and height, in the screen's css px. */
  let wide = 0;
  let high = 0;

  /** Picture the page again: it changed, or the pictures near the band did. */
  const again = () => {
    changed = true;
    soon();
  };
  /** The band's height in the document's css px, `across` of them as wide as the band. */
  const bandOf = (across: number) => (wide > 0 ? (high * across) / wide : 0);
  /** A picture or video near the band came in, which no change to the page tells of. */
  const onLoad = (event: Event) => {
    try {
      const view = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!view || !doc || band.hidden) return;
      const scrolled = scrollOf(doc, view);
      const span = bandSpan(scrolled, view.innerHeight, bandOf(view.innerWidth));
      if (nearLoad(event.target, scrolled, span)) again();
    } catch {
      // The frame went to another origin.
    }
  };
  /** A body that scrolls moved, which the frame's window does not hear of. */
  const onScroll = (event: Event) => {
    if (event.target === watched?.body) move();
  };
  const dropCover = () => {
    if (!cover) return;
    cover.remove();
    cover.width = 0;
    cover.height = 0;
    cover = null;
  };

  const keyOf = (): string | null => {
    try {
      const doc = frame.contentDocument;
      const view = frame.contentWindow;
      if (!doc?.documentElement || !view) return null;
      if (doc !== watched) {
        observer?.disconnect();
        watched?.removeEventListener("load", onLoad, true);
        watched?.removeEventListener("loadeddata", onLoad, true);
        watched?.removeEventListener("scroll", onScroll, true);
        const next = new MutationObserver(again);
        next.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
        // Loads go on in the capture, as they do not bubble.
        doc.addEventListener("load", onLoad, true);
        doc.addEventListener("loadeddata", onLoad, true);
        // A scroll does not bubble either.
        doc.addEventListener("scroll", onScroll, true);
        observer = next;
        watched = doc;
        changed = true;
        // The last page's picture never shows under the next one.
        image?.remove();
        image = null;
        picture = null;
        dropCover();
        taken = "";
      }
      return `${view.innerWidth}|${view.innerHeight}|${heightOf(doc, view)}`;
    } catch {
      return null;
    }
  };

  const move = () => {
    if (band.hidden || !image || !picture) return;
    try {
      const view = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!view || !doc) return;
      const scale = wide / picture.width;
      const scrolled = scrollOf(doc, view);
      const shift = bandShift(scrolled, view.innerHeight, scale);
      image.style.transform = `translate3d(0, ${shift}px, 0)`;
      if (cover && picture.overlay) cover.style.transform = `translate3d(0, ${shift + picture.overlay.span.top * scale}px, 0)`;
      // Scrolled past the pictures read for the band: read those it meets now.
      if (picture.span && !inSpan(picture.span, scrolled, view.innerHeight, bandOf(picture.width))) again();
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
      dropCover();
      return;
    }
    if (!changed && key === taken) return;
    painting = true;
    changed = false;
    const start = performance.now();
    let next: Picture | null = null;
    try {
      next = pictureOf(frame, bandOf(frame.contentWindow?.innerWidth ?? 0), again);
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
    if (!next || !drawn) {
      if (next?.overlay) next.overlay.canvas.width = 0;
      return;
    }
    fresh.alt = "";
    if (image) image.replaceWith(fresh);
    else band.append(fresh);
    image = fresh;
    picture = next;
    dropCover();
    cover = next.overlay?.canvas ?? null;
    if (cover) band.append(cover);
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
    if (cover && picture.overlay) {
      const { span } = picture.overlay;
      cover.style.width = `${wide}px`;
      cover.style.height = `${((span.bottom - span.top) * wide) / picture.width}px`;
    }
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
      high = rect.height;
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
      watched?.removeEventListener("load", onLoad, true);
      watched?.removeEventListener("loadeddata", onLoad, true);
      watched?.removeEventListener("scroll", onScroll, true);
      watched = null;
      dropCover();
      forgetPixels();
      band.remove();
    },
  };
}
