import type { KnobsState, KnobsStatePatch } from "../types";
import { isCustomColor } from "./color";
import { ROWS } from "../ui/catalog";
import { describe, type KnobShape } from "./describe";
import { canonicalTag } from "./intl";
import { EDGES, GRAB_COLORS, SIDES } from "./store";
import { canonicalZone } from "./time";

/** What a string field takes beyond its shape, by its path in a patch. */
const STRINGS: Record<string, (value: string) => boolean> = {
  "locale.lang": (value) => canonicalTag(value) !== null,
  timeZone: (value) => canonicalZone(value) !== null,
  // Empty until a custom position has a zone.
  "geo.timeZone": (value) => value === "" || canonicalZone(value) !== null,
  mat: isCustomColor,
};

/** A knob or a field by its path in a patch: `scheme`, `panel.open`. */
type StatePath = {
  [K in keyof KnobsState & string]:
    | K
    | (KnobsState[K] extends object ? `${K}.${keyof KnobsState[K] & string}` : never);
}[keyof KnobsState & string];

const finite = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
const among =
  (values: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === "string" && values.includes(value);

/**
 * The fields of the state `describe()` leaves out, as `parse()` reads them
 * back, so `setState(getState())` takes the whole state.
 */
const UNLISTED = new Map<string, ((value: unknown) => boolean) | undefined>(
  Object.entries({
    grabColor: (value) => isCustomColor(value) || among(GRAB_COLORS)(value),
    "clock.since": finite,
    "panel.side": among(SIDES),
    "panel.y": finite,
    "panel.top": finite,
    "panel.edge": among(EDGES),
    "panel.tab": among(EDGES),
    "panel.pinned": (value) =>
      Array.isArray(value) &&
      new Set(value).size === value.length &&
      value.every((item) => ROWS.some((row) => row.id === item)),
  } satisfies Partial<Record<StatePath, (value: unknown) => boolean>>),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fits(path: string, shape: KnobShape, value: unknown): boolean {
  switch (shape.type) {
    case "enum":
      return typeof value === "string" && shape.values.includes(value);
    case "boolean":
      return typeof value === "boolean";
    case "number":
      if (typeof value === "string") return shape.or?.includes(value) ?? false;
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= (shape.min ?? -Infinity) &&
        value <= (shape.max ?? Infinity)
      );
    case "string":
      if (typeof value !== "string") return false;
      if (shape.or?.includes(value)) return true;
      return STRINGS[path]?.(value) ?? true;
    case "object":
      return false;
  }
}

/**
 * Throw a TypeError at a patch an agent got wrong: a knob or a field the
 * state does not have, or a value outside what `describe()` says the knob
 * takes, or for a field it leaves out, what the stored state reads.
 * The whole patch is checked before any of it is applied.
 */
export function checkPatch(patch: unknown): asserts patch is KnobsStatePatch {
  if (!isRecord(patch)) throw new TypeError("knobs: setState takes an object");
  const shapes = new Map<string, KnobShape>(describe().map((knob) => [knob.key, knob.value]));
  for (const [key, value] of Object.entries(patch)) {
    const shape = shapes.get(key);
    if (!shape) {
      unlisted(key, value);
      continue;
    }
    if (shape.type !== "object") {
      if (!fits(key, shape, value)) throw bad(key, value);
      continue;
    }
    if (!isRecord(value)) throw bad(key, value);
    for (const [name, inner] of Object.entries(value)) {
      const path = `${key}.${name}`;
      const field = Object.hasOwn(shape.fields, name) ? shape.fields[name] : undefined;
      if (!field) unlisted(path, inner);
      else if (!fits(path, field.value, inner)) throw bad(path, inner);
    }
  }
}

/** Check a value at a path `describe()` leaves out, which only the state's own fields have. */
function unlisted(path: string, value: unknown): void {
  const takes = UNLISTED.get(path);
  if (!takes) throw new TypeError(`knobs: unknown knob ${path}`);
  if (!takes(value)) throw bad(path, value);
}

function bad(path: string, value: unknown): TypeError {
  return new TypeError(`knobs: bad value for ${path}: ${shown(value)}`);
}

/** A value as it reads in an error: json where json says what it is, else its own text. */
function shown(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
