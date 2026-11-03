import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import * as engine from "../src/engine";
import * as geo from "../src/engine/geo";
import * as header from "../src/engine/header";
import * as locale from "../src/engine/locale";
import * as media from "../src/engine/media";
import * as network from "../src/engine/network";
import * as outlines from "../src/engine/outlines";
import * as overflow from "../src/engine/overflow";
import * as pseudo from "../src/engine/pseudo";
import * as scrollbars from "../src/engine/scrollbars";
import * as scrollkeep from "../src/engine/scrollkeep";
import * as spacing from "../src/engine/spacing";
import * as speed from "../src/engine/speed";
import * as text from "../src/engine/text";
import * as time from "../src/engine/time";
import * as touch from "../src/engine/touch";
import * as touchPointer from "../src/engine/touchpointer";
import * as ua from "../src/engine/ua";
import * as width from "../src/engine/frames";
import * as control from "../src/grab/control";
import * as inspect from "../src/grab/inspect";
import { type HostRank, outranks, preferOf, type PreferSetting, rankOf, stepsAside, stoodDownNote, takesBack } from "../src/host";
import { edits } from "../src/edit/log";
import * as devknobs from "../src/index";
import { claim, free, hostOf, owned, type Take } from "../src/instance";
import * as requests from "../src/requests";
import * as onload from "../src/storage/onload";
import { DEFAULT_STATE } from "../src/engine/store";
import * as bindings from "../src/ui/bindings";
import * as panel from "../src/ui/panel";

/**
 * The real `mount`, `unmount` and the host's `adopt` and take-back, on a window
 * with just what they read, the engine's patches and the panel's parts quiet.
 */
let spies: Mock<(...args: never[]) => unknown>[] = [];
let createPanel: Mock<typeof panel.createPanel>;
let createKeys: Mock<typeof bindings.createKeys>;

const quiet = <T extends object>(target: T, ...names: (keyof T & string)[]) => {
  for (const name of names) {
    spies.push(spyOn(target, name as never).mockImplementation((() => {}) as never));
  }
};
const destroyable = () => ({ destroy() {} });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      name: "",
      frameElement: null,
      addEventListener() {},
      removeEventListener() {},
      parent: { postMessage() {} },
    },
  });
  spies = [];
  quiet(media, "apply", "destroy");
  quiet(network, "apply", "reset");
  quiet(text, "apply", "reset");
  quiet(touch, "apply", "reset");
  quiet(touchPointer, "apply", "reset");
  quiet(scrollbars, "apply", "reset");
  quiet(speed, "apply", "reset");
  quiet(locale, "apply", "reset");
  quiet(pseudo, "apply", "reset");
  quiet(geo, "apply", "reset");
  quiet(time, "apply", "reset");
  quiet(header, "apply", "reset");
  quiet(spacing, "apply", "reset");
  quiet(ua, "apply", "reset");
  quiet(width, "apply", "sync", "reset", "onExit", "onZoom", "onRefused", "onFramed");
  quiet(overflow, "apply", "reset");
  quiet(outlines, "apply", "reset");
  quiet(requests, "start", "stop");
  quiet(scrollkeep, "resume");
  quiet(onload, "applyOnLoad");
  quiet(inspect, "oneAtATime");
  spies.push(spyOn(control, "createGrab").mockImplementation((() => destroyable()) as never) as never);
  spies.push(spyOn(inspect, "createInspect").mockImplementation((() => destroyable()) as never) as never);
  createKeys = spyOn(bindings, "createKeys").mockImplementation(
    (() => ({ ...destroyable(), recording: false, get: () => ({}) })) as never,
  );
  createPanel = spyOn(panel, "createPanel").mockImplementation(
    (() => ({ ...destroyable(), drawPrefer() {} })) as never,
  );
});

afterEach(async () => {
  devknobs.unmount();
  // A host's take-back looks in, a microtask on.
  await settle();
  for (const spy of [createKeys, createPanel, ...spies]) spy.mockRestore();
  Reflect.deleteProperty(globalThis, "window");
});

describe("a page copy under a host", () => {
  /** A host as the extension leaves one, its api noting the calls. */
  function host(api?: object) {
    const release = () => {};
    const adopted: object[] = [];
    claim(window, release, (options) => adopted.push(options), api);
    return { adopted, release };
  }

  test("hands the host its options and starts nothing of its own", () => {
    const { adopted } = host({});
    devknobs.mount({ hotkey: "j" });
    expect(adopted).toEqual([{ hotkey: "j" }]);
    expect(createPanel).not.toHaveBeenCalled();
    expect(createKeys).not.toHaveBeenCalled();
  });

  test("sends its module api's calls to the host's", async () => {
    const state = { ...DEFAULT_STATE, scheme: "dark" as const };
    const patches: object[] = [];
    const calls: string[] = [];
    host({
      getState: () => state,
      setState: (patch: object) => {
        patches.push(patch);
        return state;
      },
      ready: () => Promise.resolve(state),
      reset: () => calls.push("reset"),
      replay: () => calls.push("replay"),
      describe: () => [],
      grab: () => Promise.resolve(null),
    });
    devknobs.mount();
    expect(devknobs.setState({ scheme: "dark" })).toBe(state);
    expect(patches).toEqual([{ scheme: "dark" }]);
    expect(devknobs.getState()).toBe(state);
    expect(await devknobs.ready()).toBe(state);
    devknobs.reset();
    devknobs.replay();
    expect(calls).toEqual(["reset", "replay"]);
    expect(devknobs.describe()).toEqual([]);
    expect(await devknobs.grab()).toBeNull();
  });

  test("keeps its own api once the host lets go, or once it unmounts", async () => {
    const getState = () => ({ ...DEFAULT_STATE, scheme: "dark" as const });
    const first = host({ getState });
    devknobs.mount();
    expect(devknobs.getState().scheme).toBe("dark");
    free(window, first.release);
    expect(devknobs.getState().scheme).toBe("system");
    await expect(devknobs.ready()).rejects.toThrow();
    host({ getState });
    devknobs.unmount();
    expect(devknobs.getState().scheme).toBe("system");
  });

  test("reads the host's edits", () => {
    const list: devknobs.Edit[] = [{ id: 1, kind: "css-value", target: { selector: "a" }, property: "color", before: "red", after: "blue" }];
    host({ edits: () => list });
    devknobs.mount();
    expect(devknobs.edits()).toBe(list);
  });

  test("with an older host that leaves no api, keeps its own", () => {
    host();
    devknobs.mount();
    expect(devknobs.getState().scheme).toBe("system");
  });
});

describe("the edits", () => {
  /** An edit that notes whether it is on the page. */
  function onPage(): { on: boolean } {
    const state = { on: false };
    edits.record({
      edit: { kind: "css-value", target: { selector: "a" }, property: "color", before: "red", after: "blue" },
      apply: () => (state.on = true),
      revert: () => {
        state.on = false;
      },
    });
    return state;
  }

  test("are listed by edits(), stay through reset(), and go back on unmount", () => {
    devknobs.mount();
    const state = onPage();
    expect(devknobs.edits()).toMatchObject([{ property: "color", after: "blue" }]);
    devknobs.reset();
    expect(state.on).toBe(true);
    devknobs.unmount();
    expect(state.on).toBe(false);
    expect(devknobs.edits()).toEqual([]);
  });

  test("go back with the knobs on the panel's reset", () => {
    const state = onPage();
    let knobs = 0;
    panel.resetPage(edits, () => knobs++);
    expect(state.on).toBe(false);
    expect(knobs).toBe(1);
    expect(edits.list()).toEqual([]);
  });
});

describe("a host", () => {
  test("takes a page copy's keys with a new panel, and stays when that copy goes", () => {
    devknobs.mount({ host: true });
    expect(createPanel).toHaveBeenCalledTimes(1);
    hostOf(window)?.adopt({ hotkey: "j", grabColor: "green" });
    expect(createKeys).toHaveBeenLastCalledWith({ hotkey: "j", grabKey: undefined, grab: true });
    expect(createPanel).toHaveBeenCalledTimes(2);
    expect(devknobs.getState().grabColor).toBe("green");
    expect(hostOf(window)?.api).toBe(window.devknobs);
  });

  test("takes the page back from a copy that knows no hosts three times, its switch kept, then warns once", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const setting = { label: "real", hint: "a bar", change: () => {} };
    const driven: unknown[] = [];
    devknobs.mount({ host: true, native: { setting, text: (value) => driven.push(value) } });
    devknobs.setNative(false, "closed");
    devknobs.setState({ text: 48 });
    driven.length = 0;
    let released = 0;
    // As 0.3.0 claims: the way out and nothing more, once each load of the page's own copy.
    const old = () => {
      const release = () => {
        released++;
        free(window, release);
      };
      claim(window, release);
      return release;
    };
    for (let i = 0; i < 3; i++) {
      old();
      await settle();
      expect(hostOf(window)?.release).toBe(devknobs.unmount);
    }
    expect(released).toBe(3);
    expect(engine.nativeSwitch()).toEqual({ setting, on: false, note: "closed" });
    // Off, the driver is never handed a knob, the size either: the page emulates them.
    expect(driven).toEqual([]);
    const last = old();
    await settle();
    expect(hostOf(window)).toBeNull();
    expect(owned(window)).toBe(true);
    expect(released).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toStartWith("devknobs:");
    last();
    warn.mockRestore();
  });
});

describe("who runs the panel", () => {
  test("a host steps aside only where the page's copy is preferred and that copy can take the page", () => {
    const take = () => true;
    expect(stepsAside("page", take)).toBe(true);
    expect(stepsAside("extension", take)).toBe(false);
    expect(stepsAside(null, take)).toBe(false);
    expect(stepsAside("page", undefined)).toBe(false);
    expect(takesBack("page")).toBe(false);
    expect(takesBack("extension")).toBe(true);
    expect(takesBack(null)).toBe(true);
  });

  test("a page copy reads the preference a host hands it field by field", () => {
    const heard: unknown[] = [];
    const prefer = preferOf({ prefer: { value: "page", change: (value: unknown) => heard.push(value) } });
    expect(prefer?.value).toBe("page");
    prefer?.change("extension");
    expect(heard).toEqual(["extension"]);
    expect(preferOf({})).toBeNull();
    expect(preferOf({ prefer: { value: "both", change() {} } })).toBeNull();
    expect(preferOf({ prefer: { value: "page" } })).toBeNull();
  });
});

describe("a host that prefers the page's copy", () => {
  /** A host's preference, noting what it hears. */
  function preferring(value: "extension" | "page") {
    const changed: string[] = [];
    let yielded = 0;
    const setting: PreferSetting = {
      value,
      change: (next) => changed.push(next),
      yielded: () => yielded++,
    };
    return { setting, changed, yielded: () => yielded };
  }

  /** A page copy that knows hosts: its way to take the page claims it, as its mount would. */
  function pageCopy(takes = true) {
    const handed: object[] = [];
    const release = () => free(window, release);
    const take: Take = (given) => {
      handed.push(given);
      if (takes) claim(window, release);
      return takes;
    };
    return { handed, release, take };
  }

  test("lets a page copy have the page at once, hands it the choice and does not take it back", async () => {
    const prefer = preferring("page");
    devknobs.mount({ host: true, prefer: prefer.setting });
    const hostPanel = createPanel.mock.results[0]?.value as { destroy(): void };
    const destroy = spyOn(hostPanel, "destroy");
    const page = pageCopy();
    hostOf(window)?.adopt({ hotkey: "j" }, page.take);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(hostOf(window)).toBeNull();
    expect(page.handed).toHaveLength(1);
    expect(preferOf(page.handed[0]!)?.value).toBe("page");
    preferOf(page.handed[0]!)?.change("extension");
    expect(prefer.changed).toEqual(["extension"]);
    await settle();
    expect(Reflect.get(window, Symbol.for("devknobs.owner"))).toBe(page.release);
    expect(createPanel).toHaveBeenCalledTimes(1);
    expect(prefer.yielded()).toBe(1);
    page.release();
  });

  test("steps aside once the preference comes in, for a page copy that deferred before it", () => {
    const prefer = preferring("extension");
    devknobs.mount({ host: true, prefer: prefer.setting });
    const page = pageCopy();
    hostOf(window)?.adopt({}, page.take);
    expect(page.handed).toEqual([]);
    expect(hostOf(window)?.release).toBe(devknobs.unmount);
    devknobs.setPrefer("page");
    expect(page.handed).toHaveLength(1);
    expect(hostOf(window)).toBeNull();
    page.release();
  });

  test("stays for a page copy that unmounted since it deferred", () => {
    devknobs.mount({ host: true, prefer: preferring("extension").setting });
    const page = pageCopy();
    hostOf(window)?.adopt({}, Object.assign(page.take, { pending: () => false }));
    devknobs.setPrefer("page");
    expect(page.handed).toEqual([]);
    expect(hostOf(window)?.release).toBe(devknobs.unmount);
    expect(createPanel).toHaveBeenCalledTimes(1);
  });

  test("with the extension preferred, keeps the page and takes the page copy's choices", () => {
    devknobs.mount({ host: true, prefer: preferring("extension").setting });
    const page = pageCopy();
    hostOf(window)?.adopt({ grabColor: "green" }, page.take);
    expect(page.handed).toEqual([]);
    expect(devknobs.getState().grabColor).toBe("green");
    expect(hostOf(window)?.release).toBe(devknobs.unmount);
  });

  test("mounts again where the page copy does not take the page, its switch as it was", async () => {
    const setting = { label: "real", hint: "a bar", change: () => {} };
    devknobs.mount({ host: true, prefer: preferring("page").setting, native: { setting } });
    devknobs.setNative(false, "closed");
    hostOf(window)?.adopt({}, pageCopy(false).take);
    await settle();
    expect(hostOf(window)?.release).toBe(devknobs.unmount);
    expect(createPanel).toHaveBeenCalledTimes(2);
    expect(engine.nativeSwitch()).toEqual({ setting, on: false, note: "closed" });
  });

  test("leaves the page to a copy that knows no hosts, with no take-back and no warning", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const prefer = preferring("page");
    devknobs.mount({ host: true, prefer: prefer.setting });
    const release = () => free(window, release);
    claim(window, release);
    await settle();
    expect(hostOf(window)).toBeNull();
    expect(Reflect.get(window, Symbol.for("devknobs.owner"))).toBe(release);
    expect(prefer.yielded()).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    release();
    warn.mockRestore();
  });
});

describe("a page copy a host steps aside for", () => {
  /** A host as a newer extension leaves one: it keeps the page copy's way to take the page. */
  function host() {
    const release = () => {};
    const takes: Take[] = [];
    claim(window, release, (_options, take) => {
      if (take) takes.push(take);
    });
    return { release, takes };
  }

  test("mounts with its own panel, which shows the choice and names the page's copy", () => {
    const { release, takes } = host();
    devknobs.mount({ hotkey: "j" });
    expect(createPanel).not.toHaveBeenCalled();
    expect(takes).toHaveLength(1);
    free(window, release);
    const changed: unknown[] = [];
    expect(takes[0]!({ prefer: { value: "page", change: (value: unknown) => changed.push(value) } })).toBe(true);
    expect(createPanel).toHaveBeenCalledTimes(1);
    expect(createKeys).toHaveBeenLastCalledWith({ hotkey: "j", grabKey: undefined, grab: true });
    const prefer = createPanel.mock.calls[0]?.[0]?.prefer;
    expect(prefer?.value()).toBe("page");
    expect(prefer?.runtime).toBe("page source");
    prefer?.change("extension");
    expect(changed).toEqual(["extension"]);
    expect(hostOf(window)).toBeNull();
    expect(owned(window)).toBe(true);
  });

  test("keeps the choice and the footer's name through an unmount and a mount again, until it defers again", () => {
    const { release, takes } = host();
    devknobs.mount();
    free(window, release);
    takes[0]!({ prefer: { value: "page", change() {} } });
    devknobs.unmount();
    devknobs.mount();
    expect(createPanel).toHaveBeenCalledTimes(2);
    const prefer = createPanel.mock.calls[1]?.[0]?.prefer;
    expect(prefer?.value()).toBe("page");
    expect(prefer?.runtime).toBe("page source");
    devknobs.unmount();
    const again = host();
    devknobs.mount();
    expect(again.takes).toHaveLength(1);
    devknobs.unmount();
    free(window, again.release);
    devknobs.mount();
    expect(createPanel.mock.calls.at(-1)?.[0]?.prefer).toBeUndefined();
  });

  test("says it waits until it unmounts", () => {
    const { takes } = host();
    devknobs.mount();
    expect(takes[0]?.pending?.()).toBe(true);
    devknobs.unmount();
    expect(takes[0]?.pending?.()).toBe(false);
  });

  test("shows the choice as the host has it now, changed in another tab say", () => {
    const { release, takes } = host();
    devknobs.mount();
    free(window, release);
    let now = "page";
    takes[0]!({ prefer: { value: "page", change() {}, now: () => now } });
    const prefer = createPanel.mock.calls[0]?.[0]?.prefer;
    expect(prefer?.value()).toBe("page");
    now = "extension";
    expect(prefer?.value()).toBe("extension");
  });

  test("does not take the page once it has unmounted, or while a host still holds it", () => {
    const { release, takes } = host();
    devknobs.mount();
    expect(takes[0]!({})).toBe(false);
    devknobs.unmount();
    free(window, release);
    expect(takes[0]!({})).toBe(false);
    expect(createPanel).not.toHaveBeenCalled();
  });
});

describe("which host holds a page two hosts meet on", () => {
  const store = (version: string): HostRank => ({ build: "store", version });
  const local = (version: string): HostRank => ({ build: "local", version });

  test("a local build over a store one, then the newer version, then the version as text, whichever came first", () => {
    const ranks = [
      store("0.5.0"),
      store("0.5.1"),
      store("0.10.0"),
      local("0.4.0 · local old (1111111)"),
      local("0.5.1 · local a (1111111)"),
      local("0.5.1 · local b (2222222)"),
    ];
    for (const [index, rank] of ranks.entries()) {
      expect(outranks(rank, null)).toBe(true);
      for (const [other, than] of ranks.entries()) {
        expect(outranks(rank, than)).toBe(index > other);
      }
    }
  });

  test("reads a rank field by field, and names a host that stood down", () => {
    expect(rankOf({ rank: { build: "local", version: "0.5.1" } })).toEqual(local("0.5.1"));
    expect(rankOf({ rank: { build: "beta", version: "0.5.1" } })).toBeNull();
    expect(rankOf({})).toBeNull();
    expect(stoodDownNote(store("0.5.1"))).toBe("store extension stood down");
    expect(stoodDownNote(null)).toBe("older extension stood down");
  });
});

describe("two hosts on a page", () => {
  const prefer: PreferSetting = { value: "extension", change() {} };
  /** Another host, as another copy of the extension leaves it, noting what it hears. */
  function other(rank?: HostRank) {
    const heard: object[] = [];
    let released = 0;
    const release = () => {
      released++;
      free(window, release);
    };
    claim(window, release, () => {}, {}, rank ? { rank, outranked: (loser) => heard.push(loser) } : {});
    return { heard, release, released: () => released };
  }
  const runtime = () => createPanel.mock.lastCall?.[0]?.prefer?.runtime;

  test("a host that ranks lower stands down for the one that holds the page, and tells it", () => {
    const holder = other({ build: "local", version: "0.5.1 · local a (1111111)" });
    let stood = 0;
    devknobs.mount({ host: true, build: "store", stoodDown: () => stood++ });
    expect(stood).toBe(1);
    expect(holder.released()).toBe(0);
    expect(hostOf(window)?.release).toBe(holder.release);
    expect(createPanel).not.toHaveBeenCalled();
    expect(holder.heard).toEqual([{ build: "store", version: "source" }]);
    holder.release();
  });

  test("a host that ranks higher takes the page, and its footer says the other stood down", () => {
    const holder = other({ build: "store", version: "0.5.1" });
    devknobs.mount({ host: true, build: "local", prefer });
    expect(holder.released()).toBe(1);
    expect(hostOf(window)?.release).toBe(devknobs.unmount);
    expect(rankOf(hostOf(window)!)).toEqual({ build: "local", version: "source" });
    expect(runtime()).toBe("extension source · store extension stood down");
  });

  test("a host takes the page back from an older host that takes it from any copy", async () => {
    let stood = 0;
    devknobs.mount({ host: true, build: "store", prefer, stoodDown: () => stood++ });
    const old = other();
    await settle();
    expect(old.released()).toBe(1);
    expect(hostOf(window)?.release).toBe(devknobs.unmount);
    expect(stood).toBe(0);
    expect(runtime()).toBe("extension source · older extension stood down");
  });

  test("a host stands down for a higher one that comes after it, with no take-back", async () => {
    let stood = 0;
    devknobs.mount({ host: true, build: "store", stoodDown: () => stood++ });
    const higher = other({ build: "local", version: "0.5.1 · local a (1111111)" });
    await settle();
    expect(stood).toBe(1);
    expect(hostOf(window)?.release).toBe(higher.release);
    expect(higher.heard).toEqual([{ build: "store", version: "source" }]);
    higher.release();
  });

  test("a host stands down for one whose rank it cannot read, a newer build's say", () => {
    const release = () => free(window, release);
    claim(window, release, () => {}, {}, { rank: { build: "nightly", version: "9.0.0" } });
    let stood = 0;
    devknobs.mount({ host: true, build: "local", stoodDown: () => stood++ });
    expect(stood).toBe(1);
    expect(hostOf(window)?.release).toBe(release);
    release();
  });

  test("a host draws its footer again once a lower host stands down for it", () => {
    devknobs.mount({ host: true, build: "local", prefer });
    const calls = createPanel.mock.calls.length;
    hostOf(window)?.outranked?.({ build: "store", version: "0.5.1" });
    expect(createPanel).toHaveBeenCalledTimes(calls + 1);
    expect(runtime()).toBe("extension source · store extension stood down");
  });
});
