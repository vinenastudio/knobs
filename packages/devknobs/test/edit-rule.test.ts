import { afterEach, describe, expect, test } from "bun:test";
import { cssOff, cssValue } from "../src/edit/css";
import { createEditLog, type Edit, type EditLog } from "../src/edit/log";
import { isNewRule, isNewRuleSheet, NEW_RULE_SHEET, newRule, newRulesFor, ruleOf } from "../src/edit/rule";
import { diffText, NEW_RULE_NOTE, netChanges, promptText } from "../src/edit/text";
import { isOwnSheet } from "../src/engine/style";
import { invalidate } from "../src/styles";
import { rulesOf } from "../src/styles/collect";
import { clearForced, forceState } from "../src/styles/force";
import { newRuleSelector } from "../src/ui/cssedit";
import { sourceOf } from "../src/ui/stylesformat";
import { asElement, type CSSStyleRule, PageDocument, PageElement, type PageSheet } from "./force-dom";
import { rule as pageRule, sheet } from "./styles-cssom";

afterEach(() => {
  clearForced();
});

function cta(): { doc: PageDocument; element: PageElement } {
  const doc = new PageDocument();
  const element = new PageElement(doc, "a", { class: "cta" });
  doc.documentElement.append(element);
  return { doc, element };
}

/** Add a rule through the log, with its rule and stylesheet. */
function added(log: EditLog, element: PageElement, text: string): { edit: Edit; rule: CSSStyleRule; sheet: PageSheet } {
  const change = newRule({ element: asElement(element), selector: "a.cta" }, text);
  if (!change) throw new Error("no rule");
  const edit = log.record(change);
  const rule = ruleOf(change) as CSSStyleRule | null;
  if (!edit || !rule) throw new Error("not recorded");
  return { edit, rule, sheet: rule.parentStyleSheet };
}

/** The rule's block, where the css edits go. */
function placeOf(element: PageElement, rule: CSSStyleRule) {
  return {
    style: rule.style as unknown as CSSStyleDeclaration,
    element: asElement(element),
    selector: "a.cta",
    rule: { selectorText: rule.selectorText, sheet: NEW_RULE_SHEET, owner: null, sheetId: 0, path: [0], context: [] },
  };
}

describe("a new rule", () => {
  test("adds an empty rule with the selector in a stylesheet of its own, as an edit", () => {
    const { doc, element } = cta();
    const log = createEditLog();
    const { edit, sheet: own } = added(log, element, " .cta:hover ");
    expect(edit).toMatchObject({
      kind: "css-rule",
      property: "rule",
      before: null,
      after: ".cta:hover",
      target: { selector: "a.cta", rule: { selectorText: ".cta:hover", sheet: NEW_RULE_SHEET, owner: null, path: [0], context: [] } },
    });
    expect(doc.adoptedStyleSheets).toEqual([own]);
    expect(own.cssRules.map((one) => one.selectorText)).toEqual([".cta:hover"]);
    expect(isNewRuleSheet(own as unknown as CSSStyleSheet)).toBe(true);
  });

  test("takes properties, and undo, redo and undo all bring back the same rule each time", () => {
    const { doc, element } = cta();
    const log = createEditLog();
    const { rule, sheet: own } = added(log, element, ".cta:hover");
    const place = placeOf(element, rule);
    const add = cssValue("css-add", place, "background", "#2f6df6");
    if (!add) throw new Error("no change");
    log.record(add);
    expect(rule.style.cssText).toBe("background: #2f6df6;");
    log.undo();
    expect(rule.style.cssText).toBe("");
    log.undo();
    expect(doc.adoptedStyleSheets).toEqual([]);
    log.redo();
    log.redo();
    expect(doc.adoptedStyleSheets).toEqual([own]);
    expect(own.cssRules[0]).toBe(rule);
    expect(rule.style.cssText).toBe("background: #2f6df6;");
    // A line turned off in it, then everything undone.
    const off = cssOff(place, "background", log.recorded);
    if (!off) throw new Error("no change");
    log.record(off);
    expect(log.undoAll()).toBe(3);
    expect(doc.adoptedStyleSheets).toEqual([]);
    expect(rule.style.cssText).toBe("");
    expect(log.list()).toEqual([]);
  });

  test("refuses a selector the browser does not take, an at-rule, a block or a second rule", () => {
    const { doc, element } = cta();
    for (const text of ["", "   ", ".cta!!", "@media print", ".a { color: red }", ".a {} .b", "a; b"]) {
      expect(newRule({ element: asElement(element), selector: "a.cta" }, text)).toBeNull();
    }
    expect(doc.adoptedStyleSheets).toEqual([]);
  });

  test("is listed for the element it was made for, while it is in force", () => {
    const { doc, element } = cta();
    const other = new PageElement(doc, "p");
    const log = createEditLog();
    const one = added(log, element, ".cta:hover");
    const two = added(log, element, ".cta:focus");
    added(log, other, "p");
    expect(newRulesFor(log.recorded(), asElement(element))).toEqual([one.rule, two.rule] as unknown as globalThis.CSSStyleRule[]);
    log.undo();
    log.undo();
    expect(newRulesFor(log.recorded(), asElement(element))).toEqual([one.rule] as unknown as globalThis.CSSStyleRule[]);
    expect(isNewRule(one.rule as unknown as globalThis.CSSStyleRule)).toBe(true);
  });

  test("is shown in the styles engine as from the stylesheet `new rule`, as the stylesheet of copies is not", () => {
    const { doc, element } = cta();
    doc.styleSheets = [sheet([pageRule(".cta", "color: red;"), pageRule(".cta:hover", "color: blue;")])];
    const log = createEditLog();
    const { sheet: own } = added(log, element, ".cta:focus");
    forceState(asElement(element), ["hover"]);
    // Both are devknobs' own, so whatever leaves those out leaves these out.
    expect(doc.adoptedStyleSheets).toHaveLength(2);
    for (const one of doc.adoptedStyleSheets) expect(isOwnSheet(one as unknown as CSSStyleSheet)).toBe(true);
    expect(doc.adoptedStyleSheets[0]).toBe(own);
    invalidate();
    const flat = rulesOf(doc as unknown as Document);
    expect(flat.rules.map((one) => [one.selectorText, one.origin.sheet, one.origin.owner])).toEqual([
      [".cta", "constructed", null],
      [".cta:hover", "constructed", null],
      [".cta:focus", NEW_RULE_SHEET, null],
    ]);
    expect(sourceOf({ sheet: NEW_RULE_SHEET, owner: null, path: [0] }).text).toBe("new rule");
  });

  test("starts from the element's classes, else a selector that finds it, then the states forced", () => {
    const { doc, element } = cta();
    element.setAttribute("class", "cta  cta-lg");
    expect(newRuleSelector(asElement(element), ["hover", "focus-visible"])).toBe(".cta.cta-lg:hover:focus-visible");
    element.setAttribute("class", "w-1/2");
    expect(newRuleSelector(asElement(element))).toBe(".w-1\\/2");
    const plain = new PageElement(doc, "p");
    expect(newRuleSelector(asElement(plain))).toBe("p");
  });
});

describe("a new rule as text", () => {
  const RULE = { selectorText: ".cta:hover", sheet: NEW_RULE_SHEET, owner: null, sheetId: 7, path: [0], context: [] };
  const made: Edit[] = [
    { id: 1, kind: "css-rule", target: { selector: "a.cta", source: "src/Hero.tsx:42", rule: RULE }, property: "rule", before: null, after: ".cta:hover" },
    { id: 2, kind: "css-add", target: { selector: "a.cta", rule: RULE }, property: "background", before: null, after: "#2f6df6" },
  ];

  test("is one place with the properties added to it", () => {
    const groups = netChanges(made);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.changes.map((one) => one.kind)).toEqual(["css-rule", "css-add"]);
  });

  test("is a diff of the selector, then its declarations", () => {
    expect(diffText(made)).toBe("new rule for a.cta\n+ .cta:hover { }\n+ background: #2f6df6;");
  });

  test("asks the agent to add it in the source, with the element's file and line", () => {
    const prompt = promptText(made);
    expect(prompt).toContain(["1. Element `a.cta`", "   Source: src/Hero.tsx:42", "   New rule: `.cta:hover`, to add in the source", "   background: (not set) -> #2f6df6"].join("\n"));
    expect(prompt).toContain(NEW_RULE_NOTE);
  });

  test("writes a selector from the page as data", () => {
    const odd = '.a[title="`x`"]';
    const rule = { ...RULE, selectorText: odd };
    const prompt = promptText([{ id: 1, kind: "css-rule", target: { selector: "a.cta", rule }, property: "rule", before: null, after: odd }]);
    expect(prompt).toContain(`New rule: \`${JSON.stringify(odd)}\``);
  });
});
