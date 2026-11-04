/**
 * Edits made again from their plain data, as kept for a page or handed to
 * `devknobs.setEdits()`: each one's element found by its selector, its rule
 * by its selector, what it sits in and its stylesheet, and its text by which
 * of the element's texts it is. An edit is made only where the page has the
 * value it had before it, and goes to the log as one made in the panel. A
 * new rule is made anew, and the edits of its declarations go to the rule
 * made, as told by the id its stylesheet had. An html or attribute edit that
 * could run a script is never made, and after a delete, a move or an html edit
 * that was not made, no later edit is: it may stand on it. As the page loads,
 * `hold` leaves the first html or attribute edit and all after it waiting for
 * the user. Loaded only once there is an edit to make. To use it:
 *
 *   const { applied, skipped, waiting } = replayEdits(edits, list, hold);
 */

import { rulesOf } from "../styles/collect";
import { markupOf } from "../ui/domtree";
import { type CssPlace, cssOff, cssOn, cssValue, offIn, sheetIdOf } from "./css";
import { attrEdit, deleteEdit, hideEdit, htmlEdit, moveEdit, nextElementOf, parseHtml, textEdit } from "./html";
import { REASONS, type Replaying, readSavedEdit, type SavedEdit } from "./keep";
import type { Change, Edit, EditLog, EditTarget } from "./log";
import { RISK, riskyAttribute, riskyNodes } from "./risk";
import { NEW_RULE_SHEET, newRule, ruleOf } from "./rule";

/** Why an edit after one that was not made is not made either. */
export const AFTER_MISSED = "an earlier edit it may depend on was not made";

/** Edits that change which nodes stand where: one not made leaves the later ones on another page. */
const STRUCTURE = new Set(["delete", "move", "html"]);

/** What a step of a selector through shadow roots and frames goes into: grab writes `>>>` and `>>iframe>>`. */
const JOIN = /\s*(>>>|>>iframe>>)\s*/;

function isElement(node: unknown): node is Element {
  return typeof node === "object" && node !== null && Reflect.get(node, "nodeType") === 1;
}

function isScope(node: unknown): node is Document | ShadowRoot {
  if (typeof node !== "object" || node === null) return false;
  const type: unknown = Reflect.get(node, "nodeType");
  return type === 9 || type === 11;
}

function hasStyle(element: Element): element is Element & ElementCSSInlineStyle {
  return "style" in element;
}

/** The element a selector grab wrote finds, through shadow roots and frames. Null where it finds none. */
export function findElement(doc: Document, selector: string): Element | null {
  const steps = selector.split(JOIN);
  let scope: Document | ShadowRoot | null = doc;
  let found: Element | null = null;
  for (let at = 0; at < steps.length; at += 2) {
    if (!scope) return null;
    try {
      found = scope.querySelector(steps[at] ?? "");
    } catch {
      return null;
    }
    if (!found) return null;
    const join = steps[at + 1];
    if (join === ">>>") scope = found.shadowRoot;
    else if (join) {
      const inner: unknown = Reflect.get(found, "contentDocument");
      scope = isScope(inner) ? inner : null;
    }
  }
  return found;
}

/** The element's text a `text` or `text 2` property names: its texts that are not blank, counted from 1. */
function textAt(element: Element, property: string): Node | null {
  const match = /^text(?: (\d+))?$/.exec(property);
  if (!match) return null;
  const at = Number(match[1] ?? "1");
  const texts = Array.from(element.childNodes).filter((one) => one.nodeType === 3 && (one.nodeValue ?? "").trim() !== "");
  return texts[at - 1] ?? null;
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((one, at) => one === b[at]);
}

/** Where a css edit is: the rule found again, a new rule made on this replay, or the element's own style. A reason where it is none of them. */
function placeOf(edit: SavedEdit, element: Element, made: ReadonlyMap<number, CSSStyleRule>): CssPlace | string {
  const rule = edit.target.rule;
  const selector = edit.target.selector;
  if (!rule) return hasStyle(element) ? { style: element.style, element, selector } : REASONS.missing;
  if (rule.sheet === NEW_RULE_SHEET) {
    const found = made.get(rule.sheetId);
    if (!found) return REASONS.rule;
    return { style: found.style, element, selector, rule: { ...rule, sheetId: sheetIdOf(found), path: [0], context: [] } };
  }
  const scope = element.getRootNode();
  if (!isScope(scope)) return REASONS.rule;
  const fits = rulesOf(scope).rules.filter(
    (one) => one.selectorText === rule.selectorText && same(one.context, rule.context) && one.origin.sheet === rule.sheet && one.origin.owner === rule.owner,
  );
  const found = fits.find((one) => same(one.origin.path.map(String), rule.path.map(String))) ?? fits[0];
  if (!found) return REASONS.rule;
  return {
    style: found.rule.style,
    element,
    selector,
    rule: { selectorText: rule.selectorText, sheet: rule.sheet, owner: rule.owner, sheetId: sheetIdOf(found.rule), path: [...found.origin.path], context: [...found.context] },
  };
}

/** The change a css edit makes again, or why there is none. */
function cssChange(log: EditLog, edit: SavedEdit, element: Element, made: Map<number, CSSStyleRule>): Change | string {
  if (edit.kind === "css-rule") {
    if (edit.before !== null || edit.after === null) return REASONS.invalid;
    const change = newRule({ element, selector: edit.target.selector }, edit.after);
    if (!change) return REASONS.refused;
    const rule = ruleOf(change);
    if (rule && edit.target.rule) made.set(edit.target.rule.sheetId, rule);
    return change;
  }
  const place = placeOf(edit, element, made);
  if (typeof place === "string") return place;
  if (edit.kind === "css-toggle" && edit.after === null) {
    const change = cssOff(place, edit.property, log.recorded);
    return change && change.edit.before === edit.before ? change : REASONS.changed;
  }
  if (edit.kind === "css-toggle") {
    const off = offIn(log.recorded(), place.style).find((one) => one.property === edit.property && one.text === edit.after);
    return off && edit.before === null ? cssOn(place, off, log.recorded) : REASONS.changed;
  }
  if (edit.after === null || (edit.kind !== "css-value" && edit.kind !== "css-add")) return REASONS.invalid;
  const change = cssValue(edit.kind, place, edit.property, edit.after);
  return change && change.edit.before === edit.before ? change : REASONS.changed;
}

/** The change an html edit makes again, or why there is none. */
function htmlChange(edit: SavedEdit, element: Element): Change | string {
  const target: EditTarget = { selector: edit.target.selector };
  const doc = element.ownerDocument;
  switch (edit.kind) {
    case "text": {
      const node = textAt(element, edit.property);
      if (!node) return REASONS.missing;
      if (edit.after === null) return REASONS.invalid;
      if ((node.nodeValue ?? "").trim() !== edit.before) return REASONS.changed;
      return textEdit(target, node, edit.after, edit.property) ?? REASONS.changed;
    }
    case "attr": {
      if (riskyAttribute(edit.property, edit.after)) return RISK;
      const change = attrEdit(target, element, edit.property, edit.after);
      return change && change.edit.before === edit.before ? change : REASONS.changed;
    }
    case "html": {
      if (edit.before === null || edit.after === null) return REASONS.invalid;
      if (markupOf(element) !== edit.before) return REASONS.changed;
      const nodes = parseHtml(doc, edit.after);
      if (riskyNodes(nodes)) return RISK;
      return htmlEdit(target, element, edit.before, nodes) ?? REASONS.refused;
    }
    case "hide": {
      const change = hideEdit(target, element);
      return change.edit.before === edit.before ? change : REASONS.changed;
    }
    case "delete": {
      if (edit.before === null) return REASONS.invalid;
      let node: Node | null = element;
      if (edit.property === "comment") node = Array.from(element.childNodes).find((one) => one.nodeType === 8 && markupOf(one) === edit.before) ?? null;
      else if (edit.property !== "node") node = textAt(element, edit.property);
      if (!node) return REASONS.missing;
      if (markupOf(node) !== edit.before) return REASONS.changed;
      return deleteEdit(target, node, edit.before, edit.property) ?? REASONS.refused;
    }
    case "move": {
      const { from, to } = edit;
      if (!from || !to) return REASONS.invalid;
      const home = findElement(doc, from.parent);
      const was = from.next === null ? null : findElement(doc, from.next);
      if (element.parentNode !== home || (from.next !== null && !was) || nextElementOf(element) !== was) return REASONS.changed;
      const parent = findElement(doc, to.parent);
      const next = to.next === null ? null : findElement(doc, to.next);
      if (!parent || (to.next !== null && !next)) return REASONS.missing;
      return moveEdit(target, element, { parent, next }, { from, to }) ?? REASONS.refused;
    }
    default:
      return REASONS.invalid;
  }
}

/**
 * Make edits again, in order, through the log. Each entry is read as
 * `edits()` writes it, and one that is not an edit is skipped. Returns the
 * edits made, as the log has them, those skipped with the reason, and with
 * `hold` those that wait for the user.
 */
export function replayEdits(log: EditLog, list: readonly unknown[], hold = false, doc: Document = document): Replaying {
  const applied: Edit[] = [];
  const skipped: Replaying["skipped"] = [];
  const waiting: SavedEdit[] = [];
  /** The new rules made again, by the id their stylesheet had in the edits. */
  const made = new Map<number, CSSStyleRule>();
  /** An edit that moved nodes was not made: the page is not the one the later edits were made on. */
  let broken = false;
  for (const entry of list) {
    const edit = readSavedEdit(entry);
    if (!edit) {
      skipped.push({ edit: entry, reason: REASONS.invalid });
      continue;
    }
    if (waiting.length > 0 || (hold && (edit.kind === "html" || edit.kind === "attr"))) {
      waiting.push(edit);
      continue;
    }
    if (broken) {
      skipped.push({ edit, reason: AFTER_MISSED });
      continue;
    }
    const element = findElement(doc, edit.target.selector);
    if (!element) {
      skipped.push({ edit, reason: REASONS.missing });
      if (STRUCTURE.has(edit.kind)) broken = true;
      continue;
    }
    let change: Change | string;
    try {
      change = edit.kind.startsWith("css-") ? cssChange(log, edit, element, made) : htmlChange(edit, element);
    } catch {
      change = REASONS.refused;
    }
    const recorded = typeof change === "string" ? null : log.record(change);
    if (!recorded) {
      skipped.push({ edit, reason: typeof change === "string" ? change : REASONS.refused });
      if (STRUCTURE.has(edit.kind)) broken = true;
      continue;
    }
    const source = edit.target.source;
    if (source) log.locate(recorded.id, { source });
    applied.push(source ? { ...recorded, target: { ...recorded.target, source } } : recorded);
  }
  return { applied, skipped, waiting };
}
