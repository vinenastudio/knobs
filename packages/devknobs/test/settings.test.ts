import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Keeper } from "../src/edit/keep";
import { KEEP_HINT, KEEP_LABEL, keepRow } from "../src/ui/settings";
import { fake, FakeNode } from "./styles-dom";

describe("the keep edits row", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");

  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tag: string) => new FakeNode(tag),
        createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      },
    });
  });

  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "document", saved);
    else Reflect.deleteProperty(globalThis, "document");
  });

  /** A keeper the test turns, and what the row asked of it. */
  function stubKeeper(): { keep: Keeper; turned: boolean[]; listeners: Set<() => void>; state: { on: boolean; known: boolean } } {
    const state = { on: false, known: false };
    const turned: boolean[] = [];
    const listeners = new Set<() => void>();
    const keep: Keeper = {
      on: () => state.on,
      set: (next) => void turned.push(next),
      restored: () => null,
      known: () => state.known,
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
    return { keep, turned, listeners, state };
  }

  const control = (node: HTMLElement): FakeNode | undefined => fake(node).all().find((one) => one.getAttribute("role") === "switch");

  test("is hidden without a keeper, and shows once one starts and the settings open", () => {
    let keep: Keeper | null = null;
    const row = keepRow(() => keep);
    expect(row.node.hidden).toBe(true);
    keep = stubKeeper().keep;
    row.sync();
    expect(row.node.hidden).toBe(false);
    expect(fake(row.node).textContent).toBe(KEEP_LABEL + KEEP_HINT);
  });

  test("shows the keeper's switch, off to a click until it knows, and turns it on a click", () => {
    const { keep, turned, listeners, state } = stubKeeper();
    const row = keepRow(() => keep);
    const on = control(row.node);
    expect(on?.getAttribute("aria-checked")).toBe("false");
    expect(on && Reflect.get(on, "disabled")).toBe(true);
    state.known = true;
    for (const listener of listeners) listener();
    expect(on && Reflect.get(on, "disabled")).toBe(false);
    on?.fire("click");
    expect(turned).toEqual([true]);
    state.on = true;
    for (const listener of listeners) listener();
    expect(on?.getAttribute("aria-checked")).toBe("true");
    on?.fire("click");
    expect(turned).toEqual([true, false]);
    row.destroy();
    expect(listeners.size).toBe(0);
  });
});
