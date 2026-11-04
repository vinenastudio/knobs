import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cssOff, cssOn, cssValue, offIn } from "../src/edit/css";
import { attrEdit, deleteEdit, hideEdit, moveEdit, textEdit } from "../src/edit/html";
import {
  createKeeper,
  EDITS_KEY,
  EDITS_VERSION,
  type EditsStore,
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
import { replayEdits } from "../src/edit/replay";
import { as, elem, page, type PageNode, text } from "./dom-page";
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
    const result = replayEdits(replay, list, as(again.doc) as Document);
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
      { kind: "move", target: { selector: "[data-c]" }, property: "node", before: "", after: "", from: { parent: "[data-list]", next: "[data-a]" }, to: { parent: "[data-list]", next: "[data-a]" } },
      { kind: "text", target: { selector: "[data-lead]" }, property: "text", before: "Tools", after: "Kit" },
    ];
    const result = replayEdits(createEditLog(), [...list, { kind: "eval" }], as(at.doc) as Document);
    expect(result.skipped.map((one) => one.reason)).toEqual([REASONS.changed, REASONS.missing, REASONS.changed, REASONS.changed, REASONS.invalid]);
    expect(result.applied.map((one) => one.after)).toEqual(["Kit"]);
    expect(at.lead.childNodes[0]?.nodeValue).toBe("Kit");
  });

  test("keep the source an edit had", () => {
    const at = shop();
    const log = createEditLog();
    const result = replayEdits(log, [{ kind: "attr", target: { selector: "[data-h1]", source: "src/H.tsx:3" }, property: "title", before: null, after: "Hi" }], as(at.doc) as Document);
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

const VIEW = {} as Window;

/** A change that goes on and off, made in `view`. */
function change(value: string, view: Window | null = VIEW): Change {
  return { edit: { kind: "attr", target: { selector: "h1" }, property: "title", before: null, after: value }, apply: () => true, revert: () => undefined, view };
}

describe("the keeper", () => {
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
      return { applied: into.list(), skipped: [{ edit: list[1], reason: REASONS.missing }] };
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
    const options = { log: createEditLog(), store, view, replay: async (): Promise<Replay> => () => ({ applied: [], skipped: [] }), settled: async () => void runs++ };
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
    for (let page = 0; page < MAX_PAGES + 2; page++) {
      at(`/p${page}`, local);
      localEditsStore().save({ v: 1, edits: [] });
    }
    const kept = Array.from({ length: local.length }, (_, index) => local.key(index));
    expect(kept).toHaveLength(MAX_PAGES);
    expect(kept).toContain(`${EDITS_KEY}/p${MAX_PAGES + 1}`);
    at(`/p${MAX_PAGES + 1}`, local);
    expect(localEditsStore().load()).toMatchObject({ v: 1, edits: [] });
    localEditsStore().save(null);
    expect(localEditsStore().load()).toBeNull();
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
