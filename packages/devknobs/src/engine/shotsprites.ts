import { quietFetch } from "../requests/quiet";

/**
 * The svg files the page's `<use>` elements show parts of, for a copy of the
 * page. A drawing of the copy loads nothing, so an icon from a sprite file,
 * `<use href="/icons.svg#star">`, shows nothing there. Each file is fetched
 * once and kept, and a copy takes those kept by then: the whole file goes
 * into the copy, out of sight, its ids made its own, and each `<use>` points
 * at its part there. A file not there yet is fetched for the next copy.
 */

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

/** The sprite files of the page they were fetched for, each by its address: its svg as text, or null while it is on its way or where it will not come. */
let kept: { doc: Document; files: Map<string, string | null> } | null = null;

/** Let go of the sprite files kept, as the frame goes. */
export function forgetSprites(): void {
  kept = null;
}

function filesFor(doc: Document): Map<string, string | null> {
  if (kept?.doc !== doc) kept = { doc, files: new Map() };
  return kept.files;
}

/** Fetch the svg at `url` into `files`, once: one that will not come stays null, and is not asked for again. */
function fetchSprite(url: string, files: Map<string, string | null>): void {
  files.set(url, null);
  void quietFetch(url)
    .then(async (response) => {
      if (response.ok) files.set(url, await response.text());
    })
    .catch(() => {
      // A file from another origin that does not share itself is left out.
    });
}

/** Where a `<use>` points, as written. */
function hrefOf(use: Element): string {
  return use.getAttribute("href") ?? use.getAttributeNS(XLINK, "href") ?? "";
}

/** Point `use` at `href`, under the name it was pointed by. */
function pointAt(use: Element, href: string): void {
  if (use.hasAttribute("href")) use.setAttribute("href", href);
  else use.setAttributeNS(XLINK, "xlink:href", href);
}

/** `text` with each `url(#id)` in it made `url(#` + `prefix` + id. */
export function prefixRefs(text: string, prefix: string): string {
  return text.replace(/url\(\s*(["']?)#([^"')\s]+)\1\s*\)/g, (_all, quote: string, id: string) => `url(${quote}#${prefix}${id}${quote})`);
}

/** Each id in `root` made `prefix` + id, and each reference to one in its attributes: an href to `#id`, and each `url(#id)`. */
export function prefixIds(root: Element, prefix: string): void {
  for (const node of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of Array.from(node.attributes)) {
      const value = attribute.value;
      const next =
        attribute.localName === "id"
          ? `${prefix}${value}`
          : attribute.localName === "href" && value.startsWith("#")
            ? `#${prefix}${value.slice(1)}`
            : prefixRefs(value, prefix);
      if (next !== value) node.setAttributeNS(attribute.namespaceURI, attribute.name, next);
    }
  }
}

/**
 * The `<use>` elements of `copy`, a copy of the page in `doc` made in
 * `inert`, that point into another svg file, pointed at that file put into
 * the copy, out of sight, where it is kept. One whose file is not kept yet
 * is left as it is, and the file fetched for the next copy.
 */
export function inlineSprites(doc: Document, copy: Element, inert: Document): void {
  const uses = Array.from(copy.querySelectorAll("use")).filter((use) => {
    const href = use.namespaceURI === SVG ? hrefOf(use) : "";
    return href !== "" && !href.startsWith("#") && href.includes("#");
  });
  if (uses.length === 0) return;
  const files = filesFor(doc);
  const placed = new Map<string, string | null>();
  let holder: Element | null = null;
  for (const use of uses) {
    const href = hrefOf(use);
    const hash = href.lastIndexOf("#");
    let url: string;
    try {
      url = new URL(href.slice(0, hash), doc.baseURI).href;
    } catch {
      continue;
    }
    let prefix = placed.get(url);
    if (prefix === undefined) {
      prefix = null;
      const text = files.get(url);
      if (text === undefined) fetchSprite(url, files);
      const file = text ? new DOMParser().parseFromString(text, "image/svg+xml").documentElement : null;
      if (file && file.namespaceURI === SVG) {
        prefix = `knobs-sprite-${placed.size}-`;
        const sprite = inert.importNode(file, true);
        prefixIds(sprite, prefix);
        if (!holder) {
          holder = inert.createElementNS(SVG, "svg");
          holder.setAttribute("aria-hidden", "true");
          holder.setAttribute("style", "position:absolute !important;width:0 !important;height:0 !important;overflow:hidden !important");
          (copy.querySelector("body") ?? copy).append(holder);
        }
        holder.append(sprite);
      }
      placed.set(url, prefix);
    }
    if (prefix !== null) pointAt(use, `#${prefix}${href.slice(hash + 1)}`);
  }
}
