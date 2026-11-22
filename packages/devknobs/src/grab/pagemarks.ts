import { quietFetch } from "../requests/quiet";
import type { Annotation } from "./annotations";

/**
 * Astro's marks for a devknobs that mounted after Astro's dev toolbar took
 * them off the page. The toolbar keeps them in a module the dev server bundles,
 * where no one else can read them. The page's html, fetched again from the dev
 * server, still has them, and its elements stand where the page's do.
 */

export type MarkLookup = (element: Element) => Annotation | null;

/** The page's html again, parsed, or null. */
export type PageLoader = (doc: Document) => Promise<Document | null>;

const FILE = "data-astro-source-file";
const LOC = "data-astro-source-loc";

function pageUrl(doc: Document): string {
  const url = new URL(doc.URL);
  url.hash = "";
  return url.href;
}

async function fetchPage(doc: Document): Promise<Document | null> {
  const Parser = doc.defaultView?.DOMParser;
  if (!Parser) return null;
  const response = await quietFetch(pageUrl(doc), { credentials: "same-origin" });
  if (!response.ok) return null;
  return new Parser().parseFromString(await response.text(), "text/html");
}

/** `section:1`: the element's tag and its count among earlier siblings of that tag. */
function stepOf(element: Element): string {
  let index = 0;
  for (let at = element.previousElementSibling; at; at = at.previousElementSibling) {
    if (at.tagName === element.tagName) index += 1;
  }
  return `${element.tagName.toLowerCase()}:${index}`;
}

/**
 * `html>body:0>main:0>section:1`: the element's place by tag and its count
 * among siblings of that tag, so a script's element of another tag, such as
 * the toolbar's own, moves no one.
 */
function placeOf(element: Element): string {
  const steps: string[] = [];
  let at = element;
  for (let parent = at.parentElement; parent; parent = parent.parentElement) {
    steps.push(stepOf(at));
    at = parent;
  }
  steps.push(at.tagName.toLowerCase());
  return steps.reverse().join(">");
}

/** Every marked element's place, in one walk down the page, each step counted as it goes. */
function collect(parent: Element, path: string, marks: Map<string, Annotation>): void {
  const counts = new Map<string, number>();
  for (const child of Array.from(parent.children)) {
    const index = counts.get(child.tagName) ?? 0;
    counts.set(child.tagName, index + 1);
    const place = `${path}>${child.tagName.toLowerCase()}:${index}`;
    const file = child.getAttribute(FILE);
    if (file) marks.set(place, { file, loc: child.getAttribute(LOC) });
    collect(child, place, marks);
  }
}

function lookupOf(page: Document | null): MarkLookup | null {
  const root = page?.documentElement;
  if (!root) return null;
  const marks = new Map<string, Annotation>();
  collect(root, root.tagName.toLowerCase(), marks);
  return marks.size > 0 ? (element) => marks.get(placeOf(element)) ?? null : null;
}

interface Loaded {
  url: string;
  lookup: Promise<MarkLookup | null>;
}

const loaded = new WeakMap<Document, Loaded>();

/**
 * The marks on an Astro dev page whose marks devknobs did not keep, or null.
 * The html loads once per address: a client side navigation, as Astro's
 * ClientRouter makes, swaps the page in the same document. A failure is not
 * tried again.
 */
export function pageMarks(doc: Document, load: PageLoader = fetchPage): Promise<MarkLookup | null> {
  if (!doc.querySelector("astro-dev-toolbar")) return Promise.resolve(null);
  const url = pageUrl(doc);
  const known = loaded.get(doc);
  if (known?.url === url) return known.lookup;
  const lookup = Promise.resolve()
    .then(() => load(doc))
    .then(lookupOf, () => null);
  loaded.set(doc, { url, lookup });
  return lookup;
}
