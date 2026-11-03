/**
 * A new rule, added from the styles view: an empty rule with the selector
 * typed, in a stylesheet of devknobs' own in the element's document or
 * shadow root, one sheet for each rule. Its declarations are then added and
 * edited as any rule's, through the css edits. Undo takes the sheet off the
 * page and redo puts the same one back, so the edits of its declarations
 * still hold the rule they were made in. The styles view lists the rule, as
 * a rule from the stylesheet `new rule`; nothing else of devknobs reads it
 * as one of the page's. To use it:
 *
 *   const change = newRule({ element, selector: "a.cta" }, ".cta:hover");
 *   if (change) edits.record(change);   // null where the selector is no css
 */

import { switchedSheet } from "../engine/style";
import { sheetIdOf } from "./css";
import type { Change, Recorded } from "./log";

/** The name a new rule's stylesheet goes by, in the styles view and in its edits. */
export const NEW_RULE_SHEET = "new rule";

/** Marks a stylesheet a new rule is in. */
const NEW_RULE = Symbol.for("devknobs.newrule");

/** Whether a stylesheet holds a rule added from the styles view. */
export function isNewRuleSheet(sheet: CSSStyleSheet): boolean {
  return Reflect.get(sheet, NEW_RULE) === true;
}

/** The rule each new rule change adds, and the element it was made for. */
const made = new WeakMap<Change, { rule: CSSStyleRule; element: Element }>();

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && "host" in node;
}

function isDocumentNode(node: Node): node is Document {
  return node.nodeType === 9;
}

function isStyleRule(rule: CSSRule | null | undefined): rule is CSSStyleRule {
  return rule?.constructor.name === "CSSStyleRule";
}

function viewOf(element: Element): Window | null {
  try {
    return element.ownerDocument?.defaultView ?? null;
  } catch {
    return null;
  }
}

/**
 * A new rule for an element, with `text` as its selector. Null where that is
 * no selector the browser takes, or where the page has no place for a
 * sheet. `selector` finds the element, for the edit's target.
 */
export function newRule(place: { element: Element; selector: string }, text: string): Change | null {
  const selectorText = text.trim();
  // One selector list and nothing more: no block, no at-rule, no second rule.
  if (selectorText === "" || /[{};]/.test(selectorText) || selectorText.startsWith("@")) return null;
  const { element } = place;
  const root = element.getRootNode();
  if (!isDocumentNode(root) && !isShadowRoot(root)) return null;
  const switched = switchedSheet(root, "new-rule");
  if (!switched) return null;
  const { sheet } = switched;
  try {
    sheet.insertRule(`${selectorText} {}`, 0);
  } catch {
    switched.remove();
    return null;
  }
  const rule = sheet.cssRules[0];
  if (sheet.cssRules.length !== 1 || !isStyleRule(rule)) {
    switched.remove();
    return null;
  }
  Reflect.set(sheet, NEW_RULE, true);
  const change: Change = {
    edit: {
      kind: "css-rule",
      target: {
        selector: place.selector,
        rule: { selectorText: rule.selectorText, sheet: NEW_RULE_SHEET, owner: null, sheetId: sheetIdOf(rule), path: [0], context: [] },
      },
      property: "rule",
      before: null,
      after: rule.selectorText,
    },
    apply() {
      switched.on();
      return true;
    },
    revert: () => switched.off(),
    view: viewOf(element),
  };
  made.set(change, { rule, element });
  return change;
}

/** The rule a new rule change adds. Null for any other change. */
export function ruleOf(change: Change): CSSStyleRule | null {
  return made.get(change)?.rule ?? null;
}

/** The new rules in force made for an element, oldest first. */
export function newRulesFor(recorded: readonly Pick<Recorded, "change">[], element: Element): CSSStyleRule[] {
  const rules: CSSStyleRule[] = [];
  for (const { change } of recorded) {
    const one = made.get(change);
    if (one?.element === element) rules.push(one.rule);
  }
  return rules;
}

/** Whether a rule is one added from the styles view. */
export function isNewRule(rule: CSSRule | CSSNestedDeclarations): boolean {
  const sheet: unknown = Reflect.get(rule, "parentStyleSheet");
  return typeof sheet === "object" && sheet !== null && Reflect.get(sheet, NEW_RULE) === true;
}
