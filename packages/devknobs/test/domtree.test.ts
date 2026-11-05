import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  CHILD_CAP,
  createDomTree,
  createTreeModel,
  type DomTree,
  elementOf,
  markupOf,
  parentRow,
  type Row,
  SETTLE,
  stepFor,
  type TreeModel,
  type TreePage,
} from "../src/ui/domtree";
import { HIDE_ATTRIBUTE } from "../src/edit/html";
import type { TreeHooks } from "../src/ui/domedit";
import { CSS } from "../src/ui/styles";
import { as, comment, elem, page, PageNode, shadow, svg, text } from "./dom-page";
import { fake, FakeNode, FakeObserver } from "./styles-dom";

/** The pseudo-elements each element has, by its id. */
let marks: Record<string, string[]>;
const pseudos: TreePage = { pseudos: (element) => marks[element.getAttribute("id") ?? ""] ?? [] };

function model(doc: PageNode): TreeModel {
  const made = createTreeModel(pseudos);
  made.setRoot(as(doc) as Document);
  return made;
}

/** The tree as text, a line a row, two spaces a level. */
function lines(tree: TreeModel): string[] {
  return tree.rows().map((row) => `${"  ".repeat(row.depth)}${tree.pieces(row).map((piece) => piece[1]).join("")}`);
}

beforeEach(() => {
  marks = {};
});

describe("the tree's lines", () => {
  test("start with the doctype and the html, with its html and body open, as the browser's tools do", () => {
    const doc = page(() => [elem("head", {}, elem("title", {}, text("Shop"))), elem("body", {}, elem("main", { id: "app" }))]);
    expect(lines(model(doc))).toEqual([
      "<!DOCTYPE html>",
      '<html lang="en">',
      "  <head>…</head>",
      "  <body>",
      '    <main id="app"></main>',
      "  </body>",
      "</html>",
    ]);
  });

  test("an attribute's name and value are pieces of their own, the marks around a value in the tag's color", () => {
    const doc = page(() => [elem("body", {}, elem("a", { href: "/cart", hidden: "" }))]);
    const tree = model(doc);
    const row = tree.rows().find((one) => one.kind === "open" && one.depth === 2) as Row;
    expect(tree.pieces(row)).toEqual([
      ["tag", "<a"],
      ["", " "],
      ["attr", "href", "href"],
      ["tag", '="', "href"],
      ["val", "/cart", "href"],
      ["tag", '"', "href"],
      ["", " "],
      ["attr", "hidden", "hidden"],
      ["tag", "></a>"],
    ]);
  });

  test("a short text stands in its element's line, a long one is a line of its own in quotes, and blank text has none", () => {
    const long = "word ".repeat(60).trim();
    const doc = page(() => [
      elem("body", {}, text("\n  "), elem("h1", {}, text("  Hello\n world ")), elem("p", { id: "long" }, text(long)), text("\n")),
    ]);
    const tree = model(doc);
    expect(lines(tree).slice(3, 5)).toEqual(["    <h1>Hello world</h1>", '    <p id="long">…</p>']);
    const p = doc.body?.childNodes[2] as PageNode;
    tree.setExpanded(as(p), true);
    const opened = lines(tree);
    expect(opened[4]).toBe('    <p id="long">');
    expect(opened[5]).toBe(`      "${long.slice(0, 199)}…"`);
    expect(opened[6]).toBe("    </p>");
  });

  test("a text, a comment and an attribute's value are cut short where long, a data url shorter, a long value in its middle", () => {
    const value = `a${"b".repeat(150)}z`;
    const data = `data:image/png;base64,${"A".repeat(200)}`;
    const doc = page(() => [elem("body", {}, elem("img", { class: value, src: data }), comment(` ${"c".repeat(300)} `))]);
    const tree = model(doc);
    const img = tree.rows().find((row) => row.kind === "open" && row.depth === 2) as Row;
    const values = tree.pieces(img).filter(([kind]) => kind === "val").map(([, said]) => said);
    expect(values[0]).toHaveLength(100);
    expect(values[0]?.startsWith("ab")).toBe(true);
    expect(values[0]?.endsWith("bz")).toBe(true);
    expect(values[0]).toContain("…");
    expect(values[1]).toHaveLength(60);
    expect(values[1]).toContain("…");
    const note = lines(tree).find((line) => line.includes("<!--")) ?? "";
    expect(note.trim()).toBe(`<!-- ${"c".repeat(198)}…-->`);
  });

  test("a void element has no end tag, an empty one ends in its line, and svg keeps its tag's case", () => {
    const doc = page(() => [elem("body", {}, elem("img", { src: "a.png" }), elem("div"), svg("linearGradient", { id: "g" }))]);
    expect(lines(model(doc)).slice(3, 6)).toEqual(['    <img src="a.png">', "    <div></div>", '    <linearGradient id="g"></linearGradient>']);
  });

  test("comments show as written, and the doctype says its public id", () => {
    const doc = page(() => [elem("body", {}, comment(" cart "))]);
    const type = doc.childNodes[0] as PageNode;
    type.publicId = "-//W3C//DTD XHTML 1.0 Strict//EN";
    type.systemId = "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd";
    const tree = model(doc);
    expect(lines(tree)[0]).toBe('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">');
    expect(lines(tree)[3]).toBe("    <!-- cart -->");
  });

  test("an open shadow root is the first line in its host, and opens to what it holds", () => {
    const host = elem("x-card", { id: "card" }, elem("span", {}, text("light")));
    const doc = page(() => [elem("body", {}, host)]);
    const root = shadow(host, elem("slot"));
    const tree = model(doc);
    tree.setExpanded(as(host), true);
    expect(lines(tree).slice(3, 7)).toEqual(['    <x-card id="card">', "      #shadow-root (open)", "      <span>light</span>", "    </x-card>"]);
    tree.setExpanded(as(root), true);
    expect(lines(tree).slice(4, 6)).toEqual(["      #shadow-root (open)", "        <slot></slot>"]);
  });

  test("::marker and ::before go before the children and ::after after them, and an element with one keeps its text on a line", () => {
    marks = { item: ["::marker", "::before", "::after"] };
    const item = elem("li", { id: "item" }, text("Milk"));
    const doc = page(() => [elem("body", {}, elem("ul", {}, item))]);
    const tree = model(doc);
    tree.setExpanded(as(doc.body?.childNodes[0] as PageNode), true);
    expect(lines(tree)[4]).toBe('      <li id="item">…</li>');
    tree.setExpanded(as(item), true);
    expect(lines(tree).slice(4, 10)).toEqual(['      <li id="item">', "        ::marker", "        ::before", '        "Milk"', "        ::after", "      </li>"]);
  });

  test("devknobs' own nodes and attributes are never in it", () => {
    const panel = elem("div", { "data-devknobs": "panel" }, elem("span"));
    const doc = page(() => [
      elem("head", {}, elem("style", { "data-devknobs": "scheme" })),
      elem("body", { "data-devknobs-replay": "before" }, elem("main"), panel),
    ]);
    const tree = model(doc);
    expect(lines(tree)).toEqual(["<!DOCTYPE html>", '<html lang="en">', "  <head></head>", "  <body>", "    <main></main>", "  </body>", "</html>"]);
    expect(tree.reveal(as(panel.childNodes[0] as PageNode))).toBe(false);
  });

  test("a closed element opens and closes, with its end tag on a line of its own while open", () => {
    const list = elem("ul", {}, elem("li"), elem("li"));
    const doc = page(() => [elem("body", {}, list)]);
    const tree = model(doc);
    expect(tree.expandable(as(list))).toBe(true);
    expect(lines(tree)[3]).toBe("    <ul>…</ul>");
    tree.setExpanded(as(list), true);
    expect(lines(tree).slice(3, 7)).toEqual(["    <ul>", "      <li></li>", "      <li></li>", "    </ul>"]);
    tree.setExpanded(as(list), false);
    expect(lines(tree)).toHaveLength(6);
  });

  test(`past ${CHILD_CAP} children a line says how many more, and shows them`, () => {
    const many = Array.from({ length: CHILD_CAP + 100 }, () => elem("i"));
    const doc = page(() => [elem("body", {}, ...many)]);
    const tree = model(doc);
    const rows = tree.rows();
    expect(rows.filter((row) => row.kind === "open" && row.depth === 2)).toHaveLength(CHILD_CAP);
    const more = rows.find((row) => row.kind === "more") as Row;
    expect(tree.pieces(more)).toEqual([["", "Show all nodes (100 more)"]]);
    tree.showAll(more.node);
    expect(tree.rows().filter((row) => row.kind === "open" && row.depth === 2)).toHaveLength(CHILD_CAP + 100);
  });

  test("revealing a node opens the way down to it, through a shadow root, past the cap, and walks nothing else", () => {
    const deep = elem("b", { id: "deep" });
    const host = elem("x-card", {}, elem("p"));
    const late = elem("em", { id: "late" });
    const doc = page(() => [elem("body", {}, host, elem("section", {}, ...Array.from({ length: CHILD_CAP + 5 }, () => elem("i")), late))]);
    const root = shadow(host, elem("div", {}, deep));
    const tree = model(doc);
    expect(tree.reveal(as(deep))).toBe(true);
    expect(tree.isExpanded(as(host))).toBe(true);
    expect(tree.isExpanded(as(root))).toBe(true);
    expect(tree.isExpanded(as(deep))).toBe(false);
    expect(tree.rows().some((row) => row.node === as(deep))).toBe(true);
    expect(tree.reveal(as(late))).toBe(true);
    expect(tree.rows().some((row) => row.node === as(late))).toBe(true);
    const other = page(() => [elem("body")]);
    expect(tree.reveal(as(other.body as PageNode))).toBe(false);
  });

  test("a node is read once, and again only after it is forgotten", () => {
    const body = elem("body");
    const doc = page(() => [body]);
    const tree = model(doc);
    expect(tree.children(as(body))).toHaveLength(0);
    body.append(elem("main"));
    expect(tree.children(as(body))).toHaveLength(0);
    tree.forget(as(body));
    expect(tree.children(as(body))).toHaveLength(1);
  });
});

describe("the keys", () => {
  function setup() {
    const list = elem("ul", { id: "list" }, elem("li", {}, elem("b")), elem("li"));
    const doc = page(() => [elem("body", {}, list)]);
    const tree = model(doc);
    tree.setExpanded(as(list), true);
    return { tree, list, rows: tree.rows() };
  }

  const at = (rows: Row[], node: PageNode, kind = "open") => rows.findIndex((row) => row.node === as(node) && row.kind === kind);

  test("up and down move a line, past end tags, Home and End go to the ends", () => {
    const { tree, list, rows } = setup();
    const ul = at(rows, list);
    expect(stepFor("ArrowDown", rows, ul, tree)).toEqual({ kind: "select", at: ul + 1 });
    expect(stepFor("ArrowUp", rows, ul, tree)).toEqual({ kind: "select", at: ul - 1 });
    // From the last li, down skips the end tags of the ul and the body to the html's.
    const last = at(rows, list.childNodes[1] as PageNode);
    expect(stepFor("ArrowDown", rows, last, tree)).toBeNull();
    expect(stepFor("Home", rows, ul, tree)).toEqual({ kind: "select", at: 0 });
    expect(stepFor("End", rows, 0, tree)).toEqual({ kind: "select", at: last });
    expect(stepFor("Enter", rows, ul, tree)).toBeNull();
  });

  test("right opens a closed line and goes into an open one, left closes an open one and goes up from another", () => {
    const { tree, list, rows } = setup();
    const first = list.childNodes[0] as PageNode;
    const li = at(rows, first);
    expect(stepFor("ArrowRight", rows, li, tree)).toEqual({ kind: "expand", node: as(first) });
    const ul = at(rows, list);
    expect(stepFor("ArrowRight", rows, ul, tree)).toEqual({ kind: "select", at: li });
    expect(stepFor("ArrowLeft", rows, ul, tree)).toEqual({ kind: "collapse", node: as(list) });
    expect(stepFor("ArrowLeft", rows, li, tree)).toEqual({ kind: "select", at: ul });
    expect(parentRow(rows, li)).toBe(ul);
    // A line with nothing in it does not open.
    const empty = at(rows, list.childNodes[1] as PageNode);
    expect(stepFor("ArrowRight", rows, empty, tree)).toBeNull();
  });
});

describe("what a line stands for", () => {
  test("a text's or a shadow root's element is the one it is in", () => {
    const words = text("hi");
    const inner = elem("i");
    const host = elem("x-a", {}, words);
    page(() => [elem("body", {}, host)]);
    const root = shadow(host, inner);
    expect(elementOf(as(words))).toBe(as(host) as Element);
    expect(elementOf(as(root))).toBe(as(host) as Element);
    expect(elementOf(as(inner))).toBe(as(inner) as Element);
  });

  test("copy is the node's markup, devknobs' own nodes and attributes taken out of the copy", () => {
    expect(markupOf(as(text("a < b")))).toBe("a < b");
    expect(markupOf(as(comment(" x ")))).toBe("<!-- x -->");
    const removed: string[] = [];
    const own = { remove: () => removed.push("node") };
    const inner = { attributes: [{ name: "data-devknobs-replay" }, { name: "class" }], removeAttribute: (name: string) => removed.push(name) };
    const copy = {
      nodeType: 1,
      attributes: [{ name: "id" }],
      removeAttribute: (name: string) => removed.push(name),
      querySelectorAll: (selector: string) => (selector === "*" ? [inner] : [own]),
      outerHTML: '<div id="a"></div>',
    };
    const element = { nodeType: 1, cloneNode: (deep: boolean) => (deep ? copy : null) };
    expect(markupOf(element as unknown as Node)).toBe('<div id="a"></div>');
    expect(removed).toEqual(["node", "data-devknobs-replay"]);
  });
});

describe("the tree as built", () => {
  let tree: DomTree | null = null;
  let outlined: (Element | null)[];
  let selected: [Node, string | null][];
  let copied: string[];

  const GLOBALS = ["window", "document", "MutationObserver"] as const;
  const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));

  beforeEach(() => {
    jest.useFakeTimers();
    outlined = [];
    selected = [];
    copied = [];
    FakeObserver.made = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), { setTimeout: (run: () => void, delay: number) => setTimeout(run, delay) }),
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tag: string) => new FakeNode(tag),
        createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      },
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

  function start(): FakeNode {
    tree = createDomTree(
      {
        outline: (element) => outlined.push(element),
        select: (node, pseudo) => selected.push([node, pseudo]),
        copy: (said) => copied.push(said),
      },
      createTreeModel(pseudos),
    );
    return fake(tree.node);
  }

  const list = (node: FakeNode) => node.find("dom-tree")[0] as FakeNode;
  const rows = (node: FakeNode) => list(node).children as FakeNode[];
  /** A line's text, without the handle an element's line has in an editable tree. */
  const said = (row: FakeNode) => row.textContent.replace(/^⋮⋮/, "");

  function setup() {
    const save = elem("button", { id: "save" }, text("Save"));
    const app = elem("div", { id: "app" }, save, elem("p", { id: "after" }));
    const doc = page(() => [elem("head"), elem("body", {}, app)]);
    return { doc, app, save };
  }

  test("is a tree with nothing in it until a node is revealed, then its document with the node selected", () => {
    const node = start();
    expect(node.hidden).toBe(true);
    const { save } = setup();
    tree?.reveal(as(save));
    expect(node.hidden).toBe(false);
    const box = list(node);
    expect(box.attributes.get("role")).toBe("tree");
    const lines = rows(node).map(said);
    expect(lines).toContain('<div id="app">');
    const on = rows(node).filter((row) => row.attributes.get("aria-selected") === "true");
    expect(on).toHaveLength(1);
    expect(said(on[0] as FakeNode)).toBe('<button id="save">Save</button> == $0copy');
    expect(box.attributes.get("aria-activedescendant")).toBe((on[0] as unknown as { id: string }).id);
    expect(on[0]?.attributes.get("role")).toBe("treeitem");
    expect(on[0]?.attributes.get("aria-level")).toBe("4");
    // The div is open, and says so; its end tag is no item.
    const div = rows(node).find((row) => said(row) === '<div id="app">') as FakeNode;
    expect(div.attributes.get("aria-expanded")).toBe("true");
    const end = rows(node).find((row) => said(row) === "</div>") as FakeNode;
    expect(end.attributes.get("aria-hidden")).toBe("true");
    expect(selected).toEqual([]);
  });

  test("the pointer on a line boxes its element, and leaving the tree takes the box off", () => {
    const node = start();
    const { save, app } = setup();
    tree?.reveal(as(save));
    const div = rows(node).find((row) => said(row) === '<div id="app">') as FakeNode;
    div.fire("pointerenter");
    list(node).fire("pointerleave");
    expect(outlined).toEqual([as(app) as Element, null]);
  });

  test("a click selects a line and says so, and the keys move, open and close", () => {
    const node = start();
    const { save, app } = setup();
    tree?.reveal(as(save));
    const div = rows(node).find((row) => said(row) === '<div id="app">') as FakeNode;
    div.fire("click");
    expect(selected).toEqual([[as(app), null]]);
    expect(said(rows(node).find((row) => row.attributes.get("aria-selected") === "true") as FakeNode)).toBe('<div id="app"> == $0copy');
    list(node).press("ArrowLeft");
    expect(rows(node).map(said)).toContain('<div id="app">…</div> == $0copy');
    list(node).press("ArrowRight");
    expect(rows(node).map(said)).toContain("</div>");
    list(node).press("ArrowDown");
    expect(selected[selected.length - 1]).toEqual([as(save), null]);
    list(node).press("ArrowUp");
    expect(selected[selected.length - 1]).toEqual([as(app), null]);
  });

  test("the triangle opens and closes a line without selecting it", () => {
    const node = start();
    const { save } = setup();
    tree?.reveal(as(save));
    const div = rows(node).find((row) => said(row) === '<div id="app">') as FakeNode;
    (div.children[0] as FakeNode).fire("click");
    expect(rows(node).map(said)).toContain('<div id="app">…</div>');
    expect(selected).toEqual([]);
  });

  test("copy, by its button and by meta or ctrl and c, is the selected node's markup", () => {
    const node = start();
    const words = text("hello there");
    page(() => [elem("body", {}, elem("p", {}, words, elem("b")))]);
    tree?.reveal(as(words));
    const on = rows(node).find((row) => row.attributes.get("aria-selected") === "true") as FakeNode;
    (on.find("act")[0] as FakeNode).fire("click");
    expect(list(node).fire("keydown", { key: "c" }).prevented).toBe(false);
    const meta: { key: string } = Object.assign({ key: "c" }, { metaKey: true });
    expect(list(node).fire("keydown", meta).prevented).toBe(true);
    expect(copied).toEqual(["hello there", "hello there"]);
  });

  test("with an editor, keys on the selected line go to it, keys in a field go nowhere, and a hide builds the line again, faint", () => {
    const keys: [string, Node | null][] = [];
    const seen: (Node | null)[] = [];
    const lent: { hooks?: TreeHooks } = {};
    tree = createDomTree(
      {
        outline: () => undefined,
        select: (picked, pseudo) => selected.push([picked, pseudo]),
        copy: () => undefined,
        editor(given) {
          lent.hooks = given;
          return {
            bar: new FakeNode("div") as unknown as HTMLElement,
            dblclick: () => false,
            key: (event, row) => {
              keys.push([event.key, row?.node ?? null]);
              return event.key === "h";
            },
            selected: (row) => seen.push(row?.node ?? null),
            busy: () => false,
            close: () => false,
            move: () => false,
            destroy: () => undefined,
          };
        },
      },
      createTreeModel(pseudos),
    );
    const node = fake(tree.node);
    const { save, app } = setup();
    tree.reveal(as(save));
    expect(node.children).toHaveLength(2);
    expect(seen[seen.length - 1]).toBe(as(save));
    expect(list(node).fire("keydown", { key: "h" }).prevented).toBe(true);
    expect(keys).toEqual([["h", as(save)]]);
    // Typed in a field of the tree: neither the editor nor the tree's own keys act.
    const field = { tagName: "INPUT", hasAttribute: () => false };
    list(node).fire("keydown", { key: "ArrowUp", target: field });
    list(node).fire("keydown", { key: "h", target: field });
    expect(keys).toHaveLength(1);
    expect(selected).toEqual([]);
    // A hide shows on the line.
    save.setAttribute(HIDE_ATTRIBUTE, "");
    const observer = FakeObserver.made[0] as FakeObserver;
    observer.callback([{ type: "attributes", target: as(save), attributeName: HIDE_ATTRIBUTE } as unknown as MutationRecord]);
    jest.advanceTimersByTime(SETTLE);
    const hid = rows(node).find((row) => said(row).startsWith('<button id="save">')) as FakeNode;
    expect(hid.classList.contains("dom-hid")).toBe(true);
    expect(hid.find("dom-flash")).toEqual([]);
    // The editor selects a line as a click does.
    lent.hooks?.select(as(app));
    expect(selected).toEqual([[as(app), null]]);
  });

  test("a change on the page builds the lines of what changed again once it settles, lit, and devknobs' own nodes change nothing", () => {
    const node = start();
    const { save, app } = setup();
    tree?.reveal(as(save));
    const observer = FakeObserver.made[0] as FakeObserver;
    expect(observer.watched.some((one) => one.node === as(app) && one.options.attributes === true)).toBe(true);
    const before = rows(node).length;
    const panel = elem("div", { "data-devknobs": "panel" });
    app.append(panel);
    observer.callback([{ type: "childList", target: as(app), addedNodes: [as(panel)], removedNodes: [] } as unknown as MutationRecord]);
    jest.advanceTimersByTime(SETTLE);
    expect(rows(node)).toHaveLength(before);
    app.setAttribute("class", "busy");
    observer.callback([{ type: "attributes", target: as(app), attributeName: "class" } as unknown as MutationRecord]);
    expect(rows(node).map(said)).toContain('<div id="app">');
    jest.advanceTimersByTime(SETTLE);
    const div = rows(node).find((row) => said(row) === '<div id="app" class="busy">') as FakeNode;
    expect(div.find("dom-flash").map((piece) => piece.textContent)).toEqual(["class", '="', "busy", '"']);
    const added = elem("span", { id: "new" });
    app.append(added);
    observer.callback([{ type: "childList", target: as(app), addedNodes: [as(added)], removedNodes: [] } as unknown as MutationRecord]);
    jest.advanceTimersByTime(SETTLE);
    const row = rows(node).find((one) => said(one) === '<span id="new"></span>') as FakeNode;
    expect(row.classList.contains("dom-flash")).toBe(true);
  });

  test("a line lights once: the light goes when it is over, and the line put back later does not light again", () => {
    const node = start();
    const { save, app } = setup();
    tree?.reveal(as(save));
    const observer = FakeObserver.made[0] as FakeObserver;
    const added = elem("span", { id: "new" });
    app.append(added);
    observer.callback([{ type: "childList", target: as(app), addedNodes: [as(added)], removedNodes: [] } as unknown as MutationRecord]);
    jest.advanceTimersByTime(SETTLE);
    const row = rows(node).find((one) => said(one) === '<span id="new"></span>') as FakeNode;
    expect(row.classList.contains("dom-flash")).toBe(true);
    list(node).fire("animationend", { target: row });
    expect(row.classList.contains("dom-flash")).toBe(false);
    // Closed and opened again, the span's line is the one built before, unlit.
    const div = () => rows(node).find((one) => said(one).startsWith('<div id="app">')) as FakeNode;
    (div().children[0] as FakeNode).fire("click");
    (div().children[0] as FakeNode).fire("click");
    expect(rows(node)).toContain(row);
    expect(row.classList.contains("dom-flash")).toBe(false);
  });

  test("a pick under a node closed since it was read shows the node as it is now, and its line selected", () => {
    const node = start();
    const items = Array.from({ length: 5 }, (_, at) => elem("li", { "data-i": String(at) }, elem("i", {}, text(`item ${at}`))));
    const ul = elem("ul", { id: "list" }, ...items);
    const host = elem("x-card", { id: "card" }, elem("p"));
    const doc = page(() => [elem("body", {}, ul, host)]);
    const root = shadow(host, elem("slot"));
    root.ownerDocument = doc;
    tree?.reveal(as(ul));
    const line = (start: string) => rows(node).find((one) => said(one).startsWith(start)) as FakeNode;
    const turn = (start: string) => line(start).children[0] as FakeNode;
    turn('<ul id="list">').fire("click");
    expect(rows(node).map(said)).toContain('<li data-i="3">…</li>');
    turn('<ul id="list">').fire("click");
    // Nothing watches the closed list, so no record says the li changed.
    const fresh = elem("b", { id: "fresh" });
    const li = items[3] as PageNode;
    li.childNodes.unshift(fresh);
    fresh.parentNode = li;
    tree?.reveal(as(fresh));
    const on = rows(node).filter((row) => row.attributes.get("aria-selected") === "true");
    expect(on.map(said)).toEqual(['<b id="fresh"></b> == $0copy']);
    const lines = rows(node).map(said);
    const at = lines.indexOf('<li data-i="3">');
    expect(lines.slice(at, at + 4)).toEqual(['<li data-i="3">', '<b id="fresh"></b> == $0copy', "<i>item 3</i>", "</li>"]);
    // A node read while open and changed while closed shows as it is when it opens again.
    turn('<li data-i="3">').fire("click");
    li.append(elem("u"));
    turn('<li data-i="3">').fire("click");
    expect(rows(node).map(said)).toContain("<u></u>");
    // A closed shadow root is watched for what it holds, for its triangle.
    tree?.reveal(as(host.childNodes[0] as PageNode));
    const observer = FakeObserver.made[0] as FakeObserver;
    expect(tree?.selected()).toBe(as(host.childNodes[0] as PageNode));
    expect(observer.watched.some((one) => one.node === as(root) && one.options.childList === true)).toBe(true);
  });

  test("a selection moves in place: the lines stay in the list, and only the two lines change", () => {
    const node = start();
    const { save, app } = setup();
    tree?.reveal(as(save));
    const before = list(node).children;
    const button = rows(node).find((row) => said(row) === '<button id="save">Save</button> == $0copy') as FakeNode;
    list(node).press("ArrowUp");
    expect(list(node).children).toBe(before);
    expect(selected).toEqual([[as(app), null]]);
    expect(said(button)).toBe('<button id="save">Save</button>');
    expect(button.classList.contains("on")).toBe(false);
    expect(button.attributes.get("aria-selected")).toBe("false");
    const on = rows(node).find((row) => row.attributes.get("aria-selected") === "true") as FakeNode;
    expect(said(on)).toBe('<div id="app"> == $0copy');
    expect(on.classList.contains("on")).toBe(true);
    expect(list(node).attributes.get("aria-activedescendant")).toBe((on as unknown as { id: string }).id);
    expect(on.find("act")).toHaveLength(1);
  });

  test("a tree not laid out yet brings the selected line into sight once it is, once, and not after it is gone", () => {
    const frames: (() => void)[] = [];
    const cancelled: number[] = [];
    Object.assign(window, {
      requestAnimationFrame: (run: () => void) => frames.push(run),
      cancelAnimationFrame: (frame: number) => cancelled.push(frame),
    });
    const node = Object.assign(start(), { clientHeight: 0, clientWidth: 0 });
    const { save } = setup();
    tree?.reveal(as(save));
    expect(frames).toHaveLength(1);
    const on = rows(node).find((row) => row.attributes.get("aria-selected") === "true") as FakeNode;
    Object.assign(on, { offsetTop: 400, offsetHeight: 20 });
    Object.assign(node, { clientHeight: 100, clientWidth: 300 });
    frames[0]?.();
    expect(node.scrollTop).toBe(360);
    Object.assign(node, { clientHeight: 0 });
    tree?.reveal(as(save));
    frames[1]?.();
    expect(frames).toHaveLength(2);
    tree?.reveal(as(save));
    tree?.destroy();
    tree = null;
    expect(cancelled).toEqual([3]);
  });

  test("a deep line is brought into sight sideways, and a line far out is brought back", () => {
    const node = Object.assign(start(), { clientHeight: 100, clientWidth: 300 });
    const { save, app } = setup();
    tree?.reveal(as(save));
    const on = rows(node).find((row) => row.attributes.get("aria-selected") === "true") as FakeNode;
    Object.assign(on, { offsetTop: 0, offsetHeight: 20 });
    Object.assign(on.children[0] as FakeNode, { offsetLeft: 600, offsetWidth: 14 });
    tree?.reveal(as(save));
    expect(node.scrollLeft).toBe(586);
    const div = rows(node).find((row) => said(row) === '<div id="app">') as FakeNode;
    Object.assign(div, { offsetTop: 0, offsetHeight: 20 });
    Object.assign(div.children[0] as FakeNode, { offsetLeft: 40, offsetWidth: 14 });
    div.fire("click");
    expect(selected).toEqual([[as(app), null]]);
    expect(node.scrollLeft).toBe(26);
  });

  test("a deep line keeps a width to read: the tree grows wider than its box instead, and scrolls sideways", () => {
    const rule = (selector: string) => CSS.slice(CSS.indexOf(`${selector} {`), CSS.indexOf("}", CSS.indexOf(`${selector} {`)));
    expect(rule(".dom")).toContain("overflow: auto;");
    expect(rule(".dom-tree")).toContain("width: min-content; min-width: 100%;");
    expect(rule(".dom-code")).toContain("min-width: 30ch;");
  });

  test("once destroyed, a change on the page builds nothing", () => {
    const node = start();
    const { save, app } = setup();
    tree?.reveal(as(save));
    const observer = FakeObserver.made[0] as FakeObserver;
    const before = rows(node).map(said);
    tree?.destroy();
    tree = null;
    expect(observer.connected).toBe(false);
    expect(list(node).listeners.get("animationend")?.size ?? 0).toBe(0);
    app.setAttribute("class", "busy");
    observer.callback([{ type: "attributes", target: as(app), attributeName: "class" } as unknown as MutationRecord]);
    jest.advanceTimersByTime(SETTLE);
    expect(rows(node).map(said)).toEqual(before);
  });

  test("revealing null empties it, and another document starts it over", () => {
    const node = start();
    const { save } = setup();
    tree?.reveal(as(save));
    tree?.reveal(null);
    expect(node.hidden).toBe(true);
    expect(rows(node)).toHaveLength(0);
    const other = page(() => [elem("body", {}, elem("main", { id: "other" }))]);
    tree?.reveal(as(other.body?.childNodes[0] as PageNode));
    expect(rows(node).map(said)).toContain('<main id="other"></main> == $0copy');
  });
});
