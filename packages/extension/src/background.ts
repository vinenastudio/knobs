import type { NativeUa, SystemMedia } from '@vinena/knobs';
import { type Handoff, isFramePage, keepsHandoff, movedTo, takeHandoff } from './follow.ts';
import { commands, DEFAULT_STATE, isDefault, type KnobState, sameState } from './knobs.ts';
import {
  type Answer,
  type Carry,
  detachMessage,
  PREFER_KEY,
  REAL_PHONE_KEY,
  type Question,
  readSystemChange,
  readTabRequest,
  type Response,
  type SystemMessage,
  type TabMessage,
} from './messages.ts';
import { FrameLoads } from './refusal.ts';
import { endFollow, type Follow, liveFollows, loadsUnder, uaCommand, uaRules } from './ua.ts';

const PROTOCOL_VERSION = '1.3';
const key = (tabId: number) => `tab:${tabId}`;
// The panel's switch for the debugger, for every tab and site: off, devknobs runs in the page alone.
const NATIVE_KEY = 'native';

const states = new Map<number, KnobState>();
let native: boolean | null = null;

async function nativeOn(): Promise<boolean> {
  native ??= (await chrome.storage.local.get(NATIVE_KEY))[NATIVE_KEY] !== false;
  return native;
}

function setNative(on: boolean) {
  native = on;
  void chrome.storage.local.set({ [NATIVE_KEY]: on });
}

// One change at a time per tab, so a fast drag cannot attach twice.
const queues = new Map<number, Promise<unknown>>();

function queued<T>(tabId: number, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(tabId) ?? Promise.resolve()).then(work, work);
  queues.set(
    tabId,
    next.catch(() => {}),
  );
  return next;
}

async function getState(tabId: number): Promise<KnobState> {
  const cached = states.get(tabId);
  if (cached) {
    return cached;
  }
  const stored = (await chrome.storage.session.get(key(tabId)))[key(tabId)] as
    | KnobState
    | undefined;
  const state = { ...DEFAULT_STATE, ...stored };
  states.set(tabId, state);
  return state;
}

async function forget(tabId: number) {
  states.delete(tabId);
  await chrome.storage.session.remove(key(tabId));
}

// What each tab's frames loaded while the debugger was on it, for why devknobs' frame was refused.
const loads = new Map<number, FrameLoads>();
// Tabs whose debugger reports the frames' loads.
const watching = new Set<number>();
// Tabs the debugger is on only to watch a frame load, for one answer.
const watchOnly = new Set<number>();
// Chrome's issue and console line about a refusal come a moment after the frame's load event.
const SETTLE_MS = 300;
// Tabs whose loads skip service workers while devknobs' frame is open, which takes the debugger.
const bypassing = new Set<number>();
// Tabs our debugger is on. getTargets cannot tell, since DevTools or another client also counts as attached.
const ours = new Set<number>();

/** Have the debugger, attached to the tab, report its frames' loads. */
async function watch(tabId: number) {
  if (watching.has(tabId)) {
    return;
  }
  const target = { tabId };
  const record = loads.get(tabId) ?? new FrameLoads();
  loads.set(tabId, record);
  const { frameTree } = (await chrome.debugger.sendCommand(target, 'Page.getFrameTree')) as {
    frameTree: { frame: { id: string } };
  };
  record.mainFrame = frameTree.frame.id;
  for (const method of ['Network.enable', 'Audits.enable', 'Log.enable']) {
    await chrome.debugger.sendCommand(target, method, {});
  }
  watching.add(tabId);
}

function unwatch(tabId: number) {
  watching.delete(tabId);
  watchOnly.delete(tabId);
  // What it saw then would answer for loads it did not see.
  loads.delete(tabId);
}

chrome.debugger.onEvent.addListener(({ sessionId, tabId }, method, params) => {
  if (tabId !== undefined && sessionId === undefined) {
    loads.get(tabId)?.event(method, (params ?? {}) as Record<string, unknown>);
  }
});

async function send(tabId: number, state: KnobState) {
  const { height = 0, width = 0 } = await chrome.tabs.get(tabId);
  for (const { method, params } of commands(state, { height, width })) {
    await chrome.debugger.sendCommand({ tabId }, method, params);
  }
}

async function setState(tabId: number, requested: KnobState): Promise<KnobState> {
  // With the switch off, a tab's knobs live in its page: the debugger only ever leaves.
  const state = (await nativeOn()) ? requested : DEFAULT_STATE;
  const current = await getState(tabId);
  if (sameState(current, state)) {
    return requested;
  }
  if (isDefault(state)) {
    await forget(tabId);
    if (ours.has(tabId)) {
      try {
        // Detaching alone leaves the font size until the next navigation.
        await send(tabId, state);
      } finally {
        if (!bypassing.has(tabId)) {
          unwatch(tabId);
          await detach(tabId);
        }
      }
    }
    return requested;
  }
  return withDebugger(tabId, async () => {
    // The knobs keep it on now.
    watchOnly.delete(tabId);
    await watch(tabId);
    await send(tabId, state);
    states.set(tabId, state);
    await chrome.storage.session.set({ [key(tabId)]: state });
    return state;
  });
}

/**
 * Run `work` with our debugger on the tab, putting it on first if it is not. Should any of it
 * fail, the tab goes back to its own settings and the debugger leaves, so the next change starts clean.
 */
async function withDebugger<T>(tabId: number, work: () => Promise<T>): Promise<T> {
  const fresh = !ours.has(tabId);
  if (fresh) {
    await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
    ours.add(tabId);
  }
  try {
    if (fresh) {
      await overrideUa(tabId);
    }
    return await work();
  } catch (error) {
    const had = await getState(tabId);
    await forget(tabId);
    unwatch(tabId);
    bypassing.delete(tabId);
    await send(tabId, DEFAULT_STATE).catch(() => {
      // Whatever the debugger cannot clear goes with the next load.
    });
    await detach(tabId).catch(() => {
      // The debugger already left.
    });
    if (!isDefault(had)) {
      tell(tabId, { type: 'detached' });
    }
    throw error;
  }
}

function tell(tabId: number, message: TabMessage) {
  chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {
    // No devknobs in the tab: a page extensions cannot reach, or one loaded before the install.
  });
}

let offscreen: Promise<void> | null = null;

function ensureOffscreen(): Promise<void> {
  offscreen ??= (async () => {
    const open = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    if (open.length === 0) {
      await chrome.offscreen.createDocument({
        justification: "Reads the user's own color scheme and motion for the devknobs panel.",
        reasons: [chrome.offscreen.Reason.MATCH_MEDIA],
        url: 'offscreen.html',
      });
    }
  })().catch((error: unknown) => {
    offscreen = null;
    throw error;
  });
  return offscreen;
}

/** The user's own scheme and motion, which the knobs hide from every tab they are set in. */
async function readSystem(): Promise<SystemMedia | undefined> {
  try {
    await ensureOffscreen();
    return await chrome.runtime.sendMessage<SystemMessage, SystemMedia>({ type: 'read-system' });
  } catch {
    // The panel reads its own media queries instead.
    return undefined;
  }
}

/**
 * The debugger left a tab without our asking. The user closing Chrome's bar turns the
 * switch off for every tab, and the panel keeps its knobs in the page.
 */
function detached(tabId: number, reason: `${chrome.debugger.DetachReason}`) {
  ours.delete(tabId);
  // Default at once, so a change on its way in does not think the debugger is still on.
  states.set(tabId, { ...DEFAULT_STATE });
  unwatch(tabId);
  bypassing.delete(tabId);
  void chrome.storage.session.remove(key(tabId));
  const message = detachMessage(reason);
  if (message.type === 'native') {
    setNative(false);
  }
  tell(tabId, message);
}

chrome.debugger.onDetach.addListener(({ tabId }, reason) => {
  if (tabId !== undefined) {
    detached(tabId, reason);
  }
});

// The switch, flipped in any tab's panel or by a closed bar: every tab's panel follows.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[NATIVE_KEY];
  if (area !== 'local' || !change) {
    return;
  }
  const on = change.newValue !== false;
  native = on;
  void chrome.tabs.query({}).then((tabs) => {
    for (const { id } of tabs) {
      if (id !== undefined) {
        tell(id, { on, type: 'native' });
      }
    }
  });
});

// The width knob's frame loads the tab's own page, which X-Frame-Options or a
// frame-ancestors policy would refuse. While devknobs' frame is open in a tab, that
// tab's frames of its own host lose X-Frame-Options, and the CSP goes whole where its
// frame-ancestors leaves the page itself out: a rule cannot edit part of a header, nor
// tell devknobs' frame from the page's own. A CSP whose frame-ancestors has 'self', or
// none, stays. A service worker's own fetch of the frame's page is no frame load of the
// tab's, so that rule misses it: what that host's service worker fetches from it loses
// the same headers too, else the copy it saves would refuse the next frame, and the
// page's own next load would get it with no CSP. The tab's rule for X-Frame-Options has
// the tab's id; the others take any id free.
const FRAMED_KEY = 'framed';
let framedTabs: Promise<Map<number, string>> | null = null;
let ruling: Promise<void> = Promise.resolve();
const CSP = 'content-security-policy';

/** The rules that take the headers refusing a frame off `type` loads of `host`, from `host`, in `tabId`. */
function unframing(
  host: string,
  tabId: number,
  type: chrome.declarativeNetRequest.ResourceType,
  ids: [number, number],
): Array<chrome.declarativeNetRequest.Rule> {
  const { REMOVE } = chrome.declarativeNetRequest.HeaderOperation;
  const { MODIFY_HEADERS } = chrome.declarativeNetRequest.RuleActionType;
  const condition = {
    initiatorDomains: [host],
    requestDomains: [host],
    resourceTypes: [type],
    tabIds: [tabId],
  };
  return [
    {
      action: {
        responseHeaders: [{ header: 'x-frame-options', operation: REMOVE }],
        type: MODIFY_HEADERS,
      },
      condition,
      id: ids[0],
    },
    {
      action: { responseHeaders: [{ header: CSP, operation: REMOVE }], type: MODIFY_HEADERS },
      condition: {
        ...condition,
        excludedResponseHeaders: [{ header: CSP, values: ["*frame-ancestors 'self'*"] }],
        responseHeaders: [{ header: CSP, values: ['*frame-ancestors*'] }],
      },
      id: ids[1],
    },
  ];
}

/** Each tab's host with devknobs' frame open, kept through the service worker's restarts. */
function framedHosts(): Promise<Map<number, string>> {
  framedTabs ??= chrome.storage.session.get(FRAMED_KEY).then((stored) => {
    const kept = (stored[FRAMED_KEY] ?? {}) as Record<string, string>;
    return new Map(Object.entries(kept).map(([tabId, host]) => [Number(tabId), host]));
  });
  return framedTabs;
}

/** Put every framed tab's rules, and its host's service worker's, in place of the last ones. */
function ruleFraming(): Promise<void> {
  const run = ruling
    .catch(() => {})
    .then(async () => {
      const tabs = await framedHosts();
      const { SUB_FRAME, XMLHTTPREQUEST } = chrome.declarativeNetRequest.ResourceType;
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      const taken = new Set([
        ...rules.filter(isUaRule).map(({ id }) => id),
        ...(await chrome.tabs.query({})).map(({ id }) => id),
        ...tabs.keys(),
      ]);
      let last = 0;
      const free = () => {
        do {
          last += 1;
        } while (taken.has(last));
        return last;
      };
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [
          ...[...tabs].flatMap(([tabId, host]) =>
            unframing(host, tabId, SUB_FRAME, [tabId, free()]),
          ),
          ...[...new Set(tabs.values())].flatMap((host) =>
            unframing(host, chrome.tabs.TAB_ID_NONE, XMLHTTPREQUEST, [free(), free()]),
          ),
        ],
        removeRuleIds: rules.filter((rule) => !isUaRule(rule)).map(({ id }) => id),
      });
    });
  ruling = run.catch(() => {});
  return run;
}

/** Say the tab has devknobs' frame open on `host`, or none. Resolves once the rules follow. */
async function setFramed(tabId: number, host: string | null): Promise<void> {
  const tabs = await framedHosts();
  if (host ? tabs.get(tabId) === host : !tabs.has(tabId)) {
    return ruling;
  }
  if (host) {
    tabs.set(tabId, host);
  } else {
    tabs.delete(tabId);
  }
  void chrome.storage.session.set({ [FRAMED_KEY]: Object.fromEntries(tabs) });
  return ruleFraming().catch((error: unknown) => {
    // oxlint-disable-next-line no-console -- a rule Chrome refused leaves frames refused, unseen otherwise
    console.warn('knobs: framing rules', error);
  });
}

/** The tab's devknobs frame is gone, with the page it was on. */
function unframed(tabId: number, url?: string) {
  forgetReopen(tabId);
  firstLoads.delete(tabId);
  follows.delete(tabId);
  if (!keepsHandoff(handoffs.get(tabId), url)) {
    handoffs.delete(tabId);
  }
  void setFramed(tabId, null);
  void unbypass(tabId).catch(() => {
    // The debugger already left.
  });
}

// A page loading again on the host its frame was bypassing service workers on, such as one that
// reloads itself as the frame's copy updates its worker: its stored knobs open the frame again,
// so the bypass waits that long for it.
const REOPEN_MS = 15_000;
const reopening = new Map<number, ReturnType<typeof setTimeout>>();

function forgetReopen(tabId: number) {
  clearTimeout(reopening.get(tabId));
  reopening.delete(tabId);
}

async function pageLoads(tabId: number, url: string) {
  const host = URL.parse(url)?.hostname;
  const framedOn = (await framedHosts()).get(tabId);
  if (!bypassing.has(tabId) || !host || framedOn !== host) {
    unframed(tabId, url);
    return;
  }
  void setFramed(tabId, null);
  forgetReopen(tabId);
  reopening.set(
    tabId,
    setTimeout(() => unframed(tabId), REOPEN_MS),
  );
}

// The user agent the ua knob, or a device sizing the whole tab, sends to servers, with no
// debugger: a rule per tab sets it and its client hints on the tab's requests to its own host
// only. No rule touches a service worker's fetches, which belong to no tab and serve every tab
// of the host: a session seen as two browsers at once gets signed out. A device in devknobs'
// frame sends nothing; the frame emulates its browser in the page. The ids are any free ones,
// since the framing rules take tab ids and free ids too: these are told apart by their request headers.
// Tabs following real phone mode's frame to another origin: the host and browser of that one
// page load, whose rule goes once it commits or its time is up. Kept through the service
// worker's restarts, so a restarted one drops a rule it can no longer end.
const FOLLOW_KEY = 'followUa';
let followsKept: Promise<Map<number, Follow>> | null = null;

function followUas(): Promise<Map<number, Follow>> {
  followsKept ??= chrome.storage.session.get(FOLLOW_KEY).then((stored) => {
    const kept = (stored[FOLLOW_KEY] ?? {}) as Record<string, Follow>;
    const live = liveFollows(
      new Map(Object.entries(kept).map(([tabId, follow]) => [Number(tabId), follow])),
      Date.now(),
    );
    for (const [tabId, { until }] of live) {
      setTimeout(() => void unfollowUa(tabId, until), until - Date.now());
    }
    return live;
  });
  return followsKept;
}

/** Take the tab's follow and its rule away: the one ending at `until` only, where given. */
async function unfollowUa(tabId: number, until?: number) {
  const follows = await followUas();
  if (endFollow(follows, tabId, until)) {
    void chrome.storage.session.set({ [FOLLOW_KEY]: Object.fromEntries(follows) });
    await ruleUas();
  }
}
const UA_KEY = 'ua';
let uaTabsKept: Promise<Map<number, { host: string | null; ua: NativeUa }>> | null = null;

/** Each tab's user agent and its page's host, kept through the service worker's restarts. */
function uaTabs(): Promise<Map<number, { host: string | null; ua: NativeUa }>> {
  uaTabsKept ??= chrome.storage.session.get(UA_KEY).then((stored) => {
    const kept = (stored[UA_KEY] ?? {}) as Record<string, { host: string | null; ua: NativeUa }>;
    return new Map(Object.entries(kept).map(([tabId, entry]) => [Number(tabId), entry]));
  });
  return uaTabsKept;
}

function isUaRule({ action }: Pick<chrome.declarativeNetRequest.Rule, 'action'>): boolean {
  return action.requestHeaders !== undefined;
}

/** Put every tab's user agent rules in place of the last ones. Resolves once they are in. */
function ruleUas(): Promise<void> {
  const run = ruling
    .catch(() => {})
    .then(async () => {
      const tabs = await uaTabs();
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      const taken = new Set([
        ...rules.filter((rule) => !isUaRule(rule)).map(({ id }) => id),
        ...(await chrome.tabs.query({})).map(({ id }) => id),
      ]);
      let last = 0;
      const free = () => {
        do {
          last += 1;
        } while (taken.has(last));
        return last;
      };
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: uaRules(tabs, free, await followUas()),
        removeRuleIds: rules.filter(isUaRule).map(({ id }) => id),
      });
    });
  ruling = run.catch(() => {});
  return run;
}

/** The tab's user agent on its debugger too, for its scripts and workers, or none. */
async function overrideUa(tabId: number, clear = false) {
  const kept = clear ? null : ((await uaTabs()).get(tabId)?.ua ?? null);
  // Real phone mode's goes to the frame's page loads alone, never the whole tab's scripts.
  const ua = kept?.frame ? null : kept;
  const { method, params } = uaCommand(ua);
  await chrome.debugger.sendCommand({ tabId }, method, params);
}

async function detach(tabId: number) {
  if (!ours.delete(tabId)) {
    return;
  }
  await overrideUa(tabId, true).catch(() => {
    // The debugger already left.
  });
  await chrome.debugger.detach({ tabId });
}

// Tabs whose page loaded while their user agent rule was on its host: the server saw that
// browser, so the page loads again once the rule goes, and comes back as the real one.
const UA_LOADED_KEY = 'uaLoaded';

async function uaLoaded(): Promise<Set<number>> {
  const stored = (await chrome.storage.session.get(UA_LOADED_KEY))[UA_LOADED_KEY];
  return new Set(Array.isArray(stored) ? (stored as Array<number>) : []);
}

// One change at a time, so two tabs loading at once cannot drop each other's mark.
let marking: Promise<void> = Promise.resolve();

function markUaLoaded(tabId: number, on: boolean): Promise<void> {
  const run = marking.then(async () => {
    const tabs = await uaLoaded();
    if (tabs.has(tabId) === on) {
      return;
    }
    if (on) {
      tabs.add(tabId);
    } else {
      tabs.delete(tabId);
    }
    await chrome.storage.session.set({ [UA_LOADED_KEY]: [...tabs] });
  });
  marking = run.catch(() => {});
  return run;
}

chrome.webNavigation.onCommitted.addListener(({ frameId, tabId, url }) => {
  if (frameId !== 0) {
    return;
  }
  void followUas().then(async (follows) => {
    const followed = follows.get(tabId);
    if (followed) {
      await unfollowUa(tabId);
      // Served to the device, so the page loads again once real phone mode or the device goes.
      await markUaLoaded(tabId, URL.parse(url)?.hostname === followed.host);
      return;
    }
    await markUaLoaded(tabId, loadsUnder(await uaTabs(), tabId, url));
  });
});

/** The user agent the tab's requests carry, null for the browser's own, from the page at `url`. */
async function setUa(tabId: number, ua: NativeUa | null, url: string | undefined) {
  const tabs = await uaTabs();
  const had = tabs.get(tabId);
  const host = (url ? URL.parse(url)?.hostname : undefined) ?? null;
  if (JSON.stringify(had ?? null) === JSON.stringify(ua ? { host, ua } : null)) {
    return;
  }
  // A frame-only rule in place of the whole tab's leaves the page as the real browser too, so
  // it loads again as one. A page real phone mode's tab followed to stays, its frame's rule
  // the same. After any mark on its way in, so a load that just committed counts.
  await marking;
  const shrinks = ua?.frame === true && had !== undefined && had.ua.frame !== true;
  // Only the rule for this page's own host: a page the tab just followed to, which hands its
  // knobs a moment after it starts, is not one the old host's rule served.
  const own = had !== undefined && had.host === host;
  const reload = (!ua || shrinks) && own && url !== undefined && (await uaLoaded()).has(tabId);
  if (reload) {
    await markUaLoaded(tabId, false);
  }
  // Last in, so its host's service worker takes it.
  tabs.delete(tabId);
  if (ua) {
    tabs.set(tabId, { host, ua });
  }
  void chrome.storage.session.set({ [UA_KEY]: Object.fromEntries(tabs) });
  await ruleUas();
  if (ours.has(tabId)) {
    await overrideUa(tabId);
  }
  if (reload) {
    await chrome.tabs.reload(tabId);
  }
}

// devknobs' frame in each tab as it opens: the page it was sent to, and its frame's id once
// that load starts, until it lands. One that lands on another origin of the same site, as a
// server sends a phone's browser to its mobile host, has the tab follow it there: the tab's page
// hands its knobs on (`carry`), and the tab's next page on that origin takes them, within
// `HANDOFF_MS`. One sent to another site gets devknobs' notice, as before.
const firstLoads = new Map<number, { frameId?: number; page: string }>();
const follows = new Map<number, { until: number; url: string }>();
const handoffs = new Map<number, Handoff<Carry>>();
const HANDOFF_MS = 30_000;

function landed({ frameId, tabId, url }: { frameId: number; tabId: number; url: string }) {
  const first = firstLoads.get(tabId);
  if (first?.frameId !== frameId) {
    return;
  }
  firstLoads.delete(tabId);
  const target = movedTo(first.page, url);
  if (target) {
    follows.set(tabId, { until: Date.now() + HANDOFF_MS, url: target });
    tell(tabId, { type: 'carry' });
  }
}

/** Go where the tab's frame landed, with the knobs its page handed, if it is still to. */
async function follow(tabId: number, state: Carry) {
  const next = follows.get(tabId);
  follows.delete(tabId);
  const to = next && next.until > Date.now() ? URL.parse(next.url) : null;
  if (!to) {
    return;
  }
  handoffs.set(tabId, { origin: to.origin, state, until: Date.now() + HANDOFF_MS, url: to.href });
  const frameUa = (await uaTabs()).get(tabId)?.ua;
  if (frameUa?.frame) {
    const until = Date.now() + HANDOFF_MS;
    const follows = await followUas();
    follows.set(tabId, { host: to.hostname, ua: frameUa, until });
    void chrome.storage.session.set({ [FOLLOW_KEY]: Object.fromEntries(follows) });
    await ruleUas();
    // One that never commits leaves no rule behind; a later follow in the tab keeps its own.
    setTimeout(() => void unfollowUa(tabId, until), HANDOFF_MS);
  }
  await chrome.tabs.update(tabId, { url: to.href });
}

/** The knobs handed to the tab's page at `url`, once, or none. */
function handedTo(tabId: number, url: string | undefined): Carry | undefined {
  const { keep, state } = takeHandoff(handoffs.get(tabId), url, Date.now());
  if (!keep) {
    handoffs.delete(tabId);
  }
  return state;
}

// The frame goes with the page it was on: its rules go too, until the next page opens one.
chrome.webNavigation.onBeforeNavigate.addListener(({ frameId, parentFrameId, tabId, url }) => {
  if (frameId === 0) {
    void pageLoads(tabId, url);
    return;
  }
  const first = firstLoads.get(tabId);
  if (first && first.frameId === undefined && parentFrameId === 0 && isFramePage(first.page, url)) {
    first.frameId = frameId;
  }
});
chrome.webNavigation.onCommitted.addListener(landed);
chrome.webNavigation.onErrorOccurred.addListener(landed);

// A viewport bigger than the tab is scaled to it, and a side it leaves to the window fills it.
chrome.windows.onBoundsChanged.addListener(({ id }) => {
  void chrome.tabs.query({ windowId: id }).then((tabs) => {
    for (const { id: tabId } of tabs) {
      if (tabId !== undefined) {
        void queued(tabId, async () => {
          const state = await getState(tabId);
          if (state.viewport) {
            await send(tabId, state);
          }
        });
      }
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forget(tabId);
  loads.delete(tabId);
  queues.delete(tabId);
  void setFramed(tabId, null);
  setUa(tabId, null, undefined).catch(() => {
    // The debugger went with the tab.
  });
  void markUaLoaded(tabId, false);
  void unfollowUa(tabId);
  forgetReopen(tabId);
  bypassing.delete(tabId);
  firstLoads.delete(tabId);
  follows.delete(tabId);
  handoffs.delete(tabId);
});

// A new tab's id can be one another rule took: the tab's framing rule would replace it.
// Read in turn with the rules' changes, so one on its way in cannot take the id unseen.
chrome.tabs.onCreated.addListener(({ id }) => {
  ruling = ruling
    .catch(() => {})
    .then(async () => {
      const taken = (await chrome.declarativeNetRequest.getSessionRules()).find(
        (rule) => rule.id === id,
      );
      if (taken) {
        void (isUaRule(taken) ? ruleUas() : ruleFraming());
      }
    })
    .catch(() => {});
});

chrome.action.onClicked.addListener(({ id }) => {
  if (id !== undefined) {
    tell(id, { type: 'toggle' });
  }
});

/** What the debugger saw of the frame's load of `url`. One it was on only to watch leaves after. */
async function why(tabId: number, url: string): Promise<Answer> {
  if (!(await nativeOn())) {
    return { native: false };
  }
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const record = loads.get(tabId)?.pick(url) ?? null;
  if (record && watchOnly.has(tabId)) {
    await queued(tabId, async () => {
      if (watchOnly.has(tabId) && !bypassing.has(tabId)) {
        unwatch(tabId);
        await detach(tabId);
      }
      watchOnly.delete(tabId);
    });
  }
  return { native: true, record };
}

/** Put the debugger on the tab, if no knob has, to watch the frame's next load. */
function watchNext(tabId: number): Promise<Answer> {
  return queued(tabId, async () => {
    if (!(await nativeOn())) {
      return { native: false };
    }
    const only = !ours.has(tabId);
    await withDebugger(tabId, async () => {
      if (only) {
        watchOnly.add(tabId);
      }
      await watch(tabId);
    });
    return { native: true };
  });
}

/** Have the tab's loads skip service workers while devknobs' frame stays open, the debugger on. */
function bypass(tabId: number): Promise<Answer> {
  return queued(tabId, async () => {
    await withDebugger(tabId, async () => {
      bypassing.add(tabId);
      await watch(tabId);
      await chrome.debugger.sendCommand({ tabId }, 'Network.setBypassServiceWorker', {
        bypass: true,
      });
    });
    return { native: await nativeOn() };
  });
}

/** The frame went: service workers answer the tab again, and the debugger leaves if nothing else keeps it. */
function unbypass(tabId: number): Promise<void> {
  return queued(tabId, async () => {
    if (!bypassing.delete(tabId)) {
      return;
    }
    await chrome.debugger.sendCommand({ tabId }, 'Network.setBypassServiceWorker', {
      bypass: false,
    });
    if (isDefault(await getState(tabId)) && !watchOnly.has(tabId)) {
      unwatch(tabId);
      await detach(tabId);
    }
  });
}

async function answer(tabId: number, question: Question, url: string | undefined): Promise<Answer> {
  switch (question.type) {
    case 'why': {
      return why(tabId, question.url);
    }
    case 'watch': {
      return watchNext(tabId);
    }
    case 'bypass': {
      return bypass(tabId);
    }
    case 'ua': {
      await queued(tabId, () => setUa(tabId, question.ua, url));
      return {};
    }
    case 'prefer': {
      await chrome.storage.local.set({ [PREFER_KEY]: question.prefer });
      return {};
    }
    case 'realPhone': {
      await chrome.storage.local.set({ [REAL_PHONE_KEY]: question.on });
      return {};
    }
    case 'carry': {
      await follow(tabId, question.state);
      return {};
    }
    case 'frame': {
      const host = url ? URL.parse(url)?.hostname : undefined;
      if (question.open && host && url) {
        forgetReopen(tabId);
        firstLoads.set(tabId, { page: url });
        await setFramed(tabId, host);
      } else {
        unframed(tabId);
      }
      return {};
    }
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, reply: (response: Response | Answer) => void) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      // The offscreen document's word that the user's own scheme or motion changed.
      const media = readSystemChange(message);
      if (media && sender.url === chrome.runtime.getURL('offscreen.html')) {
        void chrome.tabs.query({}).then((tabs) => {
          for (const { id } of tabs) {
            if (id !== undefined) {
              tell(id, { media, type: 'system' });
            }
          }
        });
      }
      return false;
    }
    // A tab acts on itself alone: its id and host come from the sender, never the message.
    const request = readTabRequest(message);
    if (!request || sender.frameId !== 0) {
      return false;
    }
    if (
      request.type === 'why' ||
      request.type === 'watch' ||
      request.type === 'frame' ||
      request.type === 'bypass' ||
      request.type === 'ua' ||
      request.type === 'prefer' ||
      request.type === 'realPhone' ||
      request.type === 'carry'
    ) {
      answer(tabId, request, sender.url).then(reply, (error) =>
        reply({ error: error instanceof Error ? error.message : String(error) }),
      );
      return true;
    }
    if (request.type === 'native') {
      // Before the knobs the panel hands over next, which this decides the fate of.
      setNative(request.on);
    }
    queued(tabId, async () => {
      if (request.type === 'set') {
        return setState(tabId, request.state);
      }
      // A tab loaded with the switch off leaves the debugger, should it still be on.
      return (await nativeOn()) ? getState(tabId) : setState(tabId, DEFAULT_STATE);
    }).then(
      async (state) =>
        reply({
          ...(request.type === 'get' ? { carry: handedTo(tabId, sender.url) } : {}),
          native: await nativeOn(),
          state,
          system: request.type === 'get' ? await readSystem() : undefined,
        }),
      async (error: unknown) =>
        reply({
          error: error instanceof Error ? error.message : String(error),
          state: await getState(tabId),
        }),
    );
    return true;
  },
);

// A service worker that starts again puts the user agent rules back from what it kept, so a
// follow's rule whose time ran out while it slept goes.
void ruleUas();

// Lets the smoke test, or a look from the service worker's console, read a tab's knobs.
// `detached` runs what Chrome's bar closing does, which a test cannot click.
Object.assign(globalThis, {
  knobs: {
    bypassing: (tabId: number) => bypassing.has(tabId),
    detached,
    get: getState,
    loads: (tabId: number) => loads.get(tabId)?.loads ?? [],
  },
});

// A local build reloads itself once its folder is rebuilt: Chrome serves an unpacked
// extension's files from disk but runs the old code until reloaded. A timer checks while the
// worker is awake, and an alarm wakes it at least every 30 seconds.
if (typeof KNOBS_STAMP === 'string') {
  const stamp = KNOBS_STAMP;
  const RELOADED_KEY = 'reloadedFor';
  const check = async () => {
    try {
      const response = await fetch(chrome.runtime.getURL('build.json'), { cache: 'no-store' });
      const disk = JSON.stringify(await response.json());
      // Once per stamp on disk, so a `build.json` its code does not match never loops reloads.
      if (disk !== stamp && (await chrome.storage.local.get(RELOADED_KEY))[RELOADED_KEY] !== disk) {
        await chrome.storage.local.set({ [RELOADED_KEY]: disk });
        // oxlint-disable-next-line no-console -- the one line a local build's worker logs
        console.warn('knobs: rebuilt, reloading the extension');
        chrome.runtime.reload();
      }
    } catch {
      // Mid rebuild the file can be missing or half written; the next check sees it.
    }
  };
  setInterval(() => void check(), 2000);
  void check();
  void chrome.alarms.create('build', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener(({ name }) => {
    if (name === 'build') {
      void check();
    }
  });
}
