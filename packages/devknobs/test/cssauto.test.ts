import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { createEditLog, type EditLog } from "../src/edit/log";
import {
  autocomplete,
  browserCss,
  cssName,
  type CssWorld,
  customsIn,
  GLOBAL_KEYWORDS,
  listKey,
  matching,
  MOST,
  NAMED_COLORS,
  nameSuggestions,
  propertyNames,
  valueSuggestions,
  wordAt,
} from "../src/ui/cssauto";
import { createCssEditor } from "../src/ui/cssedit";
import { Block } from "./edit-block";
import { fake, FakeNode } from "./styles-dom";

/**
 * A browser's word on css, as far as the tests ask it: the properties it
 * knows, which keywords each takes, and which take a color or any word.
 */
const KNOWN: Record<string, (value: string) => boolean> = {
  display: (value) => ["block", "inline", "flex", "grid", "none", "contents"].includes(value),
  padding: (value) => /^\d/.test(value),
  "padding-top": (value) => /^\d/.test(value),
  margin: (value) => value === "auto" || /^\d/.test(value),
  color: (value) => NAMED_COLORS.includes(value),
  "font-family": () => true,
  "-webkit-mask": () => false,
};

function supports(property: string, value: string): boolean {
  const known = KNOWN[property];
  if (!known) return property.startsWith("--");
  return GLOBAL_KEYWORDS.includes(value) || value.startsWith("var(") || known(value);
}

function world(customs: string[] = ["--brand", "--gap"]): CssWorld {
  return { supports, properties: () => propertyNames(computed(), supports), customs: () => customs };
}

/** A computed style: its camel case keys, a method, and the longhands it lists by index. */
function computed(): object {
  const style = { length: 2, 0: "padding-top", 1: "--brand", display: "", fontFamily: "", webkitMask: "", getPropertyValue: () => "", cssText: "" };
  return Object.assign(Object.create({ marginTop: "", color: "", margin: "" }), style);
}

describe("the names a field suggests", () => {
  test("are the properties a style names that the browser takes, as css writes them, the prefixed last", () => {
    expect(cssName("fontFamily")).toBe("font-family");
    expect(cssName("webkitMask")).toBe("-webkit-mask");
    expect(cssName("padding-top")).toBe("padding-top");
    // `margin-top` is no property this browser knows, and `get-property-value` and `css-text` none at all.
    expect(propertyNames(computed(), supports)).toEqual(["color", "display", "font-family", "margin", "padding-top", "-webkit-mask"]);
  });

  test("end with the page's custom properties", () => {
    expect(nameSuggestions(world()).slice(-2)).toEqual(["--brand", "--gap"]);
  });

  test("read the custom properties of the rules, nested ones too, and leave a sheet that cannot be read", () => {
    const style = (...names: string[]) => Object.assign([...names], { length: names.length });
    const sheets = [
      { cssRules: [{ style: style("--brand", "color") }, { cssRules: [{ style: style("--gap") }] }] },
      {
        get cssRules(): never {
          throw new Error("SecurityError");
        },
      },
    ];
    expect(customsIn(sheets, ["--seen", "color"])).toEqual(["--seen", "--brand", "--gap"]);
  });

  test("are none where the element's window cannot be asked", () => {
    const lonely = browserCss({ ownerDocument: { defaultView: null } } as unknown as Element);
    expect([lonely.properties(), lonely.customs(), lonely.supports("color", "red")]).toEqual([[], [], false]);
  });
});

describe("the values a field suggests", () => {
  test("are the keywords the browser takes for the property, then var() of the custom properties, then the global ones", () => {
    expect(valueSuggestions("display", world())).toEqual(["block", "contents", "flex", "grid", "inline", "none", "var(--brand)", "var(--gap)", ...GLOBAL_KEYWORDS]);
    expect(valueSuggestions("margin", world())).toContain("auto");
    expect(valueSuggestions("padding", world())).not.toContain("auto");
  });

  test("hold the named colors where the property takes a color", () => {
    const colors = valueSuggestions("color", world());
    expect(colors).toContain("rebeccapurple");
    expect(colors).toContain("currentcolor");
    expect(valueSuggestions("display", world())).not.toContain("red");
  });

  test("for a property that takes any word, are its own words and no colors", () => {
    const families = valueSuggestions("font-family", world([]));
    expect(families.slice(0, 3)).toEqual(["system-ui", "sans-serif", "serif"]);
    expect(families).not.toContain("red");
  });

  test("for a custom property are var() of the others and the global keywords, and none for a property the browser does not know", () => {
    expect(valueSuggestions("--accent", world())).toEqual(["var(--brand)", "var(--gap)", ...GLOBAL_KEYWORDS]);
    expect(valueSuggestions("colour", world())).toEqual([]);
  });
});

describe("the suggestions for what was typed", () => {
  test("are those that start with it first, then those that hold it, case aside", () => {
    expect(matching(["padding", "scroll-padding", "padding-top", "margin"], "PAD")).toEqual(["padding", "padding-top", "scroll-padding"]);
    expect(matching(["a", "b"], "")).toEqual(["a", "b"]);
    expect(matching(Array.from({ length: 80 }, (_, at) => `p${at}`), "p")).toHaveLength(MOST);
    expect(matching(Array.from({ length: 80 }, (_, at) => `p${at}`), "")).toHaveLength(80);
  });

  test("of a value, are for the word the caret is in", () => {
    expect(wordAt("1px so", 6)).toEqual({ start: 4, end: 6, word: "so" });
    expect(wordAt("var(--br)", 8)).toEqual({ start: 4, end: 8, word: "--br" });
    expect(wordAt("a, bl", 5)).toEqual({ start: 3, end: 5, word: "bl" });
  });
});

describe("the keys of the list", () => {
  const press = (key: string, shiftKey = false) => ({ key, shiftKey, metaKey: false, ctrlKey: false, altKey: false });

  test("↓ and ↑ mark one, round the ends, from none marked", () => {
    expect(listKey(press("ArrowDown"), true, 3, -1)).toEqual({ act: "move", to: 0 });
    expect(listKey(press("ArrowDown"), true, 3, 2)).toEqual({ act: "move", to: 0 });
    expect(listKey(press("ArrowUp"), true, 3, -1)).toEqual({ act: "move", to: 2 });
    expect(listKey(press("ArrowUp"), true, 3, 1)).toEqual({ act: "move", to: 0 });
  });

  test("↩ takes the one marked, and with none marked is the field's; Tab takes one; ⇧Tab and esc close it", () => {
    expect(listKey(press("Enter"), true, 3, 1)).toEqual({ act: "take" });
    expect(listKey(press("Enter"), true, 3, -1)).toEqual({ act: "take" });
    expect(listKey(press("Tab"), true, 3, -1)).toEqual({ act: "take" });
    expect(listKey(press("Tab", true), true, 3, 0)).toEqual({ act: "close" });
    expect(listKey(press("Escape"), true, 3, 0)).toEqual({ act: "close" });
  });

  test("with the list closed, only ↓ is its own, to open it", () => {
    expect(listKey(press("ArrowDown"), false, 0, -1)).toEqual({ act: "move", to: -1 });
    for (const key of ["Enter", "Tab", "Escape", "ArrowUp"]) expect(listKey(press(key), false, 0, -1)).toBeNull();
    expect(listKey({ ...press("ArrowDown"), metaKey: true }, true, 3, 0)).toBeNull();
  });
});

describe("the list under a field", () => {
  const GLOBALS = ["document", "window"] as const;
  const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (tag: string) => new FakeNode(tag) } });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), { setTimeout: (run: () => void, delay: number) => setTimeout(run, delay) }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    GLOBALS.forEach((name, index) => {
      const descriptor = saved[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  });

  /** A field in a row, as the editor puts one. */
  function field(): { row: FakeNode; input: FakeNode } {
    const row = new FakeNode("div");
    row.root = true;
    const input = new FakeNode("input");
    row.append(input);
    return { row, input };
  }

  const typed = (input: FakeNode, text: string) => {
    input.value = text;
    Reflect.set(input, "selectionStart", text.length);
    input.fire("input");
  };
  const options = (row: FakeNode) => row.find("ac-item").map((one) => one.textContent);
  const key = (input: FakeNode, auto: ReturnType<typeof autocomplete>, name: string, shiftKey = false) => {
    const event = input.fire("keydown", { key: name, shiftKey });
    return { mine: auto.key(event as unknown as KeyboardEvent), prevented: event.prevented };
  };

  test("opens as the field is typed in, filtered, as a listbox the field points at", () => {
    const { row, input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["padding", "padding-top", "margin"], "name");
    expect(input.getAttribute("role")).toBe("combobox");
    typed(input, "pad");
    expect(options(row)).toEqual(["padding", "padding-top"]);
    const [list] = row.find("ac-list");
    expect(list?.getAttribute("role")).toBe("listbox");
    expect(input.getAttribute("aria-controls")).toBe(Reflect.get(list ?? {}, "id"));
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(row.find("ac-item").map((one) => one.getAttribute("role"))).toEqual(["option", "option"]);
    expect(auto.open()).toBe(true);
    // Nothing left to suggest: the list goes.
    typed(input, "padding-top");
    expect(row.find("ac-list")).toEqual([]);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  test("↓ ↑ mark one, ↩ takes it and is then the field's, and esc closes the list as the field's own", () => {
    const { row, input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["block", "inline-block", "flex"], "value");
    typed(input, "bl");
    expect(key(input, auto, "ArrowDown")).toEqual({ mine: true, prevented: true });
    expect(input.getAttribute("aria-activedescendant")).toBe(Reflect.get(row.find("ac-item")[0] ?? {}, "id"));
    expect(row.find("ac-item").map((one) => one.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    key(input, auto, "ArrowDown");
    key(input, auto, "ArrowUp");
    expect(key(input, auto, "Enter")).toEqual({ mine: false, prevented: false });
    expect(input.value).toBe("block");
    expect(auto.open()).toBe(false);
    typed(input, "fl");
    expect(key(input, auto, "Escape")).toEqual({ mine: true, prevented: true });
    expect(auto.open()).toBe(false);
    expect(input.value).toBe("fl");
    // A second escape is the field's, which leaves the edit.
    expect(key(input, auto, "Escape").mine).toBe(false);
  });

  test("↩ with none marked takes the first, as Tab does, and a list with no match leaves what was typed", () => {
    const { input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["solid", "dashed"], "value");
    typed(input, "1px so");
    expect(key(input, auto, "Enter").mine).toBe(false);
    expect(input.value).toBe("1px solid");
    typed(input, "1px zz");
    expect(key(input, auto, "Enter").mine).toBe(false);
    expect(input.value).toBe("1px zz");
  });

  test("↩ and Tab with none marked keep a number or an ended word as typed, and still finish a word", () => {
    const { row, input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["auto", "none", "100%", "block"], "value");
    typed(input, "1");
    expect(options(row)).toEqual(["100%"]);
    expect(key(input, auto, "Enter").mine).toBe(false);
    expect(input.value).toBe("1");
    expect(auto.open()).toBe(false);
    typed(input, "1");
    key(input, auto, "Tab");
    expect(input.value).toBe("1");
    typed(input, "1px ");
    expect(auto.open()).toBe(true);
    key(input, auto, "Enter");
    expect(input.value).toBe("1px ");
    typed(input, "bl");
    key(input, auto, "Enter");
    expect(input.value).toBe("block");
  });

  test("a var() taken keeps one var( and one )", () => {
    const { input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["var(--brand)", "var(--gap)"], "value");
    typed(input, "var(--b");
    key(input, auto, "Enter");
    expect(input.value).toBe("var(--brand)");
    input.value = "var(--br)";
    Reflect.set(input, "selectionStart", "var(--br".length);
    input.fire("input");
    key(input, auto, "Enter");
    expect(input.value).toBe("var(--brand)");
    typed(input, "1px var(--g");
    key(input, auto, "Tab");
    expect(input.value).toBe("1px var(--gap)");
  });

  test("Tab takes the first, and a value keeps the words around its own", () => {
    const { input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["solid", "dashed"], "value");
    typed(input, "1px so");
    key(input, auto, "Tab");
    expect(input.value).toBe("1px solid");
  });

  test("an empty field shows the whole list as it gets the focus, a filled one does not, and blur closes it", () => {
    const { row, input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["padding", "margin"], "name");
    input.fire("focus");
    expect(options(row)).toEqual(["padding", "margin"]);
    input.fire("blur");
    expect(auto.open()).toBe(false);
    input.value = "pad";
    input.fire("focus");
    expect(auto.open()).toBe(false);
  });

  test("a field with nothing to suggest shows nothing as it gets the focus", () => {
    const { row, input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => [], "value");
    input.fire("focus");
    expect(auto.open()).toBe(false);
    expect(row.find("ac-list")).toEqual([]);
  });

  test("↩ in an empty field takes from the list only once it was moved in, and typing still filters", () => {
    const { row, input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["padding", "margin"], "name");
    input.fire("focus");
    expect(auto.open()).toBe(true);
    expect(key(input, auto, "Enter").mine).toBe(false);
    expect(input.value).toBe("");
    input.fire("focus");
    key(input, auto, "ArrowDown");
    key(input, auto, "ArrowDown");
    key(input, auto, "Enter");
    expect(input.value).toBe("margin");
    input.value = "";
    input.fire("focus");
    typed(input, "ma");
    expect(options(row)).toEqual(["margin"]);
    key(input, auto, "Tab");
    expect(input.value).toBe("margin");
  });

  test("a click on one takes it, and the escape the panel heard first closes the list alone", () => {
    const { row, input } = field();
    const auto = autocomplete(input as unknown as HTMLInputElement, () => ["red", "rebeccapurple"], "value");
    typed(input, "re");
    const [list] = row.find("ac-list");
    // A press on the list, its scrollbar too, leaves the focus in the field.
    expect(list?.fire("mousedown", { target: list }).prevented).toBe(true);
    list?.fire("click", { target: list });
    expect(auto.open()).toBe(true);
    list?.fire("click", { target: row.find("ac-item")[1] });
    expect(input.value).toBe("rebeccapurple");
    expect(input.focused).toBe(true);
    typed(input, "re");
    expect(auto.dismiss()).toBe(true);
    expect(auto.dismiss()).toBe(false);
    // The same escape reaches the field after the panel: the field leaves it alone.
    expect(key(input, auto, "Escape").mine).toBe(true);
    expect(key(input, auto, "Escape").mine).toBe(false);
  });
});

describe("the editor's fields with their suggestions", () => {
  let log: EditLog;
  const GLOBALS = ["document", "window", "CSS"] as const;
  const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));

  beforeEach(() => {
    jest.useFakeTimers();
    log = createEditLog();
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (tag: string) => new FakeNode(tag) } });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), { setTimeout: (run: () => void, delay: number) => setTimeout(run, delay) }),
    });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: { supports } });
  });

  afterEach(() => {
    jest.useRealTimers();
    GLOBALS.forEach((name, index) => {
      const descriptor = saved[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  });

  test("Tab in the name takes the one marked and goes on to the value, whose list follows the name", () => {
    const element = {
      tagName: "DIV",
      getAttribute: () => null,
      ownerDocument: {
        documentElement: {},
        styleSheets: [{ cssRules: [{ style: Object.assign(["--brand"], { length: 1 }) }] }],
        defaultView: { CSS: { supports }, getComputedStyle: () => computed() },
      },
    } as unknown as Element;
    const node = new FakeNode("div");
    node.root = true;
    const style = new Block("color: red;") as Block & CSSStyleDeclaration;
    const editor = createCssEditor({ log, node: node as unknown as HTMLElement, locate: async () => null, settled: () => undefined });
    node.append(fake(editor.addLine({ style, element })));
    node.find("css-add")[0]?.fire("click");
    const [name, value] = node.find("css-edit");
    if (!name || !value) throw new Error("no fields");
    name.value = "disp";
    name.fire("input");
    expect(node.find("ac-item").map((one) => one.textContent)).toEqual(["display"]);
    name.fire("keydown", { key: "ArrowDown" });
    name.fire("keydown", { key: "Tab" });
    expect(name.value).toBe("display");
    expect(value.focused).toBe(true);
    value.fire("focus");
    value.value = "fl";
    Reflect.set(value, "selectionStart", 2);
    value.fire("input");
    expect(node.find("ac-item").map((one) => one.textContent)).toEqual(["flex"]);
    value.fire("keydown", { key: "ArrowDown" });
    value.fire("keydown", { key: "Enter" });
    expect(log.list()).toMatchObject([{ kind: "css-add", property: "display", after: "flex" }]);
    expect(node.find("ac-list")).toEqual([]);
    editor.destroy();
  });
});
