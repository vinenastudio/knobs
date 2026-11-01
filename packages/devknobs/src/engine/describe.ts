import type { DevknobsState } from "../types";
import { CLOCK_SPEED_MAX, CLOCK_SPEED_MIN } from "./clock";
import { DEVICES, POSTURES } from "./devices";
import { DPR_MAX, DPR_MIN, SIZE_MAX, SIZE_MIN } from "./frame";
import { GEO_PRESETS } from "./geo";
import { LOCALE_PRESETS } from "./locale";
import { MAT_COLOR_NAMES } from "./matcolors";
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
  MOTIONS,
  ONLINES,
  ORIENTATIONS,
  SAVE_DATAS,
  SCHEMES,
  TRANSPARENCIES,
  VISIONS,
} from "./store";
import { SPEED_MAX, SPEED_MIN } from "./speed";
import { TEXT_MAX, TEXT_MIN } from "./text";
import { TIME_ZONE_PRESETS } from "./time";
import { UA_PRESETS } from "./ua";
import { ZOOM_MAX, ZOOM_MIN } from "./zoom";

/**
 * What applying a knob takes: nothing, a load or reload of the page in the
 * device frame, or a reload of the whole page.
 */
export type KnobReload = "none" | "frame" | "page";

/** The values a knob or one of its fields takes. */
export type KnobShape =
  | { type: "enum"; values: string[] }
  | { type: "boolean" }
  /** A number in `min` to `max`, or one of the keywords in `or`. */
  | { type: "number"; min?: number; max?: number; or?: string[] }
  /** Any string, such as the `examples`, or one of the keywords in `or`. */
  | { type: "string"; examples?: string[]; or?: string[] }
  | { type: "object"; fields: Record<string, KnobField> };

export interface KnobField {
  description: string;
  value: KnobShape;
}

/** A knob's value as json: a value, or an object knob's fields. */
export type KnobValue = string | number | boolean | Record<string, string | number | boolean>;

export interface KnobDescription {
  /** The key in a `setState` patch. An object knob may be patched field by field. */
  key: keyof DevknobsState;
  description: string;
  value: KnobShape;
  /** The value `reset()` goes back to, or for `panel`, which `reset()` leaves as it is, the first mount's. */
  default: KnobValue;
  reload: KnobReload;
}

/** Panel and grab settings, which change devknobs itself, not the page. */
type Skipped = "grabColor";

type Spec = Omit<KnobDescription, "key" | "default">;

const oneOf = (values: readonly string[]): KnobShape => ({ type: "enum", values: [...values] });
const flag: KnobShape = { type: "boolean" };

function spec(description: string, value: KnobShape, reload: KnobReload = "none"): Spec {
  return { description, value, reload };
}

function field(description: string, value: KnobShape): KnobField {
  return { description, value };
}

function knobs(): { [K in Exclude<keyof DevknobsState, Skipped>]: Spec } {
  return {
    scheme: spec("prefers-color-scheme.", oneOf(SCHEMES)),
    motion: spec("prefers-reduced-motion.", oneOf(MOTIONS)),
    speed: spec("Playback rate of every animation. 1 is normal, 0 pauses.", {
      type: "number",
      min: SPEED_MIN,
      max: SPEED_MAX,
    }),
    contrast: spec("prefers-contrast.", oneOf(CONTRASTS)),
    transparency: spec("prefers-reduced-transparency.", oneOf(TRANSPARENCIES)),
    locale: spec(
      "Language and writing direction. A new lang reloads the page when it keeps its locale in a cookie or storage.",
      {
        type: "object",
        fields: {
          lang: field("BCP 47 language tag.", {
            type: "string",
            examples: [...LOCALE_PRESETS],
            or: ["system"],
          }),
          dir: field("Writing direction. system derives it from lang.", oneOf(DIRS)),
        },
      },
      "page",
    ),
    pseudo: spec("Pseudo-localize the page's text.", flag),
    geo: spec("Geolocation the page reads.", {
      type: "object",
      fields: {
        preset: field(
          "A city, custom for lat and lng, route to travel the route, or system.",
          oneOf([...GEO_PRESETS.map((preset) => preset.id), "custom", "route", "system"]),
        ),
        lat: field("Latitude of the custom position.", { type: "number", min: -90, max: 90 }),
        lng: field("Longitude of the custom position.", { type: "number", min: -180, max: 180 }),
        accuracy: field("Accuracy in meters.", { type: "number", min: 0 }),
        timeZone: field("IANA zone of the custom position.", {
          type: "string",
          examples: [...TIME_ZONE_PRESETS],
        }),
        error: field("A failure to report instead of a position.", oneOf(GEO_ERRORS)),
        route: field("The route preset's path: lat,lng per line, or a GPX file.", {
          type: "string",
        }),
        speed: field("How fast the route preset travels, in km/h.", { type: "number", min: 0 }),
      },
    }),
    timeZone: spec("Time zone. geo follows the geolocation preset.", {
      type: "string",
      examples: [...TIME_ZONE_PRESETS],
      or: ["geo", "system"],
    }),
    clock: spec(
      "The clock the page reads. A new mode or speed starts from what the clock reads now, so set mode and at in one patch.",
      {
        type: "object",
        fields: {
          mode: field(
            "system for the real clock, offset to run on from at, frozen to stop at at.",
            oneOf(CLOCK_MODES),
          ),
          at: field("The instant the clock reads, in epoch ms.", { type: "number" }),
          speed: field("Clock ms per real ms while it runs.", {
            type: "number",
            min: CLOCK_SPEED_MIN,
            max: CLOCK_SPEED_MAX,
          }),
          header: field(
            "Send the clock's instant to the page's own origin in an x-devknobs-now header.",
            flag,
          ),
        },
      },
    ),
    network: spec("navigator.onLine and navigator.connection. Requests still go out.", {
      type: "object",
      fields: {
        online: field("navigator.onLine and its events.", oneOf(ONLINES)),
        type: field("navigator.connection.effectiveType.", oneOf(CONNECTIONS)),
        saveData: field("navigator.connection.saveData.", oneOf(SAVE_DATAS)),
      },
    }),
    text: spec("Root font size in px.", { type: "number", min: TEXT_MIN, max: TEXT_MAX, or: ["system"] }),
    spacing: spec("WCAG 1.4.12 text spacing.", flag),
    width: spec(
      "Viewport width in px, rendered as a frame that wide.",
      { type: "number", min: SIZE_MIN, max: SIZE_MAX, or: ["full"] },
      "frame",
    ),
    height: spec(
      "Viewport height in px, rendered as a frame that tall.",
      { type: "number", min: SIZE_MIN, max: SIZE_MAX, or: ["full"] },
      "frame",
    ),
    device: spec(
      "A device preset. Sets width, height, dpr and ua.",
      oneOf([...DEVICES.map((device) => device.id), "none"]),
      "frame",
    ),
    orientation: spec(
      "How the frame is held. Needs a numeric width and height, and swaps them.",
      oneOf(ORIENTATIONS),
    ),
    posture: spec("How a foldable device stands. Needs a device that folds.", oneOf(POSTURES)),
    mock: spec("Draw the device's body around its frame.", flag),
    touchPointer: spec("On a touch device, the mouse acts as a finger in its frame.", flag),
    browser: spec("Where a phone's browser keeps its bars, or off.", oneOf(BROWSERS)),
    bars: spec("Whether the browser bars follow the scroll or stay one way.", oneOf(BARS)),
    edgeToEdge: spec("On an iPhone held sideways, the page runs under Safari's top row. Upright, and on the iPhone Duo, it is ignored.", flag),
    frame: spec("Render the page in a full-width frame even at full width.", flag, "frame"),
    dpr: spec(
      "Device pixel ratio inside the frame.",
      { type: "number", min: DPR_MIN, max: DPR_MAX, or: ["system"] },
      "frame",
    ),
    zoom: spec("How big the frame is drawn. The page sees the same viewport.", {
      type: "number",
      min: ZOOM_MIN,
      max: ZOOM_MAX,
      or: ["fit"],
    }),
    mat: spec("Color of the mat the frame lies on: a name, or a hex #rrggbb in lower case.", {
      type: "string",
      examples: ["#336699"],
      or: [...MAT_COLOR_NAMES],
    }),
    vision: spec("A vision deficiency drawn as a filter over the frame.", oneOf(VISIONS), "frame"),
    ua: spec(
      "User agent and client hints.",
      {
        type: "object",
        fields: {
          preset: field(
            "A browser preset, custom for the custom string, or system.",
            oneOf([...UA_PRESETS.map((preset) => preset.id), "custom", "system"]),
          ),
          custom: field("The user agent of the custom preset.", { type: "string" }),
        },
      },
      "frame",
    ),
    overflow: spec("Mark the boxes that stick out of the viewport sideways.", flag),
    outlines: spec("Outline every element.", flag),
    panel: spec(
      "The devknobs panel. Close it and hide its handle to keep it out of screenshots. reset() leaves it as it is, open or closed, docked or not.",
      {
        type: "object",
        fields: {
          open: field("The panel is open.", flag),
          docked: field(
            "Pinned to its side as a column, with the page in a frame beside it.",
            flag,
          ),
          handle: field(
            "Show the knobs handle on the window's edge while the panel is closed. false keeps it out of screenshots for this tab.",
            flag,
          ),
          devIcon: field(
            "The yellow DEV ribbon on the tab's icon and the apple-touch-icon. auto shows it on a local host only: localhost, *.localhost, *.local, 0.0.0.0, a loopback or private network address.",
            oneOf(DEV_ICONS),
          ),
          realPhone: field(
            "Real phone mode. true has a host that sends requests as another browser, the extension, send the device's user agent to servers for the frame's page loads, so a site serves its mobile site; some sites may sign you out. false sends none for a device in the frame. The extension keeps it as one setting for every tab and site.",
            flag,
          ),
        },
      },
      "frame",
    ),
  };
}

/**
 * Every knob an agent can set, with its values, its default and what applying
 * it reloads. Plain json, so it crosses a browser tool's evaluate as it is.
 */
export function describe(): KnobDescription[] {
  const specs = knobs();
  const described = (key: string): key is keyof typeof specs => key in specs;
  return Object.keys(specs)
    .filter(described)
    .map((key) => ({ key, ...specs[key], default: defaultOf(key) }));
}

/** A knob's default, trimmed to the fields it lists. */
function defaultOf(key: keyof DevknobsState): KnobValue {
  if (key === "panel") {
    const { open, docked, handle, devIcon, realPhone } = DEFAULT_STATE.panel;
    return { open, docked, handle, devIcon, realPhone };
  }
  if (key === "clock") {
    const { mode, at, speed, header } = DEFAULT_STATE.clock;
    return { mode, at, speed, header };
  }
  const value = DEFAULT_STATE[key];
  return typeof value === "object" ? { ...value } : value;
}
