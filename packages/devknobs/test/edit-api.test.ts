import { afterEach, describe, expect, test } from "bun:test";
import { REASONS } from "../src/edit/keep";
import { edits as log } from "../src/edit/log";
import { setEdits, undoEdit } from "../src/index";
import { as, elem, page, text } from "./dom-page";

const saved = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  log.undoAll();
  if (saved) Object.defineProperty(globalThis, "document", saved);
  else Reflect.deleteProperty(globalThis, "document");
});

describe("the agent api for edits", () => {
  test("setEdits makes edits in edits()'s shape through the page's log, and says which it skipped and why", async () => {
    const title = elem("h1", { "data-h1": "" }, text("Ship"));
    const doc = page(() => [elem("body", {}, title)]);
    Object.defineProperty(globalThis, "document", { configurable: true, value: as(doc) });
    const result = await setEdits([
      { id: 7, kind: "attr", target: { selector: "[data-h1]" }, property: "title", before: null, after: "Hi" },
      { kind: "text", target: { selector: "[data-h1]" }, property: "text", before: "Other", after: "Go" },
      { kind: "attr", target: { selector: "[data-gone]" }, property: "title", before: null, after: "x" },
      "nope",
    ]);
    expect(result.applied.map((one) => [one.kind, one.after])).toEqual([["attr", "Hi"]]);
    expect(result.skipped.map((one) => one.reason)).toEqual([REASONS.changed, REASONS.missing, REASONS.invalid]);
    expect(title.getAttribute("title")).toBe("Hi");
    expect(log.list()).toHaveLength(1);
  });

  test("setEdits takes a list only", async () => {
    // @ts-expect-error: what an agent may pass all the same.
    await expect(setEdits("[]")).rejects.toThrow(TypeError);
  });

  test("undoEdit undoes the last edit in force and returns it, null with none", async () => {
    expect(undoEdit()).toBeNull();
    const title = elem("h1", { "data-h1": "" }, text("Ship"));
    const doc = page(() => [elem("body", {}, title)]);
    Object.defineProperty(globalThis, "document", { configurable: true, value: as(doc) });
    await setEdits([{ kind: "attr", target: { selector: "[data-h1]" }, property: "title", before: null, after: "Hi" }]);
    expect(undoEdit()?.after).toBe("Hi");
    expect(title.getAttribute("title")).toBeNull();
    expect(undoEdit()).toBeNull();
  });
});
