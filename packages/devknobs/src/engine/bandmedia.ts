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
 * box, cut off where what holds it cuts it off, but only where nothing else
 * of the page shows over it, as the overlay would cover that. A background
 * picture the frame may not read is left out. Only those near the band are
 * read, and each picture once at the size it shows at. A request the host
 * refuses shows as an error in the page's console, as any way of asking
 * with CORS does, so a same-origin picture is asked for without, each
 * address fails once at most while the page runs, an origin is asked for one
 * address at a time till it allows CORS, and one that refused `REFUSALS` of
 * its pictures the page has is asked for no more. A background picture that
 * fails may be missing only, so it counts against no origin.
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
 * Remember that `address` failed to come, asked for with CORS of `origin`, or
 * without where that is null. Where the page's own picture of it came,
 * `exists`, it failed for CORS, so it counts against an origin that has not
 * allowed CORS; one that may be missing only is not asked for again.
 */
function refuse(address: string, origin: string | null, exists: boolean): void {
  if (origin !== null) asking.delete(origin);
  if (refused.has(address)) return;
  refused.add(address);
  if (refused.size > MOST_REFUSED) {
    const [oldest] = refused;
    if (oldest !== undefined) refused.delete(oldest);
  }
  if (origin !== null && exists && !allowed.has(origin)) refusedOrigins.set(origin, (refusedOrigins.get(origin) ?? 0) + 1);
}

/**
 * A picture in `doc` of what `address` holds, kept in `used`, asked for with
 * CORS where `cors` has it, so one from another origin that allows it can be
 * read. The page has it already, so the browser mostly has it at once; where
 * not, `loaded` is told when it comes, or when it fails to come where
 * another of its origin's waits on it. `exists` where the page's own picture
 * of it came, so a failure is a refusal. Null where it is not asked for: it
 * failed to come before, in this document or another, its origin, which has
 * not allowed CORS, refused it `REFUSALS` times, or one of its origin's, which
 * has not allowed CORS yet, is still on the way, whose answer holds for the rest.
 */
function probeOf(
  doc: Document,
  address: string,
  cors: boolean,
  loaded: () => void,
  used: Map<string, HTMLImageElement>,
  exists = false,
): HTMLImageElement | null {
  const known = used.get(address) ?? probes.get(address);
  if (known && known.ownerDocument === doc) {
    used.set(address, known);
    return known;
  }
  const origin = cors ? originOf(address) : null;
  if (refused.has(address) || (origin !== null && !allowed.has(origin) && (refusedOrigins.get(origin) ?? 0) >= REFUSALS)) return null;
  const first = origin === null || allowed.has(origin) ? undefined : asking.get(origin);
  if (first && first.ownerDocument === doc && !first.complete) return null;
  const probe = doc.createElement("img");
  if (cors) probe.crossOrigin = "anonymous";
  probe.src = address;
  if (probe.complete) {
    if (origin !== null && probe.naturalWidth > 0) allowed.add(origin);
  } else {
    if (origin !== null && !allowed.has(origin)) asking.set(origin, probe);
    const come = () => {
      if (origin !== null) {
        allowed.add(origin);
        asking.delete(origin);
      }
      loaded();
    };
    probe.addEventListener("load", come, { once: true });
    const fail = () => {
      // The next of its origin's waited on it, so it may be asked for now.
      const waited = origin !== null && asking.get(origin) === probe;
      refuse(address, origin, exists);
      if (waited) loaded();
    };
    probe.addEventListener("error", fail, { once: true });
  }
  used.set(address, probe);
  return probe;
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
}

/** What goes into the copy of the page near the band, and what is drawn over it. */
export interface BandMedia {
  /** For each element whose pictures are read: what to set on its copy. */
  fills: Map<Element, (copy: Element) => void>;
  /** What the frame may not read, in the order to draw it. */
  unread: Unread[];
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

/**
 * Those of `pending` that something else of the page in `doc`, not knobs'
 * own (`own`), may show over. An overlay is drawn over the whole copy, so it
 * would cover a caption or a heading laid over the picture. To keep simple
 * and safe, any element that shows, other than the picture itself and what
 * holds it, whose box meets the picture's counts, wherever it stacks; what
 * is pinned to the screen does not, as the copy leaves it out.
 */
function covered(doc: Document, view: Window, own: string, pending: Pending[]): Set<Element> {
  const over = new Set<Element>();
  const all = doc.documentElement.getElementsByTagName("*");
  for (let index = 0; index < all.length && index < MOST && over.size < pending.length; index++) {
    const node = all[index];
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    for (const one of pending) {
      if (over.has(one.node) || node === one.node || node.contains(one.node) || !overlap(rect, one.rect)) continue;
      if (visible(node) && !node.closest(own) && !pinned(node, view)) over.add(one.node);
    }
  }
  return over;
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

  for (const node of doc.querySelectorAll<MediaNode>(MEDIA)) {
    const rect = node.getBoundingClientRect();
    if (!meets(rect, scrollY, span) || node.closest(own)) continue;
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
        const probe = probeOf(doc, address, true, loaded, used, true);
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
    const size = readSize(media, rect.width, rect.height, ratio);
    // A video or a drawing may show something else by the next picture, so it is read each time.
    const data = readPixels(node, size);
    if (data === null) {
      if (visible(node)) pending.push({ node, rect, draw: () => ({ media, rect: boxOf(rect), style, clip: clipOf(node, doc, view, boxOf) }) });
      continue;
    }
    const px = (value: string) => Number.parseFloat(value) || 0;
    const wide = rect.width - px(style.borderLeftWidth) - px(style.paddingLeft) - px(style.borderRightWidth) - px(style.paddingRight);
    const tall = rect.height - px(style.borderTopWidth) - px(style.paddingTop) - px(style.borderBottomWidth) - px(style.paddingBottom);
    const picture = sizedPicture(data, media.width, media.height, style.imageRendering);
    const video = "videoWidth" in node;
    add(node, (copy) => {
      // A copy of a video has no frame to be as large as, so it is told its size.
      if (video && !copy.hasAttribute("width") && !copy.hasAttribute("height")) {
        copy.setAttribute("width", String(media.width));
        copy.setAttribute("height", String(media.height));
      }
      restyle(
        copy,
        `background-image:url("${picture}") !important;background-size:${sizeOf(style.objectFit, media, wide, tall)} !important;` +
          `background-position:${style.objectPosition} !important;background-repeat:no-repeat !important;background-origin:content-box !important`,
      );
    });
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

  const over = pending.length > 0 ? covered(doc, view, own, pending) : new Set<Element>();
  const unread: Unread[] = [];
  for (const one of pending) {
    if (over.has(one.node)) continue;
    const drawn = one.draw();
    if (drawn) unread.push(drawn);
  }
  return { fills, unread };
}

/** What the frame may not read near the band, drawn by hand, and the stretch of the document it covers. */
export interface Overlay {
  canvas: HTMLCanvasElement;
  span: Span;
}

/**
 * Draw `unread`, in a document `width` css px wide, on a canvas over `span` of
 * it, `ratio` px to its css px, or null where there is nothing to draw. Only
 * shown, never read, so a picture from another origin draws on it too.
 */
export function overlayOf(unread: Unread[], span: Span, width: number, ratio: number): Overlay | null {
  if (unread.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round((span.bottom - span.top) * ratio));
  const pen = canvas.getContext("2d");
  if (!pen) return null;
  pen.setTransform(ratio, 0, 0, ratio, 0, -span.top * ratio);
  for (const { media, rect, style, made, clip } of unread) {
    pen.save();
    try {
      if (clip) {
        pen.beginPath();
        pen.roundRect(clip.rect.left, clip.rect.top, clip.rect.width, clip.rect.height, clip.radius);
        pen.clip();
      }
      drawMedia(pen, media, rect, style);
    } catch {
      // A picture that will not draw is left out.
    }
    pen.restore();
    if (made) {
      made.width = 0;
      made.height = 0;
    }
  }
  return { canvas, span };
}
