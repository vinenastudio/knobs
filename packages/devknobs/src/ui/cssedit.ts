/**
 * The editing of the styles view, as the browsers' tools have it: a click on
 * a value makes it a field, the box at a line's start turns the line off and
 * on, and a line under a block adds a property to it. The view draws, and
 * hands each line and block here to be made editable; every edit goes to the
 * log. While a field is open, or a click that closed one is still under way,
 * the editor is busy: the view waits with its next read of the styles, and
 * is told once it may go ahead. A line under the element's rules adds a new
 * rule, its selector typed first, and the line that adds a property to it
 * opens once it is drawn. To use it:
 *
 *   const editor = createCssEditor({ log, node, settled });
 *   editor.begin(); editor.editable(row, value, declaration, place, null); editor.addLine(place);
 *   editor.newRuleLine(element, ".cta");
 *   if (editor.busy()) wait(); editor.destroy();
 */

import { type CssPlace, cssOff, cssOn, cssValue, type Off, offIn, sheetIdOf, valueText } from "../edit/css";
import type { Change, EditLog } from "../edit/log";
import { newRule, ruleOf } from "../edit/rule";
import { type Locate, recordAt } from "../edit/source";
import { elementSelector } from "../grab/selector";
import type { OwnBlock, StyleDeclaration } from "../styles/types";
import { type Autocomplete, autocomplete, browserCss, nameSuggestions, valueSuggestions } from "./cssauto";
import { button, el } from "./dom";

/** What the line that adds a property says. */
export const ADD = "+ add property";

/** What the line that adds a rule says. */
export const NEW_RULE = "+ new rule";

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
  /** The line that adds a new rule for an element, its selector field filled with `selector`. */
  newRuleLine(element: Element, selector: string): HTMLElement;
  /** A field is open, or a click that closed one is still under way. */
  busy(): boolean;
  /** Close the field open, with or without its edit. Says whether one was open. */
  close(commit: boolean): boolean;
  /** Escape closes the open field's suggestions first. Says whether a list of them showed. */
  dismiss(): boolean;
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

/** What a declaration's checkbox is called: what a press does, `turn off padding` while it is on. */
export function toggleLabel(property: string, on: boolean): string {
  return `turn ${on ? "off" : "on"} ${property}`;
}

/** A selector that finds the element, for an edit's target. */
export function selectorOf(element: Element): string {
  try {
    return elementSelector(element).selector;
  } catch {
    return element.tagName.toLowerCase();
  }
}

/**
 * Fit a field to what it holds: as wide as its longest line, but never wider
 * than the line it stands in, and as tall as its text wraps to, so a long
 * value goes on under itself and nothing scrolls sideways.
 */
export function fitField(area: HTMLTextAreaElement): void {
  const longest = Math.max(...area.value.split("\n").map((line) => line.length));
  area.style.width = `min(${Math.max(longest + 1, 3)}ch, 100%)`;
  area.style.height = "auto";
  // Only a field on the page has a height to take.
  const tall = Number(area.scrollHeight) || 0;
  if (tall > 0) area.style.height = `${tall}px`;
}

/** A one-line field of the editor, as wide as what it holds, that wraps where it is wider than its line. */
export function editField(value: string, label: string): HTMLTextAreaElement {
  const input = document.createElement("textarea");
  input.className = "css-edit inline-field";
  input.value = value;
  input.rows = 1;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => {
    // One line: a line break pasted in goes, as a one-line field drops it.
    if (/[\r\n]/.test(input.value)) {
      const caret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/[\r\n]/g, "").length;
      input.value = input.value.replace(/[\r\n]/g, "");
      input.setSelectionRange(caret, caret);
    }
    fitField(input);
  });
  // Its height is known once it is on the page, as it takes the focus.
  input.addEventListener("focus", () => fitField(input));
  fitField(input);
  return input;
}

/** One of the element's classes in a selector, as its window's css writes it. */
function escaped(element: Element, name: string): string {
  try {
    const css = element.ownerDocument?.defaultView?.CSS ?? globalThis.CSS;
    if (css && typeof css.escape === "function") return css.escape(name);
  } catch {
    // A window that went: the plain name stands in.
  }
  return name;
}

/**
 * What a new rule's selector starts as: the element's classes, else a short
 * selector that finds it, then the states forced on it, as `.cta:hover`.
 */
export function newRuleSelector(element: Element, states: readonly string[] = []): string {
  const classes = (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  let base = classes.map((name) => `.${escaped(element, name)}`).join("");
  // Grab's selector goes through shadow roots and frames: the rule's own tree takes its last step alone.
  if (base === "") base = selectorOf(element).split(/>>>|>>iframe>>/).pop()?.trim() || element.tagName.toLowerCase();
  return `${base}${states.map((state) => `:${state}`).join("")}`;
}

/** Whether a node is on the page and shown, nothing it is in hidden. */
function shows(node: HTMLElement): boolean {
  if (!node.isConnected) return false;
  for (let at: HTMLElement | null = node; at; at = at.parentElement) if (at.hidden) return false;
  return true;
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
  /** The suggestions of the field open. */
  let lists: Autocomplete[] = [];
  /** A field closed by a click elsewhere: the view stays as it is until that click is done. */
  let holding = false;
  let holdTimer = 0;
  /** The block of a rule just added: its line that adds a property opens once drawn. */
  let opening: CSSStyleDeclaration | null = null;

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
    const world = browserCss(field.place.element);
    const auto = autocomplete(input, () => valueSuggestions(field.property, world), "value");
    lists = [auto];
    field.value.replaceWith(input);
    let shown = true;
    const close = (commit: boolean, next?: Field, away = false): void => {
      if (!shown) return;
      shown = false;
      auto.close();
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
      if (event.isComposing || auto.key(event)) return;
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
    const name = (): void => box.setAttribute("aria-label", toggleLabel(property, box.checked));
    name();
    box.addEventListener("change", () => {
      const change = box.checked && off ? cssOn(full(place), off, log.recorded) : cssOff(full(place), property, log.recorded);
      if (!record(change, place)) box.checked = !box.checked;
      name();
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
    if (opening === place.style) {
      opening = null;
      // Once the view has put it in its place, and only where it shows: a filter may hide it.
      queueMicrotask(() => {
        if (shows(control)) openAdd(control, place);
      });
    }
    return control;
  }

  function newRuleLine(element: Element, selector: string): HTMLElement {
    const control = button("css-new-rule", NEW_RULE);
    control.addEventListener("click", () => openNewRule(control, element, selector));
    return control;
  }

  /**
   * A field for the new rule's selector. Enter adds the rule, escape leaves
   * none. A selector the browser does not take keeps the field open, marked.
   */
  function openNewRule(control: HTMLElement, element: Element, selector: string): void {
    open?.close(true);
    if (!control.isConnected) return;
    const row = el("div", "css-decl css-adding css-rule-adding");
    const field = editField(selector, "selector of the new rule");
    row.append(field, el("span", "css-punct", " { }"));
    control.replaceWith(row);
    let shown = true;
    const close = (commit: boolean, away = false): void => {
      if (!shown) return;
      shown = false;
      open = null;
      if (away) hold();
      const text = field.value.trim();
      // Left as it opened, a click elsewhere adds no rule.
      const tried = commit && text !== "" && !(away && text === selector);
      const added = tried && addRule(element, text, !away);
      if (tried && !added && !away) {
        shown = true;
        open = self;
        field.classList.add("bad");
        field.setAttribute("aria-invalid", "true");
        field.focus({ preventScroll: true });
        return;
      }
      if (row.isConnected) row.replaceWith(control);
      closed();
      // A rule added opens its line for a property, which takes the focus.
      if (!away && !added) node.focus({ preventScroll: true });
    };
    const self = { close: (commit: boolean) => close(commit) };
    open = self;
    field.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        close(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    });
    field.addEventListener("blur", () => close(true, true));
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }

  /** Add a rule for the element, and say whether the page took its selector. With `then`, its line for a property opens. */
  function addRule(element: Element, text: string, then: boolean): boolean {
    const change = newRule({ element, selector: selectorOf(element) }, text);
    if (!change) return false;
    // Set before the edit, which draws the view again at once.
    opening = then ? (ruleOf(change)?.style ?? null) : null;
    const took = recordAt(log, change, element, context.locate) !== null;
    if (!took) opening = null;
    return took;
  }

  /** A field for the name, then one for the value, each with its suggestions. Enter or Tab on the value adds it. */
  function openAdd(control: HTMLElement, place: Place): void {
    open?.close(true);
    if (!control.isConnected) return;
    const row = el("div", "css-decl css-adding");
    const name = editField("", "property name");
    const value = editField("", "property value");
    const world = browserCss(place.element);
    const names = autocomplete(name, () => nameSuggestions(world), "name");
    const values = autocomplete(value, () => valueSuggestions(name.value, world), "value");
    lists = [names, values];
    row.append(name, el("span", "css-punct", ": "), value, el("span", "css-punct", ";"));
    control.replaceWith(row);
    let shown = true;
    const close = (commit: boolean, away = false): void => {
      if (!shown) return;
      shown = false;
      names.close();
      values.close();
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
      if (event.isComposing || names.key(event)) return;
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
      if (event.isComposing || values.key(event)) return;
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
    newRuleLine,
    busy: () => open !== null || holding,
    dismiss: () => open !== null && lists.some((list) => list.dismiss()),
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
