import { describe, expect, test } from "bun:test";
import { animated, animationPins, cssName, hostPins, lineTop, phasePins, stillPins } from "../src/engine/shotpins";

/** A computed style: each property by its css name, and its plain fields. */
function styleOf(values: Record<string, string>, fields: Record<string, string> = {}): CSSStyleDeclaration {
  return { ...fields, getPropertyValue: (name: string) => values[name] ?? "" } as unknown as CSSStyleDeclaration;
}

/** A script's animation on `target`, or on its pseudo-element, through `frames`. */
function scripted(target: object, frames: Record<string, unknown>[], pseudoElement: string | null = null): Animation {
  return { currentTime: 300, effect: { target, pseudoElement, getKeyframes: () => frames, getTiming: () => ({ delay: 0 }) } } as unknown as Animation;
}

/** A css animation named `name` on `target`, `time` ms into its document's clock, `delay` ms late. */
function css(target: object, name: string, time: number | object, delay = 0): Animation {
  return { animationName: name, currentTime: time, effect: { target, pseudoElement: null, getKeyframes: () => [{ opacity: "0" }], getTiming: () => ({ delay }) } } as unknown as Animation;
}

describe("cssName", () => {
  test("names a property as css does, a variable as it is", () => {
    expect(cssName("backgroundColor")).toBe("background-color");
    expect(cssName("opacity")).toBe("opacity");
    expect(cssName("cssFloat")).toBe("float");
    expect(cssName("--spin")).toBe("--spin");
  });
});

describe("animated", () => {
  test("tells a css animation by where the copy starts it, and what a script runs by the properties it sets", () => {
    const card = {};
    const dot = {};
    const doc = {
      getAnimations: () => [
        css(card, "rise", 900, 200),
        scripted(card, [{ offset: 0, easing: "ease", composite: "auto", computedOffset: 0, marginTop: "0px" }, { offset: 1, marginTop: "40px" }]),
        scripted(dot, [{ opacity: "0" }], "::before"),
      ],
    } as unknown as Document;
    const found = animated(doc);
    expect([...found.keys()]).toEqual([card as Element]);
    const moving = found.get(card as Element);
    expect([...(moving?.phases ?? [])]).toEqual([["rise", -700]]);
    expect([...(moving?.pinned ?? [])]).toEqual(["margin-top"]);
  });

  test("pins what a css animation that follows a scroll sets, as the copy has no scroll to follow", () => {
    const bar = {};
    const found = animated({ getAnimations: () => [css(bar, "grow", { value: 40, unit: "percent" })] } as unknown as Document);
    expect([...(found.get(bar as Element)?.pinned ?? [])]).toEqual(["opacity"]);
    expect(found.get(bar as Element)?.phases.size).toBe(0);
  });

  test("finds none where the document cannot tell its animations", () => {
    expect(animated({} as Document).size).toBe(0);
    expect(
      animated({
        getAnimations: () => {
          throw new Error("no");
        },
      } as unknown as Document).size,
    ).toBe(0);
  });
});

describe("animationPins", () => {
  test("pins each property at what it computes now, over the copy's rules", () => {
    const style = styleOf({ opacity: "0.4", transform: "matrix(1, 0, 0, 1, 0, 3)", "margin-top": "" });
    expect(animationPins(style, ["opacity", "transform", "margin-top"])).toBe(";opacity:0.4 !important;transform:matrix(1, 0, 0, 1, 0, 3) !important");
  });
});

describe("phasePins", () => {
  test("starts each animation where the page has it, and one the page has no more past its end, so none runs again", () => {
    const style = styleOf({}, { animationName: "rise, fade" });
    expect(phasePins(style, new Map([["rise", -700]]))).toBe(";animation-delay:-700ms, -1000000000ms !important");
    expect(phasePins(styleOf({}, { animationName: "fade" }), undefined)).toBe(";animation-delay:-1000000000ms !important");
  });

  test("sets nothing on an element with no animation", () => {
    expect(phasePins(styleOf({}, { animationName: "none" }), undefined)).toBe("");
    expect(phasePins(styleOf({}), undefined)).toBe("");
  });
});

describe("hostPins", () => {
  test("pins the display, size and line of an element whose shadow root lays it out", () => {
    expect(hostPins(styleOf({}, { display: "inline-block", width: "17.6458px", height: "21px", fontSize: "13px", lineHeight: "13px" }))).toBe(
      ";display:inline-block !important;width:17.6458px !important;height:21px !important;font-size:13px !important;line-height:13px !important",
    );
  });

  test("leaves one laid out inline, or with no box, as it is", () => {
    for (const display of ["inline", "contents", "none"]) expect(hostPins(styleOf({}, { display, width: "10px", height: "10px" }))).toBe("");
  });
});

describe("lineTop", () => {
  /** A host `top` and `height` into a parent as tall as `line`. */
  const host = (top: number, height: number, line: number) =>
    ({
      getBoundingClientRect: () => ({ top, height }),
      parentElement: { getBoundingClientRect: () => ({ top: 0, height: line }) },
    }) as unknown as Element;

  test("sits an inline host that fills its parent's line at the line's top, as no baseline of its shadow is in the copy", () => {
    expect(lineTop(host(0, 21, 21), styleOf({}, { display: "inline-block" }))).toBe(";vertical-align:top !important");
  });

  test("leaves one that does not fill its line, or is no inline box, as it is", () => {
    expect(lineTop(host(4, 13, 21), styleOf({}, { display: "inline-block" }))).toBe("");
    expect(lineTop(host(0, 21, 21), styleOf({}, { display: "block" }))).toBe("");
  });
});

describe("stillPins", () => {
  test("starts each css animation where it is, pins what a script sets and the box of a shadow host, and leaves the rest", () => {
    const card = { shadowRoot: null };
    const host = { shadowRoot: {} };
    const plain = { shadowRoot: null };
    const styles = new Map<object, CSSStyleDeclaration>([
      [card, styleOf({ "margin-top": "40px" }, { animationName: "rise" })],
      [host, styleOf({}, { display: "block", width: "100px", height: "48px", animationName: "none" })],
      [plain, styleOf({}, { animationName: "none" })],
    ]);
    const doc = { getAnimations: () => [css(card, "rise", 500), scripted(card, [{ marginTop: "40px" }])] } as unknown as Document;
    const view = { getComputedStyle: (node: object) => styles.get(node) } as unknown as Window;
    const pins = stillPins(doc, view);
    expect(pins(card as unknown as Element)).toBe(";animation-delay:-500ms !important;margin-top:40px !important");
    expect(pins(host as unknown as Element)).toBe(";display:block !important;width:100px !important;height:48px !important");
    expect(pins(plain as unknown as Element)).toBeNull();
  });
});
