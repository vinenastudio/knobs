import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { needsFrame } from "../src/engine/frame";
import { DEFAULT_STATE } from "../src/engine/store";
import type { DevknobsState } from "../src/types";

type Frames = typeof import("../src/engine/frames");
type Kit = Awaited<ReturnType<Parameters<Frames["loadKitWith"]>[0]>>;

/** A facade of its own, with none of the kit another test file loaded. */
async function freshFrames(): Promise<Frames> {
  return import(`../src/engine/frames.ts?${Math.random()}`);
}

/** A kit that writes down what reaches its frame. */
function fakeKit() {
  const calls: string[] = [];
  const fold = new Set<() => void>();
  const hinge = new Set<(open: number, hand: boolean) => void>();
  const kit = {
    width: {
      apply: (state: DevknobsState) => calls.push(`apply ${state.device}`),
      sync: (state: DevknobsState) => calls.push(`sync ${state.device}`),
      reset: () => calls.push("reset"),
      onExit() {},
      onZoom() {},
      onRefused() {},
      onFramed() {},
      onLoader() {},
      frameWindow: () => null,
      panelSized() {},
      zoomKey: () => true,
      idle: () => calls.length > 0,
    },
    watchFold(watcher: () => void) {
      fold.add(watcher);
      return () => fold.delete(watcher);
    },
    watchHinge(watcher: (open: number, hand: boolean) => void) {
      hinge.add(watcher);
      return () => hinge.delete(watcher);
    },
    landSplash() {},
    takeHinge: () => true,
    moveHinge: () => true,
    letGo: () => true,
    holdingHinge: () => true,
    foldRest: () => 0.5,
  };
  return { kit: kit as unknown as Kit, calls, fold, hinge };
}

const PLAIN: DevknobsState = { ...DEFAULT_STATE };
const DEVICE: DevknobsState = { ...DEFAULT_STATE, device: "iphone-duo", frame: true };

let dropped = 0;
let before: unknown;

beforeEach(() => {
  dropped = 0;
  before = Reflect.get(globalThis, "document");
  Reflect.set(globalThis, "document", {
    querySelectorAll: () => {
      dropped++;
      return [];
    },
    querySelector: () => null,
  });
});

afterEach(() => {
  Reflect.set(globalThis, "document", before);
});

describe("the frame's kit, loaded when a frame is first needed", () => {
  test("the states are one with a frame and one without", () => {
    expect(needsFrame(PLAIN)).toBe(false);
    expect(needsFrame(DEVICE)).toBe(true);
  });

  test("answers as a frame that is down while it is not in", async () => {
    const frames = await freshFrames();
    const fake = fakeKit();
    let loads = 0;
    frames.loadKitWith(async () => {
      loads++;
      return fake.kit;
    });
    frames.apply(PLAIN);
    expect(loads).toBe(0);
    expect(dropped).toBe(1);
    expect(frames.frameWindow()).toBeNull();
    expect(frames.zoomKey("zoom-in")).toBe(false);
    expect(frames.foldRest()).toBeNull();
    expect(frames.takeHinge(DEVICE)).toBe(false);
    expect(frames.holdingHinge()).toBe(false);
  });

  test("is idle with no frame, not while the kit loads, and then as the frame says", async () => {
    const frames = await freshFrames();
    const fake = fakeKit();
    frames.loadKitWith(async () => fake.kit);
    expect(frames.idle()).toBe(true);
    frames.apply(DEVICE);
    expect(frames.idle()).toBe(false);
    await frames.loadFrames();
    expect(frames.idle()).toBe(true);
  });

  test("hands a watcher set before it is in to the fold once it is, and its stop takes it off", async () => {
    const frames = await freshFrames();
    const fake = fakeKit();
    frames.loadKitWith(async () => fake.kit);
    const unwatch = frames.watchFold(() => {});
    expect(fake.fold.size).toBe(0);
    await frames.loadFrames();
    expect(fake.fold.size).toBe(1);
    unwatch();
    expect(fake.fold.size).toBe(0);
  });

  test("leaves a watcher stopped before it is in off the hinge", async () => {
    const frames = await freshFrames();
    const fake = fakeKit();
    frames.loadKitWith(async () => fake.kit);
    frames.watchHinge(() => {})();
    const kept = frames.watchHinge(() => {});
    await frames.loadFrames();
    expect(fake.hinge.size).toBe(1);
    kept();
    expect(fake.hinge.size).toBe(0);
  });

  test("draws a device picked after a state with no frame from that state, then the device", async () => {
    const frames = await freshFrames();
    const fake = fakeKit();
    frames.loadKitWith(async () => fake.kit);
    frames.apply(PLAIN);
    frames.sync(PLAIN);
    frames.apply(DEVICE);
    frames.sync(DEVICE);
    await frames.loadFrames();
    expect(fake.calls).toEqual(["apply none", "sync none", "apply iphone-duo", "sync iphone-duo"]);
  });

  test("draws a device restored at startup once", async () => {
    const frames = await freshFrames();
    const fake = fakeKit();
    frames.loadKitWith(async () => fake.kit);
    frames.apply(DEVICE);
    frames.sync(DEVICE);
    await frames.loadFrames();
    expect(fake.calls).toEqual(["apply iphone-duo", "sync iphone-duo"]);
    frames.apply(PLAIN);
    expect(fake.calls.at(-1)).toBe("apply none");
  });

  test("draws nothing it was reset from while it loaded", async () => {
    const frames = await freshFrames();
    const fake = fakeKit();
    frames.loadKitWith(async () => fake.kit);
    frames.apply(DEVICE);
    frames.reset();
    await frames.loadFrames();
    expect(fake.calls).toEqual([]);
  });

  test("that does not load takes the device off each time, and is not asked again", async () => {
    const frames = await freshFrames();
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      let loads = 0;
      frames.loadKitWith(async () => {
        loads++;
        throw new Error("chunk gone");
      });
      let exits = 0;
      frames.onExit(() => exits++);
      frames.apply(DEVICE);
      await expect(frames.loadFrames()).rejects.toThrow("chunk gone");
      expect(error).toHaveBeenCalledTimes(1);
      expect(exits).toBe(1);
      expect(dropped).toBe(1);
      frames.apply(DEVICE);
      expect(exits).toBe(2);
      frames.apply(PLAIN);
      expect(exits).toBe(2);
      await expect(frames.loadFrames()).rejects.toThrow("chunk gone");
      expect(loads).toBe(1);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});
