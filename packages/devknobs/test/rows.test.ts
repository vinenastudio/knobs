import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from "bun:test";
import * as engine from "../src/engine";
import { DEFAULT_PINNED, DEFAULT_STATE, merge } from "../src/engine/store";
import type { GrabControl } from "../src/grab/control";
import { PREFER_HINT } from "../src/host";
import { BINDINGS, type LiveKeys } from "../src/ui/bindings";
import { type Action, actionRow, ROWS, type Row, type RowId } from "../src/ui/catalog";
import { rowBox, rowButton, rowsLabel } from "../src/ui/dom";
import { HOLD } from "../src/ui/hold";
import { defaultKeys } from "../src/ui/keys";
import { isListed } from "../src/ui/list";
import { viewHead } from "../src/ui/pane";
import type { LivePrefs } from "../src/ui/prefs";
import { createRows, type Rows, rowLine } from "../src/ui/rows";
import { createSettings, REAL_PHONE_HINT, type Settings, type SettingsContext } from "../src/ui/settings";
import { stage } from "../src/ui/stage";
import { CSS } from "../src/ui/styles";
import type { Tips } from "../src/ui/tooltip";
import { FakeNode, fake, leave, page, rules } from "./kit-dom";

function row(id: RowId): Row {
  const found = ROWS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

function node(tag: string, className = ""): HTMLElement {
  const made = document.createElement(tag);
  made.className = className;
  return made;
}

/** The classes of a node's children, in order. */
function parts(of: unknown): string[] {
  return fake(of).children.map((child) => child.className || child.tag);
}

/** Preferences that show the handle and keep nothing, but the handle a test sets. */
function quietPrefs(onHandle: (on: boolean) => void = () => {}): LivePrefs {
  return {
    get: () => ({
      handle: true,
      listWidth: 240,
      viewWidth: 340,
      stylesMode: "simple",
      stylesBox: true,
      changesDiff: false,
      htmlHeight: 200,
      htmlFull: false,
    }),
    setHandle: onHandle,
    setWidth: () => {},
    setStylesMode: () => {},
    setStylesBox: () => {},
    setChangesDiff: () => {},
    setHtmlSize: () => {},
    subscribe: () => () => {},
    destroy: () => {},
  };
}

/** The settings, built with nothing behind them but what a test hands them. */
function buildSettings(more: Partial<SettingsContext> = {}): Settings {
  const keys: LiveKeys = {
    get: () => defaultKeys(),
    custom: () => false,
    set: () => {},
    subscribe: () => () => {},
    recording: false,
    destroy: () => {},
  };
  const tips: Tips = {
    show: () => {},
    hide: () => false,
    hideAfter: () => {},
    isFor: () => false,
    tooltip: () => {},
    destroy: () => {},
  };
  return createSettings({
    keys,
    prefs: quietPrefs(),
    grab: null,
    inspect: null,
    mac: true,
    bindingsHere: BINDINGS,
    keysToggle: document.createElement("button"),
    said: node("div"),
    tips,
    render: () => {},
    renderKeys: () => {},
    handleShown: () => true,
    showHandle: () => {},
    devIconShown: () => true,
    setDevIcon: () => {},
    realPhone: false,
    setRealPhone: () => {},
    native: null,
    setNative: () => {},
    prefer: null,
    setPrefer: () => {},
    searching: () => false,
    leaveSearch: () => {},
    ...more,
  });
}

function settings(): FakeNode {
  return fake(buildSettings().view);
}

beforeEach(page);
afterEach(leave);

describe("the row builder", () => {
  test("a row is a line: what leads, the main with its icon, title and ends, then what comes after", () => {
    const main = node("button", "main");
    const grip = node("button", "grip");
    const value = node("span", "row-value");
    const clear = node("button", "clear");
    const { box, label } = rowBox({
      main,
      grip,
      glyph: node("svg", "glyph"),
      title: "device",
      ends: [value],
      after: [clear],
    });
    expect(box.className).toBe("row");
    expect(parts(box)).toEqual(["line"]);
    expect(parts(fake(box).children[0])).toEqual(["lead grip", "main", "clear"]);
    expect(parts(main)).toEqual(["glyph", "row-label", "row-value"]);
    expect(label.textContent).toBe("device");
  });

  test("the grip's column holds a grip beside the main and nothing else: a chevron is a row's icon", () => {
    const grip = node("button", "grip");
    rowBox({ main: node("button", "main"), grip, title: "scheme" });
    const back = node("button", "main");
    const chevron = node("svg", "glyph");
    rowBox({ main: back, glyph: chevron, title: "styles" });
    expect(fake(grip).classes()).toContain("lead");
    // The chevron is part of its button: a press on it is a press on the main.
    expect(fake(back).children[0]).toBe(fake(chevron));
    expect(parts(back)).toEqual(["glyph", "row-label"]);
  });

  test("a row with nothing leading has no slot node, and the same main: the padding keeps the column", () => {
    const main = node("div", "main");
    const { box } = rowBox({ main, glyph: node("svg", "glyph"), title: "show handle" });
    expect(parts(fake(box).children[0])).toEqual(["main"]);
    expect(parts(main)).toEqual(["glyph", "row-label"]);
  });

  test("the grip's place and width are said once, from the columns, and a row's content starts where its layout says", () => {
    const all = rules(CSS);
    const slot = all.filter((rule) => rule.selector === ".lead");
    expect(slot).toHaveLength(1);
    expect(slot[0]?.body).toMatch(/left:\s*var\(--view-start\)/);
    expect(slot[0]?.body).toMatch(/width:\s*var\(--col-icon\)/);
    expect(slot[0]?.body).toMatch(/position:\s*absolute/);
    const main = all.find((rule) => rule.selector === ".main");
    expect(main?.body).toMatch(/padding:\s*4px var\(--view-end\) 4px var\(--view-start\)/);
    const geometry = /(^|[\s;])(width|left|right|position|padding|margin)\s*:/;
    for (const rule of all) {
      const leading = /\.(lead|grip|turn)\b/.test(rule.selector) && rule.selector !== ".lead";
      if (leading) expect(`${rule.selector} {${rule.body}}`).not.toMatch(geometry);
    }
  });

  test("the small button a row ends with is one class, named for the code that looks for it", () => {
    const x = rowButton("clear", node("svg", "glyph"), "reset device");
    expect(x.className).toBe("row-button clear");
    expect(x.type).toBe("button");
    expect(fake(x).attributes.get("aria-label")).toBe("reset device");
    const selectors = rules(CSS).map((rule) => rule.selector);
    expect(selectors).toContain(".row-button");
    expect(selectors).not.toContain(".clear");
    expect(selectors).not.toContain(".view-action");
  });
});

describe("a row's line", () => {
  test("a knob row: the grip, its icon and name, what it says, and its x", () => {
    const line = rowLine(row("device"));
    expect(line.box.dataset.row).toBe("device");
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value"]);
    expect(line.key).toBeNull();
    expect(fake(line.clear).attributes.get("aria-label")).toBe("reset device (hold to remove)");
    expect(fake(line.grip).attributes.get("aria-label")).toBe("move device");
  });

  test("an action's row is the same line, with its key at the end", () => {
    const knob = rowLine(row("device"));
    const line = rowLine(row("grab"));
    expect(line.box.className).toBe(knob.box.className);
    expect(line.main.className).toBe(knob.main.className);
    expect(line.grip.className).toBe(knob.grip.className);
    expect(line.clear.className).toBe(knob.clear.className);
    expect(parts(fake(line.box).children[0])).toEqual(parts(fake(knob.box).children[0]));
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value", "hint-key row-key"]);
    expect(fake(line.main).children[1]?.textContent).toBe("grab");
    expect(fake(line.clear).attributes.get("aria-label")).toBe("reset grab (hold to remove)");
  });

  test("inspect's row is that line too: its icon, its name, its key, and an x that resets it and removes it held", () => {
    const grab = rowLine(row("grab"));
    const line = rowLine(row("inspect"));
    expect(line.box.dataset.row).toBe("inspect");
    expect(line.box.className).toBe(grab.box.className);
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value", "hint-key row-key"]);
    expect(fake(line.main).children[1]?.textContent).toBe("inspect");
    expect(fake(line.clear).attributes.get("aria-label")).toBe("reset inspect (hold to remove)");
    expect(fake(line.grip).attributes.get("aria-label")).toBe("move inspect");
  });

  test("the requests' row is that line too: its icon, its name, off or on, its key, and an x that resets it and removes it held", () => {
    const line = rowLine(row("requests"));
    expect(line.box.className).toBe(rowLine(row("device")).box.className);
    expect(line.box.dataset.row).toBe("requests");
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value", "hint-key row-key"]);
    expect(fake(line.main).children[1]?.textContent).toBe("requests");
    expect(fake(line.clear).attributes.get("aria-label")).toBe("reset requests (hold to remove)");
    expect(fake(line.grip).attributes.get("aria-label")).toBe("move requests");
  });

  test("an action no code knows by name gets the whole line from its entry", () => {
    const entry: Action = {
      id: "fake" as Action["id"],
      label: "fake thing",
      long: "does a fake thing",
      aliases: [],
      icon: "eye",
      run: () => {},
    };
    const line = rowLine(actionRow(entry));
    expect(line.box.dataset.row).toBe("fake");
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    // With no binding it has no key to show.
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value"]);
    expect(line.key).toBeNull();
    expect(fake(line.main).children[1]?.textContent).toBe("fake thing");
    expect(rowLine(actionRow({ ...entry, binding: "reset" })).key?.className).toBe(
      "hint-key row-key",
    );
  });
});

describe("an action row's x in the rows", () => {
  const tips: Tips = {
    show: () => {},
    hide: () => false,
    hideAfter: () => {},
    isFor: () => false,
    tooltip: () => {},
    destroy: () => {},
  };
  let rows: Rows;
  let on: boolean;
  /** The knobs, kept here in place of the engine's, which would set them on the page. */
  let state = DEFAULT_STATE;
  let spies: { mockRestore(): void }[] = [];

  /** Grab's switch, on as a test sets it. */
  const grab: GrabControl = {
    isOn: () => on,
    set(next) {
      on = next;
    },
    subscribe: () => () => {},
    destroy: () => {},
  };

  beforeEach(() => {
    jest.useFakeTimers();
    for (const name of ["requestAnimationFrame", "cancelAnimationFrame"]) {
      Object.defineProperty(globalThis, name, { configurable: true, value: () => 0 });
    }
    on = true;
    stage.grab = grab;
    state = merge(DEFAULT_STATE, { panel: { pinned: [...DEFAULT_PINNED, "grab"] } });
    spies = [
      spyOn(engine, "getState").mockImplementation(() => state),
      spyOn(engine, "setState").mockImplementation((patch) => {
        state = merge(state, patch);
        return state;
      }),
    ];
    rows = createRows({
      root: { activeElement: null },
      rows: node("div"),
      said: node("div"),
      tips,
      render: () => {},
      dragging: () => false,
      mac: true,
    });
  });

  afterEach(() => {
    rows.destroy();
    for (const spy of spies) spy.mockRestore();
    stage.grab = null;
    for (const name of ["requestAnimationFrame", "cancelAnimationFrame"]) {
      Reflect.deleteProperty(globalThis, name);
    }
    jest.useRealTimers();
  });

  /** The x of grab's row. */
  function clear(): FakeNode {
    const view = rows.viewOf("grab");
    if (!view) throw new Error("no row grab");
    return fake(view.clear);
  }

  test("a click turns its mode off and keeps the row listed", () => {
    clear().fire("click");
    expect(on).toBe(false);
    expect(isListed(row("grab"), state)).toBe(true);
  });

  test("a hold turns its mode off and takes the row off, open or not", () => {
    rows.openEditor("grab");
    expect(rows.openRow()).toBe("grab");
    clear().fire("pointerdown", { button: 0, pointerId: 1 } as object);
    jest.advanceTimersByTime(HOLD);
    expect(on).toBe(false);
    expect(isListed(row("grab"), state)).toBe(false);
    expect(rows.openRow()).toBeNull();
  });
});

describe("the settings' handle switch", () => {
  /** The switch, as the settings draw it. */
  const switchOf = (made: Settings): FakeNode => {
    const [found] = fake(made.view).find("switch");
    if (!found) throw new Error("no switch");
    return found;
  };

  test("turned on, shows the handle again, in the knobs as in the preferences", () => {
    const set: boolean[] = [];
    let shown = 0;
    const made = buildSettings({
      prefs: quietPrefs((on) => set.push(on)),
      handleShown: () => false,
      showHandle: () => (shown += 1),
    });
    switchOf(made).fire("click");
    expect(set).toEqual([true]);
    expect(shown).toBe(1);
  });

  test("turned off, hides the handle in the preferences alone", () => {
    const set: boolean[] = [];
    let shown = 0;
    const made = buildSettings({
      prefs: quietPrefs((on) => set.push(on)),
      handleShown: () => true,
      showHandle: () => (shown += 1),
    });
    switchOf(made).fire("click");
    expect(set).toEqual([false]);
    expect(shown).toBe(0);
  });
});

describe("the settings' native switch", () => {
  const native = { label: "real browser settings", hint: "uses the debugger" };

  test("is not there where the host gives none", () => {
    const view = settings();
    // The handle's switch and the dev tab icon's.
    expect(view.find("switch")).toHaveLength(2);
    expect(view.find("row-hint")).toHaveLength(0);
  });

  test("shows the host's words under the handle's row, and says what the user picks", () => {
    const picked: boolean[] = [];
    const made = buildSettings({ native, setNative: (on) => picked.push(on) });
    const view = fake(made.view);
    const row = view.children[2];
    expect(parts(row?.children[0]?.children[0])).toEqual(["glyph", "row-label", "switch row-control"]);
    expect(row?.children[0]?.children[0]?.children[1]?.textContent).toBe("real browser settings");
    expect(row?.children[1]?.className).toBe("row-hint");
    expect(row?.children[1]?.textContent).toBe("uses the debugger");
    const [, toggle] = view.find("switch");
    made.drawNative(true, null);
    toggle?.fire("click");
    made.drawNative(false, null);
    toggle?.fire("click");
    expect(picked).toEqual([false, true]);
    expect(toggle?.attributes.get("aria-checked")).toBe("false");
  });

  test("shows a note in place of the hint, and the hint again once it clears", () => {
    const said = node("div");
    const made = buildSettings({ native, said });
    const view = fake(made.view);
    made.drawNative(false, "switched to in-page");
    expect(view.find("row-hint")[0]?.textContent).toBe("switched to in-page");
    expect(fake(said).textContent).toBe("switched to in-page");
    made.drawNative(true, null);
    expect(view.find("row-hint")[0]?.textContent).toBe("uses the debugger");
  });
});

describe("the settings' choice of who runs the panel", () => {
  test("is not there where the host gives none", () => {
    expect(settings().find("seg")).toHaveLength(0);
  });

  test("sits after the host's switch with its hint, shows the choice and says what the user picks", () => {
    let now: "extension" | "page" = "extension";
    const picked: string[] = [];
    const made = buildSettings({
      native: { label: "real browser settings", hint: "" },
      prefer: { value: () => now },
      setPrefer: (value) => picked.push(value),
    });
    const view = fake(made.view);
    const row = view.children[3];
    expect(parts(row?.children[0]?.children[0])).toEqual(["glyph", "row-label", "seg row-control"]);
    expect(row?.children[0]?.children[0]?.children[1]?.textContent).toBe("prefer");
    expect(row?.children[1]?.textContent).toBe(PREFER_HINT);
    const [extension, page] = view.find("seg-item");
    made.drawPrefer();
    expect([extension, page].map((item) => item?.attributes.get("aria-checked"))).toEqual(["true", "false"]);
    page?.fire("click");
    expect(picked).toEqual(["page"]);
    now = "page";
    made.drawPrefer();
    expect([extension, page].map((item) => item?.attributes.get("aria-checked"))).toEqual(["false", "true"]);
  });
});

describe("the settings' dev tab icon switch", () => {
  test("sits after the host's switch, before the shortcuts, and shows what is drawn", () => {
    const made = buildSettings({ native: { label: "real browser settings", hint: "" } });
    const view = fake(made.view);
    const row = view.children[3];
    expect(parts(row?.children[0]?.children[0])).toEqual(["glyph", "row-label", "switch row-control"]);
    expect(row?.children[0]?.children[0]?.children[1]?.textContent).toBe("dev tab icon");
    const toggle = view.find("switch")[2];
    made.drawDevIcon(true);
    expect(toggle?.attributes.get("aria-checked")).toBe("true");
    made.drawDevIcon(false);
    expect(toggle?.attributes.get("aria-checked")).toBe("false");
  });

  test("turns the ribbon the other way from what shows", () => {
    const picked: boolean[] = [];
    let shown = true;
    const made = buildSettings({ devIconShown: () => shown, setDevIcon: (on) => picked.push(on) });
    const toggle = fake(made.view).find("switch")[1];
    toggle?.fire("click");
    shown = false;
    toggle?.fire("click");
    expect(picked).toEqual([false, true]);
  });
});

describe("the settings' real phone mode switch", () => {
  test("is not there without a host that sends requests as another browser", () => {
    expect(fake(buildSettings().view).find("switch").map((node) => node.attributes.get("aria-label"))).not.toContain(
      "real phone mode",
    );
  });

  test("says what it costs, shows its state and says what the user picks", () => {
    const picked: boolean[] = [];
    const made = buildSettings({ realPhone: true, setRealPhone: (on) => picked.push(on) });
    const view = fake(made.view);
    const toggle = view.find("switch").find((node) => node.attributes.get("aria-label") === "real phone mode");
    const row = view.children.find((child) => child.children[0]?.children[0]?.children[1]?.textContent === "real phone mode");
    expect(row?.children[1]?.textContent).toBe(REAL_PHONE_HINT);
    made.drawRealPhone(false);
    toggle?.fire("click");
    made.drawRealPhone(true);
    expect(toggle?.attributes.get("aria-checked")).toBe("true");
    toggle?.fire("click");
    expect(picked).toEqual([true, false]);
  });
});

describe("the settings' head", () => {
  test("is the head every view has: its way back where a row's icon is, then its title, on the knob rows' layout", () => {
    const view = settings();
    const [head, handle] = view.children;
    // The settings name their layout as a view does, on their own root.
    expect(view.attributes.get("data-layout")).toBe("rows");
    expect(head?.className).toBe("row view-head");
    const [line] = head?.children ?? [];
    expect(parts(line)).toEqual(["main", "view-actions"]);
    const [back] = line?.children ?? [];
    expect(back?.tag).toBe("button");
    expect(parts(back)).toEqual(["glyph", "row-label"]);
    expect(back?.children[1]?.textContent).toBe("settings");
    expect(back?.attributes.get("aria-label")).toBe("back from settings");
    // The rows under it have no grip, and start with their icon.
    expect(parts(handle?.children[0]?.children[0])).toEqual([
      "glyph sided",
      "row-label",
      "switch row-control",
    ]);
  });

  test("is built as the head of a view is, node for node", () => {
    /** A node's tag, classes and children, with no text. */
    const shape = (of: FakeNode): unknown => [of.tag, of.className, of.children.map(shape)];
    const [head] = settings().children;
    expect(head ? shape(head) : null).toEqual(shape(fake(viewHead().box)));
  });

  test("the shortcuts' title is the rows' label, over the rows' icons by the one shared rule", () => {
    const view = settings();
    expect(view.children[3]?.className).toBe("rows-label");
    expect(view.children[3]?.textContent).toBe("shortcuts");
    expect(fake(rowsLabel("shortcuts")).className).toBe("rows-label");
    const label = rules(CSS).filter((rule) => /\.rows-label\b/.test(rule.selector));
    expect(label.map((rule) => rule.selector)).toEqual([".rows-label"]);
    // Where the main's padding puts a row's icon: both read the start of the view's lines.
    expect(label[0]?.body).toMatch(/padding:\s*8px var\(--view-end\) 2px var\(--view-start\)/);
  });

  test("a shortcut ends with its x, the button a row's is, then its key", () => {
    const view = settings();
    const shortcut = view.children[4];
    const main = shortcut?.children[0]?.children[0];
    expect(parts(main)).toEqual([
      "glyph sided",
      "row-label",
      "row-button clear",
      "key-set row-control",
    ]);
  });
});
