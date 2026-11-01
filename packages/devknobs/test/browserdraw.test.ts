import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createBrowser, readLook, screenFill, seamRects } from "../src/engine/browserdraw";
import type { Look } from "../src/engine/browserkit";
import { MORPH } from "../src/engine/browserkit";
import { BARS_DOWN, barsOf, type Screen, viewportOf } from "../src/engine/browserui";
import { screenOf } from "../src/engine/devices";

const PRO = screenOf("iphone-17-pro") as Screen;
const WHITE = "rgb(255, 255, 255)";
const BLUE = "rgb(30, 91, 215)";
const RED = "rgb(224, 24, 45)";
const GREEN = "rgb(19, 165, 56)";
const DARK = "rgb(17, 17, 17)";

/** A node of the frame's page: its computed style, its parent and its box in the viewport. */
interface PageNode {
  style: { backgroundColor: string; position: string; colorScheme?: string };
  parentElement: PageNode | null;
  box: { top: number; bottom: number };
  getBoundingClientRect(): { top: number; bottom: number };
}

function node(backgroundColor: string, parent: PageNode | null, position = "static", box = { top: 0, bottom: 0 }): PageNode {
  return {
    style: { backgroundColor, position },
    parentElement: parent,
    box,
    getBoundingClientRect: () => box,
  };
}

/**
 * The frame's page: an html and a body, and what lies at each height of the
 * viewport, top first. `at` reads what is at `y`.
 */
function page(height: number, at: (y: number) => PageNode[], body = BLUE, scrollHeight?: number) {
  const html = Object.assign(node(body, null), scrollHeight === undefined ? {} : { scrollHeight });
  const bodyNode = node(body, html);
  const scroll: (() => void)[] = [];
  const doc = {
    documentElement: html,
    body: bodyNode,
    elementFromPoint: (_x: number, y: number) => at(y)[0] ?? null,
    elementsFromPoint: (_x: number, y: number) => [...at(y), bodyNode, html],
  };
  const view = {
    innerWidth: 402,
    innerHeight: height,
    scrollY: 0,
    location: { host: "127.0.0.1:8765", href: "http://127.0.0.1:8765/" },
    history: { length: 1 },
    getComputedStyle: (target: PageNode) => target.style,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: (type: string, listener: () => void) => {
      if (type === "scroll") scroll.push(listener);
    },
    removeEventListener: () => {},
  };
  const frame = { contentWindow: view, contentDocument: doc, style: { background: "" } };
  return { frame: frame as unknown as HTMLIFrameElement, html, body: bodyNode, view, doc, scroll };
}

/** A blue page with a fixed red header 100 tall and, if asked, a fixed green footer 100 tall. */
function headerPage(height: number, footer: boolean) {
  let built: ReturnType<typeof page> | null = null;
  const parts: { header?: PageNode; footer?: PageNode } = {};
  built = page(height, (y) => {
    if (y < 100 && parts.header) return [parts.header];
    if (footer && y >= height - 100 && parts.footer) return [parts.footer];
    return [];
  });
  parts.header = node(RED, built.body, "fixed", { top: 0, bottom: 100 });
  parts.footer = node(GREEN, built.body, "fixed", { top: height - 100, bottom: height });
  return built;
}

describe("readLook", () => {
  test("a fixed bar across the top and the bottom gives the strip and the fill under the frame", () => {
    const { frame } = headerPage(714, true);
    const look = readLook(frame);
    expect(look.background).toBe(BLUE);
    expect(look.top).toBe(RED);
    expect(look.bottom).toBe(GREEN);
  });

  test("with no fixed bar at the bottom, the fill is the content at the page's bottom edge", () => {
    const dark = page(714, () => []);
    const wrapper = node(DARK, dark.body);
    Object.assign(dark.doc, {
      elementFromPoint: () => wrapper,
      elementsFromPoint: () => [wrapper, dark.body, dark.html],
    });
    dark.html.style.backgroundColor = WHITE;
    dark.body.style.backgroundColor = WHITE;
    const look = readLook(dark.frame);
    expect(look.background).toBe(WHITE);
    // The wrapper is not fixed: the strip keeps the body's color.
    expect(look.top).toBe(WHITE);
    expect(look.bottom).toBe(DARK);
  });

  test("a translucent bar or section shows what is under it", () => {
    const built = page(714, (y) => (y < 100 ? [veil] : y > 600 ? [glaze, wrapper] : []));
    const veil = node("rgba(224, 24, 45, 0.6)", built.body, "fixed", { top: 0, bottom: 100 });
    const wrapper = node(DARK, built.body);
    const glaze = node("rgba(255, 255, 255, 0.5)", wrapper);
    const look = readLook(built.frame);
    // 0.6 of red over the blue page, and half white over the dark wrapper.
    expect(look.top).toBe("rgb(146, 51, 113)");
    expect(look.bottom).toBe("rgb(136, 136, 136)");
  });

  test("a bar that does not touch the edge does not count", () => {
    const built = page(714, (y) => (y < 100 ? [floating] : []));
    const floating = node(RED, built.body, "fixed", { top: 20, bottom: 100 });
    expect(readLook(built.frame).top).toBe(BLUE);
  });

  test("samples above the page read the strip, below it the fill, inside it the content", () => {
    const { frame } = headerPage(714, true);
    const probe = {
      page: { x: 0, y: 62, width: 402, height: 714 },
      points: [
        { x: 201, y: 30 },
        { x: 201, y: 63 },
        { x: 201, y: 400 },
        { x: 201, y: 816 },
      ],
    };
    const colors = readLook(frame, probe).under.map((sample) => sample.color);
    expect(colors).toEqual([RED, RED, BLUE, GREEN]);
  });

  test("samples beside the page, in the Duo cover's column, read the page's own color", () => {
    const { frame } = headerPage(580, true);
    const probe = {
      page: { x: 0, y: 0, width: 382, height: 580 },
      points: [
        { x: 419.5, y: 50 },
        { x: 419.5, y: 622 },
        { x: 191, y: 622 },
      ],
    };
    const colors = readLook(frame, probe).under.map((sample) => sample.color);
    expect(colors).toEqual([BLUE, BLUE, GREEN]);
    const across = { ...probe, page: { x: 84, y: 0, width: 594, height: 368 }, points: [{ x: 46.5, y: 50 }] };
    expect(readLook(frame, across).under.map((sample) => sample.color)).toEqual([BLUE]);
  });
});

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

describe("screenFill", () => {
  const expanded = barsOf(PRO, "portrait", "compact", false, true);
  const minimized = barsOf(PRO, "portrait", "compact", true, true);
  const pageOf = (mini: boolean) => viewportOf(PRO, "portrait", "compact", mini, true);
  if (!expanded || !minimized) throw new Error("no bars");

  test("one color where the strip, the page and the fill are all the page's", () => {
    expect(screenFill(look(), expanded, pageOf(false), 874)).toBe(WHITE);
  });

  test("the strip over the page and the fill under it, split at the page's edges", () => {
    const fill = screenFill(look({ top: RED, background: BLUE, bottom: GREEN }), expanded, pageOf(false), 874);
    const top = (62 / 874) * 100;
    const end = (776 / 874) * 100;
    expect(fill).toBe(
      `linear-gradient(to bottom, ${RED} ${top}%, ${BLUE} ${top}%, ${BLUE} ${end}%, ${GREEN} ${end}%)`,
    );
  });

  test("minimized, the strip shows the content at the page's top, unless a bar holds the top", () => {
    const under = [{ x: 201, y: 63, color: DARK }];
    const free = screenFill(look({ under }), minimized, pageOf(true), 874);
    expect(free.startsWith(`linear-gradient(to bottom, ${DARK} `)).toBe(true);
    const held = screenFill(look({ under, top: RED }), minimized, pageOf(true), 874);
    expect(held.startsWith(`linear-gradient(to bottom, ${RED} `)).toBe(true);
    // Expanded, the strip is the page's even over dark content.
    expect(screenFill(look({ under }), expanded, pageOf(false), 874)).toBe(WHITE);
  });

  test("turned across, or with no page, the page's color fills it all", () => {
    const across = barsOf(PRO, "landscape", "compact", false, true);
    if (!across) throw new Error("no bars");
    expect(screenFill(look({ top: RED }), across, pageOf(false), 402)).toBe(WHITE);
    expect(screenFill(look({ top: RED }), expanded, null, 874)).toBe(WHITE);
  });

  test("on the Duo's cover screen, the column takes the page's color all the way down, over the fill under the page", () => {
    const cover = screenOf("iphone-duo-closed") as Screen;
    const bars = barsOf(cover, "portrait", "compact", false);
    const at = viewportOf(cover, "portrait", "compact", false);
    if (!bars) throw new Error("no bars");
    const fill = screenFill(look({ top: RED, background: BLUE, bottom: GREEN }), bars, at, 678);
    const right = (at.width / 466) * 100;
    const end = (at.height / 678) * 100;
    expect(fill).toBe(
      `linear-gradient(to right, ${BLUE} 0%, transparent 0%, transparent ${right}%, ${BLUE} ${right}%), ` +
        `linear-gradient(to bottom, ${RED} 0%, ${BLUE} 0%, ${BLUE} ${end}%, ${GREEN} ${end}%)`,
    );
  });

  test("held across, the Duo's cover keeps the strip's color over its page, with no status", () => {
    const cover = screenOf("iphone-duo-closed") as Screen;
    const bars = barsOf(cover, "landscape", "compact", false);
    const at = viewportOf(cover, "landscape", "compact", false);
    if (!bars) throw new Error("no bars");
    const start = (80 / 466) * 100;
    expect(screenFill(look({ top: RED, background: BLUE, bottom: GREEN }), bars, at, 466)).toBe(
      `linear-gradient(to bottom, ${RED} ${start}%, ${BLUE} ${start}%, ${BLUE} 100%, ${GREEN} 100%)`,
    );
  });
});

/** Just enough of an element for the bars to be built and placed. */
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
  readonly classList = {
    add: () => {},
    toggle: () => {},
    contains: () => false,
  };

  setAttribute(): void {}
  removeAttribute(): void {}
  addEventListener(): void {}
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.children.push(...nodes);
  }
  remove(): void {}
  querySelectorAll(): FakeElement[] {
    return [];
  }
  getAnimations(): never[] {
    return [];
  }
}

interface Timer {
  id: number;
  delay: number;
  run: () => void;
}

let timers: Timer[];
/** The animation frames asked for and not yet run or cancelled, by id. */
let frames: Map<number, () => void>;
let cleared: number[];
let clearSpy: { mockRestore(): void } | null = null;
const saved = { window: globalThis.window, document: globalThis.document };

beforeEach(() => {
  timers = [];
  frames = new Map();
  cleared = [];
  let next = 1;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: (run: () => void, delay: number) => {
        const id = next++;
        timers.push({ id, delay, run });
        return id;
      },
      requestAnimationFrame: (run: () => void) => {
        const id = next++;
        frames.set(id, run);
        return id;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => (tag === "canvas" ? { getContext: () => null } : new FakeElement()),
      createElementNS: () => new FakeElement(),
    },
  });
  clearSpy = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) => {
    cleared.push(id);
    timers = timers.filter((timer) => timer.id !== id);
  }) as typeof clearTimeout);
});

afterEach(() => {
  clearSpy?.mockRestore();
  Object.defineProperty(globalThis, "window", { configurable: true, value: saved.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: saved.document });
});

/** The bars over a page that changes color as it scrolls, the frame's box each time it is given one. */
function browserOver(color: () => string, scrollHeight?: number) {
  const built = page(754, () => [], BLUE, scrollHeight);
  const section = node(BLUE, built.body);
  Object.assign(built.doc, {
    elementsFromPoint: () => [Object.assign(section, { style: { ...section.style, backgroundColor: color() } })],
  });
  const sized: number[] = [];
  const glass = new FakeElement();
  const browser = createBrowser(glass as unknown as HTMLElement, built.frame, () => {});
  const show = (
    minimized: boolean,
    platform: "iphone-17-pro" | "pixel-10" = "iphone-17-pro",
    layout: "compact" | "top" = platform === "pixel-10" ? "top" : "compact",
  ) => {
    const screen = screenOf(platform) as Screen;
    const box = viewportOf(screen, "portrait", layout, minimized, true);
    browser.show({
      bars: barsOf(screen, "portrait", layout, minimized, true),
      page: box,
      size: { width: screen.width, height: screen.height },
      zoom: 1,
      follow: true,
      sizeFrame: () => {
        built.view.innerHeight = box.height;
        sized.push(box.height);
      },
    });
  };
  const scroll = () => {
    for (const listener of built.scroll) listener();
    const pending = [...frames.values()];
    frames.clear();
    for (const run of pending) run();
  };
  return { browser, show, scroll, sized, glass, view: built.view, frame: built.frame };
}

const shrinks = () => timers.filter((timer) => timer.delay === MORPH.expand);

/** A page `tall` px long whose scrollBy clamps as a browser's does, and the moves asked of it. */
function scrollable(view: { scrollY: number; innerHeight: number }, tall = 5000) {
  const scrolled: number[] = [];
  Object.assign(view, {
    scrollBy: ({ top }: { top: number }) => {
      scrolled.push(top);
      view.scrollY = Math.min(Math.max(0, view.scrollY + top), Math.max(0, tall - view.innerHeight));
    },
  });
  return scrolled;
}

describe("createBrowser", () => {
  test("a page changing color under the glass leaves a pending shrink to land", () => {
    let color = BLUE;
    const { browser, show, scroll, sized } = browserOver(() => color);
    show(true);
    expect(sized.at(-1)).toBe(754);
    show(false);
    // The bars come back: the frame waits for them before it shrinks.
    expect(sized.at(-1)).toBe(754);
    const [pending] = shrinks();
    expect(pending).toBeDefined();
    for (const next of [RED, GREEN, DARK]) {
      color = next;
      scroll();
    }
    browser.refresh();
    expect(browser.look()?.under.some((sample) => sample.color === DARK)).toBe(true);
    // The same wait is still there, never restarted.
    expect(shrinks()).toEqual(pending ? [pending] : []);
    expect(cleared).not.toContain(pending?.id);
    pending?.run();
    expect(sized.at(-1)).toBe(714);
  });

  test("a scroll repaints only for a change, and never while a page loads or under Chrome", () => {
    let color = BLUE;
    const { browser, show, scroll, glass } = browserOver(() => color);
    show(false);
    const first = browser.look();
    scroll();
    expect(browser.look()).toBe(first);
    color = RED;
    browser.startLoading(null);
    scroll();
    expect(browser.look()).toBe(first);
    browser.stopLoading();
    // Done loading, nothing waits for the page to paint any more.
    expect(frames.size).toBe(0);
    const loaded = browser.look();
    color = GREEN;
    scroll();
    expect(browser.look()).not.toBe(loaded);
    expect(glass.style.background).toBeDefined();
    show(false, "pixel-10");
    const chrome = browser.look();
    color = DARK;
    scroll();
    expect(browser.look()).toBe(chrome);
  });

  test("top bars that minimize or expand move the frame at once and scroll the page as far, so it stays put", () => {
    const { show, view } = browserOver(() => BLUE);
    view.scrollY = 300;
    const scrolled = scrollable(view);
    const top = (minimized: boolean) => viewportOf(PRO, "portrait", "top", minimized, true).y;
    show(false, "iphone-17-pro", "top");
    expect(scrolled).toEqual([]);
    show(true, "iphone-17-pro", "top");
    // Minimized, the frame grows up at once, and the page scrolls up as far.
    expect(scrolled).toEqual([top(true) - top(false)]);
    expect(scrolled[0]).toBeLessThan(0);
    // Back out, the frame takes its box at once, with no wait for the bars, and the page scrolls down as far.
    show(false, "iphone-17-pro", "top");
    expect(shrinks()).toEqual([]);
    expect(scrolled.at(-1)).toBe(top(false) - top(true));
    // At the top of the page too: the content never moves, even with the page's start under the bars.
    show(true, "iphone-17-pro", "top");
    view.scrollY = 0;
    show(false, "iphone-17-pro", "top");
    expect(scrolled.at(-1)).toBe(top(false) - top(true));
  });

  test("a new page that comes in under minimized top bars starts at its own place", () => {
    const { browser, show, view, frame } = browserOver(() => BLUE);
    view.scrollY = 300;
    const scrolled = scrollable(view);
    show(false, "iphone-17-pro", "top");
    // The page is read once it is in.
    browser.refresh();
    show(true, "iphone-17-pro", "top");
    const before = scrolled.length;
    // A link: a new document at its top, and the bars come back for it.
    Object.assign(frame, { contentDocument: { ...frame.contentDocument } });
    view.location.href = "http://127.0.0.1:8765/next";
    view.scrollY = 0;
    browser.refresh();
    show(false, "iphone-17-pro", "top");
    expect(scrolled.length).toBe(before);
    expect(view.scrollY).toBe(0);
  });

  test("a new address the page gives itself under minimized top bars still keeps its content in place", () => {
    const { browser, show, view } = browserOver(() => BLUE);
    view.scrollY = 300;
    const scrolled = scrollable(view);
    show(false, "iphone-17-pro", "top");
    // The page is read once it is in.
    browser.refresh();
    show(true, "iphone-17-pro", "top");
    // A hash the page writes as it scrolls: the same document, so the bars coming back scroll it with them.
    view.location.href = "http://127.0.0.1:8765/#part";
    browser.refresh();
    show(false, "iphone-17-pro", "top");
    const top = (minimized: boolean) => viewportOf(PRO, "portrait", "top", minimized, true).y;
    expect(scrolled.at(-1)).toBe(top(false) - top(true));
  });

  test("a page too short to scroll back by the room once the frame grows keeps its top bars", () => {
    const top = (minimized: boolean) => viewportOf(PRO, "portrait", "top", minimized, true);
    const room = top(false).y - top(true).y;
    const grow = top(true).height - top(false).height;
    const end = 2 * room + BARS_DOWN;
    const run = (rest: number) => {
      const full = top(false).height;
      const { browser, show, scroll, view } = browserOver(() => BLUE, full + grow + rest);
      let now = 0;
      const clock = spyOn(performance, "now").mockImplementation(() => now);
      show(false, "iphone-17-pro", "top");
      view.innerHeight = full;
      browser.refresh();
      // Down to the page's end, well after the first resize's lock.
      now += 1000;
      view.scrollY = Math.min(end, rest + grow);
      scroll();
      const minimized = browser.minimized();
      clock.mockRestore();
      return minimized;
    };
    expect(run(end - 1)).toBe(false);
    expect(run(end)).toBe(true);
  });

  test("Chrome's top toolbar comes back and goes by the same points as Safari's top bars", () => {
    const { browser, show, scroll, view } = browserOver(() => BLUE);
    const pixel = screenOf("pixel-10") as Screen;
    const [full, mini] = [false, true].map((minimized) => viewportOf(pixel, "portrait", "top", minimized, true));
    const room = (full?.y ?? 0) - (mini?.y ?? 0);
    expect(room).toBeGreaterThan(0);
    let now = 0;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    show(false, "pixel-10", "top");
    // Reading the page starts listening to its scroll.
    browser.refresh();
    // Each scroll comes well after the last resize's lock.
    const to = (y: number) => {
      now += 1000;
      view.scrollY = y;
      scroll();
    };
    to(2 * room + BARS_DOWN - 1);
    expect(browser.minimized()).toBe(false);
    to(2 * room + BARS_DOWN);
    expect(browser.minimized()).toBe(true);
    // The frame grows up for it, and the page scrolls up by the room, which counts from there.
    const scrolled = scrollable(view);
    show(true, "pixel-10", "top");
    expect(scrolled).toEqual([-room]);
    // Its own scroll comes while the resize settles.
    scroll();
    // Up toward the top: back while the page is still the toolbar's room from it.
    to(room + 2);
    expect(browser.minimized()).toBe(true);
    to(room + 1);
    expect(browser.minimized()).toBe(false);
    clock.mockRestore();
  });

  test("bars at the bottom never scroll the page, as its top stays", () => {
    const { show, view } = browserOver(() => BLUE);
    const scrolled = scrollable(view);
    show(false);
    show(true);
    show(false);
    for (const timer of shrinks()) timer.run();
    expect(scrolled).toEqual([]);
  });
});

describe("seamRects", () => {
  const page = { x: 0, y: 100, width: 400, height: 600 };

  test("spans each edge a fixed bar holds, 2 device px on each side, at the frame's zoom", () => {
    const unit = 1 / (2 * 0.8);
    const { top, bottom } = seamRects(page, 1.25, unit, { header: true, footer: true });
    expect(top).toEqual({ x: 0, y: 125 - 2 * unit, width: 500, height: 4 * unit });
    expect(bottom).toEqual({ x: 0, y: 875 - 2 * unit, width: 500, height: 4 * unit });
  });

  test("leaves an edge no bar holds, and a frame that fills the screen, alone", () => {
    expect(seamRects(page, 1, 0.5, { header: false, footer: true }).top).toBeNull();
    expect(seamRects(page, 1, 0.5, { header: true, footer: false }).bottom).toBeNull();
    expect(seamRects(null, 1, 0.5, { header: true, footer: true })).toEqual({ top: null, bottom: null });
  });
});
