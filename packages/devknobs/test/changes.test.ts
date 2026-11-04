import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { cssValue } from "../src/edit/css";
import { createEditLog, type EditLog } from "../src/edit/log";
import { diffText, promptText } from "../src/edit/text";
import type { Keeper, Restored } from "../src/edit/keep";
import { COPIED, createChanges, type Changes, keptLine, missedLine, NOT_COPIED, undoHint, WAIT_MAX, WAIT_NOTE, waitLine, waitValue } from "../src/ui/changes";
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

  test("change nothing once gone, for a copy that answers after", async () => {
    let answer: (went: boolean) => void = () => undefined;
    changes = createChanges(log, () => new Promise<boolean>((resolve) => (answer = resolve)), true);
    const node = fake(changes.node);
    edit("color", "blue");
    const prompt = control(node, "copy prompt for agent");
    prompt.fire("click");
    changes.destroy();
    changes = null;
    answer(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(prompt.textContent).toBe("copy prompt for agent");
    expect(jest.getTimerCount()).toBe(0);
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

describe("the line of edits kept after a reload", () => {
  test("says how many were made again and lists those that were not", () => {
    expect(keptLine(1, 0)).toBe("1 edit kept from before the reload");
    expect(keptLine(4, 1)).toBe("4 edits kept from before the reload, 1 could not be found");
    expect(missedLine({ edit: { kind: "text", target: { selector: "h1" }, property: "text", before: "a", after: "b" }, reason: "not found on the page" })).toBe("text on h1: not found on the page");
    expect(missedLine({ edit: { kind: "css-value", target: { selector: "a`b" }, property: "padding", before: "1px", after: "2px" }, reason: "x" })).toBe('padding on "a`b": x');
    expect(missedLine({ edit: "junk", reason: "not an edit devknobs reads" })).toBe("not an edit devknobs reads");
  });

  test("shows in the section with no change in force, and goes with the switch", () => {
    let restored: Restored | null = { kept: 0, missed: [{ edit: { kind: "move", target: { selector: "li" }, property: "node", before: "a", after: "b", from: { parent: "ul", next: null }, to: { parent: "ul", next: "li" } }, reason: "gone" }] };
    const listeners = new Set<() => void>();
    const keep: Keeper = {
      on: () => restored !== null,
      set: () => undefined,
      restored: () => restored,
      known: () => true,
      waiting: () => [],
      applyWaiting: () => undefined,
      kept: () => 0,
      cut: () => 0,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      stop: () => undefined,
    };
    changes = createChanges(log, () => true, true, keep);
    const node = fake(changes.node);
    expect(node.hidden).toBe(false);
    expect(node.all().filter((one) => one.className === "changes-kept-line").map((one) => one.textContent)).toEqual(["0 edits kept from before the reload, 1 could not be found"]);
    expect(node.all().filter((one) => one.className === "changes-missed").map((one) => one.textContent)).toEqual(["move on li: gone"]);
    restored = null;
    for (const listener of listeners) listener();
    expect(node.hidden).toBe(true);
  });
});

describe("kept html edits that wait", () => {
  test("are listed with an apply that only the user's own click on it makes", () => {
    const waiting = [
      { kind: "attr" as const, target: { selector: "h1" }, property: "title", before: null, after: "Hi" },
      { kind: "html" as const, target: { selector: "p" }, property: "html", before: "<p>a</p>", after: `<p>${"x".repeat(200)}</p>` },
      { kind: "hide" as const, target: { selector: "p" }, property: "hidden", before: null, after: "hidden" },
    ];
    let applied = 0;
    const keep: Keeper = {
      on: () => true,
      set: () => undefined,
      restored: () => ({ kept: 1, missed: [] }),
      known: () => true,
      waiting: () => waiting,
      applyWaiting: () => void applied++,
      kept: () => 0,
      cut: () => 0,
      subscribe: () => () => undefined,
      stop: () => undefined,
    };
    changes = createChanges(log, () => true, true, keep);
    const node = fake(changes.node);
    const head = node.all().find((one) => one.className.includes("changes-wait"));
    expect(head?.textContent).toBe("1 kept html edit and 1 kept attribute edit wait, with 1 edit after them: apply");
    expect(waitLine(0, 2, 0)).toBe("2 kept attribute edits wait");
    expect(waitLine(1, 0, 0)).toBe("1 kept html edit waits");
    expect(node.all().some((one) => one.textContent === WAIT_NOTE)).toBe(true);
    expect(node.all().filter((one) => one.className === "changes-missed").map((one) => one.textContent)).toEqual([
      'title on h1: title="Hi"',
      `html on p: <p>${"x".repeat(WAIT_MAX - 4)}… show all`,
      "hide on p: hidden",
    ]);
    expect(waitValue({ kind: "html", target: { selector: "p" }, property: "html", before: null, after: "<p>a\nb</p>" })).toBe('"<p>a\\nb</p>"');
    let apply = control(node, "apply");
    // A value cut short keeps apply off until it is shown whole.
    expect(Reflect.get(apply, "disabled")).toBe(true);
    apply.fire("click", { isTrusted: true, currentTarget: apply });
    expect(applied).toBe(0);
    control(node, "show all").fire("click");
    expect(node.all().filter((one) => one.className === "changes-missed")[1]?.textContent).toBe(`html on p: <p>${"x".repeat(200)}</p>`);
    apply = control(node, "apply");
    expect(Reflect.get(apply, "disabled")).toBe(false);
    apply.fire("click", { isTrusted: false, currentTarget: apply });
    expect(applied).toBe(0);
    apply.fire("click", { isTrusted: true, currentTarget: {} });
    expect(applied).toBe(0);
    apply.fire("click", { isTrusted: true, currentTarget: apply });
    expect(applied).toBe(1);
  });
});
