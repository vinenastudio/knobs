import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Look } from "../src/engine/browserkit";
import { textWidth } from "../src/engine/browserkit";
import { barsOf, layoutOptions, platformOf, SAFARI_TEXT, type Shape } from "../src/engine/browserui";
import { parseHex } from "../src/engine/color";
import { SCREENS, turn } from "../src/engine/devices";
import {
  batteryParts,
  batteryWidth,
  buildSafari,
  domainFit,
  domainOf,
  DOMAIN_PAD,
  domainRoom,
  glassTint,
  pillBox,
  SAFARI_CSS,
  STATUS_GLYPHS,
} from "../src/engine/safaridraw";

function hex(value: string) {
  const color = parseHex(value);
  if (!color) throw new Error(`not a color: ${value}`);
  return color;
}

/** Each channel within `levels` of the other's. */
function near(actual: string, expected: string, levels = 3) {
  const a = hex(actual);
  const b = hex(expected);
  for (const key of ["red", "green", "blue"] as const) {
    expect(Math.abs(a[key] - b[key])).toBeLessThanOrEqual(levels);
  }
}

describe("Safari's status bar", () => {
  test("the battery is iOS 27's: a solid body, charged in the glyph's color, the rest gray, a cap apart", () => {
    const { regular, large } = STATUS_GLYPHS;
    // Measured on the iOS 27.0 simulator: 29 x 13.67 on the 17 Pro, 32.33 x 15 on the Pro Max.
    expect(batteryWidth(regular.battery)).toBeCloseTo(29);
    expect(batteryWidth(large.battery)).toBeCloseTo(32.33);
    const small = batteryParts(regular.battery, 69);
    expect(small.body).toMatchObject({ x: 0, y: 0, width: 26.33, height: 13.67, rx: 4.67 });
    expect(small.cap).toMatchObject({ x: 27, width: 2, height: 5 });
    expect(small.cap.y).toBeCloseTo(4.335);
    // The charged part is cut straight at 69% of the body, its left corners the body's.
    expect(small.level.d).toBe("M18.168 0H4.67A4.67 4.67 0 0 0 0 4.67V9A4.67 4.67 0 0 0 4.67 13.67H18.168Z");
    const big = batteryParts(large.battery, 69);
    expect(big.cap).toMatchObject({ x: 30.33, width: 2, height: 5 });
    expect(big.cap.y).toBeCloseTo(5);
  });

  test("a nearly empty or full battery's charged part keeps to the body's round corners", () => {
    const { battery } = STATUS_GLYPHS.regular;
    // 5%: inside the left corner, so it starts and ends on the corner's curve.
    const low = batteryParts(battery, 5).level.d;
    expect(low.startsWith("M1.316 ")).toBe(true);
    expect(low).not.toContain("H");
    // 100%: the whole body, round at all four corners.
    const full = batteryParts(battery, 100).level.d;
    expect(full.match(/A/g)).toHaveLength(4);
    expect(full.startsWith("M26.33 4.67")).toBe(true);
  });

  test("the bars, wifi and battery are the simulator's widths and as far apart", () => {
    const width = (glyphs: (typeof STATUS_GLYPHS)["regular" | "large"]) => {
      const { signal, wifi, battery, gap } = glyphs;
      const bars = signal.pitch * (signal.heights.length - 1) + signal.width;
      return bars + gap + wifi.width + gap + batteryWidth(battery);
    };
    // iOS 27.0, 17 Pro: the bars at 284.67 to the battery's cap at 369.67. Pro Max: 309.67 to 401.67.
    expect(width(STATUS_GLYPHS.regular)).toBeCloseTo(369.67 - 284.67, 1);
    expect(width(STATUS_GLYPHS.large)).toBeCloseTo(401.67 - 309.67, 1);
  });

  test("the glyphs are about 7% bigger than iOS 26's 16.33 x 12.33 wifi and 27.33 x 13 battery", () => {
    const { wifi, signal } = STATUS_GLYPHS.regular;
    expect([wifi.width, wifi.height]).toEqual([18.67, 13.67]);
    expect(Math.max(...signal.heights)).toBe(13.67);
    expect(STATUS_GLYPHS.large.wifi).toMatchObject({ width: 20.33, height: 15 });
  });
});

describe("Safari's glass", () => {
  // Sampled inside the capsules on the iOS 27.0 simulator, 17 Pro.
  test("white content gives near-white glass in light, gray glass with white glyphs in dark", () => {
    expect(glassTint(hex("#ffffff"), "light")).toEqual({ fill: "#f8f8f8", glyph: "dark", rim: "none" });
    expect(glassTint(hex("#ffffff"), "dark")).toEqual({ fill: "#b3b3b3", glyph: "light", rim: "highlight" });
  });

  test("black content gives gray glass with black glyphs in light, #222222 in dark", () => {
    expect(glassTint(hex("#000000"), "light")).toEqual({ fill: "#898989", glyph: "dark", rim: "none" });
    expect(glassTint(hex("#000000"), "dark")).toEqual({ fill: "#222222", glyph: "light", rim: "highlight" });
    // A #111 band on a white page: #8b8b8b in light, #303030 in dark.
    near(glassTint(hex("#111111"), "light").fill, "#8b8b8b", 6);
    near(glassTint(hex("#111111"), "dark").fill, "#303030", 6);
  });

  test("saturated content gives glass in its own hue: lighter in light, a little brighter in dark", () => {
    const light = glassTint(hex("#1e5bd7"), "light");
    near(light.fill, "#7eb1ff", 7);
    expect(light).toMatchObject({ glyph: "dark", rim: "tint" });
    const dark = glassTint(hex("#1e5bd7"), "dark");
    near(dark.fill, "#2a6ef2", 7);
    expect(dark).toMatchObject({ glyph: "light", rim: "tint" });
    near(glassTint(hex("#13a538"), "light").fill, "#5ce37e", 7);
    near(glassTint(hex("#13a538"), "dark").fill, "#0ead37", 7);
  });

  test("a dull dark color stays mostly gray glass, a little in its hue", () => {
    const navy = hex(glassTint(hex("#0a1a40"), "dark").fill);
    expect(navy.blue).toBeGreaterThan(navy.red);
    expect(navy.blue).toBeLessThan(0x80);
  });

  test("the address is the host alone, as Safari hides the port", () => {
    expect(domainOf("127.0.0.1:8765")).toBe("127.0.0.1");
    expect(domainOf("knobs.dev")).toBe("knobs.dev");
    expect(domainOf("[::1]:3000")).toBe("[::1]");
  });
});

/** Just enough of an element for Safari's bars to be built, found by class and placed. */
class FakeElement {
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void } = Object.assign(
    Object.create(null) as Record<string, string>,
    { setProperty: () => {} },
  );
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  className = "";
  textContent = "";
  hidden = false;
  offsetWidth = 0;
  /** How wide it is drawn, in css px. */
  drawnWidth = 0;
  readonly classList = { add: () => {}, toggle: () => {}, contains: () => false };

  setAttribute(): void {}
  getBoundingClientRect(): { width: number } {
    return { width: this.drawnWidth };
  }
  addEventListener(): void {}
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.children.push(...nodes);
  }
  /** Every element under this one with the class of `selector`, a single `.class`. */
  querySelectorAll(selector: string): FakeElement[] {
    const name = selector.slice(1);
    return this.children.flatMap((child) => [
      ...(child.className.split(" ").includes(name) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

/** While on, the fake canvas sets smaller sizes looser, as the system font does; off, it measures as having no canvas does. */
let loose = false;

/** A canvas whose text widens at small sizes: each 1 px under 17 adds 0.06 px a character. */
const LOOSE_PEN = {
  font: "",
  measureText(text: string): { width: number } {
    const size = Number.parseFloat(/([\d.]+)px/.exec(LOOSE_PEN.font)?.[1] ?? "0");
    return { width: text.length * (size * 0.55 + (loose ? 0.06 * (17 - size) : 0)) };
  },
};

describe("Safari's domain has room for its text", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
  beforeEach(() => {
    loose = true;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        // The text is measured by its length, wider than scaled at small sizes, the same for the bars and the test.
        createElement: (tag: string) => (tag === "canvas" ? { getContext: () => LOOSE_PEN } : new FakeElement()),
        createElementNS: () => new FakeElement(),
      },
    });
  });
  afterEach(() => {
    loose = false;
    if (saved) Object.defineProperty(globalThis, "document", saved);
    else Reflect.deleteProperty(globalThis, "document");
  });

  const HOSTS = ["x.com", "knobs.dev", "mertduzgun.com", "claudemarketplaces.com", "preview-build.long-subdomain.example.dev"];
  const look = (host: string): Look => ({
    background: "rgb(255, 255, 255)",
    top: "rgb(255, 255, 255)",
    header: false,
    bottom: "rgb(255, 255, 255)",
    footer: false,
    under: [],
    dark: false,
    scheme: "light",
    host,
    canBack: false,
    canForward: false,
  });
  const actions = { back: () => {}, forward: () => {}, reload: () => {} };
  const ids = [...SCREENS.filter((screen) => platformOf(screen.id) === "safari").map((screen) => screen.id), "ipad-air-11", "pixel-10"];

  test("the hosts list has a 40 character one", () => {
    expect(HOSTS.at(-1)).toHaveLength(40);
  });

  test("between the states the domain is laid out at its new size and scales from its old one", () => {
    const screen = SCREENS.find((each) => each.id === "iphone-17-pro");
    const full = screen && barsOf(screen, "portrait", "compact", false);
    const mini = screen && barsOf(screen, "portrait", "compact", true);
    if (!full || !mini) throw new Error("no bars");
    const painted = buildSafari(full, mini, look("mertduzgun.com"), actions);
    const root = painted.root as unknown as FakeElement;
    const [domain] = root.querySelectorAll(".domain");
    if (!domain) throw new Error("no domain");
    const set: string[] = [];
    Object.defineProperty(domain.style, "transform", {
      get: () => set.at(-1) ?? "",
      set: (value: string) => set.push(`${domain.style.fontSize} ${value}`),
    });
    painted.apply(false, look("mertduzgun.com"));
    painted.apply(true, look("mertduzgun.com"));
    painted.apply(false, look("mertduzgun.com"));
    const advance = (from: number, to: number) => textWidth("mertduzgun.com", from, 500) / textWidth("mertduzgun.com", to, 500);
    expect(set).toEqual([
      "17px translate(-50%, -50%)",
      `13px translate(-50%, -50%) scale(${advance(17, 13)})`,
      "13px translate(-50%, -50%)",
      `17px translate(-50%, -50%) scale(${advance(13, 17)})`,
      "17px translate(-50%, -50%)",
    ]);
  });

  test("a morph turned back midway starts where it is drawn, and its top goes on gliding", () => {
    const screen = SCREENS.find((each) => each.id === "iphone-17-pro");
    const full = screen && barsOf(screen, "portrait", "compact", false);
    const mini = screen && barsOf(screen, "portrait", "compact", true);
    const pill = mini?.shapes.find((shape) => shape.kind === "pill");
    const address = full?.shapes.find((shape) => shape.kind === "field") ?? full?.shapes.find((shape) => shape.text !== undefined);
    if (!screen || !full || !mini || !pill || !address) throw new Error("no bars");
    // A host that fits the address shrunk, so the size changes between the states.
    const host = "mertduzgun.com";
    const painted = buildSafari(full, mini, look(host), actions);
    const root = painted.root as unknown as FakeElement;
    const surface = root.children.find((child) => child.className.split(" ").includes("surface"));
    const [domain] = surface?.querySelectorAll(".domain") ?? [];
    if (!domain) throw new Error("no domain");
    const writes: string[] = [];
    for (const name of ["transition", "transitionProperty", "transform", "maxWidth"]) {
      let value = "";
      Object.defineProperty(domain.style, name, {
        get: () => value,
        set: (next: string) => {
          value = next;
          writes.push(`${name} ${next}`);
        },
      });
    }
    const saved = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
    // Partway through, the domain is drawn 1.1 times its laid out size, 150 px wide.
    Object.defineProperty(globalThis, "getComputedStyle", {
      configurable: true,
      value: (node: unknown) => ({ transform: node === domain ? "matrix(1.1, 0, 0, 1.1, 0, 0)" : "none" }),
    });
    domain.drawnWidth = 150;
    try {
      painted.apply(false, look(host));
      painted.apply(true, look(host));
      writes.length = 0;
      painted.apply(false, look(host));
    } finally {
      if (saved) Object.defineProperty(globalThis, "getComputedStyle", saved);
      else Reflect.deleteProperty(globalThis, "getComputedStyle");
    }
    const W = turn(screen, "portrait").width;
    const fitted = domainFit(address, host, W).size;
    expect(fitted).toBe(17);
    const scale = 1.1 * (textWidth(host, pill.text?.size ?? 0, 500) / textWidth(host, fitted, 500));
    expect(writes).toEqual([
      "transitionProperty top, height, -webkit-mask-position, mask-position",
      `transform translate(-50%, -50%) scale(${scale})`,
      `maxWidth ${150 / scale}px`,
      "transitionProperty ",
      `maxWidth ${domainRoom(address, host, W)}px`,
      "transform translate(-50%, -50%)",
    ]);
  });

  test("a cut host keeps its end and fades its start, never an ellipsis", () => {
    expect(SAFARI_CSS).not.toContain("text-overflow");
    expect(SAFARI_CSS).toContain("justify-content: flex-end;");
    expect(SAFARI_CSS).toContain("mask-image: linear-gradient(to right, transparent, #000 9px);");
    // Where it fits, the fade sits out past the start; where it is cut, on it.
    expect(SAFARI_CSS).toContain("mask-position: -9px 0;");
    expect(SAFARI_CSS).toContain('.safari .domain[data-cut="true"] { -webkit-mask-position: 0 0; mask-position: 0 0; }');
  });

  test("the address's room is 21 in from each glyph's center: 132, 170 and 105 on the Pro, Pro Max and SE, 236 on the Duo's cover at 25", () => {
    const room = (id: string) => {
      const screen = SCREENS.find((each) => each.id === id);
      const full = screen && barsOf(screen, "portrait", "compact", false);
      const address = full?.shapes.find((shape) => shape.text !== undefined);
      if (!screen || !address) throw new Error(`no address on ${id}`);
      return domainRoom(address, "knobs.dev", turn(screen, "portrait").width);
    };
    expect(room("iphone-17-pro")).toBeCloseTo(132, 0);
    expect(room("iphone-17-pro-max")).toBeCloseTo(170, 0);
    expect(room("iphone-se")).toBeCloseTo(105, 0);
    expect(room("iphone-duo-closed")).toBeCloseTo(236, 0);
  });

  test("a size that scaled would still overflow is measured again, smaller, until it fits", () => {
    // Pro Max and claudemarketplaces.com: scaled from 17 alone, it reaches past its room.
    const screen = SCREENS.find((each) => each.id === "iphone-17-pro-max");
    const full = screen && barsOf(screen, "portrait", "compact", false);
    const address = full?.shapes.find((shape) => shape.text !== undefined);
    if (!screen || !address) throw new Error("no address");
    const host = "claudemarketplaces.com";
    const fit = domainFit(address, host, turn(screen, "portrait").width);
    const scaled = (17 * fit.room) / textWidth(host, 17, 500);
    expect(textWidth(host, scaled, 500)).toBeGreaterThan(fit.room + 0.5);
    expect(fit.cut).toBe(false);
    expect(fit.size).toBeLessThan(scaled);
    expect(fit.size).toBeGreaterThan(13);
    expect(textWidth(host, fit.size, 500)).toBeLessThanOrEqual(fit.room + 0.5);
  });

  test("the domain's box holds the font's ascent and descent at 13 and 17, so a g's tail is not cut", () => {
    expect(SAFARI_CSS).toContain(`padding-block: ${DOMAIN_PAD}em;`);
    // The system font's ascent and descent in Chromium on macOS, in px: 13 and 3 at 13, 16 and 4 at 17.
    for (const [size, ascent, descent] of [
      [13, 13, 3],
      [17, 16, 4],
    ] as const) {
      // One line high, line-height 1, and padded the same above and below.
      expect(size * (1 + 2 * DOMAIN_PAD)).toBeGreaterThanOrEqual(ascent + descent);
    }
  });

  test("mertduzgun.com fits the SE's address whole, shrunk", () => {
    const screen = SCREENS.find((each) => each.id === "iphone-se");
    const full = screen && barsOf(screen, "portrait", "compact", false);
    const address = full?.shapes.find((shape) => shape.text !== undefined);
    if (!screen || !address) throw new Error("no address");
    const fit = domainFit(address, "mertduzgun.com", turn(screen, "portrait").width);
    expect(fit.size).toBeLessThan(17);
    expect(fit.size).toBeGreaterThanOrEqual(13);
    expect(fit.cut).toBe(false);
    expect(textWidth("mertduzgun.com", fit.size, 500)).toBeLessThanOrEqual(fit.room + 0.5);
  });

  test("a new host in the same state shows at its size at once, with no glide", () => {
    const screen = SCREENS.find((each) => each.id === "iphone-17-pro");
    const full = screen && barsOf(screen, "portrait", "compact", false);
    const mini = screen && barsOf(screen, "portrait", "compact", true);
    if (!full || !mini) throw new Error("no bars");
    const painted = buildSafari(full, mini, look("knobs.dev"), actions);
    const root = painted.root as unknown as FakeElement;
    const surface = root.children.find((child) => child.className.split(" ").includes("surface"));
    const [domain] = surface?.querySelectorAll(".domain") ?? [];
    if (!domain) throw new Error("no domain");
    const set: string[] = [];
    Object.defineProperty(domain.style, "transform", {
      get: () => set.at(-1) ?? "",
      set: (value: string) => set.push(value),
    });
    painted.apply(false, look("knobs.dev"));
    painted.apply(false, look("claudemarketplaces.com"));
    expect(domain.style.fontSize).toBe("13px");
    expect(set).toEqual(["translate(-50%, -50%)", "translate(-50%, -50%)"]);
  });

  for (const id of ids) {
    const screen = SCREENS.find((each) => each.id === id);
    if (!screen) throw new Error(`no screen ${id}`);
    for (const orientation of ["portrait", "landscape"] as const) {
      for (const layout of layoutOptions(id).filter((each) => each !== "off")) {
        for (const minimized of [false, true]) {
          test(`${id} ${orientation} ${layout} ${minimized ? "minimized" : "expanded"}`, () => {
            const full = barsOf(screen, orientation, layout, false);
            const mini = barsOf(screen, orientation, layout, true);
            // A Pixel's Chrome and an iPad draw no Safari bars.
            if (!full || !mini || full.platform !== "safari") {
              expect(platformOf(id)).not.toBe("safari");
              return;
            }
            const pill = mini.shapes.find((shape) => shape.kind === "pill");
            const address =
              full.shapes.find((shape) => shape.kind === "field") ?? full.shapes.find((shape) => shape.text !== undefined);
            const W = turn(screen, orientation).width;
            const cut: string[] = [];
            for (const host of HOSTS) {
              const painted = buildSafari(full, mini, look(host), actions);
              painted.apply(minimized, look(host));
              const root = painted.root as unknown as FakeElement;
              const surface = root.children.find((child) => child.className.split(" ").includes("surface"));
              // Held across, an iPhone keeps no pill, and so no surface.
              if (!surface || !pill) continue;
              const [domain] = surface.querySelectorAll(".domain");
              if (!domain) throw new Error("no domain");
              expect(domain.textContent).toBe(host);
              const size = Number.parseFloat(domain.style.fontSize ?? "") || SAFARI_TEXT.field;
              const room = Number.parseFloat(domain.style.maxWidth ?? "");
              const text = textWidth(host, size, 500);
              const shown: Shape | undefined = minimized ? pill : address;
              if (!shown) throw new Error("no shape for the domain");
              // The text's limit and the pill's width come from one room, at the size the text is laid out.
              expect(room).toBe(domainRoom(shown, host, W));
              const fit = domainFit(shown, host, W);
              expect(fit.room).toBe(room);
              if (minimized) {
                expect(size).toBe(shown.text?.size ?? 0);
                expect(fit.cut).toBe(text > room + 1e-9);
              } else {
                // An address shrinks its domain to its room, from 17 down to 13, measured at each size.
                expect(size).toBe(fit.size);
                expect(size).toBeLessThanOrEqual(17);
                expect(size).toBeGreaterThanOrEqual(13);
                if (textWidth(host, 17, 500) <= room) expect(size).toBe(17);
                // Too wide even at its least, the start is cut and fades; else it fits whole, unfaded.
                if (fit.cut) expect(size).toBe(13);
                else expect(text).toBeLessThanOrEqual(room + 0.5);
                expect(fit.cut).toBe(text > room + 0.5);
              }
              expect(domain.dataset.cut).toBe(String(fit.cut));
              if (minimized) {
                const box = pillBox(pill, host, W);
                expect(Number.parseFloat(surface.style.width ?? "")).toBe(box.width);
                expect(box.width).toBe(room + (pill.text?.pad ?? 0));
                // A host too long for the screen cuts, the pill 16 in from its sides.
                expect(Math.min(box.x, W - box.x - box.width)).toBeGreaterThanOrEqual(16 - 1e-9);
                // Where the pill fits the screen 16 in from either side, the text is never cut.
                const most = 2 * (Math.min(pill.x, W - pill.x) - 16);
                const fits = textWidth(host, SAFARI_TEXT.pill, 500) + (pill.text?.pad ?? 0) <= most;
                if (fits && room < text) cut.push(host);
              } else {
                // Centered, the text keeps 21 clear of the glyphs' centers at the address's ends, or its shape's own.
                const middle = shown.text?.x ?? 0;
                for (const mark of shown.marks) {
                  expect(Math.abs(mark.x - middle) - (shown.text?.clear ?? 21)).toBeGreaterThanOrEqual(room / 2 - 1e-9);
                }
              }
            }
            expect(cut).toEqual([]);
          });
        }
      }
    }
  }
});
