import { describe, expect, test } from "bun:test";
import {
  elementsInRect,
  insideRect,
  isDrag,
  pickInRect,
  rectFrom,
  type PageRect,
  type RectCandidate,
} from "../src/grab/rect";
import { as, type FakeElement, node, place } from "./grab-tree";

function box(left: number, top: number, width: number, height: number): PageRect {
  return { left, top, right: left + width, bottom: top + height };
}

/** A tree of names, each with its box and its parent, in document order. */
function tree(rows: [name: string, parent: string | null, rect: PageRect][]) {
  const parents = new Map(rows.map(([name, parent]) => [name, parent]));
  const candidates: RectCandidate<string>[] = rows.map(([element, , rect]) => ({ element, rect }));
  return { candidates, parentOf: (name: string) => parents.get(name) ?? null };
}

/** A document whose walker visits `body` the way a TreeWalker does, filter and all. */
function page(body: FakeElement): Document {
  const doc = {
    body,
    defaultView: { getComputedStyle: (element: FakeElement) => element.style },
    createTreeWalker(root: FakeElement, _what: number, filter: { acceptNode(node: unknown): number }) {
      function* visit(parent: FakeElement): Generator<FakeElement> {
        for (const child of parent.children) {
          const verdict = filter.acceptNode(child);
          if (verdict === 1) yield child;
          if (verdict !== 2) yield* visit(child);
        }
      }
      const walk = visit(root);
      return { nextNode: () => walk.next().value ?? null };
    },
  };
  return doc as unknown as Document;
}

function hide(element: FakeElement, style: Record<string, string>): FakeElement {
  Object.assign(element.style, style);
  return element;
}

describe("drag geometry", () => {
  test("the box between two corners, in either order", () => {
    expect(rectFrom({ x: 50, y: 10 }, { x: 10, y: 40 })).toEqual(box(10, 10, 40, 30));
  });

  test("a drag is more than 6 px", () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(true);
    expect(isDrag({ x: 10, y: 10 }, { x: 3, y: 10 })).toBe(true);
  });

  test("an element counts with 1 px of tolerance, not more", () => {
    const drag = box(10, 10, 100, 100);
    expect(insideRect(box(9, 9, 102, 102), drag)).toBe(true);
    expect(insideRect(box(8, 10, 20, 20), drag)).toBe(false);
    expect(insideRect(box(100, 100, 12, 10), drag)).toBe(false);
  });
});

describe("pickInRect", () => {
  test("keeps only the outermost counting elements, in document order", () => {
    const { candidates, parentOf } = tree([
      ["card", null, box(0, 0, 100, 100)],
      ["title", "card", box(10, 10, 50, 20)],
      ["list", null, box(0, 200, 300, 100)],
      ["one", "list", box(10, 210, 50, 20)],
      ["two", "list", box(70, 210, 50, 20)],
      ["icon", "two", box(72, 212, 10, 10)],
    ]);
    expect(pickInRect(candidates, box(0, 0, 200, 250), parentOf)).toEqual(["card", "one", "two"]);
  });

  test("an ancestor that counts drops its whole subtree, past ones that do not", () => {
    const { candidates, parentOf } = tree([
      ["outer", null, box(0, 0, 100, 100)],
      ["wide", "outer", box(0, 0, 500, 20)],
      ["deep", "wide", box(10, 10, 10, 10)],
    ]);
    expect(pickInRect(candidates, box(0, 0, 100, 100), parentOf)).toEqual(["outer"]);
  });

  test("takes at most the cap", () => {
    const rows: [string, string | null, PageRect][] = Array.from({ length: 40 }, (_, index) => [
      `item${index}`,
      null,
      box(index * 10, 0, 8, 8),
    ]);
    const { candidates, parentOf } = tree(rows);
    const picked = pickInRect(candidates, box(0, 0, 1000, 100), parentOf);
    expect(picked).toHaveLength(30);
    expect(picked[0]).toBe("item0");
    expect(picked[29]).toBe("item29");
    expect(pickInRect(candidates, box(0, 0, 1000, 100), parentOf, 3)).toEqual(["item0", "item1", "item2"]);
  });
});

describe("elementsInRect", () => {
  test("walks the page in order, outermost only, past knobs, hidden ones and svg parts", () => {
    const path = place(node("path"), 12, 12, 4, 4);
    const icon = place(node("svg", [path]), 10, 10, 10, 10);
    const label = place(node("span"), 30, 10, 20, 10);
    const button = place(node("button", [label]), 25, 5, 40, 20);
    const shown = place(node("em"), 10, 60, 10, 10);
    const ghost = hide(place(node("div", [shown]), 0, 50, 100, 30), { visibility: "hidden" });
    const gone = hide(place(node("p"), 10, 90, 10, 5), { display: "none" });
    const panel = place(node("aside", [], { "data-devknobs": "panel" }), 0, 0, 50, 50);
    const script = place(node("script"), 0, 0, 1, 1);
    const wrapper = node("div", [icon, button]);
    const body = node("body", [panel, script, wrapper, ghost, gone]);
    expect(elementsInRect(page(body), box(0, 0, 100, 100))).toEqual([icon, button, shown].map(as));
  });

  test("stops at the cap", () => {
    const items = Array.from({ length: 5 }, (_, index) => place(node("li"), index * 10, 0, 8, 8));
    const body = node("body", [node("ul", items)]);
    expect(elementsInRect(page(body), box(0, 0, 100, 100), 2)).toEqual([items[0], items[1]].map((item) => as(item ?? null)));
  });
});
