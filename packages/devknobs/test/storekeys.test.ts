import { afterEach, describe, expect, test } from "bun:test";
import { EDITS_KEY, localEditsStore } from "../src/edit/keep";
import { wiped } from "../src/engine/fresh";
import { load, merge, save, STORAGE_KEY } from "../src/engine/store";
import {
  isOwnKey,
  itemKeys,
  oldKey,
  ownName,
  readItem,
  removeItem,
  sameItem,
  writeItem,
} from "../src/engine/storekeys";
import { isOwn } from "../src/storage/site";

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

function keys(store: Storage): string[] {
  return Array.from({ length: store.length }, (_, index) => store.key(index) ?? "").sort();
}

describe("the names of the items knobs keeps", () => {
  test("a new key's old name is the devknobs one", () => {
    expect(oldKey("knobs")).toBe("devknobs");
    expect(oldKey("knobs:prefs")).toBe("devknobs:prefs");
    expect(oldKey("knobs:edits:/a")).toBe("devknobs:edits:/a");
    expect(oldKey("knobsy")).toBe("knobsy");
    expect(oldKey("token")).toBe("token");
  });

  test("either name reads as the new one, and the page's keys as none", () => {
    expect(ownName("knobs")).toBe("knobs");
    expect(ownName("knobs:prefs")).toBe("knobs:prefs");
    expect(ownName("devknobs")).toBe("knobs");
    expect(ownName("devknobs:edits:/a")).toBe("knobs:edits:/a");
    for (const key of ["knobsy", "knobs-foo", "devknobsy", "devknobs-extension.yielded", "my:knobs", ""]) {
      expect(ownName(key)).toBeNull();
    }
  });

  test("a storage event under either name is the item's", () => {
    expect(sameItem("knobs:prefs", "knobs:prefs")).toBe(true);
    expect(sameItem("devknobs:prefs", "knobs:prefs")).toBe(true);
    expect(sameItem("knobs:keys", "knobs:prefs")).toBe(false);
    expect(sameItem(null, "knobs:prefs")).toBe(false);
  });
});

describe("reading, writing and removing", () => {
  test("a read takes the new item first, then the old one", () => {
    const store = storage();
    expect(readItem(store, "knobs:prefs")).toBeNull();
    store.setItem("devknobs:prefs", "old");
    expect(readItem(store, "knobs:prefs")).toBe("old");
    store.setItem("knobs:prefs", "new");
    expect(readItem(store, "knobs:prefs")).toBe("new");
  });

  test("a write puts both names, a remove drops both", () => {
    const store = storage();
    writeItem(store, "knobs", "state");
    expect(keys(store)).toEqual(["devknobs", "knobs"]);
    expect(store.getItem("devknobs")).toBe("state");
    removeItem(store, "knobs");
    expect(keys(store)).toEqual([]);
  });

  test("no storage reads as nothing, and writes nothing", () => {
    expect(readItem(null, "knobs")).toBeNull();
    expect(() => writeItem(null, "knobs", "x")).not.toThrow();
    expect(() => removeItem(undefined, "knobs")).not.toThrow();
  });

  test("the items under a prefix list once each, under the new name", () => {
    const store = storage();
    store.setItem("knobs:edits:/a", "1");
    store.setItem("devknobs:edits:/a", "1");
    store.setItem("devknobs:edits:/b", "2");
    store.setItem("knobs:edits:/c", "3");
    store.setItem("knobs:prefs", "{}");
    store.setItem("knobs:edits-mine", "page");
    expect(itemKeys(store, "knobs:edits:").sort()).toEqual(["knobs:edits:/a", "knobs:edits:/b", "knobs:edits:/c"]);
  });
});

describe("an old copy and a new copy on one origin", () => {
  let before: PropertyDescriptor | undefined;

  function open(local: Storage, session: Storage, path = "/"): void {
    before ??= Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        localStorage: local,
        sessionStorage: session,
        location: { pathname: path, search: "" },
        name: "",
      }),
    });
  }

  afterEach(() => {
    if (before) Object.defineProperty(globalThis, "window", before);
    else Reflect.deleteProperty(globalThis, "window");
    before = undefined;
  });

  test("the new copy reads what the old one kept", () => {
    const local = storage();
    const session = storage();
    session.setItem("devknobs", JSON.stringify({ v: 1, scheme: "dark" }));
    local.setItem("devknobs:edits:/", JSON.stringify({ v: 1, edits: [], at: 1 }));
    open(local, session);
    expect(load().scheme).toBe("dark");
    expect(localEditsStore().load()).toMatchObject({ v: 1, edits: [] });
  });

  test("the old copy reads what the new one writes", () => {
    const local = storage();
    const session = storage();
    open(local, session);
    save(merge(load(), { scheme: "light" }));
    localEditsStore().save({ v: 1, edits: [] });
    expect(JSON.parse(session.getItem("devknobs") ?? "null")).toMatchObject({ scheme: "light" });
    expect(session.getItem("devknobs")).toBe(session.getItem(STORAGE_KEY));
    expect(JSON.parse(local.getItem("devknobs:edits:/") ?? "null")).toMatchObject({ v: 1, edits: [] });
  });

  test("a remove by the new copy leaves the old copy nothing to read", () => {
    const local = storage();
    local.setItem("devknobs:edits:/", JSON.stringify({ v: 1, edits: [], at: 1 }));
    open(local, storage());
    const store = localEditsStore();
    store.save({ v: 1, edits: [] });
    store.save(null);
    expect(local.getItem("devknobs:edits:/")).toBeNull();
    expect(local.getItem(`${EDITS_KEY}/`)).toBeNull();
    expect(store.load()).toBeNull();
  });

  test("the new copy hears the old copy's writes", () => {
    const local = storage();
    open(local, storage());
    let heard = 0;
    const stop = localEditsStore().subscribe(() => heard++);
    const event = (key: string) => Object.assign(new Event("storage"), { key });
    window.dispatchEvent(event("devknobs:edits:/"));
    window.dispatchEvent(event("knobs:edits:/"));
    window.dispatchEvent(event("devknobs:edits:/other"));
    stop();
    expect(heard).toBe(2);
  });
});

describe("the page's own items", () => {
  test("the storage view hides knobs' items under both names, and nothing of the page's", () => {
    for (const key of ["knobs", "knobs:prefs", "devknobs", "devknobs:storage-presets"]) {
      expect(isOwn(key)).toBe(true);
      expect(isOwnKey(key)).toBe(true);
    }
    for (const key of ["knobsy", "knobs-foo", "devknobsy", "devknobs-foo", "token"]) {
      expect(isOwn(key)).toBe(false);
    }
  });

  test("fresh mode drops knobs' session items under both names, and keeps the locale record", () => {
    for (const key of ["knobs", "knobs:snapshot", "devknobs", "devknobs:scroll"]) expect(wiped(key)).toBe(true);
    for (const key of ["knobs:locale-stores", "devknobs:locale-reload", "knobsy", "devknobs-foo", "token"]) {
      expect(wiped(key)).toBe(false);
    }
  });
});
