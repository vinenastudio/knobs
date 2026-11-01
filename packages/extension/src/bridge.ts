// The extension's own world in the top frame: carries knobs between the page's
// devknobs and the service worker, which only this world can reach.
import {
  type Answer,
  LOAD_FRAME,
  type PageMessage,
  PREFER_KEY,
  REAL_PHONE_KEY,
  type Question,
  readPageMessage,
  readPrefer,
  type Request,
  type Response,
  type TabMessage,
  TO_BRIDGE,
  TO_PAGE,
} from './messages.ts';

const toPage = (message: PageMessage) =>
  document.dispatchEvent(new CustomEvent(TO_PAGE, { detail: JSON.stringify(message) }));

const ask = (request: Request) => chrome.runtime.sendMessage<Request, Response>(request);

const base = chrome.runtime.getURL('content.js');

document.addEventListener(TO_BRIDGE, (event) => {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return;
  }
  // Any script of the page can send this event: only what devknobs sends goes on.
  const request = readPageMessage(parsed);
  if (!request) {
    return;
  }
  // Real phone mode is kept for every tab only from the user's own hand, such as the panel's
  // switch: a page script cannot fake that, and its turn stays in its own tab.
  if (request.type === 'realPhone' && !navigator.userActivation.isActive) {
    return;
  }
  if (request.type !== 'set' && request.type !== 'native') {
    const fail = (error: unknown) =>
      toPage({ error: String(error), id: request.id, type: 'answer' });
    try {
      void chrome.runtime
        .sendMessage<Question, Answer>(request)
        .then((answer) => toPage({ ...answer, id: request.id, type: 'answer' }), fail);
    } catch (error) {
      // The extension was reloaded or removed since this page loaded: no service worker answers.
      fail(error);
    }
    return;
  }
  void ask(request).then(({ error, native = true, state }) => {
    // The tab could not take them, so the panel goes back to what it has. Unless the
    // switch went off meanwhile: the knobs are the page's own then.
    if (error && request.type === 'set' && native) {
      toPage({ base, native, state, type: 'state' });
    }
  });
});

// devknobs names the frame it loads the page in so (`FRAME_NAME` in its engine/frame.ts).
const FRAME_NAME = 'devknobs-frame';

/** devknobs' frame on the page, or null while it has none. */
function devknobsFrame(): HTMLIFrameElement | null {
  return (
    document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>(`iframe[name="${FRAME_NAME}"]`) ?? null
  );
}

// devknobs' frame loads the page from here: an address set from the extension's world is not
// held to the page's own frame-src policy, which can leave the page itself out. Any script of
// the page can send this event too, so it loads only devknobs' frame, and only an address on
// the page's own origin, which the page could load itself.
document.addEventListener(
  LOAD_FRAME,
  (event) => {
    const frame = devknobsFrame();
    const url = (event as CustomEvent<unknown>).detail;
    if (
      !frame ||
      event.composedPath()[0] !== frame ||
      typeof url !== 'string' ||
      URL.parse(url)?.origin !== location.origin
    ) {
      return;
    }
    event.preventDefault();
    frame.src = url;
  },
  true,
);

// Chrome holds every later load of the frame to the page's frame-src too: a link clicked in it,
// or devknobs reloading it. Chrome's own word that the page's policy refused a load of its own
// origin is kept, and if devknobs' frame then lands on Chrome's error page within `REFUSED_MS`,
// the address is loaded again from here. A frame of the page's own, or a policy that only
// reports, never touches devknobs' frame.
const FRAME_DIRECTIVES = new Set(['frame-src', 'child-src', 'default-src']);
const REFUSED_MS = 1000;
let refused = { at: 0, url: '' };
// The last address loaded so, since when, and how often: one refused even so is not loaded
// again forever, only up to `RELOAD_MAX` times in `RELOAD_MS`.
let reloaded = { at: 0, times: 0, url: '' };
const RELOAD_MAX = 3;
const RELOAD_MS = 2000;
// devknobs' frames that hear their loads here.
const heard = new WeakSet<HTMLIFrameElement>();

// Heard first, in the capture phase: a reload from here hides the error page from devknobs' own
// listener, which would show its notice, or load the old address again, meanwhile.
function onFrameLoad(this: HTMLIFrameElement, event: Event) {
  const now = performance.now();
  const { url } = refused;
  if (this.contentDocument !== null || now - refused.at > REFUSED_MS || url === '') {
    return;
  }
  refused = { at: 0, url: '' };
  if (reloaded.url !== url || now - reloaded.at > RELOAD_MS) {
    reloaded = { at: now, times: 0, url };
  }
  reloaded.times += 1;
  if (reloaded.times <= RELOAD_MAX) {
    event.stopImmediatePropagation();
    this.src = url;
  }
}

document.addEventListener(
  'securitypolicyviolation',
  (event) => {
    const frame = devknobsFrame();
    if (
      !frame ||
      !event.isTrusted ||
      event.disposition !== 'enforce' ||
      !FRAME_DIRECTIVES.has(event.effectiveDirective) ||
      URL.parse(event.blockedURI)?.origin !== location.origin
    ) {
      return;
    }
    refused = { at: performance.now(), url: event.blockedURI };
    if (!heard.has(frame)) {
      heard.add(frame);
      frame.addEventListener('load', onFrameLoad, true);
    }
  },
  true,
);

chrome.runtime.onMessage.addListener((message: TabMessage) => {
  toPage(message);
});

// A content script is a classic script, with no top-level await.
chrome.runtime.sendMessage<Request, Response>(
  { type: 'get' },
  ({ carry, native = true, state, system }) =>
    toPage({ base, carry, native, state, system, type: 'state' }),
);

// Who runs the panel, straight from storage, which answers sooner than the service
// worker can wake: the extension's copy holds the page until it comes, and steps
// aside for the page's own whenever it says so. Then each change, made in any tab.
chrome.storage.local.get(PREFER_KEY, (stored) =>
  toPage({ prefer: readPrefer(stored[PREFER_KEY]), type: 'prefer' }),
);
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[PREFER_KEY];
  if (area === 'local' && change) {
    toPage({ prefer: readPrefer(change.newValue), type: 'prefer' });
  }
});

// Real phone mode, the same way: one setting for every tab and site.
chrome.storage.local.get(REAL_PHONE_KEY, (stored) =>
  toPage({ on: stored[REAL_PHONE_KEY] === true, type: 'realPhone' }),
);
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[REAL_PHONE_KEY];
  if (area === 'local' && change) {
    toPage({ on: change.newValue === true, type: 'realPhone' });
  }
});
