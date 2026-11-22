import { afterEach, describe, expect, test } from "bun:test";
import { watchAnnotations } from "../src/grab/annotations";
import { grabContext, quickEntry } from "../src/grab/context";
import { pageMarks } from "../src/grab/pagemarks";

/**
 * A small page with no React on it: elements with what grab reads, attributes
 * that tell a MutationObserver when they change, and a document that finds
 * elements by tag, attribute and attribute value.
 */

interface Watch {
  callback: (records: unknown[]) => void;
  pending: unknown[];
}

const observers: Watch[] = [];

class FakeObserver {
  watch: Watch;
  constructor(callback: (records: unknown[]) => void) {
    this.watch = { callback, pending: [] };
  }
  observe() {
    observers.push(this.watch);
  }
  disconnect() {
    observers.splice(observers.indexOf(this.watch), 1);
  }
}

function notify(record: unknown): void {
  for (const watch of observers) {
    if (watch.pending.length === 0) {
      queueMicrotask(() => watch.callback(watch.pending.splice(0)));
    }
    watch.pending.push(record);
  }
}

/** `tag`, `[name]`, `[name="value"]`, `[name~="value"]` and `tag[...]`, in a comma list. */
function matchesOne(element: FakeElement, part: string): boolean {
  const found = /^([a-z0-9-]*)(?:\[([\w-]+)(?:(~?=)"?([^"\]]*)"?)?\])?$/i.exec(part.trim());
  if (part.trim() === "*") return true;
  if (!found) return false;
  const [, tag, name, op, value] = found;
  if (tag && element.tagName.toLowerCase() !== tag) return false;
  if (!name) return Boolean(tag);
  const actual = element.getAttribute(name);
  if (actual === null) return false;
  if (!op) return true;
  return op === "=" ? actual === value : actual.split(/\s+/).includes(value ?? "");
}

class FakeElement {
  nodeType = 1;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  assignedSlot = null;
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  childNodes: object[] = [];
  attributes: { name: string; value: string }[] = [];
  ownerDocument: FakeDocument;
  tagName: string;

  constructor(doc: FakeDocument, tag: string) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
  }

  get parentNode() {
    return this.parentElement;
  }
  get previousElementSibling(): FakeElement | null {
    const list = this.parentElement?.children ?? [];
    return list[list.indexOf(this) - 1] ?? null;
  }
  getAttribute(name: string): string | null {
    return this.attributes.find((attr) => attr.name === name)?.value ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }
  setAttribute(name: string, value: string): void {
    const had = this.attributes.find((attr) => attr.name === name);
    if (had) had.value = value;
    else this.attributes.push({ name, value });
  }
  removeAttribute(name: string): void {
    const oldValue = this.getAttribute(name);
    this.attributes = this.attributes.filter((attr) => attr.name !== name);
    notify({ type: "attributes", target: this, attributeName: name, oldValue, addedNodes: [] });
  }
  /** Set on the top elements of a shadow root. */
  inShadow: FakeShadow | null = null;

  getRootNode(): FakeDocument | FakeShadow {
    let at: FakeElement = this;
    while (at.parentElement) at = at.parentElement;
    return at.inShadow ?? this.ownerDocument;
  }
  matches(query: string): boolean {
    return query.split(",").some((part) => matchesOne(this, part));
  }
  getElementsByTagName(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.getElementsByTagName()]);
  }
  querySelectorAll(query: string): FakeElement[] {
    return this.getElementsByTagName().filter((element) => element.matches(query));
  }
  /**
   * Preceding (2) when the other comes first in tree order, an ancestor
   * included, else following (4). In another tree, disconnected (1), and
   * following or preceding as a browser picks: here, preceding.
   */
  compareDocumentPosition(other: FakeElement): number {
    const order = this.getRootNode().querySelectorAll("*");
    const at = order.indexOf(other);
    if (at === -1) return 1 | 32 | 2;
    return at < order.indexOf(this) ? 2 : 4;
  }
}

/** An open shadow root on a host, holding the elements given. */
class FakeShadow {
  constructor(
    readonly host: FakeElement,
    readonly children: FakeElement[],
  ) {
    for (const child of children) child.inShadow = this;
  }
  querySelectorAll(query: string): FakeElement[] {
    return this.children
      .flatMap((child) => [child, ...child.getElementsByTagName()])
      .filter((element) => element.matches(query));
  }
  getElementById(): null {
    return null;
  }
}

class FakeDocument {
  scripts: { src: string }[] = [];
  baseURI = "http://localhost/";
  URL = "http://localhost/library#filters";
  readyState = "complete";
  defaultView = { MutationObserver: FakeObserver };
  body: FakeElement;
  documentElement: FakeElement;

  constructor() {
    this.documentElement = new FakeElement(this, "html");
    this.body = new FakeElement(this, "body");
    this.documentElement.children.push(this.body);
    this.body.parentElement = this.documentElement;
  }
  getElementById(id: string): FakeElement | null {
    return this.querySelectorAll(`[id="${id}"]`)[0] ?? null;
  }
  querySelector(query: string): FakeElement | null {
    return this.querySelectorAll(query)[0] ?? null;
  }
  querySelectorAll(query: string): FakeElement[] {
    return [this.documentElement, ...this.documentElement.querySelectorAll(query)].filter(
      (element) => element.matches(query),
    );
  }
  addEventListener() {}
}

type Child = FakeElement | string;

function builder(doc: FakeDocument) {
  return (tag: string, attrs: Record<string, string> = {}, ...children: Child[]): FakeElement => {
    const element = new FakeElement(doc, tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) {
      if (typeof child === "string") {
        element.childNodes.push({ nodeType: 3, textContent: child });
        continue;
      }
      child.parentElement = element;
      element.children.push(child);
      element.childNodes.push(child);
    }
    return element;
  };
}

function into(doc: FakeDocument, ...children: FakeElement[]): void {
  for (const child of children) {
    child.parentElement = doc.body;
    doc.body.children.push(child);
    doc.body.childNodes.push(child);
  }
}

function asElement(element: FakeElement): Element {
  return element as unknown as Element;
}

const ROOT = "/Users/dev/site";

/** The library page: a layout with a main, its h1, and the filters section under it. */
function library(astro: boolean) {
  const doc = new FakeDocument();
  const h = builder(doc);
  const at = (file: string, loc: string): Record<string, string> =>
    astro
      ? { "data-astro-source-file": `${ROOT}/${file}`, "data-astro-source-loc": loc }
      : {};
  const filters = h(
    "section",
    { class: "lib-filters", "aria-label": "Filters", ...at("src/pages/library.astro", "42:51") },
    h("button", at("src/pages/library.astro", "43:15"), "All"),
    h("button", at("src/pages/library.astro", "44:15"), "Buttons"),
    h("button", at("src/pages/library.astro", "45:15"), "Inputs"),
  );
  const main = h(
    "main",
    at("src/layouts/Base.astro", "20:9"),
    h("h1", at("src/pages/library.astro", "40:7"), "Library"),
    filters,
  );
  into(doc, main);
  return { doc, filters };
}

/**
 * The library page as Astro's toolbar left it: no marks on it, and the
 * toolbar's element put first in the body. Its html as the dev server sends it
 * still has them.
 */
function stripped() {
  const { doc, filters } = library(true);
  for (const element of doc.querySelectorAll("[data-astro-source-file]")) {
    element.attributes = element.attributes.filter(
      (attr) => !attr.name.startsWith("data-astro-source-"),
    );
  }
  const toolbar = builder(doc)("astro-dev-toolbar");
  toolbar.parentElement = doc.body;
  doc.body.children.unshift(toolbar);
  return { doc, filters, served: library(true).doc };
}

afterEach(() => {
  observers.splice(0);
});

describe("grab off React", () => {
  test("names an Astro element by its file and line, and the layout above it", async () => {
    const { filters } = library(true);
    const payload = await grabContext([asElement(filters)]);
    expect(payload.content).toBe(
      '[<section class="lib-filters" aria-label="Filters" /> in library (at src/pages/library.astro:42) in Base (at src/layouts/Base.astro:20) selector: [aria-label="Filters"]]',
    );
    expect(payload.entries[0]?.componentName).toBe("library");
    expect(payload.entries[0]?.source).toEqual({
      filePath: "src/pages/library.astro",
      lineNumber: 42,
      columnNumber: null,
      componentName: "library",
      origin: "app",
      symbolicated: true,
    });
  });

  test("keeps Astro's marks after its dev toolbar removes them", async () => {
    const { doc, filters } = library(true);
    watchAnnotations(doc as unknown as Document);
    for (const element of doc.querySelectorAll("[data-astro-source-file]")) {
      element.removeAttribute("data-astro-source-file");
      element.removeAttribute("data-astro-source-loc");
    }
    expect(filters.hasAttribute("data-astro-source-file")).toBe(false);
    await Promise.resolve();
    expect(quickEntry(asElement(filters)).content).toBe(
      '[<section class="lib-filters" aria-label="Filters" /> in library (at src/pages/library.astro:42) in Base (at src/layouts/Base.astro:20) selector: [aria-label="Filters"]]',
    );
  });

  test("reads the marks from the page's html when Astro's toolbar took them before devknobs mounted", async () => {
    const { doc, filters, served } = stripped();
    const loads: unknown[] = [];
    const load = (page: Document) => {
      loads.push(page);
      return Promise.resolve(served as unknown as Document);
    };
    await pageMarks(doc as unknown as Document, load);
    const payload = await grabContext([asElement(filters)]);
    expect(payload.content).toBe(
      '[<section class="lib-filters" aria-label="Filters" /> in library (at src/pages/library.astro:42) in Base (at src/layouts/Base.astro:20) selector: [aria-label="Filters"]]',
    );
    expect(loads).toEqual([doc]);
    // A copy that cannot wait reads only what the page and devknobs kept.
    expect(quickEntry(asElement(filters)).content).toContain('heading: "Library"');
  });

  test("loads the page's html once, and falls back to the hints when it fails", async () => {
    const { doc, filters } = stripped();
    let tries = 0;
    const failing = () => {
      tries += 1;
      return Promise.reject(new Error("offline"));
    };
    expect(await pageMarks(doc as unknown as Document, failing)).toBeNull();
    expect(await pageMarks(doc as unknown as Document, failing)).toBeNull();
    const payload = await grabContext([asElement(filters)]);
    expect(payload.content).toContain('heading: "Library"');
    expect(tries).toBe(1);
  });

  test("loads the html again after a client side navigation, once per address", async () => {
    const { doc, served } = stripped();
    const loads: string[] = [];
    const load = (page: Document) => {
      loads.push(page.URL);
      return Promise.resolve(served as unknown as Document);
    };
    await pageMarks(doc as unknown as Document, load);
    doc.URL = "http://localhost/library#other";
    await pageMarks(doc as unknown as Document, load);
    doc.URL = "http://localhost/inputs";
    expect(await pageMarks(doc as unknown as Document, load)).not.toBeNull();
    expect(loads).toEqual(["http://localhost/library#filters", "http://localhost/inputs"]);
  });

  test("leaves a React element's line as it was, with no source marks or hints", async () => {
    const { filters } = library(true);
    Reflect.set(filters, "__reactFiber$abc", {
      tag: 5,
      type: "section",
      key: null,
      stateNode: filters,
      return: null,
      child: null,
      sibling: null,
    });
    const payload = await grabContext([asElement(filters)]);
    expect(payload.content).toBe(
      '[<section class="lib-filters" aria-label="Filters" /> selector: [aria-label="Filters"]]',
    );
    expect(payload.entries[0]?.source).toBeNull();
  });

  test("finds the heading before a shadow host for an element in its shadow root", () => {
    const doc = new FakeDocument();
    const h = builder(doc);
    const card = h("div", { class: "card" });
    const button = h("button", { type: "button" });
    new FakeShadow(card, [h("p", {}, "Inside"), button]);
    into(
      doc,
      h("h1", {}, "Page"),
      h("nav", { "aria-label": "Primary" }, h("h2", {}, "Right before"), card),
      h("h2", {}, "After"),
    );
    expect(quickEntry(asElement(button)).content).toBe(
      '[<button type="button" /> heading: "Right before" landmark: nav "Primary"]',
    );
  });

  test("finds a heading in the shadow root before one outside it", () => {
    const doc = new FakeDocument();
    const h = builder(doc);
    const card = h("div");
    const button = h("button", { type: "button" });
    new FakeShadow(card, [h("h3", {}, "Card title"), button]);
    into(doc, h("h2", {}, "Page"), card);
    expect(quickEntry(asElement(button)).content).toContain('heading: "Card title"');
  });

  test("takes the heading an element is in, skips an empty one, and has none before the first", () => {
    const doc = new FakeDocument();
    const h = builder(doc);
    const first = h("span", { class: "first" });
    const inner = h("span", { class: "inner" });
    const after = h("span", { class: "after" });
    into(doc, first, h("h2", {}, "Title ", inner), h("h3", {}), after);
    expect(quickEntry(asElement(inner)).content).toContain('heading: "Title"');
    expect(quickEntry(asElement(after)).content).toBe('[<span class="after" /> heading: "Title"]');
    expect(quickEntry(asElement(first)).content).toBe('[<span class="first" />]');
  });

  test("loads nothing where there is no Astro dev toolbar", async () => {
    const { doc } = library(false);
    let tries = 0;
    const load = () => {
      tries += 1;
      return Promise.resolve(null);
    };
    expect(await pageMarks(doc as unknown as Document, load)).toBeNull();
    expect(tries).toBe(0);
  });

  test("names a Svelte element by its file, line and column from 1", () => {
    const doc = new FakeDocument();
    const h = builder(doc);
    const button = h("button", { "data-testid": "save" }, "Save");
    Reflect.set(button, "__svelte_meta", {
      loc: { file: "src/lib/Save.svelte", line: 12, column: 4 },
    });
    const form = h("form", {}, button);
    Reflect.set(form, "__svelte_meta", {
      loc: { file: "src/routes/+page.svelte", line: 3, column: 0 },
    });
    into(doc, form);
    expect(quickEntry(asElement(button)).content).toBe(
      '[<button data-testid="save">Save</button> in Save (at src/lib/Save.svelte:12:5) in +page (at src/routes/+page.svelte:3:1) selector: [data-testid="save"]]',
    );
  });

  test("names a Vue element by its component and file", () => {
    const doc = new FakeDocument();
    const h = builder(doc);
    const link = h("a", { href: "/docs" }, "Docs");
    Reflect.set(link, "__vueParentComponent", {
      type: { __file: `${ROOT}/src/components/NavBar.vue`, __name: "NavBar" },
    });
    into(doc, link);
    const entry = quickEntry(asElement(link));
    expect(entry.content).toBe(
      '[<a href="/docs">Docs</a> in NavBar (at src/components/NavBar.vue) selector: [href="/docs"]]',
    );
    expect(entry.source?.symbolicated).toBe(false);
  });

  test("says the text, heading and landmark of an element no source names", async () => {
    const { filters } = library(false);
    const payload = await grabContext([asElement(filters)]);
    expect(payload.content).toBe(
      '[<section class="lib-filters" aria-label="Filters" /> text: "All Buttons Inputs" heading: "Library" landmark: main selector: [aria-label="Filters"]]',
    );
    expect(payload.entries[0]?.source).toBeNull();
    expect(payload.entries[0]?.stackContext).toBe("");
  });

  test("names a landmark by its label, and cuts long text", () => {
    const doc = new FakeDocument();
    const h = builder(doc);
    const item = h("li", {}, h("span", {}, "x".repeat(100)));
    into(doc, h("nav", { "aria-labelledby": "nav-title" }, h("h2", { id: "nav-title" }, "Primary"), h("ul", {}, item)));
    expect(quickEntry(asElement(item)).content).toBe(
      `[<li /> text: "${"x".repeat(80)}..." heading: "Primary" landmark: nav "Primary"]`,
    );
  });
});
