/**
 * Edits of the page's html, made in the DOM tree: a text changed, an
 * attribute set, added or taken out, an element written anew as html, an
 * element hidden, a node deleted. Each keeps the very nodes it moved, so
 * undo puts back what the page had. An edit goes on and comes off only where
 * its node is as the edit left it: where the page's own script changed or
 * replaced the node since, as a framework does when it renders again, the
 * edit stays as text, and undo only takes it out of the log. To use it:
 *
 *   const change = textEdit(target, node, "Buy now");
 *   if (change) edits.record(change);
 */

import { addStyle, ensureStyle, isDocument, type OwnStyle } from "../engine/style";
import type { Change, EditKind, EditPlace, EditTarget } from "./log";
import { riskyElement } from "./risk";
import { either, hasMark, isMarked, isOwnName, ownSelector, removeMark, setMark } from "../mark";

/** The html edits, by their kind. */
export type HtmlKind = Extract<EditKind, "text" | "attr" | "html" | "hide" | "delete" | "move">;

/** The attribute a hidden element carries. devknobs' own, so the tree and a copy leave it out. */
export const HIDE_ATTRIBUTE = "data-devknobs-hide";

/** What hides an element and all in it, as the browsers' tools hide one: its box keeps its place. */
export const HIDE_CSS = `${either(HIDE_ATTRIBUTE)},${either(HIDE_ATTRIBUTE, "] *")} { visibility: hidden !important; }`;

const HTML = "http://www.w3.org/1999/xhtml";

/** The node an edit put in another's place, and the one undo put back: the selection follows it. */
const successors = new WeakMap<Node, Node>();

/** The node that stands where `node` stood, after edits put others in its place. Null where none does. */
export function successor(node: Node): Node | null {
  let at: Node | undefined = node;
  for (let steps = 0; at && steps < 100; steps++) {
    if (at !== node && at.isConnected) return at;
    at = successors.get(at);
  }
  return null;
}

function viewOf(node: Node): Window | null {
  try {
    return node.ownerDocument?.defaultView ?? null;
  } catch {
    return null;
  }
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && "host" in node;
}

/** The white space a text starts and ends with, which an edit of it keeps. */
function ends(text: string): [string, string] {
  const lead = /^\s*/.exec(text)?.[0] ?? "";
  const trail = lead.length === text.length ? "" : (/\s*$/.exec(text)?.[0] ?? "");
  return [lead, trail];
}

/**
 * A text node's text changed to `text`, the white space around it kept.
 * `property` says which of its element's texts it is. Null where nothing
 * would change, or where the text would be empty: a delete takes a text out.
 */
export function textEdit(target: EditTarget, node: Node, text: string, property = "text"): Change | null {
  const before = node.nodeValue ?? "";
  const next = text.trim();
  const [lead, trail] = ends(before);
  const after = `${lead}${next}${trail}`;
  if (next === "" || after === before) return null;
  return {
    edit: { kind: "text", target: { ...target }, property, before: before.trim(), after: next },
    apply() {
      if (node.parentNode === null || node.nodeValue !== before) return false;
      node.nodeValue = after;
      return true;
    },
    revert() {
      if (node.nodeValue === after) node.nodeValue = before;
    },
    view: viewOf(node),
  };
}

/** An attribute's name as the element keeps it: lower case on an html element. */
export function attributeName(element: Element, name: string): string {
  const trimmed = name.trim();
  return element.namespaceURI === HTML ? trimmed.toLowerCase() : trimmed;
}

function setAttr(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/** An attribute set to `value`, added, or with null taken out. Null where nothing would change, or for one of devknobs'. */
export function attrEdit(target: EditTarget, element: Element, name: string, value: string | null): Change | null {
  const attr = attributeName(element, name);
  if (attr === "" || isOwnName(attr)) return null;
  const before = element.getAttribute(attr);
  if (before === value) return null;
  return {
    edit: { kind: "attr", target: { ...target }, property: attr, before, after: value },
    apply() {
      if (element.getAttribute(attr) !== before) return false;
      // A name that is no attribute's throws, and the log takes that as not taken.
      setAttr(element, attr, value);
      return element.getAttribute(attr) === value;
    },
    revert() {
      if (element.getAttribute(attr) === value) setAttr(element, attr, before);
    },
    view: viewOf(element),
  };
}

/** The nodes `html` makes, parsed in the element's document as the page's own html would be, scripts left inert. */
export function parseHtml(doc: Document, html: string): Node[] {
  const template = doc.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes);
}

/** Nodes as markup, as the browser writes them back: an element's outer html, a comment, a text with `&`, `<` and `>` escaped. */
export function markupOfNodes(nodes: readonly Node[]): string {
  return nodes
    .map((node) => {
      if (isElement(node)) return node.outerHTML;
      if (node.nodeType === 8) return `<!--${node.nodeValue ?? ""}-->`;
      return (node.nodeValue ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    })
    .join("");
}

/** Whether nodes carry devknobs' own attribute, on them or anything in them, which no edit makes. */
export function holdsReserved(nodes: readonly Node[]): boolean {
  return nodes.some((node) => isElement(node) && [node, ...Array.from(node.querySelectorAll("*"))].some((one) => Array.from(one.attributes).some((attr) => isOwnName(attr.name))));
}

/**
 * An element written anew: `nodes` in its place. `before` is its markup as
 * the tree copies it, and the edit's `after` the nodes' markup as the
 * browser writes it back, so two edits of one element compare alike. Null
 * where the nodes hold no element, carry devknobs' own attribute, or come to
 * the markup it has. It goes on and comes off only where the element, or the
 * nodes in its place, still stand in the parent it had, in one run.
 */
export function htmlEdit(target: EditTarget, element: Element, before: string, nodes: readonly Node[]): Change | null {
  const first = nodes.find(isElement);
  const home = element.parentNode;
  const after = markupOfNodes(nodes).trim();
  if (!first || !home || holdsReserved(nodes) || after === before.trim()) return null;
  const made = [...nodes];
  /** The nodes in the element's place stand in its parent, one after another. */
  const inPlace = (): boolean => made.every((node, at) => node.parentNode === home && (at === 0 || made[at - 1]?.nextSibling === node));
  return {
    edit: { kind: "html", target: { ...target }, property: "html", before, after },
    apply() {
      if (element.parentNode !== home || !element.isConnected) return false;
      for (const node of made) home.insertBefore(node, element);
      home.removeChild(element);
      successors.set(element, first);
      return true;
    },
    revert() {
      if (!inPlace() || element.parentNode !== null) return;
      home.insertBefore(element, made[0] ?? null);
      for (const node of made) home.removeChild(node);
      successors.set(first, element);
    },
    view: viewOf(element),
  };
}

const shadowStyles = new WeakMap<Node, OwnStyle>();

/** Bring the rule that hides into the element's document or shadow root, once. */
export function hideStyle(element: Element): void {
  const root = element.getRootNode();
  if (isDocument(root)) {
    const style = ensureStyle("hide", root);
    if (!style.textContent) style.textContent = HIDE_CSS;
    return;
  }
  if (isShadowRoot(root) && !shadowStyles.has(root)) shadowStyles.set(root, addStyle(root, HIDE_CSS));
}

/** An element hidden, or shown again where a hide is on it. `style` brings in the rule that hides. */
export function hideEdit(target: EditTarget, element: Element, style: (element: Element) => void = hideStyle): Change {
  const hidden = hasMark(element, HIDE_ATTRIBUTE);
  const set = (on: boolean): void => {
    if (on) setMark(element, HIDE_ATTRIBUTE);
    else removeMark(element, HIDE_ATTRIBUTE);
  };
  return {
    edit: { kind: "hide", target: { ...target }, property: "hidden", before: hidden ? "hidden" : null, after: hidden ? null : "hidden" },
    apply() {
      if (hasMark(element, HIDE_ATTRIBUTE) !== hidden) return false;
      if (!hidden) style(element);
      set(!hidden);
      return true;
    },
    revert() {
      if (hasMark(element, HIDE_ATTRIBUTE) !== hidden) set(hidden);
    },
    view: viewOf(element),
  };
}

/**
 * A node deleted: `before` is its markup, `property` what it is in its
 * element. Undo puts it back where it stood, before the node that came after
 * it, or after the one before where that went, or first where it was first.
 * Null for a node with no parent.
 */
export function deleteEdit(target: EditTarget, node: Node, before: string, property = "node"): Change | null {
  const parent = node.parentNode;
  if (!parent) return null;
  let next: Node | null = null;
  let previous: Node | null = null;
  return {
    edit: { kind: "delete", target: { ...target }, property, before, after: null },
    apply() {
      if (node.parentNode !== parent) return false;
      next = node.nextSibling;
      previous = node.previousSibling;
      parent.removeChild(node);
      return true;
    },
    revert() {
      if (node.parentNode !== null || !parent.isConnected) return;
      let at: Node | null = null;
      if (next?.parentNode === parent) at = next;
      else if (previous?.parentNode === parent) at = previous.nextSibling;
      else if (previous === null) at = parent.firstChild;
      parent.insertBefore(node, at);
    },
    view: viewOf(node),
  };
}

/** devknobs' own element: its panel, its boxes, the styles it puts on the page. */
function isOwnElement(node: Node): boolean {
  return isElement(node) && isMarked(node);
}

/** The element after a node among its parent's, devknobs' own left out. Null at the end. */
export function nextElementOf(node: Node): Element | null {
  for (let at = node.nextSibling; at; at = at.nextSibling) if (isElement(at) && !isOwnElement(at)) return at;
  return null;
}

/** The element before a node among its parent's, devknobs' own left out. Null at the start. */
export function previousElementOf(node: Node): Element | null {
  for (let at = node.previousSibling; at; at = at.previousSibling) if (isElement(at) && !isOwnElement(at)) return at;
  return null;
}

/** The first element in a node, devknobs' own left out. */
export function firstElementOf(node: Node): Element | null {
  for (let at = node.firstChild; at; at = at.nextSibling) if (isElement(at) && !isOwnElement(at)) return at;
  return null;
}

/**
 * Whether an element can be moved: one in an element, and not the head or
 * body, devknobs' own, one that holds devknobs' own nodes, as the body holds
 * the panel, nor a script, frame or the like, or one that holds one. The
 * root element has a document above it, and stays.
 */
export function movable(node: Node): node is Element {
  if (!isElement(node) || isOwnElement(node)) return false;
  const parent = node.parentNode;
  if (!parent || !isElement(parent)) return false;
  if (node.namespaceURI === HTML && (node.localName === "head" || node.localName === "body")) return false;
  // A script, frame or base moved runs, loads or reads the page's addresses again: neither it nor one holding it moves.
  if (riskyElement(node) || Array.from(node.querySelectorAll("*")).some(riskyElement)) return false;
  return node.querySelector(ownSelector()) === null;
}

/**
 * Elements that take no element moved into them: those with no content of
 * their own, those whose content is text or another document, and `<html>`
 * and `<head>`, which hold only the head and body, and what goes in a head.
 */
const EMPTY = new Set([
  ...["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "template"],
  ...["script", "style", "textarea", "title", "iframe", "noscript", "object", "html", "head"],
]);

/** The node above, through a shadow root to its host. */
function above(node: Node): Node | null {
  return isShadowRoot(node) ? node.host : node.parentNode;
}

/** Whether an element can take `element` moved into it: on the page, not devknobs' own, not the element or one in it, through shadow roots too, and not one of `EMPTY`. */
export function canHold(parent: Node, element: Element): parent is Element {
  if (!isElement(parent) || !parent.isConnected || isOwnElement(parent) || parent === element) return false;
  if (parent.namespaceURI === HTML && EMPTY.has(parent.localName)) return false;
  for (let at: Node | null = parent; at; at = above(at)) if (at === element) return false;
  return true;
}

/** An element as a move says it: its tag, with its id and class where it has them. */
export function tagLabel(element: Element): string {
  const tag = element.localName || element.nodeName.toLowerCase();
  const id = element.getAttribute("id");
  const classes = element.getAttribute("class")?.trim().replace(/\s+/g, " ");
  return `<${tag}${id ? ` id="${id}"` : ""}${classes ? ` class="${classes}"` : ""}>`;
}

const ORDINALS = ["th", "st", "nd", "rd"];

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(n: number): string {
  const tens = n % 100;
  return `${n}${tens >= 11 && tens <= 13 ? "th" : (ORDINALS[n % 10] ?? "th")}`;
}

/** An element as a place says it: its label, and where its parent holds others that look alike, which of them it is. */
function placeLabel(parent: Element, element: Element): string {
  const label = tagLabel(element);
  let at = 0;
  let alike = 0;
  for (let one = firstElementOf(parent); one; one = nextElementOf(one)) {
    if (tagLabel(one) !== label) continue;
    alike++;
    if (one === element) at = alike;
  }
  return alike > 1 && at > 0 ? `the ${ordinal(at)} ${label}` : label;
}

/** A place in words: `before <li class="x"> in <ul>`, `before the 2nd <li> in <ul>`, or `at the end of <ul>`. */
export function placeWords(parent: Element, next: Element | null): string {
  return next ? `before ${placeLabel(parent, next)} in ${tagLabel(parent)}` : `at the end of ${tagLabel(parent)}`;
}

/**
 * An element moved into `to.parent`, before `to.next`, or at its end with
 * null. `places` are the two places as selectors, read before the move. Null
 * where it cannot move, where the place cannot take it, or where it already
 * stands there. It goes on only where the element still stands where it was,
 * and comes off only where it still stands where it went: undo puts it back
 * before the node that came after it, or after the one before.
 */
export function moveEdit(target: EditTarget, element: Element, to: { parent: Element; next: Element | null }, places: { from: EditPlace; to: EditPlace }): Change | null {
  const home = element.parentNode;
  if (!home || !isElement(home) || !movable(element) || !canHold(to.parent, element)) return null;
  if (to.next === element || (to.next !== null && to.next.parentNode !== to.parent)) return null;
  const fromNext = nextElementOf(element);
  if (to.parent === home && to.next === fromNext) return null;
  let next: Node | null = null;
  let previous: Node | null = null;
  return {
    edit: { kind: "move", target: { ...target }, property: "node", before: placeWords(home, fromNext), after: placeWords(to.parent, to.next), from: { ...places.from }, to: { ...places.to } },
    apply() {
      if (element.parentNode !== home || !canHold(to.parent, element) || (to.next !== null && to.next.parentNode !== to.parent)) return false;
      next = element.nextSibling;
      previous = element.previousSibling;
      to.parent.insertBefore(element, to.next);
      return true;
    },
    revert() {
      if (element.parentNode !== to.parent || nextElementOf(element) !== to.next || !home.isConnected) return;
      let at: Node | null = null;
      if (next?.parentNode === home) at = next;
      else if (previous?.parentNode === home) at = previous.nextSibling;
      else if (previous === null) at = home.firstChild;
      home.insertBefore(element, at);
    },
    view: viewOf(element),
  };
}
