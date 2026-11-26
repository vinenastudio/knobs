import { isDevknobs } from "./hit";

/** A box on the page, in viewport pixels. */
export interface PageRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** How far the pointer goes before a press is a drag, not a click. */
const DRAG_DISTANCE = 6;

/** How far an element may stick out of the drag and still count. */
const TOLERANCE = 1;

/** Tags a drag never takes, nor anything in them. */
const SKIPPED = new Set(["head", "script", "style", "template"]);

const FILTER_ACCEPT = 1;
const FILTER_REJECT = 2;
const FILTER_SKIP = 3;

/** The box between two corners, in either order. */
export function rectFrom(a: Point, b: Point): PageRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/** The pointer moved more than 6 px between going down and coming up. */
export function isDrag(a: Point, b: Point): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) > DRAG_DISTANCE;
}

/** The box lies fully inside the drag, give or take a pixel. */
export function insideRect(box: PageRect, rect: PageRect): boolean {
  return (
    box.left >= rect.left - TOLERANCE &&
    box.top >= rect.top - TOLERANCE &&
    box.right <= rect.right + TOLERANCE &&
    box.bottom <= rect.bottom + TOLERANCE
  );
}

export interface RectCandidate<T> {
  element: T;
  rect: PageRect;
}

/**
 * The candidates a drag takes: inside the drag, outermost only (one whose ancestor
 * also counts is left out), in the order given, at most `max`.
 */
export function pickInRect<T>(
  candidates: readonly RectCandidate<T>[],
  rect: PageRect,
  parentOf: (element: T) => T | null,
  max = 30,
): T[] {
  const counting = new Set<T>();
  for (const candidate of candidates) {
    if (insideRect(candidate.rect, rect)) counting.add(candidate.element);
  }
  const picked: T[] = [];
  for (const candidate of candidates) {
    if (picked.length >= max) break;
    if (!counting.has(candidate.element)) continue;
    let outermost = true;
    for (let up = parentOf(candidate.element); up !== null; up = parentOf(up)) {
      if (counting.has(up)) {
        outermost = false;
        break;
      }
    }
    if (outermost) picked.push(candidate.element);
  }
  return picked;
}

function inSvg(element: Element): boolean {
  for (let up = element.parentElement; up; up = up.parentElement) {
    if (up.tagName.toLowerCase() === "svg") return true;
  }
  return false;
}

/**
 * The page's elements a drag over `rect` takes, in document order, at most `max`.
 * Not knobs' own UI, nor hidden ones; shadow roots and frames are not entered.
 */
export function elementsInRect(doc: Document, rect: PageRect, max = 30): Element[] {
  const body = doc.body;
  if (!body) return [];
  const view = doc.defaultView;
  const candidates: RectCandidate<Element>[] = [];
  const taken = new Set<Element>();
  const walker = doc.createTreeWalker(body, 1, {
    acceptNode(node) {
      const element = node as Element;
      const parent = element.parentElement;
      if (parent && taken.has(parent)) return FILTER_REJECT;
      const tag = element.tagName.toLowerCase();
      if (SKIPPED.has(tag) || isDevknobs(element) || inSvg(element)) return FILTER_REJECT;
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || !insideRect(box, rect)) return FILTER_SKIP;
      const style = view?.getComputedStyle(element);
      if (style?.display === "none") return FILTER_REJECT;
      if (style?.visibility === "hidden") return FILTER_SKIP;
      return FILTER_ACCEPT;
    },
  });
  while (candidates.length < max) {
    const element = walker.nextNode() as Element | null;
    if (!element) break;
    taken.add(element);
    candidates.push({ element, rect: element.getBoundingClientRect() });
  }
  return pickInRect(candidates, rect, (element) => element.parentElement, max);
}
