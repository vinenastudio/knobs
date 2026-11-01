import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Look } from "../src/engine/browserkit";
import { BEZELS } from "../src/engine/bezels";
import { barsOf, layoutOf, platformOf, type Screen } from "../src/engine/browserui";
import { SCREENS } from "../src/engine/devices";
import { BODIES } from "../src/engine/mockdata";
import { buildSafari, DUO_GLYPHS, STATUS_GLYPHS } from "../src/engine/safaridraw";
import type { OrientationValue } from "../src/types";
import { fake, type FakeNode, leave, page } from "./kit-dom";

const LOOK: Look = {
  background: "#ffffff",
  top: "#ffffff",
  bottom: "#ffffff",
  header: false,
  footer: false,
  under: [],
  dark: false,
  scheme: "light",
  host: "example.com",
  canBack: false,
  canForward: false,
};

const ACTIONS = { back() {}, forward() {}, reload() {} };

/** Every screen Safari draws on, each the way it is held with a status bar. */
const SAFARI_SCREENS = SCREENS.filter((screen) => platformOf(screen.id) === "safari");
/** The iPhones that show iOS's own status bar: all but the Duo, whose screens draw their own. */
const IPHONES = SAFARI_SCREENS.filter((screen) => !screen.id.startsWith("iphone-duo"));
const COVER = SCREENS.find((screen) => screen.id === "iphone-duo-closed") as Screen;
const INNER = SCREENS.find((screen) => screen.id === "iphone-duo-open") as Screen;

/** The status bar's nodes as the viewport draws them: the time and the glyphs, `minimized` or not. */
function statusOf(screen: Screen, orientation: OrientationValue, minimized = false) {
  const layout = layoutOf(screen.id, "auto");
  const full = barsOf(screen, orientation, layout, false);
  const mini = barsOf(screen, orientation, layout, true);
  if (!full || !mini) throw new Error(`no bars on ${screen.id}`);
  const painted = buildSafari(full, mini, LOOK, ACTIONS);
  painted.apply(minimized, LOOK);
  const root = fake(painted.root);
  const glyphs = root.children.filter((node) => node.classes().includes("status"));
  return { bars: full, status: full.status, time: root.find("time"), glyphs };
}

function shapes(node: FakeNode, tag: string): FakeNode[] {
  return node.children.filter((child) => child.tag === tag);
}

beforeEach(page);
afterEach(leave);

describe("every iPhone's status bar", () => {
  test("covers each iPhone, and both of the Duo's screens", () => {
    const ids = SAFARI_SCREENS.map((screen) => screen.id);
    expect(ids).toContain("iphone-se");
    expect(ids).toContain("iphone-duo-closed");
    expect(ids).toContain("iphone-duo-open");
    expect(ids.filter((id) => id.startsWith("iphone"))).toHaveLength(ids.length);
    expect(IPHONES).toHaveLength(ids.length - 2);
  });

  for (const screen of IPHONES) {
    test(`${screen.id} draws iOS 27's time, bars, wifi and battery, a size by its width`, () => {
      const { status, time, glyphs } = statusOf(screen, "portrait");
      expect(status).not.toBeNull();
      const large = screen.id !== "iphone-se" && screen.width >= 420;
      expect(status?.large).toBe(large);
      const set = large ? STATUS_GLYPHS.large : STATUS_GLYPHS.regular;
      expect(time).toHaveLength(1);
      expect(time[0]?.textContent).toMatch(/^\d\d:\d\d$/);
      // The glyphs are three svgs, each of its own shapes and nothing else.
      expect(glyphs).toHaveLength(3);
      const [signal, wifi, battery] = glyphs as [FakeNode, FakeNode, FakeNode];
      const bars = shapes(signal, "rect");
      expect(signal.children).toHaveLength(4);
      expect(bars.map((bar) => Number(bar.getAttribute("width")))).toEqual(Array(4).fill(set.signal.width));
      expect(bars.map((bar) => Number(bar.getAttribute("height")))).toEqual([...set.signal.heights]);
      expect(wifi.children).toHaveLength(3);
      expect(shapes(wifi, "path")).toHaveLength(3);
      expect(wifi.getAttribute("viewBox")?.split(" ").slice(2).map(Number)).toEqual([set.wifi.width, set.wifi.height]);
      // The battery: a solid gray body, the charged part over it in the glyph's color, and a gray cap apart. No outline, no percentage.
      expect(battery.children.map((child) => child.tag)).toEqual(["rect", "path", "path"]);
      const [body, level, cap] = battery.children as [FakeNode, FakeNode, FakeNode];
      expect(body.classes()).toEqual(["rest"]);
      expect(body.getAttribute("stroke")).toBeNull();
      expect(Number(body.getAttribute("width"))).toBe(set.battery.width);
      expect(Number(body.getAttribute("height"))).toBe(set.battery.height);
      expect(level.classes()).toEqual([]);
      expect(level.getAttribute("fill")).toBeNull();
      expect(level.getAttribute("d")?.startsWith("M")).toBe(true);
      expect(cap.classes()).toEqual(["rest"]);
      expect(battery.text()).toBe("");
    });
  }

  test("held across, an iPhone has no status bar to draw", () => {
    for (const screen of IPHONES) {
      const { status, time, glyphs } = statusOf(screen, "landscape");
      expect(status).toBeNull();
      expect(time).toHaveLength(0);
      expect(glyphs).toHaveLength(0);
    }
  });
});

describe("the iPhone Duo's status", () => {
  test("the cover screen held across shows no status at all, as the simulator draws it", () => {
    const { bars, status, time, glyphs } = statusOf(COVER, "landscape");
    expect(status).toBeNull();
    expect(bars.column).toBeNull();
    expect(time).toHaveLength(0);
    expect(glyphs).toHaveLength(0);
  });

  for (const minimized of [false, true]) {
    test(`the cover screen upright${minimized ? " and minimized" : ""} stacks the time and the ring in its column, none of the iPhone's glyphs`, () => {
      const { bars, status, time, glyphs } = statusOf(COVER, "portrait", minimized);
      expect(status).toBeNull();
      expect(bars.column).not.toBeNull();
      expect(time).toHaveLength(1);
      expect(time[0]?.textContent).toBe("04:20");
      expect(Reflect.get(time[0]?.style ?? {}, "left")).toBe(`${bars.column?.x}px`);
      expect(Reflect.get(time[0]?.style ?? {}, "display")).toBe("");
      // The ring and wifi in it: no bars, no battery.
      expect(glyphs).toHaveLength(2);
      const [ring, wifi] = glyphs as [FakeNode, FakeNode];
      expect(ring.classes()).toContain("ring");
      expect(glyphs.some((glyph) => shapes(glyph, "rect").length > 0)).toBe(false);
      // The battery's arc, as much as the charge and the rest dimmed, open at the bottom.
      const [rest, charge] = shapes(ring, "path") as [FakeNode, FakeNode];
      expect(rest.getAttribute("stroke-opacity")).toBe(String(DUO_GLYPHS.rest));
      expect(charge.getAttribute("stroke-opacity")).toBeNull();
      expect(charge.getAttribute("fill")).toBe("none");
      // The signal's four dots, on the ring's circle in its gap, below its middle.
      const dots = shapes(ring, "circle");
      expect(dots).toHaveLength(4);
      const radius = bars.column?.ring.radius ?? 0;
      for (const dot of dots) {
        const [cx, cy] = [Number(dot.getAttribute("cx")), Number(dot.getAttribute("cy"))];
        expect(Math.hypot(cx, cy)).toBeCloseTo(radius);
        expect(cy).toBeGreaterThan(radius * Math.cos((DUO_GLYPHS.ends * Math.PI) / 180));
        expect(Number(dot.getAttribute("r"))).toBe(DUO_GLYPHS.dot);
      }
      // Wifi: its three bands, in the ring.
      expect(shapes(wifi, "path")).toHaveLength(3);
      expect(wifi.getAttribute("viewBox")?.split(" ").slice(2).map(Number)).toEqual([
        DUO_GLYPHS.wifi.width,
        DUO_GLYPHS.wifi.height,
      ]);
    });
  }

  for (const orientation of ["portrait", "landscape"] as const) {
    test(`the inner screen held ${orientation} draws the same ring at its top right, the time left of it, on the strip`, () => {
      const { bars, status, time, glyphs } = statusOf(INNER, orientation);
      expect(status).toBeNull();
      expect(bars.column?.strip).toBe(true);
      expect(time).toHaveLength(1);
      expect(Reflect.get(time[0]?.style ?? {}, "left")).toBe(`${bars.column?.time.x}px`);
      expect(bars.column?.time.x).toBeLessThan((bars.column?.x ?? 0) - 40);
      expect(glyphs).toHaveLength(2);
      const [ring] = glyphs as [FakeNode];
      expect(ring.classes()).toContain("ring");
      expect(shapes(ring, "circle")).toHaveLength(4);
      expect(glyphs.some((glyph) => shapes(glyph, "rect").length > 0)).toBe(false);
    });

    test(`the inner screen held ${orientation} hides its status minimized`, () => {
      const { time, glyphs } = statusOf(INNER, orientation, true);
      for (const node of [...time, ...glyphs]) expect(Reflect.get(node.style, "display")).toBe("none");
    });
  }

  test("the cover's status takes its tone from the page's color, the inner's from the strip under it", () => {
    const tone = (screen: Screen, over: Partial<Look>) => {
      const layout = layoutOf(screen.id, "auto");
      const full = barsOf(screen, "portrait", layout, false);
      const mini = barsOf(screen, "portrait", layout, true);
      if (!full || !mini) throw new Error("no bars");
      const look = { ...LOOK, ...over };
      const painted = buildSafari(full, mini, look, ACTIONS);
      painted.apply(false, look);
      return fake(painted.root).classes();
    };
    const darkPage = { background: "rgb(17, 17, 17)", top: "rgb(255, 255, 255)", bottom: "rgb(17, 17, 17)" };
    const lightPage = { background: "rgb(255, 255, 255)", top: "rgb(17, 17, 17)", bottom: "rgb(255, 255, 255)" };
    expect(tone(COVER, darkPage)).toContain("dark");
    expect(tone(COVER, lightPage)).toContain("light");
    expect(tone(INNER, darkPage)).toContain("light");
    expect(tone(INNER, lightPage)).toContain("dark");
  });

  test("the camera hole is on the cover screen only, where Apple draws it", () => {
    const sensors = (id: string) => BODIES[id]?.front.filter((part) => part.kind === "sensor") ?? [];
    expect(sensors("iphone-duo-closed")).toHaveLength(1);
    expect(sensors("iphone-duo-open")).toHaveLength(0);
    expect(BEZELS["iphone-duo-closed"]?.portrait.cutout).toBeDefined();
    expect(BEZELS["iphone-duo-open"]?.portrait.cutout).toBeUndefined();
    expect(BEZELS["iphone-duo-open"]?.landscape?.cutout).toBeUndefined();
    // The column's center line runs under the hole.
    const [hole] = sensors("iphone-duo-closed");
    const middle = (hole?.x ?? 0) + (hole?.width ?? 0) / 2;
    expect(Math.abs((statusOf(COVER, "portrait").bars.column?.x ?? 0) - middle)).toBeLessThan(1.5);
  });
});
