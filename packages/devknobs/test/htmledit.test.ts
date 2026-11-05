import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { htmlEditor, htmlTokens, INDENT, tokenLines, typedKey } from "../src/ui/htmledit";
import { FakeNode } from "./styles-dom";

describe("the html editor's colors", () => {
  test("cut a tag into its name, attributes, values and marks, with the text between", () => {
    expect(htmlTokens('<a class="cta" href=x>Go</a>')).toEqual([
      { kind: "tag", text: "<a" },
      { kind: "text", text: " " },
      { kind: "attr", text: "class" },
      { kind: "text", text: "=" },
      { kind: "val", text: '"cta"' },
      { kind: "text", text: " " },
      { kind: "attr", text: "href" },
      { kind: "text", text: "=" },
      { kind: "val", text: "x" },
      { kind: "tag", text: ">" },
      { kind: "text", text: "Go" },
      { kind: "tag", text: "</a>" },
    ]);
  });

  test("color comments, doctypes and self-closing marks, and a half-typed tag to its end", () => {
    expect(htmlTokens("<!-- hi --><!doctype html><br/>")).toEqual([
      { kind: "com", text: "<!-- hi -->" },
      { kind: "doc", text: "<!doctype html>" },
      { kind: "tag", text: "<br/>" },
    ]);
    expect(htmlTokens('<div title="op')).toEqual([
      { kind: "tag", text: "<div" },
      { kind: "text", text: " " },
      { kind: "attr", text: "title" },
      { kind: "text", text: "=" },
      { kind: "val", text: '"op' },
    ]);
    expect(htmlTokens("a < b <!-- open")).toEqual([
      { kind: "text", text: "a < b " },
      { kind: "com", text: "<!-- open" },
    ]);
  });

  test("give back the whole text, whatever it holds", () => {
    for (const text of ["", "<", "<<a>", '<a b="c\'>', "<a =>", "</>", "<a/ b>x"]) {
      expect(htmlTokens(text).map((token) => token.text).join("")).toBe(text);
    }
  });
});

describe("what the html editor types", () => {
  /** A key typed where `|` stands, as the text and caret come out. */
  function type(marked: string, key: string): string | null {
    const at = marked.indexOf("|");
    const text = marked.replace("|", "");
    const typed = typedKey(text, at, at, key);
    if (!typed) return null;
    // Nothing typed: the caret steps over what is there.
    if (typed.insert === "") return `${text.slice(0, at + typed.caret)}|${text.slice(at + typed.caret)}`;
    return `${text.slice(0, at)}${typed.insert.slice(0, typed.caret)}|${typed.insert.slice(typed.caret)}${text.slice(at)}`;
  }

  test("↩ keeps the line's indent, and goes one in after an opening tag", () => {
    expect(type("  <p>a|", "Enter")).toBe("  <p>a\n  |");
    expect(type("<ul>|", "Enter")).toBe(`<ul>\n${INDENT}|`);
    expect(type('  <a href="x">|', "Enter")).toBe(`  <a href="x">\n  ${INDENT}|`);
  });

  test("↩ between a tag and its end puts the end on a line of its own", () => {
    expect(type("  <div>|</div>", "Enter")).toBe(`  <div>\n  ${INDENT}|\n  </div>`);
  });

  test("↩ after a void or self-closed tag, or an end tag, does not go in", () => {
    expect(type("  <br>|", "Enter")).toBe("  <br>\n  |");
    expect(type("<x-icon />|", "Enter")).toBe("<x-icon />\n|");
    expect(type("<p></p>|", "Enter")).toBe("<p></p>\n|");
  });

  test("> closes the tag it ends, but a void one, a self-closed one, or one in a quote", () => {
    expect(type("<div|", ">")).toBe("<div>|</div>");
    expect(type('<a href="x"|', ">")).toBe('<a href="x">|</a>');
    expect(type("<img|", ">")).toBe(null);
    expect(type("<x-y /|", ">")).toBe(null);
    expect(type('<a title="1 |', ">")).toBe(null);
    expect(type("a |", ">")).toBe(null);
  });

  test("a quote after = in a tag pairs, and the closing one is stepped over", () => {
    expect(type("<a href=|", '"')).toBe('<a href="|"');
    expect(type("<a href=|", "'")).toBe("<a href='|'");
    expect(type('<a href="x|"', '"')).toBe('<a href="x"|');
    expect(type("<p>it|", "'")).toBe(null);
  });

  test("a key over a selection, but ↩, is the browser's", () => {
    expect(typedKey("<div", 1, 3, ">")).toBeNull();
    expect(typedKey("<p>ab", 3, 5, "Enter")).toEqual({ insert: `\n${INDENT}`, caret: 3 });
  });

  test("cuts the colors by line, a token that spans lines in pieces, an empty line empty", () => {
    expect(tokenLines("<!-- a\nb --><p>\n")).toEqual([
      [{ kind: "com", text: "<!-- a" }],
      [
        { kind: "com", text: "b -->" },
        { kind: "tag", text: "<p>" },
      ],
      [],
    ]);
    expect(tokenLines("")).toEqual([[]]);
  });
});

describe("the html editor", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");

  beforeEach(() => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (tag: string) => new FakeNode(tag) } });
  });

  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "document", saved);
    else Reflect.deleteProperty(globalThis, "document");
  });

  test("colors the text under the field, numbers its lines, and keeps both in step as it is typed in", () => {
    const editor = htmlEditor('<p class="a">x</p>', "edit as html");
    const frame = editor.frame as unknown as FakeNode;
    const area = editor.area as unknown as FakeNode;
    expect(area.className).toContain("dom-html");
    expect(frame.find("html-ed-hl")[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(frame.find("tok-attr").map((one) => one.textContent)).toEqual(["class"]);
    expect(frame.find("html-ed-num").map((one) => one.textContent)).toEqual(["1"]);
    area.value = "<p>\n  x\n</p>";
    area.fire("input");
    expect(frame.find("html-ed-num").map((one) => one.textContent)).toEqual(["1", "2", "3"]);
    expect(frame.find("html-ed-text").map((one) => one.textContent)).toEqual(["<p>", "  x", "</p>"]);
    expect(frame.find("tok-tag").map((one) => one.textContent)).toEqual(["<p>", "</p>"]);
  });

  test("wraps a long line in the text and its colors alike, its number at its first row", () => {
    const editor = htmlEditor(`<a href="https://example.com/${"x".repeat(400)}">go</a>\n<p></p>`, "edit as html");
    const frame = editor.frame as unknown as FakeNode;
    const area = editor.area as unknown as FakeNode;
    // The browser's own wrap, never off: a line wider than the box goes on under itself.
    expect(area.getAttribute("wrap")).toBeNull();
    const inner = frame.find("html-ed-inner")[0] as FakeNode;
    // A number and its line in one grid row, so the row is as tall as the line wraps to.
    expect(inner.childNodes.map((one) => one.className)).toEqual(["html-ed-num", "html-ed-text", "html-ed-num", "html-ed-text"]);
    // The text box starts its lines past the gutter, as the colored text does.
    expect(inner.style.gridTemplateColumns).toBe("calc(1ch + 2 * var(--col-pad)) minmax(0, 1fr)");
    expect(area.style.paddingLeft).toBe("calc(calc(1ch + 2 * var(--col-pad)) + var(--col-pad))");
  });

  test("starts at the size kept, and the expand button makes it the panel's and keeps that", () => {
    const kept: { height: number; full: boolean }[] = [];
    const editor = htmlEditor("<p></p>", "edit as html", { get: () => ({ height: 320, full: false }), set: (size) => void kept.push(size) });
    const frame = editor.frame as unknown as FakeNode;
    editor.shown();
    expect(frame.find("html-ed-body")[0]?.style.height).toBe("320px");
    const expand = frame.find("html-ed-expand")[0];
    expect([expand?.textContent, expand?.getAttribute("aria-pressed")]).toEqual(["expand", "false"]);
    expand?.fire("click");
    expect(kept).toEqual([{ height: 320, full: true }]);
    expect([expand?.textContent, expand?.getAttribute("aria-pressed")]).toEqual(["shrink", "true"]);
    expand?.fire("click");
    expect(kept.at(-1)).toEqual({ height: 320, full: false });
  });
});
