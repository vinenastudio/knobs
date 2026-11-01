import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import * as engine from "../src/engine";
import * as geo from "../src/engine/geo";
import * as header from "../src/engine/header";
import * as locale from "../src/engine/locale";
import * as media from "../src/engine/media";
import {
  drawnAround,
  drive,
  framing,
  handing,
  hostUa,
  inPage,
  type NativeDriver,
  type NativeMedia,
  type NativeUa,
  type NativeViewport,
  nativeUa,
  nativeViewport,
  release,
} from "../src/engine/native";
import * as network from "../src/engine/network";
import * as outlines from "../src/engine/outlines";
import * as overflow from "../src/engine/overflow";
import * as pseudo from "../src/engine/pseudo";
import * as scrollbars from "../src/engine/scrollbars";
import * as scrollkeep from "../src/engine/scrollkeep";
import * as spacing from "../src/engine/spacing";
import * as speed from "../src/engine/speed";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import * as text from "../src/engine/text";
import * as time from "../src/engine/time";
import * as touch from "../src/engine/touch";
import * as touchPointer from "../src/engine/touchpointer";
import * as ua from "../src/engine/ua";
import * as width from "../src/engine/frames";
import * as requests from "../src/requests";
import type { DevknobsState, NetworkValue, TextValue } from "../src/types";

/** A driver that notes every call, per part. */
function recorder() {
  const calls = {
    text: [] as TextValue[],
    offline: [] as boolean[],
    media: [] as NativeMedia[],
    viewport: [] as (NativeViewport | null)[],
    ua: [] as (NativeUa | null)[],
  };
  const driver: Required<Omit<NativeDriver, "setting" | "refused" | "framed" | "load">> = {
    text: (value) => calls.text.push(value),
    offline: (value) => calls.offline.push(value),
    media: (value) => calls.media.push(value),
    viewport: (value) => calls.viewport.push(value),
    ua: (value) => {
      calls.ua.push(value);
    },
  };
  return { calls, driver };
}

const SET: DevknobsState = merge(DEFAULT_STATE, {
  text: 48,
  network: { online: "offline", type: "3g" },
  scheme: "dark",
  contrast: "more",
  motion: "reduce",
  transparency: "reduce",
});

afterEach(() => {
  release({});
});

/** Just the window the engine reads at start and stop: in the width knob's frame, by name. */
function fakeWindow(name = ""): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      name,
      frameElement: null,
      addEventListener() {},
      removeEventListener() {},
      parent: { postMessage() {} },
    },
  });
}

describe("inPage", () => {
  test("is the state itself with no driver", () => {
    expect(inPage(SET, null)).toBe(SET);
  });

  test("leaves each knob the driver takes at system, and only those", () => {
    expect(inPage(SET, { text: () => {} })).toEqual({ ...SET, text: "system" });
    expect(inPage(SET, { offline: () => {} })).toEqual({
      ...SET,
      network: { ...SET.network, online: "system" },
    });
    expect(inPage(SET, { media: () => {} })).toEqual({
      ...SET,
      scheme: "system",
      contrast: "system",
      motion: "system",
      transparency: "system",
    });
  });

  test("keeps the slow network and save data in the page", () => {
    expect(inPage(SET, recorder().driver).network).toEqual({
      online: "system",
      type: "3g",
      saveData: "system",
    });
  });
});

describe("drive", () => {
  test("hands each part its value", () => {
    const { calls, driver } = recorder();
    drive(driver, SET);
    expect(calls).toEqual({
      text: [48],
      offline: [true],
      media: [{ scheme: "dark", motion: "reduce", contrast: "more", transparency: "reduce" }],
      viewport: [null],
      ua: [null],
    });
  });

  test("hands a part nothing when its knob did not change", () => {
    const { calls, driver } = recorder();
    drive(driver, SET);
    drive(driver, merge(SET, { locale: { lang: "de" }, network: { type: "2g" } }));
    drive(driver, merge(SET, { text: 24 }));
    expect(calls.text).toEqual([48, 24]);
    expect(calls.offline).toEqual([true]);
    expect(calls.media).toHaveLength(1);
  });

  test("skips the parts a driver does not have", () => {
    const seen: TextValue[] = [];
    drive({ text: (value) => seen.push(value) }, SET);
    expect(seen).toEqual([48]);
  });
});

describe("release", () => {
  test("hands every part its default, once", () => {
    const { calls, driver } = recorder();
    drive(driver, SET);
    release(driver);
    expect(calls.text).toEqual([48, "system"]);
    expect(calls.offline).toEqual([true, false]);
    expect(calls.media.at(-1)).toEqual({
      scheme: "system",
      motion: "system",
      contrast: "system",
      transparency: "system",
    });
    // Forgotten: a new mount hands everything again.
    drive(driver, DEFAULT_STATE);
    expect(calls.text).toEqual([48, "system", "system"]);
  });

  test("hands a driver that was never handed anything nothing", () => {
    const { calls, driver } = recorder();
    release(driver);
    expect(calls).toEqual({ text: [], offline: [], media: [], viewport: [], ua: [] });
  });
});

/** A phone picked with the device knob, as the store has it. */
function phone(patch: Parameters<typeof merge>[1] = {}): DevknobsState {
  return merge(DEFAULT_STATE, {
    device: "iphone-17",
    width: 402,
    height: 874,
    dpr: 3,
    ua: { preset: "iphone-safari" },
    mock: false,
    browser: "off",
    ...patch,
  });
}

describe("nativeUa", () => {
  test("is null for the browser's own", () => {
    expect(nativeUa({ preset: "system", custom: "" })).toBeNull();
    expect(nativeUa({ preset: "custom", custom: "  " })).toBeNull();
  });

  test("is a preset's browser, with its hints where it has them", () => {
    expect(nativeUa({ preset: "iphone-safari", custom: "" })).toEqual({
      userAgent: ua.uaPreset("iphone-safari")!.userAgent,
      platform: "iPhone",
      mobile: true,
      brands: [],
      uaPlatform: "iOS",
    });
    const android = nativeUa({ preset: "android-chrome", custom: "" });
    expect(android).toMatchObject({ mobile: true, uaPlatform: "Android", platform: "Linux armv81" });
    expect(android?.brands.map(({ brand }) => brand)).toContain("Google Chrome");
    expect(android?.hints?.model).toBe("Pixel 10");
  });

  test("is a custom string alone", () => {
    expect(nativeUa({ preset: "custom", custom: " Bot/1 " })).toEqual({
      userAgent: "Bot/1",
      platform: "",
      mobile: false,
      brands: [],
      uaPlatform: "",
    });
  });
});

describe("the ua part", () => {
  test("is handed on change, and kept by a release that keeps it", () => {
    const { calls, driver } = recorder();
    drive(driver, phone());
    drive(driver, phone({ text: 20 }));
    release(driver, false);
    expect(calls.ua.map((value) => value?.uaPlatform ?? null)).toEqual(["iOS"]);
    release(driver);
    expect(calls.ua.at(-1)).toBeNull();
  });

  test("holds what the frame waits for until its promise settles", async () => {
    let settle = () => {};
    const promise = new Promise<void>((resolve) => {
      settle = resolve;
    });
    drive({ ua: () => promise }, phone());
    const waiting = handing();
    expect(waiting).not.toBeNull();
    settle();
    await waiting;
    expect(handing()).toBeNull();
  });
});

describe("nativeViewport", () => {
  test("is null with no size knob", () => {
    expect(nativeViewport(DEFAULT_STATE)).toBeNull();
  });

  test("is a plain width, the window's height and ratio, with no touch", () => {
    expect(nativeViewport(merge(DEFAULT_STATE, { width: 390 }))).toEqual({
      width: 390,
      height: null,
      dpr: null,
      mobile: false,
      touch: false,
      touchPointer: false,
    });
  });

  test("is a ratio alone", () => {
    expect(nativeViewport(merge(DEFAULT_STATE, { dpr: 2 }))?.dpr).toBe(2);
  });

  test("is a phone's screen, ratio and touch screen, with nothing drawn around it", () => {
    expect(nativeViewport(phone())).toEqual({
      width: 402,
      height: 874,
      dpr: 3,
      mobile: true,
      touch: true,
      touchPointer: true,
    });
    expect(nativeViewport(phone({ touchPointer: false }))?.touchPointer).toBe(false);
  });

  test("is a laptop's size, with no touch, its browser and body drawn by none", () => {
    const laptop = merge(DEFAULT_STATE, { device: "laptop", width: 1366, height: 768, dpr: 1 });
    expect(nativeViewport(laptop)).toMatchObject({ mobile: false, touch: false, width: 1366 });
  });

  test("is null whenever the frame draws around the page", () => {
    const drawn: Parameters<typeof merge>[1][] = [
      { mock: true },
      { browser: "auto" },
      { browser: "compact" },
      { vision: "blur" },
      { zoom: 1 },
      { frame: true },
      { panel: { docked: true } },
    ];
    for (const patch of drawn) {
      expect(drawnAround(phone(patch))).toBe(true);
      expect(nativeViewport(phone(patch))).toBeNull();
    }
  });

  test("keeps a foldable in the frame, which draws its fold", () => {
    const duo = merge(DEFAULT_STATE, { device: "iphone-duo", width: 466, height: 678, mock: false, browser: "off" });
    expect(nativeViewport(duo)).toBeNull();
  });

  test("keeps a plain width docked in the frame", () => {
    expect(nativeViewport(merge(DEFAULT_STATE, { width: 390, panel: { docked: true } }))).toBeNull();
  });
});

describe("framing", () => {
  test("leaves the size knobs out of the frame while the host sets them, and only those", () => {
    const state = phone({ text: 32 });
    const framed = framing(state, { viewport: () => {}, text: () => {} });
    expect(framed).toEqual({ ...state, width: "full", height: "full", dpr: "system" });
  });

  test("keeps them for the frame when something is drawn, and with no viewport part", () => {
    expect(framing(phone({ mock: true }), { viewport: () => {} }).width).toBe(402);
    expect(framing(phone(), { text: () => {} }).width).toBe(402);
    expect(framing(phone(), null).width).toBe(402);
  });

  test("leaves inPage's size knobs alone", () => {
    expect(inPage(phone(), { viewport: () => {} }).width).toBe(402);
  });
});

describe("hostUa", () => {
  test("sends no browser for the one a device brought into the frame", () => {
    expect(hostUa(phone({ mock: true }), false)).toBeNull();
    expect(hostUa(phone(), false)).toBeNull();
  });

  test("sends the device's browser when the host sizes the whole tab as the device", () => {
    expect(hostUa(phone(), true)?.uaPlatform).toBe("iOS");
  });

  test("sends a browser the ua knob picked itself", () => {
    expect(hostUa(phone({ ua: { preset: "android-chrome" } }), false)?.uaPlatform).toBe("Android");
    expect(hostUa(merge(DEFAULT_STATE, { ua: { preset: "iphone-safari" } }), false)?.uaPlatform).toBe("iOS");
  });

  test("a driver with no viewport part sends none for a device in the frame", () => {
    const calls: (NativeUa | null)[] = [];
    drive({ ua: (value) => void calls.push(value) }, phone());
    expect(calls).toEqual([null]);
  });
});

describe("drive and release with a viewport", () => {
  test("hands the viewport, then null once a body is drawn, then null again on release only if changed", () => {
    const { calls, driver } = recorder();
    drive(driver, phone());
    drive(driver, phone({ mock: true }));
    drive(driver, phone());
    release(driver);
    expect(calls.viewport.map((value) => value?.width ?? null)).toEqual([402, null, 402, null]);
  });
});

describe("the engine with a native driver", () => {
  let spies: Mock<(...args: never[]) => unknown>[] = [];
  let mediaApply: Mock<typeof media.apply>;
  let networkApply: Mock<typeof network.apply>;
  let textApply: Mock<typeof text.apply>;

  const quiet = <T extends object>(target: T, ...names: (keyof T & string)[]) => {
    for (const name of names) {
      spies.push(spyOn(target, name as never).mockImplementation((() => {}) as never));
    }
  };

  beforeEach(() => {
    fakeWindow();
    spies = [];
    mediaApply = spyOn(media, "apply").mockImplementation(() => {});
    networkApply = spyOn(network, "apply").mockImplementation(() => {});
    textApply = spyOn(text, "apply").mockImplementation(() => {});
    quiet(media, "destroy");
    quiet(network, "reset");
    quiet(text, "reset");
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
    quiet(width, "apply", "sync", "reset", "onExit", "onZoom");
    quiet(overflow, "apply", "reset");
    quiet(outlines, "apply", "reset");
    quiet(requests, "start", "stop");
    quiet(scrollkeep, "resume");
  });

  afterEach(() => {
    engine.stop();
    for (const spy of [mediaApply, networkApply, textApply, ...spies]) spy.mockRestore();
    Reflect.deleteProperty(globalThis, "window");
  });

  const offline: NetworkValue = { online: "offline", type: "system", saveData: "system" };

  test("without a driver, the page emulates every knob as before", () => {
    engine.start({ persist: false });
    engine.setState({ text: 32, network: { online: "offline" }, scheme: "dark" });
    expect(textApply).toHaveBeenLastCalledWith(32);
    expect(networkApply).toHaveBeenLastCalledWith(offline);
    expect(mediaApply.mock.lastCall?.[0]).toMatchObject({ scheme: "dark" });
  });

  test("with a driver, those knobs go to it and stay out of the page", () => {
    const { calls, driver } = recorder();
    engine.start({ persist: false, native: driver });
    engine.setState({ text: 32, network: { online: "offline" }, scheme: "dark", motion: "reduce" });
    expect(textApply).toHaveBeenLastCalledWith("system");
    expect(networkApply).toHaveBeenLastCalledWith({ ...offline, online: "system" });
    expect(mediaApply.mock.lastCall?.[0]).toMatchObject({
      scheme: "system",
      motion: "system",
      contrast: "system",
      transparency: "system",
    });
    expect(calls.text).toEqual(["system", 32]);
    expect(calls.offline).toEqual([false, true]);
    expect(calls.media.at(-1)).toEqual({
      scheme: "dark",
      motion: "reduce",
      contrast: "system",
      transparency: "system",
    });
    // The state, and so the panel and describe(), read as ever.
    expect(engine.getState()).toMatchObject({ text: 32, scheme: "dark", motion: "reduce" });
    expect(engine.getState().network.online).toBe("offline");
  });

  test("reset and unmount hand the driver the defaults", () => {
    const { calls, driver } = recorder();
    engine.start({ persist: false, native: driver });
    engine.setState({ text: 48, network: { online: "offline" } });
    engine.reset();
    expect(calls.text.at(-1)).toBe("system");
    expect(calls.offline.at(-1)).toBe(false);
    engine.setState({ scheme: "light" });
    engine.stop();
    expect(calls.media.at(-1)?.scheme).toBe("system");
  });

  test("inside the width knob's frame, the page above drives and the page still stays out", () => {
    fakeWindow("devknobs-frame");
    const { calls, driver } = recorder();
    engine.start({ persist: false, native: driver });
    engine.setState({ text: 24 });
    expect(textApply).toHaveBeenLastCalledWith("system");
    expect(calls).toEqual({ text: [], offline: [], media: [], viewport: [], ua: [] });
  });

  test("a plain device goes to the driver and keeps the page out of the frame", () => {
    const touchApply = spyOn(touch, "apply").mockImplementation(() => {});
    const widthApply = spyOn(width, "apply").mockImplementation(() => {});
    try {
      const { calls, driver } = recorder();
      engine.start({ persist: false, native: driver });
      engine.setState({ device: "iphone-17", mock: false, browser: "off" });
      expect(calls.viewport.at(-1)).toMatchObject({ width: 402, height: 874, dpr: 3, touch: true });
      expect(widthApply.mock.lastCall?.[0]).toMatchObject({ width: "full", height: "full", dpr: "system" });
      // The browser gives the touch points and the coarse pointer; the page only `ontouchstart`.
      expect(touchApply).toHaveBeenLastCalledWith({ on: true, points: false });
      expect(mediaApply.mock.lastCall?.[0]).toMatchObject({ touch: false });
      expect(engine.getState()).toMatchObject({ device: "iphone-17", width: 402, dpr: 3 });
      engine.setState({ mock: true });
      expect(calls.viewport.at(-1)).toBeNull();
      expect(widthApply.mock.lastCall?.[0]).toMatchObject({ width: 402, height: 874, mock: true });
      expect(touchApply).toHaveBeenLastCalledWith({ on: false, points: false });
    } finally {
      touchApply.mockRestore();
      widthApply.mockRestore();
    }
  });

  test("without a viewport part, a device frames the page as before", () => {
    const widthApply = spyOn(width, "apply").mockImplementation(() => {});
    try {
      engine.start({ persist: false, native: { text: () => {} } });
      engine.setState({ device: "iphone-17", mock: false, browser: "off" });
      expect(widthApply.mock.lastCall?.[0]).toMatchObject({ width: 402, height: 874, dpr: 3 });
    } finally {
      widthApply.mockRestore();
    }
  });
  test("switched off, hands the driver its defaults and the page emulates every knob, kept", () => {
    const widthApply = spyOn(width, "apply").mockImplementation(() => {});
    try {
      const { calls, driver } = recorder();
      engine.start({ persist: false, native: driver });
      engine.setState({ text: 48, network: { online: "offline" }, scheme: "dark", width: 390 });
      expect(widthApply.mock.lastCall?.[0]).toMatchObject({ width: "full" });
      engine.setNative(false);
      expect(calls.text.at(-1)).toBe("system");
      expect(calls.offline.at(-1)).toBe(false);
      expect(calls.media.at(-1)?.scheme).toBe("system");
      expect(calls.viewport.at(-1)).toBeNull();
      expect(textApply).toHaveBeenLastCalledWith(48);
      expect(networkApply).toHaveBeenLastCalledWith(offline);
      expect(mediaApply.mock.lastCall?.[0]).toMatchObject({ scheme: "dark" });
      // A plain width is the frame's again, as with no driver.
      expect(widthApply.mock.lastCall?.[0]).toMatchObject({ width: 390 });
      expect(engine.getState()).toMatchObject({ text: 48, scheme: "dark", width: 390 });
      // Off, a change goes to the page alone.
      const handed = calls.text.length;
      engine.setState({ text: 24 });
      expect(textApply).toHaveBeenLastCalledWith(24);
      expect(calls.text).toHaveLength(handed);
    } finally {
      widthApply.mockRestore();
    }
  });

  test("switched on again, the driver takes its knobs back from the page", () => {
    const { calls, driver } = recorder();
    engine.start({ persist: false, native: driver });
    engine.setState({ text: 48 });
    engine.setNative(false);
    engine.setNative(true);
    expect(calls.text).toEqual(["system", 48, "system", 48]);
    expect(textApply).toHaveBeenLastCalledWith("system");
    expect(engine.getState().text).toBe(48);
  });

  test("the switch is the host's to give, with its note", () => {
    engine.start({ persist: false, native: recorder().driver });
    expect(engine.nativeSwitch()).toBeNull();
    engine.stop();
    const setting = { label: "real", hint: "a bar", change: () => {} };
    engine.start({ persist: false, native: { ...recorder().driver, setting } });
    expect(engine.nativeSwitch()).toEqual({ setting, on: true, note: null });
    engine.setNative(false, "closed");
    expect(engine.nativeSwitch()).toEqual({ setting, on: false, note: "closed" });
    // The same mode again keeps the note; null clears it.
    engine.setNative(false);
    expect(engine.nativeSwitch()?.note).toBe("closed");
    engine.setNative(true, null);
    expect(engine.nativeSwitch()).toEqual({ setting, on: true, note: null });
    // Unmount puts the switch back on.
    engine.setNative(false);
    engine.stop();
    engine.start({ persist: false, native: { ...recorder().driver, setting } });
    expect(engine.nativeSwitch()?.on).toBe(true);
  });

  test("hands the ua with the switch off too, and keeps it as the switch goes off", () => {
    const { calls, driver } = recorder();
    engine.start({ persist: false, native: driver });
    engine.setState({ ua: { preset: "android-chrome" } });
    engine.setNative(false);
    expect(calls.ua.at(-1)?.uaPlatform).toBe("Android");
    engine.setState({ ua: { preset: "iphone-safari" } });
    expect(calls.ua.at(-1)?.uaPlatform).toBe("iOS");
    engine.stop();
    expect(calls.ua.at(-1)).toBeNull();
  });

  test("leaves the top page's navigator alone while a device's frame is up", () => {
    engine.start({ persist: false });
    engine.setState({ device: "iphone-17" });
    const apply = ua.apply as unknown as Mock<typeof ua.apply>;
    expect(engine.getState().ua.preset).toBe("iphone-safari");
    expect(apply.mock.lastCall?.[0]).toEqual(DEFAULT_STATE.ua);
    engine.reset();
    engine.setState({ ua: { preset: "android-chrome" } });
    expect(apply.mock.lastCall?.[0]).toMatchObject({ preset: "android-chrome" });
  });

  test("inside the width knob's frame, the page above says whether the driver is on", () => {
    fakeWindow("devknobs-frame");
    const { calls, driver } = recorder();
    engine.start({ persist: false, native: driver });
    engine.setNative(false);
    engine.setState({ text: 24 });
    expect(textApply).toHaveBeenLastCalledWith(24);
    expect(calls.text).toEqual([]);
  });
});
