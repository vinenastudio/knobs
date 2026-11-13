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
  domainOf,
  domainRoom,
  glassTint,
  pillBox,
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
  readonly classList = { add: () => {}, toggle: () => {}, contains: () => false };

  setAttribute(): void {}
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

describe("Safari's domain has room for its text", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        // No canvas: the text is measured by its length, the same for the bars and the test.
        createElement: (tag: string) => (tag === "canvas" ? { getContext: () => null } : new FakeElement()),
        createElementNS: () => new FakeElement(),
      },
    });
  });
  afterEach(() => {
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
    expect(set).toEqual([
      "17px translate(-50%, -50%)",
      `13px translate(-50%, -50%) scale(${17 / 13})`,
      "13px translate(-50%, -50%)",
      `17px translate(-50%, -50%) scale(${13 / 17})`,
      "17px translate(-50%, -50%)",
    ]);
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
              expect(size).toBe(shown.text?.size ?? 0);
              expect(room).toBe(domainRoom(shown, host, W));
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
                // Centered, the text keeps clear of the glyphs' 30 px boxes at the address's ends.
                const middle = shown.text?.x ?? 0;
                for (const mark of shown.marks) {
                  expect(Math.abs(mark.x - middle) - 15).toBeGreaterThanOrEqual(room / 2 - 1e-9);
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
