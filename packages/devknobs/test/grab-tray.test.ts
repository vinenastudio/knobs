import { describe, expect, test } from "bun:test";
import { alignNotes, isTrayEvent, TRAY_CSS } from "../src/grab/tray";

describe("alignNotes", () => {
  test("keeps the notes of items that stay", () => {
    expect(alignNotes(["a", "b", "c"], null, 3)).toEqual(["a", "b", "c"]);
  });

  test("drops the removed note and moves the rest up", () => {
    expect(alignNotes(["a", "b", "c"], 1, 2)).toEqual(["a", "c"]);
    expect(alignNotes(["a", "b", "c"], 0, 2)).toEqual(["b", "c"]);
    expect(alignNotes(["a", "b", "c"], 2, 2)).toEqual(["a", "b"]);
  });

  test("gives new items empty notes", () => {
    expect(alignNotes(["a"], null, 3)).toEqual(["a", "", ""]);
    expect(alignNotes(["a", "b"], 0, 3)).toEqual(["b", "", ""]);
  });

  test("cuts notes when the list shrinks with nothing removed", () => {
    expect(alignNotes(["a", "b", "c"], null, 1)).toEqual(["a"]);
    expect(alignNotes([], null, 0)).toEqual([]);
  });

  test("ignores a removed index out of range", () => {
    expect(alignNotes(["a", "b"], 5, 2)).toEqual(["a", "b"]);
  });
});

describe("isTrayEvent", () => {
  test("is false with no tray", () => {
    const event = { composedPath: () => [] } as unknown as Event;
    expect(isTrayEvent(event)).toBe(false);
  });
});

describe("TRAY_CSS", () => {
  test("keeps the tray fixed, bounded and still with reduced motion", () => {
    expect(TRAY_CSS).toContain("position: fixed;");
    expect(TRAY_CSS).toContain("max-height: 40vh;");
    expect(TRAY_CSS).toContain("width: min(380px, calc(100vw - 32px));");
    expect(TRAY_CSS).toContain("env(safe-area-inset-bottom");
    expect(TRAY_CSS).toContain("prefers-reduced-motion: reduce");
  });
});
