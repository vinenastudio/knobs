// End to end: loads dist/ into Playwright's Chromium, drives the devknobs panel the
// extension puts on a page through its own api, and checks that the page sees
// text size, preferences and offline for real, with no rewrite of its own.
// Then shoots the panel next to the npm build's, into smoke-out/. Build first.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type DevknobsStatePatch, PRESETS } from '@vinena/knobs';
import { type Browser, chromium, type Page, type Worker } from 'playwright-core';
import type { KnobState } from '../src/knobs.ts';

const root = join(import.meta.dirname, '..');
// Another build than dist/ with `node scripts/smoke.ts <dir>`.
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist');
const out = join(root, 'smoke-out');
const devknobsDist = join(root, '../devknobs/dist');
// The version the built devknobs carries, which a `bun run link` build makes a local one.
const devknobsVersion = /VERSION = "([^"]+)"/.exec(
  await readFile(join(devknobsDist, 'index.js'), 'utf8'),
)![1]!;
// The version a page's local build of devknobs carries, as `bun run link` builds one.
// What the extension's footer says: a local build's label from its manifest, else that version.
const extensionVersion =
  (JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8')) as { version_name?: string })
    .version_name ?? devknobsVersion;
const localVersion = `${devknobsVersion}-local.123`;

// Records the root size as the parser reaches the head, before any paint.
const head = `<meta charset="utf-8"><title>smoke</title>
<script>window.parsedFontSize = getComputedStyle(document.documentElement).fontSize;</script>
<style>body { font-family: system-ui; margin: 32px; } @media (min-width: 60em) { body { background: rgb(1, 2, 3); } }</style>`;
const body = `<h1>devknobs smoke</h1><p>hi <code>x</code></p>`;
// As next-themes resolves "system": the class before paint, then each change event.
const themes = `<script>
const dark = matchMedia('(prefers-color-scheme: dark)');
document.documentElement.classList.toggle('dark', dark.matches);
dark.addListener((event) => document.documentElement.classList.toggle('dark', event.matches));
</script>
<style>html { background: rgb(250, 250, 250); } html.dark { background: rgb(10, 10, 10); }
:root { color-scheme: light dark; } body { background: light-dark(rgb(240, 240, 240), rgb(20, 20, 20)); }</style>`;
const page = (extra = '') =>
  `<!doctype html><html><head>${head}${extra}</head><body>${body}</body></html>`;

const networkWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
});`;
const cacheWorker = (kind: string) => `self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open('pages').then((cache) => cache.put('/worker/${kind}/page', new Response(
    '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>from the cache</h1></body></html>',
    { headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
  ))));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && event.request.destination === 'iframe') {
    event.respondWith(caches.match('/worker/${kind}/page').then((cached) => cached ?? fetch(event.request)));
  }
});`;
// As X's: answers the frame at once from a copy it saved as it installed, which refuses frames,
// and saves a new copy from the network behind it, for the next load, 1.5 seconds on: past the
// first load again, so only the second gets it.
const staleWorker = `self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open('pages').then((cache) => cache.put('/worker/stale/page', new Response(
    '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>from the cache</h1></body></html>',
    { headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
  ))));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && event.request.destination === 'iframe') {
    event.respondWith(caches.match('/worker/stale/page'));
    event.waitUntil(new Promise((resolve) => setTimeout(resolve, 1500))
      .then(() => fetch('/worker/stale/page', { cache: 'no-store' }))
      .then((fresh) => caches.open('pages').then((cache) => cache.put('/worker/stale/page', fresh))));
  }
});`;
// As an app that renders into <body> as it starts, such as a React root there: it takes out
// every node it did not put there (`clears`) or puts a new <body> in (`replaces`). `reloads`
// clears too, and reloads the tab once its frame's copy loads past the service worker, as a
// page does once its worker updates.
const app = (kind: string) => `<script>
setTimeout(() => {
  const made = '<h1>from the app</h1>';
  if (${JSON.stringify(kind)} === 'replaces') {
    const next = document.createElement('body');
    next.innerHTML = made;
    document.body.replaceWith(next);
  } else {
    for (const node of [...document.body.childNodes]) {
      if (node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') node.remove();
    }
    document.body.insertAdjacentHTML('afterbegin', made);
  }
}, 300);
if (window !== top && !navigator.serviceWorker.controller) parent.postMessage('app-reload', '*');
addEventListener('message', (event) => {
  if (event.data === 'app-reload' && ${JSON.stringify(kind)} === 'reloads' && !sessionStorage.appReloaded) {
    sessionStorage.appReloaded = '1';
    location.reload();
  }
});
</script>`;
// How many times the server sent each next page of the frame-src pages.
const nextLoads = new Map<string, number>();
// How many times the server sent each kind's page.
const workerLoads = new Map<string, number>();
// The user agent and client hints of the last request of each kind under /ua/: the page as a
// document and as a frame, a fetch, an image, and a fetch its service worker made.
const uaSeen = new Map<string, Record<string, string>>();
const uaWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).pathname === '/ua/via-worker') {
    event.respondWith(fetch('/ua/worker-fetch?' + Date.now(), { cache: 'no-store' }));
  }
});`;

const server = createServer(async (request, response) => {
  const path = request.url ?? '/';
  if (path === '/ping') {
    response.end('pong');
    return;
  }
  const uaPath = /^\/ua\/([a-z.-]+)/.exec(path)?.[1];
  if (uaPath === 'sw.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(uaWorker);
    return;
  }
  if (uaPath) {
    const kind =
      uaPath === 'page' && request.headers['sec-fetch-dest'] === 'iframe' ? 'frame' : uaPath;
    uaSeen.set(
      kind,
      Object.fromEntries(
        Object.entries(request.headers)
          .filter(([name]) => name === 'user-agent' || name.startsWith('sec-ch-ua'))
          .map(([name, value]) => [name, String(value)]),
      ),
    );
    response.setHeader('cache-control', 'no-store');
    if (uaPath === 'page') {
      response.setHeader('content-type', 'text/html');
      response.end(page('<script>navigator.serviceWorker.register("/ua/sw.js")</script>'));
      return;
    }
    response.end('ok');
    return;
  }
  // Pages whose policy lets no inline style in, attributes neither, and the same with none,
  // with no style of their own, so the two draw the same. `deny` refuses frames too, and `ext`
  // leaves devknobs to the extension.
  const strict = /^\/(strict|loose)(-deny)?(\?ext)?$/.exec(path);
  if (strict) {
    const [, kind, deny, ext] = strict;
    if (kind === 'strict') {
      response.setHeader('content-security-policy', "style-src 'self'; style-src-attr 'none'");
    }
    if (deny) {
      response.setHeader('x-frame-options', 'DENY');
    }
    response.setHeader('content-type', 'text/html');
    response.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>csp</title>${ext ? '' : '<script src="/devknobs/index.global.js"></script>'}</head><body><h1>devknobs csp</h1><p>hi <code>x</code></p></body></html>`,
    );
    return;
  }
  const bezel = /^\/devknobs\/bezels\/([\w.-]+)$/.exec(path)?.[1];
  if (bezel) {
    response.setHeader('content-type', 'image/webp');
    response.end(await readFile(join(devknobsDist, 'bezels', bezel)).catch(() => ''));
    return;
  }
  // devknobs' built scripts, the module build's chunks too.
  const built = /^\/devknobs\/((?:[\w-]+\/)*[\w.-]+\.js)$/.exec(path)?.[1];
  if (built) {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(join(devknobsDist, built)).catch(() => ''));
    return;
  }
  // The module build again, as a local build of it: the same code, its version a local one.
  const local = /^\/local\/((?:[\w-]+\/)*[\w.-]+\.js)$/.exec(path)?.[1];
  if (local) {
    const code = await readFile(join(devknobsDist, local), 'utf8').catch(() => '');
    response.setHeader('content-type', 'text/javascript');
    response.end(code.replace(`VERSION = "${devknobsVersion}"`, `VERSION = "${localVersion}"`));
    return;
  }
  // A page that mounts that local build itself.
  if (path === '/own-local') {
    response.setHeader('content-type', 'text/html');
    response.end(
      page(`<script type="module">
import { mount, unmount } from '/local/index.js';
mount({ hotkey: 'j' });
window.pageMounted = true;
window.pageUnmount = unmount;
</script>`),
    );
    return;
  }
  // A page that mounts devknobs itself, with a hotkey of its own, as an app does.
  if (path === '/own') {
    response.setHeader('content-type', 'text/html');
    response.end(
      page(`<script type="module">
import { mount, unmount } from '/devknobs/index.js';
mount({ hotkey: 'j', grabColor: 'green' });
window.pageMounted = true;
window.pageUnmount = unmount;
</script>`),
    );
    return;
  }
  // A copy of devknobs that knows no hosts, as 0.3.0 claims the page: it lets the one
  // that holds it go, then puts its own api and panel up, and takes them away on release.
  // With `n`, it claims the page again after each release, as a page that keeps mounting
  // its copy does, up to `n` claims in all.
  const ownOld = /^\/own-old(?:\?n=(\d+))?$/.exec(path);
  if (ownOld) {
    response.setHeader('content-type', 'text/html');
    response.end(
      page(`<script>
const claims = ${Number(ownOld[1] ?? 1)};
window.oldClaims = 0;
const take = () => {
  const OWNER = Symbol.for('devknobs.owner');
  const api = { old: true };
  const host = document.createElement('div');
  host.setAttribute('data-devknobs', 'panel');
  host.id = 'old';
  const release = () => {
    if (window[OWNER] !== undefined && window[OWNER] !== release) return;
    host.remove();
    if (window.devknobs === api) delete window.devknobs;
    if (window[OWNER] === release) delete window[OWNER];
    window.oldReleased = (window.oldReleased ?? 0) + 1;
    if (window.oldClaims < claims) setTimeout(take, 100);
  };
  const previous = window[OWNER];
  if (typeof previous === 'function' && previous !== release) previous();
  window[OWNER] = release;
  window.devknobs = api;
  document.body.append(host);
  window.oldClaims++;
  window.oldMounted = true;
};
addEventListener('load', () => setTimeout(take, 300));
</script>`),
    );
    return;
  }
  // A service worker that answers the frame's load of /sw-deny itself, with a header no rule can strip.
  if (path === '/sw.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'iframe') {
    event.respondWith(new Response('<h1>from the worker</h1>', {
      headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' },
    }));
  }
});`);
    return;
  }
  // Pages under /worker/<kind>/ that refuse frames, each kind with a service worker of its scope:
  // `network` fetches the page from the server, `cache` answers it from Cache Storage.
  const worker = /^\/worker\/(network|cache|stale|clears|replaces|reloads)\/(sw\.js)?/.exec(path);
  if (worker) {
    const [, kind, script] = worker;
    if (script) {
      response.setHeader('content-type', 'text/javascript');
      response.end(
        kind === 'network' ? networkWorker : kind === 'stale' ? staleWorker : cacheWorker(kind!),
      );
      return;
    }
    workerLoads.set(kind!, (workerLoads.get(kind!) ?? 0) + 1);
    response.setHeader('content-type', 'text/html');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('content-security-policy', "frame-ancestors 'none'");
    response.end(
      page(
        `<script>navigator.serviceWorker.register("/worker/${kind}/sw.js")</script>${kind === 'network' || kind === 'cache' || kind === 'stale' ? '' : app(kind!)}`,
      ).replace('<h1>devknobs smoke</h1>', '<h1>from the network</h1>'),
    );
    return;
  }
  // As a frame, a redirect to another host, which refuses frames.
  if (path === '/bounce' && request.headers['sec-fetch-dest'] === 'iframe') {
    response.statusCode = 302;
    response.setHeader('location', `http://localhost:${port}/deny`);
    response.end();
    return;
  }
  // As a site that sends a phone's browser to its mobile host: on www.knobs.localhost, a
  // request that comes as an iPhone goes to the same page on m.knobs.localhost, which only its
  // own origin may frame. A device's frame sends its browser in real phone mode alone.
  if (path === '/phone') {
    if (
      request.headers.host?.startsWith('www.knobs.localhost:') &&
      request.headers['user-agent']?.includes('iPhone')
    ) {
      response.statusCode = 302;
      response.setHeader('location', `http://m.knobs.localhost:${port}/phone`);
      response.end();
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.setHeader('x-frame-options', 'SAMEORIGIN');
    response.end(page());
    return;
  }
  response.setHeader('content-type', 'text/html');
  // A page whose own policy lets no frame of its origin in, and one whose frame-ancestors
  // already lets the page itself frame it, whose policy then stays: its inline script is blocked.
  // The same, with a next page that takes 1.5 seconds to answer, with or without a service
  // worker that lets every load through.
  const slow = /^\/slow\/(plain|sw)\/(page|next|sw\.js)$/.exec(path);
  if (slow) {
    const [, kind, part] = slow;
    if (part === 'sw.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(networkWorker);
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.setHeader('content-security-policy', 'frame-src https://example.com');
    const register =
      kind === 'sw' ? `<script>navigator.serviceWorker.register("/slow/sw/sw.js")</script>` : '';
    if (part === 'next') {
      setTimeout(
        () =>
          response.end(page(register).replace('<h1>devknobs smoke</h1>', '<h1>the next page</h1>')),
        1500,
      );
      return;
    }
    response.end(page(register));
    return;
  }
  // The same with a policy that only reports, and the times each next page was sent.
  if (path === '/frame-src-report' || path === '/frame-src-next?report') {
    response.setHeader('content-security-policy-report-only', 'frame-src https://example.com');
  }
  if (path.startsWith('/frame-src-next')) {
    nextLoads.set(path, (nextLoads.get(path) ?? 0) + 1);
  }
  if (path === '/frame-src' || path === '/frame-src-next') {
    response.setHeader('content-security-policy', 'frame-src https://example.com');
  }
  if (path === '/frame-src-report') {
    response.end(page());
    return;
  }
  if (path.startsWith('/frame-src-next')) {
    response.end(page().replace('<h1>devknobs smoke</h1>', '<h1>the next page</h1>'));
    return;
  }
  const ancestors = /^\/ancestors-(self|none|absent)$/.exec(path)?.[1];
  if (ancestors) {
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader(
      'content-security-policy',
      ancestors === 'absent'
        ? "script-src 'self'"
        : `frame-ancestors '${ancestors}'; script-src 'self'`,
    );
    response.end(page('<script>window.inlineRan = true;</script>'));
    return;
  }
  if (path === '/csp') {
    response.setHeader('content-security-policy', "default-src 'self'");
  }
  if (path === '/deny') {
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('content-security-policy', "frame-ancestors 'none'");
  }
  // A frame of the page's own that its policy sandboxes, with no script: one that runs says so above.
  if (path === '/sandboxed') {
    response.setHeader('content-security-policy', "sandbox; script-src 'none'");
    response.end(
      `<!doctype html><h1>sandboxed</h1><script>parent.document.title = 'sandbox broken';</script>`,
    );
    return;
  }
  response.end(
    path === '/npm'
      ? page('<script src="/devknobs/index.global.js"></script>')
      : path === '/themes'
        ? page(themes)
        : path === '/mobile'
          ? page('<meta name="viewport" content="width=device-width, initial-scale=1">')
          : path === '/sw-deny'
            ? page('<script>navigator.serviceWorker.register("/sw.js")</script>')
            : page(),
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as AddressInfo).port;
const url = `http://127.0.0.1:${port}/`;
// The same server under another origin, where the page keeps no devknobs state of its own.
const otherOrigin = `http://localhost:${port}/`;

const permissions = async (dir: string) =>
  (
    JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as {
      permissions: Array<string>;
    }
  ).permissions;

/**
 * A local build reloads itself once its `build.json` changes, as a rebuild changes it; a release
 * build has no stamp and asks for no `alarms`. Both built into folders of their own.
 */
async function selfReload() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-reload-'));
  const build = (dir: string, release: boolean) =>
    execFileSync('bun', [join(root, 'scripts/build.ts'), dir], {
      env: { ...process.env, CI: '', KNOBS_RELEASE: release ? '1' : '' },
      stdio: 'inherit',
    });
  const local = join(own, 'local');
  const release = join(own, 'release');
  build(local, false);
  build(release, true);
  assert.equal((await permissions(release)).includes('alarms'), false, 'release asks no alarms');
  assert.equal((await permissions(local)).includes('alarms'), true, 'local asks alarms');
  await assert.rejects(readFile(join(release, 'build.json')), 'release has no build.json');
  assert.doesNotMatch(await readFile(join(release, 'background.js'), 'utf8'), /build\.json/);

  const browser = await chromium.launchPersistentContext(join(own, 'profile'), {
    args: [`--disable-extensions-except=${local}`, `--load-extension=${local}`],
    channel: 'chromium',
    headless: true,
  });
  try {
    const worker = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
    // Chrome turns a reloaded unpacked extension off outside developer mode, which a profile
    // that loads one unpacked by hand has on.
    const settings = await browser.newPage();
    await settings.goto('chrome://extensions');
    await settings.evaluate(
      () =>
        new Promise((resolve) => {
          // @ts-expect-error chrome://extensions' own api, not in @types/chrome
          chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, resolve);
        }),
    );
    await settings.close();
    const before = await worker.evaluate(() => performance.timeOrigin);
    const stamp = JSON.parse(await readFile(join(local, 'build.json'), 'utf8')) as object;
    const restarted = browser.waitForEvent('serviceworker', { timeout: 10_000 });
    const start = Date.now();
    await writeFile(join(local, 'build.json'), JSON.stringify({ ...stamp, time: 'rebuilt' }));
    const after = await restarted;
    const latency = Date.now() - start;
    assert.notEqual(await after.evaluate(() => performance.timeOrigin), before, 'a new worker');
    assert.ok(latency < 4000, `reloaded within the poll window (${latency} ms)`);
    log('self reload', `${latency} ms`);
  } finally {
    await browser.close();
    await rm(own, { force: true, recursive: true });
  }
}

const viewport = { height: 800, width: 1200 };
const profile = await mkdtemp(join(tmpdir(), 'knobs-smoke-'));
const context = await chromium.launchPersistentContext(profile, {
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    `--window-size=${viewport.width},${viewport.height}`,
  ],
  channel: 'chromium',
  colorScheme: null,
  contrast: null,
  headless: true,
  reducedMotion: null,
  viewport,
});

const log = (label: string, value: unknown) =>
  process.stdout.write(`${label} ${JSON.stringify(value)}\n`);

declare global {
  interface Window {
    parsedFontSize?: string;
  }
}

const report = (tab: Page) =>
  tab.evaluate(async () => {
    let fetched: string;
    try {
      fetched = await (await fetch('/ping', { cache: 'no-store' })).text();
    } catch {
      fetched = 'failed';
    }
    const root = document.documentElement;
    return {
      contrastMore: matchMedia('(prefers-contrast: more)').matches,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      fetched,
      fontSize: getComputedStyle(root).fontSize,
      // What devknobs writes on <html> when it emulates in the page.
      inline: root.getAttribute('style') ?? '',
      monoSize: getComputedStyle(document.querySelector('code')!).fontSize,
      online: navigator.onLine,
      parsedFontSize: window.parsedFontSize,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      wide: matchMedia('(min-width: 60em)').matches,
      wideCss: getComputedStyle(document.body).backgroundColor === 'rgb(1, 2, 3)',
    };
  });

/** The panel's api, once devknobs has mounted and settled. */
const ready = (tab: Page) =>
  tab.waitForFunction(async () => {
    await window.devknobs?.ready();
    return document.querySelector('[data-devknobs="panel"]') !== null;
  });

// The panel's ground in each look (devknobs' ui/styles.ts), and its transitions, which reduced motion stops.
const LIGHT_PANEL = '#fbfbf9';
const DARK_PANEL = '#151513';
const panelLook = (tab: Page) =>
  tab.evaluate(() => {
    const wrap = document
      .querySelector('[data-devknobs="panel"]')
      ?.shadowRoot?.querySelector('.wrap');
    const style = getComputedStyle(wrap!);
    return {
      background: style.getPropertyValue('--bg').trim(),
      transition: style.transitionDuration,
    };
  });

/** The themes page's class, and the grounds it and light-dark() give. */
const theme = (tab: Page) =>
  tab.evaluate(() => ({
    background: getComputedStyle(document.documentElement).backgroundColor,
    dark: document.documentElement.classList.contains('dark'),
    tokens: getComputedStyle(document.body).backgroundColor,
  }));
const isDark = (tab: Page, dark: boolean) =>
  tab.waitForFunction((dark) => document.documentElement.classList.contains('dark') === dark, dark);

/** Set knobs through the panel's own api, as an agent would. */
const set = (tab: Page, patch: DevknobsStatePatch) =>
  tab.evaluate((patch) => {
    window.devknobs!.setState(patch);
  }, patch);

/** Does the closed panel's handle show on the page's edge? */
const handleShown = (tab: Page) =>
  tab.evaluate(() => {
    const handle = document
      .querySelector('[data-devknobs="panel"]')
      ?.shadowRoot?.querySelector<HTMLElement>('.handle');
    if (!handle) {
      return false;
    }
    const box = handle.getBoundingClientRect();
    return (
      getComputedStyle(handle).visibility !== 'hidden' &&
      box.width > 0 &&
      box.right > 0 &&
      box.left < innerWidth
    );
  });

/** Open the panel and wait for it to land. */
const openPanel = (tab: Page) =>
  tab.evaluate(async () => {
    window.devknobs!.setState({ panel: { open: true } });
    await window.devknobs!.ready();
  });

/**
 * A plain size or device is the tab's own viewport, through the DevTools protocol, with no
 * frame; one with something drawn around it is framed, the override cleared. In a context
 * of its own with no viewport of Playwright's, whose emulation would stack with ours.
 */
async function nativeViewport() {
  const size = { height: 800, width: 1200 };
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-native-'));
  const native = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${size.width},${size.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport: null,
  });
  try {
    const worker = native.serviceWorkers()[0] ?? (await native.waitForEvent('serviceworker'));
    const tab = native.pages()[0] ?? (await native.newPage());
    // A phone lays out a page with no viewport tag at 980px, as Chrome's mobile emulation does.
    await tab.goto(`${url}mobile`);
    await ready(tab);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const look = () =>
      tab.evaluate(() => {
        const host = document.querySelector('[data-devknobs="viewport"]');
        return {
          coarse: matchMedia('(pointer: coarse)').matches,
          dpr: devicePixelRatio,
          frame: host?.shadowRoot?.querySelector('iframe[data-devknobs-frame]') != null,
          hoverNone: matchMedia('(hover: none)').matches,
          innerWidth,
          kept: (window as unknown as { kept?: number }).kept,
          maxTouchPoints: navigator.maxTouchPoints,
          outerWidth,
          touchStart: 'ontouchstart' in window,
        };
      });
    const real = await look();
    log('native: real window', real);
    assert.equal(real.frame, false);
    // What this Chromium's page reports once touch is emulated and then turned off, with no
    // reload: on Linux, hover and pointer stay those of no mouse until the page loads again.
    const probe = await native.newPage();
    await probe.goto(`${url}mobile`);
    const probeSession = await native.newCDPSession(probe);
    await probeSession.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await probeSession.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    const untouched = await probe.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      hoverNone: matchMedia('(hover: none)').matches,
    }));
    await probe.close();
    log('native: host after touch is off', untouched);
    // Kept through every change below: nothing reloads the page.
    await tab.evaluate(() => {
      (window as unknown as { kept: number }).kept = 7;
    });

    // The phone, as the device knob in the frame had it: a coarse pointer that cannot hover, touch
    // points and ontouchstart, at its screen's width and ratio.
    await set(tab, { browser: 'off', device: 'iphone-17', mock: false });
    await tab.waitForFunction(() => innerWidth === 402);
    await tab.evaluate(() => window.devknobs!.ready());
    const phone = await look();
    log('native: iPhone 17, nothing drawn', phone);
    assert.deepEqual(phone, {
      coarse: true,
      dpr: 3,
      frame: false,
      hoverNone: true,
      innerWidth: 402,
      kept: 7,
      maxTouchPoints: 5,
      outerWidth: 402,
      touchStart: true,
    });
    assert.equal(await attached(), true);

    await set(tab, { device: 'none', dpr: 'system', height: 'full', width: 390 });
    await tab.waitForFunction(() => innerWidth === 390);
    const plain = await look();
    log('native: plain 390', plain);
    assert.deepEqual(plain, {
      ...real,
      ...untouched,
      innerWidth: 390,
      kept: 7,
    });

    // Drawn around the page: the frame, and the tab back to its own size underneath.
    for (const drawn of [
      { browser: 'off', mock: true },
      { browser: 'auto', mock: false },
    ] as const) {
      await set(tab, { device: 'iphone-17', ...drawn });
      await tab.waitForFunction(
        (width) =>
          innerWidth === width &&
          document
            .querySelector('[data-devknobs="viewport"]')
            ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')
            ?.contentWindow?.devknobs !== undefined,
        real.innerWidth,
      );
      await tab.evaluate(() => window.devknobs!.ready());
      const framed = await tab.evaluate(() => {
        const inner = document
          .querySelector('[data-devknobs="viewport"]')!
          .shadowRoot!.querySelector<HTMLIFrameElement>(
            'iframe[data-devknobs-frame]',
          )!.contentWindow!;
        return {
          dpr: devicePixelRatio,
          innerCoarse: inner.matchMedia('(pointer: coarse)').matches,
          innerWidth,
          kept: (window as unknown as { kept?: number }).kept,
          pageWidth: inner.innerWidth,
        };
      });
      log(`framed: iPhone 17 ${JSON.stringify(drawn)}`, framed);
      assert.equal(framed.innerWidth, real.innerWidth, 'the override is cleared under the frame');
      assert.equal(framed.dpr, real.dpr);
      assert.equal(framed.kept, 7);
      assert.equal(framed.innerCoarse, true);
      assert.equal(framed.pageWidth, 402);
    }

    await tab.evaluate(() => window.devknobs!.reset());
    await tab.waitForFunction(() => document.querySelector('[data-devknobs="viewport"]') === null);
    for (let tries = 0; (await attached()) && tries < 50; tries++) {
      await tab.waitForTimeout(20);
    }
    const after = await look();
    log('native: after reset', after);
    assert.deepEqual(after, { ...real, ...untouched, kept: 7 });
    assert.equal(await attached(), false);
  } finally {
    await native.close();
    await rm(own, { force: true, recursive: true });
  }
}

const tabKnobsOf = (worker: Worker, tabId: number) =>
  worker.evaluate(
    (tabId) =>
      (
        globalThis as unknown as { knobs: { get: (tabId: number) => Promise<KnobState> } }
      ).knobs.get(tabId),
    tabId,
  );

/**
 * The settings' switch for the debugger. Off, every knob is devknobs' own emulation in the
 * page and the debugger leaves the tab; on again, it comes back, every knob kept. Closing
 * Chrome's bar cannot be clicked here, so its handler runs straight from the service worker,
 * after a detach of our own (which Chrome reports to no listener).
 */
async function inPageMode() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-mode-'));
  const mode = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport: null,
  });
  try {
    const worker = mode.serviceWorkers()[0] ?? (await mode.waitForEvent('serviceworker'));
    const tab = mode.pages()[0] ?? (await mode.newPage());
    await tab.goto(url);
    await ready(tab);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const until = async (want: boolean) => {
      for (let tries = 0; (await attached()) !== want && tries < 100; tries++) {
        await tab.waitForTimeout(20);
      }
      return attached();
    };
    const stored = () =>
      worker.evaluate(async () => (await chrome.storage.local.get('native'))['native']);
    const look = () =>
      tab.evaluate(() => {
        const panel = document.querySelector('[data-devknobs="panel"]')!.shadowRoot!;
        const toggle = panel.querySelector('[aria-describedby="devknobs-native-hint"]');
        return {
          checked: toggle?.getAttribute('aria-checked'),
          fontSize: getComputedStyle(document.documentElement).fontSize,
          frame:
            document
              .querySelector('[data-devknobs="viewport"]')
              ?.shadowRoot?.querySelector('iframe[data-devknobs-frame]') != null,
          hint: panel.querySelector('.row-hint')?.textContent,
          inline: document.documentElement.style.fontSize,
          innerWidth,
          kept: (window as unknown as { kept?: number }).kept,
        };
      });
    const knobs = () =>
      tab.evaluate(() => {
        const { device, text, width } = window.devknobs!.getState();
        return { device, text, width };
      });
    const flip = () =>
      tab.evaluate(() =>
        document
          .querySelector('[data-devknobs="panel"]')!
          .shadowRoot!.querySelector<HTMLElement>('[aria-describedby="devknobs-native-hint"]')!
          .click(),
      );
    await tab.evaluate(() => {
      (window as unknown as { kept: number }).kept = 7;
    });

    // (a) On by default, as ever: the size is the browser's. Again until the tab's knobs,
    // which win over a change made before they arrive, have come in.
    for (let tries = 0; tries < 50; tries++) {
      await set(tab, { text: 48 });
      await tab.waitForTimeout(100);
      if (await attached()) {
        break;
      }
    }
    await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '48px');
    await openPanel(tab);
    await tab.evaluate(() =>
      document
        .querySelector('[data-devknobs="panel"]')!
        .shadowRoot!.querySelector<HTMLElement>('.keys-toggle')!
        .click(),
    );
    await tab.evaluate(() => window.devknobs!.ready());
    await tab.waitForTimeout(300);
    const on = await look();
    log('mode: on', on);
    assert.equal(on.checked, 'true');
    assert.equal(on.hint, "uses Chrome's debugger; shows a bar");
    assert.equal(on.inline, '', 'the size is native');
    assert.equal(await attached(), true);
    await mkdir(out, { recursive: true });
    // The switch's slide settled.
    await tab.waitForTimeout(400);
    await tab.screenshot({ path: join(out, 'settings-mode.png') });

    // (b) Off from the switch: the debugger leaves and the page emulates, the knobs kept.
    await flip();
    assert.equal(await until(false), false, 'the debugger left the tab');
    await tab.waitForFunction(() => document.documentElement.style.fontSize !== '');
    const off = await look();
    log('mode: off', off);
    assert.equal(off.checked, 'false');
    assert.equal(off.fontSize, '48px', 'the page emulates the size itself');
    assert.equal(off.inline, '48px');
    assert.equal(off.kept, 7, 'no reload');
    assert.deepEqual(await knobs(), { device: 'none', text: 48, width: 'full' });
    assert.equal(await stored(), false, 'kept for every tab');
    // A plain phone is devknobs' frame again, the tab its own size.
    await set(tab, { browser: 'off', device: 'iphone-17', mock: false });
    await tab.waitForFunction(
      () =>
        document
          .querySelector('[data-devknobs="viewport"]')
          ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')
          ?.contentWindow?.devknobs !== undefined,
    );
    await tab.evaluate(() => window.devknobs!.ready());
    const framed = await tab.evaluate(() => {
      const inner = document
        .querySelector('[data-devknobs="viewport"]')!
        .shadowRoot!.querySelector<HTMLIFrameElement>(
          'iframe[data-devknobs-frame]',
        )!.contentWindow!;
      return {
        innerFontSize: inner.getComputedStyle(inner.document.documentElement).fontSize,
        innerInline: inner.document.documentElement.style.fontSize,
        innerWidth,
        pageWidth: inner.innerWidth,
      };
    });
    log('mode: off, plain iPhone 17', framed);
    assert.equal(framed.innerWidth, on.innerWidth);
    assert.equal(framed.pageWidth, 402);
    assert.equal(framed.innerFontSize, '48px', 'the frame emulates the size too');
    assert.equal(framed.innerInline, '48px');
    assert.equal(await attached(), false);

    // (c) On again: the debugger is back, the in-page size gone, the phone the tab's own viewport.
    await flip();
    // A page with no viewport tag lays out at 980px in a phone's 402.
    await tab.waitForFunction(() => outerWidth === 402);
    await tab.waitForFunction(() => document.documentElement.style.fontSize === '');
    await tab.evaluate(() => window.devknobs!.ready());
    const back = await look();
    log('mode: on again', back);
    assert.equal(back.checked, 'true');
    assert.equal(back.fontSize, '48px');
    assert.equal(back.inline, '');
    assert.equal(back.frame, false);
    assert.equal(back.kept, 7);
    assert.equal(await attached(), true);
    assert.equal(await stored(), true);
    await set(tab, { device: 'none', dpr: 'system', height: 'full', width: 'full' });
    await tab.waitForFunction((width) => innerWidth === width, on.innerWidth);
    for (
      let tries = 0;
      (await tabKnobsOf(worker, tabId)).viewport !== null && tries < 50;
      tries++
    ) {
      await tab.waitForTimeout(20);
    }

    // (d) The user closes Chrome's bar: in-page for every tab, the knobs kept.
    await worker.evaluate(async (tabId) => {
      await chrome.debugger.detach({ tabId });
      (
        globalThis as unknown as {
          knobs: { detached: (tabId: number, reason: string) => void };
        }
      ).knobs.detached(tabId, 'canceled_by_user');
    }, tabId);
    await tab.waitForFunction(() => document.documentElement.style.fontSize === '48px');
    const closed = await look();
    log('mode: bar closed', closed);
    assert.equal(closed.checked, 'false');
    assert.equal(closed.hint, "switched to in-page: Chrome's debugger bar was closed");
    assert.equal(closed.fontSize, '48px');
    assert.equal(closed.kept, 7);
    assert.deepEqual(await knobs(), { device: 'none', text: 48, width: 'full' });
    assert.equal(await stored(), false);
    assert.equal(await attached(), false);
    // The switch's slide settled.
    await tab.waitForTimeout(400);
    await tab.screenshot({ path: join(out, 'settings-mode-bar-closed.png') });
    // Another tab loads in-page from the start, the debugger never on it.
    const other = await mode.newPage();
    await other.goto(url);
    await ready(other);
    await set(other, { text: 24 });
    await other.waitForFunction(() => document.documentElement.style.fontSize === '24px');
    const otherId = await worker.evaluate(
      async (tabId) => (await chrome.tabs.query({})).find((tab) => tab.id !== tabId)!.id!,
      tabId,
    );
    const otherAttached = await worker.evaluate(
      (tabId) =>
        chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
          () => true,
          () => false,
        ),
      otherId,
    );
    log('mode: another tab while off', { attached: otherAttached });
    assert.equal(otherAttached, false);
    log('screenshots', [join(out, 'settings-mode.png'), join(out, 'settings-mode-bar-closed.png')]);
  } finally {
    await mode.close();
    await rm(own, { force: true, recursive: true });
  }
}

/**
 * Why a frame was refused, as the tab's debugger saw it: under the notice, a line that names
 * the header, the redirect's host or the service worker, and a button that copies the record.
 * With no knob on the debugger, "find out why" puts it on for one more load. In-page, a hint.
 */
async function refusalCauses() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-refusal-'));
  const causes = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport,
  });
  try {
    await causes.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    const worker = causes.serviceWorkers()[0] ?? (await causes.waitForEvent('serviceworker'));
    const tab = causes.pages()[0] ?? (await causes.newPage());
    await tab.goto(`${url}deny`);
    await ready(tab);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const why = tab.locator('[data-devknobs="viewport"] .blocked .why');
    const line = why.locator('div').first();
    const cause = async (match: RegExp) => {
      await line.filter({ hasText: match }).waitFor({ timeout: 10_000 });
      return line.textContent();
    };
    const copied = async () => {
      await why.locator('button.copy').click();
      await why.locator('button.copy', { hasText: 'copied' }).waitFor();
      return JSON.parse(await tab.evaluate(() => navigator.clipboard.readText())) as Record<
        string,
        unknown
      >;
    };
    // The framing rules stay off this tab, so its own frame is refused.
    const dropRule = () =>
      worker.evaluate((tabId) => {
        const rules = chrome.declarativeNetRequest;
        const update = rules.updateSessionRules.bind(rules);
        Object.assign(rules, {
          updateSessionRules: (options: chrome.declarativeNetRequest.UpdateRuleOptions) =>
            update({
              ...options,
              addRules: options.addRules?.filter((rule) => !rule.condition.tabIds?.includes(tabId)),
            }),
        });
      }, tabId);
    const unframe = async () => {
      await set(tab, { frame: false, width: 'full' });
      await tab.evaluate(() => window.devknobs!.ready());
    };

    // (a) No knob has the debugger on, as with a mocked phone: the button watches one more load.
    await dropRule();
    await set(tab, { frame: true, width: 400 });
    const unwatched = await cause(/not watching/);
    log('refusal: unwatched', unwatched);
    assert.equal(await attached(), false);
    await why.locator('button.retry').click();
    const denied = await cause(/frame-ancestors|X-Frame-Options/);
    log('refusal: deny page', denied);
    assert.equal(denied, `blocked by Chrome: frame-ancestors 'none' on 127.0.0.1`);
    const record = await copied();
    log('refusal: deny record', record);
    assert.equal((record.response as { status: number }).status, 200);
    assert.deepEqual((record.response as { headers: unknown }).headers, {
      'content-security-policy': "frame-ancestors 'none'",
      'x-frame-options': 'DENY',
    });
    assert.deepEqual(record.sent, { secFetchDest: 'iframe', secFetchSite: 'same-origin' });
    assert.equal(record.finalUrl, 'chrome-error://chromewebdata/');
    assert.ok((record.issues as Array<unknown>).length > 0, "Chrome's issue is kept");
    assert.ok((record.console as Array<string>).length > 0, "Chrome's console line is kept");
    await mkdir(out, { recursive: true });
    await tab.screenshot({ path: join(out, 'refusal-cause.png') });
    for (let tries = 0; (await attached()) && tries < 50; tries++) {
      await tab.waitForTimeout(20);
    }
    assert.equal(await attached(), false, 'the debugger leaves once it has watched');
    await unframe();

    // (b) A knob keeps the debugger on: a redirect to another site is named, not followed.
    await tab.goto(`${url}bounce`);
    await ready(tab);
    await set(tab, { text: 20 });
    await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '20px');
    await set(tab, { frame: true, width: 400 });
    const bounced = await cause(/redirected/);
    log('refusal: redirect', bounced);
    assert.equal(
      bounced,
      `redirected to another site: localhost; blocked by Chrome: frame-ancestors 'none' on localhost`,
    );
    const redirect = await copied();
    assert.equal(
      (redirect.redirects as Array<{ status: number }>)[0]?.status,
      302,
      'the redirect is kept',
    );
    await unframe();

    // (c) A service worker answers the frame with X-Frame-Options, which no rule can strip: once
    // the loads again fail, the notice says so in plain words, the record has the cause.
    await tab.goto(`${url}sw-deny`);
    await ready(tab);
    await tab.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await set(tab, { frame: true, width: 400 });
    const fromWorker = await cause(/service worker/);
    log('refusal: service worker', fromWorker);
    assert.equal(
      fromWorker,
      `127.0.0.1:${port}/sw-deny answered 200 with X-Frame-Options: DENY (from a service worker); this site's service worker serves a saved copy of the page that refuses frames`,
    );
    const served = (await copied()).response as Record<string, unknown>;
    log('refusal: service worker response', served);
    assert.equal(served.fromServiceWorker, true);
    assert.equal(served.serviceWorkerScope, url);
    await unframe();
    await set(tab, { text: 'system' });

    // (d) In-page, the debugger saw nothing.
    await worker.evaluate(() => chrome.storage.local.set({ native: false }));
    await tab.goto(`${url}deny`);
    await ready(tab);
    await dropRule();
    await set(tab, { frame: true, width: 400 });
    const inPage = await cause(/real browser settings/);
    log('refusal: in-page', inPage);
    assert.equal(inPage, 'turn on real browser settings to see why');
    log('screenshots', [join(out, 'refusal-cause.png')]);
  } finally {
    await causes.close();
    await rm(own, { force: true, recursive: true });
  }
}

/** The text of the frame's heading, null where it holds no page of ours, and whether the notice shows. */
const framedText = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    const frame = root?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]');
    let text: string | null;
    try {
      text = frame?.contentDocument?.querySelector('h1')?.textContent ?? null;
    } catch {
      text = null;
    }
    const notice = root?.querySelector<HTMLElement>('.blocked');
    return { notice: notice ? !notice.hidden : null, text };
  });

/**
 * A page whose own service worker loads it. One that fetches it from the network gets the
 * framing rule for service workers while the frame is open, real and in-page, with at most one
 * load again and no notice; the rule goes with the frame and with the tab. One that answers from
 * its cache says so under the notice, and its button loads the frame past the service worker,
 * through the debugger, which leaves again with the frame.
 */
async function workerFrames() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-worker-'));
  const workers = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport,
  });
  try {
    const worker = workers.serviceWorkers()[0] ?? (await workers.waitForEvent('serviceworker'));
    const tab = workers.pages()[0] ?? (await workers.newPage());
    const tabIdOf = (page: Page) =>
      worker.evaluate(
        async (at) => (await chrome.tabs.query({})).find((one) => one.url === at)!.id!,
        page.url(),
      );
    const attached = (tabId: number) =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const bypassing = (tabId: number) =>
      worker.evaluate(
        (tabId) =>
          (
            globalThis as unknown as { knobs: { bypassing: (tabId: number) => boolean } }
          ).knobs.bypassing(tabId),
        tabId,
      );
    const workerRules = () =>
      worker.evaluate(async () =>
        (await chrome.declarativeNetRequest.getSessionRules())
          .filter(({ condition }) => condition.tabIds?.includes(-1))
          .map(({ condition }) => ({
            hosts: condition.requestDomains,
            tabIds: condition.tabIds,
            types: condition.resourceTypes,
          })),
      );
    const until = async (check: () => Promise<boolean>) => {
      for (let tries = 0; !(await check()) && tries < 100; tries++) {
        await tab.waitForTimeout(20);
      }
      return check();
    };
    // The page with its service worker in control, which takes a second load.
    const controlled = async (page: Page, at: string) => {
      await page.goto(at);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await ready(page);
      assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), true);
    };
    const loadsIn = async (page: Page, want: string) => {
      for (let tries = 0; tries < 150; tries++) {
        const seen = await framedText(page);
        if (seen.text === want && seen.notice === false) {
          return seen;
        }
        await page.waitForTimeout(20);
      }
      return framedText(page);
    };
    const unframe = async (page: Page) => {
      await set(page, { frame: false, width: 'full' });
      await page.evaluate(() => window.devknobs!.ready());
    };
    const noWorkerRules = () => until(async () => (await workerRules()).length === 0);

    // (a) The service worker fetches the page from the network: real, then in-page.
    const network = `${url}worker/network/page`;
    await controlled(tab, network);
    const tabId = await tabIdOf(tab);
    for (const native of [true, false]) {
      await worker.evaluate((on) => chrome.storage.local.set({ native: on }), native);
      await tab.reload();
      await ready(tab);
      const before = workerLoads.get('network') ?? 0;
      await set(tab, { frame: true, width: 400 });
      const seen = await loadsIn(tab, 'from the network');
      const rules = await workerRules();
      log(`worker network ${native ? 'real' : 'in-page'}`, {
        ...seen,
        frameLoads: (workerLoads.get('network') ?? 0) - before,
        rules,
      });
      assert.deepEqual(seen, { notice: false, text: 'from the network' });
      // One takes X-Frame-Options off, the other the CSP whose frame-ancestors refuses the page.
      const rule = { hosts: ['127.0.0.1'], tabIds: [-1], types: ['xmlhttprequest'] };
      assert.deepEqual(rules, [rule, rule]);
      assert.equal(await attached(tabId), false, 'no debugger for a network fetch');
      await unframe(tab);
      assert.equal(await noWorkerRules(), true, 'the rule goes with the frame');
    }
    await worker.evaluate(() => chrome.storage.local.set({ native: true }));

    // (c) The rule goes with the tab too.
    const other = await workers.newPage();
    await controlled(other, network);
    await set(other, { frame: true, width: 400 });
    assert.deepEqual(await loadsIn(other, 'from the network'), {
      notice: false,
      text: 'from the network',
    });
    assert.equal((await workerRules()).length, 2);
    await other.close();
    assert.equal(await noWorkerRules(), true, 'the rule goes with the tab');
    log('worker rule', 'gone with the frame and with the tab');

    // (b) The service worker answers from its cache: the notice says so, and its button loads
    // the page past it. A knob keeps the debugger on, to watch the load.
    const cache = `${url}worker/cache/page`;
    await controlled(tab, cache);
    const why = tab.locator('[data-devknobs="viewport"] .blocked .why');
    const bypass = why.locator('button.retry', { hasText: 'past the service worker' });
    await set(tab, { text: 20 });
    await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '20px');
    await set(tab, { frame: true, width: 400 });
    await why.locator('div', { hasText: /saved copy/ }).waitFor({ timeout: 10_000 });
    const cached = await why.locator('div').first().textContent();
    log('worker cache', cached);
    assert.equal(
      cached,
      "blocked by Chrome: frame-ancestors 'none' on 127.0.0.1 (from a service worker); this site's service worker serves a saved copy of the page that refuses frames",
    );
    log('worker cache button', await bypass.textContent());
    await bypass.click();
    assert.deepEqual(await loadsIn(tab, 'from the network'), {
      notice: false,
      text: 'from the network',
    });
    assert.equal(await bypassing(tabId), true);
    await unframe(tab);
    assert.equal(
      await until(async () => !(await bypassing(tabId))),
      true,
      'bypass goes with the frame',
    );
    assert.equal(await attached(tabId), true, 'the text knob keeps the debugger');
    await set(tab, { text: 'system' });
    assert.equal(await until(async () => !(await attached(tabId))), true);

    // With no knob on the debugger, the button puts it on, and closing the frame takes it off.
    await set(tab, { frame: true, width: 400 });
    await bypass.waitFor({ timeout: 10_000 }).catch(async (error: unknown) => {
      log('worker cache unwatched, no button', await why.textContent());
      throw error;
    });
    log('worker cache unwatched', await why.locator('div').first().textContent());
    await bypass.click();
    assert.deepEqual(await loadsIn(tab, 'from the network'), {
      notice: false,
      text: 'from the network',
    });
    assert.equal(await attached(tabId), true);
    await unframe(tab);
    assert.equal(await until(async () => !(await attached(tabId))), true, 'the debugger leaves');
    assert.equal(await bypassing(tabId), false);
    assert.equal(await noWorkerRules(), true);
    log('worker cache bypass', 'loaded, then off and detached with the frame');

    // (d) A page whose app takes devknobs' nodes out as it starts, or puts a new <body> in,
    // answered from the worker's cache in the frame: devknobs puts the frame and the panel back,
    // and the button loads it past the worker with a mocked phone. `reloads` reloads the tab
    // then, and the frame its stored knobs open again still skips the worker.
    for (const kind of ['clears', 'replaces', 'reloads']) {
      const at = `${url}worker/${kind}/page`;
      await controlled(tab, at);
      const appId = await tabIdOf(tab);
      await set(tab, { device: 'iphone-18-pro', mock: true });
      // Stored, the knobs open the frame as the page loads, before the app clears it.
      await tab.reload();
      await ready(tab);
      await tab.waitForTimeout(600);
      const kept = await tab.evaluate(() => ({
        body: document.body.querySelector('h1')?.textContent ?? null,
        panel: document.querySelector('[data-devknobs="panel"]')?.parentNode === document.body,
        viewport:
          document.querySelector('[data-devknobs="viewport"]')?.parentNode === document.body,
      }));
      assert.deepEqual(kept, { body: 'from the app', panel: true, viewport: true }, kind);
      const appWhy = tab.locator('[data-devknobs="viewport"] .blocked .why');
      const appBypass = appWhy.locator('button.retry', { hasText: 'past the service worker' });
      await appBypass.waitFor({ timeout: 10_000 });
      const reloaded = kind === 'reloads' ? tab.waitForEvent('load') : null;
      await appBypass.click();
      if (reloaded) {
        await reloaded;
        await ready(tab);
        assert.equal(await tab.evaluate(() => sessionStorage.getItem('appReloaded')), '1');
      }
      const seen = await loadsIn(tab, 'from the app');
      const shown = await tab.evaluate(() => {
        const root = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
        return {
          hidden: [...document.body.children]
            .filter((node) => !node.hasAttribute('data-devknobs'))
            .every((node) => node.hasAttribute('inert')),
          mock: root?.querySelector('.drawing svg, .drawing img') != null,
        };
      });
      log(`worker app ${kind}`, { ...kept, ...seen, ...shown });
      assert.deepEqual(seen, { notice: false, text: 'from the app' }, kind);
      assert.deepEqual(shown, { hidden: true, mock: true }, kind);
      assert.equal(await bypassing(appId), true, kind);
      assert.equal(await attached(appId), true, `${kind}: Chrome's bar shows`);
      await set(tab, { device: 'none', dpr: 'system', height: 'full', mock: false, width: 'full' });
      await tab.evaluate(() => window.devknobs!.ready());
      assert.equal(await until(async () => !(await attached(appId))), true, `${kind}: detached`);
      assert.equal(await bypassing(appId), false);
      assert.equal(await noWorkerRules(), true);
      await tab.evaluate(() => sessionStorage.removeItem('appReloaded'));
    }
  } finally {
    await workers.close();
    await rm(own, { force: true, recursive: true });
  }
}

/**
 * Pages that refused devknobs' frame on its first open load with no notice and no debugger: one
 * whose own frame-src policy leaves its origin out, one whose service worker answers from a copy
 * that refuses frames and saves a new one behind it, as X's does, and one whose server sends a
 * phone to another origin, where the tab follows with its device. X-Frame-Options always goes,
 * and a CSP whose frame-ancestors lets the page itself in stays.
 */
async function firstOpen() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-first-'));
  const first = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport,
  });
  try {
    const worker = first.serviceWorkers()[0] ?? (await first.waitForEvent('serviceworker'));
    const tab = first.pages()[0] ?? (await first.newPage());
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    // Counts the animation frames in which the frame shows an error page, or nothing it can read,
    // with neither devknobs' loading cover nor its notice over it.
    const watchExposed = () =>
      tab.evaluate(() => {
        const marked = window as Window & { exposedFrames?: number };
        marked.exposedFrames = 0;
        const look = () => {
          const root = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
          const frame = root?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]');
          if (frame) {
            let doc: Document | null;
            try {
              doc = frame.contentDocument;
            } catch {
              doc = null;
            }
            const over = (selector: string) =>
              root?.querySelector<HTMLElement>(selector)?.hidden === false;
            if (doc === null && !over('.loading') && !over('.blocked')) {
              marked.exposedFrames! += 1;
            }
          }
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      });
    const exposedFrames = () =>
      tab.evaluate(() => (window as Window & { exposedFrames?: number }).exposedFrames ?? -1);
    // Polls the frame until it shows `want`, noting whether the notice ever came up meanwhile.
    const opens = async (want: string) => {
      const start = Date.now();
      let noticed = false;
      let seen = await framedText(tab);
      while (!(seen.text === want && seen.notice === false) && Date.now() - start < 10_000) {
        noticed ||= seen.notice === true;
        await tab.waitForTimeout(20);
        seen = await framedText(tab);
      }
      return { ...seen, ms: Date.now() - start, noticed };
    };
    const innerRan = () =>
      tab.evaluate(
        () =>
          (
            document
              .querySelector('[data-devknobs="viewport"]')
              ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')
              ?.contentWindow as (Window & { inlineRan?: boolean }) | null
          )?.inlineRan === true,
      );
    const unframe = async () => {
      await set(tab, { device: 'none', frame: false, width: 'full' });
      await tab.evaluate(() => window.devknobs!.ready());
    };

    // (a) The page's own frame-src leaves its origin out.
    await tab.goto(`${url}frame-src`);
    await ready(tab);
    await watchExposed();
    await set(tab, { frame: true, width: 400 });
    const framed = await opens('devknobs smoke');
    const framedExposed = await exposedFrames();
    log('first open frame-src', { ...framed, exposed: framedExposed });
    assert.equal(framed.text, 'devknobs smoke');
    assert.equal(framed.noticed, false);
    assert.equal(framedExposed, 0, 'no error page shows uncovered');
    // A link clicked in the frame, then a reload of it from the page above, as devknobs' own
    // reloads go: the page's frame-src holds them too, and they land all the same.
    await tab.evaluate(() => {
      const inner = document
        .querySelector('[data-devknobs="viewport"]')!
        .shadowRoot!.querySelector<HTMLIFrameElement>(
          'iframe[data-devknobs-frame]',
        )!.contentDocument!;
      const link = inner.createElement('a');
      link.href = '/frame-src-next';
      inner.body.append(link);
      link.click();
    });
    const clicked = await opens('the next page');
    await tab.evaluate(() => {
      const inner = document
        .querySelector('[data-devknobs="viewport"]')!
        .shadowRoot!.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')!;
      inner.contentDocument!.querySelector('h1')!.textContent = 'before the reload';
      inner.contentWindow!.location.reload();
    });
    const reloadedFrame = await opens('the next page');
    log('first open frame-src link and reload', { clicked, reloadedFrame });
    assert.equal(clicked.text, 'the next page');
    assert.equal(reloadedFrame.text, 'the next page');
    // Closed, the frame hands the tab the page it went to.
    await Promise.all([
      tab.waitForURL(`${url}frame-src-next`),
      set(tab, { frame: false, width: 'full' }).catch(() => {}),
    ]);
    await ready(tab);

    // A next page slow to answer, with and without a service worker: the frame lands on it,
    // a link clicked and a reload alike, and the notice never shows meanwhile.
    for (const kind of ['plain', 'sw']) {
      await tab.goto(`${url}slow/${kind}/page`);
      if (kind === 'sw') {
        await tab.evaluate(async () => {
          await navigator.serviceWorker.ready;
        });
        await tab.reload();
      }
      await ready(tab);
      await set(tab, { frame: true, width: 400 });
      await opens('devknobs smoke');
      await tab.evaluate(() => {
        const inner = document
          .querySelector('[data-devknobs="viewport"]')!
          .shadowRoot!.querySelector<HTMLIFrameElement>(
            'iframe[data-devknobs-frame]',
          )!.contentDocument!;
        const link = inner.createElement('a');
        link.href = 'next';
        inner.body.append(link);
        link.click();
      });
      const slowClick = await opens('the next page');
      await tab.evaluate(() => {
        const inner = document
          .querySelector('[data-devknobs="viewport"]')!
          .shadowRoot!.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')!;
        inner.contentDocument!.querySelector('h1')!.textContent = 'before the reload';
        inner.contentWindow!.location.reload();
      });
      await tab.waitForTimeout(100);
      const slowReload = await opens('the next page');
      log(`first open frame-src slow ${kind}`, { slowClick, slowReload });
      assert.deepEqual(
        [slowClick.text, slowClick.noticed, slowReload.text, slowReload.noticed],
        ['the next page', false, 'the next page', false],
        kind,
      );
      await Promise.all([
        tab.waitForURL(`${url}slow/${kind}/next`),
        set(tab, { frame: false, width: 'full' }).catch(() => {}),
      ]);
      await ready(tab);
    }

    // A frame of the page's own its policy refuses leaves devknobs' frame where it is.
    const inFrame = () =>
      tab.evaluate(
        () =>
          document
            .querySelector('[data-devknobs="viewport"]')
            ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')
            ?.contentDocument?.querySelector('h1')?.textContent ?? null,
      );
    await tab.goto(`${url}frame-src`);
    await ready(tab);
    await set(tab, { frame: true, width: 400 });
    await opens('devknobs smoke');
    await tab.evaluate(() => {
      const own = document.createElement('iframe');
      own.src = '/frame-src-next?own';
      document.body.append(own);
    });
    await tab.waitForTimeout(1500);
    const ownFrame = {
      devknobs: await inFrame(),
      loads: nextLoads.get('/frame-src-next?own') ?? 0,
    };
    log('first open frame-src, own frame refused', ownFrame);
    assert.deepEqual(ownFrame, { devknobs: 'devknobs smoke', loads: 0 });
    await unframe();

    // A policy that only reports: a link clicked in the frame loads once, as Chrome loads it.
    await tab.goto(`${url}frame-src-report`);
    await ready(tab);
    await set(tab, { frame: true, width: 400 });
    await opens('devknobs smoke');
    await tab.evaluate(() => {
      const inner = document
        .querySelector('[data-devknobs="viewport"]')!
        .shadowRoot!.querySelector<HTMLIFrameElement>(
          'iframe[data-devknobs-frame]',
        )!.contentDocument!;
      const link = inner.createElement('a');
      link.href = '/frame-src-next?report';
      inner.body.append(link);
      link.click();
    });
    await opens('the next page');
    await tab.waitForTimeout(1500);
    const reported = nextLoads.get('/frame-src-next?report');
    log('first open frame-src, report only', { loads: reported });
    assert.equal(reported, 1);
    await Promise.all([
      tab.waitForURL(`${url}frame-src-next?report`),
      set(tab, { frame: false, width: 'full' }).catch(() => {}),
    ]);
    await ready(tab);

    // (b) A CSP whose frame-ancestors has 'self', or that has none, stays, X-Frame-Options
    // aside; 'none' goes.
    const policies: Record<string, unknown> = {};
    for (const kind of ['self', 'none', 'absent']) {
      await tab.goto(`${url}ancestors-${kind}`);
      await ready(tab);
      await set(tab, { frame: true, width: 400 });
      const seen = await opens('devknobs smoke');
      policies[kind] = { inlineRan: await innerRan(), text: seen.text };
      await unframe();
    }
    log('first open frame-ancestors', policies);
    assert.deepEqual(policies, {
      absent: { inlineRan: false, text: 'devknobs smoke' },
      none: { inlineRan: true, text: 'devknobs smoke' },
      self: { inlineRan: false, text: 'devknobs smoke' },
    });

    // (c) The service worker answers from a copy that refuses frames and saves a new one behind.
    await tab.goto(`${url}worker/stale/page`);
    await tab.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await tab.reload();
    await ready(tab);
    await watchExposed();
    await set(tab, { frame: true, width: 400 });
    const stale = await opens('from the network');
    const staleExposed = await exposedFrames();
    const debuggerOn = await attached();
    log('first open stale worker', { ...stale, debuggerOn, exposed: staleExposed });
    assert.equal(staleExposed, 0, 'the refused copy never shows uncovered');
    assert.equal(stale.text, 'from the network');
    assert.equal(stale.noticed, false, 'no notice while it loads again');
    assert.equal(debuggerOn, false, 'no debugger');
    await unframe();

    // (d) In real phone mode, as an iPhone, the frame's page on www.knobs.localhost is sent to m.knobs.localhost,
    // of the same site: the tab follows.
    await tab.goto(`http://www.knobs.localhost:${port}/phone`);
    await ready(tab);
    await set(tab, { device: 'iphone-18-pro', mock: true, panel: { realPhone: true } });
    await tab.waitForURL(`http://m.knobs.localhost:${port}/phone`, { timeout: 10_000 });
    await ready(tab);
    const followed = await opens('devknobs smoke');
    const device = await tab.evaluate(() => window.devknobs!.getState().device);
    log('first open followed', { ...followed, device, url: tab.url() });
    assert.equal(device, 'iphone-18-pro');
    assert.equal(followed.text, 'devknobs smoke');
    await unframe();
  } finally {
    await first.close();
    await rm(own, { force: true, recursive: true });
  }
}

/** What the panel, its rows, and devknobs' layers on the page compute to, which no style means defaults. */
const looks = (tab: Page) =>
  tab.evaluate(() => {
    const panel = document.querySelector('[data-devknobs="panel"]')?.shadowRoot;
    const viewport = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    const elements = {
      blocked: viewport?.querySelector('.blocked:not([hidden])'),
      grab: document.querySelector('[data-devknobs="grab"]')?.shadowRoot?.querySelector('.layer'),
      host: document.querySelector('[data-devknobs="panel"]'),
      row: panel?.querySelector('[data-row]'),
      viewport: viewport?.querySelector('.viewport'),
      wrap: panel?.querySelector('.wrap'),
    };
    return Object.fromEntries(
      Object.entries(elements).map(([name, element]) => {
        if (!element) {
          return [name, null];
        }
        const { backgroundColor, display, position } = getComputedStyle(element);
        return [name, { backgroundColor, display, position }];
      }),
    );
  });

/**
 * A page whose policy lets in no inline style, `style-src 'self'; style-src-attr 'none'`, gets
 * devknobs drawn as on a page with no policy, pixel for pixel: the panel open, a knob's editor
 * open, grab's overlay, the notice of a frame refused, and a phone's frame in its body.
 */
/** A screenshot once two in a row come out the same: frames loaded, images drawn. */
async function settled(tab: Page) {
  let last = await tab.screenshot();
  for (let tries = 0; tries < 20; tries++) {
    await tab.waitForTimeout(100);
    const next = await tab.screenshot();
    if (next.equals(last)) {
      return next;
    }
    last = next;
  }
  return last;
}

/**
 * How many pixels of two same-sized PNGs differ, how many by more than a faint step in any
 * channel, and the box they sit in, decoded by the browser.
 */
async function pixelsApart(browser: Browser, a: Buffer, b: Buffer) {
  const tab = await browser.newPage();
  try {
    return await tab.evaluate(
      async (pngs) => {
        const decoded: Array<ImageData> = [];
        for (const base64 of pngs) {
          const image = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${base64}`)).blob(),
          );
          const context = new OffscreenCanvas(image.width, image.height).getContext('2d')!;
          context.drawImage(image, 0, 0);
          decoded.push(context.getImageData(0, 0, image.width, image.height));
        }
        const [{ data: one, width }, { data: two }] = decoded as [ImageData, ImageData];
        if (one.length !== two.length) {
          return { apart: -1, box: null, far: -1 };
        }
        let apart = 0;
        let far = 0;
        const box = { bottom: -1, left: Infinity, right: -1, top: Infinity };
        for (let index = 0; index < one.length; index += 4) {
          let most = 0;
          for (let channel = index; channel < index + 4; channel++) {
            most = Math.max(most, Math.abs(one[channel]! - two[channel]!));
          }
          if (most > 0) {
            apart++;
            if (most > 16) {
              far++;
            }
            const x = (index / 4) % width;
            const y = Math.floor(index / 4 / width);
            box.left = Math.min(box.left, x);
            box.right = Math.max(box.right, x);
            box.top = Math.min(box.top, y);
            box.bottom = Math.max(box.bottom, y);
          }
        }
        return { apart, box: apart > 0 ? box : null, far };
      },
      [a.toString('base64'), b.toString('base64')],
    );
  } finally {
    await tab.close();
  }
}

async function strictPolicy() {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    type Step = { name: string; run: (tab: Page, base: string) => Promise<void> };
    const steps: Array<Step> = [
      {
        name: 'panel open',
        run: async (tab) => {
          await openPanel(tab);
        },
      },
      {
        name: 'knob open',
        run: async (tab) => {
          await openPanel(tab);
          await tab.evaluate(() =>
            document
              .querySelector('[data-devknobs="panel"]')!
              .shadowRoot!.querySelector<HTMLElement>('[aria-expanded="false"]')!
              .click(),
          );
        },
      },
      {
        name: 'grab',
        run: async (tab) => {
          await openPanel(tab);
          await tab.evaluate(() => window.devknobs!.setState({ panel: { pinned: ['grab'] } }));
          await tab.evaluate(() => window.devknobs!.ready());
          await tab.evaluate(() =>
            document
              .querySelector('[data-devknobs="panel"]')!
              .shadowRoot!.querySelector<HTMLElement>('[data-row="grab"] [aria-pressed]')!
              .click(),
          );
          const box = (await tab.locator('h1').boundingBox())!;
          await tab.mouse.move(box.x + 10, box.y + 10);
          await tab.mouse.move(box.x + 20, box.y + 12);
        },
      },
      {
        name: 'refusal notice',
        run: async (tab, base) => {
          await tab.goto(`${base}-deny`);
          await ready(tab);
          await set(tab, { frame: true, width: 400 });
          await tab.waitForFunction(
            () =>
              document
                .querySelector('[data-devknobs="viewport"]')
                ?.shadowRoot?.querySelector('.blocked:not([hidden])') != null,
          );
        },
      },
      {
        name: 'phone mock',
        run: async (tab) => {
          await set(tab, { browser: 'off', device: 'iphone-17', mock: true });
          await tab.waitForFunction(
            () =>
              document
                .querySelector('[data-devknobs="viewport"]')
                ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')
                ?.contentWindow?.devknobs !== undefined,
          );
        },
      },
    ];
    for (const step of steps) {
      const shots: Array<Buffer> = [];
      const seen: Array<unknown> = [];
      for (const kind of ['loose', 'strict']) {
        const tab = await browser.newPage({
          colorScheme: 'light',
          reducedMotion: 'reduce',
          viewport,
        });
        const blocked: Array<string> = [];
        tab.on('console', (message) => {
          if (/Content Security Policy/.test(message.text())) {
            blocked.push(message.text());
          }
        });
        const base = `${url}${kind}`;
        await tab.goto(base);
        await ready(tab);
        await step.run(tab, base);
        await tab.evaluate(() => window.devknobs!.ready());
        await tab.waitForTimeout(600);
        seen.push(await looks(tab));
        shots.push(await settled(tab));
        if (kind === 'strict') {
          log(`strict policy: ${step.name}`, { blocked, looks: seen[1] });
          assert.deepEqual(blocked, [], `nothing of devknobs is blocked: ${step.name}`);
        }
        await tab.close();
      }
      assert.deepEqual(seen[1], seen[0], `the same styles: ${step.name}`);
      if (!shots[0]!.equals(shots[1]!)) {
        const name = step.name.replaceAll(' ', '-');
        await mkdir(out, { recursive: true });
        await writeFile(join(out, `strict-${name}-loose.png`), shots[0]!);
        await writeFile(join(out, `strict-${name}-strict.png`), shots[1]!);
        const differ = await pixelsApart(browser, shots[0]!, shots[1]!);
        log(`strict policy: ${step.name}, pixels apart`, differ);
        // Under load Chromium can round an image's edge a step or two apart, the bezel's on CI:
        // a few faint pixels pass, a changed color or layout does not.
        assert.equal(differ.far, 0, `the same pixels: ${step.name}`);
        assert.ok(differ.apart <= 500, `the same pixels: ${step.name}`);
      }
    }
  } finally {
    await browser.close();
  }
}

declare global {
  interface Window {
    oldClaims?: number;
    oldMounted?: boolean;
    oldReleased?: number;
    pageMounted?: boolean;
    pageUnmount?: () => void;
  }
}

/** The panels on the page, each with whether it is the extension's, which has the native switch. */
const panels = (tab: Page) =>
  tab.evaluate(() =>
    [...document.querySelectorAll('[data-devknobs="panel"]')].map((host) => ({
      extension:
        host.shadowRoot?.querySelector('[aria-describedby="devknobs-native-hint"]') != null,
      id: host.id,
    })),
  );

/**
 * A page that mounts devknobs itself: the extension's copy holds the page as its host, so the
 * page's copy puts up no panel of its own and hands it its hotkey and grab's color, and the
 * page's calls to its own copy move the extension's knobs. Its unmount leaves the panel. A copy
 * that knows no hosts takes the page, and the host takes it back, three times at most, its
 * settings' switch as it was.
 */
async function pageOwnCopy() {
  const tab = await context.newPage();
  const errors: Array<string> = [];
  tab.on('pageerror', (error) => errors.push(String(error)));
  await tab.goto(`${url}own`);
  await tab.waitForFunction(() => window.pageMounted === true);
  await ready(tab);
  await tab.waitForTimeout(300);
  const own = {
    grabColor: await tab.evaluate(() => window.devknobs!.getState().grabColor),
    panels: await panels(tab),
  };
  log('page with its own devknobs', own);
  assert.deepEqual(own, { grabColor: 'green', panels: [{ extension: true, id: '' }] });
  // The page's own module api, the same copy its script mounted, goes to the extension's.
  const forwarded = await tab.evaluate(async () => {
    // The page's url for the module build, which TypeScript cannot resolve from here.
    const at = '/devknobs/index.js';
    const own: typeof import('@vinena/knobs') = await import(at);
    const before = window.devknobs!.getState().scheme;
    own.setState({ scheme: 'dark' });
    const ready = await own.ready().then(
      () => 'resolved',
      (error: unknown) => `rejected: ${String(error)}`,
    );
    const after = window.devknobs!.getState().scheme;
    own.setState({ scheme: before });
    return { after, ready, same: own.getState().scheme === window.devknobs!.getState().scheme };
  });
  log("the page's module api", forwarded);
  assert.deepEqual(forwarded, { after: 'dark', ready: 'resolved', same: true });
  await tab.evaluate(() => window.devknobs!.setState({ panel: { open: false } }));
  await tab.evaluate(() => window.devknobs!.ready());
  await tab.keyboard.press('Shift+J');
  await tab.waitForFunction(() => window.devknobs!.getState().panel.open);
  await tab.evaluate(() => window.pageUnmount!());
  await tab.waitForTimeout(300);
  const after = {
    api: await tab.evaluate(() => typeof window.devknobs),
    panels: await panels(tab),
  };
  log("after the page's unmount", after);
  assert.deepEqual(after, { api: 'object', panels: [{ extension: true, id: '' }] });

  await tab.goto(`${url}own-old`);
  await tab.waitForFunction(() => window.oldMounted === true);
  await ready(tab);
  await tab.waitForTimeout(500);
  const old = {
    api: await tab.evaluate(() => typeof window.devknobs?.getState),
    panels: await panels(tab),
    released: await tab.evaluate(() => window.oldReleased),
  };
  log('page with a copy that knows no hosts', old);
  assert.deepEqual(old, { api: 'function', panels: [{ extension: true, id: '' }], released: 1 });

  // A copy that claims the page again each time: three take-backs, then it keeps the page.
  const warnings: Array<string> = [];
  tab.on('console', (message) => {
    if (message.text().startsWith('devknobs:')) {
      warnings.push(message.text());
    }
  });
  await tab.goto(`${url}own-old?n=4`);
  await tab.waitForFunction(() => window.oldClaims === 4);
  await tab.waitForTimeout(500);
  const kept = {
    api: await tab.evaluate(() => (window.devknobs as unknown as { old?: boolean }).old),
    panels: await panels(tab),
    released: await tab.evaluate(() => window.oldReleased),
    warnings: warnings.length,
  };
  log('page with a copy that keeps claiming', kept);
  assert.deepEqual(kept, {
    api: true,
    panels: [{ extension: false, id: 'old' }],
    released: 3,
    warnings: 1,
  });

  // In-page from the settings' switch: a take-back keeps the switch off, the size emulated.
  await tab.goto(url);
  await ready(tab);
  await openPanel(tab);
  const switchOf = () =>
    tab.evaluate(() =>
      document
        .querySelector('[data-devknobs="panel"]')
        ?.shadowRoot?.querySelector('[aria-describedby="devknobs-native-hint"]')
        ?.getAttribute('aria-checked'),
    );
  const flip = () =>
    tab.evaluate(() =>
      document
        .querySelector('[data-devknobs="panel"]')!
        .shadowRoot!.querySelector<HTMLElement>('[aria-describedby="devknobs-native-hint"]')!
        .click(),
    );
  await flip();
  await tab.waitForFunction(
    () =>
      document
        .querySelector('[data-devknobs="panel"]')
        ?.shadowRoot?.querySelector('[aria-describedby="devknobs-native-hint"]')
        ?.getAttribute('aria-checked') === 'false',
  );
  await set(tab, { text: 48 });
  await tab.waitForFunction(() => document.documentElement.style.fontSize === '48px');
  await tab.goto(`${url}own-old`);
  await ready(tab);
  await tab.waitForFunction(() => window.oldReleased === 1);
  await tab.waitForFunction(async () => {
    await window.devknobs?.ready?.();
    return getComputedStyle(document.documentElement).fontSize === '48px';
  });
  await tab.waitForTimeout(300);
  const inPage = {
    fontSize: await tab.evaluate(() => getComputedStyle(document.documentElement).fontSize),
    inline: await tab.evaluate(() => document.documentElement.style.fontSize),
    switch: await switchOf(),
  };
  log('in-page, after a take-back', inPage);
  assert.deepEqual(inPage, { fontSize: '48px', inline: '48px', switch: 'false' });
  // Back as it was for whatever runs next.
  await openPanel(tab);
  await flip();
  await set(tab, { text: 'system' });
  await tab.evaluate(() => window.devknobs!.ready());
  assert.deepEqual(errors, []);
  await tab.close();
}

/** What the panel's footer names as the copy that runs it, and whether its settings offer the choice. */
const runtimeOf = (tab: Page) =>
  tab.evaluate(() =>
    [...document.querySelectorAll('[data-devknobs="panel"]')].map((host) => ({
      extension:
        host.shadowRoot?.querySelector('[aria-describedby="devknobs-native-hint"]') != null,
      prefer: host.shadowRoot?.querySelector('[aria-describedby="devknobs-prefer-hint"]') != null,
      runtime: host.shadowRoot?.querySelector('.runtime')?.textContent ?? null,
    })),
  );

/** Open the settings of the one panel on the page, and pick who runs it there. */
async function pick(tab: Page, value: 'extension' | 'page') {
  await tab.evaluate(() => window.devknobs!.setState({ panel: { open: true } }));
  await tab.evaluate(() => window.devknobs!.ready());
  await tab.evaluate((value) => {
    const root = document.querySelector('[data-devknobs="panel"]')!.shadowRoot!;
    if (root.querySelector('.keys-toggle')!.getAttribute('aria-pressed') !== 'true') {
      root.querySelector<HTMLElement>('.keys-toggle')!.click();
    }
    const item = [
      ...root.querySelectorAll<HTMLElement>('[aria-describedby="devknobs-prefer-hint"] .seg-item'),
    ].find((node) => node.textContent === value);
    item!.click();
  }, value);
}

/** The settings open on the one panel, for a shot of the choice with the footer under it. */
async function showSettings(tab: Page) {
  await tab.evaluate(() => window.devknobs!.setState({ panel: { open: true } }));
  await tab.evaluate(() => window.devknobs!.ready());
  await tab.evaluate(() => {
    const root = document.querySelector('[data-devknobs="panel"]')!.shadowRoot!;
    if (root.querySelector('.keys-toggle')!.getAttribute('aria-pressed') !== 'true') {
      root.querySelector<HTMLElement>('.keys-toggle')!.click();
    }
  });
  await tab.waitForTimeout(400);
}

/**
 * Who runs the panel on a page with its own devknobs, a local build of it, in a profile of
 * its own. The extension's by default: one panel, its own, the footer naming it. Picking the
 * page's in its settings hands the page over at once: one panel, the page's, the footer naming
 * the local build, and no take-back. A load again keeps it; a page with no copy of its own
 * keeps the extension's. Picking the extension's from the page's panel loads the page again
 * with the extension's.
 */
async function preferPage() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-prefer-'));
  const browser = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport,
  });
  try {
    const worker = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
    const stored = () =>
      worker.evaluate(async () => (await chrome.storage.local.get('prefer')).prefer as unknown);
    const tab = browser.pages()[0] ?? (await browser.newPage());
    const errors: Array<string> = [];
    tab.on('pageerror', (error) => errors.push(String(error)));
    const extension = { extension: true, prefer: true, runtime: `extension ${extensionVersion}` };
    const pageOwn = { extension: false, prefer: true, runtime: `page ${localVersion}` };

    await tab.goto(`${url}own-local`);
    await tab.waitForFunction(() => window.pageMounted === true);
    await ready(tab);
    await tab.waitForTimeout(300);
    const first = await runtimeOf(tab);
    log('prefer extension, a page with a local build', first);
    assert.deepEqual(first, [extension]);
    await showSettings(tab);
    await tab.screenshot({ path: join(out, 'prefer-extension.png') });

    await pick(tab, 'page');
    await tab.waitForFunction(
      () =>
        document
          .querySelector('[data-devknobs="panel"]')
          ?.shadowRoot?.querySelector('.runtime')
          ?.textContent?.startsWith('page') === true,
    );
    await tab.waitForTimeout(500);
    const picked = { panels: await runtimeOf(tab), stored: await stored() };
    log('picked the page in the settings', picked);
    assert.deepEqual(picked, { panels: [pageOwn], stored: 'page' });

    await tab.reload();
    await tab.waitForFunction(() => window.pageMounted === true);
    await ready(tab);
    await tab.waitForTimeout(800);
    const reloaded = {
      api: await tab.evaluate(() => window.devknobs!.getState().panel !== undefined),
      panels: await runtimeOf(tab),
    };
    log('prefer page, loaded again', reloaded);
    assert.deepEqual(reloaded, { api: true, panels: [pageOwn] });
    await showSettings(tab);
    await tab.screenshot({ path: join(out, 'prefer-page.png') });

    // The page's knobs, set in its own panel, last a load again: the extension's copy keeps none.
    await set(tab, { scheme: 'dark', text: 20 });
    await tab.evaluate(() => window.devknobs!.ready());
    await tab.reload();
    await tab.waitForFunction(() => window.pageMounted === true);
    await ready(tab);
    await tab.waitForTimeout(500);
    const kept = {
      panels: await runtimeOf(tab),
      scheme: await tab.evaluate(() => window.devknobs!.getState().scheme),
      text: await tab.evaluate(() => window.devknobs!.getState().text),
    };
    log("prefer page, the page's knobs after a load again", kept);
    assert.deepEqual(kept, { panels: [pageOwn], scheme: 'dark', text: 20 });
    await set(tab, { scheme: 'system', text: 'system' });
    await tab.evaluate(() => window.devknobs!.ready());

    // Picked in another tab meanwhile: the next load keeps knobs again only with the extension's.
    const flag = () => tab.evaluate(() => sessionStorage.getItem('devknobs-extension.yielded'));
    const pickElsewhere = (value: string) =>
      worker.evaluate((value) => chrome.storage.local.set({ prefer: value }), value);
    const shown = () =>
      tab.evaluate(async () => {
        await window.devknobs!.ready();
        return document
          .querySelector('[data-devknobs="panel"]')
          ?.shadowRoot?.querySelector(
            '[aria-describedby="devknobs-prefer-hint"] [aria-checked="true"]',
          )?.textContent;
      });
    await pickElsewhere('extension');
    await tab.waitForFunction(() => sessionStorage.getItem('devknobs-extension.yielded') === null);
    const elsewhere = await shown();
    log("the page's panel shows the choice from another tab", elsewhere);
    assert.equal(elsewhere, 'extension');
    await pickElsewhere('page');
    await tab.waitForFunction(() => sessionStorage.getItem('devknobs-extension.yielded') === '1');
    assert.equal(await shown(), 'page');
    log('prefer picked in another tab, the flag after', await flag());

    // The page unmounts its copy: the toolbar button brings the extension's panel back, open.
    await tab.evaluate(() => window.pageUnmount!());
    await tab.waitForTimeout(300);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'toggle' }), tabId);
    await ready(tab);
    await tab.waitForTimeout(300);
    const back = {
      open: await tab.evaluate(() => window.devknobs!.getState().panel.open),
      panels: await runtimeOf(tab),
    };
    log('prefer page, the page unmounted its copy, then the toolbar button', back);
    assert.deepEqual(back, { open: true, panels: [extension] });

    await tab.goto(url);
    await ready(tab);
    await tab.waitForTimeout(300);
    const plain = await runtimeOf(tab);
    log('prefer page, a page with no copy of its own', plain);
    assert.deepEqual(plain, [extension]);

    await tab.goto(`${url}own-local`);
    await tab.waitForFunction(() => window.pageMounted === true);
    await ready(tab);
    await tab.waitForTimeout(300);
    assert.deepEqual(await runtimeOf(tab), [pageOwn]);
    const loaded = tab.waitForEvent('load');
    await pick(tab, 'extension');
    await loaded;
    await tab.waitForFunction(() => window.pageMounted === true);
    await ready(tab);
    await tab.waitForTimeout(500);
    const picked2 = { panels: await runtimeOf(tab), stored: await stored() };
    log("picked the extension in the page's panel", picked2);
    assert.deepEqual(picked2, { panels: [extension], stored: 'extension' });
    assert.deepEqual(errors, []);
    log('screenshots', [join(out, 'prefer-extension.png'), join(out, 'prefer-page.png')]);
  } finally {
    await browser.close();
    await rm(own, { force: true, recursive: true });
  }
}

// Real phone mode as a tab's devknobs has it, once it is `on`.
const realPhoneIn = (page: Page, on: boolean) =>
  page.waitForFunction((on) => window.devknobs?.getState().panel.realPhone === on, on);
// devknobs' frame on the page, as a page script reads it.
const frameOf = () =>
  document
    .querySelector('[data-devknobs="viewport"]')
    ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]');
const UA_KINDS = ['page', 'fetch', 'image', 'worker-fetch'];
// What the tab itself requests: a service worker's fetches belong to no tab, and keep Chrome's own.
const TAB_KINDS = ['page', 'fetch', 'image'];
const hints = (headers: Record<string, string> | undefined) =>
  Object.keys(headers ?? {}).filter((name) => name.startsWith('sec-ch-ua'));
const agentOf = (id: string) => PRESETS.ua.find((preset) => preset.id === id)!.userAgent;

/**
 * The user agent sent to servers. With the ua knob on, the tab's requests to its own host (its
 * page, a fetch, an image, its frame) carry the preset's user agent and client hints, in place of
 * Chrome's own, with no debugger and in-page too; with the debugger on the tab, its scripts and
 * workers read the same. The page's service worker, another tab and another host keep Chrome's
 * own. A device in the frame sends none: only the frame's page reads its browser. System puts it
 * back, rules gone, and a page loaded as another browser loads again as Chrome. Closing the panel
 * from the toolbar turns knobs off for the tab, and a reload brings none back.
 */
async function uaRequests() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-ua-'));
  const browser = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport: null,
  });
  try {
    const worker = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
    const tab = browser.pages()[0] ?? (await browser.newPage());
    const pageUrl = `${url}ua/page`;
    await tab.goto(pageUrl);
    await ready(tab);
    await tab.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const uaRules = () =>
      worker.evaluate(async () =>
        (await chrome.declarativeNetRequest.getSessionRules())
          .filter(({ action }) => action.requestHeaders !== undefined)
          .map(({ action, condition, id }) => ({
            agent: action.requestHeaders!.find(({ header }) => header === 'user-agent')?.value,
            host: condition.requestDomains,
            id,
            tabIds: condition.tabIds,
          })),
      );
    const rulesFor = async (agent: string | null) => {
      for (let tries = 0; tries < 100; tries++) {
        const rules = await uaRules();
        if (agent === null ? rules.length === 0 : rules.some((rule) => rule.agent === agent)) {
          return rules;
        }
        await tab.waitForTimeout(20);
      }
      return uaRules();
    };
    // A load of the page, then a fetch, an image and a fetch through its service worker.
    const probe = async (on: Page) => {
      uaSeen.clear();
      await on.reload();
      await ready(on);
      await on.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await on.evaluate(async () => {
        await fetch('/ua/fetch', { cache: 'no-store' });
        await fetch('/ua/via-worker', { cache: 'no-store' });
        await new Promise((resolve, reject) => {
          const image = new Image();
          image.addEventListener('load', resolve);
          image.addEventListener('error', resolve);
          image.addEventListener('abort', reject);
          image.src = `/ua/image?${Date.now()}`;
        });
      });
      return Object.fromEntries(UA_KINDS.map((kind) => [kind, uaSeen.get(kind)]));
    };
    const iphone = agentOf('iphone-safari');
    const android = agentOf('android-chrome');

    const real = await probe(tab);
    log('ua: system', real);
    const chromeAgent = real['page']!['user-agent']!;
    assert.match(chromeAgent, /Chrome\//);
    assert.equal(real['page']!['sec-ch-ua-mobile'], '?0');
    for (const kind of UA_KINDS) {
      assert.equal(real[kind]?.['user-agent'], chromeAgent, `${kind} goes as Chrome`);
    }

    const iphoneSafari = async (mode: string) => {
      await set(tab, { ua: { preset: 'iphone-safari' } });
      const rules = await rulesFor(iphone);
      log(`ua: rules, ${mode}`, rules);
      assert.deepEqual(
        rules.map(({ host, tabIds }) => ({ host, tabIds })),
        [{ host: ['127.0.0.1'], tabIds: [tabId] }],
      );
      const seen = await probe(tab);
      log(`ua: iphone safari, ${mode}`, seen);
      for (const kind of TAB_KINDS) {
        assert.equal(seen[kind]?.['user-agent'], iphone, `${kind} goes as an iPhone, ${mode}`);
        assert.deepEqual(hints(seen[kind]), [], `${kind} has no client hints, ${mode}`);
      }
      assert.equal(
        seen['worker-fetch']?.['user-agent'],
        chromeAgent,
        `the worker goes as Chrome, ${mode}`,
      );
    };
    const androidChrome = async (mode: string) => {
      await set(tab, { ua: { preset: 'android-chrome' } });
      await rulesFor(android);
      const seen = await probe(tab);
      log(`ua: android chrome, ${mode}`, seen);
      assert.equal(
        seen['worker-fetch']?.['user-agent'],
        chromeAgent,
        `the worker goes as Chrome, ${mode}`,
      );
      for (const kind of TAB_KINDS) {
        assert.equal(seen[kind]?.['user-agent'], android, `${kind} goes as Android, ${mode}`);
        assert.equal(seen[kind]?.['sec-ch-ua-mobile'], '?1');
        assert.equal(seen[kind]?.['sec-ch-ua-platform'], '"Android"');
        assert.match(seen[kind]?.['sec-ch-ua'] ?? '', /"Google Chrome";v="\d+"/);
      }
    };

    // No knob keeps the debugger: the rules alone.
    await iphoneSafari('no debugger');
    assert.equal(await attached(), false);
    await androidChrome('no debugger');

    // Another tab, on the same host, keeps Chrome's own.
    const other = await browser.newPage();
    await other.goto(`${url}ua/page`);
    await ready(other);
    uaSeen.clear();
    await other.evaluate(() => fetch('/ua/fetch', { cache: 'no-store' }));
    log('ua: other tab', uaSeen.get('fetch'));
    assert.equal(uaSeen.get('fetch')?.['user-agent'], chromeAgent);
    await other.close();

    // The debugger on the tab, for a knob: the page's scripts and a worker of its read the same.
    for (let tries = 0; tries < 50 && !(await attached()); tries++) {
      await set(tab, { text: 20 });
      await tab.waitForTimeout(100);
    }
    assert.equal(await attached(), true);
    await androidChrome('real');
    const read = () =>
      tab.evaluate(async () => {
        const source =
          'postMessage([navigator.userAgent, navigator.userAgentData?.mobile ?? null])';
        const blob = new Blob([source], { type: 'text/javascript' });
        const dedicated = new Worker(URL.createObjectURL(blob));
        const [workerAgent, workerMobile] = await new Promise<[string, boolean | null]>((resolve) =>
          dedicated.addEventListener('message', (event) => resolve(event.data), { once: true }),
        );
        dedicated.terminate();
        const data = (navigator as unknown as { userAgentData?: { mobile: boolean } })
          .userAgentData;
        return {
          agent: navigator.userAgent,
          mobile: data?.mobile ?? null,
          workerAgent,
          workerMobile,
        };
      });
    const androidRead = await read();
    log('ua: android chrome, real, read', androidRead);
    assert.deepEqual(androidRead, {
      agent: android,
      mobile: true,
      workerAgent: android,
      workerMobile: true,
    });
    await iphoneSafari('real');
    const iphoneRead = await read();
    log('ua: iphone safari, real, read', iphoneRead);
    assert.equal(iphoneRead.agent, iphone);
    assert.equal(iphoneRead.workerAgent, iphone);

    // In-page: the debugger leaves, the rules stay.
    await worker.evaluate(() => chrome.storage.local.set({ native: false }));
    for (let tries = 0; (await attached()) && tries < 100; tries++) {
      await tab.waitForTimeout(20);
    }
    assert.equal(await attached(), false);
    await iphoneSafari('in-page');
    await androidChrome('in-page');

    // A device drawn around the page: nothing goes to servers as its iPhone, the frame's page
    // reads it, and the page around the frame stays Chrome. The page loaded as Android loads
    // again as Chrome first.
    uaSeen.clear();
    await set(tab, { ua: { preset: 'system' } });
    await rulesFor(null);
    for (let tries = 0; !uaSeen.get('page') && tries < 200; tries++) {
      await tab.waitForTimeout(25);
    }
    assert.equal(uaSeen.get('page')?.['user-agent'], chromeAgent, 'loads again as Chrome');
    await tab.waitForLoadState('load');
    await ready(tab);
    uaSeen.delete('frame');
    await set(tab, { device: 'iphone-18-pro', mock: true });
    await tab.waitForFunction(`(${frameOf.toString()})()?.contentWindow?.devknobs !== undefined`);
    await tab.evaluate(() => window.devknobs!.ready());
    assert.equal(await tab.evaluate(() => window.devknobs!.getState().ua.preset), 'iphone-safari');
    assert.deepEqual(await uaRules(), [], 'a device in the frame sets no rule');
    log('ua: frame of an iPhone 18 Pro', uaSeen.get('frame'));
    assert.equal(uaSeen.get('frame')?.['user-agent'], chromeAgent);
    const reads = await tab.evaluate(
      `({ top: navigator.userAgent, frame: (${frameOf.toString()})().contentWindow.navigator.userAgent })`,
    );
    log('ua: framed, read', reads);
    assert.deepEqual(reads, { frame: iphone, top: chromeAgent });
    uaSeen.clear();
    await tab.evaluate(async () => {
      await fetch('/ua/fetch', { cache: 'no-store' });
      await fetch('/ua/via-worker', { cache: 'no-store' });
    });
    log('ua: framed, top page', Object.fromEntries(uaSeen));
    assert.equal(uaSeen.get('fetch')?.['user-agent'], chromeAgent);
    assert.equal(uaSeen.get('worker-fetch')?.['user-agent'], chromeAgent);
    const second = await browser.newPage();
    await second.goto(`${url}ua/page`);
    await ready(second);
    const secondSeen = await probe(second);
    log('ua: framed, second tab', secondSeen);
    for (const kind of UA_KINDS) {
      assert.equal(
        secondSeen[kind]?.['user-agent'],
        chromeAgent,
        `${kind} of a second tab goes as Chrome`,
      );
    }
    // Real phone mode: the frame's page loads go as the iPhone, nothing else does. It is one
    // setting for every tab: a tab on another host turns with it.
    const elsewhere = await browser.newPage();
    await elsewhere.goto(`${otherOrigin}ua/page`);
    await ready(elsewhere);
    uaSeen.delete('frame');
    await set(tab, { panel: { realPhone: true } });
    await realPhoneIn(elsewhere, true);
    log('ua: real phone mode, another host', 'on there too');
    for (let tries = 0; uaSeen.get('frame')?.['user-agent'] !== iphone && tries < 200; tries++) {
      await tab.waitForTimeout(25);
    }
    const phoneRules = await worker.evaluate(async () =>
      (await chrome.declarativeNetRequest.getSessionRules())
        .filter(({ action }) => action.requestHeaders !== undefined)
        .map(({ condition }) => condition),
    );
    log('ua: real phone mode, rules', phoneRules);
    assert.deepEqual(phoneRules, [
      { requestDomains: ['127.0.0.1'], resourceTypes: ['sub_frame'], tabIds: [tabId] },
    ]);
    log('ua: real phone mode, frame', uaSeen.get('frame'));
    assert.equal(uaSeen.get('frame')?.['user-agent'], iphone);
    uaSeen.clear();
    await tab.evaluate(async () => {
      await fetch('/ua/fetch', { cache: 'no-store' });
      await fetch('/ua/via-worker', { cache: 'no-store' });
    });
    log('ua: real phone mode, top page', Object.fromEntries(uaSeen));
    assert.equal(uaSeen.get('fetch')?.['user-agent'], chromeAgent);
    assert.equal(uaSeen.get('worker-fetch')?.['user-agent'], chromeAgent);
    const phoneSecond = await probe(second);
    log('ua: real phone mode, second tab', phoneSecond);
    for (const kind of UA_KINDS) {
      assert.equal(
        phoneSecond[kind]?.['user-agent'],
        chromeAgent,
        `${kind} of a second tab goes as Chrome`,
      );
    }
    uaSeen.clear();
    await set(elsewhere, { panel: { realPhone: false } });
    await realPhoneIn(tab, false);
    await elsewhere.close();
    await rulesFor(null);
    // The frame loads again as Chrome; the next change waits for it.
    for (
      let tries = 0;
      uaSeen.get('frame')?.['user-agent'] !== chromeAgent && tries < 200;
      tries++
    ) {
      await tab.waitForTimeout(25);
    }
    assert.equal(uaSeen.get('frame')?.['user-agent'], chromeAgent);
    await tab.waitForFunction(`(${frameOf.toString()})()?.contentWindow?.devknobs !== undefined`);
    await tab.evaluate(`(${frameOf.toString()})().contentWindow.devknobs.ready()`);
    await second.close();
    // A browser the ua knob picks itself goes to the frame's load.
    await set(tab, { ua: { preset: 'android-chrome' } });
    for (let tries = 0; uaSeen.get('frame')?.['user-agent'] !== android && tries < 100; tries++) {
      await tab.waitForTimeout(20);
    }
    log('ua: frame after a change', uaSeen.get('frame'));
    assert.equal(uaSeen.get('frame')?.['user-agent'], android);
    // Another host keeps Chrome's own.
    uaSeen.clear();
    await tab.goto(`${otherOrigin}ua/page`);
    await ready(tab);
    log('ua: another host', uaSeen.get('page'));
    assert.equal(uaSeen.get('page')?.['user-agent'], chromeAgent);
    await tab.goto(pageUrl);
    await ready(tab);
    await set(tab, { device: 'none', dpr: 'system', height: 'full', mock: false, width: 'full' });
    await tab.waitForFunction(() => document.querySelector('[data-devknobs="viewport"]') === null);

    // A page loaded as another browser loads again as Chrome once that browser goes.
    const reloadsAsChrome = async (label: string, off: DevknobsStatePatch) => {
      uaSeen.clear();
      await set(tab, off);
      for (let tries = 0; !uaSeen.get('page') && tries < 200; tries++) {
        await tab.waitForTimeout(25);
      }
      await ready(tab);
      log(`ua: ${label}, then off`, uaSeen.get('page'));
      assert.equal(
        uaSeen.get('page')?.['user-agent'],
        chromeAgent,
        `${label}: loads again as Chrome`,
      );
      assert.deepEqual(await rulesFor(null), []);
    };
    await set(tab, { ua: { preset: 'android-chrome' } });
    await rulesFor(android);
    assert.equal((await probe(tab))['page']?.['user-agent'], android);
    await reloadsAsChrome('ua knob', { ua: { preset: 'system' } });
    // From the whole tab's browser to real phone mode's frame alone: the page loads again as Chrome.
    await set(tab, { ua: { preset: 'android-chrome' } });
    await rulesFor(android);
    assert.equal((await probe(tab))['page']?.['user-agent'], android);
    uaSeen.clear();
    await set(tab, { device: 'iphone-18-pro', mock: true, panel: { realPhone: true } });
    for (let tries = 0; !uaSeen.get('page') && tries < 200; tries++) {
      await tab.waitForTimeout(25);
    }
    log('ua: whole tab, then real phone mode', uaSeen.get('page'));
    assert.equal(uaSeen.get('page')?.['user-agent'], chromeAgent, 'loads again as Chrome');
    await tab.waitForLoadState('load');
    await ready(tab);
    await set(tab, {
      device: 'none',
      dpr: 'system',
      height: 'full',
      mock: false,
      panel: { realPhone: false },
      width: 'full',
    });
    await rulesFor(null);
    await tab.waitForFunction(() => document.querySelector('[data-devknobs="viewport"]') === null);
    // The debugger sizing the whole tab as the phone: the tab is the device, and goes as it.
    await worker.evaluate(() => chrome.storage.local.set({ native: true }));
    await set(tab, { browser: 'off', device: 'iphone-17', mock: false });
    await rulesFor(iphone);
    assert.equal((await probe(tab))['page']?.['user-agent'], iphone);
    await reloadsAsChrome('native viewport', {
      device: 'none',
      dpr: 'system',
      height: 'full',
      width: 'full',
    });

    // Closed from the toolbar: knobs off for the tab, every rule gone, and a reload brings none back.
    const toggle = () =>
      worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'toggle' }), tabId);
    await toggle();
    await tab.waitForFunction(() => window.devknobs?.getState().panel.open === true);
    await set(tab, { device: 'iphone-18-pro', mock: true, ua: { preset: 'android-chrome' } });
    await rulesFor(android);
    await toggle();
    await tab.waitForFunction(() => window.devknobs?.getState().panel.open === false);
    await tab.waitForFunction(() => document.querySelector('[data-devknobs="viewport"]') === null);
    let left = await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
    for (let tries = 0; left.length > 0 && tries < 100; tries++) {
      await tab.waitForTimeout(20);
      left = await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
    }
    log('ua: closed from the toolbar, rules', left);
    assert.deepEqual(left, []);
    await tab.reload();
    await ready(tab);
    const after = await tab.evaluate(() => window.devknobs!.getState());
    log('ua: closed, reloaded', { device: after.device, ua: after.ua.preset });
    assert.equal(after.device, 'none');
    assert.equal(after.ua.preset, 'system');
    // System: Chrome's own again, every rule gone.
    await set(tab, { ua: { preset: 'system' } });
    assert.deepEqual(await rulesFor(null), []);
    const back = await probe(tab);
    log('ua: system again', back);
    for (const kind of UA_KINDS) {
      assert.deepEqual(back[kind], real[kind], `${kind} goes as Chrome again`);
    }
  } finally {
    await browser.close();
    await rm(own, { force: true, recursive: true });
  }
}

try {
  const worker: Worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const tab = context.pages()[0] ?? (await context.newPage());
  await tab.goto(url);
  await ready(tab);

  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    if (tabs.length !== 1 || tabs[0]?.id === undefined) {
      throw new Error(`expected one tab, got ${tabs.length}`);
    }
    return tabs[0].id;
  });
  const attached = () =>
    worker.evaluate(
      // Playwright is attached too, so getTargets cannot tell; only our own session can send.
      (tabId) =>
        chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
          () => true,
          () => false,
        ),
      tabId,
    );
  const tabKnobs = () =>
    worker.evaluate(
      (tabId) =>
        (
          globalThis as unknown as { knobs: { get: (tabId: number) => Promise<KnobState> } }
        ).knobs.get(tabId),
      tabId,
    );

  // The toolbar button opens the panel, so a fresh profile shows no handle on the page's edge.
  assert.equal(await handleShown(tab), false, 'no handle while the panel is closed');
  await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'toggle' }), tabId);
  await tab.waitForFunction(() => window.devknobs?.getState().panel.open === true);
  await tab.evaluate(() => window.devknobs!.ready());
  await tab.evaluate(() => window.devknobs!.setState({ panel: { open: false } }));
  await tab.evaluate(() => window.devknobs!.ready());
  assert.equal(await handleShown(tab), false, 'closed again from the toolbar, still no handle');
  log('handle', 'hidden on a closed panel');

  const before = await report(tab);
  log('before', before);
  assert.equal(before.fontSize, '16px');
  assert.equal(before.wide, true, 'viewport must be wider than 60em at 16px');
  assert.equal(before.fetched, 'pong');
  assert.equal(await attached(), false);

  await set(tab, { text: 48 });
  await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '48px');
  const text = await report(tab);
  log('text 48', text);
  assert.equal(text.monoSize, '39px');
  assert.equal(text.wide, false, 'em media query follows the default font size');
  assert.equal(text.wideCss, false, 'em media query in css follows too');
  assert.equal(text.inline, '', 'devknobs wrote nothing on <html>: the size is native');
  assert.equal(await attached(), true);

  // The host's own scheme shows through with no override, so flip whichever it is.
  const scheme = before.dark ? 'light' : 'dark';
  await set(tab, { contrast: 'more', motion: 'reduce', scheme, transparency: 'reduce' });
  await tab.waitForFunction(() => matchMedia('(prefers-contrast: more)').matches);
  const prefs = await report(tab);
  log('preferences', prefs);
  assert.equal(prefs.dark, !before.dark);
  assert.equal(prefs.reducedMotion, true);
  assert.equal(prefs.reducedTransparency, true);
  assert.equal(prefs.inline, '', 'no color-scheme written on <html>: the scheme is native');

  await set(tab, { network: { online: 'offline' } });
  await tab.waitForFunction(() => !navigator.onLine);
  const offline = await report(tab);
  log('offline', offline);
  assert.equal(offline.fetched, 'failed');

  await set(tab, { network: { online: 'system' } });
  await tab.waitForFunction(() => navigator.onLine);
  await tab.reload();
  await ready(tab);
  const reloaded = await report(tab);
  log('after reload', reloaded);
  assert.equal(reloaded.parsedFontSize, '48px', 'the size is there before the first paint');
  assert.equal(reloaded.dark, !before.dark);
  assert.equal(reloaded.fetched, 'pong');
  assert.equal(await tab.evaluate(() => window.devknobs!.getState().text), 48);

  // Another origin keeps no devknobs state: the tab's knobs win, so panel and page agree.
  await tab.goto(otherOrigin);
  await ready(tab);
  await tab.waitForFunction(() => window.devknobs?.getState().text === 48);
  const crossed = await report(tab);
  log('other origin', crossed);
  assert.equal(crossed.parsedFontSize, '48px');
  assert.equal(await tab.evaluate(() => window.devknobs!.getState().scheme), scheme);
  await tab.goto(url);
  await ready(tab);

  // The width knob's frame: its copy of the page runs its own devknobs, and the tab's knobs reach it.
  // A plain width is the tab's own now; the frame knob keeps it in the frame.
  await set(tab, { frame: true, width: 400 });
  // waitForFunction takes a promise as truthy, so it waits for the frame's devknobs first.
  await tab.waitForFunction(
    () =>
      document
        .querySelector('[data-devknobs="viewport"]')
        ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow
        ?.devknobs !== undefined,
  );
  const framed = await tab.evaluate(async () => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    await inner!.devknobs!.ready();
    const root = inner!.document.documentElement;
    return {
      fontSize: inner!.getComputedStyle(root).fontSize,
      inline: root.getAttribute('style') ?? '',
      text: inner!.devknobs!.getState().text,
      width: inner!.innerWidth,
    };
  });
  log('frame', framed);
  assert.deepEqual(framed, {
    fontSize: '48px',
    inline: '',
    text: 48,
    width: 400,
  });
  await set(tab, { frame: false, width: 'full' });
  await tab.evaluate(() => window.devknobs!.ready());

  // The toolbar button's message, through the bridge.
  await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'toggle' }), tabId);
  await tab.waitForFunction(() => window.devknobs?.getState().panel.open === true);
  log('toggle', 'panel opened');

  await tab.evaluate(() => window.devknobs!.reset());
  await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '16px');
  await tab.waitForFunction(() => !matchMedia('(prefers-contrast: more)').matches);
  const after = await report(tab);
  log('after reset', after);
  assert.deepEqual(
    { ...after, parsedFontSize: undefined },
    { ...before, parsedFontSize: undefined },
  );
  assert.deepEqual(await tabKnobs(), {
    contrast: 'system',
    motion: 'system',
    offline: false,
    scheme: 'system',
    textSize: 'system',
    transparency: 'system',
    viewport: null,
  });
  for (let tries = 0; (await attached()) && tries < 50; tries++) {
    await tab.waitForTimeout(20);
  }
  assert.equal(await attached(), false);

  // A page that themes itself both ways: a class from matchMedia and its change events,
  // as next-themes does, and light-dark(). The panel keeps the system's look.
  await tab.goto(`${url}themes`);
  await ready(tab);
  const hostTheme = await theme(tab);
  const hostPanel = await panelLook(tab);
  log('themes page', { page: hostTheme, panel: hostPanel });
  assert.equal(hostTheme.dark, before.dark);
  assert.equal(hostPanel.background, before.dark ? DARK_PANEL : LIGHT_PANEL);
  await set(tab, { motion: 'reduce', scheme });
  await isDark(tab, !before.dark);
  const flipped = await theme(tab);
  log('themes page flipped', { page: flipped, panel: await panelLook(tab) });
  assert.notEqual(flipped.background, hostTheme.background);
  assert.notEqual(flipped.tokens, hostTheme.tokens);
  assert.deepEqual(await panelLook(tab), hostPanel, 'the panel keeps the real scheme and motion');
  await tab.reload();
  await ready(tab);
  const flippedReload = await theme(tab);
  log('themes page flipped, reloaded', { page: flippedReload, panel: await panelLook(tab) });
  assert.deepEqual(flippedReload, flipped);
  assert.deepEqual(await panelLook(tab), hostPanel);

  // The user changes their system's scheme: the offscreen document's word reaches the panel.
  const tellSystem = (scheme: 'dark' | 'light') =>
    worker.evaluate(
      ({ scheme, tabId }) =>
        chrome.tabs.sendMessage(
          tabId,
          { media: { motion: 'no-preference', scheme }, type: 'system' },
          { frameId: 0 },
        ),
      { scheme, tabId },
    );
  await tellSystem(before.dark ? 'light' : 'dark');
  await tab.waitForFunction(
    (bg) =>
      getComputedStyle(
        document.querySelector('[data-devknobs="panel"]')!.shadowRoot!.querySelector('.wrap')!,
      )
        .getPropertyValue('--bg')
        .trim() === bg,
    before.dark ? LIGHT_PANEL : DARK_PANEL,
  );
  await tellSystem(before.dark ? 'dark' : 'light');
  log('system scheme change', 'the panel followed it');

  // Docked, the page is the frame's copy, which flips as well.
  const frameTheme = () =>
    tab.evaluate(() => {
      const inner = document
        .querySelector('[data-devknobs="viewport"]')
        ?.shadowRoot?.querySelector<HTMLIFrameElement>(
          'iframe[data-devknobs-frame]',
        )?.contentWindow;
      if (!inner?.devknobs || inner.document.readyState !== 'complete') {
        return null;
      }
      return inner.document.documentElement.classList.contains('dark');
    });
  await set(tab, { panel: { docked: true, open: true } });
  for (let tries = 0; (await frameTheme()) !== !before.dark && tries < 100; tries++) {
    await tab.waitForTimeout(20);
  }
  assert.equal(await frameTheme(), !before.dark);
  await set(tab, { scheme: 'system' });
  for (let tries = 0; (await frameTheme()) !== before.dark && tries < 100; tries++) {
    await tab.waitForTimeout(20);
  }
  log('docked themes page', { back: await frameTheme(), flipped: !before.dark });
  assert.equal(await frameTheme(), before.dark);
  await set(tab, { motion: 'system', panel: { docked: false, open: false } });
  await isDark(tab, before.dark);
  assert.deepEqual(await theme(tab), hostTheme);

  // A page whose policy allows nothing inline.
  await tab.goto(`${url}csp`);
  const csp = await tab.evaluate(async () => {
    await window.devknobs?.ready();
    const host = document.querySelector('[data-devknobs="panel"]');
    const wrap = host?.shadowRoot?.querySelector('.wrap');
    return {
      api: window.devknobs !== undefined,
      panel: host !== null,
      styled: wrap ? getComputedStyle(wrap).display === 'flex' : false,
    };
  });
  log('csp page', csp);
  assert.deepEqual(csp, { api: true, panel: true, styled: true });
  // No inline style at all, attributes neither: the extension's panel looks as on any page.
  await tab.goto(`${url}strict?ext`);
  await ready(tab);
  await openPanel(tab);
  const strictLooks = await looks(tab);
  await tab.goto(`${url}loose?ext`);
  await ready(tab);
  await openPanel(tab);
  log('strict policy, extension', strictLooks);
  assert.deepEqual(strictLooks, await looks(tab));
  assert.equal((strictLooks['wrap'] as { display: string } | null)?.display, 'flex');
  await set(tab, { panel: { open: false } });

  // A page that refuses every frame: the width knob's frame of it loads all the same.
  await tab.goto(`${url}deny`);
  await ready(tab);
  await set(tab, { frame: true, width: 400 });
  const denied = await tab.waitForFunction(() => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    if (!inner?.devknobs || inner.document.readyState !== 'complete') {
      return null;
    }
    return {
      heading: inner.document.querySelector('h1')?.textContent,
      notice: document
        .querySelector('[data-devknobs="viewport"]')
        ?.shadowRoot?.querySelector<HTMLElement>('.blocked')?.hidden,
      width: inner.innerWidth,
    };
  });
  log('framed deny page', await denied.jsonValue());
  assert.deepEqual(await denied.jsonValue(), {
    heading: 'devknobs smoke',
    notice: true,
    width: 400,
  });

  // A link in the frame to another origin, such as a sign-in provider that refuses frames:
  // the tab goes there, as it would with no frame, and the knobs wait on this origin.
  await tab.evaluate((to) => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')!
      .shadowRoot!.querySelector<HTMLIFrameElement>(
        'iframe[data-devknobs-frame]',
      )!.contentDocument!;
    const link = inner.createElement('a');
    link.href = to;
    inner.body.append(link);
    link.click();
  }, `${otherOrigin}deny`);
  await tab.waitForURL(`${otherOrigin}deny`);
  log('frame left for another origin', tab.url());
  await tab.goto(`${url}deny`);
  await ready(tab);

  // A new tab straight to a page that refuses frames, with knobs that frame it at once
  // (window.open copies sessionStorage): the rule is in before the load, so the first frame loads.
  const errors: Array<string> = [];
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    tab.evaluate(() => window.open(location.href)),
  ]);
  opened.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  const firstLoad = await opened.waitForFunction(() => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    try {
      if (!inner?.devknobs || inner.document.readyState !== 'complete') {
        return null;
      }
    } catch {
      return 'refused';
    }
    return inner.document.querySelector('h1')?.textContent;
  });
  log('new tab framed deny page', { errors, heading: await firstLoad.jsonValue() });
  assert.equal(await firstLoad.jsonValue(), 'devknobs smoke');
  assert.deepEqual(
    errors.filter((text) => text.includes('postMessage')),
    [],
  );
  await opened.close();
  await set(tab, { frame: false, width: 'full' });
  await tab.evaluate(() => window.devknobs!.ready());
  // Anything but a frame still gets the headers.
  const fetchedHeaders = await tab.evaluate(async () => {
    const { headers } = await fetch('/deny', { cache: 'no-store' });
    return [headers.get('x-frame-options'), headers.get('content-security-policy')];
  });
  log('fetched deny headers', fetchedHeaders);
  assert.deepEqual(fetchedHeaders, ['DENY', "frame-ancestors 'none'"]);

  // The frames' rules of each tab, not the service workers'.
  const sessionRules = () =>
    worker.evaluate(async () =>
      (await chrome.declarativeNetRequest.getSessionRules())
        .filter(({ condition }) => !condition.tabIds?.includes(chrome.tabs.TAB_ID_NONE))
        .map(({ action, condition, id }) => ({
          header: action.responseHeaders?.[0]?.header,
          host: condition.requestDomains,
          id,
          tabIds: condition.tabIds,
        })),
    );
  const settledRules = async (count: number) => {
    for (let tries = 0; (await sessionRules()).length !== count && tries < 50; tries++) {
      await tab.waitForTimeout(20);
    }
    return sessionRules();
  };
  assert.deepEqual(await settledRules(0), [], 'no rule while no frame of devknobs is open');
  // Another tab, on another host. With no frame of devknobs open, its own frames keep their headers.
  const other = await context.newPage();
  await other.goto(otherOrigin);
  await ready(other);
  const otherId = await worker.evaluate(
    async (tabId) => (await chrome.tabs.query({})).find((tab) => tab.id !== tabId)!.id!,
    tabId,
  );
  const frameOf = async (src: string) => {
    await other.evaluate(
      (src) =>
        new Promise((resolve) => {
          document.querySelector('#probe')?.remove();
          const frame = document.createElement('iframe');
          frame.id = 'probe';
          frame.name = 'probe';
          frame.addEventListener('load', resolve, { once: true });
          frame.src = src;
          document.body.append(frame);
        }),
      src,
    );
    const frame = other.frames().find((frame) => frame.name() === 'probe');
    return frame?.evaluate(() => document.querySelector('h1')?.textContent?.trim());
  };
  const unframedOwn = await frameOf(`${otherOrigin}deny`);
  await frameOf(`${otherOrigin}sandboxed`);
  const sandboxed = await other.title();
  log('other tab frames, no devknobs frame', { sandboxed, unframedOwn });
  assert.notEqual(unframedOwn, 'devknobs smoke', 'a frame of its own host keeps its headers');
  assert.equal(sandboxed, 'smoke', "a frame's sandbox stays");
  // Its frame of devknobs open: the rule is its own, and a frame of a host that is not its own keeps the headers.
  await set(other, { frame: true, width: 400 });
  await other.evaluate(() => window.devknobs!.ready());
  const rules = await settledRules(2);
  log('session rules', rules);
  assert.deepEqual(rules, [
    { header: 'x-frame-options', host: ['localhost'], id: otherId, tabIds: [otherId] },
    { header: 'content-security-policy', host: ['localhost'], id: rules[1]?.id, tabIds: [otherId] },
  ]);
  assert.notEqual(rules[1]?.id, otherId);
  const ownHost = await frameOf(`${otherOrigin}deny`);
  const foreignHost = await frameOf(`${url}deny`);
  log('other tab frames, devknobs frame open', { foreignHost, ownHost });
  assert.equal(ownHost, 'devknobs smoke');
  assert.notEqual(foreignHost, 'devknobs smoke', 'a frame of another host keeps its headers');
  await other.close();
  assert.deepEqual(await settledRules(0), [], 'closing a tab drops its rule');

  // Both shots under the same system scheme, at the same size.
  // A fresh tab: one the debugger was on can keep a stale strip where Chrome's bar was.
  await mkdir(out, { recursive: true });
  const shot = await context.newPage();
  await shot.goto(url);
  await ready(shot);
  await openPanel(shot);
  await shot.screenshot({ path: join(out, 'extension.png') });

  const npmBrowser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const npm = await npmBrowser.newPage({ colorScheme: null, viewport });
    await npm.goto(`${url}npm`);
    await ready(npm);
    assert.equal(await handleShown(npm), true, 'the npm build keeps its handle');
    await openPanel(npm);
    await npm.screenshot({ path: join(out, 'npm.png') });
  } finally {
    await npmBrowser.close();
  }
  log('screenshots', [join(out, 'extension.png'), join(out, 'npm.png')]);

  await nativeViewport();
  await inPageMode();
  await refusalCauses();
  await workerFrames();
  await firstOpen();
  await uaRequests();
  await strictPolicy();
  await pageOwnCopy();
  await preferPage();
  await selfReload();

  process.stdout.write('smoke passed\n');
  // Two copies of the extension on one page, built from this checkout into a folder of their own.
  execFileSync('node', [join(root, 'scripts/pair.ts')], { stdio: 'inherit' });
} finally {
  await context.close();
  server.close();
  await rm(profile, { force: true, recursive: true });
}
