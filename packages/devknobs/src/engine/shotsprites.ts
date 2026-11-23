import { quietFetch } from "../requests/quiet";
import { isKind } from "../rulekind";
import { splitList } from "../styles/selector";

/**
 * The svg files the page's `<use>` elements show parts of, for a copy of the
 * page. A drawing of the copy loads nothing, so an icon from a sprite file,
 * `<use href="/icons.svg#star">`, shows nothing there. Each file is fetched
 * once and kept, made ready once: its scripts out, its ids made its own, its
 * styles kept to itself. A copy takes the parts its `<use>` elements point
 * at, and what those point at in turn, out of sight after the copy's body,
 * and each `<use>` points at its part there. A file not there yet is fetched
 * for the next copy.
 */

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";
/** The attribute on the holder of a sprite file's parts in the copy, which its styles are kept to. */
const SPRITE = "data-knobs-sprite";

/** A sprite file made ready for copies. */
interface Sprite {
  /** What its ids begin with in the copy. */
  prefix: string;
  /** Its elements by their ids, those made its own. */
  ids: Map<string, Element>;
  /** Its styles, matching its own elements only, or "" where it has none or they cannot be made to. */
  style: string;
  /** Its elements its styles point at, as a gradient in a `url(#id)`, which go along with any of its parts. */
  styled: Element[];
  /** Its place among the files of the page, which names its holder. */
  index: number;
}

/**
 * The sprite files of the page they were fetched for, each by its address:
 * its text, or null while it is on its way or where it will not come, and the
 * file made ready, once its text is here.
 */
let kept: { doc: Document; files: Map<string, string | null>; ready: Map<string, Sprite | null> } | null = null;

/** Let go of the sprite files kept, as the frame goes. */
export function forgetSprites(): void {
  kept = null;
}

function keptFor(doc: Document): { files: Map<string, string | null>; ready: Map<string, Sprite | null> } {
  if (kept?.doc !== doc) kept = { doc, files: new Map(), ready: new Map() };
  return kept;
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
 * `selector`, a list, matching only the elements of the `index`th sprite
 * file: each of its selectors asks its subject for the file's mark, before a
 * pseudo-element, and each `#id` of one of the file's `ids` is made `prefix`
 * + id.
 */
export function spriteSelector(selector: string, ids: Set<string>, prefix: string, index: number): string {
  const mark = `[${SPRITE}="${index}"]`;
  return splitList(selector)
    .map((part) => {
      const own = part.trim().replace(/#([\w-]+)/g, (all, id: string) => (ids.has(id) ? `#${prefix}${id}` : all));
      const pseudo = /::[\w-]+(\([^)]*\))?$/.exec(own);
      return pseudo ? `${own.slice(0, pseudo.index)}${mark}${pseudo[0]}` : `${own}${mark}`;
    })
    .join(", ");
}

/** Each style rule in `holder`, those nested too, made to match the sprite file's elements only. */
function markRules(holder: Pick<CSSStyleSheet, "cssRules">, mark: (selector: string) => string): void {
  for (const rule of Array.from(holder.cssRules)) {
    if (isKind(rule, "CSSStyleRule")) {
      rule.selectorText = mark(rule.selectorText);
      markRules(rule, mark);
    } else if (isKind(rule, "CSSMediaRule") || isKind(rule, "CSSSupportsRule") || isKind(rule, "CSSContainerRule") || isKind(rule, "CSSLayerBlockRule")) {
      markRules(rule, mark);
    }
  }
}

/**
 * The css of a sprite file's styles, `text`, matching its own elements only,
 * those marked as the `index`th file's, each `#id` of one of its `ids` made
 * `prefix` + id: parsed by `Sheet`, or "" where it cannot be, so none
 * reaches the page. A `<use>` draws a copy of its part that the page's rules
 * match as they match the part itself, so the file's rules stay the page's
 * own, and only what they match is kept to the file.
 */
export function spriteStyle(text: string, ids: Set<string>, prefix: string, index: number, Sheet: typeof CSSStyleSheet | undefined): string {
  if (typeof Sheet?.prototype?.replaceSync !== "function") return "";
  try {
    const sheet = new Sheet();
    sheet.replaceSync(text);
    markRules(sheet, (selector) => spriteSelector(selector, ids, prefix, index));
    return prefixRefs(Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n"), prefix);
  } catch {
    return "";
  }
}

/**
 * The sprite file `text`, made ready as the `index`th of the page: its
 * scripts out, each element marked as its own, its ids prefixed, and its
 * styles made to match only its own elements, by `Sheet`, else left out.
 * Null where it is no svg.
 */
function prepare(text: string, index: number, Sheet: typeof CSSStyleSheet | undefined): Sprite | null {
  const file = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  if (!file || file.namespaceURI !== SVG) return null;
  const prefix = `knobs-sprite-${index}-`;
  const css: string[] = [];
  const ids = new Set<string>();
  for (const node of [file, ...file.querySelectorAll("*")]) {
    if (node.localName === "script") node.remove();
    else if (node.localName === "style") {
      css.push(node.textContent ?? "");
      node.remove();
    } else {
      const id = node.getAttribute("id");
      if (id) ids.add(id);
    }
  }
  prefixIds(file, prefix);
  const found = new Map<string, Element>();
  for (const node of [file, ...file.querySelectorAll("*")]) {
    node.setAttribute(SPRITE, String(index));
    const id = node.getAttribute("id");
    if (id) found.set(id, node);
  }
  const style = css.length > 0 ? spriteStyle(css.join("\n"), ids, prefix, index, Sheet) : "";
  const styled = [...style.matchAll(/url\(\s*["']?#([^"')\s]+)/g)].flatMap((ref) => found.get(ref[1] ?? "") ?? []);
  return { prefix, ids: found, style, styled, index };
}

/** The ids `node` and those under it point at: in an href to `#id`, and in each `url(#id)`. */
function pointedAt(node: Element): string[] {
  const out: string[] = [];
  for (const each of [node, ...node.querySelectorAll("*")]) {
    for (const attribute of Array.from(each.attributes)) {
      const value = attribute.value;
      if (attribute.localName === "href" && value.startsWith("#")) out.push(value.slice(1));
      for (const found of value.matchAll(/url\(\s*["']?#([^"')\s]+)/g)) if (found[1]) out.push(found[1]);
    }
  }
  return out;
}

/** The parts of `sprite` that `targets` need: themselves and what they point at, in turn, none under another. */
function partsFor(sprite: Sprite, targets: Element[]): Element[] {
  const needed = new Set<Element>();
  const add = (node: Element) => {
    if (needed.has(node)) return;
    needed.add(node);
    for (const id of pointedAt(node)) {
      const next = sprite.ids.get(id);
      if (next) add(next);
    }
  };
  for (const target of targets) add(target);
  const under = (node: Element) => {
    for (let at = node.parentElement; at; at = at.parentElement) if (needed.has(at)) return true;
    return false;
  };
  return [...needed].filter((node) => !under(node));
}

/**
 * The `<use>` elements of `copy`, a copy of the page in `doc` made in
 * `inert`, that point into another svg file, pointed at the parts of that
 * file they need, put into the copy, out of sight after its body, where the
 * file is kept. One whose file is not kept yet is left as it is, and the
 * file fetched for the next copy.
 */
export function inlineSprites(doc: Document, copy: Element, inert: Document): void {
  const uses = Array.from(copy.querySelectorAll("use")).filter((use) => {
    const href = use.namespaceURI === SVG ? hrefOf(use) : "";
    return href !== "" && !href.startsWith("#") && href.includes("#");
  });
  if (uses.length === 0) return;
  const { files, ready } = keptFor(doc);
  const Sheet = doc.defaultView?.CSSStyleSheet;
  /** The holder of each file's parts in this copy, and the parts in it. */
  const holders = new Map<string, { holder: Element; parts: Set<Element> }>();
  for (const use of uses) {
    const href = hrefOf(use);
    const hash = href.lastIndexOf("#");
    let url: string;
    try {
      url = new URL(href.slice(0, hash), doc.baseURI).href;
    } catch {
      continue;
    }
    let sprite = ready.get(url);
    if (sprite === undefined) {
      const text = files.get(url);
      if (text === undefined) fetchSprite(url, files);
      if (!text) continue;
      sprite = prepare(text, ready.size, Sheet);
      ready.set(url, sprite);
    }
    const target = sprite?.ids.get(`${sprite.prefix}${href.slice(hash + 1)}`);
    if (!sprite || !target) continue;
    let placed = holders.get(url);
    if (!placed) {
      const holder = inert.createElementNS(SVG, "svg");
      holder.setAttribute(SPRITE, String(sprite.index));
      holder.setAttribute("aria-hidden", "true");
      holder.setAttribute("style", "position:absolute !important;width:0 !important;height:0 !important;overflow:hidden !important");
      if (sprite.style) {
        const style = inert.createElementNS(SVG, "style");
        style.textContent = sprite.style;
        holder.append(style);
      }
      // After the body, so no rule of the page that counts the body's children finds one more.
      copy.append(holder);
      placed = { holder, parts: new Set() };
      holders.set(url, placed);
    }
    for (const part of partsFor(sprite, [target, ...sprite.styled])) {
      if (placed.parts.has(part)) continue;
      placed.parts.add(part);
      placed.holder.append(inert.importNode(part, true));
    }
    pointAt(use, `#${sprite.prefix}${href.slice(hash + 1)}`);
  }
}
