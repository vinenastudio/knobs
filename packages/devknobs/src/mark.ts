/**
 * The attributes knobs puts on the page's nodes, under the new name,
 * `data-knobs…`, and the old one, `data-devknobs…`, until 1.0. A copy of an
 * older version on the same page (the extension's, the page's own, the one in
 * the frame) writes and reads only the old names, so every copy writes both
 * and reads either. Each attribute goes by its old name here.
 */

/** The mark on every node knobs adds to the page, its value what the node is. */
export const OLD_MARK = "data-devknobs";
export const MARK = "data-knobs";

/**
 * knobs' new names. Matched as a whole, never by their start: other tools on
 * a page, such as `@kitlangton/knobs`, put `data-knobs-…` attributes of their own.
 */
const NAMES = new Set(
  ["", "-frame", "-force", "-hide", "-replay", "-href", "-icon", "-keys", "-fresh", "-early"].map((end) => `${MARK}${end}`),
);

/** The new name of an attribute, from its old one. */
export function newName(old: string): string {
  return `${MARK}${old.slice(OLD_MARK.length)}`;
}

/** Whether an attribute is one knobs puts on the page: any of the old prefix, only knobs' own of the new. */
export function isOwnName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith(OLD_MARK) || NAMES.has(lower);
}

/** Sets the attribute under both names. */
export function setMark(element: Element, old: string, value = ""): void {
  element.setAttribute(newName(old), value);
  element.setAttribute(old, value);
}

/** Takes the attribute off under both names. */
export function removeMark(element: Element, old: string): void {
  element.removeAttribute(newName(old));
  element.removeAttribute(old);
}

/** Whether the element has the attribute under either name. */
export function hasMark(element: Element, old: string): boolean {
  return element.hasAttribute(newName(old)) || element.hasAttribute(old);
}

/** The attribute's value under the new name, else under the old one. */
export function getMark(element: Element, old: string): string | null {
  return element.getAttribute(newName(old)) ?? element.getAttribute(old);
}

/** A selector list for the attribute under either name, `rest` after each, as `="panel"]` or `] *`. */
export function either(old: string, rest = "]"): string {
  return `[${newName(old)}${rest},[${old}${rest}`;
}

/** Marks a node as knobs' own, `value` what it is. */
export function markOwn(element: Element, value = ""): void {
  setMark(element, OLD_MARK, value);
}

/** Whether a node is knobs' own. */
export function isMarked(element: Element): boolean {
  return hasMark(element, OLD_MARK);
}

/** A selector list for knobs' own nodes, or those of them whose mark is `value`. */
export function ownSelector(value?: string): string {
  return either(OLD_MARK, value === undefined ? "]" : `="${value}"]`);
}

/** The first of knobs' own nodes under `root` whose mark is `value`, of the `tag` given: by the new name, else the old one. */
export function findOwn<T extends Element = Element>(root: ParentNode, value: string, tag = ""): T | null {
  return root.querySelector<T>(`${tag}[${MARK}="${value}"]`) ?? root.querySelector<T>(`${tag}[${OLD_MARK}="${value}"]`);
}

/** A selector list for knobs' own nodes and all in them. */
export const OWN_AND_IN = `${ownSelector()},${either(OLD_MARK, "] *")}`;
