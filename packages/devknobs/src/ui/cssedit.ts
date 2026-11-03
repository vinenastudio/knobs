/**
 * The editing of the styles view, as the browsers' tools have it: a click on
 * a value makes it a field, the box at a line's start turns the line off and
 * on, and a line under a block adds a property to it. The view draws, and
 * hands each line and block here to be made editable; every edit goes to the
 * log. While a field is open, or a click that closed one is still under way,
 * the editor is busy: the view waits with its next read of the styles, and
 * is told once it may go ahead. To use it:
 *
 *   const editor = createCssEditor({ log, node, settled });
 *   editor.begin(); editor.editable(row, value, declaration, place, null); editor.addLine(place);
 *   if (editor.busy()) wait(); editor.destroy();
 */

import { type CssPlace, cssOff, cssOn, cssValue, type Off, offIn, valueText } from "../edit/css";
import type { Change, EditLog } from "../edit/log";
import { type Locate, recordAt } from "../edit/source";
import { elementSelector } from "../grab/selector";
import type { OwnBlock, StyleDeclaration } from "../styles/types";
import { button, el } from "./dom";

/** What the line that adds a property says. */
export const ADD = "+ add property";

/** How long a field closed by a click elsewhere keeps the view as it is, for that click to land, at most, in ms. */
export const HOLD = 1000;

/** Where a block's edits go, short of the selector, which is made only for an edit. */
export type Place = Omit<CssPlace, "selector">;

export interface CssEditorContext {
  log: EditLog;
  /** The view's node, which takes the focus back after an edit. */
  node: HTMLElement;
  /** Where an edited element is written. Defaults to grab's lookup. */
  locate?: Locate;
  /** The editor is no longer busy: a read of the styles that waited may go ahead. */
  settled(): void;
}

export interface CssEditor {
  /** Where a block's edits go, or null where it cannot be edited. */
  placeOf(block: OwnBlock, owner: Element): Place | null;
  /** The declarations of a block that edits turned off, in the order they stand. */
  offs(place: Place): Off[];
  /** The view draws its lines anew: the values shown before go. */
  begin(): void;
  /** Make a line editable: a box that turns it off and on, and its value a field on a click. */
  editable(row: HTMLElement, value: HTMLElement, declaration: StyleDeclaration, place: Place, off: Off | null): void;
  /** The line under a block that adds a property to it. */
  addLine(place: Place): HTMLElement;
  /** A field is open, or a click that closed one is still under way. */
  busy(): boolean;
  /** Close the field open, with or without its edit. Says whether one was open. */
  close(commit: boolean): boolean;
  destroy(): void;
}

/** A declaration's value that can be edited in place, in the order the view shows them. */
interface Field {
  place: Place;
  property: string;
  /** The value an edit starts from, `!important` and all. */
  text: string;
  /** The node the field stands in for while it is open. */
  value: HTMLElement;
}

function hasStyle(element: Element): element is Element & ElementCSSInlineStyle {
  return "style" in element;
}

/** An element's own `style`, where it has one. */
export function styleOf(element: Element): CSSStyleDeclaration | null {
  return hasStyle(element) ? element.style : null;
}

/** A declaration an edit turned off, as a line of the view shows it. */
export function offDeclaration(off: Off): StyleDeclaration {
  const important = /\s*!\s*important\s*$/i;
  return {
    name: off.property,
    value: off.text.replace(important, ""),
    important: important.test(off.text),
    longhands: [off.property],
    overridden: true,
    variables: [],
  };
}

/** The ids stylesheets are told apart by, by the sheet, or the rule where it has none. */
const sheetIds = new WeakMap<object, number>();
let sheetsSeen = 0;

/** A number for a rule's stylesheet, the same for every rule of it while it is up. */
function sheetIdOf(rule: CSSRule | CSSNestedDeclarations): number {
  const sheet: unknown = Reflect.get(rule, "parentStyleSheet");
  const key = typeof sheet === "object" && sheet !== null ? sheet : rule;
  let id = sheetIds.get(key);
  if (id === undefined) {
    id = ++sheetsSeen;
    sheetIds.set(key, id);
  }
  return id;
}

/** A selector that finds the element, for an edit's target. */
export function selectorOf(element: Element): string {
  try {
    return elementSelector(element).selector;
  } catch {
    return element.tagName.toLowerCase();
  }
}

/** A one-line field of the editor, as wide as what it holds. */
export function editField(value: string, label: string): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "css-edit inline-field";
  input.value = value;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", label);
  const fit = (): void => {
    input.size = Math.max(input.value.length + 1, 3);
  };
  fit();
  input.addEventListener("input", fit);
  return input;
}

/** A click on a custom property's name in a value: that does its own. */
function inButton(target: EventTarget | null): boolean {
  const closest: unknown = target ? Reflect.get(target, "closest") : null;
  return typeof closest === "function" && Reflect.apply(closest, target, ["button"]) !== null;
}

export function createCssEditor(context: CssEditorContext): CssEditor {
  const { log, node } = context;
  /** The values shown, in order, for Tab to go along. */
  let fields: Field[] = [];
  /** The field open: its way to close. */
  let open: { close(commit: boolean): void } | null = null;
  /** A field closed by a click elsewhere: the view stays as it is until that click is done. */
  let holding = false;
  let holdTimer = 0;

  function release(): void {
    if (!holding) return;
    holding = false;
    clearTimeout(holdTimer);
    window.removeEventListener("pointerup", onUp, true);
    if (!open) context.settled();
  }

  /** The click goes on after the pointer is up: the view waits for it to land. */
  function onUp(): void {
    window.removeEventListener("pointerup", onUp, true);
    window.setTimeout(release, 0);
  }

  /** Keep the view as it is while the click that closed a field lands, on what it was pressed on. */
  function hold(): void {
    holding = true;
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(release, HOLD);
    window.addEventListener("pointerup", onUp, true);
  }

  function closed(): void {
    open = null;
    if (!holding) context.settled();
  }

  /** Record a change, and say whether the page took it. None to make is no failure. */
  function record(change: Change | null, place: Place): boolean {
    return change === null || recordAt(log, change, place.element, context.locate) !== null;
  }

  function full(place: Place): CssPlace {
    return { ...place, selector: selectorOf(place.element) };
  }

  function fieldAt(style: CSSStyleDeclaration, property: string): Field | undefined {
    return fields.find((one) => one.place.style === style && one.property === property);
  }

  /**
   * Edit a value in place. Enter puts it on the page, escape leaves it as it
   * was, and Tab puts it on and goes on to the next value, with shift to the
   * one before. A value the page does not take keeps the field open, marked,
   * unless the focus went elsewhere, which lets it go.
   */
  function openValue(field: Field): void {
    open?.close(true);
    if (!field.value.isConnected) return;
    const input = editField(field.text, `value of ${field.property}`);
    field.value.replaceWith(input);
    let shown = true;
    const close = (commit: boolean, next?: Field, away = false): void => {
      if (!shown) return;
      shown = false;
      open = null;
      // A click elsewhere closed it: the view stays as it is until that click lands.
      if (away) hold();
      const text = input.value;
      const same = text.trim() === field.text;
      // An empty value is no css: the page keeps the one it has.
      const took = !commit || same || (text.trim() !== "" && record(cssValue("css-value", full(field.place), field.property, text), field.place));
      if (!took && !away) {
        shown = true;
        open = self;
        input.classList.add("bad");
        input.setAttribute("aria-invalid", "true");
        input.focus({ preventScroll: true });
        return;
      }
      if (input.isConnected) {
        input.replaceWith(field.value);
        if (took && commit && !same) field.value.textContent = text.trim();
      }
      closed();
      const then = next ? fieldAt(next.place.style, next.property) : undefined;
      if (then) openValue(then);
      // Keys such as undo go on working in the view, unless the focus went elsewhere.
      else if (!away) node.focus({ preventScroll: true });
    };
    const self = { close: (commit: boolean) => close(commit) };
    open = self;
    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        close(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        close(true, fields[fields.indexOf(field) + (event.shiftKey ? -1 : 1)]);
      }
    });
    input.addEventListener("blur", () => close(true, undefined, true));
    input.focus({ preventScroll: true });
    input.select();
  }

  /** The box that turns a declaration off and on again. */
  function toggleBox(place: Place, property: string, off: Off | null): HTMLInputElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "css-toggle";
    box.checked = off === null;
    box.setAttribute("aria-label", `${property} on`);
    box.addEventListener("change", () => {
      const change = box.checked && off ? cssOn(full(place), off, log.recorded) : cssOff(full(place), property, log.recorded);
      if (!record(change, place)) box.checked = !box.checked;
      // The line was built again, and the box with it.
      if (!box.isConnected) node.focus({ preventScroll: true });
    });
    return box;
  }

  function editable(row: HTMLElement, value: HTMLElement, declaration: StyleDeclaration, place: Place, off: Off | null): void {
    row.classList.add("can-edit");
    row.prepend(toggleBox(place, declaration.name, off));
    if (off) {
      row.classList.add("off");
      return;
    }
    const field: Field = { place, property: declaration.name, text: valueText(declaration), value };
    fields.push(field);
    value.classList.add("css-editable");
    value.tabIndex = 0;
    value.setAttribute("role", "button");
    value.setAttribute("aria-label", `edit ${declaration.name}: ${field.text}`);
    value.addEventListener("click", (event: MouseEvent) => {
      if (!inButton(event.target)) openValue(field);
    });
    value.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.target !== value) return;
      event.preventDefault();
      openValue(field);
    });
  }

  function addLine(place: Place): HTMLElement {
    const control = button("css-add", ADD);
    control.addEventListener("click", () => openAdd(control, place));
    return control;
  }

  /** A field for the name, then one for the value. Enter or Tab on the value adds it. */
  function openAdd(control: HTMLElement, place: Place): void {
    open?.close(true);
    if (!control.isConnected) return;
    const row = el("div", "css-decl css-adding");
    const name = editField("", "property name");
    const value = editField("", "property value");
    row.append(name, el("span", "css-punct", ": "), value, el("span", "css-punct", ";"));
    control.replaceWith(row);
    let shown = true;
    const close = (commit: boolean, away = false): void => {
      if (!shown) return;
      shown = false;
      open = null;
      if (away) hold();
      const property = name.value.trim();
      const tried = commit && property !== "" && value.value.trim() !== "";
      if (tried && !record(cssValue("css-add", full(place), property, value.value), place) && !away) {
        shown = true;
        open = self;
        value.classList.add("bad");
        value.setAttribute("aria-invalid", "true");
        value.focus({ preventScroll: true });
        return;
      }
      if (row.isConnected) row.replaceWith(control);
      closed();
      if (!away) node.focus({ preventScroll: true });
    };
    const self = { close: (commit: boolean) => close(commit) };
    open = self;
    name.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Enter" && event.key !== ":" && (event.key !== "Tab" || event.shiftKey)) return;
      event.preventDefault();
      if (name.value.trim() !== "") value.focus({ preventScroll: true });
    });
    value.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      } else if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        close(true);
      }
    });
    row.addEventListener("focusout", (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next !== null && row.contains(next as Node)) return;
      close(true, true);
    });
    name.focus({ preventScroll: true });
  }

  return {
    placeOf(block, owner) {
      if (block.kind === "inline") {
        const style = styleOf(block.element);
        return style ? { style, element: block.element } : null;
      }
      const { selectorText, origin } = block;
      return {
        style: block.rule.style,
        element: owner,
        rule: {
          selectorText,
          sheet: origin.sheet,
          owner: origin.owner,
          sheetId: sheetIdOf(block.rule),
          path: [...origin.path],
          context: [...block.context],
        },
      };
    },
    offs: (place) => offIn(log.recorded(), place.style),
    begin() {
      fields = [];
    },
    editable,
    addLine,
    busy: () => open !== null || holding,
    close(commit) {
      if (!open) return false;
      open.close(commit);
      return true;
    },
    destroy() {
      open?.close(false);
      holding = false;
      clearTimeout(holdTimer);
      window.removeEventListener("pointerup", onUp, true);
    },
  };
}
