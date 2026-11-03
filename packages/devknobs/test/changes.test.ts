import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { cssValue } from "../src/edit/css";
import { createEditLog, type EditLog } from "../src/edit/log";
import { diffText, promptText } from "../src/edit/text";
import { COPIED, createChanges, type Changes, NOT_COPIED, undoHint } from "../src/ui/changes";
import { Block, fakeCss } from "./edit-block";
import { FakeNode, fake } from "./styles-dom";

let log: EditLog;
let copied: string[];
let changes: Changes | null = null;
let style: Block & CSSStyleDeclaration;
/** Whether the clipboard takes the copy. */
let clipboard = true;

function edit(property: string, value: string): void {
  const change = cssValue("css-value", { style, element: {} as Element, selector: "a.cta" }, property, value);
  if (change) log.record(change);
}

function start(mac = true): FakeNode {
  changes = createChanges(log, (text) => copied.push(text) > 0 && clipboard, mac);
  return fake(changes.node);
}

/** A button of the section, by its words. */
function control(node: FakeNode, text: string): FakeNode {
  const found = node.all().find((one) => one.tag === "button" && one.textContent === text);
  if (!found) throw new Error(`no ${text}`);
  return found;
}

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: fakeCss });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: (tag: string) => new FakeNode(tag) },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), { setTimeout: (run: () => void, delay: number) => setTimeout(run, delay) }),
  });
  log = createEditLog();
  copied = [];
  clipboard = true;
  style = new Block("color: red; margin: 0;") as Block & CSSStyleDeclaration;
});

afterEach(() => {
  changes?.destroy();
  changes = null;
  jest.useRealTimers();
  for (const name of ["CSS", "document", "window"]) Reflect.deleteProperty(globalThis, name);
});

describe("the changes", () => {
  test("hide while there is none, and count them once there are", () => {
    const node = start();
    expect(node.hidden).toBe(true);
    edit("color", "blue");
    edit("margin", "4px");
    expect(node.hidden).toBe(false);
    expect(node.find("changes-head")[0]?.textContent).toBe("changes (2) · undo Z, redo ⇧Z");
    expect(node.find("diff-place").map((one) => one.textContent)).toEqual(['style="" on a.cta']);
    expect([...node.find("diff-del"), ...node.find("diff-add")].map((one) => one.textContent)).toEqual([
      "- color: red;",
      "- margin: 0;",
      "+ color: blue;",
      "+ margin: 4px;",
    ]);
  });

  test("name the keys as the footer does off a Mac", () => {
    expect(undoHint(false)).toBe("undo Z, redo Shift Z");
    expect(undoHint(true)).toBe("undo Z, redo ⇧Z");
  });

  test("copy the prompt and the diff, and say so for a moment once it went", async () => {
    const node = start();
    edit("color", "blue");
    const prompt = control(node, "copy prompt for agent");
    prompt.fire("click");
    await Promise.resolve();
    expect(copied).toEqual([promptText(log.list())]);
    expect(prompt.textContent).toBe(COPIED);
    jest.advanceTimersByTime(1200);
    expect(prompt.textContent).toBe("copy prompt for agent");
    control(node, "copy diff").fire("click");
    expect(copied[1]).toBe(diffText(log.list()));
  });

  test("say so when the clipboard did not take it", async () => {
    clipboard = false;
    const node = start();
    edit("color", "blue");
    const prompt = control(node, "copy prompt for agent");
    prompt.fire("click");
    await Promise.resolve();
    expect(prompt.textContent).toBe(NOT_COPIED);
  });

  test("undo all takes every edit back, and the section goes", () => {
    const node = start();
    edit("color", "blue");
    edit("margin", "4px");
    control(node, "undo all").fire("click");
    expect(log.list()).toEqual([]);
    expect(style.cssText).toBe("color: red; margin: 0;");
    expect(node.hidden).toBe(true);
  });
});
