import { ownSelector } from "../mark";
import { drawMedia, type FitStyle, MEDIA, type Media, type MediaNode, mediaOf, svgUrl } from "./pageshot";

/**
 * The real pictures of the page under Safari's bottom bars. A drawing of a
 * copy of the page loads none of its own, so each picture, video, drawing and
 * background picture near the band is read as data and put in the copy,
 * where the browser lays it out, fits it, cuts it at its corners and turns
 * it as it does the page's. One from another origin is asked for again with
 * CORS, which most hosts allow, so it is read too. A picture, video or
 * drawing the frame still may not read is drawn by hand over the copy, in its
 * box, cut off where what holds it cuts it off, and what of the page shows
 * over it, a caption or a button, is drawn back over it from a drawing of the
 * copy with all else hidden. A video with no frame yet, or one that has not
 * played, shows its poster, which is read as a picture is. A video that
 * plays is drawn over the copy too, again at each of its frames. A background
 * picture the frame may not read is left out. Only those near the band are
 * read, and each picture once at the size it shows at. A request the host
 * refuses shows as an error in the page's console, as any way of asking
 * with CORS does, so a same-origin picture is asked for without, each
 * address fails once at most while the page runs, an origin is asked for one
 * address at a time till it allows CORS, and one that refused `REFUSALS` of
 * its pictures is asked for no more. A failed CORS request does not tell a
 * missing file from a refusal, so an origin that has not allowed CORS yet has
 * each address asked for without it first, which the page mostly has already:
 * one that does not come is missing only, counts against no origin and is not
 * asked for with CORS at all; one that comes is asked for with CORS then, and
 * where that fails the host refused CORS, which counts against its origin. An
 * origin that allowed CORS has its addresses asked for with it at once.
 */

/** How far past the band, up and down the document, its pictures are read, in viewport heights: a scroll as far needs no new picture. */
const REACH = 1;
/** At most this many of the page's elements are looked at for a background picture. */
const MOST = 20000;
/** The most px a picture is read at. */
const LARGEST = 4e6;
/** The most device px a css px of the page is read at. */
const SHARPEST = 3;
/** How many characters of the pictures read, and of their addresses, are kept in all. */
const KEEP_LENGTH = 48e6;
/** How many of an origin's addresses fail to come with CORS before none of its others is asked for so. */
const REFUSALS = 2;
/** How many addresses that failed to come are kept, past which the oldest are let go of. */
const MOST_REFUSED = 5000;

/** A stretch of the document, from `top` to `bottom`, in its css px. */
export interface Span {
  top: number;
  bottom: number;
}

/** The stretch of the document whose pictures are read: the band `band` px tall under the viewport, and `REACH` past it each way. */
export function bandSpan(scrollY: number, innerHeight: number, band: number): Span {
  const top = scrollY + innerHeight;
  const reach = innerHeight * REACH;
  return { top: Math.max(0, top - reach), bottom: top + band + reach };
}

/** Is the band, `band` px tall under the viewport, still inside `span`? */
export function inSpan(span: Span, scrollY: number, innerHeight: number, band: number): boolean {
  const top = scrollY + innerHeight;
  return top >= span.top && top + band <= span.bottom;
}

/** Does a box at `rect` in the viewport, scrolled `scrollY`, meet `span`? Only one with an area does. */
export function meets(rect: { top: number; bottom: number; width: number; height: number }, scrollY: number, span: Span): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom + scrollY > span.top && rect.top + scrollY < span.bottom;
}

/**
 * The px a picture `media` px as made is read at, to show in a box `wide` by
 * `tall` css px at `ratio` device px each: no more than it has, nor than the
 * box shows of it at most, as it covers the box, nor than `LARGEST`.
 */
export function readSize(media: { width: number; height: number }, wide: number, tall: number, ratio: number): { width: number; height: number } {
  const shows = ratio * Math.max(wide / media.width, tall / media.height);
  const scale = Math.min(1, shows, Math.sqrt(LARGEST / (media.width * media.height)));
  return { width: Math.max(1, Math.round(media.width * scale)), height: Math.max(1, Math.round(media.height * scale)) };
}

/**
 * A picture `width` by `height` px as made, of `data`, stretched over it: it
 * lays out as the page's picture does, however small `data` was read, and
 * stretches as a picture does where the page fills a box of another shape.
 */
export function sizedPicture(data: string, width: number, height: number, rendering = ""): string {
  const crisp = rendering === "pixelated" || rendering === "crisp-edges" ? ` style="image-rendering:${rendering}"` : "";
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
      `<image href="${data}" width="${width}" height="${height}" preserveAspectRatio="none"${crisp}/></svg>`,
  );
}

/** What `source` shows, `size` px, as data, or null where the frame may not read it. */
function readPixels(source: CanvasImageSource, size: { width: number; height: number }): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    pen.drawImage(source, 0, 0, size.width, size.height);
    // A browser that cannot write webp writes png.
    return canvas.toDataURL("image/webp", 0.9);
  } catch {
    // From another origin, which keeps its px to itself.
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** The pictures read, by address and size, the last read or used last, and null for one that may not be read. */
const kept = new Map<string, string | null>();
let keptLength = 0;

/** The picture kept by `key`, or `read` now and kept, those used longest ago let go past `KEEP_LENGTH`. */
function keptPixels(key: string, read: () => string | null): string | null {
  if (kept.has(key)) {
    const data = kept.get(key) ?? null;
    kept.delete(key);
    kept.set(key, data);
    return data;
  }
  const data = read();
  kept.set(key, data);
  keptLength += key.length + (data?.length ?? 0);
  for (const [old, value] of kept) {
    if (keptLength <= KEEP_LENGTH || old === key) break;
    kept.delete(old);
    keptLength -= old.length + (value?.length ?? 0);
  }
  return data;
}

/** Pictures of the frame's made to read its pictures by, by address: those the last picture of the page used. */
let probes = new Map<string, HTMLImageElement>();

/** Let go of the pictures read and of those made to read them by. */
export function forgetPixels(): void {
  kept.clear();
  keptLength = 0;
  probes.clear();
  asking.clear();
}

/**
 * The addresses that failed to come, how many of each origin's did with
 * CORS, the origins that allowed it, and the one probe each other origin is
 * waiting on, for as long as the page runs, across its documents.
 */
const refused = new Set<string>();
const refusedOrigins = new Map<string, number>();
const allowed = new Set<string>();
const asking = new Map<string, HTMLImageElement>();

/** The origin of `address`, or null where it is no url. */
function originOf(address: string): string | null {
  try {
    return new URL(address).origin;
  } catch {
    return null;
  }
}

/** Is `address`, taken against `base`, of `origin`? A same-origin picture is read as it is, with no CORS to ask for. */
export function sameOrigin(address: string, base: string, origin: string): boolean {
  try {
    return new URL(address, base).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Remember that `address`, of `origin` where it is asked for with CORS, failed
 * to come. Where it was `found` without CORS, the host refused CORS, so it
 * counts against an origin that has not allowed it; one missing only counts
 * against none. Neither is asked for again.
 */
function refuse(address: string, origin: string | null, found: boolean): void {
  if (refused.has(address)) return;
  refused.add(address);
  if (refused.size > MOST_REFUSED) {
    const [oldest] = refused;
    if (oldest !== undefined) refused.delete(oldest);
  }
  if (origin !== null && found && !allowed.has(origin)) refusedOrigins.set(origin, (refusedOrigins.get(origin) ?? 0) + 1);
}

/**
 * A picture in `doc` of what `address` holds, kept in `used`, asked for with
 * CORS where `cors` has it, so one from another origin that allows it can be
 * read. The page has it already, so the browser mostly has it at once; where
 * not, `loaded` is told when it comes, or when it fails to come where another
 * of its origin's waits on it. One of an origin that has not allowed CORS yet
 * is asked for without it first, and with it only once that comes. Null where
 * it is not asked for: it failed to come before, in this document or another,
 * its origin, which has not allowed CORS, refused it `REFUSALS` times, or one
 * of its origin's, which has not allowed CORS yet, is still on the way, whose
 * answer holds for the rest; null too while it is asked for without CORS.
 */
function probeOf(doc: Document, address: string, cors: boolean, loaded: () => void, used: Map<string, HTMLImageElement>): HTMLImageElement | null {
  const known = used.get(address) ?? probes.get(address);
  if (known && known.ownerDocument === doc) {
    used.set(address, known);
    return known;
  }
  const origin = cors ? originOf(address) : null;
  const shut = () => refused.has(address) || (origin !== null && !allowed.has(origin) && (refusedOrigins.get(origin) ?? 0) >= REFUSALS);
  if (shut()) return null;
  const ask = (withCors: boolean) => {
    const image = doc.createElement("img");
    if (withCors) image.crossOrigin = "anonymous";
    image.src = address;
    return image;
  };
  if (origin === null || allowed.has(origin)) {
    const probe = ask(cors);
    if (!probe.complete) {
      probe.addEventListener("load", loaded, { once: true });
      probe.addEventListener("error", () => refuse(address, origin, false), { once: true });
    }
    used.set(address, probe);
    return probe;
  }
  const first = asking.get(origin);
  if (first && first.ownerDocument === doc && !first.complete) return null;
  // Asked for with CORS once it came without: where that fails, the host refused CORS.
  const withCors = () => {
    const probe = ask(true);
    if (probe.complete) {
      if (probe.naturalWidth > 0) allowed.add(origin);
      else refuse(address, origin, true);
      return probe;
    }
    asking.set(origin, probe);
    const settle = (came: boolean) => {
      if (came) allowed.add(origin);
      else refuse(address, origin, true);
      // The next of its origin's waited on it, so it may be asked for now, unless the queue moved on to another request.
      if (asking.get(origin) === probe) {
        asking.delete(origin);
        loaded();
      }
    };
    probe.addEventListener("load", () => settle(true), { once: true });
    probe.addEventListener("error", () => settle(false), { once: true });
    return probe;
  };
  const plain = ask(false);
  if (plain.complete) {
    if (plain.naturalWidth === 0) {
      refuse(address, origin, false);
      return null;
    }
    const probe = withCors();
    used.set(address, probe);
    return probe;
  }
  asking.set(origin, plain);
  plain.addEventListener(
    "load",
    () => {
      if (asking.get(origin) !== plain) return;
      asking.delete(origin);
      // Refused meanwhile, by a request of another document's.
      if (shut()) {
        loaded();
        return;
      }
      const probe = withCors();
      probes.set(address, probe);
      if (probe.complete) loaded();
    },
    { once: true },
  );
  plain.addEventListener(
    "error",
    () => {
      // Missing only: not asked for with CORS, nor again.
      refuse(address, origin, false);
      if (asking.get(origin) === plain) {
        asking.delete(origin);
        loaded();
      }
    },
    { once: true },
  );
  return null;
}

/**
 * A picture in `doc` of what `address` holds, asked for without CORS, kept in
 * `used`, to draw over the copy where it may not be read. The page has it
 * already, so the browser mostly has it at once; where not, `loaded` is told
 * when it comes. Null where it failed to come before.
 */
function plainOf(doc: Document, address: string, loaded: () => void, used: Map<string, HTMLImageElement>): HTMLImageElement | null {
  const key = `plain|${address}`;
  const known = used.get(key) ?? probes.get(key);
  if (known && known.ownerDocument === doc) {
    used.set(key, known);
    return known;
  }
  if (refused.has(key)) return null;
  const image = doc.createElement("img");
  image.src = address;
  if (!image.complete) {
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", () => refuse(key, null, false), { once: true });
  }
  used.set(key, image);
  return image;
}

/** Does `video` show its poster, not a frame: it has none yet, or it has not played and stands at its start. */
function showsPoster(video: HTMLVideoElement): boolean {
  if (!video.poster) return false;
  return video.readyState < 2 || (video.paused && video.played.length === 0 && video.currentTime === 0);
}

/** `value`, a list such as computed backgrounds are, cut at the commas outside its brackets. */
export function layersOf(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of value) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(part.trim());
      part = "";
    } else part += char;
  }
  parts.push(part.trim());
  return parts;
}

/** The address of a layer that is one `url(...)`, or null for a gradient, `none` or anything else. */
export function urlOf(layer: string): string | null {
  const found = /^url\(\s*(["']?)(.*)\1\s*\)$/s.exec(layer);
  return found?.[2] ?? null;
}

/** The `object-fit` a video or drawing has, as the background size that fits it the same way in a box `wide` by `tall`. */
function sizeOf(fit: string, media: Media, wide: number, tall: number): string {
  if (fit === "cover" || fit === "contain") return fit;
  if (fit === "none") return "auto";
  if (fit === "scale-down") return media.width > wide || media.height > tall ? "contain" : "auto";
  return "100% 100%";
}

/** A box in the document, in its css px. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A picture the frame may not read, where it shows in the document, fitted by `style`, and the canvas made to draw it from, to let go of once drawn. */
export interface Unread {
  media: Media;
  rect: Box;
  style: FitStyle;
  made?: HTMLCanvasElement;
  /** The box of what holds it and cuts it off, and the radius of its corners, where something does. */
  clip?: { rect: Box; radius: number };
  /** Does something else of the page show over it, to draw back over it? */
  covered?: boolean;
  /** The video it is, where it plays, to draw again at each of its frames. */
  live?: HTMLVideoElement;
}

/** What goes into the copy of the page near the band, and what is drawn over it. */
export interface BandMedia {
  /** For each element whose pictures are read: what to set on its copy. */
  fills: Map<Element, (copy: Element) => void>;
  /** What the frame may not read, in the order to draw it. */
  unread: Unread[];
  /** What of the page shows over what the frame may not read, drawn back over it. */
  above: Set<Element>;
}

/**
 * The box of the nearest element holding `node` that cuts what it holds off,
 * and its corner's radius, or undefined where none does. The body and the
 * root of `doc` are left out: what they cut off is the viewport's.
 */
function clipOf(node: Element, doc: Document, view: Window, boxOf: (rect: DOMRect) => Box): Unread["clip"] {
  for (let at = node.parentElement; at && at !== doc.body && at !== doc.documentElement; at = at.parentElement) {
    const style = view.getComputedStyle(at);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    return { rect: boxOf(at.getBoundingClientRect()), radius: Number.parseFloat(style.borderTopLeftRadius) || 0 };
  }
  return undefined;
}

/** Is `node` pinned to the screen, by itself or by what holds it? The copy leaves those out. */
function pinned(node: Element, view: Window): boolean {
  for (let at: Element | null = node; at; at = at.parentElement) {
    if (view.getComputedStyle(at).position === "fixed") return true;
  }
  return false;
}

/** Does `node` show, not hidden or wholly see-through by itself or what holds it? Where the browser cannot tell, it does. */
function visible(node: Element): boolean {
  if (typeof node.checkVisibility !== "function") return true;
  // The older names too, for a browser that knows only those.
  return node.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true });
}

/** Do the boxes `a` and `b` share more than half a px each way? */
function overlap(a: DOMRect, b: DOMRect): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
}

/** A picture, video or drawing the frame may not read, where it shows in the viewport, and how to draw it over the copy. */
interface Pending {
  node: Element;
  rect: DOMRect;
  draw: () => Unread | null;
}

/** A `display` whose children a `z-index` stacks without a `position`. */
const STACKS_CHILDREN = new Set(["flex", "inline-flex", "grid", "inline-grid"]);

/** Is `value`, a computed property that is `initial` where it does nothing, set? */
const inEffect = (value: string | undefined, initial = "none") => (value || initial) !== initial;

/** Does the space-separated `value` name one of `words`? */
const names = (value: string | undefined, words: Set<string>) => (value ?? "").split(/[\s,]+/).some((word) => words.has(word));

/** The `contain` values that make a stacking context. */
const CONTAINS = new Set(["paint", "layout", "strict", "content"]);

/** The `container-type` values that make one. */
const CONTAINERS = new Set(["size", "inline-size"]);

/** What a `will-change` may name that makes one. */
const CHANGES = new Set(["transform", "opacity", "filter", "scale", "rotate", "translate", "isolation", "mix-blend-mode", "perspective", "clip-path", "mask", "contain"]);

/** The box that lays `node` out: what holds it, past any `display: contents` that makes no box. */
function boxOf(node: Element, view: Window): CSSStyleDeclaration | null {
  for (let at = node.parentElement; at; at = at.parentElement) {
    const style = view.getComputedStyle(at);
    if (style.display !== "contents") return style;
  }
  return null;
}

/** Does `style`, besides a `z-index`, make a stacking context? */
function contextOf(style: CSSStyleDeclaration): boolean {
  return (
    style.position === "fixed" ||
    style.position === "sticky" ||
    inEffect(style.transform) ||
    inEffect(style.scale) ||
    inEffect(style.rotate) ||
    inEffect(style.translate) ||
    inEffect(style.filter) ||
    inEffect(style.backdropFilter) ||
    inEffect(style.perspective) ||
    inEffect(style.clipPath) ||
    inEffect(style.maskImage) ||
    inEffect(style.webkitMaskImage) ||
    inEffect(style.mixBlendMode, "normal") ||
    Number.parseFloat(style.opacity) < 1 ||
    style.isolation === "isolate" ||
    names(style.contain, CONTAINS) ||
    names(style.containerType, CONTAINERS) ||
    names(style.willChange, CHANGES)
  );
}

/**
 * How high `node` stacks among what else `top` holds, as near as its own
 * style and that of what holds it under `top` tell: 0 in the flow, below it
 * for a negative `z-index`, above it where it or what holds it is positioned
 * or makes a stacking context, and higher for a higher `z-index`. A
 * `z-index` counts only on one positioned or laid out by a flex or grid, as
 * a browser computes it on any. The outermost that makes a stacking context
 * sets it, as the rest paints in that; one positioned that makes none lifts
 * only what nothing in it lifted yet. A `display: contents` makes no box, so
 * its own style does nothing.
 */
function rankOf(node: Element, top: Element, view: Window): number {
  let rank = 0;
  for (let at: Element | null = node; at && at !== top; at = at.parentElement) {
    const style = view.getComputedStyle(at);
    if (style.display === "contents") continue;
    const positioned = style.position !== "static";
    const holder = boxOf(at, view)?.display;
    const z = positioned || (holder && STACKS_CHILDREN.has(holder)) ? Number.parseInt(style.zIndex, 10) : Number.NaN;
    if (Number.isFinite(z) || contextOf(style)) rank = !Number.isFinite(z) || z === 0 ? 1 : z < 0 ? z : 1 + z;
    else if (positioned && rank === 0) rank = 1;
  }
  return rank;
}

/** Does `node`, after `media` in the document where `after` has it, paint over it? Stacked higher, or as high and later. */
function paintsOver(node: Element, media: Element, after: boolean, view: Window): boolean {
  let top = node.parentElement;
  while (top && !top.contains(media)) top = top.parentElement;
  if (!top) return false;
  const rank = rankOf(node, top, view) - rankOf(media, top, view);
  return rank > 0 || (rank === 0 && after);
}

/**
 * Those of `pending` that something else of the page in `doc`, not knobs'
 * own (`own`), shows over, and what does. An overlay is drawn over the whole
 * copy, so it would cover a caption, a heading or a button laid over the
 * picture: those are drawn back over it. An element that shows, other than
 * the picture itself and what holds it, whose box meets the picture's and
 * that paints over it counts; what is pinned to the screen does not, as the
 * copy leaves it out.
 */
function covered(doc: Document, view: Window, own: string, pending: Pending[]): { over: Set<Element>; above: Set<Element> } {
  const over = new Set<Element>();
  const above = new Set<Element>();
  const nodes = new Set(pending.map((one) => one.node));
  /** The pictures met so far, in the document's order: what comes after one is after it. */
  const met = new Set<Element>();
  const all = doc.documentElement.getElementsByTagName("*");
  for (let index = 0; index < all.length && index < MOST; index++) {
    const node = all[index];
    if (!node) continue;
    if (nodes.has(node)) met.add(node);
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    for (const one of pending) {
      if (node === one.node || node.contains(one.node) || !overlap(rect, one.rect)) continue;
      if (!visible(node) || node.closest(own) || pinned(node, view) || !paintsOver(node, one.node, met.has(one.node), view)) continue;
      over.add(one.node);
      above.add(node);
    }
  }
  return { over, above };
}

/**
 * The pictures, videos, drawings and background pictures of the page in
 * `doc` that meet `span`, read for its copy, the page scrolled `scrollY`
 * down the copy. `loaded` is told when a background picture comes that was
 * not there yet.
 */
export function bandMedia(doc: Document, view: Window, span: Span, loaded: () => void, scrollY = view.scrollY): BandMedia {
  const fills = new Map<Element, (copy: Element) => void>();
  const pending: Pending[] = [];
  const used = new Map<string, HTMLImageElement>();
  const ratio = Math.min(SHARPEST, Math.max(1, view.devicePixelRatio || 1));
  const { scrollX } = view;
  const own = ownSelector();
  const origin = view.location.origin;
  const boxOf = (rect: DOMRect): Box => ({ left: rect.left + scrollX, top: rect.top + scrollY, width: rect.width, height: rect.height });
  const add = (node: Element, put: (copy: Element) => void) => {
    const before = fills.get(node);
    fills.set(node, before ? (copy) => (before(copy), put(copy)) : put);
  };
  const restyle = (copy: Element, css: string) => copy.setAttribute("style", `${copy.getAttribute("style") ?? ""};${css}`);
  /** Put `data`, what the video or drawing `node` shows, `media` px as made, on its copy as a background, fitted as the page fits it. */
  const fill = (node: MediaNode, rect: DOMRect, style: CSSStyleDeclaration, media: Media, data: string) => {
    const px = (value: string) => Number.parseFloat(value) || 0;
    const wide = rect.width - px(style.borderLeftWidth) - px(style.paddingLeft) - px(style.borderRightWidth) - px(style.paddingRight);
    const tall = rect.height - px(style.borderTopWidth) - px(style.paddingTop) - px(style.borderBottomWidth) - px(style.paddingBottom);
    const picture = sizedPicture(data, media.width, media.height, style.imageRendering);
    // A copy of a video has no frame to be as large as, so it is told its size: its frame's where it has one, else its poster's.
    const size = "videoWidth" in node ? (node.videoWidth > 0 ? { width: node.videoWidth, height: node.videoHeight } : media) : null;
    add(node, (copy) => {
      if (size && !copy.hasAttribute("width") && !copy.hasAttribute("height")) {
        copy.setAttribute("width", String(size.width));
        copy.setAttribute("height", String(size.height));
      }
      restyle(
        copy,
        `background-image:url("${picture}") !important;background-size:${sizeOf(style.objectFit, media, wide, tall)} !important;` +
          `background-position:${style.objectPosition} !important;background-repeat:no-repeat !important;background-origin:content-box !important`,
      );
    });
  };

  for (const node of doc.querySelectorAll<MediaNode>(MEDIA)) {
    const rect = node.getBoundingClientRect();
    if (!meets(rect, scrollY, span) || node.closest(own)) continue;
    if ("videoWidth" in node && showsPoster(node)) {
      if (pinned(node, view)) continue;
      // Its poster, read as a picture is: with CORS only where it is of another origin, which asks without it first.
      const address = node.poster;
      const style = view.getComputedStyle(node);
      const cors = !sameOrigin(address, doc.baseURI, origin);
      const probe = probeOf(doc, address, cors, loaded, used);
      const media = probe && mediaOf(probe);
      if (probe && media) {
        const size = readSize(media, rect.width, rect.height, ratio);
        const data = keptPixels(`${address}|${cors ? "cors|" : ""}${size.width}x${size.height}`, () => readPixels(probe, size));
        if (data !== null) {
          fill(node, rect, style, media, data);
          continue;
        }
      }
      // One the frame may not read is drawn over the copy, from a picture asked for as the page asked for it.
      const plain = visible(node) ? plainOf(doc, address, loaded, used) : null;
      const shown = plain && mediaOf(plain);
      if (shown) pending.push({ node, rect, draw: () => ({ media: shown, rect: boxOf(rect), style, clip: clipOf(node, doc, view, boxOf) }) });
      continue;
    }
    const media = mediaOf(node);
    if (!media || pinned(node, view)) continue;
    const style = view.getComputedStyle(node);
    if ("naturalWidth" in node) {
      const address = node.currentSrc || node.src;
      // A picture that is data already loads in the copy as it is.
      if (address.startsWith("data:")) {
        add(node, (copy) => copy.setAttribute("src", address));
        continue;
      }
      // One picked from a set by its density has more px than its size as made: up to the device's.
      const dense = node.srcset || node.parentElement?.localName === "picture" ? ratio : 1;
      const size = readSize({ width: media.width * dense, height: media.height * dense }, rect.width, rect.height, ratio);
      const sized = `${size.width}x${size.height}`;
      let data = keptPixels(`${address}|${sized}`, () => readPixels(node, size));
      if (data === null) {
        // From another origin: asked for again with CORS, which reads where its host allows it.
        const probe = probeOf(doc, address, true, loaded, used);
        if (probe && mediaOf(probe)) data = keptPixels(`${address}|cors|${sized}`, () => readPixels(probe, size));
      }
      if (data !== null) {
        const read = data;
        add(node, (copy) => copy.setAttribute("src", sizedPicture(read, media.width, media.height, style.imageRendering)));
        continue;
      }
      if (!visible(node)) continue;
      pending.push({
        node,
        rect,
        draw: () => {
          // Drawn whole on a canvas of its own first: a part of a picture is cut by its px, not by its size as made.
          const whole = document.createElement("canvas");
          whole.width = size.width;
          whole.height = size.height;
          try {
            whole.getContext("2d")?.drawImage(node, 0, 0, size.width, size.height);
          } catch {
            whole.width = 0;
            whole.height = 0;
            return null;
          }
          const drawn = { source: whole, width: media.width, height: media.height, scale: size.width / media.width };
          return { media: drawn, rect: boxOf(rect), style, made: whole, clip: clipOf(node, doc, view, boxOf) };
        },
      });
      continue;
    }
    // A video that plays is drawn over the copy at each of its frames, which no picture of the copy keeps up with.
    if ("videoWidth" in node && !node.paused) {
      if (visible(node)) pending.push({ node, rect, draw: () => ({ media, rect: boxOf(rect), style, clip: clipOf(node, doc, view, boxOf), live: node }) });
      continue;
    }
    const size = readSize(media, rect.width, rect.height, ratio);
    // A paused video or a drawing may show something else by the next picture, so it is read each time.
    const data = readPixels(node, size);
    if (data === null) {
      if (visible(node)) pending.push({ node, rect, draw: () => ({ media, rect: boxOf(rect), style, clip: clipOf(node, doc, view, boxOf) }) });
      continue;
    }
    fill(node, rect, style, media, data);
  }

  const all = doc.documentElement.getElementsByTagName("*");
  for (let index = 0; index < all.length && index < MOST; index++) {
    const node = all[index];
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    if (!meets(rect, scrollY, span)) continue;
    const style = view.getComputedStyle(node);
    const value = style.backgroundImage;
    if (!value?.includes("url(") || node.closest(own) || pinned(node, view)) continue;
    let read = false;
    // One the frame may not read stays as it is, which the copy shows as its color only.
    const shown = layersOf(value).map((layer) => {
      const address = urlOf(layer);
      if (address === null || address.startsWith("data:")) return layer;
      const cors = !sameOrigin(address, doc.baseURI, origin);
      const probe = probeOf(doc, address, cors, loaded, used);
      const media = probe && mediaOf(probe);
      if (!media) return layer;
      const size = readSize(media, rect.width, rect.height, ratio);
      // Kept by the same key as a picture of the page read with CORS, not as one read as it is, which may not be read.
      const data = keptPixels(`${address}|${cors ? "cors|" : ""}${size.width}x${size.height}`, () => readPixels(probe, size));
      if (data === null) return layer;
      read = true;
      return `url("${sizedPicture(data, media.width, media.height, style.imageRendering)}")`;
    });
    if (read) {
      const css = `background-image:${shown.join(", ")} !important`;
      add(node, (copy) => restyle(copy, css));
    }
  }
  probes = used;

  const { over, above } = pending.length > 0 ? covered(doc, view, own, pending) : { over: new Set<Element>(), above: new Set<Element>() };
  const unread: Unread[] = [];
  for (const one of pending) {
    const drawn = one.draw();
    if (drawn) unread.push(over.has(one.node) ? { ...drawn, covered: true } : drawn);
  }
  return { fills, unread, above };
}

/** What the frame may not read near the band, or a video that plays there, drawn by hand, and the stretch of the document it covers. */
export interface Overlay {
  canvas: HTMLCanvasElement;
  span: Span;
  /** The document's width in css px, and the canvas's px to a css px. */
  width: number;
  ratio: number;
  /** The videos on it that play, to draw again at each of their frames. */
  live: Unread[];
  /**
   * What of the page shows over it, to draw back over it once decoded: a
   * drawing of the copy with all else hidden, and the pictures it shows over.
   */
  above: { src: string; parts: Unread[] } | null;
}

/** Cut `pen` off at the box `one` shows in, and at what holds it, where something does. */
function clipTo(pen: CanvasRenderingContext2D, one: Pick<Unread, "rect" | "clip">): void {
  const { rect, clip } = one;
  if (clip) {
    pen.beginPath();
    pen.roundRect(clip.rect.left, clip.rect.top, clip.rect.width, clip.rect.height, clip.radius);
    pen.clip();
  }
  pen.beginPath();
  pen.rect(rect.left, rect.top, rect.width, rect.height);
  pen.clip();
}

/** Draw `one` with `pen`, in its box, cut off where what holds it cuts it off. */
function drawOne(pen: CanvasRenderingContext2D, one: Unread): void {
  pen.save();
  try {
    if (one.clip) {
      pen.beginPath();
      pen.roundRect(one.clip.rect.left, one.clip.rect.top, one.clip.rect.width, one.clip.rect.height, one.clip.radius);
      pen.clip();
    }
    drawMedia(pen, one.media, one.rect, one.style);
  } catch {
    // A picture that will not draw is left out.
  }
  pen.restore();
}

/**
 * Draw `unread`, in a document `width` css px wide, on a canvas over `span` of
 * it, `ratio` px to its css px, or null where there is nothing to draw. Only
 * shown, never read, so a picture from another origin draws on it too.
 * `above`, a drawing of what of the page shows over those covered, is drawn
 * back over them with `drawAbove`.
 */
export function overlayOf(unread: Unread[], span: Span, width: number, ratio: number, above: string | null = null): Overlay | null {
  if (unread.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round((span.bottom - span.top) * ratio));
  const pen = canvas.getContext("2d");
  if (!pen) return null;
  pen.setTransform(ratio, 0, 0, ratio, 0, -span.top * ratio);
  for (const one of unread) {
    drawOne(pen, one);
    if (one.made) {
      one.made.width = 0;
      one.made.height = 0;
    }
  }
  const parts = unread.filter((one) => one.covered);
  return { canvas, span, width, ratio, live: unread.filter((one) => one.live), above: above && parts.length > 0 ? { src: above, parts } : null };
}

/**
 * `image`, the drawing `overlay.above` names, drawn once on a canvas as large
 * as the overlay, over the same stretch: a video that plays has it drawn back
 * over each of its frames, which the drawing itself is too large to be at
 * that pace. Null where it will not draw.
 */
export function raiseOf(overlay: Overlay, image: CanvasImageSource): HTMLCanvasElement | null {
  const { span, width, ratio } = overlay;
  const canvas = document.createElement("canvas");
  canvas.width = overlay.canvas.width;
  canvas.height = overlay.canvas.height;
  const pen = canvas.getContext("2d");
  if (!pen) return null;
  const tall = span.bottom - span.top;
  pen.setTransform(ratio, 0, 0, ratio, 0, -span.top * ratio);
  try {
    pen.drawImage(image, 0, span.top, width, tall, 0, span.top, width, tall);
  } catch {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }
  return canvas;
}

/** Draw `raised`, from `raiseOf`, over the overlay where what it shows covers a picture drawn on it: over `only` alone where given. */
export function drawAbove(overlay: Overlay, raised: CanvasImageSource, only?: Unread): void {
  const { canvas, span, width, ratio, above } = overlay;
  const pen = above && canvas.getContext("2d");
  if (!above || !pen) return;
  pen.setTransform(ratio, 0, 0, ratio, 0, -span.top * ratio);
  for (const part of above.parts) {
    if (only && part !== only) continue;
    pen.save();
    try {
      clipTo(pen, part);
      pen.drawImage(raised, 0, span.top, width, span.bottom - span.top);
    } catch {
      // A drawing that will not draw leaves the pictures as they are.
    }
    pen.restore();
  }
}

/** Draw `one`, a video that plays on the overlay, again as it shows now, and `raised`, what shows over it, back over it. */
export function redrawLive(overlay: Overlay, one: Unread, raised: CanvasImageSource | null): void {
  const { canvas, span, ratio } = overlay;
  const pen = canvas.getContext("2d");
  if (!pen) return;
  pen.setTransform(ratio, 0, 0, ratio, 0, -span.top * ratio);
  pen.save();
  clipTo(pen, one);
  pen.clearRect(one.rect.left, one.rect.top, one.rect.width, one.rect.height);
  pen.restore();
  drawOne(pen, one);
  if (raised && one.covered) drawAbove(overlay, raised, one);
}
