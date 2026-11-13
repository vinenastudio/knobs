import { useSyncExternalStore } from 'react';
import { track } from '../lib/analytics.ts';
import { DUO, grabbing, IPHONE, openBrowse } from './targets.ts';

export type Knobs = Pick<typeof import('@vinena/knobs'), 'PRESETS' | 'getState' | 'setState'>;

/** The stops of the tour, in the order it asks for them. */
export const STOPS = ['open', 'duo', 'scroll', 'unfold', 'iphone', 'mat', 'grab'] as const;

export type StopId = (typeof STOPS)[number];

export type Progress = {
  readonly done: ReadonlyArray<StopId>;
  /** What grab put on the clipboard for the pick that ended the tour, or null where it could not be read. */
  readonly grabbed: string | null;
  /**
   * Off, on its way through the stops, done and showing the pick and how to install, or pointing
   * at the panel's search for a moment, where its list of knobs did not open.
   */
  readonly phase: 'end' | 'explore' | 'off' | 'on';
  /** The page in the frame was just scrolled, so the tour stays on the browser's bars a moment. */
  readonly watching: boolean;
};

/** What a copy of the page saw happen, which no knob shows. */
type Signal = { text: string | null; type: 'grab' } | { type: 'scroll' };

type Owner = {
  close(): void;
  explore(): void;
  report(signal: Signal): void;
  snapshot(): Progress;
  start(): void;
  subscribe(listener: () => void): () => void;
};

declare global {
  interface Window {
    knobsTour?: Owner;
  }
}

// devknobs has no public way to hear a knob change, so the page looks several
// times a second, and only while the tour shows.
const LOOK_EVERY = 120;

// How far the page in the frame has to travel before it counts as a scroll: one
// wheel notch or one trackpad flick is enough, a pixel of layout jitter is not.
const SCROLL_FAR = 8;

// How long the tour stays on the browser's bars after the scroll, in ms, before it moves on.
const WATCH_FOR = 1000;

// How long the tour points at the panel's search when its list of knobs did not open, in ms.
const EXPLORE_FOR = 4000;

// The field grab copies from: its value is the text that goes to the clipboard.
const GRAB_FIELD = 'textarea[data-knobs="grab"],textarea[data-devknobs="grab"]';

// Where a closed or finished tour is remembered, so a visitor who comes back is not asked again.
const REMEMBER = 'knobs:tour';

const START: Progress = { done: [], grabbed: null, phase: 'off', watching: false };

let progress = START;
let knobs: Knobs | undefined;
let matAtStart: string | undefined;
let looking: ReturnType<typeof setInterval> | undefined;
let watchTimer: ReturnType<typeof setTimeout> | undefined;
let exploreTimer: ReturnType<typeof setTimeout> | undefined;
// The owner's first-impression mode: nothing is read or kept, so the tour always starts.
let fresh = false;
let offered = false;
// The panel and grab as they stood at the last look, or as Escape went down, before the panel's own listeners.
let seen = { grab: false, open: false };
const listeners = new Set<() => void>();

function stopLooking(): void {
  clearInterval(looking);
  looking = undefined;
}

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // A listener of a frame's page that is gone.
      listeners.delete(listener);
    }
  }
}

function isFresh(): boolean {
  try {
    return new URLSearchParams(window.location.search).getAll('devknobs').includes('fresh');
  } catch {
    return false;
  }
}

function remembered(): boolean {
  if (fresh) {
    return false;
  }
  try {
    return localStorage.getItem(REMEMBER) !== null;
  } catch {
    return false;
  }
}

function remember(): void {
  if (fresh) {
    return;
  }
  try {
    localStorage.setItem(REMEMBER, '1');
  } catch {
    // Storage out of reach: the tour starts again on the next visit.
  }
}

function complete(stop: StopId): void {
  if (progress.phase !== 'on' || progress.done.includes(stop)) {
    return;
  }
  const done = [...progress.done, stop];
  track('tour_step', { stop });
  if (done.length < STOPS.length) {
    progress = { ...progress, done };
  } else {
    track('tour_done', {});
    remember();
    progress = { ...progress, done, phase: 'end', watching: false };
  }
  emit();
}

/** Stay on the bars a moment, however the page is scrolled meanwhile, then move on. */
function watchBars(): void {
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    progress = { ...progress, watching: false };
    emit();
  }, WATCH_FOR);
}

/** Is a phone up with its browser's bars around the page? */
export function hasBars(from: Knobs): boolean {
  const state = from.getState();
  if (state.browser === 'off') {
    return false;
  }
  return from.PRESETS.device.find(({ id }) => id === state.device)?.kind === 'phone';
}

/** The panel and grab as they stand now. */
function see(): void {
  const state = knobs?.getState();
  if (state !== undefined) {
    seen = { grab: grabbing(), open: state.panel.open };
  }
}

/** The stops a knob shows, read off the knobs as they stand. */
function look(): void {
  const state = knobs?.getState();
  if (state === undefined) {
    return;
  }
  see();
  matAtStart ??= state.mat;
  if (state.panel.open) {
    complete('open');
  }
  if (state.device === DUO) {
    complete('duo');
    if (state.posture === 'open') {
      complete('unfold');
    }
  }
  if (state.device === IPHONE) {
    complete('iphone');
  }
  if (state.mat !== matAtStart) {
    complete('mat');
  }
}

function startLooking(): void {
  if (knobs !== undefined && looking === undefined) {
    look();
    looking = setInterval(look, LOOK_EVERY);
  }
}

// The tour has one owner, the top page. It keeps it in memory, so it outlives
// every page the device's frame loads.
const local: Owner = {
  close() {
    if (progress.phase === 'off') {
      return;
    }
    if (progress.phase === 'on') {
      track('tour_close', { stop: STOPS.find((id) => !progress.done.includes(id)) });
      remember();
    }
    stopLooking();
    clearTimeout(watchTimer);
    clearTimeout(exploreTimer);
    progress = { ...progress, phase: 'off', watching: false };
    emit();
  },
  explore() {
    if (progress.phase !== 'end') {
      return;
    }
    track('tour_explore', {});
    stopLooking();
    progress = { ...progress, phase: 'off' };
    emit();
    knobs?.setState({ panel: { open: true } });
    // The panel is in by the next frame, with its "add knob" button to press.
    requestAnimationFrame(() => {
      if (progress.phase !== 'off' || openBrowse()) {
        return;
      }
      progress = { ...progress, phase: 'explore' };
      emit();
      exploreTimer = setTimeout(() => {
        progress = { ...progress, phase: 'off' };
        emit();
      }, EXPLORE_FOR);
    });
  },
  report(signal) {
    if (progress.phase !== 'on' && progress.phase !== 'end') {
      return;
    }
    if (signal.type === 'scroll') {
      if (knobs === undefined || !hasBars(knobs)) {
        return;
      }
      if (progress.done.includes('scroll')) {
        return;
      }
      complete('scroll');
      if (progress.phase === 'on' && progress.done.includes('scroll')) {
        progress = { ...progress, watching: true };
        watchBars();
        emit();
      }
      return;
    }
    // The pick is the last stop: one made before its turn does not count, so the
    // text the tour ends on is the one just copied. A pick after the end shows its own.
    if (progress.phase === 'on' && progress.done.length < STOPS.length - 1) {
      return;
    }
    progress = { ...progress, grabbed: signal.text };
    if (progress.phase === 'on') {
      complete('grab');
    } else {
      emit();
    }
  },
  snapshot: () => progress,
  start() {
    if (progress.phase === 'on') {
      return;
    }
    progress = { ...progress, phase: 'on' };
    emit();
    startLooking();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

let owner: Owner | undefined;

/**
 * Inside a device's frame this page runs a second time. That copy keeps no
 * tour of its own: it reads the page above, and reports to it.
 */
function ownerOf(): Owner {
  if (owner !== undefined) {
    return owner;
  }
  try {
    owner = window.parent === window ? local : (window.parent.knobsTour ?? local);
  } catch {
    // A parent on another origin, such as an embed, answers with an error.
    owner = local;
  }
  return owner;
}

/**
 * Escape reads the panel and grab as the key goes down, before their own listeners act on it,
 * so a change since the last look counts too.
 */
function onKeyFirst(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    see();
  }
}

/**
 * Grab ends a pick with a `copy` from a field of its own, the one signal of a
 * pick a page can observe. The field's value is the text that was copied.
 * Where the browser refuses that copy, grab writes through the async clipboard
 * instead, which sends no event: that pick goes unseen.
 */
function onCopy(event: ClipboardEvent): void {
  // The field is on the page only for as long as the copy takes.
  const field = document.querySelector<HTMLTextAreaElement>(GRAB_FIELD);
  if (field !== null && event.target === field) {
    ownerOf().report({ text: field.value === '' ? null : field.value, type: 'grab' });
  }
}

/**
 * Opens the tour's books in this copy of the page: the top page becomes the
 * owner, and every copy reports the picks it sees. The copy in a device's
 * frame also reports its own scroll, which the page above cannot see. Returns
 * the way to stop.
 */
export function openTour(): () => void {
  const to = ownerOf();
  const top = to === local;
  if (top) {
    fresh = isFresh();
    window.knobsTour = local;
    // Before the panel mounts, so it runs ahead of the panel's and grab's own listeners.
    window.addEventListener('keydown', onKeyFirst, true);
  }
  document.addEventListener('copy', onCopy, true);
  let from = window.scrollY;
  const onScroll = () => {
    const now = to.snapshot();
    // Not asked for yet, or done: the scroll measures from here.
    if (now.phase !== 'on' || now.done.includes('scroll')) {
      from = window.scrollY;
    } else if (Math.abs(window.scrollY - from) >= SCROLL_FAR) {
      to.report({ type: 'scroll' });
    }
  };
  if (!top) {
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  return () => {
    document.removeEventListener('copy', onCopy, true);
    window.removeEventListener('scroll', onScroll);
    if (top) {
      window.removeEventListener('keydown', onKeyFirst, true);
      stopLooking();
      knobs = undefined;
      delete window.knobsTour;
    }
  };
}

/**
 * The panel is on the page, so the owner can read its knobs. On a first visit
 * with a mouse the tour starts by itself here, with the handle to point at.
 */
export function watchKnobs(module: Knobs): void {
  if (window.knobsTour !== local) {
    return;
  }
  knobs = module;
  const first = !offered;
  offered = true;
  if (progress.phase !== 'off') {
    startLooking();
  } else if (first && !remembered() && window.matchMedia('(pointer: fine)').matches) {
    local.start();
  }
}

/** The knobs the owner reads, once the panel is on the page. */
export function tourKnobs(): Knobs | undefined {
  return knobs;
}

/** Is this the top page, which draws the tour? The copy in a device's frame draws none. */
export function isTop(): boolean {
  return ownerOf() === local;
}

export function closeTour(): void {
  ownerOf().close();
}

/** Ends the finished tour and opens the panel on its list of every knob. */
export function exploreKnobs(): void {
  ownerOf().explore();
}

/** Is Escape the tour's to take? Not while the panel is open or grab is on: it is theirs. */
export function takesEscape(): boolean {
  return !seen.open && !seen.grab;
}

function readProgress(): Progress {
  return ownerOf().snapshot();
}

function subscribe(listener: () => void): () => void {
  const to = ownerOf();
  const stop = to.subscribe(listener);
  if (to === local) {
    return stop;
  }
  // A frame's page that leaves takes its listener off the page above.
  window.addEventListener('pagehide', stop);
  return () => {
    window.removeEventListener('pagehide', stop);
    stop();
  };
}

// The tour is off for the server and the first client render, so hydration matches.
const atStart = () => START;

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, readProgress, atStart);
}
