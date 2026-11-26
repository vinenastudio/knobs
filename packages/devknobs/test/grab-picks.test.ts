import { describe, expect, test } from "bun:test";
import { joinEntries } from "../src/grab/context";
import { copiedText, flushPicks, formatPicks, picksPayload } from "../src/grab/picks";
import type { GrabEntry } from "../src/grab/types";

function entry(content: string): GrabEntry {
  return {
    tagName: "button",
    componentName: "Save",
    content,
    selector: "button",
    source: null,
    stackContext: "",
    frames: [],
  };
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
    expect(formatPicks([entry(SAVE)], " \n ")).toBe(SAVE);
  });

  test("more than one element are numbered", () => {
    expect(formatPicks([entry(SAVE), entry(LINK)])).toBe(`1. ${SAVE}\n2. ${LINK}`);
  });

  test("the note goes last, after a blank line, trimmed", () => {
    expect(formatPicks([entry(SAVE), entry(LINK)], " same spacing for all of these ")).toBe(
      `1. ${SAVE}\n2. ${LINK}\n\nNote: same spacing for all of these`,
    );
  });

  test("one element with a note is numbered too", () => {
    expect(formatPicks([entry(SAVE)], "bigger")).toBe(`1. ${SAVE}\n\nNote: bigger`);
  });

  test("later lines of the note stay as typed", () => {
    expect(formatPicks([entry(SAVE), entry(LINK)], "first\n  second")).toBe(
      `1. ${SAVE}\n2. ${LINK}\n\nNote: first\n  second`,
    );
  });

  test("a whitespace note is left out", () => {
    expect(formatPicks([entry(SAVE), entry(LINK)], "\t ")).toBe(`1. ${SAVE}\n2. ${LINK}`);
  });
});

describe("picksPayload", () => {
  test("puts the trimmed note on the payload, and the entries as they are", () => {
    const payload = picksPayload([entry(SAVE), entry(LINK)], " all of these ");
    expect(payload.entries).toEqual([entry(SAVE), entry(LINK)]);
    expect(payload.note).toBe("all of these");
    expect(payload.content).toBe(`1. ${SAVE}\n2. ${LINK}\n\nNote: all of these`);
  });

  test("with no note it is the plain payload", () => {
    const payload = picksPayload([entry(SAVE)]);
    expect(payload).toEqual({ content: SAVE, entries: [entry(SAVE)] });
    expect("note" in payload).toBe(false);
  });
});
