import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import { createStore, type RequestStore } from "../src/requests/store";
import { type RequestEntry, RING_SIZE } from "../src/requests/types";
import type { KnobsState, KnobsStatePatch } from "../src/types";
import { actionKey, runAction, type Store, stopAction } from "../src/ui/actions";
import { BINDINGS, comboProblem, readKeys, resolveKeys } from "../src/ui/bindings";
import { ACTIONS, type Action, actionRow, availableActions, isActive } from "../src/ui/catalog";
import { isListed, listedOrder, removePatch, rowText } from "../src/ui/list";
import { stage } from "../src/ui/stage";
import { CSS } from "../src/ui/styles";
import { comboText, defaultKeys, keyAction, type KeyLike, parseCombo } from "../src/ui/keys";
import { GONE_NOTE, HIDES_NOTE } from "../src/ui/requestdetail";
import { BRANDS } from "../src/ui/icons";
import { clockTime, copyText, LIGHT_WHY } from "../src/ui/requestformat";
import { FETCH_STREAM, NO_RESPONSE_DATA, PREVIEW_POLICY, PROVISIONAL, TIMING_MISSING } from "../src/ui/requestparts";
import {
  COPIED_SHOWS,
  createRequests,
  NO_MATCH,
  NO_REQUESTS,
  REQUEST_TITLE,
  REQUEST_VIEW,
  type Requests,
  REQUESTS_VIEW,
} from "../src/ui/requests";
import { searchActions } from "../src/ui/search";
import {
  fake,
  type FakeNode,
  fakeDocument,
  type FakePane,
  fakePane,
  focused,
  leaveDocument,
  ROW_PITCH,
} from "./requests-dom";
import { fetched, image } from "./requests-entries";
import { LOADED, manual } from "./requests-fakes";

interface Scene {
  store: RequestStore;
  timer: ReturnType<typeof manual>;
  pane: FakePane;
  requests: Requests;
  said: FakeNode;
  /** What was copied, in order. */
  copies: string[];
  /** Whether the next copy goes through. */
  copying: { works: boolean };
  /** Put a request in the log, started `at` ms into the page. */
  add(at: number, more?: Partial<RequestEntry>): RequestEntry;
  /** The rows' lines: what a press opens a request from, and what takes the focus. */
  rows(): FakeNode[];
  /** The rows themselves, which the filter hides. */
  boxes(): FakeNode[];
  /** What each row reads: method, name, query, status and time. */
  texts(): string[][];
}

function scene(log = true): Scene {
  const timer = manual();
  const store = createStore({ seed: "t", now: () => LOADED + 10_000, schedule: timer.schedule });
  const pane = fakePane();
  const said = document.createElement("div");
  const copies: string[] = [];
  const copying = { works: true };
  const requests = createRequests({
    said,
    log: () => (log ? store : null),
    pane,
    copy: (text) => {
      copies.push(text);
      return Promise.resolve(copying.works);
    },
  });
  const boxes = () => pane.body.find("req-row");
  const rows = () => boxes().map((box) => box.one("main"));
  return {
    store,
    timer,
    pane,
    requests,
    said: fake(said),
    copies,
    copying,
    add(at, more = {}) {
      const entry = fetched({
        id: store.nextId(),
        url: `http://app.test/api/item-${at}`,
        timing: { start: LOADED + at, at, response: 5, end: LOADED + at + 20, duration: 20 },
        ...more,
      });
      store.put(entry);
      return entry;
    },
    rows,
    boxes,
    texts: () =>
      rows().map((row) =>
        ["req-method", "req-path", "req-query", "req-status", "req-time"].map((part) => row.one(part).textContent),
      ),
  };
}

/** The names the rows show, in order, the hidden ones left out. */
function names(at: Scene): string[] {
  return at
    .boxes()
    .filter((row) => !row.hidden)
    .map((row) => row.one("req-path").textContent);
}

function type(at: Scene, text: string): void {
  const filter = at.pane.body.one("filter");
  filter.value = text;
  filter.fire("input");
}

function chip(at: Scene, label: string): FakeNode {
  const node = at.pane.body.find("seg-item").find((each) => each.textContent === label);
  if (!node) throw new Error(`no choice ${label}`);
  return node;
}

/** The detail's tabs: the ones that show, and the one that is on. */
function segs(at: Scene): { shown: string[]; on: string[] } {
  const items = at.pane.body.one("req-detail").one("tabs").nodes().filter((item) => !item.hidden);
  return {
    shown: items.map((item) => item.textContent),
    on: items.filter((item) => item.getAttribute("aria-selected") === "true").map((item) => item.textContent),
  };
}

/** Press a tab of the detail. */
function pick(at: Scene, label: string): void {
  const item = at.pane.body.one("req-detail").one("tabs").nodes().find((each) => each.textContent === label);
  if (!item || item.hidden) throw new Error(`no tab ${label}`);
  item.click();
}

/** What shows under the detail's tabs. */
function region(at: Scene): FakeNode {
  return at.pane.body.one("req-body");
}

/** The labels of the sections that show, in order. */
function groups(at: Scene): string[] {
  return region(at).find("sect").filter((box) => !box.hidden).map((box) => box.one("sect-label").textContent);
}

function groupOf(at: Scene, label: string): FakeNode {
  const box = region(at).find("sect").find((each) => each.one("sect-label").textContent === label);
  if (!box) throw new Error(`no section ${label}`);
  return box;
}

/** A list's pairs that show, a name and its value each. */
function listed(list: FakeNode): string[][] {
  const cells = list.nodes().filter((cell) => !cell.hidden).map((cell) => cell.textContent);
  return cells.flatMap((cell, at) => (at % 2 === 0 ? [[cell, cells[at + 1] ?? ""]] : []));
}

/** The summary's cells, by what they are. */
function top(at: Scene): Record<"verb" | "path" | "status" | "took" | "host", FakeNode> {
  const box = at.pane.body.one("req-sum");
  return {
    verb: box.one("req-verb"),
    path: box.one("req-url"),
    status: box.one("req-stat"),
    took: box.one("req-took"),
    host: box.one("req-host"),
  };
}

/** The classes of a node's element children, in order. */
function parts(node: FakeNode | undefined): string[] {
  return (node?.nodes() ?? []).map((child) => child.className);
}

/** The requests' entry in the catalog. */
function requestsAction(): Action {
  const found = ACTIONS.find((action) => action.id === "requests");
  if (!found) throw new Error("no requests action");
  return found;
}

/** The knobs as the panel keeps them, as far as running an action goes. */
function fakeStore(): Store {
  let state: KnobsState = DEFAULT_STATE;
  return {
    getState: () => state,
    setState(patch: KnobsStatePatch) {
      state = merge(state, patch);
    },
  };
}

beforeEach(fakeDocument);
afterEach(() => {
  stage.requests = null;
  leaveDocument();
});

describe("the requests' row in the panel", () => {
  test("the entry says it all: its icon, its key, and no place on a page with no view", () => {
    const action = requestsAction();
    expect(action.icon).toBe("arrow-up-down");
    expect(action.binding).toBe("requests");
    expect(actionKey(action, defaultKeys(), false)).toBe("Shift N");
    expect(availableActions().map((each) => each.id)).not.toContain("requests");
    expect(action.state?.()).toBeNull();
    // With no view there is nothing to run or to close, and neither throws.
    action.run();
    action.off?.();
    stage.requests = scene().requests;
    expect(availableActions().map((each) => each.id)).toContain("requests");
  });

  test("run from the panel it shows the requests, and its row is listed from then on", () => {
    const at = scene();
    stage.requests = at.requests;
    const action = requestsAction();
    const row = actionRow(action);
    const store = fakeStore();
    expect(isListed(row, store.getState())).toBe(false);
    runAction(action, store);
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(store.getState().panel.pinned).toEqual([...DEFAULT_STATE.panel.pinned, "requests"]);
    // Run again it goes back to the rows, and the row stays.
    runAction(action, store);
    expect(at.pane.view()).toBeNull();
    expect(listedOrder(store.getState()).map(String)).toEqual([...DEFAULT_STATE.panel.pinned, "requests"]);
    expect(rowText(row, store.getState(), { now: 0, real: 0, overflow: null })).toBe("off");
  });

  test("it is on while the list or a request shows, and off with the rows", () => {
    const at = scene();
    stage.requests = at.requests;
    const action = requestsAction();
    const row = actionRow(action);
    at.add(10);
    expect(action.state?.()).toBe("off");
    action.run();
    expect(action.state?.()).toBe("on");
    expect(isActive(row, DEFAULT_STATE)).toBe(true);
    at.rows()[0]?.click();
    expect(at.pane.view()).toBe(REQUEST_VIEW);
    expect(action.state?.()).toBe("on");
    at.pane.back();
    expect(action.state?.()).toBe("on");
    at.pane.back();
    expect(action.state?.()).toBe("off");
    expect(isActive(row, DEFAULT_STATE)).toBe(false);
  });

  test("its x takes the row off the list and closes the view, from a request too", () => {
    const at = scene();
    stage.requests = at.requests;
    const action = requestsAction();
    const row = actionRow(action);
    const store = fakeStore();
    at.add(10);
    runAction(action, store);
    at.rows()[0]?.click();
    // What the row's x does.
    stopAction(action);
    store.setState(removePatch(store.getState(), row));
    expect(at.pane.view()).toBeNull();
    expect(at.pane.cleanups).toBe(at.pane.mounts);
    expect(isListed(row, store.getState())).toBe(false);
    expect(store.getState().panel.pinned).toEqual([...DEFAULT_STATE.panel.pinned]);
    // With the view closed already the x only takes the row off, and opens nothing.
    runAction(action, store);
    runAction(action, store);
    stopAction(action);
    expect(at.pane.view()).toBeNull();
  });
});

describe("what the view is built from", () => {
  test("the bar is the kit's: its filter, one set of segments, then the count as plain text", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    const bar = at.pane.body.one("toolbar");
    expect(bar.className).toBe("toolbar");
    expect(parts(bar)).toEqual(["field filter", "seg", "req-count"]);
    const [filter, kinds, count] = bar.nodes();
    expect(filter?.tag).toBe("input");
    expect(filter?.getAttribute("aria-label")).toBe("filter requests");
    expect(kinds?.getAttribute("role")).toBe("radiogroup");
    expect(kinds?.getAttribute("aria-label")).toBe("requests shown");
    expect(kinds?.nodes().map((item) => [item.getAttribute("role"), item.textContent])).toEqual([
      ["radio", "all"],
      ["radio", "fetch/xhr"],
      ["radio", "other"],
    ]);
    expect(kinds?.nodes().map((item) => item.tabIndex)).toEqual([0, -1, -1]);
    expect(count?.tag).toBe("span");
    expect(count?.nodes()).toEqual([]);
    expect(at.pane.body.nodes().map((node) => node.className)).toEqual(["toolbar", "req-list", "empty"]);
    // Nothing of the old bar is left to style.
    for (const old of ["req-bar", "req-filter", "req-chips", "chip"]) expect(at.pane.body.find(old)).toEqual([]);
  });

  test("the segments are one choice: the arrows move it and the list follows", () => {
    const at = scene();
    at.add(10);
    at.store.put(image({ id: at.store.nextId() }));
    at.requests.toggle();
    const [all, fetch, other] = at.pane.body.one("seg").nodes();
    expect(names(at)).toEqual(["logo.png", "item-10"]);
    all?.focus();
    expect(all?.fire("keydown", { key: "ArrowRight" }).prevented).toBe(true);
    expect(focused()).toBe(fetch ?? null);
    expect(names(at)).toEqual(["item-10"]);
    expect([all, fetch, other].map((item) => item?.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect([all, fetch, other].map((item) => item?.tabIndex)).toEqual([-1, 0, -1]);
    fetch?.fire("keydown", { key: "ArrowRight" });
    expect(names(at)).toEqual(["logo.png"]);
    expect(at.pane.body.one("req-count").textContent).toBe("1 of 2");
  });

  test("a row is built by the row builder: its line and its main, which starts where the view's lines do by its own padding", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2" });
    at.requests.toggle();
    const [box] = at.boxes();
    expect(box?.className).toBe("row req-row");
    expect(parts(box)).toEqual(["line"]);
    expect(parts(box?.nodes()[0])).toEqual(["main"]);
    const main = box?.one("main");
    expect(main?.tag).toBe("button");
    // The method stands where a row's icon does, the name is the row's label, and the rest is what it ends with.
    expect(parts(main)).toEqual(["req-method req-post", "row-label req-name", "req-status ok", "req-time"]);
    expect(parts(main?.one("req-name"))).toEqual(["req-path", "req-query"]);
    // No slot node and no padding of its own: where it starts is what every row's main reads.
    expect(box?.find("lead")).toEqual([]);
    const own = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((match) => ({ selector: (match[1] ?? "").trim(), body: match[2] ?? "" }))
      .filter((rule) => /\.req-(row|list|name|method)\b/.test(rule.selector));
    expect(own.length).toBeGreaterThan(3);
    for (const rule of own) {
      expect(rule.selector).not.toMatch(/\.main\b/);
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(/(^|[\s;])(padding|margin|border|outline|box-shadow)(-[a-z-]+)?\s*:/);
    }
  });

  test("a request in full is built from the kit: its bar, its tabs, its sections, its lists and its code", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2" });
    at.requests.toggle();
    at.rows()[0]?.click();
    const detail = at.pane.body.one("req-detail");
    expect(parts(detail)).toEqual(["toolbar", "note", "note", "tab-panel req-body"]);
    // The summary and the tabs are in the one bar, which stays.
    expect(parts(detail.one("toolbar"))).toEqual(["req-sum", "tabs"]);
    expect(detail.one("tabs").nodes().map((item) => item.className)).toEqual(["tab on", ...Array(7).fill("tab")]);
    expect(parts(region(at))).toEqual(["sect", "sect", "sect"]);
    expect(parts(groupOf(at, "General"))).toEqual(["sect-top", "sect-body"]);
    expect(parts(groupOf(at, "General").one("sect-body"))).toEqual(["pairs"]);
    expect(parts(groupOf(at, "Request Headers").one("sect-top"))).toEqual(["sect-head", "act"]);
    expect(parts(groupOf(at, "Request Headers").one("sect-body"))).toEqual(["req-warn", "pairs"]);
    pick(at, "Payload");
    expect(parts(groupOf(at, "Request Payload").one("sect-top"))).toEqual(["sect-head", "act", "row-button req-copy"]);
    pick(at, "Response");
    expect(parts(region(at).one("req-response"))).toEqual(["group", "src"]);
    // Nothing folds as a row does.
    expect(detail.find("fold")).toEqual([]);
    expect(detail.find("row")).toEqual([]);
    // What the view styles for itself is cells only: no bar, no tab, no section, list or code of its own.
    const own = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((match) => ({ selector: (match[1] ?? "").trim(), body: match[2] ?? "" }))
      .filter((rule) => /\.req-/.test(rule.selector));
    for (const rule of own) {
      expect(rule.selector).not.toMatch(/\.(toolbar|seg|seg-item|tabs|tab|sect|sect-[a-z]+|act|src|src-[a-z]+|tok-[a-z]+|json|json-[a-z]+|group|group-head|pairs|pair-\w+|code|code-text|split|chip|row-button|main)\b(?!-)/);
      expect([rule.selector, /font-weight/.test(rule.body)]).toEqual([rule.selector, false]);
    }
    expect(own.map((rule) => rule.selector).filter((each) => /req-(kv|pre|inner|general|section)\b/.test(each))).toEqual([]);
  });
});

describe("the action and its key", () => {
  test("requests is an action the search finds, by its name and as the network", () => {
    expect(ACTIONS.map((action) => action.id)).toContain("requests");
    for (const query of ["requests", "req", "network", "fetch", "xhr"]) {
      expect(searchActions(query).map((action) => action.id)).toEqual(["requests"]);
    }
  });

  test("its key is shift n, which no other default has", () => {
    const keys = defaultKeys();
    expect(comboText(keys.requests)).toBe("shift+n");
    expect(BINDINGS).toContain("requests");
    for (const binding of BINDINGS) expect(comboProblem(keys[binding], binding, keys)).toBeNull();
    const taken = parseCombo("shift+n");
    expect(taken && comboProblem(taken, "grab", keys)).toBe("used by requests");
  });

  test("the key can be set, and is kept as the others are", () => {
    expect(readKeys(JSON.stringify({ requests: "Alt+N" }))).toEqual({ requests: "alt+n" });
    const keys = resolveKeys(defaultKeys(), { requests: "alt+n" });
    expect(keys.requests && comboText(keys.requests)).toBe("alt+n");
    const press = (more: Partial<KeyLike>): KeyLike => ({
      key: "n",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target: null,
      composedPath: () => [],
      ...more,
    });
    expect(keyAction(press({ key: "N", shiftKey: true }), defaultKeys())).toBe("requests");
    expect(keyAction(press({ key: "N", shiftKey: true }), keys)).toBeNull();
    expect(keyAction(press({ altKey: true, code: "KeyN" }), keys)).toBe("requests");
  });

  test("the action shows the requests, and goes back to the rows where they show", () => {
    const at = scene();
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.shown()?.title).toBe("requests");
    at.requests.toggle();
    expect(at.pane.view()).toBeNull();
  });

  test("it goes back to the rows from a request's detail too, in one step", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(at.pane.view()).toBe(REQUEST_VIEW);
    at.requests.toggle();
    expect(at.pane.view()).toBeNull();
  });

  test("with no log it still opens, on the empty line", () => {
    const at = scene(false);
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    const empty = at.pane.body.one("empty");
    expect(empty.textContent).toBe(NO_REQUESTS);
    expect(empty.hidden).toBe(false);
    expect(at.rows()).toEqual([]);
    // Clear has no log to empty, and says nothing of it.
    at.pane.act("clear");
  });
});

describe("the list", () => {
  test("has a row a request, the newest on top, each reading its method, name, status and time", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2&sort=name&dir=asc" });
    at.add(20, { method: "DELETE", url: "http://app.test/", state: "failed", status: 500 });
    at.add(30, {
      state: "pending",
      status: null,
      timing: { start: LOADED + 30, at: 30, response: null, end: null, duration: null },
    });
    at.requests.toggle();
    expect(at.texts()).toEqual([
      ["POST", "item-30", "", "pending", ""],
      ["DEL", "app.test", "", "500", "20ms"],
      ["POST", "users", "?page=2&…dir=asc", "201", "20ms"],
    ]);
    // The log keeps its own order, oldest first: only the view turns it over.
    expect(at.store.entries().map((entry) => entry.timing.at)).toEqual([10, 20, 30]);
    expect(at.rows().map((row) => row.one("req-status").className)).toEqual([
      "req-status idle",
      "req-status hot",
      "req-status ok",
    ]);
    // The method stays text, in its own tone, with nothing drawn in its place.
    expect(at.rows().map((row) => row.one("req-method").className)).toEqual([
      "req-method req-post",
      "req-method req-delete",
      "req-method req-post",
    ]);
    expect(at.rows().flatMap((row) => row.one("req-method").nodes())).toEqual([]);
    expect(at.rows().map((row) => row.tag)).toEqual(["button", "button", "button"]);
    expect(at.pane.body.one("req-count").textContent).toBe("3");
    expect(at.pane.body.one("empty").hidden).toBe(true);
  });

  test("a light row shows its kind, looks quieter, and says why in its tooltip", () => {
    const at = scene();
    at.store.put(image());
    at.add(100);
    at.requests.toggle();
    const [full, light] = at.rows();
    const kind = light?.one("req-method");
    // The kind is an icon, and its word is still there as its name and its tooltip.
    expect(kind?.textContent).toBe("");
    expect(kind?.className).toBe("req-method mark req-image");
    expect(kind?.getAttribute("role")).toBe("img");
    expect(kind?.getAttribute("aria-label")).toBe("img");
    expect(kind?.title).toBe("img");
    expect(kind?.nodes().map((node) => [node.tag, node.getAttribute("aria-hidden")])).toEqual([["svg", "true"]]);
    expect(full?.one("req-method").textContent).toBe("POST");
    expect(full?.one("req-method").getAttribute("aria-label")).toBeNull();
    expect(at.boxes().map((box) => box.classList.contains("light"))).toEqual([false, true]);
    expect(light?.title).toBe(`http://cdn.test/img/logo.png\n${LIGHT_WHY}`);
    expect(full?.classList.contains("light")).toBe(false);
    expect(full?.title).toBe("http://app.test/api/item-100");
  });

  test("a kind with a mark of its own shows it in its color, the letters of a lettered one behind it", () => {
    const at = scene();
    at.store.put(image({ id: at.store.nextId(), url: "http://app.test/app.js", initiatorType: "script" }));
    at.store.put(image({ id: at.store.nextId(), url: "http://app.test/data.json", initiatorType: "fetch" }));
    at.requests.toggle();
    const [json, js] = at.rows().map((row) => row.one("req-method"));
    expect(js?.className).toBe("req-method mark");
    expect(js?.getAttribute("aria-label")).toBe("js");
    const fills = (node: FakeNode | undefined) =>
      node?.one("glyph").nodes().map((shape) => [shape.tag, shape.getAttribute("fill"), shape.getAttribute("d")]);
    // Dark letters on the yellow square, whatever the panel's scheme.
    expect(fills(js)).toEqual([
      ["path", "#000", "M1 1h22v22H1z"],
      ["path", "#F7DF1E", BRANDS.javascript[1]],
    ]);
    expect(json?.getAttribute("aria-label")).toBe("json");
    expect(fills(json)).toEqual([["path", "currentColor", BRANDS.json[1]]]);
  });

  test("a row's status changes its color with its state, one tone at a time, and its columns stay put", () => {
    const at = scene();
    const entry = at.add(10, { method: "GET", state: "pending", status: null });
    at.requests.toggle();
    const [row] = at.rows();
    const method = row?.one("req-method");
    const drawn = method?.children;
    expect(row?.one("req-status").className).toBe("req-status idle");
    for (const [status, state, className] of [
      [200, "ok", "req-status ok"],
      [304, "ok", "req-status moved"],
      [404, "failed", "req-status hot"],
      [101, "ok", "req-status"],
    ] as const) {
      at.store.update(entry.id, { state, status });
      at.timer.run();
      expect(row?.one("req-status").className).toBe(className);
    }
    // The method was written once: a row that finishes moves nothing in its first column.
    expect(method?.children).toBe(drawn);
    expect(method?.className).toBe("req-method req-get");
  });

  test("a row of the device frame looks like any other row", () => {
    const at = scene();
    at.add(10, { source: "frame" });
    at.add(20);
    at.requests.toggle();
    const [own, framed] = at.boxes();
    expect(framed?.className).toBe("row req-row");
    expect(framed?.className).toBe(own?.className ?? "");
    expect(at.pane.body.one("req-list").className).toBe("req-list");
  });

  test("a row the log let go is forgotten: a request by its id shows again as a new row", () => {
    const at = scene();
    const first = at.add(10);
    at.requests.toggle();
    const [old] = at.rows();
    at.store.clear();
    at.timer.run();
    expect(at.rows()).toEqual([]);
    // A row kept by its id past its going would be taken for this one, and never shown.
    at.store.put({ ...first, timing: { ...first.timing, start: LOADED + 20_000 } });
    at.timer.run();
    expect(at.texts().map((row) => row[1])).toEqual(["item-10"]);
    expect(at.rows()[0]).not.toBe(old);
    expect(at.pane.body.one("req-count").textContent).toBe("1");
  });

  test("a changed row is changed in place, and no other row is touched", () => {
    const at = scene();
    const first = at.add(10, { state: "pending", status: null });
    at.add(20);
    at.requests.toggle();
    const before = at.rows();
    const list = at.pane.body.one("req-list");
    const children = [...list.children];
    // Any write to the row that did not change would show here.
    const other = before[0];
    const untouched = other ? [...other.nodes()].map((node) => node.children) : [];
    at.store.update(first.id, { state: "failed", status: 503 });
    at.timer.run();
    expect(at.rows()).toEqual(before);
    expect(list.children).toEqual(children);
    expect(at.rows()[1]).toBe(before[1]);
    expect(before[1]?.one("req-status").textContent).toBe("503");
    expect(before[1]?.one("req-status").classList.contains("hot")).toBe(true);
    expect(other ? [...other.nodes()].map((node) => node.children) : []).toEqual(untouched);
    untouched.forEach((parts, index) => expect(other?.nodes()[index]?.children).toBe(parts));
  });

  test("a new row goes in at the top, over the rows that were there", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    const before = at.rows();
    at.add(30);
    at.timer.run();
    expect(names(at)).toEqual(["item-30", "item-20", "item-10"]);
    expect(at.rows().slice(1)).toEqual(before);
  });

  test("a late row, one that started earlier, goes in at its place by time and not at the top", () => {
    const at = scene();
    at.add(10);
    at.add(30);
    at.requests.toggle();
    const before = at.rows();
    at.add(20);
    // A light row that Resource Timing tells of late, older than all of them.
    at.store.put(
      image({
        id: at.store.nextId(),
        timing: { start: LOADED + 5, at: 5, response: 1, end: LOADED + 9, duration: 4 },
      }),
    );
    at.timer.run();
    expect(names(at)).toEqual(["item-30", "item-20", "item-10", "logo.png"]);
    expect(at.rows()[0]).toBe(before[0]);
    expect(at.rows()[2]).toBe(before[1]);
  });

  test("a cleared log leaves no row, and the empty line", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    at.store.clear();
    at.timer.run();
    expect(at.rows()).toEqual([]);
    expect(at.pane.body.one("empty").hidden).toBe(false);
    expect(at.pane.body.one("empty").textContent).toBe(NO_REQUESTS);
    expect(at.pane.body.one("req-count").textContent).toBe("0");
  });

  test("clear in the view's head empties the log, and the list at once", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.pane.act("clear");
    expect(at.store.entries()).toEqual([]);
    expect(at.rows()).toEqual([]);
  });

  test("rows that come in the same batch as a clear are the only ones left", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.store.clear();
    at.add(20_000);
    at.timer.run();
    expect(names(at)).toEqual(["item-20000"]);
  });

  test("rows the log let go leave the list, in a burst too", () => {
    const at = scene();
    at.requests.toggle();
    for (let index = 0; index < RING_SIZE + 5; index++) at.add(index);
    at.timer.run();
    expect(at.rows().length).toBe(RING_SIZE);
    expect(names(at)[0]).toBe(`item-${RING_SIZE + 4}`);
    expect(names(at).at(-1)).toBe("item-5");
  });

  test("comes back as it was, rows and all, after the view closed", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    const [row] = at.rows();
    at.requests.toggle();
    at.add(20);
    at.requests.toggle();
    expect(at.rows()[1]).toBe(row);
    expect(names(at)).toEqual(["item-20", "item-10"]);
  });
});

describe("the filter and the chips", () => {
  function mixed(): Scene {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users" });
    at.add(20, { method: "GET", url: "http://app.test/api/orders", state: "failed", status: 404 });
    at.store.put(
      image({
        id: at.store.nextId(),
        timing: { start: LOADED + 30, at: 30, response: 30, end: LOADED + 75, duration: 45 },
      }),
    );
    at.requests.toggle();
    return at;
  }

  test("the filter keeps the rows it finds, and says how many of how many", () => {
    const at = mixed();
    type(at, "404");
    expect(names(at)).toEqual(["orders"]);
    expect(at.pane.body.one("req-count").textContent).toBe("1 of 3");
    type(at, "post");
    expect(names(at)).toEqual(["users"]);
    type(at, "");
    expect(names(at)).toEqual(["logo.png", "orders", "users"]);
    expect(at.pane.body.one("req-count").textContent).toBe("3");
  });

  test("a filter that finds nothing says so, with the rows still in the log", () => {
    const at = mixed();
    type(at, "nothing");
    expect(names(at)).toEqual([]);
    expect(at.pane.body.one("empty").textContent).toBe(NO_MATCH);
    expect(at.pane.body.one("empty").hidden).toBe(false);
    expect(at.rows().length).toBe(3);
  });

  test("the chips pick whose requests show, and say which one is on", () => {
    const at = mixed();
    const pressed = () => at.pane.body.find("seg-item").map((node) => node.getAttribute("aria-checked"));
    expect(at.pane.body.find("seg-item").map((node) => node.textContent)).toEqual(["all", "fetch/xhr", "other"]);
    expect(pressed()).toEqual(["true", "false", "false"]);
    chip(at, "fetch/xhr").click();
    expect(names(at)).toEqual(["orders", "users"]);
    expect(pressed()).toEqual(["false", "true", "false"]);
    chip(at, "other").click();
    expect(names(at)).toEqual(["logo.png"]);
    expect(pressed()).toEqual(["false", "false", "true"]);
    chip(at, "all").click();
    expect(names(at)).toEqual(["logo.png", "orders", "users"]);
  });

  test("a row that comes in or changes is held to the filter too", () => {
    const at = mixed();
    type(at, "404");
    const late = at.add(40, { url: "http://app.test/api/late", state: "pending", status: null });
    at.timer.run();
    expect(names(at)).toEqual(["orders"]);
    at.store.update(late.id, { state: "failed", status: 404 });
    at.timer.run();
    expect(names(at)).toEqual(["late", "orders"]);
  });
});

describe("the top of the list", () => {
  /** A list of `count` rows in a box they overflow, scrolled to `top`. */
  function scrolled(count: number, top: number): Scene {
    const at = scene();
    for (let index = 0; index < count; index++) at.add(index);
    at.pane.body.scrollHeight = count * ROW_PITCH;
    at.requests.toggle();
    at.pane.body.scrollTop = top;
    at.pane.body.fire("scroll");
    return at;
  }

  /** Put `count` more requests in the log, newer than the rest, and let the box grow for them. */
  function arrive(at: Scene, count: number): void {
    for (let index = 0; index < count; index++) at.add(1000 + at.store.entries().length);
    at.pane.body.scrollHeight += count * ROW_PITCH;
    at.timer.run();
  }

  test("the list opens at its top, where the newest row is, and stays there as rows come", () => {
    const at = scrolled(20, 0);
    expect(at.pane.body.scrollTop).toBe(0);
    arrive(at, 3);
    expect(at.pane.body.scrollTop).toBe(0);
    expect(names(at)[0]).toBe("item-1022");
  });

  test("within the slack of its top it is at its top, and is brought there as rows come", () => {
    const at = scrolled(20, 3);
    arrive(at, 1);
    expect(at.pane.body.scrollTop).toBe(0);
  });

  test("scrolled down, rows that come in above move the scroll by just their height, so nothing in view moves", () => {
    const at = scrolled(20, 120);
    const inView = at.boxes()[5];
    const place = () => (inView?.getBoundingClientRect().top ?? 0) - at.pane.body.scrollTop;
    const before = place();
    arrive(at, 1);
    expect(at.pane.body.scrollTop).toBe(120 + ROW_PITCH);
    expect(place()).toBe(before);
    arrive(at, 7);
    expect(at.pane.body.scrollTop).toBe(120 + 8 * ROW_PITCH);
    expect(place()).toBe(before);
  });

  test("scrolled down, a late row that goes in under the view moves nothing", () => {
    const at = scrolled(20, 120);
    // Older than every row there, so it is the last one.
    at.add(-5);
    at.pane.body.scrollHeight += ROW_PITCH;
    at.timer.run();
    expect(names(at).at(-1)).toBe("item--5");
    expect(at.pane.body.scrollTop).toBe(120);
  });

  test("scrolled down, a late row that goes in above the view, though not at the top, is made room for too", () => {
    const at = scrolled(20, 120);
    at.add(17.5);
    at.pane.body.scrollHeight += ROW_PITCH;
    at.timer.run();
    expect(names(at).slice(0, 4)).toEqual(["item-19", "item-18", "item-17.5", "item-17"]);
    expect(at.pane.body.scrollTop).toBe(120 + ROW_PITCH);
  });

  test("scrolled down, a row the filter hides as it comes in takes no room, and moves nothing", () => {
    const at = scrolled(20, 120);
    type(at, "item");
    at.add(2000, { url: "http://app.test/other" });
    at.timer.run();
    expect(at.pane.body.scrollTop).toBe(120);
  });

  test("a row that only changes moves nothing", () => {
    const at = scrolled(20, 120);
    const [entry] = at.store.entries();
    if (entry) at.store.update(entry.id, { state: "failed", status: 500 });
    at.timer.run();
    expect(at.pane.body.scrollTop).toBe(120);
  });

  test("scrolled back to its top, it keeps to it again", () => {
    const at = scrolled(20, 120);
    at.pane.body.scrollTop = 2;
    at.pane.body.fire("scroll");
    arrive(at, 2);
    expect(at.pane.body.scrollTop).toBe(0);
  });

  test("a batch scrolls the box once at most, and not at all at its top", () => {
    const at = scrolled(20, 120);
    const before = at.pane.body.scrolls;
    arrive(at, 50);
    expect(at.pane.body.scrolls - before).toBe(1);
    expect(at.pane.body.scrollTop).toBe(120 + 50 * ROW_PITCH);
    const top = scrolled(20, 0);
    const still = top.pane.body.scrolls;
    arrive(top, 50);
    expect(top.pane.body.scrolls - still).toBe(0);
  });
});

describe("the keys in the list", () => {
  function three(): Scene {
    const at = scene();
    at.add(10);
    at.add(20, { url: "http://app.test/other" });
    at.add(30);
    at.requests.toggle();
    return at;
  }

  test("the tab key stops at one row, the newest at first", () => {
    const at = three();
    expect(at.rows().map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    expect(at.rows()[0]?.one("req-path").textContent).toBe("item-30");
  });

  test("the arrows, Home and End move the focus through the rows, and the tab stop with it", () => {
    const at = three();
    const [newest, middle, oldest] = at.rows();
    expect(names(at)).toEqual(["item-30", "other", "item-10"]);
    newest?.focus();
    // Down is the row below, an older one.
    expect(newest?.fire("keydown", { key: "ArrowDown" }).prevented).toBe(true);
    expect(focused()).toBe(middle ?? null);
    expect(at.rows().map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    middle?.fire("keydown", { key: "End" });
    expect(focused()).toBe(oldest ?? null);
    oldest?.fire("keydown", { key: "ArrowDown" });
    expect(focused()).toBe(oldest ?? null);
    oldest?.fire("keydown", { key: "ArrowUp" });
    expect(focused()).toBe(middle ?? null);
    middle?.fire("keydown", { key: "Home" });
    expect(focused()).toBe(newest ?? null);
    newest?.fire("keydown", { key: "ArrowUp" });
    expect(focused()).toBe(newest ?? null);
  });

  test("the focus and the tab stop stay on their row as rows go in above it", () => {
    const at = three();
    const [, middle] = at.rows();
    middle?.focus();
    at.add(40);
    at.add(50);
    at.timer.run();
    expect(focused()).toBe(middle ?? null);
    expect(at.rows().map((row) => row.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    // The row above it is now the oldest of the new ones.
    middle?.fire("keydown", { key: "ArrowUp" });
    expect(focused()?.one("req-path").textContent).toBe("item-30");
    focused()?.fire("keydown", { key: "ArrowUp" });
    expect(focused()?.one("req-path").textContent).toBe("item-40");
    focused()?.fire("keydown", { key: "Home" });
    expect(focused()?.one("req-path").textContent).toBe("item-50");
  });

  test("the arrows pass over the rows the filter hides, and other keys are left alone", () => {
    const at = three();
    type(at, "item");
    const [first, , third] = at.rows();
    third?.focus();
    third?.fire("keydown", { key: "ArrowUp" });
    expect(focused()).toBe(first ?? null);
    expect(first?.fire("keydown", { key: "a" }).prevented).toBe(false);
  });

  test("escape empties the filter first, and only then goes back to the rows", () => {
    const at = three();
    type(at, "other");
    const filter = at.pane.body.one("filter");
    filter.focus();
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(filter.value).toBe("");
    expect(names(at).length).toBe(3);
    // The filter keeps the focus, to be typed in again.
    expect(focused()).toBe(filter);
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("it empties the filter wherever the focus is, as the panel asks the view whenever it shows", () => {
    const at = three();
    type(at, "item-10");
    expect(names(at)).toEqual(["item-10"]);
    at.rows()[2]?.focus();
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(names(at).length).toBe(3);
    type(at, "item");
    // The focus is the page's.
    at.rows()[2]?.fire("blur");
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.body.one("filter").value).toBe("");
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("with no filter set, escape goes back at once, from the filter's field too", () => {
    const at = three();
    at.pane.body.one("filter").focus();
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("the head's way back leaves a filter as it is, for the next time the list shows", () => {
    const at = three();
    type(at, "item-10");
    at.pane.back();
    expect(at.pane.view()).toBeNull();
    at.requests.toggle();
    expect(at.pane.body.one("filter").value).toBe("item-10");
    expect(names(at)).toEqual(["item-10"]);
  });
});

describe("the detail", () => {
  /** The text of each line of a code view, its number left out. */
  const codeLines = (node: FakeNode) => node.find("src-text").map((line) => line.textContent);
  /** A section's controls in words, by what they say. */
  const act = (box: FakeNode, label: string) => {
    const found = box.find("act").find((each) => each.textContent === label);
    if (!found) throw new Error(`no ${label}`);
    return found;
  };
  const ALL_TABS = ["Headers", "Payload", "Preview", "Response", "Initiator", "Timing", "Cookies"];

  test("a click on a row shows its request in the same pane: a summary, then the tabs, on Headers", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2" });
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(at.pane.view()).toBe(REQUEST_VIEW);
    expect(at.pane.body.find("req-row")).toEqual([]);
    const said = top(at);
    // What is read most leads: the method and the path, then how it went.
    expect(parts(at.pane.body.one("req-sum"))).toEqual(["req-first", "req-second"]);
    expect(parts(at.pane.body.one("req-first"))).toEqual(["req-verb req-post", "req-url"]);
    expect(parts(at.pane.body.one("req-second"))).toEqual(["req-stat ok", "req-took", "req-host"]);
    expect(said.verb.textContent).toBe("POST");
    expect(said.path.textContent).toBe("/api/users?page=2");
    expect(said.path.title).toBe("http://app.test/api/users?page=2");
    expect(said.status.textContent).toBe("201 Created");
    expect(said.took.textContent).toBe("20ms");
    expect(said.host.textContent).toBe("app.test");
    expect(segs(at)).toEqual({ shown: ALL_TABS, on: ["Headers"] });
    expect(groups(at)).toEqual(["General", "Response Headers", "Request Headers"]);
  });

  test("the tabs are a tablist, and what shows is the panel of the one that is on", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    const bar = at.pane.body.one("tabs");
    expect(bar.getAttribute("role")).toBe("tablist");
    const tabs = bar.nodes();
    expect(tabs.map((tab) => tab.getAttribute("role"))).toEqual(tabs.map(() => "tab"));
    expect(region(at).getAttribute("role")).toBe("tabpanel");
    expect(region(at).tabIndex).toBe(0);
    expect(region(at).id).not.toBe("");
    expect(tabs.every((tab) => tab.getAttribute("aria-controls") === region(at).id)).toBe(true);
    expect(region(at).getAttribute("aria-labelledby")).toBe(tabs[0]?.id ?? "-");
    pick(at, "Timing");
    expect(region(at).getAttribute("aria-labelledby")).toBe(tabs[5]?.id ?? "-");
    // One tab stop: the tab that is on.
    expect(tabs.filter((tab) => !tab.hidden).map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, -1, -1, 0, -1]);
  });

  test("the arrows, Home and End move along the tabs that show, and pick as they go", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/a", method: "GET", requestBody: null });
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(segs(at).shown).not.toContain("Payload");
    const tabs = at.pane.body.one("tabs").nodes();
    const right = tabs[0]?.fire("keydown", { key: "ArrowRight" });
    expect(right?.prevented).toBe(true);
    // Payload is hidden, so the next one is Preview.
    expect(segs(at).on).toEqual(["Preview"]);
    expect(focused()?.textContent).toBe("Preview");
    focused()?.fire("keydown", { key: "End" });
    expect(segs(at).on).toEqual(["Cookies"]);
    focused()?.fire("keydown", { key: "ArrowRight" });
    expect(segs(at).on).toEqual(["Headers"]);
    focused()?.fire("keydown", { key: "ArrowLeft" });
    expect(segs(at).on).toEqual(["Cookies"]);
    focused()?.fire("keydown", { key: "Home" });
    expect(segs(at).on).toEqual(["Headers"]);
    expect(focused()?.fire("keydown", { key: "ArrowDown" }).prevented).toBe(false);
  });

  test("a path too long for its two lines is cut in its middle, and its tooltip has all of it", () => {
    const at = scene();
    const url = `http://app.test/api/${"a".repeat(60)}/${"b".repeat(60)}/end?x=1`;
    at.add(10, { url });
    at.requests.toggle();
    at.rows()[0]?.click();
    const shown = top(at).path.textContent;
    expect(shown.length).toBeLessThan(url.length - 40);
    expect(shown.startsWith("/api/aaaa")).toBe(true);
    expect(shown.endsWith("/end?x=1")).toBe(true);
    expect(shown).toContain("…");
    expect(top(at).path.title).toBe(url);
  });


  test("the summary is colored as the row is: the status, and the method or the kind's mark", () => {
    const at = scene();
    at.store.put(image());
    at.add(100, { method: "PATCH", state: "failed", status: 500, statusText: "" });
    at.requests.toggle();
    for (const [index, light] of [false, true].entries()) {
      const row = at.rows()[index];
      const tone = row?.one("req-status").className.replace("req-status ", "") ?? "";
      const lead = row?.one("req-method");
      row?.click();
      const said = top(at);
      // The same tone on the status, in the list and here.
      expect(said.status.className).toBe(`req-stat ${tone}`);
      if (light) {
        expect(tone).toBe("ok");
        expect(said.verb.className).toBe("req-verb mark req-image");
        expect(said.verb.getAttribute("aria-label")).toBe("img");
        const shapes = (node: FakeNode | undefined) =>
          node?.one("glyph").nodes().map((shape) => [shape.tag, [...shape.attributes]]);
        expect(shapes(said.verb)).toEqual(shapes(lead) ?? []);
        expect(shapes(said.verb)?.length).toBe(3);
        expect(said.path.textContent).toBe("/img/logo.png");
        expect(said.host.textContent).toBe("cdn.test");
      } else {
        expect(tone).toBe("hot");
        expect(said.verb.className).toBe("req-verb req-patch");
        expect(said.verb.textContent).toBe("PATCH");
        expect(lead?.className).toBe("req-method req-patch");
        expect(said.status.textContent).toBe("500");
      }
      at.pane.escape();
    }
  });


  test("General: the address, the method, and the status with a dot in its tone", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2", statusText: "" });
    at.requests.toggle();
    at.rows()[0]?.click();
    const general = groupOf(at, "General");
    expect(listed(general.one("pairs"))).toEqual([
      ["Request URL", "http://app.test/api/users?page=2"],
      ["Request Method", "POST"],
      ["Status Code", "●201 Created"],
    ]);
    const dot = general.one("req-dot");
    expect(dot.className).toBe("req-dot req-stat ok");
    expect(dot.getAttribute("aria-hidden")).toBe("true");
  });

  test("the headers: each set with its count, the request's under the browsers' warning", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(groupOf(at, "Response Headers").one("sect-count").textContent).toBe("(2)");
    expect(listed(groupOf(at, "Response Headers").one("pairs"))).toEqual([
      ["content-type", "application/json"],
      ["set-cookie", "sid=1"],
    ]);
    const request = groupOf(at, "Request Headers");
    expect(request.one("sect-count").textContent).toBe("(3)");
    expect(request.one("req-warn").textContent).toBe(`⚠${PROVISIONAL}`);
    expect(listed(request.one("pairs"))).toEqual([
      ["content-type", "application/json"],
      ["Authorization", "Bearer abc"],
      ["X-Api-Key", "k1"],
    ]);
    expect(groupOf(at, "Response Headers").find("req-warn")).toEqual([]);
  });

  test("Raw shows a set of headers as text, and stays on for the next request", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    at.rows()[1]?.click();
    const raw = act(groupOf(at, "Response Headers"), "Raw");
    expect(raw.getAttribute("aria-pressed")).toBe("false");
    raw.click();
    expect(raw.getAttribute("aria-pressed")).toBe("true");
    expect(codeLines(groupOf(at, "Response Headers"))).toEqual(["content-type: application/json", "set-cookie: sid=1"]);
    expect(groupOf(at, "Response Headers").find("pairs")).toEqual([]);
    // The request's own stay parsed: each set has its own Raw.
    expect(groupOf(at, "Request Headers").find("pairs").length).toBe(1);
    at.pane.escape();
    at.rows()[0]?.click();
    expect(act(groupOf(at, "Response Headers"), "Raw").getAttribute("aria-pressed")).toBe("true");
    expect(groupOf(at, "Response Headers").find("pairs")).toEqual([]);
  });

  test("a section closes from its head, and stays closed for the next request", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    at.rows()[1]?.click();
    const head = groupOf(at, "General").one("sect-head");
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(head.getAttribute("aria-controls")).toBe(groupOf(at, "General").one("sect-body").id);
    head.click();
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(groupOf(at, "General").one("sect-body").hidden).toBe(true);
    at.pane.escape();
    at.rows()[0]?.click();
    expect(groupOf(at, "General").one("sect-head").getAttribute("aria-expanded")).toBe("false");
    expect(groupOf(at, "Response Headers").one("sect-head").getAttribute("aria-expanded")).toBe("true");
  });

  test("the tab picked stays for the next request, and one without it opens on Headers", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.store.put(image({ id: at.store.nextId() }));
    at.requests.toggle();
    at.rows()[2]?.click();
    pick(at, "Response");
    at.pane.escape();
    at.rows()[1]?.click();
    expect(segs(at).on).toEqual(["Response"]);
    at.pane.escape();
    at.rows()[0]?.click();
    expect(segs(at)).toEqual({ shown: ["Headers", "Preview", "Initiator", "Timing"], on: ["Headers"] });
  });

  test("picking a tab starts it at its top", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    at.pane.body.scrollHeight = 500;
    at.pane.body.scrollTop = 80;
    pick(at, "Response");
    expect(at.pane.body.scrollTop).toBe(0);
    // The one that is on already moves nothing.
    at.pane.body.scrollTop = 40;
    pick(at, "Response");
    expect(at.pane.body.scrollTop).toBe(40);
  });

  test("Payload: the query's parameters, then the json sent as a tree, each with view source", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2&q=a%20b" });
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Payload");
    expect(groups(at)).toEqual(["Query String Parameters", "Request Payload"]);
    const query = groupOf(at, "Query String Parameters");
    expect(query.one("sect-count").textContent).toBe("(2)");
    expect(listed(query.one("pairs"))).toEqual([
      ["page", "2"],
      ["q", "a b"],
    ]);
    act(query, "view URL-encoded").click();
    expect(listed(query.one("pairs"))).toEqual([
      ["page", "2"],
      ["q", "a%20b"],
    ]);
    act(query, "view source").click();
    expect(codeLines(query)).toEqual(["page=2&q=a%20b"]);
    act(query, "view decoded").click();
    expect(codeLines(query)).toEqual(["page=2&q=a b"]);
    act(query, "view parsed").click();
    expect(listed(query.one("pairs"))).toEqual([
      ["page", "2"],
      ["q", "a b"],
    ]);
    const sent = groupOf(at, "Request Payload");
    const tree = sent.one("json");
    expect(tree.one("json-head").getAttribute("aria-expanded")).toBe("true");
    expect(tree.one("json-preview").textContent).toBe('{name: "Ada"}');
    expect(tree.one("json-leaf").textContent).toBe('name: "Ada"');
    expect(tree.one("json-leaf").one("tok-str").textContent).toBe('"Ada"');
    act(sent, "view source").click();
    expect(sent.find("json")).toEqual([]);
    expect(codeLines(sent)).toEqual(['{"name":"Ada"}']);
  });

  test("a node of the json tree opens to what it holds, built the first time it opens", () => {
    const at = scene();
    const text = '{"user":{"id":7,"tags":["a"]},"ok":true}';
    at.add(10, { requestBody: { kind: "text", text, size: text.length, truncated: false, type: "application/json" } });
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Payload");
    const tree = groupOf(at, "Request Payload").one("json");
    const user = tree.one("json-kids").nodes()[0];
    expect(user?.className).toBe("json-node");
    expect(user?.one("json-head").textContent).toBe("user: {id: 7, tags: Array(1)}");
    expect(user?.one("json-kids").nodes()).toEqual([]);
    user?.one("json-head").click();
    expect(user?.one("json-head").getAttribute("aria-expanded")).toBe("true");
    expect(user?.one("json-kids").nodes().map((node) => node.textContent)).toEqual(["id: 7", 'tags: ["a"]']);
    expect(tree.one("json-kids").nodes()[1]?.textContent).toBe("ok: true");
  });

  test("a form is Form Data: its fields, a file as (binary), or as it was sent", () => {
    const at = scene();
    const multipart = "name=Ada\nfile=(file a.png, image/png, 12 bytes)";
    at.add(10, { requestBody: { kind: "form", text: multipart, size: null, truncated: false, type: "multipart/form-data" } });
    at.add(20, {
      requestBody: { kind: "text", text: "a=1&b=x%20y", size: 11, truncated: false, type: "application/x-www-form-urlencoded" },
    });
    at.requests.toggle();
    at.rows()[1]?.click();
    pick(at, "Payload");
    const form = groupOf(at, "Form Data");
    expect(listed(form.one("pairs"))).toEqual([
      ["name", "Ada"],
      ["file", "(binary)"],
    ]);
    expect(form.find("act").map((each) => each.textContent)).toEqual(["view source"]);
    act(form, "view source").click();
    expect(codeLines(form)).toEqual(["name=Ada", "file=(file a.png, image/png, 12 bytes)"]);
    act(form, "view parsed").click();
    at.pane.escape();
    at.rows()[0]?.click();
    const encoded = groupOf(at, "Form Data");
    expect(listed(encoded.one("pairs"))).toEqual([
      ["a", "1"],
      ["b", "x y"],
    ]);
    act(encoded, "view URL-encoded").click();
    expect(listed(encoded.one("pairs"))).toEqual([
      ["a", "1"],
      ["b", "x%20y"],
    ]);
  });

  test("a request with only a query has that alone, and a GET with neither has no Payload", () => {
    const at = scene();
    at.add(10, { method: "GET", requestBody: null });
    at.add(20, { method: "GET", requestBody: null, url: "http://app.test/api/users?page=2" });
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Payload");
    expect(groups(at)).toEqual(["Query String Parameters"]);
    at.pane.escape();
    at.rows()[1]?.click();
    expect(segs(at).shown).not.toContain("Payload");
    expect(segs(at).on).toEqual(["Headers"]);
  });

  test("Response: the body a numbered line a row, json laid out and colored, with its copy", async () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Response");
    const body = region(at).one("req-response");
    expect(body.one("group-label").textContent).toBe("application/json");
    expect(codeLines(body)).toEqual(["{", '  "id": 7,', '  "name": "Ada"', "}"]);
    expect(body.find("src-num").map((each) => each.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(body.find("tok-key").map((each) => each.textContent)).toEqual(['"id"', '"name"']);
    expect(body.find("tok-num").map((each) => each.textContent)).toEqual(["7"]);
    // A wrapped line goes on two steps in from where its own text starts.
    const second = body.find("src-text")[1];
    expect([second?.style.paddingLeft, second?.style.textIndent]).toEqual(["4ch", "-4ch"]);
    const copy = body.one("req-copy");
    expect(copy.getAttribute("aria-label")).toBe("copy the response");
    copy.click();
    await Promise.resolve();
    expect(at.copies).toEqual(['{"id":7,"name":"Ada"}']);
    expect(at.pane.title()).toBe("copied");
    // Only the whole request's copy leaves anything out, so only that says so.
    expect(at.pane.body.find("note").find((node) => node.textContent === HIDES_NOTE)?.hidden).toBe(true);
    at.pane.close();
  });

  test("the payload's copy copies the body as it was sent", async () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Payload");
    groupOf(at, "Request Payload").one("req-copy").click();
    await Promise.resolve();
    expect(at.copies).toEqual(['{"name":"Ada"}']);
    at.pane.close();
  });

  test("a response with no body says so in the browsers' words, and one that is coming says that", () => {
    const at = scene();
    at.add(10, { responseBody: null });
    at.add(20, { state: "pending", status: null, statusText: "", responseHeaders: [], responseBody: null });
    at.add(30, { state: "failed", status: null, error: "TypeError: Failed to fetch", responseHeaders: [], responseBody: null });
    at.requests.toggle();
    at.rows()[2]?.click();
    pick(at, "Response");
    const said = () => region(at).one("note").textContent;
    expect(said()).toBe(NO_RESPONSE_DATA);
    at.pane.escape();
    at.rows()[1]?.click();
    expect(said()).toBe("waiting for the response");
    at.pane.escape();
    at.rows()[0]?.click();
    expect(said()).toBe("Failed to load response data");
    expect(region(at).find("req-copy")).toEqual([]);
  });

  test("a body that was cut says so in a line over its text, and is shown as kept", () => {
    const at = scene();
    at.add(10, {
      responseBody: { kind: "text", text: '{"id":7,"na', size: null, truncated: true, type: "application/json" },
    });
    at.add(20, {
      responseBody: { kind: "text", text: "half", size: null, truncated: true, timedOut: true, type: "text/plain" },
    });
    at.requests.toggle();
    at.rows()[1]?.click();
    pick(at, "Response");
    const cut = region(at).one("req-response");
    expect(parts(cut)).toEqual(["group", "note", "src"]);
    expect(cut.one("note").textContent).toBe("first 64 KB");
    expect(codeLines(cut)).toEqual(['{"id":7,"na']);
    at.pane.escape();
    at.rows()[0]?.click();
    expect(region(at).one("note").textContent).toBe("cut after 2 seconds");
  });

  test("a body with nothing to show says so in one line, with no empty block and no copy", () => {
    const at = scene();
    at.add(10, {
      requestBody: { kind: "stream", text: "", size: null, truncated: false, type: "" },
      responseBody: null,
    });
    at.add(20, {
      requestBody: null,
      responseBody: { kind: "binary", text: "", size: 2048, truncated: false, type: "image/png" },
    });
    at.requests.toggle();
    at.rows()[1]?.click();
    pick(at, "Payload");
    expect(groupOf(at, "Request Payload").one("note").textContent).toBe("not read: a stream");
    expect(region(at).find("req-copy")).toEqual([]);
    at.pane.escape();
    at.rows()[0]?.click();
    pick(at, "Response");
    expect(region(at).one("note").textContent).toBe("binary, 2 KB, image/png");
    expect(region(at).find("src")).toEqual([]);
    expect(region(at).find("req-copy")).toEqual([]);
  });

  test("html, css and javascript answers are colored for what they are", () => {
    const at = scene();
    at.add(10, {
      contentType: "text/html",
      responseBody: { kind: "text", text: '<a href="/x">hi</a>', size: 19, truncated: false, type: "text/html" },
    });
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Response");
    expect(region(at).find("tok-attr").map((each) => each.textContent)).toEqual(["href"]);
    expect(region(at).find("tok-str").map((each) => each.textContent)).toEqual(['"/x"']);
  });

  test("a light row says what the browser gives, shows General, Preview, Initiator and Timing, and opens on Headers", () => {
    const at = scene();
    at.store.put(image());
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(segs(at)).toEqual({ shown: ["Headers", "Preview", "Initiator", "Timing"], on: ["Headers"] });
    expect(region(at).nodes()[0]?.textContent).toBe(LIGHT_WHY);
    expect(groups(at)).toEqual(["General"]);
    expect(listed(groupOf(at, "General").one("pairs"))).toEqual([
      ["Request URL", "http://cdn.test/img/logo.png"],
      ["Status Code", "●200 OK"],
    ]);
    pick(at, "Initiator");
    expect(groups(at)).toEqual(["Request initiator chain"]);
    expect(region(at).find("req-link").map((link) => link.textContent)).toEqual(["http://cdn.test/img/logo.png"]);
    expect(listed(region(at).one("pairs"))).toEqual([["Initiator", "an <img> element"]]);
    pick(at, "Timing");
    expect(groups(at)).toEqual(["Request"]);
    expect(groupOf(at, "Request").textContent).toContain("hidden: the server sends no Timing-Allow-Origin");
  });

  test("Timing: when it was queued, what the page saw in its phases with a bar each, the total, and what the request is", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Timing");
    expect(region(at).one("req-when").textContent).toBe("Queued at 10.00 ms");
    expect(groups(at)).toEqual(["Request/Response", "Request"]);
    const phases = groupOf(at, "Request/Response");
    expect(phases.one("req-dur").textContent).toBe("DURATION");
    expect(phases.find("req-phase").map((each) => each.textContent)).toEqual(["Waiting for server response", "Content Download"]);
    expect(phases.find("req-ms").map((each) => each.textContent)).toEqual(["5.00 ms", "15.00 ms"]);
    expect(phases.find("req-span").map((bar) => [bar.className, bar.style.left, bar.style.width])).toEqual([
      ["req-span wait", "0.00%", "25.00%"],
      ["req-span download", "25.00%", "75.00%"],
    ]);
    const total = region(at).one("req-total");
    expect([total.one("req-phase").textContent, total.one("req-ms").textContent]).toEqual(["Total", "20.00 ms"]);
    expect(region(at).textContent).toContain(TIMING_MISSING);
    expect(listed(groupOf(at, "Request").one("pairs"))).toEqual([
      ["Type", "fetch"],
      ["Size", "1.5 kB transferred over network, resource size: 21 B"],
      ["Protocol", "h2"],
    ]);
    expect(region(at).textContent).not.toContain("Bearer abc");
  });

  test("Timing from Resource Timing: Queued at, Started at and each section, and a caution while it runs", () => {
    const at = scene();
    const phases = {
      startTime: 12,
      workerStart: 0,
      redirectStart: 0,
      redirectEnd: 0,
      fetchStart: 12,
      domainLookupStart: 13,
      domainLookupEnd: 14,
      connectStart: 14,
      secureConnectionStart: 0,
      connectEnd: 16,
      requestStart: 16,
      responseStart: 20,
      responseEnd: 30,
    };
    at.add(10, { phases });
    at.add(40, { state: "pending", timing: { start: LOADED + 40, at: 40, response: null, end: null, duration: null } });
    at.requests.toggle();
    at.rows()[1]?.click();
    pick(at, "Timing");
    expect(region(at).one("req-when").nodes().map((line) => line.textContent)).toEqual(["Queued at 10.00 ms", "Started at 12.00 ms"]);
    expect(groups(at)).toEqual(["Resource Scheduling", "Connection Start", "Request/Response", "Request"]);
    expect(groupOf(at, "Connection Start").find("req-phase").map((each) => each.textContent)).toEqual([
      "Stalled",
      "DNS Lookup",
      "Initial connection",
    ]);
    at.pane.escape();
    at.rows()[0]?.click();
    expect(region(at).textContent).toContain("CAUTION: request is not finished yet!");
  });

  test("Preview: json as a tree, an image as itself with its size, html drawn with no scripts", () => {
    const at = scene();
    at.add(10);
    at.add(20, {
      method: "GET",
      contentType: "image/png",
      url: "http://app.test/logo.png",
      responseBody: { kind: "binary", text: "", size: 70, truncated: false, type: "image/png" },
    });
    at.add(30, {
      contentType: "text/html",
      responseBody: { kind: "text", text: "<p>hi</p>", size: 9, truncated: false, type: "text/html" },
    });
    at.requests.toggle();
    at.rows()[2]?.click();
    pick(at, "Preview");
    expect(region(at).one("json-head").textContent).toBe('{id: 7, name: "Ada"}');
    at.pane.escape();
    at.rows()[1]?.click();
    const picture = region(at).one("req-picture");
    expect(Reflect.get(picture, "src")).toBe("http://app.test/logo.png");
    Reflect.set(picture, "naturalWidth", 16);
    Reflect.set(picture, "naturalHeight", 8);
    picture.fire("load");
    expect(region(at).one("req-natural").textContent).toBe("16 × 8");
    expect(region(at).textContent).toContain("21 bytes, image/png");
    at.pane.escape();
    at.rows()[0]?.click();
    const frame = region(at).one("req-html");
    expect(frame.tag).toBe("iframe");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toBe(`${PREVIEW_POLICY}<p>hi</p>`);
  });

  test("Cookies: Request Cookies and Response Cookies, a cookie's fields in the table's words", () => {
    const at = scene();
    at.add(10, { requestHeaders: [["Cookie", "a=1"]] });
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Cookies");
    expect(groups(at)).toEqual(["Request Cookies", "Response Cookies"]);
    expect(listed(groupOf(at, "Request Cookies").one("pairs"))).toEqual([
      ["Name", "a"],
      ["Value", "1"],
      ["Size", "3"],
    ]);
    expect(listed(groupOf(at, "Response Cookies").one("pairs"))).toEqual([
      ["Name", "sid"],
      ["Value", "1"],
      ["Expires / Max-Age", "Session"],
      ["Size", "5"],
    ]);
  });

  test("EventStream: an EventSource's messages as Id, Type, Data and Time, cut data ending in …; a stream read with fetch says why it has none", () => {
    const at = scene();
    const stream = { kind: "stream" as const, text: "", size: null, truncated: false, type: "text/event-stream" };
    at.add(10, { contentType: "text/event-stream", responseBody: stream });
    at.add(20, {
      kind: "eventsource",
      method: "GET",
      contentType: "text/event-stream",
      requestBody: null,
      responseBody: null,
      messages: [
        { type: "tick", data: '{"tick":1}', id: "", truncated: false, time: LOADED + 100 },
        { type: "done", data: '{"done":', id: "9", truncated: true, time: LOADED + 200 },
      ],
    });
    at.requests.toggle();
    at.rows()[1]?.click();
    pick(at, "EventStream");
    expect(region(at).textContent).toBe(FETCH_STREAM);
    at.pane.escape();
    at.rows()[0]?.click();
    expect(segs(at).on).toEqual(["EventStream"]);
    const lines = region(at).find("req-event").map((line) => line.nodes().map((cell) => cell.textContent));
    expect(lines).toEqual([
      ["Id", "Type", "Data", "Time"],
      ["", "tick", '{"tick":1}', clockTime(new Date(LOADED + 100))],
      ["9", "done", '{"done":…', clockTime(new Date(LOADED + 200))],
    ]);
  });

  test("the initiator is a frame a line, the frames that are not the page's own as one line that opens", async () => {
    const at = scene();
    at.add(10, {
      initiator: [
        "at save (http://app.test/src/app.js:10:5)",
        "at dispatch (http://app.test/node_modules/redux/redux.js:200:11)",
        "at next (http://app.test/node_modules/redux/redux.js:300:1)",
        "at onClick (http://app.test/src/app.js:22:3)",
      ].join("\n"),
    });
    at.requests.toggle();
    at.rows()[0]?.click();
    pick(at, "Initiator");
    const stack = region(at).one("req-stack");
    const frames = () => stack.nodes().map((row) => row.nodes().map((cell) => cell.textContent));
    expect(groups(at)).toEqual(["Request call stack", "Request initiator chain"]);
    expect(frames()).toEqual([["save", "app.js:10:5"], ["Show 2 ignore-listed frames"], ["onClick", "app.js:22:3"]]);
    const where = stack.find("req-where")[0];
    expect(where?.title).toBe("http://app.test/src/app.js:10:5");
    where?.click();
    await Promise.resolve();
    expect(at.copies).toEqual(["http://app.test/src/app.js:10:5"]);
    stack.one("req-skipped").click();
    expect(frames()).toEqual([
      ["save", "app.js:10:5"],
      ["dispatch", "redux.js:200:11"],
      ["next", "redux.js:300:1"],
      ["onClick", "app.js:22:3"],
    ]);
    at.pane.close();
  });


  test("escape goes back to the list first, to the row it came from, and then closes", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    const [first] = at.rows();
    first?.click();
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows()[0]).toBe(first);
    expect(focused()).toBe(first ?? null);
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });


  test("the head's way back goes back too, and the list is where it was", () => {
    const at = scene();
    for (let index = 0; index < 10; index++) at.add(index);
    at.pane.body.scrollHeight = 500;
    at.requests.toggle();
    at.pane.body.scrollTop = 120;
    at.pane.body.fire("scroll");
    at.rows()[3]?.click();
    at.pane.back();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.body.scrollTop).toBe(120);
  });


  test("back finds its row still in view, with the rows that came in the meantime above it", () => {
    const at = scene();
    for (let index = 0; index < 10; index++) at.add(index);
    at.pane.body.scrollHeight = 500;
    at.requests.toggle();
    at.pane.body.scrollTop = 120;
    at.pane.body.fire("scroll");
    const row = at.rows()[5];
    row?.click();
    at.add(100);
    at.add(110);
    at.pane.body.scrollHeight = 500 + 2 * ROW_PITCH;
    at.pane.back();
    expect(at.rows()[7]).toBe(row);
    expect(focused()).toBe(row ?? null);
    // The row is as far from the top of the box as it was.
    expect(at.pane.body.scrollTop).toBe(120 + 2 * ROW_PITCH);
  });


  test("follows its request while it is pending, in place: the tab, the scroll and what was opened stay", () => {
    const at = scene();
    const entry = at.add(10, {
      state: "pending",
      status: null,
      statusText: "",
      responseHeaders: [],
      responseBody: null,
      timing: { start: LOADED + 10, at: 10, response: null, end: null, duration: null },
    });
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(top(at).status.textContent).toBe("pending");
    expect(top(at).status.className).toBe("req-stat idle");
    expect(top(at).took.textContent).toBe("");
    expect(groups(at)).toEqual(["General", "Request Headers"]);
    const request = groupOf(at, "Request Headers");
    act(request, "Raw").click();
    at.pane.body.scrollHeight = 500;
    at.pane.body.scrollTop = 60;
    const scrolls = at.pane.body.scrolls;
    at.store.update(entry.id, {
      state: "ok",
      status: 200,
      statusText: "OK",
      responseHeaders: [["content-type", "application/json"]],
      responseBody: { kind: "text", text: "[1]", size: 3, truncated: false, type: "application/json" },
      timing: { start: LOADED + 10, at: 10, response: 30, end: LOADED + 50, duration: 40 },
    });
    at.timer.run();
    expect(top(at).status.textContent).toBe("200 OK");
    expect(top(at).status.className).toBe("req-stat ok");
    expect(top(at).took.textContent).toBe("40ms");
    expect(segs(at).on).toEqual(["Headers"]);
    expect(groups(at)).toEqual(["General", "Response Headers", "Request Headers"]);
    // What did not change is not built again, so what the user switched in it stays as it was.
    expect(groupOf(at, "Request Headers")).toBe(request);
    expect(act(request, "Raw").getAttribute("aria-pressed")).toBe("true");
    // The view never moved the scroll.
    expect(at.pane.body.scrollTop).toBe(60);
    expect(at.pane.body.scrolls).toBe(scrolls);
    pick(at, "Response");
    expect(codeLines(region(at))).toEqual(["[", "  1", "]"]);
  });

  test("a tab appears when its data arrives, and the one picked stays through a change", () => {
    const at = scene();
    const entry = at.add(10, {
      method: "GET",
      state: "pending",
      status: null,
      statusText: "",
      requestBody: null,
      responseHeaders: [],
      responseBody: null,
    });
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(segs(at)).toEqual({ shown: ["Headers", "Preview", "Response", "Initiator", "Timing"], on: ["Headers"] });
    pick(at, "Timing");
    const request = groupOf(at, "Request");
    at.store.update(entry.id, {
      state: "ok",
      status: 200,
      statusText: "OK",
      responseHeaders: [["set-cookie", "a=1"]],
      responseBody: { kind: "text", text: "[1]", size: 3, truncated: false, type: "application/json" },
    });
    at.timer.run();
    expect(segs(at)).toEqual({ shown: [...ALL_TABS.filter((tab) => tab !== "Payload")], on: ["Timing"] });
    // What it is did not change, so that part is the node it was.
    expect(groupOf(at, "Request")).toBe(request);
  });
});

describe("a request the log lets go while it shows", () => {
  const note = (at: Scene) => at.pane.body.find("note").find((node) => node.textContent === GONE_NOTE);

  test("says so quietly, and keeps what it showed", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(note(at)?.hidden).toBe(true);
    at.add(20);
    at.timer.run();
    expect(note(at)?.hidden).toBe(true);
    at.store.clear();
    at.timer.run();
    expect(note(at)?.hidden).toBe(false);
    expect(top(at).path.textContent).toBe("/api/item-10");
    at.pane.close();
  });

  test("pushed out by newer ones, too", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    for (let index = 1; index <= RING_SIZE; index++) at.add(10 + index);
    at.timer.run();
    expect(note(at)?.hidden).toBe(false);
    at.pane.close();
  });
});

describe("copy", () => {
  test("copies the request as text, says so, and the first time says what it left out", async () => {
    const at = scene();
    const entry = at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    const note = () => at.pane.body.find("note").find((node) => node.textContent === HIDES_NOTE);
    expect(note()?.hidden).toBe(true);
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.copies).toEqual([copyText(entry)]);
    expect(at.copies[0]).toContain("Authorization: <hidden>");
    expect(at.copies[0]).not.toContain("Bearer abc");
    expect(at.pane.title()).toBe("copied");
    expect(at.said.textContent).toBe("copied");
    expect(note()?.hidden).toBe(false);
    // The view shows the headers as the page set them.
    expect(groupOf(at, "Request Headers").textContent).toContain("Bearer abc");
    at.pane.escape();
    at.rows()[0]?.click();
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(note()?.hidden).toBe(true);
    at.pane.close();
  });

  test("a copy that did not go through says so, and keeps the note for one that does", async () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    const note = () => at.pane.body.find("note").find((node) => node.textContent === HIDES_NOTE);
    at.copying.works = false;
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.pane.title()).toBe("copy failed");
    expect(at.said.textContent).toBe("copy failed");
    expect(note()?.hidden).toBe(true);
    at.copying.works = true;
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.pane.title()).toBe("copied");
    expect(note()?.hidden).toBe(false);
    at.pane.close();
  });

  /** Run with the clock's timers held: what waits, by its delay, and the way to let one run. */
  async function held(run: (waits: () => number[], fire: () => void) => Promise<void>): Promise<void> {
    const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
    let pending: { id: number; ms: number; run: () => void }[] = [];
    let last = 0;
    Reflect.set(globalThis, "setTimeout", (callback: () => void, ms: number) => {
      pending.push({ id: ++last, ms, run: callback });
      return last;
    });
    Reflect.set(globalThis, "clearTimeout", (id: number) => {
      pending = pending.filter((each) => each.id !== id);
    });
    try {
      await run(
        () => pending.map((each) => each.ms),
        () => pending.shift()?.run(),
      );
    } finally {
      Reflect.set(globalThis, "setTimeout", real.set);
      Reflect.set(globalThis, "clearTimeout", real.clear);
    }
  }

  test("the head says how it went for a moment, in its title's place, and then its title again", async () => {
    await held(async (waits, fire) => {
      const at = scene();
      at.add(10);
      at.requests.toggle();
      at.rows()[0]?.click();
      expect(at.pane.title()).toBe(REQUEST_TITLE);
      at.pane.act("copy as text for AI");
      await Promise.resolve();
      expect(at.pane.title()).toBe("copied");
      // A second copy starts the moment again: one timer waits, not two.
      at.pane.act("copy as text for AI");
      await Promise.resolve();
      expect(waits()).toEqual([COPIED_SHOWS]);
      fire();
      expect(at.pane.title()).toBe(REQUEST_TITLE);
      expect(at.pane.view()).toBe(REQUEST_VIEW);
    });
  });

  test("the word does not outlive its request: back takes the timer, and the list keeps its title", async () => {
    await held(async (waits) => {
      const at = scene();
      at.add(10);
      at.requests.toggle();
      at.rows()[0]?.click();
      at.pane.act("copy as text for AI");
      await Promise.resolve();
      expect(waits().length).toBe(1);
      at.pane.back();
      expect(waits()).toEqual([]);
      expect(at.pane.title()).toBe("requests");
    });
  });

  test("a copy that lands after its request left says nothing in the head", async () => {
    await held(async (waits) => {
      const at = scene();
      at.add(10);
      at.add(20);
      at.requests.toggle();
      at.rows()[0]?.click();
      at.pane.act("copy as text for AI");
      at.pane.back();
      at.rows()[1]?.click();
      await Promise.resolve();
      expect(at.pane.title()).toBe(REQUEST_TITLE);
      expect(waits()).toEqual([]);
      expect(at.said.textContent).toBe("copied");
      at.pane.close();
    });
  });

  test("copies the request as it is now, not as it was when it opened", async () => {
    const at = scene();
    const entry = at.add(10, { state: "pending", status: null, statusText: "" });
    at.requests.toggle();
    at.rows()[0]?.click();
    at.store.update(entry.id, { state: "failed", status: 500, statusText: "Server Error" });
    at.timer.run();
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.copies[0]).toContain("status: 500 Server Error");
    at.pane.close();
  });
});

describe("the way back", () => {
  /** Two requests in the list, which a control of the panel opened. */
  function opened(): { at: Scene; trigger: FakeNode } {
    const at = scene();
    at.add(10);
    at.add(20);
    const trigger = fake(document.createElement("button"));
    trigger.focus();
    at.requests.toggle();
    return { at, trigger };
  }

  test("is one control at a time, in the head: over the list, and over a request", () => {
    const { at } = opened();
    expect(at.pane.ways().map((way) => way.getAttribute("aria-label"))).toEqual(["back from requests"]);
    expect(at.pane.title()).toBe("requests");
    at.rows()[0]?.click();
    expect(at.pane.ways().map((way) => way.getAttribute("aria-label"))).toEqual(["back from request"]);
    expect(at.pane.title()).toBe(REQUEST_TITLE);
    // The detail has no way back of its own, and no row at all.
    expect(at.pane.body.find("main")).toEqual([]);
    at.pane.back();
    expect(at.pane.ways().map((way) => way.getAttribute("aria-label"))).toEqual(["back from requests"]);
  });

  test("from a request it is the list, and from the list the panel's rows", () => {
    const { at, trigger } = opened();
    const [first] = at.rows();
    first?.click();
    expect(focused()).toBe(at.pane.ways()[0] ?? null);
    at.pane.back();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows()[0]).toBe(first);
    expect(focused()).toBe(first ?? null);
    at.pane.back();
    expect(at.pane.view()).toBeNull();
    // The focus is back on what opened the list, not on what opened the request.
    expect(focused()).toBe(trigger);
  });

  test("escape takes the same steps: the request, the list's filter, the list", () => {
    const { at, trigger } = opened();
    type(at, "item");
    at.rows()[1]?.click();
    const steps: [string | null, string][] = [];
    for (let step = 0; step < 3; step++) {
      at.pane.escape();
      steps.push([at.pane.view(), at.pane.body.find("filter")[0]?.value ?? ""]);
    }
    expect(steps).toEqual([
      [REQUESTS_VIEW, "item"],
      [REQUESTS_VIEW, ""],
      [null, ""],
    ]);
    expect(focused()).toBe(trigger);
    // With no view, escape is not the view's any more.
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("back from a request the log let go leaves the focus on the head, as its row is gone", () => {
    const { at } = opened();
    at.rows()[1]?.click();
    at.store.clear();
    at.timer.run();
    at.pane.back();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows()).toEqual([]);
    expect(focused()).toBe(at.pane.ways()[0] ?? null);
  });

  test("each step cleans up the view it leaves, once, and the body is empty after the last", () => {
    const { at } = opened();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([1, 0]);
    at.rows()[0]?.click();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([2, 1]);
    // The list's bar left with it: the one that shows is the request's.
    expect(at.pane.body.find("req-list")).toEqual([]);
    expect(at.pane.body.find("toolbar").map((bar) => bar.parent?.className)).toEqual(["req-detail"]);
    at.pane.back();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([3, 2]);
    expect(at.pane.body.find("req-detail")).toEqual([]);
    at.pane.back();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([3, 3]);
    expect(at.pane.body.children).toEqual([]);
    // Nothing listens to the log any more.
    at.add(30);
    expect(at.timer.waiting()).toBe(0);
  });

  test("the view opened again starts at the list, never at the request it last showed", () => {
    const { at } = opened();
    at.rows()[0]?.click();
    at.requests.toggle();
    expect(at.pane.view()).toBeNull();
    expect(at.pane.body.children).toEqual([]);
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows().length).toBe(2);
  });

  test("the head's actions are the view's own, with their tooltips: clear over the list, copy over a request", () => {
    const { at } = opened();
    const labels = () => at.pane.node.find("view-action").map((each) => each.getAttribute("aria-label"));
    expect(labels()).toEqual(["clear"]);
    at.rows()[0]?.click();
    expect(labels()).toEqual(["copy as text for AI"]);
    at.pane.back();
    expect(labels()).toEqual(["clear"]);
    expect(at.pane.tipped).toEqual(["clear", "copy as text for AI", "clear"]);
  });
});

describe("listening", () => {
  test("the list listens while it shows, and stops when the view closes", () => {
    const at = scene();
    at.add(10);
    expect(at.timer.waiting()).toBe(0);
    at.requests.toggle();
    at.add(20);
    expect(at.timer.waiting()).toBe(1);
    at.timer.run();
    at.requests.toggle();
    expect(at.pane.cleanups).toBe(1);
    at.add(30);
    // With no one to tell, the log gathers nothing.
    expect(at.timer.waiting()).toBe(0);
  });

  test("the detail listens in the list's place, and stops too", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(at.pane.cleanups).toBe(1);
    at.add(20);
    expect(at.timer.waiting()).toBe(1);
    at.timer.run();
    at.pane.close();
    expect(at.pane.cleanups).toBe(2);
    at.add(30);
    expect(at.timer.waiting()).toBe(0);
  });
});
