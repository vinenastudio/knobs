import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pageChoices } from "../src/host";
import { claim, expose, free, hostOf, owned, pin, superseded, withdraw } from "../src/instance";

/**
 * A copy's way out, shaped as `unmount` is: a copy taken over does nothing,
 * else it undoes its own and lets the page go.
 */
function copy(scope: object, name: string, calls: string[]): () => void {
  const release = () => {
    if (superseded(scope, release)) return;
    calls.push(name);
    free(scope, release);
  };
  return release;
}

describe("claim", () => {
  test("a second copy makes the first let go before it takes the page", () => {
    const scope = {};
    const calls: string[] = [];
    const first = copy(scope, "first", calls);
    const second = copy(scope, "second", calls);
    claim(scope, first);
    expect(calls).toEqual([]);
    claim(scope, second);
    expect(calls).toEqual(["first"]);
    expect(superseded(scope, first)).toBe(true);
    expect(superseded(scope, second)).toBe(false);
  });

  test("the copy that holds the page claims it again without letting go", () => {
    const scope = {};
    let released = 0;
    const own = () => {
      released++;
    };
    claim(scope, own);
    claim(scope, own);
    expect(released).toBe(0);
    expect(superseded(scope, own)).toBe(false);
  });

  test("a third copy only makes the one holding the page let go", () => {
    const scope = {};
    const calls: string[] = [];
    const first = copy(scope, "first", calls);
    const second = copy(scope, "second", calls);
    claim(scope, first);
    claim(scope, second);
    claim(scope, copy(scope, "third", calls));
    expect(calls).toEqual(["first", "second"]);
  });
});

/**
 * A copy shaped as `mount` and `unmount` are: where a host holds the page, a
 * mount hands it the options and claims nothing; else it takes the page,
 * as the host with `host`. What it undoes is noted in `calls`.
 */
function mounting(scope: object, name: string, calls: string[], host = false) {
  const adopted: object[] = [];
  const release = copy(scope, name, calls);
  return {
    release,
    adopted,
    mount(options: object = {}) {
      const holder = host ? null : hostOf(scope);
      if (holder) {
        holder.adopt(options);
        return;
      }
      claim(scope, release, host ? (options) => adopted.push(options) : undefined);
    },
  };
}

describe("a host", () => {
  test("takes a page copy's options, and the page copy does not take over", () => {
    const scope = {};
    const calls: string[] = [];
    const extension = mounting(scope, "extension", calls, true);
    const page = mounting(scope, "page", calls);
    extension.mount();
    page.mount({ hotkey: "j" });
    expect(extension.adopted).toEqual([{ hotkey: "j" }]);
    expect(calls).toEqual([]);
    expect(hostOf(scope)?.release).toBe(extension.release);
    expect(superseded(scope, extension.release)).toBe(false);
  });

  test("stays when the page copy unmounts", () => {
    const scope = {};
    const calls: string[] = [];
    const extension = mounting(scope, "extension", calls, true);
    const page = mounting(scope, "page", calls);
    extension.mount();
    page.mount();
    page.release();
    expect(calls).toEqual([]);
    expect(hostOf(scope)?.release).toBe(extension.release);
  });

  test("a copy that knows no hosts takes the page from it, and leaves no host behind", () => {
    const scope = {};
    const calls: string[] = [];
    const extension = mounting(scope, "extension", calls, true);
    extension.mount();
    // As an older copy claims: the way out and nothing more.
    claim(scope, copy(scope, "old", calls));
    expect(calls).toEqual(["extension"]);
    expect(hostOf(scope)).toBeNull();
    expect(owned(scope)).toBe(true);
    // The host takes it back the same way, and the old copy lets go.
    extension.mount();
    expect(calls).toEqual(["extension", "old"]);
    expect(hostOf(scope)?.release).toBe(extension.release);
  });

  test("a second host takes over from the first, as an updated extension does", () => {
    const scope = {};
    const calls: string[] = [];
    const first = mounting(scope, "first", calls, true);
    const second = mounting(scope, "second", calls, true);
    first.mount();
    second.mount();
    expect(calls).toEqual(["first"]);
    expect(hostOf(scope)?.release).toBe(second.release);
  });

  test("goes with its way out", () => {
    const scope = {};
    const calls: string[] = [];
    const extension = mounting(scope, "extension", calls, true);
    extension.mount();
    extension.release();
    expect(hostOf(scope)).toBeNull();
    expect(owned(scope)).toBe(false);
    expect(Object.getOwnPropertySymbols(scope)).toEqual([]);
  });
});

describe("with no host", () => {
  test("a hot update's copy still takes over, and holds the page as no host", () => {
    const scope = {};
    const calls: string[] = [];
    const first = mounting(scope, "first", calls);
    const second = mounting(scope, "second", calls);
    first.mount();
    second.mount();
    expect(calls).toEqual(["first"]);
    expect(hostOf(scope)).toBeNull();
    expect(superseded(scope, second.release)).toBe(false);
  });

  test("a copy that holds the page with no host drops the host it took over from", () => {
    const scope = {};
    const extension = mounting(scope, "extension", [], true);
    extension.mount();
    claim(scope, () => {});
    expect(hostOf(scope)).toBeNull();
  });
});

describe("pageChoices", () => {
  test("keeps the keys, grab, open and grab's color, and nothing else", () => {
    expect(
      pageChoices({
        hotkey: "j",
        grabKey: "alt+shift+g",
        grab: false,
        open: true,
        grabColor: "blue",
        handle: true,
        native: {},
        persist: false,
        state: { scheme: "dark" },
        host: true,
      }),
    ).toEqual({ hotkey: "j", grabKey: "alt+shift+g", grab: false, open: true, grabColor: "blue" });
  });

  test("drops what is not of its kind, a color grab does not draw in too", () => {
    expect(pageChoices({ hotkey: 1, grab: "no", open: null, grabColor: "nope" })).toEqual({});
    expect(pageChoices({})).toEqual({});
  });
});

describe("superseded", () => {
  test("nothing holds a page nobody claimed, so a copy still undoes its own", () => {
    expect(superseded({}, () => {})).toBe(false);
  });

  test("a copy taken over has nothing left to undo", () => {
    const scope = {};
    const first = () => {};
    claim(scope, first);
    claim(scope, () => {});
    expect(superseded(scope, first)).toBe(true);
  });
});

describe("free", () => {
  test("lets the page go for the copy that holds it", () => {
    const scope = {};
    const own = () => {};
    claim(scope, own);
    free(scope, own);
    expect(Object.getOwnPropertySymbols(scope)).toEqual([]);
  });

  test("a copy taken over cannot let the new one's page go", () => {
    const scope = {};
    const first = () => {};
    const second = () => {};
    claim(scope, first);
    claim(scope, second);
    free(scope, first);
    expect(superseded(scope, first)).toBe(true);
    expect(superseded(scope, second)).toBe(false);
  });
});

describe("expose", () => {
  test("puts the api on the page, and the copy that set it takes it away", () => {
    const scope = {};
    const api = {};
    expose(scope, api);
    expect(Reflect.get(scope, "devknobs")).toBe(api);
    withdraw(scope, api);
    expect("devknobs" in scope).toBe(false);
  });

  test("a copy taken over leaves the new one's api in place", () => {
    const scope = {};
    const first = {};
    const second = {};
    expose(scope, first);
    expose(scope, second);
    withdraw(scope, first);
    expect(Reflect.get(scope, "devknobs")).toBe(second);
  });

  test("a pinned api stays after unmount", () => {
    const scope = {};
    const api = {};
    pin(scope);
    expose(scope, api);
    withdraw(scope, api);
    expect(Reflect.get(scope, "devknobs")).toBe(api);
  });
});

describe("window.knobs", () => {
  test("is the same api as devknobs", () => {
    const scope = {};
    const api = {};
    expose(scope, api);
    expect(Reflect.get(scope, "knobs")).toBe(api);
    expect(Reflect.get(scope, "devknobs")).toBe(api);
  });

  test("a page's own knobs, set before, stays, and devknobs still works", () => {
    const own = { synth: true };
    const scope = { knobs: own };
    const api = {};
    expose(scope, api);
    expect(scope.knobs).toBe(own);
    expect(Reflect.get(scope, "devknobs")).toBe(api);
    withdraw(scope, api);
    expect(scope.knobs).toBe(own);
  });

  test("an element with id knobs, which the window inherits, does not keep the api off", () => {
    // Named elements live on the window's prototype chain, not on the window.
    const element = { id: "knobs" };
    const scope: object = Object.create({ knobs: element });
    const api = {};
    expose(scope, api);
    expect(Reflect.get(scope, "knobs")).toBe(api);
    expect(Reflect.get(scope, "devknobs")).toBe(api);
    withdraw(scope, api);
    expect(Reflect.get(scope, "knobs")).toBe(element);
  });

  test("a page's top-level var or function knobs, an own property that cannot be redefined, stays", () => {
    const own = () => "page";
    const scope = {};
    Object.defineProperty(scope, "knobs", { value: own, writable: true, enumerable: true, configurable: false });
    const api = {};
    expose(scope, api);
    expect(Reflect.get(scope, "knobs")).toBe(own);
    expect(Reflect.get(scope, "devknobs")).toBe(api);
  });

  test("the page setting knobs after takes the name over", () => {
    const scope = {};
    const api = {};
    expose(scope, api);
    const own = {};
    Reflect.set(scope, "knobs", own);
    expect(Reflect.get(scope, "knobs")).toBe(own);
    expect(Object.getOwnPropertyDescriptor(scope, "knobs")).toEqual({
      value: own,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    withdraw(scope, api);
    expect(Reflect.get(scope, "knobs")).toBe(own);
    expect("devknobs" in scope).toBe(false);
  });

  test("is enumerable, as a plain assignment would be", () => {
    const scope = {};
    expose(scope, {});
    expect(Object.keys(scope)).toEqual(["devknobs", "knobs"]);
  });

  test("the copy that set it takes it away", () => {
    const scope = {};
    const api = {};
    expose(scope, api);
    withdraw(scope, api);
    expect("knobs" in scope).toBe(false);
  });

  test("a second copy's api takes the place of the first's", () => {
    const scope = {};
    const first = {};
    const second = {};
    expose(scope, first);
    expose(scope, second);
    expect(Reflect.get(scope, "knobs")).toBe(second);
    withdraw(scope, first);
    expect(Reflect.get(scope, "knobs")).toBe(second);
    withdraw(scope, second);
    expect("knobs" in scope).toBe(false);
  });

  test("a pinned api keeps both names after unmount", () => {
    const scope = {};
    const api = {};
    pin(scope);
    expose(scope, api);
    withdraw(scope, api);
    expect(Reflect.get(scope, "knobs")).toBe(api);
    expect(Reflect.get(scope, "devknobs")).toBe(api);
  });
});

/**
 * Run a page's classic script on a real global, in a process of its own: a
 * `vm` context's global is not one, and a function declaration on this
 * process's global could not be taken back. `before` runs before the copy
 * exposes its api, `after` after it; the copy then withdraws it.
 */
function page(before: string, after: string): Record<string, unknown> {
  const instance = join(import.meta.dir, "..", "src", "instance.ts");
  const script = `
    import vm from "node:vm";
    import { expose, withdraw } from ${JSON.stringify(instance)};
    const api = { agent: true };
    const read = (code) => vm.runInThisContext(code);
    vm.runInThisContext(${JSON.stringify(before)});
    expose(globalThis, api);
    const exposed = read("knobs") === api;
    vm.runInThisContext(${JSON.stringify(after)});
    const seen = read("typeof knobs === 'function' ? knobs() : knobs");
    const devknobs = read("devknobs") === api;
    withdraw(globalThis, api);
    const left = read("typeof globalThis.knobs === 'function' ? globalThis.knobs() : globalThis.knobs");
    console.log(JSON.stringify({ exposed, seen, devknobs, left, devknobsLeft: "devknobs" in globalThis }));
  `;
  const child = Bun.spawnSync([process.execPath, "-e", script]);
  expect(child.stderr.toString()).toBe("");
  return JSON.parse(child.stdout.toString()) as Record<string, unknown>;
}

describe("window.knobs and a page's classic script", () => {
  for (const code of ["var knobs = 1;", "knobs = 1;", "globalThis.knobs = 1;", "function knobs() { return 1; }"]) {
    test(`${code} after the copy wins`, () => {
      expect(page("", code)).toEqual({ exposed: true, seen: 1, devknobs: true, left: 1, devknobsLeft: false });
    });
  }

  test("a page's knobs set before the copy stays, and devknobs still works", () => {
    expect(page("var knobs = 1;", "")).toEqual({ exposed: false, seen: 1, devknobs: true, left: 1, devknobsLeft: false });
  });

  test("with no page knobs, the copy takes its knobs away", () => {
    expect(page("", "")).toEqual({ exposed: true, seen: { agent: true }, devknobs: true, devknobsLeft: false });
  });
});
