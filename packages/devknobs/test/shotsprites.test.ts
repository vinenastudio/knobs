import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { forgetSprites, inlineSprites, prefixIds, prefixRefs, spriteSelector, spriteStyle } from "../src/engine/shotsprites";

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

/** An element as far as a sprite file and a copy of the page read one. */
class Part {
  readonly attributes: { localName: string; name: string; namespaceURI: string | null; value: string }[] = [];
  children: Part[] = [];
  parentElement: Part | null = null;
  textContent = "";
  constructor(
    readonly localName: string,
    attributes: Record<string, string> = {},
    children: Part[] = [],
    readonly namespaceURI: string | null = SVG,
  ) {
    for (const [name, value] of Object.entries(attributes)) this.setAttributeNS(name.startsWith("xlink:") ? XLINK : null, name, value);
    this.append(...children);
  }
  querySelectorAll(selector: string): Part[] {
    const all = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
    return selector === "*" ? all : all.filter((node) => node.localName === selector);
  }
  append(...nodes: Part[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  remove(): void {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((node) => node !== this);
    this.parentElement = null;
  }
  getAttribute(name: string): string | null {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null;
  }
  getAttributeNS(namespace: string | null, localName: string): string | null {
    return this.attributes.find((attribute) => attribute.namespaceURI === namespace && attribute.localName === localName)?.value ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }
  setAttribute(name: string, value: string): void {
    this.setAttributeNS(null, name, value);
  }
  setAttributeNS(namespace: string | null, name: string, value: string): void {
    const found = this.attributes.find((attribute) => attribute.name === name && attribute.namespaceURI === namespace);
    if (found) found.value = value;
    else this.attributes.push({ localName: name.replace(/^xlink:/, ""), name, namespaceURI: namespace, value });
  }
  clone(): Part {
    const made = new Part(this.localName, {}, [], this.namespaceURI);
    for (const attribute of this.attributes) made.attributes.push({ ...attribute });
    made.textContent = this.textContent;
    made.append(...this.children.map((child) => child.clone()));
    return made;
  }
  get(name: string): string | undefined {
    return this.attributes.find((attribute) => attribute.name === name)?.value;
  }
}

/** The sprite file the tests fetch: a dot in a gradient of its own, a star, a style and a script. */
const FILE = "<svg>the sprite file</svg>";
function sprite(): Part {
  const style = new Part("style");
  style.textContent = ".st0 { fill: url(#shine); } #dot circle { stroke: blue; }";
  return new Part("svg", {}, [
    new Part("script"),
    style,
    new Part("linearGradient", { id: "g" }),
    new Part("radialGradient", { id: "shine" }),
    new Part("symbol", { id: "dot", viewBox: "0 0 40 40" }, [new Part("circle", { class: "st0", fill: "url(#g)", stroke: "#fff" })]),
    new Part("symbol", { id: "star" }, [new Part("path")]),
  ]);
}

const before = { fetch: globalThis.fetch, DOMParser: Reflect.get(globalThis, "DOMParser") };
let fetched: string[] = [];
let answer: { ok: boolean; text: () => Promise<string> } = { ok: true, text: async () => FILE };

beforeEach(() => {
  fetched = [];
  answer = { ok: true, text: async () => FILE };
  Reflect.set(globalThis, "fetch", async (url: string) => {
    fetched.push(url);
    return answer;
  });
  Reflect.set(
    globalThis,
    "DOMParser",
    class {
      parseFromString(text: string) {
        return { documentElement: text === FILE ? sprite() : null };
      }
    },
  );
});

afterEach(() => {
  Reflect.set(globalThis, "fetch", before.fetch);
  Reflect.set(globalThis, "DOMParser", before.DOMParser);
  forgetSprites();
});

/** Let the fetch of a file come in. */
const settle = () => new Promise((done) => setTimeout(done, 0));

/** A style rule as a sheet parses one, named as the browser's, as rules are told apart by their class's name. */
class CSSStyleRule {
  readonly cssRules: CSSStyleRule[] = [];
  private selector: string;
  /** Its declarations, by name, as the rule's style reads and writes them. */
  private readonly declarations = new Map<string, string>();
  readonly style = {
    getPropertyValue: (name: string) => this.declarations.get(name) ?? "",
    getPropertyPriority: () => "",
    setProperty: (name: string, value: string) => this.declarations.set(name, value),
  };
  constructor(selector: string, body: string) {
    this.selector = selector;
    for (const part of body.split(";")) {
      const colon = part.indexOf(":");
      if (colon > 0) this.declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    }
  }
  /** A selector the browser cannot parse, as a pseudo-class after a pseudo-element, is not set, as the browser does. */
  get selectorText(): string {
    return this.selector;
  }
  set selectorText(selector: string) {
    if (!/::[\w-]+:/.test(selector)) this.selector = selector;
  }
  get cssText(): string {
    return `${this.selector} { ${[...this.declarations].map(([name, value]) => `${name}: ${value};`).join(" ")} }`;
  }
}

/** A `@keyframes`, its name settable as the browser's. */
class CSSKeyframesRule {
  constructor(
    public name: string,
    private body: string,
  ) {}
  get cssText(): string {
    return `@keyframes ${this.name} { ${this.body.trim()} }`;
  }
}

/** A rule of another kind, as an `@font-face`. */
class CSSFontFaceRule {
  constructor(readonly cssText: string) {}
}

/** A constructable sheet of flat rules: enough of css for these tests. */
class RuleSheet {
  cssRules: (CSSStyleRule | CSSKeyframesRule | CSSFontFaceRule)[] = [];
  replaceSync(text: string): void {
    this.cssRules = [...text.matchAll(/([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((found) => {
      const head = (found[1] ?? "").trim();
      const body = found[2] ?? "";
      if (head.startsWith("@keyframes")) return new CSSKeyframesRule(head.slice(10).trim(), body);
      if (head.startsWith("@")) return new CSSFontFaceRule(`${head} { ${body.trim()} }`);
      return new CSSStyleRule(head, body);
    });
  }
  deleteRule(index: number): void {
    this.cssRules.splice(index, 1);
  }
}

/** The page, which may parse css, and a copy of it with `uses` in its body. */
function pageOf(parses = true) {
  const doc = { baseURI: "https://site.test/blog/", defaultView: parses ? { CSSStyleSheet: RuleSheet } : {} } as unknown as Document;
  const inert = {
    importNode: (node: Part) => node.clone(),
    createElementNS: (namespace: string, name: string) => new Part(name, {}, [], namespace),
  } as unknown as Document;
  const copy = (...uses: Part[]) => {
    const root = new Part("html", {}, [new Part("head"), new Part("body", {}, [new Part("svg", {}, uses)])], "http://www.w3.org/1999/xhtml");
    inlineSprites(doc, root as unknown as Element, inert);
    return root;
  };
  return { copy };
}

describe("inlineSprites", () => {
  test("fetches a sprite file once, and puts the part a use needs into the next copy, after the body, pointing the use at it", async () => {
    const { copy } = pageOf();
    const first = copy(new Part("use", { href: "/icons.svg#dot" }));
    expect(first.children.map((child) => child.localName)).toEqual(["head", "body"]);
    expect(first.querySelectorAll("use")[0]?.get("href")).toBe("/icons.svg#dot");
    await settle();
    const next = copy(new Part("use", { href: "/icons.svg#dot" }), new Part("use", { href: "/icons.svg#dot" }));
    expect(fetched).toEqual(["https://site.test/icons.svg"]);
    expect(next.querySelectorAll("use").map((use) => use.get("href"))).toEqual(["#knobs-sprite-0-dot", "#knobs-sprite-0-dot"]);
    // The holder comes after the body, so the body's children count as the page has them.
    const holder = next.children[2];
    expect(next.children.map((child) => child.localName)).toEqual(["head", "body", "svg"]);
    expect(holder?.get("data-knobs-sprite")).toBe("0");
    // The dot, the gradient it points at and the one its style points at, once, and nothing else of the file: no star, no script.
    expect(holder?.children.map((child) => [child.localName, child.get("id")])).toEqual([
      ["style", undefined],
      ["symbol", "knobs-sprite-0-dot"],
      ["linearGradient", "knobs-sprite-0-g"],
      ["radialGradient", "knobs-sprite-0-shine"],
    ]);
    expect(holder?.querySelectorAll("circle")[0]?.get("fill")).toBe("url(#knobs-sprite-0-g)");
    expect(holder?.querySelectorAll("circle")[0]?.get("stroke")).toBe("#fff");
    expect(holder?.querySelectorAll("script")).toEqual([]);
    // Its style matches its own elements only, each marked as the file's, its ids its own.
    expect(holder?.children[0]?.textContent).toBe('.st0[data-knobs-sprite="0"] { fill: url(#knobs-sprite-0-shine); }\n#knobs-sprite-0-dot circle[data-knobs-sprite="0"] { stroke: blue; }');
    expect(holder?.querySelectorAll("circle")[0]?.get("data-knobs-sprite")).toBe("0");
  });

  test("points a use by xlink:href, under that name", async () => {
    const { copy } = pageOf();
    copy(new Part("use", { "xlink:href": "../icons.svg#star" }));
    await settle();
    const use = copy(new Part("use", { "xlink:href": "../icons.svg#star" })).querySelectorAll("use")[0];
    expect(fetched).toEqual(["https://site.test/icons.svg"]);
    expect(use?.getAttributeNS(XLINK, "href")).toBe("#knobs-sprite-0-star");
    expect(use?.hasAttribute("href")).toBe(false);
  });

  test("asks for a file that does not come once only, and leaves its uses as they are", async () => {
    answer = { ok: false, text: async () => "" };
    const { copy } = pageOf();
    copy(new Part("use", { href: "/icons.svg#dot" }));
    await settle();
    const next = copy(new Part("use", { href: "/icons.svg#dot" }));
    expect(fetched).toEqual(["https://site.test/icons.svg"]);
    expect(next.querySelectorAll("use")[0]?.get("href")).toBe("/icons.svg#dot");
    expect(next.children.length).toBe(2);
  });

  test("leaves a file's styles out where they cannot be parsed, so none reaches the page", async () => {
    const { copy } = pageOf(false);
    copy(new Part("use", { href: "/icons.svg#dot" }));
    await settle();
    const holder = copy(new Part("use", { href: "/icons.svg#dot" })).children[2];
    expect(holder?.querySelectorAll("style")).toEqual([]);
  });

  test("leaves a use within the page, or of nothing, as it is", () => {
    const { copy } = pageOf();
    const page = copy(new Part("use", { href: "#own" }), new Part("use"));
    expect(fetched).toEqual([]);
    expect(page.children.length).toBe(2);
  });
});

describe("spriteStyle", () => {
  test("names the file's keyframes its own, and its animations by them, so none meets the page's of the same name", () => {
    const css = "@keyframes grow { to { fill: blue; } } .bar { animation-name: grow, spin; fill: red; }";
    expect(spriteStyle(css, new Set(), "p-", 0, RuleSheet as unknown as typeof CSSStyleSheet)).toBe(
      '@keyframes p-grow { to { fill: blue; } }\n.bar[data-knobs-sprite="0"] { animation-name: p-grow, spin; fill: red; }',
    );
  });

  test("takes out what would reach the whole page: a rule of another kind, and one whose selector cannot be marked", () => {
    const css = '@font-face { font-family: "Logo"; } ::-webkit-scrollbar-thumb:hover { background: red; } .dot { fill: red; }';
    expect(spriteStyle(css, new Set(), "p-", 0, RuleSheet as unknown as typeof CSSStyleSheet)).toBe('.dot[data-knobs-sprite="0"] { fill: red; }');
  });
});

describe("spriteSelector", () => {
  test("asks each selector's subject for the file's mark, before a pseudo-element, prefixing only the file's own ids", () => {
    expect(spriteSelector("#dot circle, .st0, path::marker, #other", new Set(["dot"]), "p-", 2)).toBe(
      '#p-dot circle[data-knobs-sprite="2"], .st0[data-knobs-sprite="2"], path[data-knobs-sprite="2"]::marker, #other[data-knobs-sprite="2"]',
    );
  });
});

describe("prefixRefs", () => {
  test("makes each url() to an id the prefixed id's", () => {
    expect(prefixRefs("url(#g)", "p-")).toBe("url(#p-g)");
    expect(prefixRefs("fill: url('#g'); stroke: url(\"#h\")", "p-")).toBe("fill: url('#p-g'); stroke: url(\"#p-h\")");
  });

  test("leaves a value with no url() to an id as it is, a color in hex too", () => {
    for (const value of ["red", "#fff", "url(/a.svg#b)", "0 0 40 40", ""]) expect(prefixRefs(value, "p-")).toBe(value);
  });
});

describe("prefixIds", () => {
  test("prefixes each id of a sprite file and each reference to one, so none meets an id of the page", () => {
    const circle = new Part("circle", { fill: "url(#g)", stroke: "#fff", "xlink:href": "#base" });
    const symbol = new Part("symbol", { id: "dot", viewBox: "0 0 40 40" }, [circle]);
    const gradient = new Part("linearGradient", { id: "g" });
    const root = new Part("svg", {}, [symbol, gradient]);
    prefixIds(root as unknown as Element, "knobs-sprite-0-");
    expect(symbol.get("id")).toBe("knobs-sprite-0-dot");
    expect(gradient.get("id")).toBe("knobs-sprite-0-g");
    expect(circle.get("fill")).toBe("url(#knobs-sprite-0-g)");
    expect(circle.get("xlink:href")).toBe("#knobs-sprite-0-base");
    expect(circle.get("stroke")).toBe("#fff");
    expect(symbol.get("viewBox")).toBe("0 0 40 40");
  });
});
