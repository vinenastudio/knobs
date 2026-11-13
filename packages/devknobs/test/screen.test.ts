import { describe, expect, test } from "bun:test";
import { apply, screenSizeOf } from "../src/engine/screen";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import type { KnobsStatePatch } from "../src/types";

function state(patch: KnobsStatePatch) {
  return merge(DEFAULT_STATE, patch);
}

/** A window whose screen reads the host's, from its prototype as a browser's does. */
function hostWindow() {
  class Screen {
    get width(): number {
      return 1400;
    }
    get height(): number {
      return 1250;
    }
    get availWidth(): number {
      return 1400;
    }
    get availHeight(): number {
      return 1200;
    }
  }
  return { screen: new Screen() };
}

describe("screenSizeOf", () => {
  test("a phone or a tablet reads its own screen, an iPhone upright either way", () => {
    expect(screenSizeOf(state({ device: "iphone-17-pro" }))).toEqual({ width: 402, height: 874 });
    const turned = state({ device: "iphone-17-pro", orientation: "landscape" });
    expect(screenSizeOf(turned)).toEqual({ width: 402, height: 874 });
    const pixel = state({ device: "pixel-9", orientation: "landscape" });
    expect(screenSizeOf(pixel)).toEqual({ width: 924, height: 412 });
    expect(screenSizeOf(state({ device: "ipad-mini" }))).toEqual({ width: 744, height: 1133 });
  });

  test("the iPhone Duo reports its cover screen on either screen, held either way, as the iOS 27.1 simulator does", () => {
    const cover = { width: 466, height: 678 };
    expect(screenSizeOf(state({ device: "iphone-duo", posture: "closed" }))).toEqual(cover);
    for (const orientation of ["portrait", "landscape"] as const) {
      expect(screenSizeOf(state({ device: "iphone-duo", posture: "open", orientation }))).toEqual(cover);
    }
    // The cover held across is 466 high to `availHeight` alone.
    const across = state({ device: "iphone-duo", posture: "closed", orientation: "landscape" });
    expect(screenSizeOf(across)).toEqual({ ...cover, availHeight: 466 });
    const view = hostWindow();
    apply(screenSizeOf(across), view);
    const { screen } = view;
    expect([screen.width, screen.height, screen.availWidth, screen.availHeight]).toEqual([466, 678, 466, 466]);
  });

  test("no device, a laptop or a desktop keep the window's own", () => {
    expect(screenSizeOf(state({ device: "none" }))).toBeNull();
    expect(screenSizeOf(state({ device: "laptop" }))).toBeNull();
    expect(screenSizeOf(state({ device: "desktop" }))).toBeNull();
  });
});

describe("apply", () => {
  test("puts the device's size on the window's screen, and gives the host's back", () => {
    const view = hostWindow();
    apply({ width: 402, height: 874 }, view);
    const { screen } = view;
    expect([screen.width, screen.height, screen.availWidth, screen.availHeight]).toEqual([
      402, 874, 402, 874,
    ]);
    apply(null, view);
    expect([screen.width, screen.height, screen.availWidth, screen.availHeight]).toEqual([
      1400, 1250, 1400, 1200,
    ]);
  });

  test("gives back a screen property the page had of its own, and only takes off its own", () => {
    const view = hostWindow();
    const { screen } = view;
    Object.defineProperty(screen, "availHeight", { configurable: true, enumerable: true, value: 1100 });
    apply({ width: 402, height: 874 }, view);
    apply({ width: 440, height: 956 }, view);
    expect(screen.availHeight).toBe(956);
    apply(null, view);
    expect(screen.availHeight).toBe(1100);
    expect(Object.hasOwn(screen, "availHeight")).toBe(true);
    expect(Object.hasOwn(screen, "width")).toBe(false);
    expect(screen.width).toBe(1400);
  });
});
