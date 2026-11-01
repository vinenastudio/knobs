import { describe, expect, test } from "bun:test";
import type { Look } from "../src/engine/browserkit";
import { barsOf, type Screen, viewportOf } from "../src/engine/browserui";
import { screenOf } from "../src/engine/devices";
import { bandRect, bandShift, pictureOf, showsBand, viewportUnits } from "../src/engine/underbar";

const PRO = screenOf("iphone-17-pro") as Screen;
const DUO = screenOf("iphone-duo-closed") as Screen;
const WHITE = "rgb(255, 255, 255)";

function look(over: Partial<Look> = {}): Look {
  return {
    background: WHITE,
    top: WHITE,
    bottom: WHITE,
    header: false,
    footer: false,
    under: [],
    dark: false,
    scheme: "light",
    host: "",
    canBack: false,
    canForward: false,
    ...over,
  };
}

describe("bandRect", () => {
  test("runs from the viewport's bottom edge to the screen's, as wide as the page", () => {
    // Compact expanded on the 17 Pro: the page from 62 to 776, the screen 874 tall.
    const page = viewportOf(PRO, "portrait", "compact", false, true);
    expect(page.y + page.height).toBe(776);
    expect(bandRect(page, PRO.height)).toEqual({ x: 0, y: 776, width: 402, height: 98 });
  });

  test("Bottom and Top leave their own heights under the viewport", () => {
    const bottom = viewportOf(PRO, "portrait", "bottom", false, true);
    expect(bandRect(bottom, PRO.height)?.height).toBe(158);
    const top = viewportOf(PRO, "portrait", "top", false, true);
    expect(bandRect(top, PRO.height)?.height).toBe(92);
  });

  test("the Duo cover's band keeps clear of its column", () => {
    const page = viewportOf(DUO, "portrait", "compact", false, true);
    const band = bandRect(page, DUO.height);
    expect(band?.x).toBe(page.x);
    expect(band?.width).toBe(page.width);
    expect(band?.width).toBeLessThan(DUO.width);
  });

  test("none where the page reaches the screen's bottom, or there is no page box", () => {
    expect(bandRect({ x: 0, y: 0, width: 402, height: 874 }, 874)).toBeNull();
    expect(bandRect({ x: 0, y: 0, width: 402, height: 873.8 }, 874)).toBeNull();
    expect(bandRect(null, 874)).toBeNull();
  });
});

describe("bandShift", () => {
  test("the band starts at the document's px one viewport down from the scroll", () => {
    expect(bandShift(0, 714, 1)).toBe(-714);
    expect(bandShift(300, 714, 1)).toBe(-1014);
  });

  test("a page laid out at another width moves at its own scale", () => {
    expect(bandShift(100, 500, 0.5)).toBe(-300);
  });
});

describe("showsBand", () => {
  const expanded = barsOf(PRO, "portrait", "compact", false, true);

  test("Safari upright shows the page under its bars", () => {
    expect(showsBand(expanded, look())).toBe(true);
  });

  test("a fixed footer's color is carried down instead", () => {
    expect(showsBand(expanded, look({ footer: true }))).toBe(false);
  });

  test("nothing before the page is read, without bars, or under Chrome's, which hide the page", () => {
    expect(showsBand(expanded, null)).toBe(false);
    expect(showsBand(null, look())).toBe(false);
    const pixel = screenOf("pixel-10") as Screen;
    expect(showsBand(barsOf(pixel, "portrait", "top", false), look())).toBe(false);
  });

  test("an iPhone held sideways has no status bar and no band", () => {
    expect(showsBand(barsOf(PRO, "landscape", "compact", false, false), look())).toBe(false);
  });
});

describe("viewportUnits", () => {
  test("every viewport height becomes the px it comes to", () => {
    const css = ".a{height:100vh}.b{min-height:50svh}.c{top:10lvh}.d{height:100dvh}";
    expect(viewportUnits(css, 714)).toBe(".a{height:714px}.b{min-height:357px}.c{top:71.4px}.d{height:714px}");
  });

  test("decimals, negatives and calc keep their sense", () => {
    expect(viewportUnits("calc(100vh - 2rem) -12.5vh .5vh", 800)).toBe("calc(800px - 2rem) -100px 4px");
  });

  test("widths, names and words with vh in them stay", () => {
    const css = ".vh{width:100vw;inline-size:10vi}.x{--vhigh:1}";
    expect(viewportUnits(css, 714)).toBe(css);
  });
});

describe("pictureOf", () => {
  test("a page out of reach has no picture, so the solid fill stays", () => {
    const away = { contentDocument: null, contentWindow: null } as unknown as HTMLIFrameElement;
    expect(pictureOf(away)).toBeNull();
  });
});
