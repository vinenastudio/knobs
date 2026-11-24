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
    expect(viewportUnits(css, 714, 402)).toBe(".a{height:714px}.b{min-height:357px}.c{top:71.4px}.d{height:714px}");
  });

  test("decimals, negatives, exponents and calc keep their sense", () => {
    expect(viewportUnits("calc(100vh - 2rem) -12.5vh .5vh", 800, 402)).toBe("calc(800px - 2rem) -100px 4px");
    expect(viewportUnits("a{top:1e2vh;bottom:-10vh;left:+.5vh}", 618, 402)).toBe("a{top:618px;bottom:-61.8px;left:3.09px}");
  });

  test("widths, names and words with vh in them stay", () => {
    const css = ".vh{width:100vw;inline-size:10vi;block-size:10svw;margin:2em}.x{--vhigh:1}";
    expect(viewportUnits(css, 714, 402)).toBe(css);
  });

  test("class names with viewport units in them stay, their values do not", () => {
    expect(viewportUnits(".h-\\[260svh\\] { height: 260svh; }", 618, 402)).toBe(".h-\\[260svh\\] { height: 1606.8px; }");
    expect(viewportUnits(".min-h-\\[calc\\(100vh-4rem\\)\\] { min-height: calc(100vh - 4rem); }", 618, 402)).toBe(
      ".min-h-\\[calc\\(100vh-4rem\\)\\] { min-height: calc(618px - 4rem); }",
    );
    expect(viewportUnits(".\\32 60svh { height: 60svh; }", 618, 402)).toBe(".\\32 60svh { height: 370.8px; }");
    expect(viewportUnits(".w-50vh{width:50vh}", 618, 402)).toBe(".w-50vh{width:309px}");
  });

  test("custom property names, strings, urls, hashes and attribute values stay", () => {
    const kept = [
      ":root{--vh-50vh:1}",
      '.a::after{content:"100vh"}',
      ".b::after{content:'50svh'}",
      "@font-face{src:url(data:font/woff2;base64,AA9vh/50vh+)}",
      '@font-face{src:url("data:font/woff2;base64,AA9vh/50vh+")}',
      "#a50vh{color:red}",
      '[data-h="50vh"]{color:red}',
      "/* 100vh */",
    ];
    for (const css of kept) expect(viewportUnits(css, 618, 402)).toBe(css);
  });

  test("block lengths read the height, and the least and most of the sides read the frame's, upright and sideways", () => {
    const css = "a{top:10vb;left:10dvb;width:50vmin;height:50vmax;margin:10svmin 10lvmax}";
    expect(viewportUnits(css, 618, 402)).toBe("a{top:61.8px;left:61.8px;width:201px;height:309px;margin:40.2px 61.8px}");
    expect(viewportUnits(css, 402, 874)).toBe("a{top:40.2px;left:40.2px;width:201px;height:437px;margin:40.2px 87.4px}");
  });

  test("a long text asked again gives the same result, and at another size its own", () => {
    const long = `.a{height:50vh;width:50vmin}${"/* page */".repeat(500)}`;
    const tail = "/* page */".repeat(500);
    expect(viewportUnits(long, 618, 402)).toBe(`.a{height:309px;width:201px}${tail}`);
    expect(viewportUnits(long, 618, 402)).toBe(`.a{height:309px;width:201px}${tail}`);
    expect(viewportUnits(long, 700, 402)).toBe(`.a{height:350px;width:201px}${tail}`);
    expect(viewportUnits(long, 618, 300)).toBe(`.a{height:309px;width:150px}${tail}`);
    expect(viewportUnits(long, 618, 402)).toBe(`.a{height:309px;width:201px}${tail}`);
  });

  test("a sheet of a million characters with many strings and addresses and no backslash reads through at once", () => {
    const rule = '[type="button"]{content:"";height:50vh;background:url("a.png")}';
    const times = Math.ceil(1_000_000 / rule.length);
    const start = performance.now();
    const out = viewportUnits(rule.repeat(times), 618, 402);
    const took = performance.now() - start;
    expect(out).toBe(rule.replace("50vh", "309px").repeat(times));
    expect(took).toBeLessThan(200);
  });

  test("escaped quotes and brackets end no string or address", () => {
    const css = `a::after{content:"a\\"50vh"}b{background:url(x\\)50vh.png);height:10vh}c{background:url( 'y)50vh' );top:10vh}`;
    expect(viewportUnits(css, 618, 402)).toBe(
      `a::after{content:"a\\"50vh"}b{background:url(x\\)50vh.png);height:61.8px}c{background:url( 'y)50vh' );top:61.8px}`,
    );
  });

  test("an element's own style keeps its picture's address", () => {
    expect(viewportUnits('height:100vh;background:url("x-50vh.png")', 618, 402)).toBe('height:618px;background:url("x-50vh.png")');
  });
});

describe("pictureOf", () => {
  test("a page out of reach has no picture, so the solid fill stays", () => {
    const away = { contentDocument: null, contentWindow: null } as unknown as HTMLIFrameElement;
    expect(pictureOf(away)).toBeNull();
  });
});
