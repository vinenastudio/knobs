/**
 * Edits of css declarations, in a rule or in an element's `style`: a value
 * changed, a property added, a declaration turned off or on. A value goes in
 * through `setProperty`, as the page's own script would set it, so the
 * browser keeps every other declaration as it was, a longhand inside a
 * shorthand included. Only a declaration turned on again is written back
 * into the block's text, so it goes back where it stood. To use it:
 *
 *   const change = cssValue("css-value", place, "padding", "10px 18px");
 *   if (change) edits.record(change);
 */

import { parseDeclarations, type Written } from "../styles/declarations";
import type { Change, EditKind, EditTarget, Recorded } from "./log";

/** What a css edit's text is written in, and where that is. */
export interface CssPlace {
  /** The rule's `style`, or the element's own. */
  style: CSSStyleDeclaration;
  /** The element the edit is for: the one whose `style` it is, or that the rule styles. */
  element: Element;
  /** The rule, where the edit is in one. */
  rule?: EditTarget["rule"];
  /** A css selector that finds the element. */
  selector: string;
}

/** The css edits, by their kind. */
export type CssKind = Extract<EditKind, "css-value" | "css-toggle" | "css-add">;

/** The edits in force, read as a change is made and as it is undone, for where the lines that are off stand. */
export type ReadRecorded = () => readonly Pick<Recorded, "edit" | "change">[];

const IMPORTANT = /\s*!\s*important\s*$/i;

/** A declaration's value as an edit keeps it: `!important` at its end where it has it. */
export function valueText(written: Pick<Written, "value" | "important">): string {
  return written.important ? `${written.value} !important` : written.value;
}

function written(name: string, text: string): Written {
  const important = IMPORTANT.test(text);
  return { name, value: text.replace(IMPORTANT, "").trim(), important };
}

/** The property's declaration in a block's text, and its place there, or null where the text has none. */
export function declarationIn(style: Pick<CSSStyleDeclaration, "cssText">, property: string): { text: string; index: number } | null {
  const list = parseDeclarations(style.cssText);
  const index = list.findIndex((one) => one.name === property);
  const found = list[index];
  return found ? { text: valueText(found), index } : null;
}

/** What the block sets the property to, as an edit keeps it, a longhand a shorthand sets included. Null where it is not set. */
function valueIn(style: CSSStyleDeclaration, property: string): string | null {
  const found = declarationIn(style, property);
  if (found) return found.text;
  const value = style.getPropertyValue(property);
  if (value === "") return null;
  return style.getPropertyPriority(property) === "important" ? `${value} !important` : value;
}

/** The browser's word on a value, where it can give one. */
function supports(element: Element, property: string, value: string): boolean {
  try {
    const css = element.ownerDocument?.defaultView?.CSS ?? globalThis.CSS;
    return css ? css.supports(property, value) : true;
  } catch {
    return true;
  }
}

/** Set a property to `text`, or with null take it out. False where the page did not take the value. */
export function setText(style: CSSStyleDeclaration, element: Element, property: string, text: string | null): boolean {
  if (text === null) {
    style.removeProperty(property);
    return true;
  }
  const { value, important } = written(property, text);
  if (value === "" || !supports(element, property, value)) return false;
  style.setProperty(property, value, important ? "important" : "");
  return style.getPropertyValue(property) !== "";
}

/**
 * Put a declaration back into a block's text at `at`, among those it has
 * now. Where the text holds a value the browser could not write back, as
 * the longhands of `margin: var(--m)` are, writing it would lose that, so the
 * property is set the plain way, at the end.
 */
function insertAt(style: CSSStyleDeclaration, element: Element, property: string, text: string, at: number): boolean {
  const list = parseDeclarations(style.cssText);
  if (list.some((one) => one.value === "") || list.some((one) => one.name === property)) {
    return setText(style, element, property, text);
  }
  const one = written(property, text);
  if (one.value === "" || !supports(element, property, one.value)) return false;
  list.splice(Math.max(0, Math.min(at, list.length)), 0, one);
  style.cssText = list.map((each) => `${each.name}: ${valueText(each)};`).join(" ");
  return style.getPropertyValue(property) !== "";
}

/** The ids stylesheets are told apart by, by the sheet, or the rule where it has none. */
const sheetIds = new WeakMap<object, number>();
let sheetsSeen = 0;

/** A number for a rule's stylesheet, the same for every rule of it while it is up. */
export function sheetIdOf(rule: CSSRule | CSSNestedDeclarations): number {
  const sheet: unknown = Reflect.get(rule, "parentStyleSheet");
  const key = typeof sheet === "object" && sheet !== null ? sheet : rule;
  let id = sheetIds.get(key);
  if (id === undefined) {
    id = ++sheetsSeen;
    sheetIds.set(key, id);
  }
  return id;
}

/** The block each css change is in, and for a toggle where its declaration stands among all of the block's, off ones too. */
const places = new WeakMap<Change, { style: CSSStyleDeclaration; index: number }>();

function nameOf(property: string): string {
  return property.startsWith("--") ? property.trim() : property.trim().toLowerCase();
}

function targetOf(place: CssPlace): EditTarget {
  const target: EditTarget = { selector: place.selector };
  if (place.rule) target.rule = { ...place.rule, path: [...place.rule.path], context: [...place.rule.context] };
  return target;
}

function viewOf(place: CssPlace): Window | null {
  try {
    return place.element.ownerDocument?.defaultView ?? null;
  } catch {
    return null;
  }
}

/**
 * A value changed, or a property added: `after` set on the block. Null
 * where nothing would change. The value before is read from the block as it
 * is now, and undo sets it back, or takes the property out where it was not set.
 */
export function cssValue(kind: "css-value" | "css-add", place: CssPlace, property: string, after: string): Change | null {
  const name = nameOf(property);
  const next = after.trim();
  if (name === "" || next === "") return null;
  const { style, element } = place;
  const before = valueIn(style, name);
  if (before === next) return null;
  const change: Change = {
    edit: { kind, target: targetOf(place), property: name, before, after: next },
    apply: () => setText(style, element, name, next),
    revert: () => void setText(style, element, name, before),
    view: viewOf(place),
  };
  places.set(change, { style, index: -1 });
  return change;
}

/** A declaration an edit turned off, which the view still shows, struck through. */
export interface Off {
  property: string;
  /** Its value as it was when turned off, `!important` and all. */
  text: string;
  /** Where it stands among all of its block's declarations, those off too. */
  index: number;
}

/** The declarations of a block that the edits in force left off, in the order they stand. */
export function offIn(recorded: readonly Pick<Recorded, "edit" | "change">[], style: CSSStyleDeclaration): Off[] {
  const last = new Map<string, Off | null>();
  for (const { edit, change } of recorded) {
    const place = places.get(change);
    if (place?.style !== style) continue;
    const off = edit.kind === "css-toggle" && edit.after === null && edit.before !== null && place.index >= 0;
    last.set(edit.property, off && edit.before !== null ? { property: edit.property, text: edit.before, index: place.index } : null);
  }
  return [...last.values()].filter((one) => one !== null).sort((a, b) => a.index - b.index);
}

/** The lines of the block off now, other than `property`'s. */
function othersOff(recorded: ReadRecorded, style: CSSStyleDeclaration, property: string): Off[] {
  return offIn(recorded(), style).filter((one) => one.property !== property);
}

/** Put a declaration that stands at `index` among all of the block's back, among those it has now. */
function putBack(recorded: ReadRecorded, place: CssPlace, property: string, text: string, index: number): boolean {
  const before = othersOff(recorded, place.style, property).filter((one) => one.index < index).length;
  return insertAt(place.style, place.element, property, text, index - before);
}

/** A declaration turned off. Null where the block does not set it. */
export function cssOff(place: CssPlace, property: string, recorded: ReadRecorded): Change | null {
  const name = nameOf(property);
  const { style, element } = place;
  const before = valueIn(style, name);
  if (before === null) return null;
  const found = declarationIn(style, name);
  let index = -1;
  if (found) {
    // Where it stands among all of the block's, counting those off before it.
    index = found.index;
    for (const one of othersOff(recorded, style, name)) if (one.index <= index) index++;
  }
  const change: Change = {
    edit: { kind: "css-toggle", target: targetOf(place), property: name, before, after: null },
    apply: () => setText(style, element, name, null),
    revert: () => {
      if (index < 0) setText(style, element, name, before);
      else putBack(recorded, place, name, before, index);
    },
    view: viewOf(place),
  };
  places.set(change, { style, index });
  return change;
}

/** A declaration an edit turned off, turned on again where it stood. */
export function cssOn(place: CssPlace, off: Off, recorded: ReadRecorded): Change {
  const { style, element } = place;
  const change: Change = {
    edit: { kind: "css-toggle", target: targetOf(place), property: off.property, before: null, after: off.text },
    apply: () => putBack(recorded, place, off.property, off.text, off.index),
    revert: () => void setText(style, element, off.property, null),
    view: viewOf(place),
  };
  places.set(change, { style, index: off.index });
  return change;
}
