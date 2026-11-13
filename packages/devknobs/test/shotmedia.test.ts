import { afterEach, describe, expect, test } from "bun:test";
import type { MediaFeature } from "../src/engine/media";
import { copyPage, forgetShots } from "../src/engine/pageshot";
import { eitherScheme, frameMedia, freezeMedia, prefixedNamespace } from "../src/engine/shotmedia";

const TRUE_TOKEN = "(min-width: 0px)";
const FALSE_TOKEN = "(not (min-width: 0px))";

/** A declaration block as a sheet parses one: each declaration, its value, and whether it is important. */
class FakeStyle {
  readonly declarations: [string, string, string][] = [];
  constructor(text: string) {
    for (const part of text.split(";")) {
      const colon = part.indexOf(":");
      if (colon < 0) continue;
      const value = part.slice(colon + 1).trim();
      const important = /\s*!important$/.test(value) ? "important" : "";
      this.declarations.push([part.slice(0, colon).trim(), value.replace(/\s*!important$/, ""), important]);
    }
  }
  private find(name: string): [string, string, string] | undefined {
    return this.declarations.find(([own]) => own === name);
  }
  getPropertyValue(name: string): string {
    return this.find(name)?.[1] ?? "";
  }
  getPropertyPriority(name: string): string {
    return this.find(name)?.[2] ?? "";
  }
  setProperty(name: string, value: string, priority = ""): void {
    const found = this.find(name);
    if (found) {
      found[1] = value;
      found[2] = priority;
    } else this.declarations.push([name, value, priority]);
  }
  get cssText(): string {
    return this.declarations.map(([name, value, important]) => `${name}: ${value}${important ? " !important" : ""};`).join(" ");
  }
}

/** A rule as a sheet parses it: a namespace, a group with a condition and rules in it, or a style rule. */
class FakeRule {
  readonly media?: { mediaText: string };
  readonly cssRules?: FakeRule[];
  readonly style?: FakeStyle;
  constructor(
    readonly name: string,
    private condition: string,
    body: string,
    prefixes: Set<string>,
  ) {
    if (name === "@namespace") return;
    if (name === "@media") this.media = { mediaText: condition };
    if (name.startsWith("@")) this.cssRules = parse(body, prefixes);
    else this.style = new FakeStyle(body);
  }
  get cssText(): string {
    if (this.name === "@namespace") return `@namespace ${this.condition};`;
    if (this.style) return `${this.name} { ${this.style.cssText} }`;
    const head = this.media ? this.media.mediaText : this.condition;
    return `${this.name} ${head} { ${(this.cssRules ?? []).map((rule) => rule.cssText).join(" ")} }`;
  }
}

/**
 * The rules in `text`, by its braces: enough of css for these tests. A
 * selector with a namespace prefix not declared is dropped, as a browser
 * drops it.
 */
function parse(text: string, prefixes = new Set<string>()): FakeRule[] {
  const rules: FakeRule[] = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at).trimStart();
    at = text.length - rest.length;
    if (rest.startsWith("@namespace")) {
      const end = text.indexOf(";", at);
      const condition = text.slice(at + "@namespace".length, end).trim();
      prefixes.add(condition.split(/\s+/)[0] ?? "");
      rules.push(new FakeRule("@namespace", condition, "", prefixes));
      at = end + 1;
      continue;
    }
    const open = text.indexOf("{", at);
    if (open < 0) break;
    let depth = 1;
    let end = open + 1;
    for (; depth > 0 && end < text.length; end++) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}") depth--;
    }
    const head = text.slice(at, open).trim();
    const body = text.slice(open + 1, end - 1);
    at = end;
    const group = /^(@[a-z-]+)\s+(.*)$/s.exec(head);
    if (group) rules.push(new FakeRule(group[1] ?? "", (group[2] ?? "").trim(), body, prefixes));
    else if (!/([\w-]+)\|/.exec(head) || prefixes.has(/([\w-]+)\|/.exec(head)?.[1] ?? "")) {
      rules.push(new FakeRule(head, "", body, prefixes));
    }
  }
  return rules;
}

/** A constructable sheet, as the frame's window has one. */
class FakeSheet {
  cssRules: FakeRule[] = [];
  replaceSync(text: string): void {
    this.cssRules = parse(text);
  }
}

const Sheet = FakeSheet as unknown as typeof CSSStyleSheet;

/** A frame's window on a dark system that reads light, a mouse, and reduced motion, as its knobs have it. */
const LIGHT_FRAME = new Set([
  "(prefers-color-scheme: light)",
  "(prefers-reduced-motion: reduce)",
  "(prefers-contrast: no-preference)",
  "(pointer: fine)",
  "(any-pointer: fine)",
  "(any-pointer: coarse)",
  "(hover: hover)",
  "(any-hover: hover)",
]);

function viewOf(reads: Set<string>, extra: Record<string, unknown> = {}): Window {
  return { matchMedia: (query: string) => ({ matches: reads.has(query) }), ...extra } as unknown as Window;
}

const LIGHT_READ = frameMedia(viewOf(LIGHT_FRAME));

/** What the copy's rules read in a light frame on a dark system. */
function frozen(rules: string[]): string[] {
  return freezeMedia(rules, LIGHT_READ, Sheet).rules;
}

describe("frameMedia", () => {
  test("reads each feature as the frame's window answers it, leaving out one it knows no value of or two of", () => {
    expect(LIGHT_READ).toEqual([
      ["prefers-color-scheme", "light"],
      ["prefers-reduced-motion", "reduce"],
      ["prefers-contrast", "no-preference"],
      ["pointer", "fine"],
      ["hover", "hover"],
      ["any-hover", "hover"],
    ] satisfies [MediaFeature, string][]);
  });
});

describe("freezeMedia", () => {
  test("turns the dark rules of a light frame on a dark system off, and keeps the light ones on", () => {
    const rules = [
      "body { color: black; }",
      "@media (prefers-color-scheme: dark) { body { color: white; } }",
      "@media (prefers-color-scheme: light) { body { background: white; } }",
    ];
    expect(frozen(rules)).toEqual([
      "body { color: black; }",
      `@media ${FALSE_TOKEN} { body { color: white; } }`,
      `@media ${TRUE_TOKEN} { body { background: white; } }`,
    ]);
  });

  test("rewrites a query inside @supports, and one inside another", () => {
    const rules = [
      "@supports (display: grid) { @media (prefers-color-scheme: dark) { p { color: white; } } }",
      "@media screen { @media (prefers-color-scheme: dark) { p { color: gray; } } }",
    ];
    expect(frozen(rules)).toEqual([
      `@supports (display: grid) { @media ${FALSE_TOKEN} { p { color: white; } } }`,
      `@media screen { @media ${FALSE_TOKEN} { p { color: gray; } } }`,
    ]);
  });

  test("keeps the query of a list on where another of it holds", () => {
    const rules = ["@media (prefers-color-scheme: dark), print { p { color: white; } }"];
    expect(frozen(rules)).toEqual([`@media ${FALSE_TOKEN}, print { p { color: white; } }`]);
  });

  test("leaves `not` and `or` to the browser, each feature made one that holds or one that does not", () => {
    const rules = [
      "@media (not (prefers-color-scheme: dark)) { p { color: black; } }",
      "@media (prefers-color-scheme: dark) or (hover) { p { color: gray; } }",
      "@media (prefers-color-scheme: light) or (prefers-color-scheme: dark) { p { color: red; } }",
    ];
    expect(frozen(rules)).toEqual([
      `@media (not ${FALSE_TOKEN}) { p { color: black; } }`,
      `@media ${FALSE_TOKEN} or ${TRUE_TOKEN} { p { color: gray; } }`,
      `@media ${TRUE_TOKEN} or ${FALSE_TOKEN} { p { color: red; } }`,
    ]);
  });

  test("freezes the other features too: motion, pointer and hover", () => {
    const rules = [
      "@media (prefers-reduced-motion: no-preference) { p { transition: color 1s; } }",
      "@media (prefers-reduced-motion) { p { transition: none; } }",
      "@media (pointer: coarse) { p { padding: 12px; } }",
      "@media (hover: hover) { p { cursor: pointer; } }",
    ];
    expect(frozen(rules)).toEqual([
      `@media ${FALSE_TOKEN} { p { transition: color 1s; } }`,
      `@media ${TRUE_TOKEN} { p { transition: none; } }`,
      `@media ${FALSE_TOKEN} { p { padding: 12px; } }`,
      `@media ${TRUE_TOKEN} { p { cursor: pointer; } }`,
    ]);
  });

  test("parses a rule with the page's namespaces in front, so its namespaced selectors are kept, and writes them once", () => {
    const space = "@namespace svg url(http://www.w3.org/2000/svg);";
    const rules = [space, "@media (prefers-color-scheme: dark) { svg|rect { fill: white; } }"];
    expect(frozen(rules)).toEqual([space, `@media ${FALSE_TOKEN} { svg|rect { fill: white; } }`]);
  });

  test("sets each scheme that picks light or dark to the frame's, its priority and its `only` kept", () => {
    const rules = [
      ":root { color-scheme: light dark; }",
      ".card { color-scheme: dark light !important; }",
      ".only { color-scheme: light dark only; }",
      ".dark { color-scheme: dark; }",
      "@media (min-width: 600px) { aside { color-scheme: light dark; } }",
    ];
    expect(freezeMedia(rules, LIGHT_READ, Sheet)).toEqual({
      rules: [
        ":root { color-scheme: light; }",
        ".card { color-scheme: light !important; }",
        ".only { color-scheme: light only; }",
        ".dark { color-scheme: dark; }",
        "@media (min-width: 600px) { aside { color-scheme: light; } }",
      ],
      computed: false,
    });
  });

  test("tells a scheme set through a variable apart, which only the elements' computed schemes tell", () => {
    const rules = [":root { --scheme: light dark; color-scheme: var(--scheme); }"];
    expect(freezeMedia(rules, LIGHT_READ, Sheet).computed).toBe(true);
  });

  test("leaves the rules as they are without a sheet to parse them in, or nothing read", () => {
    const rules = ["@media (prefers-color-scheme: dark) { p { color: white; } }", ":root { color-scheme: light dark; }"];
    expect(freezeMedia(rules, LIGHT_READ, undefined)).toEqual({ rules, computed: true });
    expect(freezeMedia(rules, [], Sheet)).toEqual({ rules, computed: false });
  });
});

describe("prefixedNamespace", () => {
  test("is a namespace with a prefix, not a default one", () => {
    expect(prefixedNamespace('@namespace svg url("http://www.w3.org/2000/svg");')).toBe(true);
    expect(prefixedNamespace('@namespace url("http://www.w3.org/1999/xhtml");')).toBe(false);
    expect(prefixedNamespace('@namespace "http://www.w3.org/1999/xhtml";')).toBe(false);
    expect(prefixedNamespace("p { margin: 0; }")).toBe(false);
  });
});

describe("eitherScheme", () => {
  test("is a scheme the browser picks by the system's", () => {
    expect(eitherScheme("light dark")).toBe(true);
    expect(eitherScheme("dark light")).toBe(true);
    expect(eitherScheme("light dark only")).toBe(true);
    expect(eitherScheme("light")).toBe(false);
    expect(eitherScheme("only light")).toBe(false);
    expect(eitherScheme("normal")).toBe(false);
  });
});

/** An element of the page or of its copy, with its computed scheme. */
class El {
  readonly attributes = new Map<string, string>();
  readonly children: El[] = [];
  parentElement: El | null = null;
  text = "";
  constructor(
    readonly localName: string,
    readonly scheme = "",
    children: El[] = [],
    attributes: Record<string, string> = {},
  ) {
    this.append(...children);
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
  }
  append(...nodes: El[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  all(): El[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
  getElementsByTagName(): El[] {
    return this.all();
  }
  querySelectorAll(selector: string): El[] {
    const names = selector.split(/,\s*/);
    return this.all().filter((node) =>
      names.some((name) => (name.startsWith("[") ? node.attributes.has(name.slice(1, -1)) : name === node.localName)),
    );
  }
  querySelector(selector: string): El | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  remove(): void {
    const siblings = this.parentElement?.children;
    siblings?.splice(siblings.indexOf(this), 1);
  }
  set textContent(text: string) {
    this.text = text;
  }
  clone(): El {
    const copy = new El(this.localName, this.scheme, this.children.map((child) => child.clone()));
    for (const [name, value] of this.attributes) copy.attributes.set(name, value);
    return copy;
  }
}

/** A sheet of the page: its rules as written, and the media its `<link>` or `<style>` is for. */
interface PageSheet {
  rules: string[];
  media?: string;
}

describe("copyPage, of a frame that reads another scheme than the system", () => {
  afterEach(() => forgetShots());

  function copied(sheets: (string[] | PageSheet)[], live: El, leave?: (node: El) => boolean): El {
    const inert = { importNode: (node: El) => node.clone(), createElement: (name: string) => new El(name) };
    const view = viewOf(LIGHT_FRAME, {
      CSSStyleSheet: FakeSheet,
      getComputedStyle: (node: El) => ({ getPropertyValue: () => node.scheme }),
    });
    const doc = {
      documentElement: live,
      defaultView: view,
      styleSheets: sheets.map((sheet) => {
        const { rules, media = "" } = Array.isArray(sheet) ? { rules: sheet } : sheet;
        return { cssRules: rules.map((cssText) => ({ cssText })), media: { mediaText: media } };
      }),
      implementation: { createHTMLDocument: () => inert },
      querySelector: (selector: string) =>
        selector === 'meta[name="color-scheme"]' ? (live.all().find((node) => node.localName === "meta") ?? null) : null,
      querySelectorAll: (selector: string) =>
        selector === '[style*="color-scheme"]'
          ? [live, ...live.all()].filter((node) => node.getAttribute("style")?.includes("color-scheme"))
          : [],
    };
    const copy = copyPage(
      { contentDocument: doc } as unknown as HTMLIFrameElement,
      leave as ((node: Element) => boolean) | undefined,
    ) as unknown as El | null;
    if (!copy) throw new Error("the page was not copied");
    return copy;
  }

  /** Every element of `copy` with a style of its own, by name. */
  function styled(copy: El): [string, string][] {
    return [copy, ...copy.all()].flatMap((node) => {
      const style = node.getAttribute("style");
      return style === null ? [] : [[node.localName, style] as [string, string]];
    });
  }

  const page = (scheme: string, body: El[] = [], head: El[] = []) =>
    new El("html", scheme, [new El("head", scheme, head), new El("body", scheme, body)]);

  test("draws the frame's light rules, not the system's dark ones", () => {
    const copy = copied([["@media (prefers-color-scheme: dark) { body { background: black; } }"]], page("normal"));
    expect(copy.querySelector("style")?.text).toBe(`@media ${FALSE_TOKEN} { body { background: black; } }`);
  });

  test("keeps a sheet for some media only for those media, as the frame reads them", () => {
    const copy = copied(
      [
        { rules: ["p { color: white; }"], media: "(prefers-color-scheme: dark)" },
        { rules: ["p { margin: 0; }"], media: "all" },
      ],
      page("normal"),
    );
    expect(copy.querySelector("style")?.text).toBe(`@media ${FALSE_TOKEN} { p { color: white; } }\np { margin: 0; }`);
  });

  test("sets the rules' schemes to the frame's, and pins only the root inline, not each element under it", () => {
    const live = page("light dark", [new El("main", "light dark", [new El("p", "light dark")])]);
    live.setAttribute("style", "font-size: 20px");
    const copy = copied([[":root { color-scheme: light dark; }", "section { color-scheme: light dark; }"]], live);
    expect(copy.querySelector("style")?.text).toBe(":root { color-scheme: light; }\nsection { color-scheme: light; }");
    expect(styled(copy)).toEqual([["html", "font-size: 20px;color-scheme:light !important"]]);
    // The page itself is untouched.
    expect(live.getAttribute("style")).toBe("font-size: 20px");
  });

  test("pins an element whose inline style picks light or dark, which no rule reaches, its `only` kept", () => {
    const aside = new El("aside", "light dark only", [], { style: "color-scheme: light dark only" });
    const copy = copied([["p { margin: 0; }"]], page("normal", [aside, new El("p", "light dark")]));
    expect(styled(copy)).toEqual([["aside", "color-scheme: light dark only;color-scheme:light only !important"]]);
  });

  test("pins every element that picks light or dark where a rule sets its scheme through a variable", () => {
    const copy = copied(
      [[":root { --scheme: light dark; color-scheme: var(--scheme); }"]],
      page("light dark", [new El("p", "light dark"), new El("pre", "dark")]),
    );
    const pinned = ";color-scheme:light !important";
    expect(styled(copy)).toEqual([
      ["html", pinned],
      ["head", pinned],
      ["body", pinned],
      ["p", pinned],
    ]);
  });

  test("pins the root by its color-scheme meta where its own is normal, but not by one that picks one scheme", () => {
    const either = copied([["p { margin: 0; }"]], page("normal", [], [new El("meta", "normal", [], { name: "color-scheme", content: "light dark" })]));
    expect(either.getAttribute("style")).toBe(";color-scheme:light !important");
    const one = copied([["p { margin: 0; }"]], page("normal", [], [new El("meta", "normal", [], { name: "color-scheme", content: "only light" })]));
    expect(styled(one)).toEqual([]);
  });

  test("moves a prefixed namespace to the top, and leaves a default one out, so it holds for no other sheet", () => {
    const prefixed = '@namespace svg url("http://www.w3.org/2000/svg");';
    const copy = copied(
      [["p { margin: 0; }"], ['@namespace url("http://www.w3.org/2000/svg");', prefixed, "rect { fill: red; }"]],
      page("normal"),
    );
    expect(copy.querySelector("style")?.text).toBe(`${prefixed}\np { margin: 0; }\nrect { fill: red; }`);
  });

  test("sets no style anywhere on a root that is normal with no meta", () => {
    const copy = copied([["p { margin: 0; }"]], page("normal", [new El("p", "normal")]));
    expect(styled(copy)).toEqual([]);
  });

  test("leaves out what `leave` picks and pins the rest by the same order", () => {
    const live = page("normal", [
      new El("nav", "light dark", [], { style: "color-scheme: light dark", fixed: "" }),
      new El("section", "light dark", [], { style: "color-scheme: light dark" }),
    ]);
    const copy = copied([["p { margin: 0; }"]], live, (node) => node.attributes.has("fixed"));
    expect(copy.querySelector("nav")).toBeNull();
    expect(styled(copy)).toEqual([["section", "color-scheme: light dark;color-scheme:light !important"]]);
  });
});
