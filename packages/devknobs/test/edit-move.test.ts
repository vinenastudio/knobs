import { describe, expect, test } from "bun:test";
import { canHold, movable, moveEdit, nextElementOf, placeWords, previousElementOf, tagLabel } from "../src/edit/html";
import { type Change, createEditLog } from "../src/edit/log";
import { CHANGES_HEAD, diffText, netChanges, promptText } from "../src/edit/text";
import { actionsFor, treeEditKey } from "../src/ui/domedit";
import { dropAt, type Row } from "../src/ui/domtree";
import { as, elem, page, type PageNode, shadow, text } from "./dom-page";

const AT = { selector: "li.c" };
const PLACES = { from: { parent: "ul", next: null }, to: { parent: "ul", next: "li.a" } };

function must(change: Change | null): Change {
  if (!change) throw new Error("no change");
  return change;
}

function el(node: PageNode): Element {
  return as(node) as Element;
}

function names(list: PageNode): string {
  return list.childNodes.map((one) => (one.nodeType === 1 ? (one.getAttribute("class") ?? one.nodeName) : "#")).join(" ");
}

function menu(): { body: PageNode; list: PageNode; a: PageNode; b: PageNode; c: PageNode } {
  const a = elem("li", { class: "a" }, text("One"));
  const b = elem("li", { class: "b" }, text("Two"));
  const c = elem("li", { class: "c" }, text("Three"));
  const list = elem("ul", { class: "menu" }, a, text("\n"), b, c);
  const body = elem("body", {}, list, elem("div", { "data-devknobs": "" }));
  page(() => [elem("head"), body]);
  return { body, list, a, b, c };
}

const row = (node: PageNode, kind: Row["kind"] = "open"): Row => ({ kind, node: as(node), pseudo: null, depth: 1, more: 0 });

describe("a move", () => {
  test("puts an element before another, and undo and redo take it back and again", () => {
    const { list, a, c } = menu();
    const log = createEditLog();
    const edit = log.record(must(moveEdit(AT, el(c), { parent: el(list), next: el(a) }, PLACES)));
    expect(edit).toEqual({
      id: 1,
      kind: "move",
      target: AT,
      property: "node",
      before: 'at the end of <ul class="menu">',
      after: 'before <li class="a"> in <ul class="menu">',
      from: PLACES.from,
      to: PLACES.to,
    });
    expect(names(list)).toBe("c a # b");
    log.undo();
    expect(names(list)).toBe("a # b c");
    log.redo();
    expect(names(list)).toBe("c a # b");
    expect(log.undoAll()).toBe(1);
    expect(names(list)).toBe("a # b c");
  });

  test("into another element, at its end, and back where it stood among the texts", () => {
    const { body, list, a, b } = menu();
    const box = elem("section");
    body.insertBefore(box, list);
    const log = createEditLog();
    log.record(must(moveEdit(AT, el(a), { parent: el(box), next: null }, PLACES)));
    expect(names(box)).toBe("a");
    expect(names(list)).toBe("# b c");
    log.undo();
    expect(names(list)).toBe("a # b c");
    expect(b.parentNode).toBe(list);
  });

  test("is no change where the element already stands there", () => {
    const { list, a, b } = menu();
    expect(moveEdit(AT, el(a), { parent: el(list), next: el(b) }, PLACES)).toBeNull();
    expect(moveEdit(AT, el(a), { parent: el(list), next: el(a) }, PLACES)).toBeNull();
  });

  test("never takes the root, the head, the body, devknobs' own or an element holding it, nor goes into itself or a void element", () => {
    const { body, list, a } = menu();
    const doc = list.ownerDocument as PageNode;
    const html = doc.documentElement as PageNode;
    expect(movable(as(html))).toBe(false);
    expect(movable(as(body))).toBe(false);
    expect(movable(as(doc.head as PageNode))).toBe(false);
    expect(movable(as(body.childNodes[1] as PageNode))).toBe(false);
    const holder = elem("div", {}, elem("i", { "data-devknobs": "" }));
    body.append(holder);
    expect(movable(as(holder))).toBe(false);
    expect(movable(as(list))).toBe(true);
    expect(canHold(as(a), el(list))).toBe(false);
    expect(canHold(as(list), el(list))).toBe(false);
    expect(canHold(as(elem("img")), el(a))).toBe(false);
    expect(canHold(as(body.childNodes[1] as PageNode), el(a))).toBe(false);
    expect(moveEdit(AT, el(list), { parent: el(a), next: null }, PLACES)).toBeNull();
  });

  test("does not go on where the page moved the element since, nor come off where it moved it after", () => {
    const { body, list, a, b, c } = menu();
    const change = must(moveEdit(AT, el(c), { parent: el(list), next: el(a) }, PLACES));
    // appendChild, which moves a node as the browser does; the fake's append only adds.
    body.appendChild(c);
    const log = createEditLog();
    expect(log.record(change)).toBeNull();
    list.appendChild(c);
    const fresh = createEditLog();
    fresh.record(must(moveEdit(AT, el(c), { parent: el(list), next: el(a) }, PLACES)));
    // The page's own script moved it again: undo leaves it where the page put it.
    list.insertBefore(c, b);
    fresh.undo();
    expect(names(list)).toBe("a # c b");
  });

  test("never goes into an element in a shadow root inside it", () => {
    const inner = elem("span");
    const host = elem("x-card");
    shadow(host, elem("div", {}, inner));
    const dragged = elem("section", {}, host);
    page(() => [elem("head"), elem("body", {}, dragged)]);
    expect(canHold(as(inner), el(dragged))).toBe(false);
    expect(moveEdit(AT, el(dragged), { parent: el(inner), next: null }, PLACES)).toBeNull();
    expect(dropAt(row(inner), 0.5, el(dragged), false)).toBeNull();
  });

  test("never goes into a script, a textarea, the head or the root element, nor before the head", () => {
    const head = elem("head");
    const a = elem("div");
    const script = elem("script");
    const textarea = elem("textarea");
    const body = elem("body", {}, a, script, textarea);
    page(() => [head, body]);
    for (const parent of [script, textarea, head, body.parentNode as PageNode]) expect(canHold(as(parent), el(a))).toBe(false);
    expect(dropAt(row(head), 0.1, el(a), false)).toBeNull();
  });

  test("never moves a script, frame or base, nor an element that holds one", () => {
    const frame = elem("iframe");
    const holder = elem("div", {}, elem("p", {}, elem("script")));
    const base = elem("base");
    const plain = elem("p");
    const body = elem("body", {}, frame, holder, base, plain);
    page(() => [elem("head"), body]);
    for (const one of [frame, holder, base]) {
      expect(movable(as(one))).toBe(false);
      expect(moveEdit(AT, el(one), { parent: el(body), next: el(plain) }, PLACES)).toBeNull();
    }
    expect(movable(as(plain))).toBe(true);
  });

  test("says which of alike siblings a place is, and a move between them is never dropped from the changes", () => {
    const one = elem("li");
    const two = elem("li");
    const three = elem("li");
    const list = elem("ul", {}, one, two, three);
    page(() => [elem("body", {}, list)]);
    const log = createEditLog();
    const edit = log.record(must(moveEdit(AT, el(one), { parent: el(list), next: el(three) }, PLACES)));
    expect([edit?.before, edit?.after]).toEqual(["before the 2nd <li> in <ul>", "before the 3rd <li> in <ul>"]);
    const same = { id: 1, kind: "move" as const, target: AT, property: "node", before: "before <li> in <ul>", after: "before <li> in <ul>", from: PLACES.from, to: PLACES.to };
    expect(netChanges([same])[0]?.changes).toHaveLength(1);
  });

  test("finds the elements beside one, devknobs' own left out", () => {
    const { body, list, a, b, c } = menu();
    expect(nextElementOf(as(a))).toBe(el(b));
    expect(previousElementOf(as(b))).toBe(el(a));
    expect(nextElementOf(as(c))).toBeNull();
    expect(nextElementOf(as(list))).toBeNull();
    expect(body.childNodes.length).toBe(2);
  });

  test("says an element by its tag, id and classes", () => {
    const { list } = menu();
    expect(tagLabel(el(elem("li", { id: "x", class: " a  b " })))).toBe('<li id="x" class="a b">');
    expect(placeWords(el(list), null)).toBe('at the end of <ul class="menu">');
  });
});

describe("a move as text", () => {
  const move = {
    id: 1,
    kind: "move" as const,
    target: { selector: "li.c", source: "src/Menu.tsx:12" },
    property: "node",
    before: 'at the end of <ul class="menu">',
    after: 'before <li class="a"> in <ul class="menu">',
    from: { parent: "ul.menu", next: null },
    to: { parent: "ul.menu", next: "li.a" },
  };

  test("is a diff of where it was and where it went, and never merges with another move", () => {
    expect(diffText([move])).toBe('html of li.c\n- at the end of <ul class="menu">\n+ before <li class="a"> in <ul class="menu">');
    expect(netChanges([move, { ...move, id: 2, before: move.after, after: move.before }])[0]?.changes).toHaveLength(2);
  });

  test("asks the agent to move it, with the place as selectors and the source", () => {
    const prompt = promptText([move]);
    expect(prompt.startsWith(CHANGES_HEAD)).toBe(true);
    expect(prompt).toContain("Source: src/Menu.tsx:12");
    expect(prompt).toContain('move it: at the end of <ul class="menu"> -> before <li class="a"> in <ul class="menu"> (into `ul.menu`, before `li.a`)');
  });
});

describe("moving in the tree", () => {
  const key = (init: KeyboardEventInit & { key: string }, target: object = {}): KeyboardEvent =>
    Object.assign({ shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target, composedPath: () => [target] }, init) as unknown as KeyboardEvent;

  test("⇧↑ and ⇧↓ move the selected element, never in a field, and plain arrows do not", () => {
    expect(treeEditKey(key({ key: "ArrowUp", shiftKey: true }))).toBe("up");
    expect(treeEditKey(key({ key: "ArrowDown", shiftKey: true }))).toBe("down");
    expect(treeEditKey(key({ key: "ArrowUp" }))).toBeNull();
    expect(treeEditKey(key({ key: "ArrowUp", shiftKey: true, metaKey: true }))).toBeNull();
    const field = { tagName: "INPUT", localName: "input", type: "text", isContentEditable: false };
    expect(treeEditKey(key({ key: "ArrowUp", shiftKey: true }, field))).toBeNull();
  });

  test("a line moves up or down only where an element stands that way", () => {
    const { a, b, c } = menu();
    expect(actionsFor(row(a))).toContain("down");
    expect(actionsFor(row(a))).not.toContain("up");
    expect(actionsFor(row(b))).toEqual(expect.arrayContaining(["up", "down"]));
    expect(actionsFor(row(c))).not.toContain("down");
  });

  test("a drop goes before a line by its top, after it by its bottom, into it by its middle", () => {
    const { list, a, b, c } = menu();
    expect(dropAt(row(b), 0.1, el(c), false)).toEqual({ parent: el(list), next: el(b), where: "before" });
    expect(dropAt(row(a), 0.9, el(c), false)).toEqual({ parent: el(list), next: el(b), where: "after" });
    expect(dropAt(row(b), 0.5, el(c), false)).toEqual({ parent: el(b), next: null, where: "into" });
    expect(dropAt(row(list), 0.9, el(c), true)).toEqual({ parent: el(list), next: el(a), where: "after" });
    expect(dropAt(row(list, "close"), 0.2, el(c), true)).toEqual({ parent: el(list), next: null, where: "into" });
  });

  test("no drop on the element dragged, one in it, or a text", () => {
    const { list, a, c } = menu();
    expect(dropAt(row(c), 0.5, el(c), false)).toBeNull();
    expect(dropAt(row(a), 0.5, el(list), false)).toBeNull();
    expect(dropAt(row(a.childNodes[0] as PageNode, "text"), 0.5, el(c), false)).toBeNull();
  });
});
