import { ownSelector } from "../mark";
import { drawMedia, MEDIA, type Media, type MediaNode, mediaOf, svgUrl } from "./pageshot";

/**
 * The real pictures of the page under Safari's bottom bars. A drawing of a
 * copy of the page loads none of its own, so each picture, video, drawing and
 * background picture near the band is read as data and put in the copy,
 * where the browser lays it out, fits it, cuts it at its corners and turns
 * it as it does the page's. One the frame may not read, from another origin
 * that does not allow it, is drawn by hand over the copy instead, in its box,
 * cut off where what holds it cuts it off. Only those near the band are
 * read, and each picture once at the size it shows at.
 */

/** How far past the band, up and down the document, its pictures are read, in viewport heights: a scroll as far needs no new picture. */
const REACH = 1;
/** At most this many of the page's elements are looked at for a background picture. */
const MOST = 20000;
/** The most px a picture is read at. */
const LARGEST = 4e6;
/** The most device px a css px of the page is read at. */
const SHARPEST = 3;
/** How many pictures read are kept, and how many characters of their data in all. */
const KEEP = 32;
const KEEP_LENGTH = 48e6;

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

/** The picture kept by `key`, or `read` now and kept, those used longest ago let go past `KEEP`. */
function keptPixels(key: string, read: () => string | null): string | null {
  if (kept.has(key)) {
    const data = kept.get(key) ?? null;
    kept.delete(key);
    kept.set(key, data);
    return data;
  }
  const data = read();
  kept.set(key, data);
  keptLength += data?.length ?? 0;
  for (const [old, value] of kept) {
    if (kept.size <= KEEP && keptLength <= KEEP_LENGTH) break;
    kept.delete(old);
    keptLength -= value?.length ?? 0;
  }
  return data;
}

/** Pictures of the frame's made to read its background pictures by, by address. */
const probes = new Map<string, HTMLImageElement>();

/** Let go of the pictures read and of those made to read them by. */
export function forgetPixels(): void {
  kept.clear();
  keptLength = 0;
  probes.clear();
}

/**
 * A picture in `doc` of what `address` holds, to read a background picture
 * by. The page has it already, so the browser mostly has it at once; where
 * not, `loaded` is told when it comes.
 */
function probeOf(doc: Document, address: string, loaded: () => void): HTMLImageElement {
  const known = probes.get(address);
  if (known && known.ownerDocument === doc) return known;
  const probe = doc.createElement("img");
  probe.addEventListener("load", loaded, { once: true });
  probe.src = address;
  probes.delete(address);
  probes.set(address, probe);
  for (const old of probes.keys()) {
    if (probes.size <= 2 * KEEP) break;
    probes.delete(old);
  }
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

/** A background's `size`, as the `object-fit` that fits a picture the same way. */
function fitOf(size: string): string {
  if (size === "cover" || size === "contain") return size;
  return size === "100% 100%" ? "fill" : "none";
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
  style: CSSStyleDeclaration;
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

/** The box of the nearest element holding `node` that cuts what it holds off, and its corner's radius, or undefined where none does. */
function clipOf(node: Element, view: Window, boxOf: (rect: DOMRect) => Box): Unread["clip"] {
  for (let at = node.parentElement; at; at = at.parentElement) {
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

/**
 * The pictures, videos, drawings and background pictures of the page in
 * `doc` that meet `span`, read for its copy. `loaded` is told when a
 * background picture comes that was not there yet.
 */
export function bandMedia(doc: Document, view: Window, span: Span, loaded: () => void): BandMedia {
  const fills = new Map<Element, (copy: Element) => void>();
  const unread: Unread[] = [];
  const ratio = Math.min(SHARPEST, Math.max(1, view.devicePixelRatio || 1));
  const { scrollX, scrollY } = view;
  const own = ownSelector();
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
      const data = keptPixels(`${address}|${size.width}x${size.height}`, () => readPixels(node, size));
      if (data !== null) {
        add(node, (copy) => copy.setAttribute("src", sizedPicture(data, media.width, media.height, style.imageRendering)));
        continue;
      }
      // Drawn whole on a canvas of its own first: a part of a picture is cut by its px, not by its size as made.
      const whole = document.createElement("canvas");
      whole.width = size.width;
      whole.height = size.height;
      try {
        whole.getContext("2d")?.drawImage(node, 0, 0, size.width, size.height);
      } catch {
        continue;
      }
      const drawn = { source: whole, width: media.width, height: media.height, scale: size.width / media.width };
      unread.push({ media: drawn, rect: boxOf(rect), style, made: whole, clip: clipOf(node, view, boxOf) });
      continue;
    }
    const size = readSize(media, rect.width, rect.height, ratio);
    // A video or a drawing may show something else by the next picture, so it is read each time.
    const data = readPixels(node, size);
    if (data === null) {
      unread.push({ media, rect: boxOf(rect), style, clip: clipOf(node, view, boxOf) });
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
    const layers = layersOf(value);
    const sizes = layersOf(style.backgroundSize ?? "");
    const places = layersOf(style.backgroundPosition ?? "");
    let read = false;
    const hidden: Unread[] = [];
    const shown = layers.map((layer, at) => {
      const address = urlOf(layer);
      if (address === null || address.startsWith("data:")) return layer;
      const probe = probeOf(doc, address, loaded);
      const media = mediaOf(probe);
      if (!media) return layer;
      const size = readSize(media, rect.width, rect.height, ratio);
      const data = keptPixels(`${address}|${size.width}x${size.height}`, () => readPixels(probe, size));
      if (data !== null) {
        read = true;
        return `url("${sizedPicture(data, media.width, media.height, style.imageRendering)}")`;
      }
      // Drawn by hand in the box inside the border, as the background is placed, sized and set as the layer's.
      const fitted = {
        borderLeftWidth: style.borderLeftWidth,
        borderRightWidth: style.borderRightWidth,
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
        paddingLeft: "0px",
        paddingRight: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        objectFit: fitOf(sizes[at % sizes.length] ?? "auto"),
        objectPosition: places[at % places.length] ?? "0% 0%",
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderTopRightRadius: style.borderTopRightRadius,
        borderBottomRightRadius: style.borderBottomRightRadius,
        borderBottomLeftRadius: style.borderBottomLeftRadius,
        imageRendering: style.imageRendering,
      } as unknown as CSSStyleDeclaration;
      hidden.push({ media, rect: boxOf(rect), style: fitted });
      return layer;
    });
    // The first layer is on top, so the last is drawn first.
    unread.push(...hidden.reverse());
    if (read) {
      const css = `background-image:${shown.join(", ")} !important`;
      add(node, (copy) => restyle(copy, css));
    }
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
