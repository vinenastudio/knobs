import { afterEach, describe, expect, test } from "bun:test";
import {
  createPrefs,
  type Prefs,
  PREFS_KEY,
  PREFS_VERSION,
  readPrefs,
  resolvePrefs,
} from "../src/ui/prefs";

/** A mount's preferences, with the width a panel starts with. */
const BASE: Prefs = {
  handle: true,
  width: 320,
  stylesMode: "simple",
  stylesBox: true,
  changesDiff: false,
  htmlHeight: 200,
  htmlFull: false,
};

describe("readPrefs", () => {
  test("keeps a handle that is a boolean", () => {
    expect(readPrefs(JSON.stringify({ handle: false }))).toEqual({ handle: false });
    expect(readPrefs(JSON.stringify({ handle: true }))).toEqual({ handle: true });
  });

  test("drops what does not read", () => {
    expect(readPrefs(null)).toEqual({});
    expect(readPrefs("")).toEqual({});
    expect(readPrefs("{")).toEqual({});
    expect(readPrefs("[false]")).toEqual({});
    expect(readPrefs("false")).toEqual({});
    expect(readPrefs(JSON.stringify({ handle: "no", other: 1 }))).toEqual({});
  });

  test("keeps a width that is a number of px", () => {
    const at = (kept: object) => JSON.stringify({ v: PREFS_VERSION, ...kept });
    expect(readPrefs(at({ width: 300 }))).toEqual({ width: 300 });
    expect(readPrefs(at({ handle: false, width: 400 }))).toEqual({ handle: false, width: 400 });
    expect(readPrefs(at({ width: "300" }))).toEqual({});
    expect(readPrefs(at({ width: 0 }))).toEqual({});
    expect(readPrefs(at({ width: -4 }))).toEqual({});
    expect(readPrefs(at({ width: null }))).toEqual({});
    expect(readPrefs(`{"v":${PREFS_VERSION},"width":1e999}`)).toEqual({});
  });

  test("takes up one kept at version 5 or before, with a width for the rows and one for a view: the rows' is the width, and the view's is dropped", () => {
    expect(readPrefs(JSON.stringify({ v: 5, listWidth: 300, viewWidth: 520 }))).toEqual({ width: 300 });
    expect(readPrefs(JSON.stringify({ v: 5, handle: false, viewWidth: 400 }))).toEqual({ handle: false });
    expect(readPrefs(JSON.stringify({ listWidth: 280, viewWidth: 600 }))).toEqual({ width: 280 });
    expect(readPrefs(JSON.stringify({ v: 5, width: 500 }))).toEqual({});
    expect(readPrefs(JSON.stringify({ v: 6, listWidth: 300, viewWidth: 520 }))).toEqual({});
    expect(readPrefs(JSON.stringify({ v: 5, listWidth: "300", viewWidth: 0 }))).toEqual({});
  });

  test("keeps a mode of the styles view that is one of the two", () => {
    expect(readPrefs(JSON.stringify({ stylesMode: "advanced" }))).toEqual({
      stylesMode: "advanced",
    });
    expect(readPrefs(JSON.stringify({ stylesMode: "simple" }))).toEqual({ stylesMode: "simple" });
    expect(readPrefs(JSON.stringify({ stylesMode: "expert" }))).toEqual({});
    expect(readPrefs(JSON.stringify({ stylesMode: true, handle: false }))).toEqual({
      handle: false,
    });
  });

  test("is at version 6, and takes up one kept at version 1, which had no widths", () => {
    expect(PREFS_VERSION).toBe(6);
    expect(readPrefs(JSON.stringify({ v: 1, handle: false }))).toEqual({ handle: false });
    expect(resolvePrefs(BASE, readPrefs(JSON.stringify({ v: 1, handle: false })))).toEqual({
      handle: false,
      width: 320,
      stylesMode: "simple",
      stylesBox: true,
      changesDiff: false,
      htmlHeight: 200,
      htmlFull: false,
    });
    expect(readPrefs(JSON.stringify({ v: 7, handle: false, width: 300 }))).toEqual({});
  });

  test("takes up one kept at version 2, which had no mode: the styles view is simple", () => {
    const kept = JSON.stringify({ v: 2, handle: false, listWidth: 500 });
    expect(readPrefs(kept)).toEqual({ handle: false, width: 500 });
    expect(resolvePrefs(BASE, readPrefs(kept))).toEqual({
      handle: false,
      width: 500,
      stylesMode: "simple",
      stylesBox: true,
      changesDiff: false,
      htmlHeight: 200,
      htmlFull: false,
    });
  });

  test("takes up one kept at version 4, which had no diff and no html editor: the diff is folded, the editor 200 tall", () => {
    const kept = JSON.stringify({ v: 4, stylesBox: false });
    expect(resolvePrefs(BASE, readPrefs(kept))).toEqual({ ...BASE, stylesBox: false });
    expect(readPrefs(JSON.stringify({ changesDiff: true, htmlHeight: 320, htmlFull: true }))).toEqual({ changesDiff: true, htmlHeight: 320, htmlFull: true });
    expect(readPrefs(JSON.stringify({ changesDiff: "yes", htmlHeight: -1, htmlFull: 1 }))).toEqual({});
    // A height under the least the editor is dragged to comes back as that least.
    expect(readPrefs(JSON.stringify({ htmlHeight: 1 }))).toEqual({ htmlHeight: 64 });
  });

  test("reads its own version and one kept before versions, and leaves a newer one alone", () => {
    const prefs = { handle: false };
    expect(readPrefs(JSON.stringify({ v: PREFS_VERSION, ...prefs }))).toEqual(prefs);
    expect(readPrefs(JSON.stringify(prefs))).toEqual(prefs);
    expect(readPrefs(JSON.stringify({ v: PREFS_VERSION + 1, ...prefs }))).toEqual({});
  });
});

describe("resolvePrefs", () => {
  test("what the user set wins over the mount option", () => {
    expect(resolvePrefs(BASE, { handle: false })).toEqual({ ...BASE, handle: false });
    expect(resolvePrefs({ ...BASE, handle: false }, { handle: true })).toEqual(BASE);
    expect(resolvePrefs({ ...BASE, handle: false }, {})).toEqual({ ...BASE, handle: false });
  });

  test("a width the user set wins over the one a panel starts with", () => {
    expect(resolvePrefs(BASE, { width: 500 })).toEqual({ ...BASE, width: 500 });
  });
});

function stubWindow(search = ""): {
  local: Map<string, string>;
  fire: (key: string | null) => void;
  listening: () => number;
} {
  const local = new Map<string, string>();
  const listeners = new Set<(event: { key: string | null }) => void>();
  const localStorage = {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => {
      local.set(key, value);
    },
    removeItem: (key: string) => {
      local.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      location: { search },
      addEventListener: (type: string, listener: (event: { key: string | null }) => void) => {
        if (type === "storage") listeners.add(listener);
      },
      removeEventListener: (type: string, listener: (event: { key: string | null }) => void) => {
        if (type === "storage") listeners.delete(listener);
      },
    },
  });
  return {
    local,
    fire: (key) => {
      for (const listener of listeners) listener({ key });
    },
    listening: () => listeners.size,
  };
}

describe("createPrefs", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("shows the handle by default, and hides it for handle: false", () => {
    stubWindow();
    const shown = createPrefs();
    expect(shown.get().handle).toBe(true);
    const hidden = createPrefs({ handle: false });
    expect(hidden.get().handle).toBe(false);
    shown.destroy();
    hidden.destroy();
  });

  test("the stored choice wins over the mount option", () => {
    const { local } = stubWindow();
    local.set(PREFS_KEY, JSON.stringify({ handle: true }));
    const prefs = createPrefs({ handle: false });
    expect(prefs.get().handle).toBe(true);
    prefs.destroy();
  });

  test("keeps a choice, and drops it when set back to the mount's", () => {
    const { local } = stubWindow();
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    prefs.setHandle(false);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, handle: false });
    expect(prefs.get().handle).toBe(false);
    prefs.setHandle(true);
    expect(local.has(PREFS_KEY)).toBe(false);
    expect(prefs.get().handle).toBe(true);
    expect(heard).toBe(2);
    prefs.destroy();
  });

  test("starts 320 wide", () => {
    stubWindow();
    const prefs = createPrefs();
    expect(prefs.get()).toMatchObject({ width: 320 });
    prefs.destroy();
  });

  test("keeps a width saved narrower than the new default as it is", () => {
    const { local } = stubWindow();
    local.set(PREFS_KEY, JSON.stringify({ v: PREFS_VERSION, width: 260 }));
    const prefs = createPrefs();
    expect(prefs.get()).toMatchObject({ width: 260 });
    prefs.destroy();
  });

  test("keeps the width, beside the handle, and drops one set back", () => {
    const { local } = stubWindow();
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    prefs.setWidth(500);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, width: 500 });
    prefs.setWidth(280);
    prefs.setHandle(false);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({
      v: PREFS_VERSION,
      handle: false,
      width: 280,
    });
    expect(prefs.get()).toEqual({
      handle: false,
      width: 280,
      stylesMode: "simple",
      stylesBox: true,
      changesDiff: false,
      htmlHeight: 200,
      htmlFull: false,
    });
    prefs.setWidth(320);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, handle: false });
    prefs.setHandle(true);
    expect(local.has(PREFS_KEY)).toBe(false);
    expect(heard).toBe(5);
    prefs.destroy();
  });

  test("reads the width that was kept", () => {
    const { local } = stubWindow();
    local.set(PREFS_KEY, JSON.stringify({ v: PREFS_VERSION, width: 300 }));
    const prefs = createPrefs();
    expect(prefs.get()).toEqual({
      handle: true,
      width: 300,
      stylesMode: "simple",
      stylesBox: true,
      changesDiff: false,
      htmlHeight: 200,
      htmlFull: false,
    });
    prefs.destroy();
  });

  test("of the two widths kept at version 5, takes the rows' and writes the view's away", () => {
    const { local } = stubWindow();
    local.set(PREFS_KEY, JSON.stringify({ v: 5, handle: false, listWidth: 300, viewWidth: 600 }));
    const prefs = createPrefs();
    expect(prefs.get()).toMatchObject({ handle: false, width: 300 });
    expect(prefs.get()).not.toHaveProperty("listWidth");
    expect(prefs.get()).not.toHaveProperty("viewWidth");
    prefs.setStylesBox(false);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({
      v: PREFS_VERSION,
      handle: false,
      width: 300,
      stylesBox: false,
    });
    prefs.destroy();
  });

  test("in fresh mode the width is a first visit's, and one set here is not written", () => {
    const { local } = stubWindow("?devknobs=fresh");
    const kept = JSON.stringify({ v: PREFS_VERSION, width: 300 });
    local.set(PREFS_KEY, kept);
    const prefs = createPrefs();
    expect(prefs.get()).toMatchObject({ width: 320 });
    prefs.setWidth(480);
    expect(prefs.get()).toMatchObject({ width: 480 });
    expect(local.get(PREFS_KEY)).toBe(kept);
    prefs.destroy();
  });

  test("the styles view is simple by default, and its mode is kept and dropped when set back", () => {
    const { local } = stubWindow();
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    expect(prefs.get().stylesMode).toBe("simple");
    prefs.setStylesMode("advanced");
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, stylesMode: "advanced" });
    expect(prefs.get().stylesMode).toBe("advanced");
    prefs.destroy();
    const next = createPrefs();
    expect(next.get().stylesMode).toBe("advanced");
    next.setStylesMode("simple");
    expect(local.has(PREFS_KEY)).toBe(false);
    expect(next.get().stylesMode).toBe("simple");
    expect(heard).toBe(1);
    next.destroy();
  });

  test("the diff is folded by default, and the way it is left is kept, as is the html editor's size", () => {
    const { local } = stubWindow();
    const prefs = createPrefs();
    expect(prefs.get().changesDiff).toBe(false);
    expect([prefs.get().htmlHeight, prefs.get().htmlFull]).toEqual([200, false]);
    prefs.setChangesDiff(true);
    prefs.setHtmlSize({ height: 320, full: true });
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, changesDiff: true, htmlHeight: 320, htmlFull: true });
    prefs.destroy();
    const next = createPrefs();
    expect([next.get().changesDiff, next.get().htmlHeight, next.get().htmlFull]).toEqual([true, 320, true]);
    next.setChangesDiff(false);
    next.setHtmlSize({ height: 200, full: false });
    expect(local.has(PREFS_KEY)).toBe(false);
    next.destroy();
  });

  test("in fresh mode the styles view is simple, and a mode set here is not written", () => {
    const { local } = stubWindow("?devknobs=fresh");
    const kept = JSON.stringify({ v: 3, stylesMode: "advanced" });
    local.set(PREFS_KEY, kept);
    const prefs = createPrefs();
    expect(prefs.get().stylesMode).toBe("simple");
    prefs.setStylesMode("advanced");
    expect(prefs.get().stylesMode).toBe("advanced");
    prefs.setStylesMode("simple");
    expect(local.get(PREFS_KEY)).toBe(kept);
    prefs.destroy();
    const { local: empty } = stubWindow("?devknobs=fresh");
    const first = createPrefs();
    first.setStylesMode("advanced");
    expect(empty.size).toBe(0);
    first.destroy();
  });

  test("hears a choice another document of the origin made", () => {
    const { local, fire, listening } = stubWindow();
    const prefs = createPrefs();
    local.set(PREFS_KEY, JSON.stringify({ handle: false }));
    fire("devknobs:keys");
    expect(prefs.get().handle).toBe(true);
    fire(PREFS_KEY);
    expect(prefs.get().handle).toBe(false);
    prefs.destroy();
    expect(listening()).toBe(0);
  });

  test("in fresh mode, a choice made here holds through what another tab keeps", () => {
    const { local, fire } = stubWindow("?devknobs=fresh");
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    prefs.setHandle(false);
    local.set(PREFS_KEY, JSON.stringify({ handle: true }));
    fire(PREFS_KEY);
    fire(null);
    expect(prefs.get().handle).toBe(false);
    expect(heard).toBe(1);
    prefs.destroy();
  });

  test("works without storage, the choice just does not stick", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get localStorage(): Storage {
          throw new Error("denied");
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    const prefs = createPrefs();
    prefs.setHandle(false);
    expect(prefs.get().handle).toBe(false);
    prefs.destroy();
  });
});
