import { describe, expect, test } from "bun:test";
import { ATTRIBUTES, either, findOwn, getMark, hasMark, isMarked, isOwnName, markOwn, newName, OWN_AND_IN, ownSelector, removeMark, setMark } from "../src/mark";
import { as, elem } from "./dom-page";

/** The attributes of another tool, `@kitlangton/knobs`, that can sit on the same page. */
const OTHER_TOOL = ["data-knobs-font", "data-knobs-tokens", "data-knobs-theme", "data-knobs-switcher", "data-knobs-ui", "data-knobs-style"];

describe("knobs' marks, under the new name and the old one", () => {
  test("are written under both names, with the same value", () => {
    const host = as(elem("div")) as Element;
    markOwn(host, "panel");
    expect(host.getAttribute("data-knobs")).toBe("panel");
    expect(host.getAttribute("data-devknobs")).toBe("panel");
    setMark(host, "data-devknobs-force", "hover focus");
    expect(host.getAttribute("data-knobs-force")).toBe("hover focus");
    expect(host.getAttribute("data-devknobs-force")).toBe("hover focus");
    removeMark(host, "data-devknobs-force");
    expect(host.hasAttribute("data-knobs-force")).toBe(false);
    expect(host.hasAttribute("data-devknobs-force")).toBe(false);
  });

  test("are read under either name: an old copy writes only the old one", () => {
    const old = as(elem("div", { "data-devknobs": "viewport", "data-devknobs-hide": "" })) as Element;
    const fresh = as(elem("div", { "data-knobs": "viewport", "data-knobs-hide": "" })) as Element;
    for (const one of [old, fresh]) {
      expect(isMarked(one)).toBe(true);
      expect(hasMark(one, "data-devknobs-hide")).toBe(true);
      expect(getMark(one, "data-devknobs")).toBe("viewport");
    }
    expect(isMarked(as(elem("div")) as Element)).toBe(false);
  });

  test("find a node of either copy, the new name first", () => {
    const old = as(elem("style", { "data-devknobs": "outlines" })) as Element;
    const fresh = as(elem("style", { "data-knobs": "scheme", "data-devknobs": "scheme" })) as Element;
    const asked: string[] = [];
    const nodes: Record<string, Element> = { 'style[data-devknobs="outlines"]': old, 'style[data-knobs="scheme"]': fresh, 'style[data-devknobs="scheme"]': fresh };
    const root = {
      querySelector: (selector: string) => {
        asked.push(selector);
        return nodes[selector] ?? null;
      },
    } as unknown as ParentNode;
    expect(findOwn(root, "outlines", "style")).toBe(old);
    expect(findOwn(root, "scheme", "style")).toBe(fresh);
    expect(findOwn(root, "width", "style")).toBeNull();
    expect(asked).toEqual(['style[data-knobs="outlines"]', 'style[data-devknobs="outlines"]', 'style[data-knobs="scheme"]', 'style[data-knobs="width"]', 'style[data-devknobs="width"]']);
    expect(ownSelector()).toBe("[data-knobs],[data-devknobs]");
    expect(ownSelector("panel")).toBe('[data-knobs="panel"],[data-devknobs="panel"]');
    expect(either("data-devknobs-frame")).toBe("[data-knobs-frame],[data-devknobs-frame]");
    expect(OWN_AND_IN).toBe("[data-knobs],[data-devknobs],[data-knobs] *,[data-devknobs] *");
  });

  test("are knobs' own names: any of the old prefix, only knobs' own of the new", () => {
    for (const name of ["data-devknobs", "data-devknobs-hide", "data-devknobs-anything", "DATA-DEVKNOBS-FORCE"]) expect(isOwnName(name)).toBe(true);
    for (const old of Object.values(ATTRIBUTES)) {
      expect(old.startsWith("data-devknobs")).toBe(true);
      expect(isOwnName(newName(old))).toBe(true);
    }
    expect(newName(ATTRIBUTES.hide)).toBe("data-knobs-hide");
    for (const name of [...OTHER_TOOL, "data-knobs-anything", "data-knob", "class"]) expect(isOwnName(name)).toBe(false);
  });
});
