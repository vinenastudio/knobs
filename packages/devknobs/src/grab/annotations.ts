/**
 * Astro's dev server marks each element with the file and line it came from.
 * Astro's own dev toolbar reads these attributes and then removes them, at
 * startup and after each change to the page. So the values are kept here, as
 * soon as devknobs mounts and before the toolbar removes them.
 */

import { isElement } from "./inspect";

const FILE = "data-astro-source-file";
const LOC = "data-astro-source-loc";

/** A page with no annotation by then is no Astro dev page, and is not watched. */
const WATCH_MS = 10_000;

export interface Annotation {
  file: string | null;
  loc: string | null;
}

const kept = new WeakMap<Element, Annotation>();
const watched = new WeakSet<Document>();
/** Pages devknobs kept a mark on. */
const seen = new WeakSet<Document>();

function keep(element: Element, name: string, value: string | null): void {
  if (value === null) return;
  const entry = kept.get(element) ?? { file: null, loc: null };
  if (name === FILE) entry.file = value;
  else entry.loc = value;
  kept.set(element, entry);
  seen.add(element.ownerDocument);
}

function read(element: Element): void {
  keep(element, FILE, element.getAttribute(FILE));
  keep(element, LOC, element.getAttribute(LOC));
}

function scan(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll(`[${FILE}]`))) read(element);
}

/** A mark set, or taken off with its value in `oldValue`, as Astro's toolbar does. */
function changed(records: MutationRecord[]): void {
  for (const { target, attributeName, oldValue } of records) {
    if (!isElement(target) || !attributeName) continue;
    keep(target, attributeName, target.getAttribute(attributeName) ?? oldValue);
  }
}

/**
 * Keep the page's Astro annotations from now on: the ones there now and at
 * `DOMContentLoaded`, and every one set or removed later.
 */
export function watchAnnotations(doc: Document | undefined = globalThis.document): void {
  if (!doc || watched.has(doc)) return;
  watched.add(doc);
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  scan(doc);
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", () => scan(doc), { once: true });
  }
  if (typeof Observer !== "function") return;
  const observer = new Observer(changed);
  observer.observe(doc, {
    subtree: true,
    attributes: true,
    attributeFilter: [FILE, LOC],
    attributeOldValue: true,
  });
  setTimeout(() => {
    if (!seen.has(doc)) observer.disconnect();
  }, WATCH_MS);
}

/** Devknobs kept a mark on the page: it watched from before Astro's toolbar took them. */
export function keptAny(doc: Document): boolean {
  return seen.has(doc);
}

/** The element's annotation, from its attributes while it has them, else as kept. */
export function annotationOf(element: Element): Annotation | null {
  const stored = kept.get(element);
  const file = element.getAttribute(FILE) ?? stored?.file ?? null;
  const loc = element.getAttribute(LOC) ?? stored?.loc ?? null;
  return file ? { file, loc } : null;
}
