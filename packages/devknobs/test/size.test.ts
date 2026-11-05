import { afterEach, describe, expect, test } from "bun:test";
import type { LivePrefs, Prefs } from "../src/ui/prefs";
import {
  createSizer,
  dragWidth,
  HANDLE_REACH,
  keyWidth,
  PAGE_ROOM,
  PANEL_WIDTH,
  pageRoom,
  type Sizer,
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_STEP,
  widthGlides,
  widthIn,
  widthLimits,
} from "../src/ui/size";
import { PAGE_MIN } from "../src/engine/dock";
import type { SideValue } from "../src/types";

describe("the panel's width", () => {
  test("is 320 until the user says otherwise, for the rows, the settings and every view", () => {
    expect(PANEL_WIDTH).toBe(320);
    expect(PANEL_WIDTH).not.toBe(WIDTH_MIN);
  });

  test("goes down to 240, and up to 720 or what leaves the page 96", () => {
    expect(widthLimits(1440)).toEqual({ min: 240, max: 720 });
    expect(widthLimits(700)).toEqual({ min: 240, max: 604 });
    expect(widthLimits(816)).toEqual({ min: 240, max: 720 });
    expect(widthLimits(815)).toEqual({ min: 240, max: 719 });
    expect([WIDTH_MIN, WIDTH_MAX, PAGE_ROOM]).toEqual([240, 720, 96]);
  });

  test("in a window with no room to spare, only the least", () => {
    expect(widthLimits(300)).toEqual({ min: 240, max: 240 });
  });
});

describe("a pinned panel's width", () => {
  test("leaves the page its least, 320, where a floating panel leaves it 96", () => {
    expect([pageRoom(true), pageRoom(false)]).toEqual([PAGE_MIN, PAGE_ROOM]);
    expect(PAGE_MIN).toBe(320);
  });

  test("goes up to what leaves the page that, or 720", () => {
    const page = pageRoom(true);
    expect(widthLimits(1440, page)).toEqual({ min: 240, max: 720 });
    expect(widthLimits(1040, page)).toEqual({ min: 240, max: 720 });
    expect(widthLimits(1039, page)).toEqual({ min: 240, max: 719 });
    expect(widthLimits(900, page)).toEqual({ min: 240, max: 580 });
    expect(widthIn(700, 900, page)).toBe(580);
    expect(widthIn(5000, 800, page)).toBe(480);
  });

  test("in a window with no room for the page beside it, only the least, and the panel lies over the page", () => {
    const page = pageRoom(true);
    expect(widthLimits(559, page)).toEqual({ min: 240, max: 240 });
    expect(widthIn(400, 500, page)).toBe(240);
  });
});

describe("widthIn", () => {
  test("keeps a width between the limits", () => {
    expect(widthIn(240, 1440)).toBe(240);
    expect(widthIn(500, 1440)).toBe(500);
    expect(widthIn(100, 1440)).toBe(240);
    expect(widthIn(5000, 1440)).toBe(720);
  });

  test("is whole px", () => {
    expect(widthIn(412.6, 1440)).toBe(413);
  });

  test("in a narrow window, shows one kept wider at what leaves the page its room", () => {
    expect(widthIn(600, 700)).toBe(600);
    expect(widthIn(700, 700)).toBe(604);
    expect(widthIn(600, 500)).toBe(404);
  });

  test("never leaves the window, handle and gap included, down to its least", () => {
    for (let view = 0; view <= 1600; view += 7) {
      const width = widthIn(400, view);
      expect(width).toBeGreaterThanOrEqual(WIDTH_MIN);
      expect(width).toBeLessThanOrEqual(WIDTH_MAX);
      // 269 is the narrowest window the panel at its least and its handle fit, with the gap.
      if (view >= WIDTH_MIN + HANDLE_REACH + 8) {
        expect(width + HANDLE_REACH).toBeLessThanOrEqual(view - 8);
      }
    }
    expect(widthIn(340, 340)).toBe(244);
    expect(widthIn(340, 300)).toBe(240);
    expect(widthIn(340, 260)).toBe(240);
  });

  test("the least is 240 in any window, as it always was", () => {
    for (const view of [0, 200, 261, 300, 336]) expect(widthIn(240, view)).toBe(240);
  });
});

describe("dragWidth", () => {
  test("on the right, the strip is the left edge: a drag to the left is wider", () => {
    expect(dragWidth(340, -60, "right")).toBe(400);
    expect(dragWidth(340, 60, "right")).toBe(280);
  });

  test("on the left, the strip is the right edge: a drag to the right is wider", () => {
    expect(dragWidth(340, 60, "left")).toBe(400);
    expect(dragWidth(340, -60, "left")).toBe(280);
  });
});

describe("keyWidth", () => {
  const limits = { min: 280, max: 720 };

  test("an arrow moves the strip 16 the way it points", () => {
    expect(WIDTH_STEP).toBe(16);
    expect(keyWidth("ArrowLeft", 340, limits, "right")).toBe(356);
    expect(keyWidth("ArrowRight", 340, limits, "right")).toBe(324);
    expect(keyWidth("ArrowRight", 340, limits, "left")).toBe(356);
    expect(keyWidth("ArrowLeft", 340, limits, "left")).toBe(324);
  });

  test("stops at the limits", () => {
    expect(keyWidth("ArrowRight", 284, limits, "right")).toBe(280);
    expect(keyWidth("ArrowLeft", 716, limits, "right")).toBe(720);
  });

  test("Home is the least and End the most", () => {
    expect(keyWidth("Home", 340, limits, "right")).toBe(280);
    expect(keyWidth("End", 340, limits, "left")).toBe(720);
  });

  test("leaves every other key alone", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "a", "Escape", "Tab"]) {
      expect(keyWidth(key, 340, limits, "right")).toBeNull();
    }
  });
});

describe("widthGlides", () => {
  const cue = { first: false, dragging: false, resizing: false };

  test("glides to a new width, as the keys set it", () => {
    expect(widthGlides(cue)).toBe(true);
  });

  test("not to the first one, under the strip, or as the window resizes", () => {
    expect(widthGlides({ ...cue, first: true })).toBe(false);
    expect(widthGlides({ ...cue, dragging: true })).toBe(false);
    expect(widthGlides({ ...cue, resizing: true })).toBe(false);
  });
});

type Listener = (event: Record<string, unknown>) => void;

/** An element, as far as the strip builds and drives one. */
class FakeNode {
  className = "";
  tabIndex = -1;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, Listener>();
  captured: number | null = null;
  style = {
    width: "",
    transitionProperty: "",
    setProperty: (_name: string, _value: string): void => {},
  };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  setPointerCapture(pointer: number): void {
    this.captured = pointer;
  }

  hasPointerCapture(pointer: number): boolean {
    return this.captured === pointer;
  }

  releasePointerCapture(): void {
    this.captured = null;
  }

  getBoundingClientRect(): object {
    return {};
  }

  /** Fire an event, and say whether its default was prevented. */
  fire(type: string, event: Record<string, unknown> = {}): boolean {
    let prevented = false;
    this.listeners.get(type)?.({
      button: 0,
      pointerId: 1,
      preventDefault: () => {
        prevented = true;
      },
      ...event,
    });
    return prevented;
  }
}

function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

/** The panel the strip is built for, and what the strip did to it. */
interface Rig {
  sizer: Sizer;
  strip: FakeNode;
  host: FakeNode;
  /** What `--panel-width` was set to, in order, marked still where the panel's transitions were off. */
  widths: string[];
  /** The width the panel shows, as the stylesheet has it. */
  width(): string | undefined;
  /** What the frame was told, with how wide the host was by then. */
  sized: { glide: boolean; host: string }[];
  /** Each width the panel said it has, or glides to. */
  wide: number[];
  /** What the preferences were asked to keep. */
  kept: number[];
  state: { open: boolean; side: SideValue; docked: boolean; view: number };
  prefs: Prefs;
  dataset: Record<string, string>;
}

function rig(start: Partial<Rig["state"]> = {}, stored: Partial<Prefs> = {}): Rig {
  const state: Rig["state"] = {
    open: true,
    side: "right",
    docked: false,
    view: 1440,
    ...start,
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (): FakeNode => new FakeNode(),
      documentElement: {
        get clientWidth() {
          return state.view;
        },
      },
    },
  });
  const host = document.createElement("div");
  const wrap = document.createElement("div");
  const panel = document.createElement("div");
  const widths: string[] = [];
  fake(wrap).style.setProperty = (name, value) => {
    if (name !== "--panel-width") return;
    widths.push(panel.style.transitionProperty === "none" ? `${value} still` : value);
  };
  const prefs: Prefs = {
    handle: true,
    width: 240,
    stylesMode: "simple",
    stylesBox: true,
    changesDiff: false,
    htmlHeight: 200,
    htmlFull: false,
    ...stored,
  };
  const kept: number[] = [];
  const sized: Rig["sized"] = [];
  const wide: number[] = [];
  const live: LivePrefs = {
    get: () => prefs,
    setHandle: () => {},
    setStylesMode: () => {},
    setStylesBox: () => {},
    setChangesDiff: () => {},
    setHtmlSize: () => {},
    setWidth: (px) => {
      kept.push(px);
      prefs.width = px;
      // The panel draws again as the preferences change.
      sizer.size();
    },
    subscribe: () => () => {},
    destroy: () => {},
  };
  const sizer = createSizer({
    host,
    wrap,
    panel,
    prefs: live,
    place: () => ({ open: state.open, side: state.side, docked: state.docked }),
    wide: (px) => wide.push(px),
    sized: (glide) => sized.push({ glide, host: host.style.width }),
  });
  sizer.size();
  return {
    sizer,
    strip: fake(sizer.strip),
    host: fake(host),
    widths,
    width: () => widths.at(-1),
    sized,
    wide,
    kept,
    state,
    prefs,
    dataset: fake(wrap).dataset,
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("the width the panel takes", () => {
  test("is 240 at first, set with no glide and no word to the frame", () => {
    const { widths, host, sized } = rig();
    expect(widths).toEqual(["240px still", "240px"]);
    expect(host.style.width).toBe(`${240 + HANDLE_REACH}px`);
    expect(sized).toEqual([]);
  });

  test("stays as what the panel shows changes: no new width, no glide, no word to the frame", () => {
    const { sizer, widths, sized, wide } = rig({}, { width: 300 });
    widths.length = 0;
    let drawn = 0;
    // A view opens, and closes again.
    sizer.size(() => drawn++);
    sizer.size(() => drawn++);
    expect(drawn).toBe(2);
    expect(widths).toEqual([]);
    expect(sized).toEqual([]);
    expect(wide).toEqual([300]);
  });

  test("glides to a new one: drawn at the new width, put back at the old, and let go", () => {
    const { sizer, prefs, widths } = rig();
    widths.length = 0;
    const drawnAt: (string | undefined)[] = [];
    prefs.width = 340;
    sizer.size(() => drawnAt.push(widths.at(-1)));
    expect(drawnAt).toEqual(["340px still"]);
    expect(widths).toEqual(["340px still", "240px still", "340px"]);
  });

  test("tells the frame once, at the start, when the host is already as wide as the panel ends", () => {
    const { sizer, prefs, sized } = rig();
    prefs.width = 340;
    sizer.size();
    expect(sized).toEqual([{ glide: true, host: "361px" }]);
    sizer.size();
    sizer.size();
    expect(sized).toHaveLength(1);
  });

  test("draws even where the width stays", () => {
    const { sizer } = rig();
    let drawn = 0;
    sizer.size(() => drawn++);
    expect(drawn).toBe(1);
  });

  test("is what the preferences keep", () => {
    const { width } = rig({}, { width: 300 });
    expect(width()).toBe("300px");
  });

  test("a closed panel keeps its width until it opens, as its handle would jump with it", () => {
    const { sizer, state, prefs, width, sized } = rig({ open: false });
    expect(width()).toBe("240px");
    prefs.width = 340;
    let drawn = 0;
    sizer.size(() => drawn++);
    expect(width()).toBe("240px");
    expect(drawn).toBe(1);
    expect(sized).toEqual([]);
    state.open = true;
    sizer.size();
    expect(width()).toBe("340px");
    expect(sized).toEqual([{ glide: true, host: "361px" }]);
  });
});

describe("a narrow window", () => {
  test("shows a width kept wider at what fits, and leaves what is kept alone", () => {
    const { width, kept, prefs, host } = rig({ view: 700 }, { width: 680 });
    expect(width()).toBe("604px");
    expect(host.style.width).toBe("625px");
    expect(kept).toEqual([]);
    expect(prefs.width).toBe(680);
  });

  test("gives the width back as the window grows, at once and with no glide", () => {
    const { sizer, state, widths, sized, kept } = rig({ view: 700 }, { width: 680 });
    widths.length = 0;
    state.view = 1440;
    sizer.fit();
    expect(widths).toEqual(["680px still", "680px"]);
    expect(sized).toEqual([{ glide: false, host: "701px" }]);
    state.view = 500;
    sizer.fit();
    expect(widths.at(-1)).toBe("404px");
    expect(kept).toEqual([]);
  });

  test("shows one kept wider at the least in a window with no room to spare", () => {
    const { width } = rig({ view: 300 }, { width: 340 });
    expect(width()).toBe("240px");
  });
});

describe("the width the panel says it has", () => {
  test("is its first one too, which the frame is not told of", () => {
    const { wide, sized } = rig({}, { width: 300 });
    expect(wide).toEqual([300]);
    expect(sized).toEqual([]);
  });

  test("is the one it glides to, said before the frame hears that it glides", () => {
    const order: string[] = [];
    const { sizer, prefs, wide, sized } = rig();
    wide.push = (px) => order.push(`wide ${px}`);
    sized.push = (told) => order.push(`sized ${told.glide}`);
    prefs.width = 340;
    sizer.size();
    prefs.width = 240;
    sizer.size();
    expect(order).toEqual(["wide 340", "sized true", "wide 240", "sized true"]);
  });

  test("follows the strip: each move of a drag, a double click, the keys, and the window", () => {
    const { strip, sizer, state, wide } = rig({}, { width: 340 });
    wide.length = 0;
    strip.fire("pointerdown", { clientX: 1000 });
    strip.fire("pointermove", { clientX: 940 });
    strip.fire("pointermove", { clientX: 900 });
    strip.fire("pointerup", { clientX: 900 });
    expect(wide).toEqual([400, 440]);
    strip.fire("dblclick");
    expect(wide).toEqual([400, 440, 320]);
    strip.fire("keydown", { key: "ArrowLeft" });
    expect(wide).toEqual([400, 440, 320, 320 + WIDTH_STEP]);
    state.view = 270;
    sizer.fit();
    expect(wide.at(-1)).toBe(widthIn(320 + WIDTH_STEP, 270));
  });

  test("is not said again where the width stays, or while the panel is closed", () => {
    const { sizer, state, prefs, wide } = rig();
    sizer.size();
    expect(wide).toEqual([240]);
    state.open = false;
    prefs.width = 340;
    sizer.size();
    expect(wide).toEqual([240]);
    state.open = true;
    sizer.size();
    expect(wide).toEqual([240, 340]);
  });
});

describe("the strip of a pinned panel", () => {
  test("stops where the page is left its least, under the pointer and the keys", () => {
    const { strip, width, kept, state } = rig({ docked: true, view: 1000 });
    expect(strip.attributes.get("aria-valuemax")).toBe("680");
    strip.fire("pointerdown", { clientX: 600 });
    strip.fire("pointermove", { clientX: 100 });
    expect(width()).toBe("680px");
    strip.fire("pointerup", { clientX: 100 });
    expect(kept).toEqual([680]);
    strip.fire("keydown", { key: "ArrowLeft" });
    expect(width()).toBe("680px");
    strip.fire("keydown", { key: "End" });
    expect(kept.at(-1)).toBe(680);
    // Floating, the same window lets it go on to 720.
    state.docked = false;
    strip.fire("keydown", { key: "End" });
    expect(kept.at(-1)).toBe(720);
  });

  test("gives way as the panel is pinned: a width kept wider shows at what the page leaves", () => {
    const { sizer, state, width, wide, prefs, strip } = rig({ view: 1000 }, { width: 700 });
    expect(width()).toBe("700px");
    state.docked = true;
    sizer.size();
    expect(width()).toBe("680px");
    expect(wide).toEqual([700, 680]);
    expect(strip.attributes.get("aria-valuemax")).toBe("680");
    // What is kept stays, for when the panel floats again.
    expect(prefs.width).toBe(700);
    state.docked = false;
    sizer.size();
    expect(width()).toBe("700px");
  });

  test("narrows with the window down to its least, where the panel lies over the page", () => {
    const { sizer, state, width } = rig({ docked: true, view: 1000 }, { width: 600 });
    expect(width()).toBe("600px");
    state.view = 800;
    sizer.fit();
    expect(width()).toBe("480px");
    state.view = 500;
    sizer.fit();
    expect(width()).toBe("240px");
  });
});

describe("the strip", () => {
  test("is a separator the keys reach, that says its value and its limits", () => {
    const { strip, sizer, state, prefs } = rig();
    expect(strip.className).toBe("sizer");
    expect(strip.tabIndex).toBe(0);
    expect(strip.attributes.get("role")).toBe("separator");
    expect(strip.attributes.get("aria-orientation")).toBe("vertical");
    expect(strip.attributes.get("aria-label")).toBe("panel width");
    expect(strip.attributes.get("aria-valuenow")).toBe("240");
    expect(strip.attributes.get("aria-valuemin")).toBe("240");
    expect(strip.attributes.get("aria-valuemax")).toBe("720");
    prefs.width = 340;
    state.view = 700;
    sizer.size();
    expect(strip.attributes.get("aria-valuenow")).toBe("340");
    expect(strip.attributes.get("aria-valuemin")).toBe("240");
    expect(strip.attributes.get("aria-valuemax")).toBe("604");
  });

  test("a drag changes the width, live, with no glide, and keeps it once let go", () => {
    const { strip, widths, sized, kept, dataset } = rig({}, { width: 340 });
    widths.length = 0;
    strip.fire("pointerdown", { clientX: 1000 });
    expect(strip.captured).toBe(1);
    expect(dataset.sizing).toBe("true");
    strip.fire("pointermove", { clientX: 940 });
    strip.fire("pointermove", { clientX: 900 });
    expect(widths).toEqual(["400px still", "400px", "440px still", "440px"]);
    expect(sized).toEqual([
      { glide: false, host: "421px" },
      { glide: false, host: "461px" },
    ]);
    expect(kept).toEqual([]);
    strip.fire("pointerup", { clientX: 900 });
    expect(kept).toEqual([440]);
    expect(strip.captured).toBeNull();
    expect(dataset.sizing).toBeUndefined();
    expect(sized).toHaveLength(2);
  });

  test("a width set while a view shows is the width once the rows show again", () => {
    const { strip, sizer, kept, prefs, width } = rig();
    // A view shows: the panel draws it at the width it has.
    sizer.size();
    strip.fire("pointerdown", { clientX: 1000 });
    strip.fire("pointermove", { clientX: 950 });
    strip.fire("pointerup", { clientX: 950 });
    expect(kept).toEqual([290]);
    // The rows show again.
    sizer.size();
    expect(width()).toBe("290px");
    expect(prefs.width).toBe(290);
  });

  test("stops at the least and the most", () => {
    const { strip, width } = rig();
    strip.fire("pointerdown", { clientX: 1000 });
    strip.fire("pointermove", { clientX: 1500 });
    expect(width()).toBe("240px");
    strip.fire("pointermove", { clientX: -500 });
    expect(width()).toBe("720px");
    strip.fire("pointerup");
  });

  test("on the left it is the panel's right edge, and a drag to the right is wider", () => {
    const { strip, width } = rig({ side: "left" }, { width: 340 });
    strip.fire("pointerdown", { clientX: 361 });
    strip.fire("pointermove", { clientX: 421 });
    expect(width()).toBe("400px");
    strip.fire("pointerup");
  });

  test("a press that never moves keeps nothing, and neither does another button or pointer", () => {
    const { strip, kept, widths } = rig();
    const before = widths.length;
    strip.fire("pointerdown", { clientX: 1000 });
    strip.fire("pointermove", { clientX: 900, pointerId: 2 });
    strip.fire("pointerup", { pointerId: 2 });
    expect(strip.captured).toBe(1);
    strip.fire("pointerup", { clientX: 1000 });
    strip.fire("pointerdown", { clientX: 1000, button: 2 });
    expect(strip.captured).toBeNull();
    expect(kept).toEqual([]);
    expect(widths.length).toBe(before);
  });

  test("a drag the browser or the window takes away goes back to the width that is kept", () => {
    for (const how of ["pointercancel", "lostpointercapture", "cancel"]) {
      const { strip, sizer, width, kept, dataset } = rig({}, { width: 340 });
      strip.fire("pointerdown", { clientX: 1000 });
      strip.fire("pointermove", { clientX: 900 });
      expect(width()).toBe("440px");
      if (how === "cancel") sizer.cancel();
      else strip.fire(how);
      expect(width()).toBe("340px");
      expect(kept).toEqual([]);
      expect(dataset.sizing).toBeUndefined();
      // The capture the end let go of finds no drag.
      strip.fire("lostpointercapture");
      strip.fire("pointerup");
      expect(kept).toEqual([]);
    }
  });

  test("a double click puts the width back to its default", () => {
    const { strip, kept, width } = rig({}, { width: 520 });
    strip.fire("dblclick");
    expect(kept).toEqual([320]);
    expect(width()).toBe("320px");
  });

  test("the arrows change the width by 16, Home and End go to the limits, and each is kept", () => {
    const { strip, kept, width } = rig({}, { width: 340 });
    expect(strip.fire("keydown", { key: "ArrowLeft" })).toBe(true);
    expect(strip.fire("keydown", { key: "ArrowLeft" })).toBe(true);
    expect(strip.fire("keydown", { key: "ArrowRight" })).toBe(true);
    expect(kept).toEqual([356, 372, 356]);
    strip.fire("keydown", { key: "Home" });
    expect(width()).toBe("240px");
    strip.fire("keydown", { key: "End" });
    expect(width()).toBe("720px");
  });

  test("the keys glide the panel, which the frame follows", () => {
    const { strip, sized } = rig();
    strip.fire("keydown", { key: "ArrowLeft" });
    expect(sized).toEqual([{ glide: true, host: "277px" }]);
  });

  test("leaves every other key, and one with a modifier, to the panel", () => {
    const { strip, kept } = rig();
    expect(strip.fire("keydown", { key: "a" })).toBe(false);
    expect(strip.fire("keydown", { key: "Escape" })).toBe(false);
    expect(strip.fire("keydown", { key: "ArrowLeft", metaKey: true })).toBe(false);
    expect(strip.fire("keydown", { key: "ArrowLeft", altKey: true })).toBe(false);
    expect(kept).toEqual([]);
  });

  test("the keys start from the width that shows, in a window that holds a kept one narrower", () => {
    const { strip, kept } = rig({ view: 700 }, { width: 680 });
    strip.fire("keydown", { key: "ArrowRight" });
    expect(kept).toEqual([604 - 16]);
  });
});
