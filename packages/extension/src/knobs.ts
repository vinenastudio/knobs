import type { KnobsStatePatch, NativeMedia, NativeViewport, TextValue } from '@vinena/knobs';

/** The knobs devknobs hands its native driver, as one tab's state. */
export interface KnobState extends NativeMedia {
  offline: boolean;
  textSize: TextValue;
  viewport: NativeViewport | null;
}

/** The tab's own size in css px, which a viewport bigger than it is scaled down to. */
export interface TabSize {
  height: number;
  width: number;
}

export interface Command {
  method: string;
  params: Record<string, unknown>;
}

export const DEFAULT_STATE: KnobState = {
  contrast: 'system',
  motion: 'system',
  offline: false,
  scheme: 'system',
  textSize: 'system',
  transparency: 'system',
  viewport: null,
};

// What iOS reports, and Android mostly too: devknobs' in-page touch screen has the same.
const TOUCH_POINTS = 5;

// Chrome's own defaults: 16px standard, 13px monospace.
const STANDARD_FONT_SIZE = 16;
const FIXED_FONT_SIZE = 13;

export function isDefault(state: KnobState): boolean {
  return sameState(state, DEFAULT_STATE);
}

export function sameState(a: KnobState, b: KnobState): boolean {
  return (Object.keys(DEFAULT_STATE) as Array<keyof KnobState>).every((key) =>
    key === 'viewport'
      ? JSON.stringify(a.viewport) === JSON.stringify(b.viewport)
      : a[key] === b[key],
  );
}

// The protocol takes whole pixels.
function fontSizes(textSize: TextValue) {
  if (textSize === 'system') {
    return { fixed: FIXED_FONT_SIZE, standard: STANDARD_FONT_SIZE };
  }
  return {
    fixed: Math.round((textSize * FIXED_FONT_SIZE) / STANDARD_FONT_SIZE),
    standard: Math.round(textSize),
  };
}

function mediaFeatures(state: KnobState) {
  const features: Array<{ name: string; value: string }> = [];
  if (state.scheme !== 'system') {
    features.push({ name: 'prefers-color-scheme', value: state.scheme });
  }
  if (state.contrast !== 'system') {
    features.push({ name: 'prefers-contrast', value: state.contrast });
  }
  if (state.motion !== 'system') {
    features.push({ name: 'prefers-reduced-motion', value: state.motion });
  }
  if (state.transparency !== 'system') {
    features.push({
      name: 'prefers-reduced-transparency',
      value: state.transparency,
    });
  }
  return features;
}

// A tab with no size yet, such as one in a minimized window, scales nothing.
const fit = (have: number, want: number | null) => (want && have > 0 ? have / want : 1);

/**
 * The size, ratio and touch screen of a viewport, or the commands that put the
 * tab's own back. One bigger than the tab is scaled down to fit, as the frame
 * fits it, and a side it leaves to the window fills the tab at that scale.
 */
function viewportCommands(viewport: NativeViewport | null, tab: TabSize): Array<Command> {
  if (!viewport) {
    return [
      { method: 'Emulation.clearDeviceMetricsOverride', params: {} },
      { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: false } },
      { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: false } },
    ];
  }
  const scale = Math.min(1, fit(tab.width, viewport.width), fit(tab.height, viewport.height));
  const width = viewport.width ?? Math.round(tab.width / scale);
  const height = viewport.height ?? Math.round(tab.height / scale);
  // A device's screen is its viewport, as DevTools has it; a plain size keeps the real screen.
  const screen = viewport.mobile ? { screenHeight: height, screenWidth: width } : {};
  return [
    {
      method: 'Emulation.setDeviceMetricsOverride',
      params: {
        deviceScaleFactor: viewport.dpr ?? 0,
        height,
        mobile: viewport.mobile,
        scale,
        width,
        ...screen,
      },
    },
    {
      method: 'Emulation.setTouchEmulationEnabled',
      params: viewport.touch ? { enabled: true, maxTouchPoints: TOUCH_POINTS } : { enabled: false },
    },
    {
      method: 'Emulation.setEmitTouchEventsForMouse',
      params: viewport.touchPointer
        ? { configuration: viewport.mobile ? 'mobile' : 'desktop', enabled: true }
        : { enabled: false },
    },
  ];
}

/** Every command that puts a tab in `state`, defaults included, so one call replaces whatever was set before. */
export function commands(state: KnobState, tab: TabSize): Array<Command> {
  return [
    {
      method: 'Page.setFontSizes',
      params: { fontSizes: fontSizes(state.textSize) },
    },
    {
      method: 'Emulation.setEmulatedMedia',
      params: { features: mediaFeatures(state), media: '' },
    },
    { method: 'Network.enable', params: {} },
    {
      method: 'Network.emulateNetworkConditions',
      params: {
        downloadThroughput: -1,
        latency: 0,
        offline: state.offline,
        uploadThroughput: -1,
      },
    },
    ...viewportCommands(state.viewport, tab),
  ];
}

/**
 * The devknobs patch that puts its native knobs where a tab has them. The
 * viewport stays the page's: its size knobs say more than the tab keeps.
 */
export function patchOf(state: KnobState): KnobsStatePatch {
  const { contrast, motion, scheme, transparency } = state;
  return {
    contrast,
    motion,
    network: { online: state.offline ? 'offline' : 'system' },
    scheme,
    text: state.textSize,
    transparency,
  };
}
