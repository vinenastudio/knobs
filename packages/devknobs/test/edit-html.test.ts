import { describe, expect, test } from "bun:test";
import { attrEdit, deleteEdit, HIDE_ATTRIBUTE, HIDE_CSS, hideEdit, htmlEdit, successor, textEdit } from "../src/edit/html";
import { type Change, createEditLog, type Edit } from "../src/edit/log";
import { CHANGES_HEAD, diffText, KEEP_APPROACH, netChanges, promptText, RERENDER_NOTE } from "../src/edit/text";
import { actionsFor, applyHint, commitsHtml, textOf, textProperty, treeEditKey } from "../src/ui/domedit";
import type { Row } from "../src/ui/domtree";
import { as, comment, elem, page, type PageNode, shadow, text } from "./dom-page";

const AT = { selector: "a.cta" };

function must(change: Change | null): Change {
  if (!change) throw new Error("no change");
  return change;
}

function el(node: PageNode): Element {
  return as(node) as Element;
}

/** The page's markup under a node, as plain text, to compare before and after. */
function markup(node: PageNode): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  const attrs = node.attributes.map((attr) => ` ${attr.name}="${attr.value}"`).join("");
  const tag = node.nodeName.toLowerCase();
  return `<${tag}${attrs}>${node.childNodes.map(markup).join("")}</${tag}>`;
}

describe("a text edit", () => {
  test("changes a text, keeps the white space around it, and undo and redo take it off and on", () => {
    const words = text("\n  Get started\n");
    page(() => [elem("body", {}, elem("a", { class: "cta" }, words))]);
    const log = createEditLog();
    const edit = log.record(must(textEdit(AT, as(words), " Buy now ")));
    expect(edit).toEqual({ id: 1, kind: "text", target: AT, property: "text", before: "Get started", after: "Buy now" });
    expect(words.nodeValue).toBe("\n  Buy now\n");
    log.undo();
    expect(words.nodeValue).toBe("\n  Get started\n");
    log.redo();
    expect(words.nodeValue).toBe("\n  Buy now\n");
  });

  test("of a text among child elements keeps the elements, and says which text it is", () => {
    const first = text("Buy ");
    const second = text(" now");
    const bold = elem("b", {}, text("it"));
    page(() => [elem("body", {}, elem("button", {}, elem("svg"), first, bold, second))]);
    expect(textProperty(as(first))).toBe("text");
    expect(textProperty(as(second))).toBe("text 2");
    const log = createEditLog();
    log.record(must(textEdit(AT, as(second), "today", textProperty(as(second)))));
    const button = second.parentNode as PageNode;
    expect(button.childNodes.map((one) => one.nodeName)).toEqual(["SVG", "#text", "B", "#text"]);
    expect(second.nodeValue).toBe(" today");
    expect(log.list()[0]?.property).toBe("text 2");
  });

  test("is no change where the text stays the same, or would be empty", () => {
    const words = text("Save");
    page(() => [elem("body", {}, elem("button", {}, words))]);
    expect(textEdit(AT, as(words), " Save ")).toBeNull();
    expect(textEdit(AT, as(words), "  ")).toBeNull();
  });

  test("whose text the page changed since stays as text, and undo leaves the page's text", () => {
    const words = text("Save");
    page(() => [elem("body", {}, elem("button", {}, words))]);
    const log = createEditLog();
    log.record(must(textEdit(AT, as(words), "Keep")));
    words.nodeValue = "Rendered";
    expect(log.list()).toHaveLength(1);
    log.undo();
    expect(words.nodeValue).toBe("Rendered");
    expect(log.list()).toEqual([]);
    // Redo finds the page changed, does nothing and says so.
    expect(log.redo()).toBeNull();
    expect(words.nodeValue).toBe("Rendered");
    expect(log.list()).toEqual([]);
  });
});

describe("an attribute edit", () => {
  test("changes a value, adds one and takes one out, each undone in turn", () => {
    const link = elem("a", { class: "cta", href: "#" });
    page(() => [elem("body", {}, link)]);
    const log = createEditLog();
    expect(log.record(must(attrEdit(AT, el(link), "class", "cta cta-lg")))).toMatchObject({ kind: "attr", property: "class", before: "cta", after: "cta cta-lg" });
    expect(log.record(must(attrEdit(AT, el(link), "Data-Track", "hero")))).toMatchObject({ property: "data-track", before: null, after: "hero" });
    expect(log.record(must(attrEdit(AT, el(link), "href", null)))).toMatchObject({ property: "href", before: "#", after: null });
    expect(markup(link)).toBe('<a class="cta cta-lg" data-track="hero"></a>');
    log.undo();
    expect(link.getAttribute("href")).toBe("#");
    log.undo();
    expect(link.hasAttribute("data-track")).toBe(false);
    log.undo();
    expect(link.getAttribute("class")).toBe("cta");
    log.redo();
    expect(link.getAttribute("class")).toBe("cta cta-lg");
  });

  test("is no change for the value it has, or for an attribute of devknobs'", () => {
    const link = elem("a", { class: "cta" });
    page(() => [elem("body", {}, link)]);
    expect(attrEdit(AT, el(link), "class", "cta")).toBeNull();
    expect(attrEdit(AT, el(link), "data-devknobs-hide", "")).toBeNull();
    expect(attrEdit(AT, el(link), "data-knobs-hide", "")).toBeNull();
    expect(attrEdit(AT, el(link), "data-knobs", "panel")).toBeNull();
    expect(attrEdit(AT, el(link), "  ", "x")).toBeNull();
  });

  test("sets the page's own data-knobs-… attributes, which another tool on the page writes", () => {
    const link = elem("a", { class: "cta" });
    page(() => [elem("body", {}, link)]);
    expect(attrEdit(AT, el(link), "data-knobs-theme", "dark")).not.toBeNull();
    expect(attrEdit(AT, el(link), "data-knobs-font", "serif")).not.toBeNull();
  });

  test("whose value the page set since is left as the page set it on undo", () => {
    const link = elem("a", { class: "cta" });
    page(() => [elem("body", {}, link)]);
    const log = createEditLog();
    log.record(must(attrEdit(AT, el(link), "class", "mine")));
    link.setAttribute("class", "theirs");
    log.undo();
    expect(link.getAttribute("class")).toBe("theirs");
  });
});

describe("an html edit", () => {
  test("puts the new nodes in the element's place, and undo puts the very element back", () => {
    const old = elem("div", { class: "block" }, elem("b", {}, text("Old")));
    const after = elem("p");
    const body = elem("body", {}, old, after);
    page(() => [body]);
    const made = [elem("div", { class: "new" }, text("New")), text("\n")];
    const log = createEditLog();
    const edit = log.record(must(htmlEdit(AT, el(old), '<div class="block"><b>Old</b></div>', made.map(as))));
    expect(edit).toMatchObject({ kind: "html", property: "html", before: '<div class="block"><b>Old</b></div>', after: '<div class="new">New</div>' });
    expect(body.childNodes).toEqual([made[0] as PageNode, made[1] as PageNode, after]);
    expect(old.parentNode).toBeNull();
    expect(successor(as(old))).toBe(as(made[0] as PageNode));
    log.undo();
    expect(body.childNodes).toEqual([old, after]);
    expect(successor(as(made[0] as PageNode))).toBe(as(old));
    log.redo();
    expect(body.childNodes).toEqual([made[0] as PageNode, made[1] as PageNode, after]);
  });

  test("keeps as its after the markup the browser writes back, and refuses devknobs' own attribute", () => {
    const old = elem("div");
    page(() => [elem("body", {}, old)]);
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("img", { src: "x" }))])?.edit.after).toBe('<img src="x">');
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("p")), as(text(" a < b & c > d"))])?.edit.after).toBe("<p></p> a &lt; b &amp; c &gt; d");
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("p", {}, elem("b", { "data-devknobs-hide": "" })))])).toBeNull();
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("p", { "data-devknobs": "x" }))])).toBeNull();
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("p", { "data-knobs": "x" }))])).toBeNull();
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("p", {}, elem("b", { "data-knobs-hide": "" })))])).toBeNull();
    // Another tool's names are the page's.
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("p", { "data-knobs-theme": "dark", "data-knobs-font": "serif" }))])?.edit.after).toBe('<p data-knobs-theme="dark" data-knobs-font="serif"></p>');
  });

  test("whose element the page moved since changes nothing, and is dropped", () => {
    const old = elem("div");
    const other = elem("section");
    const body = elem("body", {}, old, other);
    page(() => [body]);
    const made = elem("p");
    const log = createEditLog();
    log.record(must(htmlEdit(AT, el(old), "<div></div>", [as(made)])));
    // Page code moves the new element somewhere else: undo leaves it there.
    other.insertBefore(made, null);
    log.undo();
    expect(other.childNodes).toEqual([made]);
    expect(old.parentNode).toBeNull();
    // Moved back and undone, then the old element moved by the page: redo is refused and changes nothing.
    const again = elem("div");
    body.insertBefore(again, null);
    const second = log.record(must(htmlEdit(AT, el(again), "<div></div>", [as(elem("p"))])));
    expect(second).not.toBeNull();
    log.undo();
    other.insertBefore(again, null);
    expect(log.redo()).toBeNull();
    expect(other.childNodes.at(-1)).toBe(again);
  });

  test("is refused for html with no element in it, or the markup it has", () => {
    const old = elem("div");
    page(() => [elem("body", {}, old)]);
    expect(htmlEdit(AT, el(old), "<div></div>", [as(text("just text"))])).toBeNull();
    expect(htmlEdit(AT, el(old), "<div></div>", [as(elem("div"))])).toBeNull();
  });

  test("whose new element the page took out stays as text, and undo changes nothing", () => {
    const old = elem("div");
    const body = elem("body", {}, old);
    page(() => [body]);
    const made = elem("section");
    const log = createEditLog();
    log.record(must(htmlEdit(AT, el(old), "<div></div>", [as(made)])));
    // The framework renders again, and puts its own node there.
    const theirs = elem("div", { id: "rendered" });
    body.removeChild(made);
    body.append(theirs);
    expect(log.list()).toHaveLength(1);
    log.undo();
    expect(body.childNodes).toEqual([theirs]);
    expect(log.list()).toEqual([]);
  });
});

describe("a hide", () => {
  test("hides with devknobs' attribute, never the page's style, and a second one shows it again", () => {
    const ad = elem("p", { class: "ad", style: "color: red" });
    page(() => [elem("body", {}, ad)]);
    const styled: Element[] = [];
    const log = createEditLog();
    expect(log.record(hideEdit(AT, el(ad), (element) => styled.push(element)))).toMatchObject({ kind: "hide", property: "hidden", before: null, after: "hidden" });
    expect(ad.hasAttribute(HIDE_ATTRIBUTE)).toBe(true);
    expect(ad.hasAttribute("data-knobs-hide")).toBe(true);
    expect(ad.getAttribute("style")).toBe("color: red");
    expect(styled).toEqual([el(ad)]);
    expect(log.record(hideEdit(AT, el(ad), () => undefined))).toMatchObject({ before: "hidden", after: null });
    expect(ad.hasAttribute(HIDE_ATTRIBUTE)).toBe(false);
    expect(ad.hasAttribute("data-knobs-hide")).toBe(false);
    log.undo();
    expect(ad.hasAttribute(HIDE_ATTRIBUTE)).toBe(true);
    log.undoAll();
    expect(ad.hasAttribute(HIDE_ATTRIBUTE)).toBe(false);
    expect(netChanges(log.list())).toEqual([]);
  });

  test("shows again an element an older copy hid, which has only the old name", () => {
    const ad = elem("p", { "data-devknobs-hide": "" });
    page(() => [elem("body", {}, ad)]);
    const log = createEditLog();
    expect(log.record(hideEdit(AT, el(ad), () => undefined))).toMatchObject({ before: "hidden", after: null });
    expect(ad.hasAttribute(HIDE_ATTRIBUTE)).toBe(false);
  });

  test("an older copy that shows it again takes off only the old name: the element is not hidden", () => {
    const ad = elem("p", { "data-devknobs-hide": "", "data-knobs-hide": "" });
    page(() => [elem("body", {}, ad)]);
    ad.removeAttribute(HIDE_ATTRIBUTE);
    const log = createEditLog();
    expect(log.record(hideEdit(AT, el(ad), () => undefined))).toMatchObject({ before: null, after: "hidden" });
    expect(ad.hasAttribute(HIDE_ATTRIBUTE)).toBe(true);
  });
});

describe("a delete", () => {
  test("takes the node out, and undo puts it back where it stood, two in a row in their order", () => {
    const [one, two, three, four] = ["1", "2", "3", "4"].map((name) => elem("li", { id: name }));
    const list = elem("ul", {}, one as PageNode, two as PageNode, three as PageNode, four as PageNode);
    page(() => [elem("body", {}, list)]);
    const ids = () => list.childNodes.map((node) => node.getAttribute("id"));
    const log = createEditLog();
    log.record(must(deleteEdit(AT, as(two as PageNode), '<li id="2"></li>')));
    log.record(must(deleteEdit(AT, as(three as PageNode), '<li id="3"></li>')));
    expect(ids()).toEqual(["1", "4"]);
    expect(log.list()[0]).toMatchObject({ kind: "delete", property: "node", before: '<li id="2"></li>', after: null });
    log.undo();
    expect(ids()).toEqual(["1", "3", "4"]);
    log.redo();
    log.undoAll();
    expect(ids()).toEqual(["1", "2", "3", "4"]);
  });

  test("goes back first where it was first and the node after it went", () => {
    const [one, two, three] = ["1", "2", "3"].map((name) => elem("li", { id: name }));
    const list = elem("ul", {}, one as PageNode, two as PageNode, three as PageNode);
    page(() => [elem("body", {}, list)]);
    const log = createEditLog();
    log.record(must(deleteEdit(AT, as(one as PageNode), "")));
    list.removeChild(two as PageNode);
    log.undo();
    expect(list.childNodes.map((node) => node.getAttribute("id"))).toEqual(["1", "3"]);
  });

  test("goes back after the node before it where the one after it went, and nowhere where its parent went", () => {
    const [one, two, three] = ["1", "2", "3"].map((name) => elem("li", { id: name }));
    const list = elem("ul", {}, one as PageNode, two as PageNode, three as PageNode);
    const body = elem("body", {}, list);
    page(() => [body]);
    const log = createEditLog();
    log.record(must(deleteEdit(AT, as(two as PageNode), "")));
    list.removeChild(three as PageNode);
    log.undo();
    expect(list.childNodes.map((node) => node.getAttribute("id"))).toEqual(["1", "2"]);

    log.record(must(deleteEdit(AT, as(two as PageNode), "")));
    body.removeChild(list);
    log.undo();
    expect(two?.parentNode).toBeNull();
  });

  test("is refused for a node with no parent", () => {
    expect(deleteEdit(AT, as(elem("li")), "")).toBeNull();
  });
});

describe("html edits as text", () => {
  const style: Edit = { id: 1, kind: "css-value", target: { selector: "a.cta", rule: { selectorText: ".cta", sheet: "https://site.test/app.css", owner: "link", sheetId: 1, path: [0], context: [] } }, property: "padding", before: "8px", after: "10px" };
  const html: Edit[] = [
    { id: 2, kind: "text", target: { selector: "a.cta", source: "src/Hero.tsx:42" }, property: "text", before: "Start now", after: "Go" },
    { id: 3, kind: "text", target: { selector: "a.cta" }, property: "text", before: "Go", after: "Get started free" },
    { id: 4, kind: "attr", target: { selector: "a.cta" }, property: "class", before: "cta", after: "cta cta-lg" },
    { id: 5, kind: "attr", target: { selector: "a.cta" }, property: "data-x", before: null, after: "1" },
    { id: 6, kind: "attr", target: { selector: "a.cta" }, property: "data-x", before: "1", after: null },
    { id: 7, kind: "html", target: { selector: "div.block" }, property: "html", before: "<div class=\"block\">Old</div>", after: "<div>\n2. New</div>" },
    { id: 8, kind: "hide", target: { selector: "p.ad" }, property: "hidden", before: null, after: "hidden" },
    { id: 9, kind: "delete", target: { selector: "li.gone" }, property: "node", before: "<li class=\"gone\">two</li>", after: null },
  ];

  test("are one place for each element, apart from its style, an attribute added and taken out no change", () => {
    const groups = netChanges([style, ...html]);
    expect(groups.map((group) => [group.target.selector, group.markup, group.changes.map((one) => `${one.kind} ${one.property}`)])).toEqual([
      ["a.cta", false, ["css-value padding"]],
      ["a.cta", true, ["text text", "attr class"]],
      ["div.block", true, ["html html"]],
      ["p.ad", true, ["hide hidden"]],
      ["li.gone", true, ["delete node"]],
    ]);
  });

  test("never merge a real hidden attribute with a hide", () => {
    const mixed: Edit[] = [
      { id: 1, kind: "attr", target: { selector: "p" }, property: "hidden", before: "", after: null },
      { id: 2, kind: "hide", target: { selector: "p" }, property: "hidden", before: null, after: "hidden" },
    ];
    expect(netChanges(mixed)[0]?.changes.map((one) => one.kind)).toEqual(["attr", "hide"]);
  });

  test("never merge two deletes, as a selector after a node taken out names the next one", () => {
    const deletes: Edit[] = [
      { id: 1, kind: "delete", target: { selector: "ul > li:nth-child(2)" }, property: "node", before: "<li>two</li>", after: null },
      { id: 2, kind: "delete", target: { selector: "ul > li:nth-child(2)" }, property: "node", before: "<li>three</li>", after: null },
    ];
    expect(diffText(deletes)).toBe(["html of ul > li:nth-child(2)", "- <li>two</li>", "- <li>three</li>"].join("\n"));
    expect(promptText(deletes)).toContain("   delete: <li>two</li>\n   delete: <li>three</li>");
  });

  test("merge an html edit into the one before only where it goes on from its value", () => {
    const texts: Edit[] = [
      { id: 1, kind: "text", target: { selector: "p" }, property: "text 2", before: "b", after: "B" },
      { id: 2, kind: "delete", target: { selector: "p" }, property: "text", before: "a", after: null },
      // Now the first text: the one edited before, which a `text 2` no longer names.
      { id: 3, kind: "text", target: { selector: "p" }, property: "text", before: "B", after: "C" },
      { id: 4, kind: "text", target: { selector: "p" }, property: "text 2", before: "c", after: "D" },
      { id: 5, kind: "text", target: { selector: "p" }, property: "text 2", before: "D", after: "E" },
    ];
    expect(netChanges(texts)[0]?.changes.map((one) => [one.kind, one.property, one.before, one.after])).toEqual([
      ["text", "text 2", "b", "B"],
      ["delete", "text", "a", null],
      ["text", "text", "B", "C"],
      ["text", "text 2", "c", "E"],
    ]);
  });

  test("diff as quoted values, markup as data, and a hide", () => {
    expect(diffText(html)).toBe(
      [
        "html of a.cta",
        '- text: "Start now"',
        '+ text: "Get started free"',
        '- class: "cta"',
        '+ class: "cta cta-lg"',
        "",
        "html of div.block",
        '- <div class="block">Old</div>',
        '+ "<div>\\n2. New</div>"',
        "",
        "html of p.ad",
        "+ hidden",
        "",
        "html of li.gone",
        '- <li class="gone">two</li>',
      ].join("\n"),
    );
  });

  test("ask an agent to change the source, not the DOM, with the style note where styles changed too", () => {
    const prompt = promptText([style, ...html]);
    expect(prompt).toBe(
      [
        CHANGES_HEAD,
        "",
        "1. Element `a.cta`",
        "   Rule: `.cta` in https://site.test/app.css",
        "   padding: 8px -> 10px",
        "",
        "2. Element `a.cta`",
        "   Source: src/Hero.tsx:42",
        "   In the element's html",
        '   text: "Start now" -> "Get started free"',
        '   attribute class: "cta" -> "cta cta-lg"',
        "",
        "3. Element `div.block`",
        "   In the element's html",
        '   html: <div class="block">Old</div> -> "<div>\\n2. New</div>"',
        "",
        "4. Element `p.ad`",
        "   In the element's html",
        "   hide it: the panel hid it with visibility: hidden",
        "",
        "5. Element `li.gone`",
        "   In the element's html",
        '   delete: <li class="gone">two</li>',
        "",
        KEEP_APPROACH,
        RERENDER_NOTE,
      ].join("\n"),
    );
    expect(prompt.split("\n").some((line) => line.startsWith("2. New"))).toBe(false);
    const only = promptText(html);
    expect(only.startsWith(CHANGES_HEAD)).toBe(true);
    expect(only.endsWith(`\n\n${RERENDER_NOTE}`)).toBe(true);
    expect(only).not.toContain(KEEP_APPROACH);
  });
});

describe("the tree's edit keys", () => {
  const key = (name: string, more: Partial<KeyboardEvent> = {}, target: unknown = null) =>
    ({ key: name, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, target, composedPath: () => [target], ...more }) as unknown as KeyboardEvent;

  test("take the letter's key on a layout that is not latin", () => {
    expect(treeEditKey(key("ф", { code: "KeyA" }))).toBe("attr");
    expect(treeEditKey(key("р", { code: "KeyH" }))).toBe("hide");
  });

  test("are plain keys", () => {
    expect(treeEditKey(key("Enter"))).toBe("text");
    expect(treeEditKey(key("a"))).toBe("attr");
    expect(treeEditKey(key("F2"))).toBe("html");
    expect(treeEditKey(key("h"))).toBe("hide");
    expect(treeEditKey(key("H", { shiftKey: true }))).toBeNull();
    expect(treeEditKey(key("Delete"))).toBe("delete");
    expect(treeEditKey(key("Backspace"))).toBe("delete");
    expect(treeEditKey(key("x"))).toBeNull();
  });

  test("never act with a modifier, or while a field has the focus", () => {
    expect(treeEditKey(key("h", { metaKey: true }))).toBeNull();
    expect(treeEditKey(key("Backspace", { ctrlKey: true }))).toBeNull();
    expect(treeEditKey(key("h", { altKey: true }))).toBeNull();
    for (const tagName of ["INPUT", "TEXTAREA"]) {
      const field = { tagName, hasAttribute: () => false };
      expect(treeEditKey(key("h", {}, field))).toBeNull();
      expect(treeEditKey(key("Backspace", {}, field))).toBeNull();
      expect(treeEditKey(key("Enter", {}, field))).toBeNull();
    }
  });

  test("in the html field, Enter breaks the line, and shift and Enter puts the edit on, shown as ⇧↩", () => {
    const press = (more: Partial<KeyboardEvent>) => commitsHtml({ key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...more });
    expect(press({})).toBe(false);
    expect(press({ shiftKey: true })).toBe(true);
    expect(press({ metaKey: true })).toBe(true);
    expect(press({ ctrlKey: true })).toBe(true);
    expect(press({ shiftKey: true, altKey: true })).toBe(false);
    expect(press({ key: "a", shiftKey: true })).toBe(false);
    expect(applyHint(true)).toBe("⇧↩");
    expect(applyHint(false)).toBe("Shift Enter");
  });

  test("act on what a line can take", () => {
    const words = text("Save");
    const button = elem("button", {}, words);
    const doc = page(() => [elem("body", {}, button)]);
    const html = doc.documentElement as PageNode;
    const line = (node: PageNode, kind: Row["kind"], pseudo: string | null = null): Row => ({ kind, node: as(node), pseudo, depth: 0, more: 0 });
    expect(actionsFor(line(button, "open"))).toEqual(["text", "attr", "html", "hide", "delete"]);
    expect(textOf(line(button, "open"))).toBe(as(words));
    expect(actionsFor(line(words, "text"))).toEqual(["text", "delete"]);
    expect(actionsFor(line(html, "open"))).toEqual(["attr"]);
    expect(actionsFor(line(button, "pseudo", "::before"))).toEqual([]);
    expect(actionsFor(null)).toEqual([]);
  });

  test("leave out what would take the panel with it, and a text or comment not in an element", () => {
    const panel = elem("div", { "data-devknobs": "panel" });
    const host = elem("x-card");
    const loose = text("in the root");
    const body = elem("body", {}, host, panel);
    const doc = page(() => [elem("head", {}, elem("style", { "data-devknobs": "styles" })), body]);
    shadow(host, loose, comment("note"));
    const head = (doc.documentElement as PageNode).childNodes[0] as PageNode;
    const line = (node: PageNode, kind: Row["kind"]): Row => ({ kind, node: as(node), pseudo: null, depth: 0, more: 0 });
    expect(actionsFor(line(body, "open"))).toEqual(["attr"]);
    // The head and body stay without devknobs' nodes in them too, as where its styles are adopted.
    const bare = page(() => [elem("head"), elem("body", {}, elem("p"))]);
    for (const one of (bare.documentElement as PageNode).childNodes) expect(actionsFor(line(one, "open"))).toEqual(["attr"]);
    expect(actionsFor(line(head, "open"))).toEqual(["attr"]);
    expect(actionsFor(line(host, "open"))).toEqual(["attr", "html", "hide", "delete"]);
    expect(actionsFor(line(loose, "text"))).toEqual([]);
    expect(textOf(line(loose, "text"))).toBeNull();
    expect(actionsFor(line((host.shadowRoot as PageNode).childNodes[1] as PageNode, "comment"))).toEqual([]);
    expect(HIDE_CSS).toContain(`[${HIDE_ATTRIBUTE}] *`);
    expect(HIDE_CSS).not.toContain("data-knobs-hide");
  });
});
