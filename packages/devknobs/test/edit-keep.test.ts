import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { cssOff, cssOn, cssValue, offIn } from "../src/edit/css";
import { attrEdit, deleteEdit, hideEdit, moveEdit, textEdit } from "../src/edit/html";
import {
  createKeeper,
  EDITS_KEY,
  EDITS_VERSION,
  type EditsStore,
  framedPage,
  localEditsStore,
  MAX_BYTES,
  MAX_EDITS,
  MAX_PAGES,
  REASONS,
  type Replay,
  readKept,
  readSavedEdit,
  type SavedEdit,
  toKept,
} from "../src/edit/keep";
import { type Change, createEditLog, type Edit, type EditLog } from "../src/edit/log";
import { AFTER_MISSED, replayEdits } from "../src/edit/replay";
import { RISK } from "../src/edit/risk";
import { as, elem, page, type PageNode, svg, text } from "./dom-page";
import { Block, fakeCss } from "./edit-block";

beforeAll(() => {
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: fakeCss });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "CSS");
});

function must(change: Change | null): Change {
  if (!change) throw new Error("no change");
  return change;
}

const RULE = { selectorText: ".cta", sheet: "https://site.test/app.css", owner: "link", sheetId: 4, path: [3, 0], context: ["@media (min-width: 640px)"] };

/** One edit of every kind, as `edits()` gives them. */
const EVERY: Edit[] = [
  { id: 1, kind: "css-value", target: { selector: "a.cta", source: "src/Hero.tsx:42", rule: RULE }, property: "padding", before: "8px 14px", after: "10px 18px" },
  { id: 2, kind: "css-toggle", target: { selector: "a.cta", rule: RULE }, property: "box-shadow", before: "0 1px 2px #0003", after: null },
  { id: 3, kind: "css-add", target: { selector: "a.cta" }, property: "outline", before: null, after: "2px solid red !important" },
  { id: 4, kind: "css-rule", target: { selector: "a.cta", rule: { selectorText: ".cta:hover", sheet: "new rule", owner: null, sheetId: 9, path: [0], context: [] } }, property: "rule", before: null, after: ".cta:hover" },
  { id: 5, kind: "text", target: { selector: "h1" }, property: "text 2", before: "Start\nnow", after: "Go" },
  { id: 6, kind: "attr", target: { selector: "h1" }, property: "data-x", before: null, after: '"quoted"' },
  { id: 7, kind: "html", target: { selector: "p" }, property: "html", before: "<p>a</p>", after: "<p>b</p>" },
  { id: 8, kind: "hide", target: { selector: "p" }, property: "hidden", before: null, after: "hidden" },
  { id: 9, kind: "delete", target: { selector: "p" }, property: "comment", before: "<!--x-->", after: null },
  { id: 10, kind: "move", target: { selector: "li.c" }, property: "node", before: "at the end of <ul>", after: "before <li> in <ul>", from: { parent: "ul", next: null }, to: { parent: "ul", next: "li.a" } },
];

describe("kept edits as json", () => {
  test("every kind goes through json and comes back as it was, its id left out", () => {
    const { kept, cut } = toKept(EVERY);
    expect(cut).toBe(0);
    const back = readKept(JSON.parse(JSON.stringify(kept)));
    expect(back).toEqual({ v: EDITS_VERSION, edits: EVERY.map(({ id: _id, ...edit }) => edit) });
    for (const one of EVERY) expect(readSavedEdit(one)).not.toBeNull();
  });

  test("anything that is not an edit is not read", () => {
    const [first] = EVERY;
    expect(readSavedEdit({ ...first, kind: "eval" })).toBeNull();
    expect(readSavedEdit({ ...first, target: { selector: "" } })).toBeNull();
    expect(readSavedEdit({ ...first, before: 3 })).toBeNull();
    expect(readSavedEdit({ ...first, target: { selector: "a", rule: { ...RULE, path: [-1] } } })).toBeNull();
    expect(readSavedEdit({ ...EVERY[9], to: undefined })).toBeNull();
    expect(readSavedEdit({ ...first, property: "x".repeat(70 * 1024) })).toBeNull();
    expect(readKept({ v: EDITS_VERSION + 1, edits: [] })).toBeNull();
    expect(readKept({ v: 1, edits: [first, { kind: "nope" }] })).toBeNull();
    expect(readKept({ v: 1, edits: Array(MAX_EDITS + 1).fill(first) })).toBeNull();
    expect(readKept("[]")).toBeNull();
    const fat = { kind: "attr", target: { selector: "p" }, property: "title", before: null, after: "x".repeat(60 * 1024) };
    expect(readKept({ v: 1, edits: [fat, fat, fat, fat, fat] })).toBeNull();
    expect(readKept({ v: 1, edits: [{ kind: "html", target: { selector: "p" }, property: "html", before: "<p>a</p>", after: '<img src=x onerror="a()">' }] })).toBeNull();
    // One kept before items had a version reads as this one.
    expect(readKept({ edits: [] })).toEqual({ v: EDITS_VERSION, edits: [] });
  });

  test("keeps the first edits that fit in the caps, and says how many more there were", () => {
    const many = Array.from({ length: MAX_EDITS + 50 }, (_, at) => ({ ...EVERY[2], id: at + 1 }) as Edit);
    expect(toKept(many).kept.edits).toHaveLength(MAX_EDITS);
    expect(toKept(many).cut).toBe(50);
    const big = Array.from({ length: 10 }, (_, at) => ({ ...EVERY[6], id: at + 1, after: "x".repeat(60 * 1024) }) as Edit);
    const { kept, cut } = toKept(big);
    expect(kept.edits).toHaveLength(4);
    expect(cut).toBe(6);
    expect(JSON.stringify(kept.edits).length).toBeLessThanOrEqual(MAX_BYTES);
  });

  test("count the list's json to the character: one that fills it exactly is kept, a character more is cut", () => {
    const one = (id: number, after = "b".repeat(1500)): Edit => ({ id, kind: "css-value", target: { selector: ".a" }, property: "color", before: "r", after });
    const size = (edit: Edit): number => JSON.stringify({ ...edit, id: undefined }).length + 1;
    const step = size(one(1));
    const list = Array.from({ length: Math.floor((MAX_BYTES - 2000) / step) }, (_, at) => one(at + 1));
    // The list's json: its opening bracket, then each edit with a comma or the closing bracket.
    const room = MAX_BYTES - 1 - list.length * step - step;
    const full = [...list, one(list.length + 1, `${"b".repeat(1500)}${"z".repeat(room)}`)];
    expect(JSON.stringify(toKept(full).kept.edits).length).toBe(MAX_BYTES);
    expect(toKept(full).cut).toBe(0);
    const over = [...list, one(list.length + 1, `${"b".repeat(1500)}${"z".repeat(room + 1)}`)];
    expect(toKept(over).cut).toBe(1);
  });

  test("stop at an edit that would not read back, or that could run a script, and count it and all after it", () => {
    const small: Edit = { id: 1, kind: "css-value", target: { selector: ".a" }, property: "color", before: "red", after: "blue" };
    const big: Edit = { id: 2, kind: "html", target: { selector: "main" }, property: "html", before: `<main>${"x".repeat(70_000)}</main>`, after: "<main>y</main>" };
    const { kept, cut } = toKept([small, big, small]);
    expect(kept.edits).toHaveLength(1);
    expect(cut).toBe(2);
    expect(readKept(JSON.parse(JSON.stringify(kept)))).not.toBeNull();
    const handler: Edit = { id: 3, kind: "attr", target: { selector: "img" }, property: "onerror", before: null, after: "alert(1)" };
    expect(toKept([small, handler]).cut).toBe(1);
  });
});

/** A page with an element of each kind the html edits take, found by `[data-*]` selectors. */
function shop(): { doc: PageNode; h1: PageNode; lead: PageNode; list: PageNode; a: PageNode; c: PageNode; cta: PageNode & { style: Block } } {
  const h1 = elem("h1", { "data-h1": "" }, text("Ship "), elem("b", {}, text("it")), text(" faster"));
  const lead = elem("p", { "data-lead": "" }, text("Tools"));
  const a = elem("li", { "data-a": "" }, text("One"));
  const c = elem("li", { "data-c": "" }, text("Three"));
  const list = elem("ul", { "data-list": "" }, a, elem("li", { "data-b": "" }, text("Two")), c);
  const cta = Object.assign(elem("a", { "data-cta": "", style: "padding: 8px; color: red;" }, text("Buy")), { style: new Block("padding: 8px; color: red;") });
  const doc = page(() => [elem("head"), elem("body", {}, h1, lead, list, cta)]);
  return { doc, h1, lead, list, a, c, cta };
}

/** What the page shows, as text: its markup and the cta's style. */
function seen(at: ReturnType<typeof shop>): string {
  const body = at.doc.documentElement?.childNodes.find((one) => one.nodeName === "BODY");
  const mark = (node: PageNode): string => (node.nodeType === 3 ? (node.nodeValue ?? "") : `<${node.nodeName}${node.attributes.map((one) => ` ${one.name}`).join("")}>${node.childNodes.map(mark).join("")}</>`);
  return `${body ? mark(body) : ""} ${at.cta.style.cssText}`;
}

/** Make one edit of each html kind and inline css kind on a page, through a log. */
function editShop(at: ReturnType<typeof shop>, log: EditLog): void {
  const cta = { style: at.cta.style as unknown as CSSStyleDeclaration, element: as(at.cta) as Element, selector: "[data-cta]" };
  const second = at.h1.childNodes[2] as PageNode;
  log.record(must(textEdit({ selector: "[data-h1]" }, as(second), "fast", "text 2")));
  log.record(must(attrEdit({ selector: "[data-h1]" }, as(at.h1) as Element, "title", "Hi")));
  log.record(must(hideEdit({ selector: "[data-lead]" }, as(at.lead) as Element, () => undefined)));
  log.record(must(moveEdit({ selector: "[data-c]" }, as(at.c) as Element, { parent: as(at.list) as Element, next: as(at.a) as Element }, { from: { parent: "[data-list]", next: null }, to: { parent: "[data-list]", next: "[data-a]" } })));
  log.record(must(cssValue("css-value", cta, "padding", "10px")));
  log.record(must(cssOff(cta, "color", log.recorded)));
  log.record(must(cssValue("css-add", cta, "margin", "4px")));
  const off = offIn(log.recorded(), cta.style).find((one) => one.property === "color");
  if (!off) throw new Error("color is not off");
  log.record(cssOn(cta, off, log.recorded));
  log.record(must(deleteEdit({ selector: "[data-a]" }, as(at.a), "<li>One</li>", "node")));
}

describe("edits made again", () => {
  test("on the same page as it loads again, they make it as it was", () => {
    const first = shop();
    const log = createEditLog();
    editShop(first, log);
    const list = JSON.parse(JSON.stringify(log.list()));
    // `<li>One</li>` is the delete's markup as the tree copies it, which this page writes with its attribute.
    list[8].before = '<li data-a="">One</li>';
    const again = shop();
    const fresh = shop();
    const replay = createEditLog();
    const result = replayEdits(replay, list, false, as(again.doc) as Document);
    expect(result.skipped).toEqual([]);
    expect(result.applied.map((one) => one.kind)).toEqual(["text", "attr", "hide", "move", "css-value", "css-toggle", "css-add", "css-toggle", "delete"]);
    expect(seen(again)).not.toBe(seen(fresh));
    expect(seen(again)).toBe(seen(first).replace("<LI data-a>One</>", ""));
    // They are the log's as any: undo all puts the page back.
    replay.undoAll();
    expect(seen(again)).toBe(seen(fresh));
  });

  test("skip an edit whose value before the page no longer has, or whose element it no longer has, and go on", () => {
    const at = shop();
    const list: SavedEdit[] = [
      { kind: "attr", target: { selector: "[data-h1]" }, property: "title", before: "Old", after: "New" },
      { kind: "text", target: { selector: "[data-gone]" }, property: "text", before: "x", after: "y" },
      { kind: "css-value", target: { selector: "[data-cta]" }, property: "padding", before: "9px", after: "1px" },
      { kind: "text", target: { selector: "[data-lead]" }, property: "text", before: "Tools", after: "Kit" },
      { kind: "move", target: { selector: "[data-c]" }, property: "node", before: "", after: "", from: { parent: "[data-list]", next: "[data-a]" }, to: { parent: "[data-list]", next: "[data-a]" } },
    ];
    const result = replayEdits(createEditLog(), [...list, { kind: "eval" }], false, as(at.doc) as Document);
    expect(result.skipped.map((one) => one.reason)).toEqual([REASONS.changed, REASONS.missing, REASONS.changed, REASONS.changed, REASONS.invalid]);
    // The move that was not made leaves the page another: nothing after it is made.
    expect(replayEdits(createEditLog(), [list[4], list[3], list[0]], false, as(at.doc) as Document).skipped.map((one) => one.reason)).toEqual([REASONS.changed, AFTER_MISSED, AFTER_MISSED]);
    expect(result.applied.map((one) => one.after)).toEqual(["Kit"]);
    expect(at.lead.childNodes[0]?.nodeValue).toBe("Kit");
  });

  test("as the page loads, leave the first html or attribute edit and all after it waiting", () => {
    const at = shop();
    const list: SavedEdit[] = [
      { kind: "text", target: { selector: "[data-lead]" }, property: "text", before: "Tools", after: "Kit" },
      { kind: "attr", target: { selector: "[data-h1]" }, property: "title", before: null, after: "Hi" },
      { kind: "hide", target: { selector: "[data-lead]" }, property: "hidden", before: null, after: "hidden" },
    ];
    const result = replayEdits(createEditLog(), list, true, as(at.doc) as Document);
    expect(result.applied.map((one) => one.kind)).toEqual(["text"]);
    expect(result.waiting).toEqual(list.slice(1));
    expect(at.h1.getAttribute("title")).toBeNull();
  });

  test("after a delete that was not made, make none of the edits after it", () => {
    const at = shop();
    const list: SavedEdit[] = [
      { kind: "delete", target: { selector: "[data-a]" }, property: "node", before: "<li>gone</li>", after: null },
      { kind: "hide", target: { selector: "[data-c]" }, property: "hidden", before: null, after: "hidden" },
    ];
    const result = replayEdits(createEditLog(), list, false, as(at.doc) as Document);
    expect(result.skipped.map((one) => one.reason)).toEqual([REASONS.changed, AFTER_MISSED]);
    expect(at.c.hasAttribute("data-devknobs-hide")).toBe(false);
  });

  test("never set an attribute that could run a script", () => {
    const at = shop();
    const risky: SavedEdit[] = [
      { kind: "attr", target: { selector: "[data-h1]" }, property: "onclick", before: null, after: "alert(1)" },
      { kind: "attr", target: { selector: "[data-h1]" }, property: "ONERROR", before: null, after: "x" },
      { kind: "attr", target: { selector: "[data-h1]" }, property: "srcdoc", before: null, after: "<p>" },
      { kind: "attr", target: { selector: "[data-cta]" }, property: "href", before: null, after: " Java\tScript:alert(1)" },
      { kind: "attr", target: { selector: "[data-cta]" }, property: "xlink:href", before: null, after: "javascript:x" },
      { kind: "attr", target: { selector: "[data-cta]" }, property: "formaction", before: null, after: "javascript:x" },
    ];
    const result = replayEdits(createEditLog(), risky, false, as(at.doc) as Document);
    expect(result.skipped.map((one) => one.reason)).toEqual(risky.map(() => RISK));
    expect(at.h1.attributes.map((one) => one.name)).toEqual(["data-h1"]);
  });

  test("never edits an attribute or the text of the page's own script, base or frame, a data script among them", () => {
    const ld = elem("script", { type: "application/ld+json", id: "ld" }, text('{"@type":"Thing"}'));
    const base = elem("base", { href: "/" });
    const doc = page(() => [elem("head", {}, base, ld), elem("body", {}, elem("iframe", { "data-f": "" }), svg("svg", {}, svg("script", { "data-s": "" })))]);
    const list: SavedEdit[] = [
      { kind: "attr", target: { selector: "[type]" }, property: "type", before: "application/ld+json", after: "text/javascript" },
      { kind: "attr", target: { selector: "[type]" }, property: "src", before: null, after: "/evil.js" },
      { kind: "text", target: { selector: "[type]" }, property: "text", before: '{"@type":"Thing"}', after: "alert(1)" },
      { kind: "attr", target: { selector: "[href]" }, property: "href", before: "/", after: "https://evil.test/" },
      { kind: "attr", target: { selector: "[data-f]" }, property: "src", before: null, after: "/x" },
      { kind: "attr", target: { selector: "[data-s]" }, property: "href", before: null, after: "/evil.js" },
    ];
    const result = replayEdits(createEditLog(), list, false, as(doc) as Document);
    expect(result.skipped.map((one) => one.reason)).toEqual(list.map(() => RISK));
    expect(ld.getAttribute("type")).toBe("application/ld+json");
    expect(ld.childNodes[0]?.nodeValue).toBe('{"@type":"Thing"}');
    expect(base.getAttribute("href")).toBe("/");
  });

  test("keep the source an edit had", () => {
    const at = shop();
    const log = createEditLog();
    const result = replayEdits(log, [{ kind: "attr", target: { selector: "[data-h1]", source: "src/H.tsx:3" }, property: "title", before: null, after: "Hi" }], false, as(at.doc) as Document);
    expect(result.applied[0]?.target.source).toBe("src/H.tsx:3");
    expect(log.list()[0]?.target.source).toBe("src/H.tsx:3");
  });
});

/** A store held in memory, as the extension's, which can start not knowing. */
function memoryStore(start: unknown): EditsStore & { value: unknown; saved: unknown[]; hear(): void } {
  const listeners = new Set<() => void>();
  const store = {
    value: start,
    saved: [] as unknown[],
    load: () => store.value,
    save(kept: unknown) {
      store.saved.push(kept);
      store.value = kept;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hear() {
      for (const listener of listeners) listener();
    },
  };
  return store;
}

/** The page's window, a new one for each test: one replays its kept edits once. */
let VIEW = {} as Window;

/** A change that goes on and off, made in `view`. */
function change(value: string, view: Window | null = VIEW): Change {
  return { edit: { kind: "attr", target: { selector: "h1" }, property: "title", before: null, after: value }, apply: () => true, revert: () => undefined, view };
}

describe("the keeper", () => {
  beforeEach(() => {
    VIEW = {} as Window;
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test("off by default keeps nothing; on keeps the edits in force, each change; off forgets them", () => {
    const store = memoryStore(null);
    const log = createEditLog();
    const keep = createKeeper({ log, store, view: VIEW, replay: async () => replayEdits, settled: async () => undefined });
    log.record(change("a"));
    expect(keep.on()).toBe(false);
    expect(store.saved).toEqual([]);
    keep.set(true);
    expect(keep.on()).toBe(true);
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["a"]);
    log.record(change("b"));
    log.record(change("in the frame", {} as Window));
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["a", "b"]);
    log.undo();
    log.undo();
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["a"]);
    keep.set(false);
    expect(store.value).toBeNull();
    log.record(change("c"));
    expect(store.value).toBeNull();
    keep.stop();
  });

  test("makes the kept edits again once the page settled, keeps nothing as it does, and says what came of it", async () => {
    const kept = toKept([{ id: 1, ...change("a").edit }, { id: 2, ...change("b").edit }]).kept;
    const store = memoryStore(kept);
    const log = createEditLog();
    let settle = () => undefined as void;
    const run: Replay = (into, list) => {
      into.record(change("a"));
      return { applied: into.list(), skipped: [{ edit: list[1], reason: REASONS.missing }], waiting: [] };
    };
    const keep = createKeeper({ log, store, view: VIEW, replay: async () => run, settled: () => new Promise((resolve) => (settle = () => resolve())) });
    expect(keep.on()).toBe(true);
    expect(keep.restored()).toBeNull();
    settle();
    await flush();
    await flush();
    expect(keep.restored()).toEqual({ kept: 1, missed: [{ edit: kept.edits[1], reason: REASONS.missing }] });
    expect(store.saved).toEqual([]);
    // The next change keeps the edits in force: the one not found goes.
    log.record(change("c"));
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["a", "c"]);
    keep.stop();
  });

  test("waits for a store that does not know yet, and makes nothing again on a page that made them already", async () => {
    const store = memoryStore(undefined);
    let runs = 0;
    const view = {} as Window;
    const options = { log: createEditLog(), store, view, replay: async (): Promise<Replay> => () => ({ applied: [], skipped: [], waiting: [] }), settled: async () => void runs++ };
    const keep = createKeeper(options);
    keep.set(true);
    expect(keep.on()).toBe(false);
    store.value = toKept([{ id: 1, ...change("a").edit }]).kept;
    store.hear();
    expect(keep.on()).toBe(true);
    await flush();
    expect(runs).toBe(1);
    keep.stop();
    createKeeper(options).stop();
    await flush();
    expect(runs).toBe(1);
  });

  test("while html edits wait, keeps nothing new, and makes them on apply, then keeps all", async () => {
    const list = toKept([
      { id: 1, kind: "attr", target: { selector: "h1" }, property: "title", before: null, after: "a" },
      { id: 2, kind: "text", target: { selector: "h1" }, property: "text", before: "x", after: "y" },
    ]).kept;
    const store = memoryStore(list);
    const log = createEditLog();
    const run: Replay = (into, entries, hold) => {
      if (hold) return { applied: [], skipped: [], waiting: entries.map((one) => readSavedEdit(one)).filter((one) => one !== null) };
      for (const one of entries) into.record({ ...change(""), edit: readSavedEdit(one) ?? change("").edit });
      return { applied: into.list(), skipped: [], waiting: [] };
    };
    const keep = createKeeper({ log, store, view: VIEW, replay: async () => run, settled: async () => undefined });
    await flush();
    await flush();
    expect(keep.waiting()).toHaveLength(2);
    log.record(change("mine"));
    expect(store.saved).toEqual([]);
    keep.applyWaiting();
    expect(keep.waiting()).toEqual([]);
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["mine", "a", "y"]);
    keep.stop();
  });

  test("keeps nothing while the kept edits wait to be made, and the user's edits of that time once they are", async () => {
    const store = memoryStore(toKept([{ id: 1, ...change("kept").edit }]).kept);
    const log = createEditLog();
    let settle = () => undefined as void;
    const run: Replay = (into) => {
      into.record(change("kept"));
      return { applied: [], skipped: [], waiting: [] };
    };
    const keep = createKeeper({ log, store, view: VIEW, replay: async () => run, settled: () => new Promise((resolve) => (settle = () => resolve())) });
    log.record(change("early"));
    expect(store.saved).toEqual([]);
    settle();
    await flush();
    await flush();
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["early", "kept"]);
    keep.stop();
  });

  test("the switch turned off while the page settles makes nothing of what was kept", async () => {
    const store = memoryStore(toKept([{ id: 1, ...change("kept").edit }]).kept);
    let runs = 0;
    let settle = () => undefined as void;
    const run: Replay = () => {
      runs++;
      return { applied: [], skipped: [], waiting: [] };
    };
    const keep = createKeeper({ log: createEditLog(), store, view: VIEW, replay: async () => run, settled: () => new Promise((resolve) => (settle = () => resolve())) });
    expect(keep.known()).toBe(true);
    keep.set(false);
    settle();
    await flush();
    await flush();
    expect(runs).toBe(0);
    expect(store.value).toBeNull();
    keep.stop();
  });

  test("a keeper stopped before its replay ran leaves the page to the next one", async () => {
    const store = memoryStore(toKept([{ id: 1, ...change("kept").edit }]).kept);
    const view = {} as Window;
    let runs = 0;
    let settle = () => undefined as void;
    const run: Replay = () => {
      runs++;
      return { applied: [], skipped: [], waiting: [] };
    };
    const first = createKeeper({ log: createEditLog(), store, view, replay: async () => run, settled: () => new Promise((resolve) => (settle = () => resolve())) });
    first.stop();
    settle();
    await flush();
    await flush();
    expect(runs).toBe(0);
    const second = createKeeper({ log: createEditLog(), store, view, replay: async () => run, settled: async () => undefined });
    await flush();
    await flush();
    expect(runs).toBe(1);
    second.stop();
  });

  test("an edit made in another window is not kept, also once that window's page went", () => {
    const store = memoryStore({ v: 1, edits: [] });
    const log = createEditLog();
    const frame = new EventTarget() as unknown as Window;
    const keep = createKeeper({ log, store, view: VIEW, settled: async () => undefined });
    log.record(change("in frame", frame));
    frame.dispatchEvent(new Event("pagehide"));
    log.record(change("main"));
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["main"]);
    expect(keep.kept()).toBe(1);
    keep.stop();
  });

  test("with the page in devknobs' frame, an edit made there is kept, and kept edits are made again in the frame's page", async () => {
    const store = memoryStore(toKept([{ id: 1, ...change("kept").edit }]).kept);
    const log = createEditLog();
    const top = { document: { title: "top" } } as unknown as Window;
    const inner = Object.assign(new EventTarget(), { document: { title: "frame" } }) as unknown as Window;
    let shown: Window | null = inner;
    const docs: Document[] = [];
    const run: Replay = (into, _list, _hold, doc) => {
      docs.push(doc);
      into.record(change("kept", inner));
      return { applied: into.list(), skipped: [], waiting: [] };
    };
    const keep = createKeeper({ log, store, view: top, replay: async () => run, settled: async () => undefined, frame: () => shown });
    await flush();
    await flush();
    expect(docs.map((doc) => doc.title)).toEqual(["frame"]);
    log.record(change("in frame", inner));
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["kept", "in frame"]);
    // The frame on another page: an edit made there is not this page's, also once the frame shows this page again.
    shown = null;
    log.record(change("elsewhere", inner));
    shown = inner;
    log.record(change("main", top));
    expect(readKept(store.value)?.edits.map((one) => one.after)).toEqual(["kept", "in frame", "main"]);
    keep.stop();
  });

  test("the frame's window shows the page only on its origin, at the path the page loaded at", () => {
    const at = (origin: string, pathname: string) => ({ location: { origin, pathname } }) as unknown as Window;
    const top = at("https://site.test", "/");
    const same = at("https://site.test", "/");
    expect(framedPage(top, same, "/")).toBe(same);
    expect(framedPage(top, null, "/")).toBeNull();
    expect(framedPage(top, at("https://site.test", "/docs"), "/")).toBeNull();
    expect(framedPage(top, at("null", "blank"), "/")).toBeNull();
    expect(framedPage(top, at("https://other.test", "/"), "/")).toBeNull();
    const closed = {
      get location(): never {
        throw new Error("cross origin");
      },
    } as unknown as Window;
    expect(framedPage(top, closed, "/")).toBeNull();
  });

  test("an edit too big to keep leaves the switch on, with a store that tells of its own writes", () => {
    const store = memoryStore(null);
    const log = createEditLog();
    const keep = createKeeper({ log, store, view: VIEW, settled: async () => undefined });
    const subscribed = store.subscribe(() => undefined);
    keep.set(true);
    log.record({ ...change(""), edit: { kind: "html", target: { selector: "main" }, property: "html", before: "x".repeat(70 * 1024), after: "<main></main>" } });
    store.hear();
    expect(keep.on()).toBe(true);
    expect(keep.cut()).toBe(1);
    subscribed();
    keep.stop();
  });

  test("says how many edits are past the caps while on", () => {
    const store = memoryStore({ v: 1, edits: [] });
    const log = createEditLog();
    const keep = createKeeper({ log, store, view: VIEW, settled: async () => undefined });
    for (let at = 0; at < MAX_EDITS + 3; at++) log.record(change(String(at)));
    expect(keep.cut()).toBe(3);
    keep.set(false);
    expect(keep.cut()).toBe(0);
    keep.stop();
  });
});

describe("the page's own store", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");

  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "window", saved);
    else Reflect.deleteProperty(globalThis, "window");
  });

  function storage(): Storage {
    const items = new Map<string, string>();
    return {
      get length() {
        return items.size;
      },
      key: (at: number) => [...items.keys()][at] ?? null,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
      clear: () => items.clear(),
    };
  }

  function at(path: string, local: Storage, search = ""): void {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), { localStorage: local, sessionStorage: storage(), location: { pathname: path, search }, name: "" }),
    });
  }

  test("keeps a page's edits under its path, and the pages kept longest ago go past the cap", () => {
    const local = storage();
    at("/", local);
    for (let page = 0; page < MAX_PAGES; page++) local.setItem(`${EDITS_KEY}/p${page}`, JSON.stringify({ v: 1, edits: [], at: 1000 + page }));
    localEditsStore().save({ v: 1, edits: [] });
    const kept = Array.from({ length: local.length }, (_, index) => local.key(index));
    expect(kept).toHaveLength(MAX_PAGES);
    expect(kept).toContain(`${EDITS_KEY}/`);
    expect(kept).not.toContain(`${EDITS_KEY}/p0`);
    expect(kept).toContain(`${EDITS_KEY}/p1`);
    expect(localEditsStore().load()).toMatchObject({ v: 1, edits: [] });
    localEditsStore().save(null);
    expect(localEditsStore().load()).toBeNull();
  });

  test("keeps the edits under the path the page loaded at, after the app's router moved", () => {
    const local = storage();
    at("/shop", local);
    const store = localEditsStore();
    window.location.pathname = "/shop/cart";
    store.save({ v: 1, edits: [] });
    expect(local.getItem(`${EDITS_KEY}/shop`)).not.toBeNull();
    expect(local.getItem(`${EDITS_KEY}/shop/cart`)).toBeNull();
    store.save(null);
    expect(local.length).toBe(0);
  });

  test("where the storage is full, forgets the pages kept longest ago until the page fits", () => {
    const local = storage();
    const set = local.setItem;
    local.setItem = (key: string, value: string) => {
      if (local.length >= 3 && local.getItem(key) === null) throw new Error("QuotaExceededError");
      set(key, value);
    };
    at("/new", local);
    for (const [page, when] of [["/a", 3], ["/b", 1], ["/c", 2]] as const) set(`${EDITS_KEY}${page}`, JSON.stringify({ v: 1, edits: [], at: when }));
    localEditsStore().save({ v: 1, edits: [] });
    expect(local.getItem(`${EDITS_KEY}/new`)).not.toBeNull();
    expect(local.getItem(`${EDITS_KEY}/b`)).toBeNull();
    expect(local.getItem(`${EDITS_KEY}/a`)).not.toBeNull();
  });

  test("reads and writes nothing in fresh mode", () => {
    const local = storage();
    local.setItem(`${EDITS_KEY}/`, JSON.stringify({ v: 1, edits: [] }));
    at("/", local, "?devknobs=fresh");
    expect(localEditsStore().load()).toBeNull();
    localEditsStore().save(null);
    expect(local.length).toBe(1);
  });
});
