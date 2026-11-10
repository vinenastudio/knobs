import { afterEach, describe, expect, test } from "bun:test";
import type { MediaFeature } from "../src/engine/media";
import { copyPage, forgetShots } from "../src/engine/pageshot";
import { eitherScheme, frameMedia, freezeMedia } from "../src/engine/shotmedia";

/** A rule as a sheet parses it: a group with a condition and rules in it, or a style rule as written. */
class FakeRule {
  readonly media?: { mediaText: string };
  readonly cssRules?: FakeRule[];
  constructor(
    readonly name: string,
    private condition: string,
    body: string,
  ) {
    if (name === "@media") this.media = { mediaText: condition };
    if (name.startsWith("@")) this.cssRules = parse(body);
    else this.condition = body.trim();
  }
  get cssText(): string {
    if (!this.cssRules) return `${this.name} { ${this.condition} }`;
    const head = this.media ? this.media.mediaText : this.condition;
    return `${this.name} ${head} { ${this.cssRules.map((rule) => rule.cssText).join(" ")} }`;
  }
}

/** The rules in `text`, by its braces: enough of css for these tests. */
function parse(text: string): FakeRule[] {
  const rules: FakeRule[] = [];
  let at = 0;
  while (at < text.length) {
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
    const group = /^(@[a-z-]+)\s+(.*)$/s.exec(head);
    rules.push(group ? new FakeRule(group[1] ?? "", (group[2] ?? "").trim(), body) : new FakeRule(head, "", body));
    at = end;
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
      "body { color: black }",
      "@media (prefers-color-scheme: dark) { body { color: white } }",
      "@media (prefers-color-scheme: light) { body { background: white } }",
    ];
    expect(freezeMedia(rules, LIGHT_READ, Sheet)).toEqual([
      "body { color: black }",
      "@media not all { body { color: white } }",
      "@media (min-width: 0px) { body { background: white } }",
    ]);
  });

  test("rewrites a query inside @supports, and one inside another", () => {
    const rules = [
      "@supports (display: grid) { @media (prefers-color-scheme: dark) { p { color: white } } }",
      "@media screen { @media (prefers-color-scheme: dark) { p { color: gray } } }",
    ];
    expect(freezeMedia(rules, LIGHT_READ, Sheet)).toEqual([
      "@supports (display: grid) { @media not all { p { color: white } } }",
      "@media screen { @media not all { p { color: gray } } }",
    ]);
  });

  test("keeps the query of a list on where another of it holds", () => {
    const rules = ["@media (prefers-color-scheme: dark), print { p { color: white } }"];
    expect(freezeMedia(rules, LIGHT_READ, Sheet)).toEqual(["@media not all, print { p { color: white } }"]);
  });

  test("freezes the other features too: motion, pointer and hover", () => {
    const rules = [
      "@media (prefers-reduced-motion: no-preference) { p { transition: color 1s } }",
      "@media (prefers-reduced-motion) { p { transition: none } }",
      "@media (pointer: coarse) { p { padding: 12px } }",
      "@media (hover: hover) { p { cursor: pointer } }",
    ];
    expect(freezeMedia(rules, LIGHT_READ, Sheet)).toEqual([
      "@media not all { p { transition: color 1s } }",
      "@media (min-width: 0px) { p { transition: none } }",
      "@media not all { p { padding: 12px } }",
      "@media (min-width: 0px) { p { cursor: pointer } }",
    ]);
  });

  test("leaves the rules as they are without a sheet to parse them in, or nothing read", () => {
    const rules = ["@media (prefers-color-scheme: dark) { p { color: white } }"];
    expect(freezeMedia(rules, LIGHT_READ, undefined)).toEqual(rules);
    expect(freezeMedia(rules, [], Sheet)).toEqual(rules);
  });
});

describe("eitherScheme", () => {
  test("is a scheme the browser picks by the system's", () => {
    expect(eitherScheme("light dark")).toBe(true);
    expect(eitherScheme("dark light")).toBe(true);
    expect(eitherScheme("light")).toBe(false);
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
  ) {
    this.append(...children);
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
    const names = selector.split(", ");
    return this.all().filter(
      (node) => names.includes(node.localName) || (names.includes("[data-devknobs]") && node.attributes.has("data-devknobs")),
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

describe("copyPage, of a frame that reads another scheme than the system", () => {
  afterEach(() => forgetShots());

  function copied(rules: string[], live: El): El {
    const inert = { importNode: (node: El) => node.clone(), createElement: (name: string) => new El(name) };
    const doc = {
      documentElement: live,
      styleSheets: [{ cssRules: rules.map((cssText) => ({ cssText })) }],
      implementation: { createHTMLDocument: () => inert },
      querySelector: () => null,
    };
    const view = viewOf(LIGHT_FRAME, {
      CSSStyleSheet: FakeSheet,
      getComputedStyle: (node: El) => ({ getPropertyValue: () => node.scheme }),
    });
    const copy = copyPage({ contentDocument: doc, contentWindow: view } as unknown as HTMLIFrameElement) as unknown as El | null;
    if (!copy) throw new Error("the page was not copied");
    return copy;
  }

  test("draws the frame's light rules, not the system's dark ones", () => {
    const live = new El("html", "normal", [new El("head", "normal"), new El("body", "normal")]);
    const copy = copied(["@media (prefers-color-scheme: dark) { body { background: black } }"], live);
    expect(copy.querySelector("style")?.text).toBe("@media not all { body { background: black } }");
  });

  test("pins the root that picks light or dark to the frame's scheme, and each under it that picks, but not one with a scheme of its own", () => {
    const live = new El("html", "light dark", [
      new El("head", "light dark"),
      new El("body", "light dark", [new El("aside", "dark light"), new El("p", "light")]),
    ]);
    live.setAttribute("style", "font-size: 20px");
    const copy = copied([":root { color-scheme: light dark }", "aside { color-scheme: dark light }"], live);
    expect(copy.getAttribute("style")).toBe("font-size: 20px;color-scheme:light !important");
    const [body, aside, p] = ["body", "aside", "p"].map((name) => copy.querySelector(name));
    expect(body?.getAttribute("style")).toBe(";color-scheme:light !important");
    expect(aside?.getAttribute("style")).toBe(";color-scheme:light !important");
    expect(p?.getAttribute("style")).toBeNull();
    // The page itself is untouched.
    expect(live.getAttribute("style")).toBe("font-size: 20px");
  });

  test("pins one that sets the same scheme as its pinned parent again, as its own rule would undo the pin it takes", () => {
    const live = new El("html", "light dark", [new El("head", "light dark"), new El("body", "light dark", [new El("section", "light dark")])]);
    const copy = copied([":root, section { color-scheme: light dark }"], live);
    expect(copy.getAttribute("style")).toBe(";color-scheme:light !important");
    expect(copy.querySelector("section")?.getAttribute("style")).toBe(";color-scheme:light !important");
  });

  test("pins only the root where no rule or inline style sets a scheme, as the rest take its pin", () => {
    const live = new El("html", "light dark", [new El("head", "light dark"), new El("body", "light dark")]);
    const copy = copied(["body { margin: 0 }"], live);
    expect(copy.getAttribute("style")).toBe(";color-scheme:light !important");
    expect(copy.querySelector("body")?.getAttribute("style")).toBeNull();
  });
});
