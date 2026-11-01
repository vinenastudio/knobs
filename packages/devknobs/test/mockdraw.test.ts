import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { screenOf } from "../src/engine/devices";
import { islandOf, mockOf } from "../src/engine/mock";
import { BODIES } from "../src/engine/mockdata";
import { corners, drawMock } from "../src/engine/mockdraw";

/** An svg node that keeps its attributes and children, as drawMock builds them. */
class Node {
  readonly attributes = new Map<string, string>();
  readonly children: Node[] = [];
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  append(...nodes: Node[]) {
    this.children.push(...nodes);
  }
}

beforeEach(() => {
  Reflect.set(globalThis, "document", { createElementNS: () => new Node() });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

const ISLANDS = Object.keys(BODIES).filter((id) => islandOf(id) !== null);

describe("a drawn phone with an island", () => {
  test("is every island iPhone", () => {
    expect(ISLANDS.toSorted()).toEqual(
      [
        "iphone-16",
        "iphone-16-plus",
        "iphone-16-pro",
        "iphone-16-pro-max",
        "iphone-17",
        "iphone-17-pro",
        "iphone-17-pro-max",
        "iphone-air",
        "iphone-18-pro",
        "iphone-18-pro-max",
      ].toSorted(),
    );
  });

  test("has one bezel on every side, the body's radius less the screen's", () => {
    for (const id of ISLANDS) {
      const { bezel, bodyRadius, screenRadius } = BODIES[id]!;
      const gap = corners(bodyRadius)[0] - corners(screenRadius)[0];
      for (const side of [bezel.top, bezel.right, bezel.bottom, bezel.left]) expect(side).toBeCloseTo(gap, 6);
    }
  });

  test("cuts its screen as round arcs concentric with the body, no superellipse", () => {
    const mock = mockOf("iphone-17-pro", "portrait")!;
    const svg = drawMock(mock, screenOf("iphone-17-pro")!, null) as unknown as Node;
    const path = (name: string) =>
      svg.children.find((node) => node.attributes.get("class") === name)?.attributes.get("d") ?? "";
    const body = path("body");
    expect(body.match(/A62 62 0 0 1/g)).toHaveLength(4);
    expect(body.match(/A75.2 75.2 0 0 1/g)).toHaveLength(4);
    expect(body.match(/L/g)).toBeNull();
    expect(path("band").match(/A77.7 77.7 0 0 1/g)).toHaveLength(4);
  });
});
