/**
 * The editing of the DOM tree, as the browsers' tools have it: a double-click
 * on a line's text or on an attribute makes it a field, and the selected line
 * takes keys and has its actions in a bar under the tree. Every edit goes to
 * the log, as the styles view's do. The keys are plain, and never act while a
 * field has the focus:
 *
 *   Enter    edit the text           a    add an attribute
 *   F2       edit as html            h    hide, or show again
 *   Delete   delete the node         ⇧↑   move up among its siblings
 *                                    ⇧↓   move down among its siblings
 *
 * An element's line is also dragged by its handle, before or after another
 * element, or into one, through `move`.
 * A one-line field puts its edit on with Enter and leaves with esc. The html
 * field, and the field of a text or a value with line breaks in it, takes
 * line breaks with Enter, and puts its edit on with ⇧↩ (Shift Enter
 * elsewhere), its apply button, or as the focus leaves it; ⌘↩ and Ctrl Enter
 * put it on too. The html field is the editor of htmledit.ts. A field closed as it was opened makes no edit. An element
 * that holds devknobs' own nodes, as the body holds the panel, is not
 * replaced, hidden or deleted. To use it, as the tree does:
 *
 *   const editor = createDomEditor(hooks, { log });
 *   editor.dblclick(row, target); editor.key(event, row); editor.selected(row);
 */

import {
  attrEdit,
  attributeName,
  canHold,
  deleteEdit,
  HIDE_ATTRIBUTE,
  hideEdit,
  htmlEdit,
  movable,
  moveEdit,
  nextElementOf,
  parseHtml,
  previousElementOf,
  textEdit,
} from "../edit/html";
import type { Change, EditLog } from "../edit/log";
import { type Locate, locateSource, recordAt } from "../edit/source";
import { isMac } from "../engine/ua";
import { editField, fitField, selectorOf } from "./cssedit";
import { button, el } from "./dom";
import { type Entry, isElement, markupOf, parentOf, type Row } from "./domtree";
import { htmlEditor } from "./htmledit";
import { comboLabel, letterMatches, typesInField, withShift } from "./keys";
import type { HtmlSize } from "./prefs";
import { ownSelector } from "../mark";

/** What a key on the selected line does. */
export type TreeEditAction = "text" | "attr" | "html" | "hide" | "delete" | "up" | "down";

/** What the bar's buttons say. */
export const ACTIONS: Record<TreeEditAction, string> = {
  text: "edit text",
  attr: "+ attribute",
  html: "edit as html",
  hide: "hide",
  delete: "delete",
  up: "move up",
  down: "move down",
};

/** What the tree lends its editor. */
export interface TreeHooks {
  /** The tree's list, which takes the focus back after an edit. */
  list: HTMLElement;
  /** The text of a line as built, where its fields go. Null where the line does not show. */
  code(row: Row): HTMLElement | null;
  /** What a node holds, as lines: the line after a deleted node is selected. */
  children(node: Node): Entry[];
  /** Select a node's line, and tell the view. */
  select(node: Node): void;
  /** The field closed: lines that waited are built now. */
  settled(): void;
}

export interface DomEditorOptions {
  log: EditLog;
  /** Where an edited element is written. Defaults to grab's lookup. */
  locate?: Locate;
  /** Parses html in a document. Defaults to the page's own parser. */
  parse?: typeof parseHtml;
  /** How tall the html editor starts, and where the size the user gives it is kept. */
  htmlSize?: { get(): HtmlSize; set(size: HtmlSize): void };
}

export interface DomEditor {
  /** The bar of actions for the selected line. */
  bar: HTMLElement;
  /** A double-click on a line: its text or the attribute under the pointer becomes a field. */
  dblclick(row: Row, target: EventTarget | null): boolean;
  /** A key on the selected line. Says whether it acted. */
  key(event: KeyboardEvent, row: Row | null): boolean;
  /** The selection moved, or its node changed: the bar follows it. */
  selected(row: Row | null): void;
  /** A field is open. */
  busy(): boolean;
  /** Close the field open, with or without its edit; one whose edit is refused closes without it. Says whether one was open. */
  close(commit: boolean): boolean;
  /** Move an element into `parent`, before `next`, or at its end with null, and select it. Says whether it moved. */
  move(element: Element, parent: Element, next: Element | null): boolean;
  destroy(): void;
}

/** The key that puts the html field's edit on, as its hint says it: `⇧↩` on a Mac, `Shift Enter` elsewhere. */
export function applyHint(mac: boolean): string {
  return comboLabel(withShift("enter"), mac);
}

/** Whether a key puts the html field's edit on: shift and Enter, or ⌘↩ and Ctrl Enter as well. Enter alone breaks the line. */
export function commitsHtml(event: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey">): boolean {
  return event.key === "Enter" && !event.altKey && (event.shiftKey || event.metaKey || event.ctrlKey);
}

/** What a key on the selected line does: no modifier but shift, and never in a field. Null for any other key. */
export function treeEditKey(event: KeyboardEvent): TreeEditAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || typesInField(event)) return null;
  if (event.shiftKey && event.key === "ArrowUp") return "up";
  if (event.shiftKey && event.key === "ArrowDown") return "down";
  switch (event.key) {
    case "Enter":
      return "text";
    case "F2":
      return "html";
    case "Delete":
    case "Backspace":
      return "delete";
  }
  if (event.shiftKey) return null;
  if (letterMatches(event, "a")) return "attr";
  if (letterMatches(event, "h")) return "hide";
  return null;
}

/** Whether a node is in an element, and not straight in a document or a shadow root. */
function inElement(node: Node): boolean {
  const parent = node.parentNode;
  return parent !== null && isElement(parent);
}

/** The text a line edits: a text line's own, in an element, or the one text that stands in an element's line. */
export function textOf(row: Row): Node | null {
  if (row.kind === "text") return inElement(row.node) ? row.node : null;
  if (row.kind !== "open" || !isElement(row.node)) return null;
  const nodes = row.node.childNodes;
  const only = nodes[0];
  return nodes.length === 1 && only?.nodeType === 3 && (only.nodeValue ?? "").trim() !== "" ? only : null;
}

/** Which of its element's texts a text is: `text`, then `text 2` and on, the blank ones not counted. */
export function textProperty(node: Node): string {
  const parent = node.parentNode;
  if (!parent) return "text";
  const texts = Array.from(parent.childNodes).filter((one) => one.nodeType === 3 && (one.nodeValue ?? "").trim() !== "");
  const at = texts.findIndex((one) => one === node) + 1;
  return at > 1 ? `text ${at}` : "text";
}

/**
 * The attributes `text` writes, `name="value"` as in a tag, read by the
 * page's own parser, in an svg tag for an svg element's, so `viewBox` keeps
 * its case. Null where it writes none.
 */
export function parseAttributes(doc: Document, text: string, svg = false, parse = parseHtml): [string, string][] | null {
  const tag = svg ? "svg" : "div";
  const holder = parse(doc, `<${tag} ${text}></${tag}>`).find(isElement);
  if (!holder) return null;
  const found = Array.from(holder.attributes).map((attr): [string, string] => [attr.name, attr.value]);
  return found.length > 0 ? found : null;
}

/** The document's head or body, which the page's frame stands on. */
function isFrame(element: Element): boolean {
  return element.namespaceURI === "http://www.w3.org/1999/xhtml" && (element.localName === "head" || element.localName === "body");
}

/** Whether an element holds devknobs' own nodes, as the body holds the panel and the head its styles. */
export function holdsOwn(element: Element): boolean {
  return element.querySelector(ownSelector()) !== null;
}

/** The actions a line can take. */
export function actionsFor(row: Row | null): TreeEditAction[] {
  if (!row || row.pseudo !== null) return [];
  const node = row.node;
  const out: TreeEditAction[] = [];
  if (textOf(row)) out.push("text");
  if (row.kind === "open" && isElement(node)) {
    out.push("attr");
    // The root element goes only with its document; the head and body, and one with the panel in it, stay.
    if (node.parentNode?.nodeType !== 9 && !isFrame(node) && !holdsOwn(node)) out.push("html", "hide", "delete");
    if (movable(node) && previousElementOf(node)) out.push("up");
    if (movable(node) && nextElementOf(node)) out.push("down");
  } else if ((row.kind === "text" || row.kind === "comment") && inElement(node)) out.push("delete");
  return out;
}

/** An attribute's value as a tag writes it in quotes: `&` and `"` as references, which the parser reads back. */
export function quotedValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function hasTag(node: EventTarget | null): node is HTMLElement {
  return node !== null && typeof Reflect.get(node, "getAttribute") === "function";
}

/** The piece of a line a double-click is on, from where it landed up to the line's text: an attribute's, or the text. */
function pieceAt(at: EventTarget | null, code: HTMLElement | null): HTMLElement | null {
  for (let up = hasTag(at) ? at : null; up && up !== code; up = up.parentNode && hasTag(up.parentNode) ? up.parentNode : null) {
    if (up.getAttribute("data-attr") !== null || up.classList.contains("tok-text")) return up;
  }
  return null;
}

/** A one-line field of the tree. */
function field(value: string, label: string): HTMLTextAreaElement {
  const input = editField(value, label);
  input.classList.add("dom-edit");
  return input;
}

/** How a field opens: the pieces of a line it stands in for, and what it does. */
interface FieldOptions {
  pieces: Node[];
  input: HTMLTextAreaElement;
  /** What stands in the line for the pieces, the field in it. Defaults to the field. */
  frame?: HTMLElement;
  /** Make the edits, and say whether they took: where they did not, the field stays open, marked. */
  commit(text: string): boolean;
  /** Line breaks go in, and shift and Enter puts the edit on. */
  multiline?: boolean;
  /** A button after the field that puts its edit on. */
  apply?: HTMLButtonElement;
  /** The field closed, its pieces back. */
  closed?(): void;
}

/** A field that keeps line breaks, with its apply button, as tall as what it holds up to a height that scrolls. */
function boxField(value: string, label: string): Pick<FieldOptions, "input" | "multiline" | "apply"> {
  const area = document.createElement("textarea");
  area.className = "css-edit inline-field dom-edit";
  area.value = value;
  area.rows = 2;
  area.spellcheck = false;
  const fit = (): void => fitField(area);
  fit();
  area.addEventListener("input", fit);
  area.addEventListener("focus", fit);
  const hint = applyHint(isMac());
  area.setAttribute("aria-label", `${label}, ${hint} to apply, esc to leave`);
  return { input: area, multiline: true, apply: button("chip dom-apply", `apply ${hint}`) };
}

/** The field for a value: one line, or a box where the value has line breaks, so an edit keeps them. */
function valueField(value: string, label: string): Pick<FieldOptions, "input" | "multiline" | "apply"> {
  return value.includes("\n") ? boxField(value, label) : { input: field(value, label) };
}

export function createDomEditor(hooks: TreeHooks, options: DomEditorOptions): DomEditor {
  const { log } = options;
  const locate = options.locate ?? locateSource;
  const parse = options.parse ?? parseHtml;
  const bar = el("div", "dom-acts");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "edit the selected node");
  bar.hidden = true;
  /** The field open: its way to close. */
  let open: { close(commit: boolean, away?: boolean): void } | null = null;
  let current: Row | null = null;

  function record(change: Change | null, element: Element): boolean {
    if (change === null) return true;
    // Asked before the edit, while the element is still on the page.
    void locate(element);
    return recordAt(log, change, element, locate) !== null;
  }

  function target(element: Element): { selector: string } {
    return { selector: selectorOf(element) };
  }

  function refocus(): void {
    hooks.list.focus({ preventScroll: true });
  }

  /** Show a field in place of pieces of a line, and close it with Enter, esc, or as the focus leaves. */
  function openField({ pieces, input, frame = input, commit, multiline = false, apply: applies, closed }: FieldOptions): void {
    const first = pieces[0];
    const parent = first?.parentNode;
    if (!first || !parent) return;
    parent.insertBefore(frame, first);
    if (applies) parent.insertBefore(applies, first);
    for (const piece of pieces) parent.removeChild(piece);
    // As the field holds it: a field drops what it cannot hold, so an edit is told from this, not the page's text.
    const opened = input.value;
    let shown = true;
    const close = (apply: boolean, away = false): void => {
      if (!shown) return;
      shown = false;
      open = null;
      if (apply && input.value !== opened && !commit(input.value) && !away) {
        shown = true;
        open = self;
        input.classList.add("bad");
        input.setAttribute("aria-invalid", "true");
        input.focus({ preventScroll: true });
        return;
      }
      if (frame.parentNode) {
        for (const piece of pieces) frame.parentNode.insertBefore(piece, frame);
        frame.remove();
      }
      applies?.remove();
      closed?.();
      hooks.settled();
      if (!away) refocus();
    };
    const self = { close: (apply: boolean, away = false) => close(apply, away) };
    open = self;
    const box: HTMLElement = input;
    box.addEventListener("keydown", (key) => {
      if (key.isComposing) return;
      // The tree's keys stay out of the field.
      key.stopPropagation();
      if (key.key === "Escape") {
        key.preventDefault();
        close(false);
      } else if (multiline ? commitsHtml(key) : key.key === "Enter") {
        key.preventDefault();
        close(true);
      }
    });
    input.addEventListener("blur", () => close(true, true));
    if (applies) {
      // Pressed, not clicked, so the field keeps the focus until the click puts its edit on.
      applies.addEventListener("pointerdown", (event: Event) => event.preventDefault());
      // The click stays off the line, which would select the element the edit took away.
      applies.addEventListener("click", (event: Event) => {
        event.stopPropagation();
        close(true);
      });
    }
    input.focus({ preventScroll: true });
    input.select();
  }

  function editText(row: Row): void {
    const node = textOf(row);
    const code = hooks.code(row);
    const element = node?.parentNode;
    if (!node || !code || !element || !isElement(element)) return;
    const piece = Array.from(code.childNodes).find((one) => hasTag(one) && one.classList.contains("tok-text"));
    if (!piece) return;
    openField({
      pieces: [piece],
      ...valueField((node.nodeValue ?? "").trim(), "text"),
      // An empty text is refused: a delete takes a text out.
      commit: (text) => text.trim() !== "" && record(textEdit(target(element), node, text, textProperty(node)), element),
    });
  }

  /** Edit an attribute as `name="value"`, or add one with `name` null. Clearing the field takes the attribute out. */
  function editAttr(row: Row, name: string | null): void {
    const element = row.node;
    const code = hooks.code(row);
    if (!isElement(element) || !code) return;
    const pieces = Array.from(code.childNodes);
    let at: Node[];
    /** Where a new one goes while its field is open: before the tag's end, after the attributes it has. */
    let slot: HTMLElement | null = null;
    if (name === null) {
      const end = [...pieces].reverse().find((one) => hasTag(one) && one.classList.contains("tok-tag") && (one.textContent ?? "").startsWith(">"));
      if (!end) return;
      slot = el("span", "", " ");
      end.parentNode?.insertBefore(slot, end);
      at = [slot];
    } else at = pieces.filter((one) => hasTag(one) && one.getAttribute("data-attr") === name);
    if (at.length === 0) return;
    const value = name === null ? "" : `${name}="${quotedValue(element.getAttribute(name) ?? "")}"`;
    const svg = element.namespaceURI === "http://www.w3.org/2000/svg";
    openField({
      pieces: at,
      ...valueField(value, name === null ? "new attribute" : `attribute ${name}`),
      commit(text) {
        const trimmed = text.trim();
        if (trimmed === value) return true;
        const parsed = trimmed === "" ? [] : parseAttributes(element.ownerDocument, trimmed, svg, parse);
        if (parsed === null) return false;
        const names = new Set(parsed.map(([one]) => attributeName(element, one)));
        const changes: (Change | null)[] = [];
        if (name !== null && !names.has(attributeName(element, name))) changes.push(attrEdit(target(element), element, name, null));
        for (const [one, next] of parsed) changes.push(attrEdit(target(element), element, one, next));
        return changes.every((change) => record(change, element));
      },
      closed: () => slot?.remove(),
    });
  }

  function editHtml(row: Row): void {
    const element = row.node;
    const code = hooks.code(row);
    if (!isElement(element) || !code) return;
    const before = markupOf(element);
    const hint = applyHint(isMac());
    const editor = htmlEditor(before, `edit as html, ${hint} to apply, esc to leave`, options.htmlSize ?? null);
    openField({
      pieces: Array.from(code.childNodes),
      input: editor.area,
      frame: editor.frame,
      multiline: true,
      apply: button("chip dom-apply", `apply ${hint}`),
      closed: () => editor.restore(),
      commit(text) {
        if (text.trim() === before.trim()) return true;
        const nodes = parse(element.ownerDocument, text);
        const change = htmlEdit(target(element), element, before, nodes);
        if (!change || !record(change, element)) return false;
        const made = nodes.find(isElement);
        if (made) hooks.select(made);
        return true;
      },
    });
    editor.shown();
  }

  function hide(row: Row): void {
    if (isElement(row.node)) record(hideEdit(target(row.node), row.node), row.node);
  }

  /** Delete the line's node, and select the line after it, or before, or its parent. */
  function remove(row: Row): void {
    const node = row.node;
    const parent = parentOf(node);
    const element = isElement(node) ? node : node.parentNode;
    if (!parent || !element || !isElement(element)) return;
    const lines = hooks.children(parent).filter((entry) => entry.pseudo === null);
    const at = lines.findIndex((entry) => entry.node === node);
    const next = lines[at + 1]?.node ?? lines[at - 1]?.node ?? (parent.nodeType === 9 ? null : parent);
    const property = isElement(node) ? "node" : node.nodeType === 3 ? textProperty(node) : "comment";
    if (!record(deleteEdit(target(element), node, markupOf(node), property), element)) return;
    if (next) hooks.select(next);
  }

  /** Move an element, the places read as selectors before it moves, and select it where it went. */
  function move(element: Element, parent: Element, next: Element | null): boolean {
    const home = element.parentNode;
    if (!home || !isElement(home) || !movable(element) || !canHold(parent, element)) return false;
    const was = nextElementOf(element);
    const places = {
      from: { parent: selectorOf(home), next: was ? selectorOf(was) : null },
      to: { parent: selectorOf(parent), next: next ? selectorOf(next) : null },
    };
    const change = moveEdit(target(element), element, { parent, next }, places);
    if (!change || !record(change, element)) return false;
    hooks.select(element);
    return true;
  }

  /** Move the line's element one place up or down among the elements beside it. */
  function step(row: Row, up: boolean): void {
    const element = row.node;
    const parent = element.parentNode;
    if (!isElement(element) || !parent || !isElement(parent)) return;
    if (up) {
      const before = previousElementOf(element);
      if (before) move(element, parent, before);
      return;
    }
    const after = nextElementOf(element);
    if (after) move(element, parent, nextElementOf(after));
  }

  /** Put the open field's edit on. False where it refused it: the field stays open, marked, and nothing else is done. */
  function done(): boolean {
    open?.close(true);
    return open === null;
  }

  function act(action: TreeEditAction, row: Row): void {
    // The open field's edit may have replaced the line's node: an action on a node gone does nothing.
    if (!actionsFor(row).includes(action) || !done() || !row.node.isConnected) return;
    if (action === "text") editText(row);
    else if (action === "attr") editAttr(row, null);
    else if (action === "html") editHtml(row);
    else if (action === "hide") hide(row);
    else if (action === "up" || action === "down") step(row, action === "up");
    else remove(row);
  }

  function selected(row: Row | null): void {
    current = row;
    const actions = actionsFor(row);
    bar.hidden = actions.length === 0;
    bar.replaceChildren(
      ...actions.map((action) => {
        const hidden = action === "hide" && row !== null && isElement(row.node) && row.node.hasAttribute(HIDE_ATTRIBUTE);
        const control = button("chip dom-act", hidden ? "show" : ACTIONS[action]);
        // Pressed, not clicked, so the tree keeps the focus its keys need.
        control.addEventListener("pointerdown", (event: Event) => event.preventDefault());
        // The open field's edit goes on first, and may select another node: the action is on the one selected then.
        control.addEventListener("click", () => {
          if (done() && current) act(action, current);
        });
        return control;
      }),
    );
  }

  return {
    bar,
    dblclick(row, at) {
      const piece = pieceAt(at, hooks.code(row));
      const name = piece?.getAttribute("data-attr");
      if (name) {
        if (done()) editAttr(row, name);
        return true;
      }
      if (!piece || !textOf(row)) return false;
      act("text", row);
      return true;
    },
    key(event, row) {
      const action = row ? treeEditKey(event) : null;
      if (!action || !row || !actionsFor(row).includes(action)) return false;
      act(action, row);
      return true;
    },
    selected,
    busy: () => open !== null,
    close(commit) {
      if (!open) return false;
      // The tree goes on, as to another node: a field whose edit is refused gives way all the same.
      open.close(commit, commit);
      return true;
    },
    move(element, parent, next) {
      return done() && move(element, parent, next);
    },
    destroy() {
      open?.close(false);
    },
  };
}
