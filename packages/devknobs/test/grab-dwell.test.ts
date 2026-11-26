import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DWELL, SLOW, settles, speedOf } from "../src/grab/dwell";
import { type Mode, type ModePage, startMode } from "../src/grab/mode";
import type { Overlay } from "../src/grab/overlay";
import type { PageRect } from "../src/grab/rect";
import type { Tray, TrayOptions } from "../src/grab/tray";
import type { GrabEntry } from "../src/grab/types";
import { as, type FakeElement, node } from "./grab-tree";

describe("settles", () => {
  const fast = 4 * SLOW;

  test("the first box is up at once, however fast the pointer goes", () => {
    expect(settles({ boxed: false, held: 0, speed: fast })).toBe(true);
  });

  test("a slow pointer takes the box with it at once", () => {
    expect(settles({ boxed: true, held: 0, speed: 0 })).toBe(true);
    expect(settles({ boxed: true, held: 0, speed: SLOW / 2 })).toBe(true);
  });

  test("a fast pointer leaves the box where it is", () => {
    expect(settles({ boxed: true, held: 0, speed: SLOW })).toBe(false);
    expect(settles({ boxed: true, held: DWELL - 1, speed: fast })).toBe(false);
  });

  test("a fast pointer that stays on one element takes the box there", () => {
    expect(settles({ boxed: true, held: DWELL, speed: fast })).toBe(true);
  });
});

describe("speedOf", () => {
  test("is the way gone over the time it took", () => {
    expect(speedOf({ x: 0, y: 0 }, { x: 30, y: 40 }, 100)).toBe(0.5);
    expect(speedOf({ x: 5, y: 5 }, { x: 5, y: 5 }, 32)).toBe(0);
  });

  test("takes no time at all as a millisecond", () => {
    expect(speedOf({ x: 0, y: 0 }, { x: 3, y: 0 }, 0)).toBe(3);
  });
});

/** A row of three under one parent, each 100 px wide: A, B and C from the left. */
let a: FakeElement;
let b: FakeElement;
let c: FakeElement;
let row: FakeElement;
/** The elements along the x axis, as the page is laid out now. */
let laid: FakeElement[];
/** Every element the overlay was told to box, with the tag on its label and the gathered ones. */
let draws: { element: Element | null; tag: string; picked: Element[] }[];
let toasts: (Element | null)[];
let warmed: Element[];
let copies: string[][];
/** The text of each copy. */
let texts: string[];
/** Each drag rectangle the overlay was told to draw, null where it was taken away. */
let marquees: (PageRect | null)[];
let exits: number;
let mode: Mode | null = null;

/** A tray as the mode sees it: what it lists, the notes typed in it, and where the focus went. */
interface FakeTray {
  options: TrayOptions;
  items: string[];
  each: string[];
  all: string;
  focused: (number | null)[];
  destroyed: boolean;
}
let trays: FakeTray[];
/** An element the fake tray holds, for keys typed in the tray. */
const inTray = {} as EventTarget;

function tray(): FakeTray | undefined {
  return trays[trays.length - 1];
}

function createTray(options: TrayOptions): Tray {
  const fake: FakeTray = { options, items: [], each: [], all: "", focused: [], destroyed: false };
  trays.push(fake);
  return {
    node: {} as HTMLElement,
    update: (items) => {
      fake.items = items.map((item) => item.label.tag);
    },
    remove: (index) => {
      fake.each = fake.each.filter((_, at) => at !== index);
      options.onRemove(index);
    },
    notes: () => ({ each: fake.each, all: fake.all }),
    focusNote: (index) => fake.focused.push(index),
    contains: (target) => target === inTray,
    destroy: () => {
      fake.destroyed = true;
    },
  };
}

function entryOf(element: Element): GrabEntry {
  const tagName = element.tagName.toLowerCase();
  return { tagName, content: tagName, selector: tagName, source: null, stackContext: "", frames: [] };
}

const overlay: Overlay = {
  draw: (element, label, picked) => draws.push({ element, tag: label.tag, picked }),
  point: () => undefined,
  toast: (_text, near) => toasts.push(near),
  marquee: (rect) => marquees.push(rect),
  mount: () => undefined,
  destroy: () => undefined,
};

const page: ModePage = {
  componentOf: () => null,
  copyGrab: async (payload) => {
    copies.push(payload.entries.map((entry) => entry.tagName));
    texts.push(payload.content);
    return true;
  },
  createOverlay: () => overlay,
  createTray,
  // Each element is 100 px wide from the left, and the whole of it must be in the drag.
  elementsInRect: (_doc, rect) =>
    laid.filter((_, index) => rect.left <= index * 100 && rect.right >= index * 100 + 100).map(as),
  grabEntry: async (element) => {
    warmed.push(element);
    return entryOf(element);
  },
  grabTargetAt: (_root, x) => {
    const element = laid[Math.floor(x / 100)];
    return element ? as(element) : null;
  },
  quickEntry: entryOf,
};

/** The element the box is on, as the overlay was last told. */
function boxed(): Element | null {
  return draws[draws.length - 1]?.element ?? null;
}

function shown(): (Element | null)[] {
  return draws.map((draw) => draw.element);
}

function start(x: number): void {
  mode = startMode({ pointer: { x, y: 10 }, heldKey: () => false, onExit: () => exits++ }, page);
}

function move(x: number): void {
  const event = Object.assign(new Event("pointermove"), {
    isPrimary: true,
    clientX: x,
    clientY: 10,
  });
  window.dispatchEvent(event);
}

function click(x: number, shiftKey = false): void {
  const event = Object.assign(new MouseEvent("click", { cancelable: true }), {
    clientX: x,
    clientY: 10,
    shiftKey,
  });
  window.dispatchEvent(event);
}

function pointer(type: string, x: number): void {
  const event = Object.assign(new Event(type, { cancelable: true }), {
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: 10,
  });
  window.dispatchEvent(event);
}

/** Press at one x, go to the other in steps, let go there, and the click that follows. */
function drag(from: number, to: number): void {
  pointer("pointerdown", from);
  for (let step = 1; step <= 4; step++) {
    wait(40);
    move(from + ((to - from) * step) / 4);
  }
  pointer("pointerup", to);
  click(to);
}

function keyup(key: string): void {
  window.dispatchEvent(Object.assign(new Event("keyup"), { key, code: key }));
}

function press(key: string, shiftKey = false, target: EventTarget | null = null): void {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    composedPath: () => (target ? [target] : []),
    key,
    code: key,
    shiftKey,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
  });
  mode?.keydown(event as unknown as KeyboardEvent);
}

function wait(ms: number): void {
  jest.advanceTimersByTime(ms);
}

/** From the middle of A to the middle of C in two moves, faster than a pointer at rest goes. */
function sweep(): void {
  wait(40);
  move(150);
  wait(16);
  move(250);
}

beforeEach(() => {
  jest.useFakeTimers();
  a = node("a");
  b = node("b");
  c = node("c");
  row = node("section", [a, b, c]);
  node("body", [row]);
  laid = [a, b, c];
  draws = [];
  toasts = [];
  warmed = [];
  copies = [];
  texts = [];
  marquees = [];
  trays = [];
  exits = 0;
  const style = { setAttribute: () => undefined, remove: () => undefined, textContent: "" };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      setTimeout: (run: () => void, delay: number) => setTimeout(run, delay),
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelector: () => null,
      createElement: () => style,
      head: { appendChild: () => undefined },
    },
  });
  for (const name of ["Element", "HTMLElement"]) {
    Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
  }
  Object.defineProperty(globalThis, "MouseEvent", {
    configurable: true,
    value: class extends Event {},
  });
});

afterEach(() => {
  mode?.stop();
  mode = null;
  jest.useRealTimers();
  for (const name of ["window", "document", "Element", "HTMLElement", "MouseEvent"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("grab's box", () => {
  test("is on the element under the pointer as grab turns on", () => {
    start(50);
    expect(shown()).toEqual([as(a)]);
  });

  test("goes straight to where a fast pointer stops, and never to what it passed", () => {
    start(50);
    sweep();
    expect(shown()).toEqual([as(a)]);
    // The pointer stopped on C. The box sets off within 64 ms of its last move.
    wait(64);
    expect(shown()).toEqual([as(a), as(c)]);
    wait(500);
    expect(shown()).toEqual([as(a), as(c)]);
    expect(warmed).not.toContain(as(b));
    expect(warmed).toContain(as(c));
  });

  test("goes with a slow pointer at once", () => {
    start(95);
    wait(40);
    move(98);
    wait(40);
    move(102);
    expect(shown()).toEqual([as(a), as(b)]);
  });

  test("goes to an element a fast pointer stays on", () => {
    start(50);
    wait(40);
    let x = 110;
    move(x);
    for (let time = 16; time < DWELL; time += 16) {
      wait(16);
      move((x += 16));
      expect(boxed()).toBe(as(a));
    }
    wait(16);
    move((x += 16));
    expect(boxed()).toBe(as(b));
  });

  test("always has the label of the element it is on", () => {
    start(50);
    sweep();
    wait(64);
    move(205);
    wait(40);
    move(198);
    wait(40);
    expect(boxed()).toBe(as(b));
    for (const draw of draws) expect(draw.tag).toBe(draw.element?.tagName.toLowerCase() ?? "");
  });

  test("lets go at once where a fast pointer leaves every element", () => {
    start(50);
    wait(40);
    move(150);
    wait(16);
    move(450);
    wait(16);
    expect(shown()).toEqual([as(a), null]);
    wait(500);
    expect(shown()).toEqual([as(a), null]);
  });

  test("takes what a scroll put under a pointer that waits", () => {
    start(50);
    wait(40);
    move(150);
    laid = [a, c, b];
    wait(32);
    expect(shown()).toEqual([as(a), as(c)]);
  });
});

describe("a click or a key while the box waits", () => {
  test("a click copies the element under the pointer, not the one boxed", () => {
    start(50);
    sweep();
    click(250);
    expect(boxed()).toBe(as(c));
    expect(copies).toEqual([["c"]]);
    expect(toasts).toEqual([as(c)]);
    expect(exits).toBe(1);
  });

  test("shift and a click gather the element under the pointer, and the box goes to it", () => {
    start(50);
    sweep();
    click(250, true);
    expect(draws[draws.length - 1]).toEqual({ element: as(c), tag: "c", picked: [as(c)] });
    wait(500);
    expect(boxed()).toBe(as(c));
    expect(shown()).not.toContain(as(b));
  });

  test("enter copies the element under the pointer", () => {
    start(50);
    sweep();
    press("Enter");
    expect(boxed()).toBe(as(c));
    expect(copies).toEqual([["c"]]);
  });

  test("an arrow moves the box from where it is, and the pointer's element is let be", () => {
    start(50);
    wait(40);
    move(150);
    press("ArrowUp");
    expect(shown()).toEqual([as(a), as(row)]);
    wait(500);
    expect(shown()).toEqual([as(a), as(row)]);
  });

  test("grab turned off leaves nothing to run", () => {
    start(50);
    sweep();
    mode?.stop();
    wait(500);
    expect(shown()).toEqual([as(a)]);
    expect(warmed).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});

/** What is gathered, as the overlay was last told. */
function gathered(): Element[] {
  return draws[draws.length - 1]?.picked ?? [];
}

describe("gathering many", () => {
  test("one element with no notes copies its line alone", () => {
    start(50);
    click(50);
    expect(texts).toEqual(["a"]);
  });

  test("letting go of shift copies nothing", () => {
    start(50);
    click(50, true);
    keyup("Shift");
    expect(copies).toEqual([]);
    expect(exits).toBe(0);
    expect(gathered()).toEqual([as(a)]);
  });

  test("a drag gathers what it went around, after what was gathered, and copies nothing", () => {
    start(250);
    click(250, true);
    drag(0, 205);
    expect(gathered()).toEqual([as(c), as(a), as(b)]);
    expect(tray()?.items).toEqual(["c", "a", "b"]);
    expect(copies).toEqual([]);
    expect(exits).toBe(0);
    expect(marquees.length).toBeGreaterThan(1);
    expect(marquees[marquees.length - 1]).toBeNull();
    expect(warmed).toEqual(expect.arrayContaining([as(a), as(b)]));
  });

  test("a drag over gathered elements keeps them as they were", () => {
    start(50);
    click(50, true);
    drag(0, 205);
    expect(gathered()).toEqual([as(a), as(b)]);
  });

  test("the box is not shown while a drag is drawn", () => {
    start(50);
    pointer("pointerdown", 0);
    wait(40);
    move(150);
    expect(boxed()).toBeNull();
    wait(500);
    expect(boxed()).toBeNull();
  });

  test("shift and enter gather the boxed element, and take it back out", () => {
    start(50);
    press("Enter", true);
    expect(gathered()).toEqual([as(a)]);
    expect(tray()?.items).toEqual(["a"]);
    press("Enter", true);
    expect(gathered()).toEqual([]);
    expect(tray()?.destroyed).toBe(true);
    expect(copies).toEqual([]);
  });

  test("backspace takes the boxed element out, and its note with it", () => {
    start(50);
    click(50, true);
    wait(40);
    move(250);
    click(250, true);
    const fake = tray();
    if (fake) fake.each = ["", "for c"];
    press("Backspace");
    expect(gathered()).toEqual([as(a)]);
    expect(fake?.each).toEqual([""]);
    expect(copies).toEqual([]);
  });

  test("a gathered element taken off the page loses its own note, and the others keep theirs", () => {
    start(50);
    click(50, true);
    click(150, true);
    click(250, true);
    const fake = tray();
    expect(fake?.items).toEqual(["a", "b", "c"]);
    if (fake) fake.each = ["for a", "for b", "for c"];
    a.isConnected = false;
    c.isConnected = false;
    wait(40);
    move(150);
    wait(40);
    move(150);
    expect(gathered()).toEqual([as(b)]);
    expect(fake?.items).toEqual(["b"]);
    expect(fake?.each).toEqual(["for b"]);
  });

  test("n writes a note for the boxed element, or for all", () => {
    start(50);
    click(50, true);
    wait(40);
    move(250);
    click(250, true);
    press("n");
    expect(tray()?.focused).toEqual([1]);
    move(150);
    wait(40);
    press("n");
    expect(tray()?.focused).toEqual([1, null]);
  });

  test("a copy carries the notes, numbered", () => {
    start(50);
    click(50, true);
    click(250, true);
    const fake = tray();
    if (fake) {
      fake.each = ["make it blue", " "];
      fake.all = "same spacing";
    }
    press("Enter");
    expect(copies).toEqual([["a", "c"]]);
    expect(texts).toEqual(["1. a\n   Note: make it blue\n2. c\n\nNote: same spacing"]);
    expect(exits).toBe(1);
    expect(fake?.destroyed).toBe(true);
  });

  test("keys pressed in the tray are left to it", () => {
    start(50);
    click(50, true);
    click(250, true);
    const before = draws.length;
    for (const [key, shift] of [
      ["c", false],
      ["Enter", false],
      ["ArrowUp", false],
      ["Backspace", false],
      ["n", false],
      ["Enter", true],
    ] as const) {
      press(key, shift, inTray);
    }
    expect(copies).toEqual([]);
    expect(gathered()).toEqual([as(a), as(c)]);
    expect(draws.length).toBe(before);
    expect(tray()?.focused).toEqual([]);
    expect(exits).toBe(0);
  });

  test("the tray's copy button copies them all", () => {
    start(50);
    click(50, true);
    click(250, true);
    tray()?.options.onCopy();
    expect(copies).toEqual([["a", "c"]]);
  });
});
