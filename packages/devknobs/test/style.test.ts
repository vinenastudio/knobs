import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ensureStyle, findStyle, removeStyle } from "../src/engine/style";

interface Copy {
  ensureStyle: typeof ensureStyle;
  findStyle: typeof findStyle;
  removeStyle: typeof removeStyle;
}

/** A frame's document in a realm of its own, with that realm's devknobs, as a page above sees it. */
function frameRealm() {
  const realm = vm.createContext({});
  vm.runInContext("globalThis.CSSStyleSheet = class { replaceSync(text) { this.rules = text; } }", realm);
  const doc = {
    nodeType: 9,
    adoptedStyleSheets: vm.runInContext("[]", realm),
    head: null,
    documentElement: {},
    querySelector: () => null,
    defaultView: { CSSStyleSheet: vm.runInContext("CSSStyleSheet", realm) },
  };
  Reflect.set(realm, "document", doc);
  // style.ts and the one module it imports, as one script.
  const source = ["../src/mark.ts", "../src/engine/style.ts"]
    .map((path) => new Bun.Transpiler({ loader: "ts" }).transformSync(readFileSync(new URL(path, import.meta.url), "utf8")))
    .join("\n")
    .replace(/^import .*$/gm, "");
  vm.runInContext(`${source.replace(/^export /gm, "")}\nglobalThis.copy = { ensureStyle, findStyle, removeStyle };`, realm);
  const copy: Copy = Reflect.get(realm, "copy");
  // The page above passes the frame's document in, as it does to scrollbars.
  const frameDoc: Document = Reflect.get(realm, "document");
  const sheets = (): string[] => doc.adoptedStyleSheets.map((sheet: { rules: string }) => sheet.rules);
  return { copy, doc: frameDoc, sheets };
}

test("a sheet the page above adopts into the frame's document is the frame's own too", () => {
  const { copy, doc, sheets } = frameRealm();
  ensureStyle("scrollbars", doc).textContent = "a";
  copy.ensureStyle("scrollbars").textContent = "a";
  expect(sheets()).toEqual(["a"]);
  copy.removeStyle("scrollbars");
  expect(sheets()).toEqual([]);
});

test("the page above looking for a sheet in the frame leaves the frame's sheets findable", () => {
  const { copy, doc, sheets } = frameRealm();
  copy.ensureStyle("outlines").textContent = "outline";
  expect(findStyle("scrollbars", doc)).toBeNull();
  expect(findStyle("outlines", doc)?.textContent).toBe("outline");
  copy.removeStyle("outlines");
  expect(sheets()).toEqual([]);
});

test("the frame takes away a sheet the page above put there", () => {
  const { copy, doc, sheets } = frameRealm();
  ensureStyle("scrollbars", doc).textContent = "html{scrollbar-width:none}";
  expect(copy.findStyle("scrollbars")?.textContent).toBe("html{scrollbar-width:none}");
  copy.removeStyle("scrollbars");
  expect(sheets()).toEqual([]);
  expect(findStyle("scrollbars", doc)).toBeNull();
});

test("a sheet found again is the same handle", () => {
  const { doc } = frameRealm();
  const style = ensureStyle("early", doc);
  expect(findStyle("early", doc)).toBe(style);
  removeStyle("early", doc);
  expect(findStyle("early", doc)).toBeNull();
});
