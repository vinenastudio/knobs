import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type CssPlace, cssOff, cssOn, cssValue, type Off, offIn } from "../src/edit/css";
import { type Change, createEditLog, type Edit, type EditLog } from "../src/edit/log";
import { recordAt } from "../src/edit/source";
import { changeCount, diffText, KEEP_APPROACH, netChanges, promptText } from "../src/edit/text";
import { Block, fakeCss } from "./edit-block";


beforeAll(() => {
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: fakeCss });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "CSS");
});

type FakePlace = CssPlace & { style: Block & CSSStyleDeclaration };

const RULE = { selectorText: ".cta", sheet: "https://site.test/app.css", path: [3], context: [] };

function place(text = "", rule = true, view: Window | null = null): FakePlace {
  return {
    style: new Block(text) as Block & CSSStyleDeclaration,
    element: { ownerDocument: { defaultView: view } } as unknown as Element,
    selector: "a.cta",
    ...(rule ? { rule: RULE } : {}),
  };
}

function must(change: Change | null): Change {
  if (!change) throw new Error("no change");
  return change;
}

/** Turn a declaration off through the log. */
function off(log: EditLog, at: FakePlace, property: string): Edit | null {
  return log.record(must(cssOff(at, property, log.recorded)));
}

/** Turn a declaration that is off on again, as its struck line's box does. */
function on(log: EditLog, at: FakePlace, property: string): Edit | null {
  const found: Off | undefined = offIn(log.recorded(), at.style).find((one) => one.property === property);
  if (!found) throw new Error(`${property} is not off`);
  return log.record(cssOn(at, found, log.recorded));
}

describe("a value edit", () => {
  test("changes a value in its place, and reverts it", () => {
    const at = place("padding: 8px 14px; color: red;");
    const log = createEditLog();
    const edit = log.record(must(cssValue("css-value", at, "padding", "10px 18px")));
    expect(at.style.cssText).toBe("padding: 10px 18px; color: red;");
    expect(edit).toEqual({
      id: 1,
      kind: "css-value",
      target: { selector: "a.cta", rule: RULE },
      property: "padding",
      before: "8px 14px",
      after: "10px 18px",
    });
    log.undo();
    expect(at.style.cssText).toBe("padding: 8px 14px; color: red;");
    log.redo();
    expect(at.style.cssText).toBe("padding: 10px 18px; color: red;");
  });

  test("keeps !important, before and after", () => {
    const at = place("color: red !important;");
    const log = createEditLog();
    const edit = log.record(must(cssValue("css-value", at, "color", "blue !important")));
    expect(at.style.cssText).toBe("color: blue !important;");
    expect(edit?.before).toBe("red !important");
    log.undo();
    expect(at.style.cssText).toBe("color: red !important;");
  });

  test("sets a longhand a shorthand holds, and undo leaves the shorthand whole", () => {
    const at = place("padding: 4px; color: red;");
    const log = createEditLog();
    const edit = log.record(must(cssValue("css-add", at, "padding-top", "10px")));
    expect(edit).toMatchObject({ property: "padding-top", before: "4px", after: "10px" });
    expect(at.style.cssText).toBe("padding: 10px 4px 4px; color: red;");
    log.undo();
    expect(at.style.cssText).toBe("padding: 4px; color: red;");
  });

  test("adds a property to an element's own style, and takes it out on undo", () => {
    const at = place("color: red;", false);
    const log = createEditLog();
    const edit = log.record(must(cssValue("css-add", at, "Margin-Top", "4px")));
    expect(edit).toMatchObject({ kind: "css-add", property: "margin-top", before: null, after: "4px", target: { selector: "a.cta" } });
    expect(edit?.target.rule).toBeUndefined();
    expect(at.style.cssText).toBe("color: red; margin-top: 4px;");
    log.undo();
    expect(at.style.cssText).toBe("color: red;");
  });

  test("a value the page does not take, or one with a `;`, is not recorded and changes nothing", () => {
    const at = place("color: red;");
    const log = createEditLog();
    expect(log.record(must(cssValue("css-value", at, "color", "nope")))).toBeNull();
    expect(log.record(must(cssValue("css-value", at, "color", "blue; margin: 0")))).toBeNull();
    expect(at.style.cssText).toBe("color: red;");
    expect(log.list()).toEqual([]);
  });

  test("leaves a value the browser cannot write back as it is, through edits, toggles and undo", () => {
    const at = place("margin: var(--m); color: red;");
    expect(at.style.cssText).toContain("margin-top: ;");
    const log = createEditLog();
    log.record(must(cssValue("css-value", at, "color", "blue")));
    off(log, at, "color");
    on(log, at, "color");
    log.undoAll();
    expect(at.style.getPropertyValue("margin")).toBe("var(--m)");
    expect(at.style.getPropertyValue("color")).toBe("red");
  });

  test("is no change where the value stays the same", () => {
    expect(cssValue("css-value", place("color: red;"), "color", " red ")).toBeNull();
    expect(cssValue("css-add", place(), "", "red")).toBeNull();
  });
});

describe("a toggle", () => {
  test("turns a declaration off and on again where it stood", () => {
    const at = place("padding: 8px; box-shadow: 0 1px 2px #0003; color: red;");
    const log = createEditLog();
    expect(off(log, at, "box-shadow")).toMatchObject({ kind: "css-toggle", before: "0 1px 2px #0003", after: null });
    expect(at.style.cssText).toBe("padding: 8px; color: red;");
    expect(offIn(log.recorded(), at.style)).toEqual([{ property: "box-shadow", text: "0 1px 2px #0003", index: 1 }]);
    on(log, at, "box-shadow");
    expect(at.style.cssText).toBe("padding: 8px; box-shadow: 0 1px 2px #0003; color: red;");
    expect(offIn(log.recorded(), at.style)).toEqual([]);
    log.undo();
    expect(at.style.cssText).toBe("padding: 8px; color: red;");
    log.undo();
    expect(at.style.cssText).toBe("padding: 8px; box-shadow: 0 1px 2px #0003; color: red;");
  });

  for (const order of [["top", "left"], ["left", "top"]]) {
    test(`puts two lines that were off back where they stood, ${order.join(" then ")}`, () => {
      const at = place("color: red; top: 1px; left: 2px; right: 3px;");
      const log = createEditLog();
      off(log, at, "top");
      off(log, at, "left");
      expect(at.style.cssText).toBe("color: red; right: 3px;");
      expect(offIn(log.recorded(), at.style).map((one) => [one.property, one.index])).toEqual([
        ["top", 1],
        ["left", 2],
      ]);
      for (const name of order) on(log, at, name ?? "");
      expect(at.style.cssText).toBe("color: red; top: 1px; left: 2px; right: 3px;");
      log.undoAll();
      expect(at.style.cssText).toBe("color: red; top: 1px; left: 2px; right: 3px;");
    });
  }

  test("undone, puts a line back where it stood with another still off before it", () => {
    const at = place("color: red; top: 1px; left: 2px; right: 3px;");
    const log = createEditLog();
    off(log, at, "top");
    off(log, at, "left");
    log.undo();
    expect(at.style.cssText).toBe("color: red; left: 2px; right: 3px;");
    log.undo();
    expect(at.style.cssText).toBe("color: red; top: 1px; left: 2px; right: 3px;");
  });
});

describe("the edit log", () => {
  test("undoes the last first, forgets redo on a new edit, and undoes all", () => {
    const at = place("color: red;");
    const log = createEditLog();
    let heard = 0;
    const stop = log.subscribe(() => heard++);
    log.record(must(cssValue("css-value", at, "color", "blue")));
    log.record(must(cssValue("css-value", at, "color", "green")));
    expect(log.undo()?.after).toBe("green");
    expect(at.style.cssText).toBe("color: blue;");
    log.record(must(cssValue("css-add", at, "margin", "0")));
    expect(log.redo()).toBeNull();
    expect(log.undoAll()).toBe(2);
    expect(at.style.cssText).toBe("color: red;");
    expect(log.undo()).toBeNull();
    expect(heard).toBe(5);
    stop();
    log.record(must(cssValue("css-value", at, "color", "blue")));
    expect(heard).toBe(5);
  });

  test("hands out plain copies, which change nothing in it", () => {
    const log = createEditLog();
    log.record(must(cssValue("css-value", place("color: red;"), "color", "blue")));
    const [edit] = log.list();
    if (!edit?.target.rule) throw new Error("no edit");
    edit.target.rule.path.push(9);
    expect(log.list()[0]?.target.rule?.path).toEqual([3]);
    expect(JSON.parse(JSON.stringify(log.list()))).toEqual(log.list());
  });

  test("reverts without throwing after its rule or element went", () => {
    const log = createEditLog();
    const at = place("color: red;");
    log.record(must(cssValue("css-value", at, "color", "blue")));
    at.style.setProperty = () => {
      throw new Error("gone");
    };
    expect(() => log.undoAll()).not.toThrow();
    expect(log.list()).toEqual([]);
  });

  test("keeps an edit as text once its page went, and undo then only takes it out", () => {
    const view = new EventTarget() as unknown as Window;
    const at = place("color: red;", true, view);
    const log = createEditLog();
    log.record(must(cssValue("css-value", at, "color", "blue")));
    view.dispatchEvent(new Event("pagehide"));
    expect(log.list()).toMatchObject([{ property: "color", before: "red", after: "blue" }]);
    log.undo();
    expect(log.list()).toEqual([]);
    expect(at.style.cssText).toBe("color: blue;");
    expect(log.redo()?.property).toBe("color");
    expect(log.list()).toEqual([]);
  });

  test("fills in where the element is written once that is found", async () => {
    const log = createEditLog();
    const edit = recordAt(log, must(cssValue("css-value", place("color: red;"), "color", "blue")), {} as Element, async () => "src/Hero.tsx:42");
    expect(edit?.target.source).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(log.list()[0]?.target.source).toBe("src/Hero.tsx:42");
  });
});

describe("the edits as text", () => {
  const rule = RULE;
  const nested = { selectorText: "&", sheet: "https://site.test/app.css", path: [4, 0, 1], context: ["@media (min-width: 640px)", ".p"] };
  const edits: Edit[] = [
    { id: 1, kind: "css-value", target: { selector: "a.cta", source: "src/Hero.tsx:42", rule }, property: "padding", before: "8px 14px", after: "10px" },
    { id: 2, kind: "css-value", target: { selector: "a.cta", rule }, property: "padding", before: "10px", after: "10px 18px" },
    { id: 3, kind: "css-toggle", target: { selector: "a.cta", rule }, property: "box-shadow", before: "0 1px 2px #0003", after: null },
    { id: 4, kind: "css-add", target: { selector: "a.cta" }, property: "color", before: null, after: "red" },
    { id: 5, kind: "css-value", target: { selector: "a.cta", rule }, property: "color", before: "blue", after: "red" },
    { id: 6, kind: "css-value", target: { selector: "a.cta", rule }, property: "color", before: "red", after: "blue" },
    { id: 7, kind: "css-value", target: { selector: "p.lead", rule: nested }, property: "margin", before: "0", after: "8px" },
  ];

  test("come to one change per property and place, from the first value to the last", () => {
    const groups = netChanges(edits);
    expect(groups.map((group) => group.changes.map((one) => [one.property, one.before, one.after]))).toEqual([
      [
        ["padding", "8px 14px", "10px 18px"],
        ["box-shadow", "0 1px 2px #0003", null],
      ],
      [["color", null, "red"]],
      [["margin", "0", "8px"]],
    ]);
    expect(changeCount(edits)).toBe(4);
  });

  test("copy as a plain diff, each rule with what it sits in", () => {
    expect(diffText(edits)).toBe(
      [
        ".cta { } in https://site.test/app.css",
        "- padding: 8px 14px;",
        "+ padding: 10px 18px;",
        "- box-shadow: 0 1px 2px #0003;",
        "",
        'style="" on a.cta',
        "+ color: red;",
        "",
        "@media (min-width: 640px) > .p > & { } in https://site.test/app.css",
        "- margin: 0;",
        "+ margin: 8px;",
      ].join("\n"),
    );
  });

  test("ask an agent to put them in the code", () => {
    expect(promptText(edits)).toBe(
      [
        "Apply these style changes in the source code:",
        "",
        "1. Element `a.cta`",
        "   Source: src/Hero.tsx:42",
        "   Rule: `.cta` in https://site.test/app.css",
        "   padding: 8px 14px -> 10px 18px",
        "   box-shadow: 0 1px 2px #0003 -> (removed)",
        "",
        "2. Element `a.cta`",
        "   In the element's inline style",
        "   color: (not set) -> red",
        "",
        "3. Element `p.lead`",
        "   Rule: `@media (min-width: 640px)` > `.p` > `&` in https://site.test/app.css",
        "   margin: 0 -> 8px",
        "",
        KEEP_APPROACH,
      ].join("\n"),
    );
    expect(promptText([])).toBe("");
  });
});
