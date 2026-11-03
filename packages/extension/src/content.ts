// The page world: the devknobs panel itself, with text size, offline, the
// prefers knobs, a plain viewport and the user agent handed to the service worker, which sets them for real.
import {
  type DevknobsStatePatch,
  type FrameRefusal,
  getState,
  type KeysStore,
  mount,
  type NativeDriver,
  type PreferSetting,
  reset,
  setNative,
  setPrefer,
  setState,
  setSystemMedia,
} from '@vinena/knobs';
import { DEFAULT_STATE, type KnobState, patchOf, sameState } from './knobs.ts';
import {
  type Answer,
  type Ask,
  type Keys,
  LEGACY_TO_PAGE,
  LOAD_FRAME,
  type NativeReason,
  type PageMessage,
  type Question,
  type Request,
  TO_BRIDGE,
  TO_PAGE,
} from './messages.ts';
import { describeLoad } from './refusal.ts';

// What the panel's switch says when it went off by itself.
const NOTES: Record<NativeReason, string> = {
  'bar-closed': "switched to in-page: Chrome's debugger bar was closed",
};

// devknobs names the frame it loads the page in so (`FRAME_NAME` in its engine/frame.ts).
const FRAME_NAME = 'devknobs-frame';

// On the top window once the extension's copy let the page's own have the page, so
// devknobs' frame, which loads the page again, leaves it to the page's copy there too.
const YIELDED = Symbol.for('devknobs-extension.yielded');

const top = window === window.top;
// The extension's copy stepped aside for the page's own, which runs the panel now.
let yielded = false;
// Another copy of the extension that outranks this one, a local build say, holds the page:
// this one holds nothing on this load, and its toolbar button opens that copy's panel.
let idle = false;

// In the tab's sessionStorage once the extension's copy stepped aside on this page, read as the
// next load starts and cleared once it parsed: that load's copy keeps no knobs of its own, so it neither
// reads nor writes the stored ones the page's copy shares, and hands none to Chrome before
// it steps aside again. A load the page's copy does not take goes back to keeping them.
const YIELDED_KEY = 'devknobs-extension.yielded';

// Read, not cleared, as every copy of the extension on the page reads it, whichever comes first.
function lastYielded(): boolean {
  try {
    return sessionStorage.getItem(YIELDED_KEY) === '1';
  } catch {
    // Storage the page cannot use: the knobs are kept as on any page.
    return false;
  }
}

function markYielded(on: boolean) {
  try {
    if (on) {
      sessionStorage.setItem(YIELDED_KEY, '1');
    } else {
      sessionStorage.removeItem(YIELDED_KEY);
    }
  } catch {
    // As above.
  }
}
let knobs: KnobState = { ...DEFAULT_STATE };
// Until the tab says what it has, its knobs win over the page's stored ones.
let synced = false;
let queued = false;

const toBridge = (request: Request | Question) =>
  document.dispatchEvent(new CustomEvent(TO_BRIDGE, { detail: JSON.stringify(request) }));

function send() {
  if (!top || !synced || queued) {
    return;
  }
  queued = true;
  queueMicrotask(() => {
    queued = false;
    toBridge({ state: knobs, type: 'set' });
  });
}

let asked = 0;
const answers = new Map<number, (answer: Answer) => void>();

// How long a question waits for the service worker, in ms: past it, the extension was reloaded
// or removed since the page loaded, and nothing answers.
const ASK_MS = 5000;

function ask(question: Ask): Promise<Answer> {
  const id = ++asked;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      answers.delete(id);
      resolve({ error: 'the extension did not answer: reload the page' });
    }, ASK_MS);
    answers.set(id, (answer) => {
      clearTimeout(timer);
      resolve(answer);
    });
    toBridge({ ...question, id });
  });
}

// The frame now up: the service worker's word that its framing rules are set,
// how many times it was loaded again for a service worker, and whether its loads skip them.
let ruled: Promise<Answer> = Promise.resolve({});
let reloads = 0;
let bypassed = false;

// A service worker's fetch can beat the rule that lets the frame in. And one can answer from a
// copy it saved, refusing frames, and save a new one from the network behind it, as X's does:
// that fetch goes through the service worker's rule, so the copy it saves lets the frame in.
// So a page with one is loaded again after each of these waits, in ms, before the notice shows.
const RELOAD_MS = [1000, 3000];

// Why a service worker's page is still refused, and its last way past.
const WORKER_WHY = "this site's service worker serves a saved copy of the page that refuses frames";
const MAYBE_WORKER_WHY =
  "this site's service worker may serve a saved copy of the page that refuses frames";

/** The frame opened or went. Its first load waits for the rules that let it in. */
async function framed(open: boolean): Promise<void> {
  if (!top) {
    return;
  }
  reloads = 0;
  bypassed = false;
  ruled = ask({ open, type: 'frame' });
  await ruled;
}

/** Load the frame again with the tab's loads skipping service workers, which takes the debugger. */
function bypass(): NonNullable<FrameRefusal['retry']> {
  return {
    label: 'load past the service worker (Chrome shows a bar meanwhile)',
    run: async () => {
      const { error } = await ask({ type: 'bypass' });
      if (error !== undefined) {
        throw new Error(error);
      }
      bypassed = true;
    },
  };
}

/** The scope of this origin's service worker for `url`: Chrome's debugger does not tell it. */
async function scopeOf(url: string): Promise<string | null> {
  try {
    return (await navigator.serviceWorker?.getRegistration(url))?.scope ?? null;
  } catch {
    // Another origin's, which this page cannot see.
    return null;
  }
}

/** What the tab's debugger saw of the frame's load, in a line, with the whole record to copy. */
async function refused(url: string): Promise<FrameRefusal | null> {
  if (!top) {
    return null;
  }
  // The service worker never said the frame's rules are in, as with an extension reloaded since
  // the page loaded: no load again gets past that, so the notice says so at once.
  const { error } = await ruled;
  if (error !== undefined) {
    return { why: error };
  }
  const worker = (await scopeOf(url)) !== null;
  const wait = RELOAD_MS[reloads];
  if (worker && wait !== undefined) {
    reloads += 1;
    return {
      retry: {
        label: 'load again',
        now: true,
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, wait));
          await ruled;
        },
      },
      why: 'loading the page again',
    };
  }
  const answer = await ask({ type: 'why', url });
  if (answer.native === false) {
    return {
      why: 'turn on real browser settings to see why',
      ...(worker && !bypassed ? { retry: bypass() } : {}),
    };
  }
  if (answer.error !== undefined) {
    return { why: answer.error };
  }
  if (!answer.record) {
    return {
      retry:
        worker && !bypassed
          ? bypass()
          : {
              label: 'find out why',
              run: async () => {
                const { error } = await ask({ type: 'watch' });
                if (error !== undefined) {
                  throw new Error(error);
                }
              },
            },
      why:
        worker && !bypassed ? MAYBE_WORKER_WHY : "Chrome's debugger was not watching as it loaded",
    };
  }
  const { record } = answer;
  if (record.response?.fromServiceWorker) {
    record.response.serviceWorkerScope = await scopeOf(record.response.url);
  }
  const saved = record.response?.fromServiceWorker === true && !bypassed;
  return {
    details: JSON.stringify(record, null, 2),
    why: saved ? `${describeLoad(record)}; ${WORKER_WHY}` : describeLoad(record),
    ...(saved ? { retry: bypass() } : {}),
  };
}

/**
 * Have the bridge load devknobs' frame from the extension's world, past the page's own frame-src
 * policy. The bridge cancels the event as it does; where it did not, devknobs sets the address.
 */
function load(frame: HTMLIFrameElement, url: string): boolean {
  return (
    top &&
    !frame.dispatchEvent(
      new CustomEvent(LOAD_FRAME, { bubbles: true, cancelable: true, composed: true, detail: url }),
    )
  );
}

/** Real phone mode as the extension keeps it, for every tab: the last word either way. */
let hostRealPhone = false;

const driver: NativeDriver = {
  framed,
  load,
  media: (media) => {
    knobs = { ...knobs, ...media };
    send();
  },
  offline: (offline) => {
    knobs = { ...knobs, offline };
    send();
  },
  realPhone: (on) => {
    // What the extension just handed over goes back to it never, so tabs cannot fight over it.
    // Only a turn of the user's own hand is kept for every tab: a script's stays in this tab.
    if (top && on !== hostRealPhone && navigator.userActivation.isActive) {
      hostRealPhone = on;
      void ask({ on, type: 'realPhone' });
    }
  },
  refused,
  setting: {
    change: (on) => toBridge({ on, type: 'native' }),
    hint: "uses Chrome's debugger; shows a bar",
    label: 'real browser settings',
  },
  text: (textSize) => {
    knobs = { ...knobs, textSize };
    send();
  },
  ua: async (ua) => {
    if (top) {
      await ask({ type: 'ua', ua });
    }
  },
  viewport: (viewport) => {
    knobs = { ...knobs, viewport };
    send();
  },
};

/** The shortcuts kept for every site, as the bridge last said, null until it says. */
let keptKeys: Keys | null = null;
const keysHeard = new Set<() => void>();

// On the top window: the store below, for the copy in devknobs' frame, which has no bridge of its
// own, to read the same keys.
const KEYS_STORE = Symbol.for(`${TO_PAGE}.keys`);

/**
 * Where devknobs keeps the shortcuts set in the panel: in the extension's storage, the same on
 * every site, not in the page's `localStorage`. The bridge says what they are after the mount,
 * so devknobs starts from the defaults and takes them once they come. Only a key set during a gesture
 * of the user's is kept for every site: a page script can change them only right after you click
 * or press a key on that page; otherwise its change stays in this tab until it loads again. Where the
 * page's own copy runs the panel, it keeps its keys in the page's `localStorage`, as with no extension.
 */
const keysStore: KeysStore = {
  load: () => keptKeys,
  save: (keys) => {
    if (top && navigator.userActivation.isActive) {
      void ask({ keys, type: 'keys' }).then(({ error }) => {
        if (error === undefined) {
          return;
        }
        // Not kept, as with the extension reloaded since the page loaded: the panel goes back
        // to the keys that are, and the error is reported as any other of the page's.
        heardKeys(keptKeys);
        queueMicrotask(() => {
          throw new Error(`knobs: the shortcut was not kept for every site: ${error}`);
        });
      });
    }
  },
  subscribe: (listener) => {
    keysHeard.add(listener);
    return () => {
      keysHeard.delete(listener);
    };
  },
};

function heardKeys(keys: Keys | null) {
  keptKeys = keys;
  for (const listener of keysHeard) {
    try {
      listener();
    } catch (error) {
      // One copy's error is its own: the others still hear the keys, and it is reported as ever.
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

/** The store of the extension's copy on the page above, for the copy in devknobs' frame. */
function keysAbove(): KeysStore | null {
  let above: unknown;
  try {
    above = Reflect.get(window.parent, KEYS_STORE);
  } catch {
    return null;
  }
  if (typeof above !== 'object' || above === null) {
    return null;
  }
  const store = above as KeysStore;
  return {
    load: () => store.load(),
    save: (keys) => store.save(keys),
    subscribe: (listener) => {
      // The frame's page can go without its copy unmounting: the page above stops calling it.
      let gone = false;
      const stop = store.subscribe(() => {
        if (!gone) {
          listener();
        }
      });
      window.addEventListener(
        'pagehide',
        () => {
          gone = true;
          stop();
        },
        { once: true },
      );
      return stop;
    },
  };
}

/**
 * Who runs the panel on a page with its own devknobs, shown in the panel's settings.
 * The choice is kept for every site; going back to the extension's copy from the
 * page's panel loads the page again, so the extension's holds it from the start.
 */
const prefer: PreferSetting = {
  change: (value) => {
    void ask({ prefer: value, type: 'prefer' }).then(({ error }) => {
      if (yielded && value === 'extension' && error === undefined) {
        markYielded(false);
        location.reload();
      }
    });
  },
  now: () => prefer.value,
  value: 'extension',
  yielded: () => {
    yielded = true;
    Reflect.set(window, YIELDED, true);
    markYielded(true);
  },
};

/** Where an older copy of the extension stood down for this one, its bridge's messages stop here. */
function hush(event: Event) {
  event.stopImmediatePropagation();
}

/**
 * Another copy of the extension holds the page: hear nothing more from the bridge, leave older
 * copies be, and have the tab keep no user agent of this copy's, nor knobs (`onIdle`).
 */
function standDown() {
  idle = true;
  if (top) {
    document.removeEventListener(TO_PAGE, onMessage);
    window.removeEventListener(LEGACY_TO_PAGE, hush, true);
    document.addEventListener(TO_PAGE, onIdle);
    toBridge({ id: 0, type: 'ua', ua: null });
  }
}

/**
 * Stood down, the toolbar button opens and closes the panel of the copy that holds the page,
 * and knobs the tab kept from an earlier load go back to their defaults, the debugger with them.
 */
function onIdle(event: Event) {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') {
    return;
  }
  const message = JSON.parse(detail) as PageMessage;
  if (message.type === 'toggle') {
    const api = window.devknobs;
    api?.setState({ panel: { open: !api.getState().panel.open } });
  } else if (message.type === 'state' && !sameState(message.state, DEFAULT_STATE)) {
    toBridge({ state: DEFAULT_STATE, type: 'set' });
  }
}

/** Mount the extension's copy as the page's host, its options as for the first mount. */
function mountHost(persist: boolean) {
  const keys = top ? keysStore : keysAbove();
  // The toolbar button opens and closes the panel, so no handle waits on the page's edge.
  // The user's own choice in the panel's settings still wins. As the host, a copy of
  // devknobs the page mounts itself hands its keys and grab here and takes no panel,
  // unless the user prefers the page's copy, which then takes the page from this one.
  // Where another copy of the extension meets this one, the one that ranks higher holds the page.
  mount({
    build: typeof KNOBS_BUILD === 'string' ? KNOBS_BUILD : 'store',
    handle: false,
    host: true,
    ...(keys ? { keysStore: keys } : {}),
    native: driver,
    persist,
    stoodDown: standDown,
    ...(top ? { prefer } : {}),
  });
}

/**
 * Once the page's copy runs the panel: the toolbar button opens it, and the tab keeps no
 * knobs of the extension's. A page that unmounted its copy since gets the extension's
 * panel back on the button, open.
 */
function afterYield(message: PageMessage) {
  if (message.type === 'toggle') {
    const api = window.devknobs;
    if (api) {
      api.setState({ panel: { open: !api.getState().panel.open } });
      return;
    }
    yielded = false;
    Reflect.deleteProperty(window, YIELDED);
    markYielded(false);
    mountHost(true);
    setState({ panel: { open: true } });
  } else if (message.type === 'prefer') {
    // Picked in another tab: the next load keeps knobs again only with the extension's.
    prefer.value = message.prefer;
    markYielded(message.prefer === 'page');
    // The page's panel reads it through `now`; an empty patch draws it again.
    window.devknobs?.setState({});
  } else if (message.type === 'state' && !sameState(message.state, DEFAULT_STATE)) {
    toBridge({ state: DEFAULT_STATE, type: 'set' });
  }
}

/**
 * The toolbar button opens the panel, and closing it turns knobs off for the tab: every knob
 * back to its default, kept so a reload brings no device back, the rows the user pinned kept.
 */
function toggle() {
  const { open, pinned } = getState().panel;
  if (!open) {
    setState({ panel: { open: true } });
    return;
  }
  reset();
  setState({ panel: { open: false, pinned } });
}

function onMessage(event: Event) {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') {
    return;
  }
  const message = JSON.parse(detail) as PageMessage;
  if (message.type === 'answer') {
    answers.get(message.id)?.(message);
    answers.delete(message.id);
  } else if (message.type === 'keys') {
    // Kept after a handover too, for a mount again once the page's copy has gone.
    heardKeys(message.keys);
  } else if (yielded) {
    afterYield(message);
  } else if (message.type === 'prefer') {
    // Kept here too, for a mount again once the page's copy has gone.
    prefer.value = message.prefer;
    setPrefer(message.prefer);
  } else if (message.type === 'toggle') {
    toggle();
  } else if (message.type === 'realPhone') {
    hostRealPhone = message.on;
    if (getState().panel.realPhone !== message.on) {
      setState({ panel: { realPhone: message.on } });
    }
  } else if (message.type === 'carry') {
    // The tab follows its frame to another origin: the page there takes these knobs.
    void ask({ state: { ...getState() }, type: 'carry' });
  } else if (message.type === 'detached') {
    // The tab's own size is back too, so a size the tab had goes with it.
    const sized: DevknobsStatePatch = knobs.viewport
      ? { device: 'none', dpr: 'system', height: 'full', width: 'full' }
      : {};
    setState({ ...patchOf(DEFAULT_STATE), ...sized });
  } else if (message.type === 'native') {
    setNative(message.on, message.reason ? NOTES[message.reason] : undefined);
  } else if (message.type === 'system') {
    setSystemMedia(message.media);
  } else if (message.type === 'state') {
    if (message.system) {
      setSystemMedia(message.system);
    }
    // Where devknobs finds its device images: the build reads `import.meta.url` from here.
    Object.defineProperty(globalThis, 'devknobsExtensionBase', {
      configurable: true,
      value: message.base,
    });
    // Off, the tab has no knobs of its own, so the defaults the driver is handed stay here.
    setNative(message.native);
    const first = !synced;
    synced = true;
    if (!sameState(message.state, knobs)) {
      setState(patchOf(message.state));
    }
    // The viewport is the page's, so a tab that has another one hears the page's
    // as it loads. Not after a refusal, which would only be refused again.
    if (first && !sameState(message.state, knobs)) {
      send();
    }
    // The knobs of the page on another origin the tab followed its frame from.
    if (message.carry) {
      try {
        setState(message.carry as DevknobsStatePatch);
      } catch {
        // Knobs this copy of devknobs does not take: the page keeps its own.
      }
    }
  }
}

/** Did the extension's copy on the page above let the page's own have it? */
function yieldedAbove(): boolean {
  try {
    return Reflect.get(window.parent, YIELDED) === true;
  } catch {
    return false;
  }
}

if (top || (window.name === FRAME_NAME && !yieldedAbove())) {
  if (top) {
    Reflect.set(window, KEYS_STORE, keysStore);
    document.addEventListener(TO_PAGE, onMessage);
    // An older copy of the extension, the store's 0.5 say, hears one channel for every copy.
    // Once it stood down for this one, its bridge's knobs and toolbar button must not reach it.
    if (TO_PAGE !== LEGACY_TO_PAGE) {
      window.addEventListener(LEGACY_TO_PAGE, hush, true);
    }
    // Once every copy of the extension has read the flag; a handover since sets it again.
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        if (!yielded && !idle) {
          markYielded(false);
        }
      },
      { once: true },
    );
  }
  mountHost(!(top && lastYielded()));
}
