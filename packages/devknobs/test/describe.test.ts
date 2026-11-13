import { describe, expect, test } from "bun:test";
import { realNow, virtualNow } from "../src/engine/clock";
import {
  describe as describeKnobs,
  type KnobShape,
  type KnobValue,
} from "../src/engine/describe";
import { DEVICES, POSTURES } from "../src/engine/devices";
import { MAT_COLOR_NAMES } from "../src/engine/matcolors";
import {
  BARS,
  BROWSERS,
  CLOCK_MODES,
  CONNECTIONS,
  CONTRASTS,
  DEFAULT_STATE,
  DEV_ICONS,
  DIRS,
  GEO_ERRORS,
  merge,
  MOTIONS,
  ONLINES,
  ORIENTATIONS,
  resetState,
  SAVE_DATAS,
  SCHEMES,
  TRANSPARENCIES,
  VISIONS,
} from "../src/engine/store";
import type {
  BarsValue,
  BrowserValue,
  ClockMode,
  ConnectionValue,
  ContrastValue,
  KnobsState,
  KnobsStatePatch,
  DevIconValue,
  DirValue,
  GeoErrorValue,
  MatColorName,
  MotionValue,
  OnlineValue,
  OrientationValue,
  PostureValue,
  SaveDataValue,
  SchemeValue,
  TransparencyValue,
  VisionValue,
} from "../src/types";

/** A foldable, so a posture has a device to stand. */
const FOLDABLE = DEVICES.find((device) => device.postures);

/** What a knob's value needs set beside it to hold. */
function contextFor(key: keyof KnobsState): KnobsStatePatch {
  if (key === "orientation") return { width: 400, height: 800 };
  if (key === "posture") return { device: FOLDABLE?.id ?? "none" };
  return {};
}

/** A few values of each shape, every one of an enum. */
function samples(shape: KnobShape): (string | number | boolean)[] {
  if (shape.type === "enum") return shape.values;
  if (shape.type === "boolean") return [true, false];
  if (shape.type === "number") {
    const ends = [shape.min, shape.max].filter((value) => value !== undefined);
    return [...ends, ...(shape.or ?? [])];
  }
  if (shape.type === "string") return [...(shape.examples ?? []), ...(shape.or ?? [])];
  return [];
}

/** Set a value the way an agent does, and read it back. */
function roundTrip(key: keyof KnobsState, value: KnobValue): KnobsState {
  const patch = { [key]: value } as KnobsStatePatch;
  return merge(merge(DEFAULT_STATE, contextFor(key)), patch);
}

describe("describe", () => {
  test("describes every knob but grab's color", () => {
    const keys: string[] = describeKnobs().map((knob) => knob.key);
    const expected = Object.keys(DEFAULT_STATE).filter((key) => key !== "grabColor");
    expect([...keys].sort()).toEqual(expected.sort());
  });

  test("is plain json", () => {
    const knobs = describeKnobs();
    expect(JSON.parse(JSON.stringify(knobs))).toEqual(knobs);
  });

  test("every default goes back in as it is", () => {
    for (const knob of describeKnobs()) {
      const state = roundTrip(knob.key, knob.default);
      if (typeof knob.default === "object") expect(state[knob.key]).toMatchObject(knob.default);
      else expect(state[knob.key]).toBe(knob.default);
    }
  });

  test("every value it lists goes back in as it is", () => {
    for (const knob of describeKnobs()) {
      if (knob.value.type !== "object") {
        for (const value of samples(knob.value)) {
          expect(roundTrip(knob.key, value)[knob.key]).toBe(value);
        }
        continue;
      }
      for (const [name, field] of Object.entries(knob.value.fields)) {
        for (const value of samples(field.value)) {
          const state = roundTrip(knob.key, { [name]: value });
          expect(state[knob.key]).toMatchObject({ [name]: value });
        }
      }
    }
  });

  test("says what reloads", () => {
    const reload = Object.fromEntries(describeKnobs().map((knob) => [knob.key, knob.reload]));
    expect(reload.locale).toBe("page");
    expect(reload.width).toBe("frame");
    expect(reload.device).toBe("frame");
    expect(reload.ua).toBe("frame");
    expect(reload.scheme).toBe("none");
    expect(reload.zoom).toBe("none");
  });

  test("the clock's default spread into a patch keeps the instant it sets", () => {
    const clock = describeKnobs().find((knob) => knob.key === "clock");
    if (!clock || typeof clock.default !== "object") throw new Error("no clock knob");
    expect(Object.keys(clock.default)).not.toContain("since");
    const at = Date.parse("2030-01-01");
    const before = merge(DEFAULT_STATE, {
      clock: { mode: "frozen", at: Date.parse("2020-01-01") },
    });
    const state = merge(before, { clock: { ...clock.default, mode: "offset", at } });
    expect(state.clock.mode).toBe("offset");
    expect(state.clock.at).toBe(at);
    expect(virtualNow(state.clock, realNow()) - at).toBeLessThan(1000);
  });

  test("hands out a copy each time", () => {
    const first = describeKnobs();
    const locale = first.find((knob) => knob.key === "locale");
    if (locale && typeof locale.default === "object") locale.default.lang = "xx";
    expect(describeKnobs()).not.toEqual(first);
    expect(DEFAULT_STATE.locale.lang).toBe("system");
  });

  test("says reset leaves the panel as it is, as it does", () => {
    const panel = describeKnobs().find((knob) => knob.key === "panel");
    expect(panel?.description).toContain("reset() leaves it as it is");
    const placed = merge(DEFAULT_STATE, { panel: { open: true, docked: true } });
    expect(resetState(placed).panel).toMatchObject({ open: true, docked: true });
  });

  test("lists the panel's handle, shown by default, to hide from screenshots", () => {
    const panel = describeKnobs().find((knob) => knob.key === "panel");
    const fields = panel?.value.type === "object" ? panel.value.fields : {};
    expect(fields.handle?.value).toEqual({ type: "boolean" });
    expect(fields.handle?.description).toContain("screenshots");
    expect(panel?.default).toEqual({ open: false, docked: false, handle: true, devIcon: "auto", realPhone: false });
  });
});

/** Every member of a union, once each: one left out or made up does not compile. */
function members<T extends string>(all: Record<T, true>): T[] {
  return Object.keys(all) as T[];
}

describe("value lists", () => {
  test("hold every member of their type", () => {
    const lists: [readonly string[], string[]][] = [
      [SCHEMES, members<SchemeValue>({ light: true, dark: true, system: true })],
      [MOTIONS, members<MotionValue>({ reduce: true, system: true })],
      [CONTRASTS, members<ContrastValue>({ more: true, system: true })],
      [TRANSPARENCIES, members<TransparencyValue>({ reduce: true, system: true })],
      [DIRS, members<DirValue>({ ltr: true, rtl: true, system: true })],
      [DEV_ICONS, members<DevIconValue>({ auto: true, on: true, off: true })],
      [
        GEO_ERRORS,
        members<GeoErrorValue>({ none: true, denied: true, unavailable: true, timeout: true }),
      ],
      [CLOCK_MODES, members<ClockMode>({ system: true, offset: true, frozen: true })],
      [ONLINES, members<OnlineValue>({ offline: true, system: true })],
      [
        CONNECTIONS,
        members<ConnectionValue>({
          "slow-2g": true,
          "2g": true,
          "3g": true,
          "4g": true,
          system: true,
        }),
      ],
      [SAVE_DATAS, members<SaveDataValue>({ on: true, off: true, system: true })],
      [BARS, members<BarsValue>({ auto: true, expanded: true, minimized: true })],
      [
        BROWSERS,
        members<BrowserValue>({ auto: true, compact: true, bottom: true, top: true, off: true }),
      ],
      [ORIENTATIONS, members<OrientationValue>({ portrait: true, landscape: true })],
      [POSTURES, members<PostureValue>({ closed: true, open: true })],
      [
        VISIONS,
        members<VisionValue>({
          none: true,
          protanopia: true,
          deuteranopia: true,
          tritanopia: true,
          achromatopsia: true,
          blur: true,
        }),
      ],
      [
        MAT_COLOR_NAMES,
        members<MatColorName>({
          blue: true,
          green: true,
          magenta: true,
          purple: true,
          red: true,
          graphite: true,
        }),
      ],
    ];
    for (const [list, all] of lists) expect([...list].sort()).toEqual(all.sort());
  });
});
