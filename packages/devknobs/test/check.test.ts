import { describe, expect, test } from "bun:test";
import { checkPatch } from "../src/engine/check";
import { describe as describeKnobs, type KnobShape } from "../src/engine/describe";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";
import { getState, setState } from "../src/index";

/** Every value a shape lists: its enum, its ends, its keywords and its examples. */
function listed(shape: KnobShape): unknown[] {
  if (shape.type === "enum") return shape.values;
  if (shape.type === "boolean") return [true, false];
  if (shape.type === "number") {
    const ends = [shape.min, shape.max].filter((value) => value !== undefined);
    return [...ends, ...(shape.or ?? [])];
  }
  if (shape.type === "string") return [...(shape.examples ?? []), ...(shape.or ?? [])];
  return [];
}

describe("checkPatch", () => {
  test("takes every value describe lists", () => {
    for (const knob of describeKnobs()) {
      if (knob.value.type !== "object") {
        for (const value of listed(knob.value)) {
          expect(() => checkPatch({ [knob.key]: value })).not.toThrow();
        }
        continue;
      }
      for (const [name, field] of Object.entries(knob.value.fields)) {
        for (const value of listed(field.value)) {
          expect(() => checkPatch({ [knob.key]: { [name]: value } })).not.toThrow();
        }
      }
    }
  });

  test("takes every default describe lists", () => {
    for (const knob of describeKnobs()) {
      expect(() => checkPatch({ [knob.key]: knob.default })).not.toThrow();
    }
  });

  test("takes a value inside the range, any zone and tag Intl knows, and a hex", () => {
    for (const patch of [
      { text: 17.5 },
      { width: 390, height: 844 },
      { timeZone: "America/New_York" },
      { locale: { lang: "pt-BR" } },
      { geo: { preset: "custom", lat: -33.9, lng: 151.2, timeZone: "Australia/Sydney" } },
      { geo: { timeZone: "" } },
      { clock: { mode: "frozen", at: Date.parse("2030-01-01") } },
      { mat: "#abcdef" },
      { ua: { preset: "custom", custom: "Mozilla/5.0" } },
      {},
    ]) {
      expect(() => checkPatch(patch)).not.toThrow();
    }
  });

  test("throws at a bad value, naming the knob and the value", () => {
    const cases: [unknown, string][] = [
      [{ scheme: "purple" }, 'knobs: bad value for scheme: "purple"'],
      [{ text: 500 }, "knobs: bad value for text: 500"],
      [{ width: 99999 }, "knobs: bad value for width: 99999"],
      [{ width: 10 }, "knobs: bad value for width: 10"],
      [{ dpr: 50 }, "knobs: bad value for dpr: 50"],
      [{ timeZone: "Mars/Olympus" }, 'knobs: bad value for timeZone: "Mars/Olympus"'],
      [{ mat: "#ABCDEF" }, 'knobs: bad value for mat: "#ABCDEF"'],
      [{ geo: { lat: 200 } }, "knobs: bad value for geo.lat: 200"],
      [{ clock: { speed: 0 } }, "knobs: bad value for clock.speed: 0"],
      [{ network: "offline" }, 'knobs: bad value for network: "offline"'],
      [{ locale: { lang: "!!" } }, 'knobs: bad value for locale.lang: "!!"'],
      [{ device: "nokia-3310" }, 'knobs: bad value for device: "nokia-3310"'],
      [{ text: "big" }, 'knobs: bad value for text: "big"'],
      [{ speed: Number.NaN }, "knobs: bad value for speed: NaN"],
      [{ text: Infinity }, "knobs: bad value for text: Infinity"],
      [{ scheme: undefined }, "knobs: bad value for scheme: undefined"],
      [{ scheme: null }, "knobs: bad value for scheme: null"],
      [{ scheme: Symbol("dark") }, "knobs: bad value for scheme: Symbol(dark)"],
      [{ text: 10n }, "knobs: bad value for text: 10"],
      [{ pseudo: "yes" }, 'knobs: bad value for pseudo: "yes"'],
    ];
    for (const [patch, message] of cases) {
      expect(() => checkPatch(patch)).toThrow(new TypeError(message));
    }
  });

  test("throws at a knob or a field the state does not have", () => {
    expect(() => checkPatch({ nope: 1 })).toThrow(new TypeError("knobs: unknown knob nope"));
    expect(() => checkPatch({ panel: { width: 300 } })).toThrow(
      new TypeError("knobs: unknown knob panel.width"),
    );
    expect(() => checkPatch({ clock: { until: 0 } })).toThrow(
      new TypeError("knobs: unknown knob clock.until"),
    );
    expect(() => checkPatch({ locale: { toString: "x" } })).toThrow(
      new TypeError("knobs: unknown knob locale.toString"),
    );
  });

  test("takes the fields describe leaves out, as the stored state reads them", () => {
    for (const patch of [
      { grabColor: "pink" },
      { grabColor: "#abcdef" },
      { clock: { since: 1234 } },
      { panel: { side: "left", y: 40, top: 24, edge: "bottom", tab: "none", pinned: ["scheme"] } },
      { panel: { pinned: [] } },
      { panel: { pinned: ["device", "debug", "grab"] } },
    ]) {
      expect(() => checkPatch(patch)).not.toThrow();
    }
    const cases: [unknown, string][] = [
      [{ grabColor: "teal" }, 'knobs: bad value for grabColor: "teal"'],
      [{ clock: { since: "now" } }, 'knobs: bad value for clock.since: "now"'],
      [{ panel: { side: "up" } }, 'knobs: bad value for panel.side: "up"'],
      [{ panel: { y: Number.NaN } }, "knobs: bad value for panel.y: NaN"],
      [{ panel: { tab: "middle" } }, 'knobs: bad value for panel.tab: "middle"'],
      [{ panel: { pinned: ["scheme", 3] } }, 'knobs: bad value for panel.pinned: ["scheme",3]'],
      [{ panel: { pinned: ["nope"] } }, 'knobs: bad value for panel.pinned: ["nope"]'],
      [{ panel: { pinned: ["speed"] } }, 'knobs: bad value for panel.pinned: ["speed"]'],
      [
        { panel: { pinned: ["scheme", "scheme"] } },
        'knobs: bad value for panel.pinned: ["scheme","scheme"]',
      ],
      [{ panel: { handle: "no" } }, 'knobs: bad value for panel.handle: "no"'],
    ];
    for (const [patch, message] of cases) {
      expect(() => checkPatch(patch)).toThrow(new TypeError(message));
    }
  });

  test("throws at anything but an object", () => {
    for (const patch of [null, undefined, "dark", 1, []]) {
      expect(() => checkPatch(patch)).toThrow(
        new TypeError("knobs: setState takes an object"),
      );
    }
  });
});

describe("setState", () => {
  test("applies none of a patch with a bad value in it", () => {
    expect(() => setState({ scheme: "dark", text: 500 })).toThrow(TypeError);
    expect(getState()).toEqual(DEFAULT_STATE);
  });

  test("takes the whole state back, as getState gives it after several knobs", () => {
    const state = merge(DEFAULT_STATE, {
      scheme: "dark",
      grabColor: "#abcdef",
      clock: { mode: "frozen", at: Date.parse("2030-01-01") },
      device: "iphone-18-pro",
      panel: { open: true, side: "left", y: 40, top: 24, handle: false, pinned: ["scheme"] },
    });
    expect(() => checkPatch(state)).not.toThrow();
    expect(() => checkPatch(parse(JSON.stringify(state)))).not.toThrow();
  });
});
