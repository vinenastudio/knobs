import { describe, expect, test } from "bun:test";
import { joinEntries } from "../src/grab/context";
import { copiedText, flushPicks, formatPicks, picksPayload } from "../src/grab/picks";
import type { GrabEntry } from "../src/grab/types";

function entry(content: string, note?: string): GrabEntry {
  const base: GrabEntry = {
    tagName: "button",
    componentName: "Save",
    content,
    selector: "button",
    source: null,
    stackContext: "",
    frames: [],
  };
  return note === undefined ? base : { ...base, note };
}

const SAVE = '[<button class="save"> in Save (at src/App.tsx:5:5) selector: button.save]';
const LINK = "[<a href=\"/docs\"> in Nav (at src/Nav.tsx:9:3)]";

describe("picks", () => {
  test("a plain click copies the gathered ones and itself, once", () => {
    expect(flushPicks(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(flushPicks(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(flushPicks(["a"], null)).toEqual(["a"]);
    expect(flushPicks([], "c")).toEqual(["c"]);
    expect(flushPicks<string>([], null)).toEqual([]);
  });

  test("the toast counts more than one", () => {
    expect(copiedText(1)).toBe("Copied");
    expect(copiedText(3)).toBe("Copied 3");
  });
});

describe("formatPicks", () => {
  test("one element with no note is its line alone, as before", () => {
    expect(formatPicks([entry(SAVE)])).toBe(SAVE);
    expect(formatPicks([entry(SAVE)])).toBe(joinEntries([entry(SAVE)]));
    expect(formatPicks([entry(SAVE, "  ")], " \n ")).toBe(SAVE);
  });

  test("more than one element are numbered", () => {
    expect(formatPicks([entry(SAVE), entry(LINK)])).toBe(`1. ${SAVE}\n2. ${LINK}`);
  });

  test("a note goes on the next line, indented, and the note for all goes last", () => {
    expect(
      formatPicks([entry(SAVE, " make it blue "), entry(LINK)], "same spacing for all of these"),
    ).toBe(
      `1. ${SAVE}\n   Note: make it blue\n2. ${LINK}\n\nNote: same spacing for all of these`,
    );
  });

  test("one element with a note is numbered too", () => {
    expect(formatPicks([entry(SAVE, "bigger")])).toBe(`1. ${SAVE}\n   Note: bigger`);
    expect(formatPicks([entry(SAVE)], "bigger")).toBe(`1. ${SAVE}\n\nNote: bigger`);
  });

  test("later lines of an element note get the same indent, the note for all stays as typed", () => {
    expect(formatPicks([entry(SAVE, "one\ntwo"), entry(LINK)], "first\n  second")).toBe(
      `1. ${SAVE}\n   Note: one\n   two\n2. ${LINK}\n\nNote: first\n  second`,
    );
  });

  test("whitespace notes are left out", () => {
    expect(formatPicks([entry(SAVE, "  "), entry(LINK, "\n")], "\t ")).toBe(
      `1. ${SAVE}\n2. ${LINK}`,
    );
  });
});

describe("picksPayload", () => {
  test("puts trimmed notes on the entries and the payload, and drops empty ones", () => {
    const payload = picksPayload(
      [entry(SAVE, "old"), entry(LINK)],
      [" make it blue ", "   "],
      " all of these ",
    );
    expect(payload.entries[0]?.note).toBe("make it blue");
    expect("note" in (payload.entries[1] ?? {})).toBe(false);
    expect(payload.note).toBe("all of these");
    expect(payload.content).toBe(`1. ${SAVE}\n   Note: make it blue\n2. ${LINK}\n\nNote: all of these`);
  });

  test("with no notes it is the plain payload", () => {
    const payload = picksPayload([entry(SAVE)]);
    expect(payload).toEqual({ content: SAVE, entries: [entry(SAVE)] });
    expect("note" in payload).toBe(false);
  });
});
