import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Hole } from "../src/engine/morph";
import { evenHole, forget, type Scene, start } from "../src/engine/morphrun";

/** A node with just the style a device change writes. */
function node(className: string) {
  const vars = new Map<string, string>();
  const style: Record<string, string> & { setProperty(name: string, value: string): void } = Object.assign(
    Object.create(null) as Record<string, string>,
    { setProperty: (name: string, value: string) => void vars.set(name, value) },
  );
  return { className, style, vars };
}

const SCREEN: Hole = { x: 100, y: 40, width: 300, height: 600, radius: [8, 58, 58, 8] };

describe("a device change from one device to another", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    Reflect.set(globalThis, "window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
      cancelAnimationFrame: () => {},
      matchMedia: () => ({ matches: false }),
    });
    Reflect.set(globalThis, "document", { documentElement: {}, body: null });
    Reflect.set(globalThis, "getComputedStyle", () => ({ backgroundColor: "rgb(255, 255, 255)", colorScheme: "" }));
  });

  afterEach(() => {
    forget();
    for (const name of ["window", "document", "getComputedStyle"]) Reflect.deleteProperty(globalThis, name);
  });

  function scene(scheme: string) {
    const veil = node("veil");
    const back = node("back");
    const value: Scene = {
      back: back as unknown as HTMLElement,
      veil: veil as unknown as HTMLElement,
      content: () => [],
      screenRect: () => SCREEN,
      fullRect: () => ({ x: -1, y: -1, width: 1502, height: 852, radius: [0, 0, 0, 0] }),
      scheme: () => scheme,
      covered: () => true,
      hidePage: () => {},
      painted: () => true,
      layout: () => {},
      release: () => {},
      teardown: () => {},
    };
    return { value, veil, back };
  }

  test("the veil wears the loading cover in the frame's scheme, never the page's white", () => {
    const { value, veil } = scene("dark");
    start(value, "open");
    expect(veil.className).toBe("veil loading");
    expect(veil.style["background"]).toBe("");
    expect(veil.style["colorScheme"]).toBe("dark");
  });

  test("its dot sits in the middle of the mat's opening", () => {
    const { value, veil } = scene("");
    start(value, "open");
    expect(veil.vars.get("--dot-x")).toBe("250px");
    expect(veil.vars.get("--dot-y")).toBe("340px");
  });

  test("the opening keeps every corner as round as the screen's roundest", () => {
    const { value, back } = scene("");
    start(value, "open");
    const radii = [...String(back.style["clipPath"]).matchAll(/A([\d.]+) /g)].map((match) => match[1]);
    expect(radii).toEqual(["58", "58", "58", "58"]);
    expect(evenHole(SCREEN).radius).toEqual([58, 58, 58, 58]);
  });

  test("going to no device, the veil takes the page's color again", () => {
    const { value, veil } = scene("dark");
    start(value, "closed");
    expect(veil.className).toBe("veil");
    expect(veil.style["background"]).toBe("rgb(255, 255, 255)");
  });
});
