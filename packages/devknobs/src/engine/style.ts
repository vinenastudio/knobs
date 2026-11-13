/**
 * A stylesheet of devknobs'. Where the browser adopts constructed sheets it is
 * one of those, which a page's Content Security Policy does not block, as it
 * blocks a `<style>` without `'unsafe-inline'`; elsewhere it is a `<style>`.
 */

import { findOwn, markOwn } from "../mark";
export interface OwnStyle {
  textContent: string | null;
  readonly sheet: CSSStyleSheet | null;
  remove(): void;
}

type Root = Document | ShadowRoot;

/** Marks a constructed sheet as devknobs' own. */
const OWN = Symbol.for("devknobs.own");
/**
 * A named sheet's name and its text, kept on the sheet itself, so every copy of
 * devknobs that styles a document finds it, the page above its frame's included.
 */
const NAME = Symbol.for("devknobs.name");
const TEXT = Symbol.for("devknobs.text");

const wrapped = new WeakMap<CSSStyleSheet, OwnStyle>();

/** Whether `node` is a Document (nodeType 9). */
export function isDocument(root: Node): root is Document {
  return root.nodeType === 9;
}

function documentOf(root: Root): Document {
  return isDocument(root) ? root : (root.ownerDocument ?? document);
}

/** The constructor of sheets `root` can adopt, from its own window, or null where it cannot. */
function constructable(root: Root): typeof CSSStyleSheet | null {
  const doc = isDocument(root) ? root : (root.ownerDocument as Document | undefined);
  const Sheet = doc?.defaultView?.CSSStyleSheet;
  if (typeof Sheet !== "function" || typeof Sheet.prototype.replaceSync !== "function") return null;
  return "adoptedStyleSheets" in root ? Sheet : null;
}

/** The `<style>` a sheet is, or null for a constructed one. */
export function styleNode(style: OwnStyle): HTMLStyleElement | null {
  return "nodeType" in style ? (style as HTMLStyleElement) : null;
}

/** Is `sheet` one devknobs constructed? */
export function isOwnSheet(sheet: CSSStyleSheet): boolean {
  return Reflect.get(sheet, OWN) === true;
}

/** The one handle on `sheet`, adopted by `root`, for this copy of devknobs. */
function wrap(root: Root, sheet: CSSStyleSheet): OwnStyle {
  const had = wrapped.get(sheet);
  if (had) return had;
  const style: OwnStyle = {
    get textContent() {
      const text: unknown = Reflect.get(sheet, TEXT);
      return typeof text === "string" ? text : "";
    },
    set textContent(value) {
      Reflect.set(sheet, TEXT, value ?? "");
      sheet.replaceSync(value ?? "");
    },
    sheet,
    remove() {
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter((other) => other !== sheet);
    },
  };
  wrapped.set(sheet, style);
  return style;
}

function adopt(root: Root, Sheet: typeof CSSStyleSheet, name?: string): OwnStyle {
  const sheet = new Sheet();
  Reflect.set(sheet, OWN, true);
  if (name !== undefined) Reflect.set(sheet, NAME, name);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  return wrap(root, sheet);
}

/**
 * Style `root` with `css`: the document, or a shadow root of devknobs'. A
 * `<style>` in its place goes at the end of the document's head or of the
 * shadow root, before what the shadow root gets next.
 */
export function addStyle(root: Root, css: string): OwnStyle {
  const Sheet = constructable(root);
  if (Sheet) {
    const style = adopt(root, Sheet);
    style.textContent = css;
    return style;
  }
  const style = documentOf(root).createElement("style");
  style.textContent = css;
  if (isDocument(root)) (root.head ?? root.documentElement).appendChild(style);
  else root.append(style);
  return style;
}

/**
 * A sheet of devknobs' that goes on and off the page as the same sheet, so
 * its rules stay the same objects: adopted and let go where the browser
 * adopts sheets, else a `<style>` that is switched off. It starts off.
 */
export interface SwitchedSheet {
  readonly sheet: CSSStyleSheet;
  on(): void;
  off(): void;
  /** Take it off the page for good. */
  remove(): void;
}

export function switchedSheet(root: Root, name: string): SwitchedSheet | null {
  const Sheet = constructable(root);
  if (Sheet) {
    const sheet = new Sheet();
    Reflect.set(sheet, OWN, true);
    const off = (): void => {
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter((other) => other !== sheet);
    };
    let gone = false;
    return {
      sheet,
      on() {
        if (!gone && !root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      },
      off,
      remove() {
        gone = true;
        off();
      },
    };
  }
  const style = documentOf(root).createElement("style");
  markOwn(style, name);
  if (isDocument(root)) (root.head ?? root.documentElement).appendChild(style);
  else root.append(style);
  const sheet = style.sheet;
  if (!sheet) {
    style.remove();
    return null;
  }
  sheet.disabled = true;
  return {
    sheet,
    on() {
      sheet.disabled = false;
    },
    off() {
      sheet.disabled = true;
    },
    remove: () => style.remove(),
  };
}

/** The sheet devknobs keeps on the page under `name`, if it has one. */
export function findStyle(name: string, doc: Document = document): OwnStyle | null {
  const sheet = "adoptedStyleSheets" in doc ? doc.adoptedStyleSheets.find((own) => Reflect.get(own, NAME) === name) : undefined;
  return sheet ? wrap(doc, sheet) : findOwn<HTMLStyleElement>(doc, name, "style");
}

/** Every node devknobs adds to the page carries `data-knobs` and `data-devknobs`. */
export function ensureStyle(name: string, doc: Document = document): OwnStyle {
  const existing = findStyle(name, doc);
  if (existing) return existing;
  const Sheet = constructable(doc);
  if (Sheet) return adopt(doc, Sheet, name);
  const style = doc.createElement("style");
  markOwn(style, name);
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

export function removeStyle(name: string, doc: Document = document): void {
  findStyle(name, doc)?.remove();
}
