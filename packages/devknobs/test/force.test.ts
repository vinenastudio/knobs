import { afterEach, describe, expect, test } from "bun:test";
import { createEditLog, edits } from "../src/edit/log";
import { newRule } from "../src/edit/rule";
import { inspect } from "../src/styles";
import { clearForced, FORCE_ATTRIBUTE, forceState, forcedSelector, forcedState, forcing, mirrorText, syncForced } from "../src/styles/force";
import { specificity } from "../src/styles/selector";
import type { RuleBlock } from "../src/styles/types";
import { resetPage } from "../src/ui/panel";
import { asElement, matchesSelector, PageDocument, PageElement, type PageSheet } from "./force-dom";
import { switchedSheet } from "../src/engine/style";
import { as, element, type FakeElement, imported, layer, locked, media, nested, page, rule, scope, sheet, supports } from "./styles-cssom";

afterEach(() => {
  clearForced();
});

/** A page of a section.hero with an a.cta in it, under the html. */
function hero(): { doc: PageDocument; section: PageElement; cta: PageElement } {
  const doc = new PageDocument();
  const section = new PageElement(doc, "section", { class: "hero" });
  const cta = new PageElement(doc, "a", { class: "cta" });
  doc.documentElement.append(section);
  section.append(cta);
  return { doc, section, cta };
}

/** The text of the document's stylesheet of copies. */
function copiedText(doc: PageDocument): string {
  const own = doc.adoptedStyleSheets.find((one) => Reflect.get(one, Symbol.for("devknobs.name")) === "force");
  return own ? (own as PageSheet).text : "";
}

describe("a selector as it matches while a state is forced", () => {
  test("stands in the attribute for each state, at its place", () => {
    expect(forcedSelector(".cta:hover")).toBe(`.cta:is(:hover, [${FORCE_ATTRIBUTE}~="hover"])`);
    expect(forcedSelector(".a:hover .b")).toBe(`.a:is(:hover, [${FORCE_ATTRIBUTE}~="hover"]) .b`);
    expect(forcedSelector(".cta:not(:hover)")).toBe(`.cta:not(:is(:hover, [${FORCE_ATTRIBUTE}~="hover"]))`);
    expect(forcedSelector("a:focus-visible")).toBe(`a:is(:focus-visible, [${FORCE_ATTRIBUTE}~="focus-visible"])`);
    expect(forcedSelector("a:FOCUS")).toBe(`a:is(:focus, [${FORCE_ATTRIBUTE}~="focus"])`);
  });

  test("leaves strings, attributes, pseudo-elements and other pseudo-classes as written", () => {
    for (const same of ['[title=":hover"]', 'a[href*=":focus"]', "li:nth-child(2)", "a::before", ".cta", '.x:is([data-a="b"])']) {
      expect(forcedSelector(same)).toBe(same);
    }
  });

  test("weighs as much as before", () => {
    for (const selector of [".cta:hover", ".a:hover .b", ".cta:not(:hover)", "#id:focus:active", "a:focus-within"]) {
      expect(specificity(forcedSelector(selector))).toEqual(specificity(selector));
    }
  });
});

describe("forcing a state", () => {
  test("marks the element, and the ancestors with what the state brings them", () => {
    const { doc, section, cta } = hero();
    expect(forceState(asElement(cta), [":hover", "focus-visible", "nope"])).toEqual(["hover", "focus-visible"]);
    expect(cta.getAttribute(FORCE_ATTRIBUTE)).toBe("hover focus focus-visible focus-within");
    expect(section.getAttribute(FORCE_ATTRIBUTE)).toBe("hover focus-within");
    expect(doc.documentElement.getAttribute(FORCE_ATTRIBUTE)).toBe("hover focus-within");
    expect(forcedState()).toEqual({ element: asElement(cta), states: ["hover", "focus-visible"] });
  });

  test("makes the element match as if it had the state, and :not() of it no more", () => {
    const { cta } = hero();
    const forced = (selector: string) => matchesSelector(cta, forcedSelector(selector));
    expect([forced(".cta:hover"), forced(".hero:hover .cta"), forced(".cta:not(:hover)")]).toEqual([false, false, true]);
    forceState(asElement(cta), ["hover"]);
    expect([forced(".cta:hover"), forced(".hero:hover .cta"), forced(".cta:not(:hover)")]).toEqual([true, true, false]);
    // A state not forced stays as the page has it.
    expect(forced(".cta:focus")).toBe(false);
  });

  test("copies the page's rules with a forced state, in what they sit in", () => {
    const { doc, cta } = hero();
    const cross = locked("https://cdn.example.com/theme.css");
    doc.styleSheets = [
      sheet([
        rule(".cta", "color: white;"),
        rule(".cta:hover", "background: red;"),
        media("(min-width: 600px)", [rule(".hero:hover .cta", "letter-spacing: 1px;")]),
        rule(".cta:not(:hover)", "border-left: 5px solid;"),
        rule(".n", "color: blue;", [rule("&:hover", "color: pink;"), nested("margin: 0;")]),
        rule(".m:hover", "", [nested("padding: 1px;")]),
        layer("base", [supports("(display: grid)", [rule("a:focus", "outline: none;")])]),
      ]),
      cross,
      sheet([rule("a:hover", "color: gray;")], { media: "print" }),
      sheet([imported(sheet([rule(".i:hover", "color: teal;")]), { layer: "lib", media: "screen" })]),
    ];
    forceState(asElement(cta), ["hover"]);
    const is = `:is(:hover, [${FORCE_ATTRIBUTE}~="hover"])`;
    expect(copiedText(doc).split("\n")).toEqual([
      `.cta${is} { background: red; }`,
      `@media (min-width: 600px) { .hero${is} .cta { letter-spacing: 1px; } }`,
      `.cta:not(${is}) { border-left: 5px solid; }`,
      `:is(.n)${is} { color: pink; }`,
      `:is(.m${is}) { padding: 1px; }`,
      `@media print { a${is} { color: gray; } }`,
      `@layer lib { @media screen { .i${is} { color: teal; } } }`,
    ]);
    // A focus forced copies the rule in its layer and `@supports`.
    forceState(asElement(cta), ["focus"]);
    expect(copiedText(doc)).toBe(`@layer base { @supports (display: grid) { a:is(:focus, [${FORCE_ATTRIBUTE}~="focus"]) { outline: none; } } }`);
  });

  test("copies only the selectors of a list that have the state, so the others keep their place", () => {
    const { doc, cta } = hero();
    cta.setAttribute("class", "btn");
    doc.styleSheets = [sheet([rule(".btn:hover, .note, .x:focus", "color: red;"), rule(".note", "color: blue;"), rule(".a:hover, .b", "", [rule(".icon", "fill: red;")])])];
    forceState(asElement(cta), ["hover"]);
    const is = `:is(:hover, [${FORCE_ATTRIBUTE}~="hover"])`;
    expect(copiedText(doc).split("\n")).toEqual([
      `.btn${is} { color: red; }`,
      // Nested under a list with the state in only some of it: under the whole list, as documented.
      `:is(.a${is}, .b) .icon { fill: red; }`,
    ]);
    expect(copiedText(doc)).not.toContain(".note");
  });

  test("copies an `@scope` whose limits have the state whole, a nested one under its rule, and no layer with no name", () => {
    const { doc, cta } = hero();
    doc.styleSheets = [
      sheet([
        scope(".hero:hover", null, [rule(".cta", "outline: 1px;")]),
        scope(".hero", null, [rule(".plain", "color: red;")]),
        rule(".n", "", [scope(".b", null, [rule(".c:hover", "color: pink;")])]),
        layer("", [rule(".cta:hover", "color: gray;")]),
      ]),
    ];
    forceState(asElement(cta), ["hover"]);
    const is = `:is(:hover, [${FORCE_ATTRIBUTE}~="hover"])`;
    expect(copiedText(doc).split("\n")).toEqual([`@scope (.hero${is}) { .cta { outline: 1px; } }`, `@scope (:is(.n) .b) { .c${is} { color: pink; } }`]);
  });

  test("puts back a force attribute the page had", () => {
    const { section, cta } = hero();
    section.setAttribute(FORCE_ATTRIBUTE, "page's own");
    forceState(asElement(cta), ["hover"]);
    expect(section.getAttribute(FORCE_ATTRIBUTE)).toBe("hover");
    clearForced();
    expect(section.getAttribute(FORCE_ATTRIBUTE)).toBe("page's own");
    expect(cta.getAttribute(FORCE_ATTRIBUTE)).toBeNull();
  });

  test("a sheet removed stays off, whatever turns it on after", () => {
    const { doc } = hero();
    const switched = switchedSheet(doc as unknown as Document, "test");
    if (!switched) throw new Error("no sheet");
    switched.on();
    expect(doc.adoptedStyleSheets).toHaveLength(1);
    switched.remove();
    switched.on();
    expect(doc.adoptedStyleSheets).toEqual([]);
  });

  test("copies a shadow host's own rules too, for `:host(:hover)`", () => {
    const { doc, cta } = hero();
    const shadow = { host: cta, ownerDocument: doc, styleSheets: [sheet([rule(":host(:hover)", "color: red;"), rule(".inner", "color: blue;")])], adoptedStyleSheets: [] as object[] };
    Object.assign(cta, { shadowRoot: shadow });
    forceState(asElement(cta), ["hover"]);
    const own = shadow.adoptedStyleSheets[0] as PageSheet | undefined;
    expect(own?.text).toBe(`:host(:is(:hover, [${FORCE_ATTRIBUTE}~="hover"])) { color: red; }`);
    clearForced();
    expect(shadow.adoptedStyleSheets).toEqual([]);
  });

  test("copies the new rules, but none of devknobs' other stylesheets", () => {
    const { doc, cta } = hero();
    const log = createEditLog();
    const change = newRule({ element: asElement(cta), selector: "a.cta" }, ".cta:hover");
    if (!change) throw new Error("no rule");
    log.record(change);
    const made = doc.adoptedStyleSheets[0] as PageSheet;
    made.cssRules[0]?.style.setProperty("background", "blue");
    forceState(asElement(cta), ["hover"]);
    expect(copiedText(doc)).toBe(`.cta:is(:hover, [${FORCE_ATTRIBUTE}~="hover"]) { background: blue; }`);
    // The stylesheet of copies is devknobs' own, and is never copied itself.
    syncForced();
    expect(copiedText(doc).split("\n")).toHaveLength(1);
    expect(mirrorText(asElement(cta).ownerDocument, new Set(["hover"]))).toBe(copiedText(doc));
  });

  test("copies again as the stylesheets change", () => {
    const { doc, cta } = hero();
    const page = sheet([rule(".cta:hover", "color: red;")]);
    doc.styleSheets = [page];
    forceState(asElement(cta), ["hover"]);
    page.cssRules.push(rule(".cta:active", "color: blue;"), rule("a:hover", "color: green;"));
    syncForced();
    expect(copiedText(doc)).toContain("a:is(:hover");
    expect(copiedText(doc)).not.toContain("active");
  });

  test("forcing another element takes the states off the first", () => {
    const { section, cta } = hero();
    forceState(asElement(cta), ["focus"]);
    forceState(asElement(section), ["active"]);
    expect(cta.getAttribute(FORCE_ATTRIBUTE)).toBeNull();
    expect(section.getAttribute(FORCE_ATTRIBUTE)).toBe("active");
    expect(forcedState()?.element).toBe(asElement(section));
  });

  test("clearing takes every mark and the copies off the page, and forces nothing with no states", () => {
    const { doc, section, cta } = hero();
    doc.styleSheets = [sheet([rule(".cta:hover", "color: red;")])];
    forceState(asElement(cta), ["hover"]);
    expect(doc.adoptedStyleSheets).toHaveLength(1);
    clearForced();
    expect([cta, section, doc.documentElement].map((one) => one.getAttribute(FORCE_ATTRIBUTE))).toEqual([null, null, null]);
    expect(doc.adoptedStyleSheets).toEqual([]);
    expect(forcing()).toBe(false);
    expect(forceState(asElement(cta), [])).toEqual([]);
    expect(forceState(null, ["hover"])).toEqual([]);
    expect(forcing()).toBe(false);
  });

  test("forces nothing on devknobs' own elements", () => {
    const { doc, cta } = hero();
    doc.documentElement.setAttribute("data-devknobs", "panel");
    expect(forceState(asElement(cta), ["hover"])).toEqual([]);
    expect(cta.getAttribute(FORCE_ATTRIBUTE)).toBeNull();
  });

  test("is no edit: the log never hears of it", () => {
    const { cta } = hero();
    const before = edits.list().length;
    let told = 0;
    const stop = edits.subscribe(() => told++);
    forceState(asElement(cta), ["hover", "active"]);
    clearForced();
    stop();
    expect(told).toBe(0);
    expect(edits.list()).toHaveLength(before);
  });

  test("the panel's reset takes the states off", () => {
    const { cta } = hero();
    forceState(asElement(cta), ["hover"]);
    let reset = 0;
    resetPage(createEditLog(), () => reset++);
    expect(forcing()).toBe(false);
    expect(cta.getAttribute(FORCE_ATTRIBUTE)).toBeNull();
    expect(reset).toBe(1);
  });
});

describe("the styles engine while a state is forced", () => {
  /** An a.cta under a div.hero whose `matches` answers as a browser does, attributes and all. */
  function live(): { cta: FakeElement & { setAttribute(name: string, value: string): void; removeAttribute(name: string): void } } {
    const doc = page();
    // A document that adopts the stylesheet of copies, as a browser's does.
    Object.assign(doc, { nodeType: 9, querySelector: () => null });
    Object.assign(doc.defaultView, { CSSStyleSheet: class { replaceSync(): void {} } });
    const make = (tag: string, attrs: Record<string, string>) => {
      const one = Object.assign(element(doc, tag, { attrs }), {
        setAttribute: (name: string, value: string) => {
          attrs[name] = value;
        },
        removeAttribute: (name: string) => {
          delete attrs[name];
        },
      });
      one.matches = (selector: string) => matchesSelector(one, selector);
      return one;
    };
    const top = make("div", { class: "hero" });
    const cta = make("a", { class: "cta" });
    cta.parentElement = top;
    doc.styleSheets.push(
      sheet([
        rule(".cta", "background: black;"),
        rule(".cta:hover", "background: red;"),
        rule(".hero:hover .cta", "color: white;"),
        rule(".cta:not(:hover)", "border: 1px;"),
        scope(".hero:hover", null, [rule(".cta", "outline: 1px;")]),
      ]),
    );
    return { cta };
  }

  const applying = (found: ReturnType<typeof inspect>) =>
    found.blocks
      .filter((block): block is RuleBlock => block.kind === "rule")
      .map((block) => [block.selectorText, block.declarations.map((one) => `${one.name}${one.overridden ? " (off)" : ""}`).join(" ")]);

  test("lists the rules of the state as applying, and those of its absence as not", () => {
    const { cta } = live();
    expect(applying(inspect(as(cta)))).toEqual([
      [".cta:not(:hover)", "border"],
      [".cta", "background"],
    ]);
    forceState(as(cta), ["hover"]);
    expect(applying(inspect(as(cta)))).toEqual([
      [".hero:hover .cta", "color"],
      [".cta:hover", "background"],
      // The `@scope (.hero:hover)` rule, its limit matched with the state too.
      [".cta", "outline"],
      [".cta", "background (off)"],
    ]);
    clearForced();
    expect(applying(inspect(as(cta)))).toEqual([
      [".cta:not(:hover)", "border"],
      [".cta", "background"],
    ]);
  });
});
