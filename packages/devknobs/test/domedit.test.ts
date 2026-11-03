import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { createEditLog, type EditLog } from "../src/edit/log";
import { createDomEditor, parseAttributes, quotedValue } from "../src/ui/domedit";
import { createDomTree, createTreeModel, type DomTree, SETTLE } from "../src/ui/domtree";
import { as, elem, page, type PageNode, text } from "./dom-page";
import { fake, FakeNode, FakeObserver } from "./styles-dom";

/** The page's parser, as far as the editor asks it: the attributes of one tag, or the nodes queued for html. */
let queued: PageNode[] = [];
const asked: string[] = [];

function decode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function parse(_doc: Document, html: string): Node[] {
  asked.push(html);
  const tag = /^<(div|svg) (.*)><\/\1>$/s.exec(html);
  if (!tag) return queued.map(as);
  const attrs: Record<string, string> = {};
  for (const [, name, value] of (tag[2] ?? "").matchAll(/([^\s="]+)(?:="([^"]*)")?/g)) if (name) attrs[name.toLowerCase()] = decode(value ?? "");
  return [as(elem(tag[1] ?? "div", attrs))];
}

describe("the attributes a field writes", () => {
  test("are read in a div, or an svg tag for an svg element's, and null where it writes none", () => {
    page(() => []);
    const doc = {} as Document;
    expect(parseAttributes(doc, 'class="a b" data-x="{&quot;a&quot;:1}"', false, parse)).toEqual([
      ["class", "a b"],
      ["data-x", '{"a":1}'],
    ]);
    expect(parseAttributes(doc, 'viewBox="0 0 1 1"', true, parse)).toEqual([["viewbox", "0 0 1 1"]]);
    expect(asked.slice(-1)).toEqual(['<svg viewBox="0 0 1 1"></svg>']);
    expect(parseAttributes(doc, "", false, parse)).toBeNull();
  });

  test("show a value with quotes and ampersands as a tag writes it", () => {
    expect(quotedValue('font-family: "Inter" & co')).toBe("font-family: &quot;Inter&quot; &amp; co");
  });
});

describe("the tree's editor", () => {
  let tree: DomTree | null = null;
  let log: EditLog;
  let selected: Node[];
  const GLOBALS = ["window", "document", "MutationObserver"] as const;
  const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));

  beforeEach(() => {
    jest.useFakeTimers();
    queued = [];
    selected = [];
    log = createEditLog();
    FakeObserver.made = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), { setTimeout: (run: () => void, delay: number) => setTimeout(run, delay) }),
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: (tag: string) => new FakeNode(tag), createElementNS: (_namespace: string, tag: string) => new FakeNode(tag) },
    });
    Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: FakeObserver });
  });

  afterEach(() => {
    tree?.destroy();
    tree = null;
    jest.useRealTimers();
    GLOBALS.forEach((name, index) => {
      const descriptor = saved[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  });

  function start(target: PageNode): FakeNode {
    tree = createDomTree(
      {
        outline: () => undefined,
        select: (node) => selected.push(node),
        copy: () => undefined,
        editor: (hooks) => createDomEditor(hooks, { log, locate: async () => null, parse }),
      },
      createTreeModel({ pseudos: () => [] }),
    );
    tree.reveal(as(target));
    return fake(tree.node);
  }

  const list = (node: FakeNode) => node.find("dom-tree")[0] as FakeNode;
  const line = (node: FakeNode) => list(node).find("on")[0] as FakeNode;
  const field = (node: FakeNode) => node.find("dom-edit")[0];
  const key = (target: FakeNode, name: string, more: Record<string, unknown> = {}) => target.fire("keydown", { key: name, ...more });
  const dblclick = (node: FakeNode, piece: FakeNode) => list(node).fire("dblclick", { target: piece });
  /** The page changed an element's attributes: the tree hears it, and builds its line again. */
  const changed = (target: PageNode) => {
    (FakeObserver.made[0] as FakeObserver).callback([{ type: "attributes", target: as(target), attributeName: "class" } as unknown as MutationRecord]);
    jest.advanceTimersByTime(SETTLE);
  };
  const bar = (node: FakeNode) => (node.find("dom-acts")[0] as FakeNode).childNodes.map((one) => one.textContent);

  test("edits a text on a double-click, makes no edit for a field closed as opened, and keeps a bad one open, marked", () => {
    const words = text("Save");
    const button = elem("button", { class: "cta" }, words);
    page(() => [elem("body", {}, button)]);
    const node = start(button);
    expect(bar(node)).toEqual(["edit text", "+ attribute", "edit as html", "hide", "delete"]);
    dblclick(node, line(node).find("tok-text")[0] as FakeNode);
    const input = field(node) as FakeNode;
    expect([input.tag, input.value]).toEqual(["input", "Save"]);
    key(input, "Enter");
    expect(field(node)).toBeUndefined();
    expect(log.list()).toEqual([]);
    expect(line(node).find("tok-text")[0]?.textContent).toBe("Save");

    dblclick(node, line(node).find("tok-text")[0] as FakeNode);
    (field(node) as FakeNode).value = "Buy now";
    key(field(node) as FakeNode, "Enter");
    expect(words.nodeValue).toBe("Buy now");
    expect(log.list()).toMatchObject([{ kind: "text", before: "Save", after: "Buy now" }]);

    // A value the page does not take: a text that is only space.
    dblclick(node, line(node).find("tok-text")[0] as FakeNode);
    const bad = field(node) as FakeNode;
    bad.value = "   ";
    key(bad, "Enter");
    expect(field(node)).toBe(bad);
    expect(bad.classList.contains("bad")).toBe(true);
    // Another action waits on the field it refused: nothing else is done, and the field stays.
    const hideButton = (node.find("dom-acts")[0] as FakeNode).childNodes.find((one) => one.textContent === "hide") as FakeNode;
    hideButton.fire("click");
    expect(field(node)).toBe(bad);
    expect(button.hasAttribute("data-devknobs-hide")).toBe(false);
    expect(tree?.escape()).toBe(true);
    expect(field(node)).toBeUndefined();
    expect(log.list()).toHaveLength(1);
  });

  test("refuses html that carries devknobs' own attribute, and keeps the field open", () => {
    const old = elem("div", { class: "block" });
    page(() => [elem("body", {}, old)]);
    const node = start(old);
    key(list(node), "F2");
    const box = field(node) as FakeNode;
    queued = [elem("div", {}, elem("span", { "data-devknobs": "panel" }))];
    box.value = '<div><span data-devknobs="panel"></span></div>';
    key(box, "Enter", { shiftKey: true });
    expect(field(node)).toBe(box);
    expect(box.classList.contains("bad")).toBe(true);
    expect(old.parentNode).not.toBeNull();
    expect(log.list()).toEqual([]);
  });

  test("a text with line breaks opens in a box that keeps them, Enter breaks the line and ⇧↩ puts it on", () => {
    const words = text("one\ntwo");
    const pre = elem("pre", {}, words);
    page(() => [elem("body", {}, pre)]);
    const node = start(pre);
    key(list(node), "Enter");
    const box = field(node) as FakeNode;
    expect([box.tag, box.value]).toEqual(["textarea", "one\ntwo"]);
    expect(node.find("dom-apply")).toHaveLength(1);
    key(box, "Enter");
    expect(field(node)).toBe(box);
    (node.find("dom-apply")[0] as FakeNode).fire("click");
    expect(log.list()).toEqual([]);
    expect(words.nodeValue).toBe("one\ntwo");
    key(list(node), "Enter");
    (field(node) as FakeNode).value = "one\ntwo\nthree";
    key(field(node) as FakeNode, "Enter", { shiftKey: true });
    expect(words.nodeValue).toBe("one\ntwo\nthree");
    expect(node.find("dom-apply")).toHaveLength(0);
  });

  test("edits an attribute as name and value: quoted values kept, renamed, cleared, and one added with a", () => {
    const button = elem("button", { class: "cta", "data-x": '{"a":1}' }, text("Save"));
    page(() => [elem("body", {}, button)]);
    const node = start(button);
    const attr = (name: string) => line(node).all().find((one) => one.getAttribute("data-attr") === name) as FakeNode;

    dblclick(node, attr("data-x"));
    const quoted = field(node) as FakeNode;
    expect(quoted.value).toBe('data-x="{&quot;a&quot;:1}"');
    key(quoted, "Enter");
    expect(log.list()).toEqual([]);

    dblclick(node, attr("data-x"));
    (field(node) as FakeNode).value = 'data-x="{&quot;a&quot;:2}"';
    key(field(node) as FakeNode, "Enter");
    expect(button.getAttribute("data-x")).toBe('{"a":2}');

    dblclick(node, attr("class"));
    (field(node) as FakeNode).value = 'id="go"';
    key(field(node) as FakeNode, "Enter");
    expect(button.hasAttribute("class")).toBe(false);
    expect(button.getAttribute("id")).toBe("go");

    changed(button);
    dblclick(node, attr("id"));
    (field(node) as FakeNode).value = "";
    key(field(node) as FakeNode, "Enter");
    expect(button.hasAttribute("id")).toBe(false);

    key(list(node), "a");
    const added = field(node) as FakeNode;
    expect(added.getAttribute("aria-label")).toBe("new attribute");
    added.value = 'title="hi"';
    key(added, "Enter");
    expect(button.getAttribute("title")).toBe("hi");
    expect(log.list().map((one) => [one.property, one.before, one.after])).toEqual([
      ["data-x", '{"a":1}', '{"a":2}'],
      ["class", "cta", null],
      ["id", null, "go"],
      ["id", "go", null],
      ["title", null, "hi"],
    ]);
    log.undoAll();
    expect(Object.fromEntries(button.attributes.map((one) => [one.name, one.value]))).toEqual({ class: "cta", "data-x": '{"a":1}' });
  });

  test("edits as html with F2, and selects the new element", () => {
    const old = elem("div", { class: "block" }, text("Old"));
    page(() => [elem("body", {}, old)]);
    const node = start(old);
    key(list(node), "F2");
    const box = field(node) as FakeNode;
    expect(box.value).toBe('<div class="block">Old</div>');
    const made = elem("div", { class: "new" });
    queued = [made];
    box.value = '<div class="new">New</div>';
    key(box, "Enter", { shiftKey: true });
    expect(asked.at(-1)).toBe('<div class="new">New</div>');
    expect(made.parentNode).not.toBeNull();
    expect(old.parentNode).toBeNull();
    expect(selected[selected.length - 1]).toBe(as(made));
    expect(tree?.selected()).toBe(as(made));
  });

  test("deletes with Delete and selects the line after, and leaves the body, which holds the panel, alone", () => {
    const [one, two, three] = ["1", "2", "3"].map((id) => elem("li", { id }));
    const body = elem("body", {}, elem("ul", {}, one as PageNode, two as PageNode, three as PageNode), elem("div", { "data-devknobs": "panel" }));
    page(() => [body]);
    const node = start(two as PageNode);
    key(list(node), "Delete");
    expect(two?.parentNode).toBeNull();
    expect(tree?.selected()).toBe(as(three as PageNode));
    tree?.reveal(as(body));
    expect(bar(node)).toEqual(["+ attribute"]);
    expect(key(list(node), "Backspace").prevented).toBe(false);
    expect(body.parentNode).not.toBeNull();
  });
});
