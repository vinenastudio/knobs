// The Chrome Web Store's screenshots and promo tiles: builds the extension as the store
// gets it, loads it into Playwright's Chromium, headless, puts the demo shop in store/demo/
// (a small React app, bundled here with its source map) in a tab, sets knobs through the
// panel's own api, and lays each shot under its caption in an html frame drawn in a second
// headless browser. Writes into store/. Needs devknobs built.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DevknobsStatePatch } from '@vinena/knobs';
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Frame,
  type Page,
} from 'playwright-core';

const root = join(import.meta.dirname, '..');
const store = join(root, 'store');
const demoDir = join(store, 'demo');
const logo = await readFile(join(root, '../../apps/web/public/favicon.svg'), 'utf8');

// The demo answers at a shop's own address, served from here, not from the network.
const url = 'https://fernwood.coffee/';
// The tab, drawn at twice its size by a real device scale factor so it stays sharp in the
// frame. Not Playwright's emulated one: Chrome then lays out at 1x and paints at 2x, and
// grab's box, built of one device pixel pieces scaled up, comes out twice its size.
const viewport = { height: 665, width: 1120 };
const scale = 2;

/** The page in a frame of its own at 1056px wide, under the caption: nothing cut at the bottom. */
const shown = { height: Math.round((1056 * viewport.height) / viewport.width), width: 1056 };

const own = await mkdtemp(join(tmpdir(), 'knobs-store-shots-'));
let context: BrowserContext | undefined;
let drawing: Browser | undefined;
try {
  // A release build, whose panel shows the version alone and no local build's label.
  const dist = join(own, 'dist');
  execFileSync('bun', [join(root, 'scripts/build.ts'), dist], {
    env: { ...process.env, KNOBS_RELEASE: '1' },
    stdio: 'inherit',
  });
  // The demo's React app, a development build with its source map, as a dev server serves
  // one: grab reads the components and their files from it.
  execFileSync(
    'bun',
    [
      'build',
      join(demoDir, 'src/main.tsx'),
      '--outdir',
      join(own, 'demo'),
      '--sourcemap=linked',
      '--target=browser',
      '--define',
      'process.env.NODE_ENV="development"',
    ],
    { stdio: 'inherit' },
  );
  const html = await readFile(join(demoDir, 'index.html'), 'utf8');
  const app = (await readFile(join(own, 'demo/main.js'), 'utf8')).replace(
    /sourceMappingURL=main\.js\.map/,
    'sourceMappingURL=app.js.map',
  );
  // The map names the files from the site's root, as a dev server's does: src/App.tsx.
  const map = JSON.parse(await readFile(join(own, 'demo/main.js.map'), 'utf8')) as {
    sources: Array<string>;
  };
  map.sources = map.sources.map((source) =>
    source.includes('/node_modules/')
      ? `node_modules/${source.split('/node_modules/').at(-1)}`
      : source.slice(source.indexOf('/store/demo/') + '/store/demo/'.length),
  );

  context = await chromium.launchPersistentContext(join(own, 'profile'), {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--force-device-scale-factor=${scale}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    // A light system, whatever this machine's, so the knobs' own change is what shows.
    colorScheme: 'light',
    contrast: null,
    headless: true,
    // The shop's own zone and language, whatever this machine's.
    locale: 'en-US',
    reducedMotion: null,
    timezoneId: 'America/Los_Angeles',
    viewport: null,
  });
  await context.route(`${url}**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith('/api/')) {
      return route.fulfill({ contentType: 'application/json', json: { ok: true } });
    }
    if (pathname === '/app.js') {
      return route.fulfill({ body: app, contentType: 'text/javascript' });
    }
    if (pathname === '/app.js.map') {
      return route.fulfill({ contentType: 'application/json', json: map });
    }
    return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
  });
  // The demo's pulse and bars hold still, so each shot is the same from run to run.
  await context.addInitScript(() => {
    if (location.hostname !== 'fernwood.coffee') {
      return;
    }
    addEventListener('DOMContentLoaded', () => {
      const still = document.createElement('style');
      still.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
      document.head.append(still);
    });
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
  drawing = await chromium.launch({ channel: 'chromium', headless: true });
  await shoot(context, drawing);
} finally {
  await context?.close();
  await drawing?.close();
  await rm(own, { force: true, recursive: true });
}

/** The panel's api, once devknobs has mounted and settled. */
function ready(tab: Page) {
  return tab.waitForFunction(async () => {
    await window.devknobs?.ready();
    return document.querySelector('[data-devknobs="panel"]') !== null;
  });
}

/** A screenshot once two in a row come out the same: frames loaded, images drawn. */
async function settled(tab: Page) {
  let last = await tab.screenshot();
  for (let tries = 0; tries < 30; tries++) {
    await tab.waitForTimeout(150);
    const next = await tab.screenshot();
    if (next.equals(last)) {
      return next;
    }
    last = next;
  }
  throw new Error('the tab never settled');
}

function dataUrl(png: Buffer) {
  return `data:image/png;base64,${png.toString('base64')}`;
}

function escape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function shoot(context: BrowserContext, drawing: Browser) {
  /**
   * Set knobs. Only the locale and the user agent load the page again (a page reads them as
   * it loads), so only those wait for the load.
   */
  async function set(
    tab: Page,
    patch: DevknobsStatePatch,
    reloads = 'locale' in patch || 'ua' in patch,
  ) {
    const loaded = reloads ? tab.waitForEvent('load', { timeout: 15_000 }) : null;
    await tab
      .evaluate((patch) => {
        window.devknobs!.setState(patch);
      }, patch)
      .catch((error: unknown) => {
        if (!reloads || !String(error).includes('Execution context was destroyed')) {
          throw error;
        }
      });
    await loaded;
    await ready(tab);
  }

  /** A fresh tab on the demo, devknobs up with its knobs at their defaults. */
  async function fresh(patch: DevknobsStatePatch = {}) {
    const tab = await context.newPage();
    await tab.goto(url);
    await ready(tab);
    // Headless Chrome's window keeps some of its height for itself: grow it by that much.
    const size = () => tab.evaluate(() => ({ height: innerHeight, width: innerWidth }));
    for (let tries = 0; tries < 10; tries++) {
      const was = await size();
      if (was.width === viewport.width && was.height === viewport.height) {
        break;
      }
      if (tries === 9) {
        throw new Error(
          `the tab is ${was.width}x${was.height}, not ${viewport.width}x${viewport.height}`,
        );
      }
      const session = await context.newCDPSession(tab);
      const { bounds, windowId } = await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds', {
        bounds: {
          height: bounds.height! + viewport.height - was.height,
          width: bounds.width! + viewport.width - was.width,
        },
        windowId,
      });
      await session.detach();
      await tab.waitForTimeout(100);
    }
    await tab.evaluate(() => window.devknobs!.reset());
    await set(tab, patch);
    return tab;
  }

  /** The demo's page inside devknobs' frame, where one is up. */
  async function framed(tab: Page): Promise<Frame> {
    for (let tries = 0; tries < 100; tries++) {
      const frame = tab.frames().find((frame) => frame !== tab.mainFrame() && frame.url() === url);
      if (frame) {
        await frame.waitForLoadState();
        return frame;
      }
      await tab.waitForTimeout(50);
    }
    throw new Error('no frame for the page');
  }

  /** Scroll the page, in devknobs' frame where the page is drawn in one, to put `selector` near the top. */
  async function scrollTo(tab: Page, selector: string) {
    const docked = await tab.evaluate(
      () => document.querySelector('[data-devknobs="viewport"]') !== null,
    );
    const target = docked ? await framed(tab) : tab.mainFrame();
    await target.evaluate((selector) => {
      const top = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect().top;
      window.scrollBy(0, top - 16);
    }, selector);
  }

  const img = (png: Buffer, extra = '') => `<img src="${dataUrl(png)}" style="${extra}">`;

  // The frame's look: the panel's warm neutrals and its system font stack.
  const style = `
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body {
      width: var(--w); height: var(--h); overflow: hidden; position: relative;
      background: radial-gradient(120% 90% at 50% 0%, #f6f5f1 0%, #e9e8e2 100%);
      color: #1b1b19;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    h1 {
      position: absolute; top: 40px; left: 0; right: 0; margin: 0; text-align: center;
      font-size: 44px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em;
    }
    .window {
      position: absolute; left: 50%; top: 128px; transform: translateX(-50%);
      border-radius: 14px 14px 0 0; overflow: hidden; background: #ffffff;
      box-shadow: 0 0 0 1px rgb(27 27 25 / 0.08), 0 24px 60px -12px rgb(27 27 25 / 0.28);
    }
    .bar {
      height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 14px;
      background: #f1f1ec; border-bottom: 1px solid #e6e6e0;
    }
    .bar i { width: 12px; height: 12px; border-radius: 50%; background: #d9d8d2; }
    .bar span {
      margin: 0 auto; padding: 4px 60px; border-radius: 8px; background: #ffffff;
      font-size: 13px; color: #73736d;
    }
    .page { position: relative; display: block; }
    .page img { display: block; width: 100%; height: 100%; }
    .copied {
      position: absolute; border-radius: 12px; background: #151513; color: #e9e9e3;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.08), 0 24px 60px -8px rgb(0 0 0 / 0.55);
      overflow: hidden;
    }
    .copied header {
      display: flex; align-items: center; gap: 8px; padding: 12px 16px;
      font-size: 15px; font-weight: 600; border-bottom: 1px solid #2b2b28;
    }
    .copied header b { width: 8px; height: 8px; border-radius: 50%; background: #3e8ef7; }
    .copied pre {
      margin: 0; padding: 14px 16px; white-space: pre-wrap; word-break: break-all;
      font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #c8c8c0;
    }
  `;

  /** Render html at a size into a png in store/. */
  async function draw(width: number, height: number, body: string, out: string) {
    const tab = await drawing.newPage({ viewport: { height, width } });
    await tab.setContent(
      `<!doctype html><meta charset="utf-8"><style>${style}</style>
      <body style="--w:${width}px;--h:${height}px">${body}</body>`,
    );
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: join(store, out) });
    await tab.close();
  }

  /** A 1280x800 shot: the caption over the tab in a browser window, and anything on top. */
  async function frame(caption: string, page: string, out: string, over = '') {
    await draw(
      1280,
      800,
      `<h1>${caption}</h1>
      <div class="window" style="width:${shown.width}px">
        <div class="bar"><i></i><i></i><i></i><span>fernwood.coffee/dashboard</span></div>
        <div class="page" style="width:${shown.width}px;height:${shown.height}px">${page}</div>
      </div>${over}`,
      out,
    );
  }

  // The panel as a column beside the page, which it lays out narrower and never covers.
  const docked = { docked: true, open: true };

  // 1. The same page at a larger text, light, and dark with reduced motion. Both tabs have
  // the panel docked, so the page lays out the same in each and the halves meet.
  const before = await fresh({ panel: { ...docked, pinned: ['text'] }, text: 20 });
  const light = await settled(before);
  await before.close();
  const tab1 = await fresh({
    motion: 'reduce',
    panel: { ...docked, pinned: ['scheme', 'motion', 'text', 'contrast', 'vision'] },
    scheme: 'dark',
    text: 20,
  });
  const dark = await settled(tab1);
  await tab1.close();
  await frame(
    'Test dark mode, motion, text size and more on any page',
    `${img(light, 'position:absolute;inset:0;clip-path:inset(0 50% 0 0)')}
     ${img(dark, 'position:absolute;inset:0;clip-path:inset(0 0 0 50%)')}
     <div style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#ffffff;box-shadow:0 0 12px rgb(0 0 0 / 0.35)"></div>`,
    'screenshot-1-dark-mode-v2.png',
  );

  // 2. An iPhone: its size, its browser's bars and touch, the page's mobile menu open.
  const tab2 = await fresh({
    device: 'iphone-17',
    mock: true,
    panel: { open: true, pinned: ['device', 'viewport'] },
  });
  const phone = await framed(tab2);
  await phone.evaluate(() => document.querySelector<HTMLElement>('.menu-button')!.click());
  await phone.waitForFunction(() => document.querySelector('.mobile-menu.open') !== null);
  await frame(
    'See your site on a real phone size, with touch',
    img(await settled(tab2)),
    'screenshot-2-phone-v2.png',
  );
  await tab2.close();

  // 3. Arabic, right to left, in Tokyo's time zone and at Tokyo.
  const tab3 = await fresh({ panel: { ...docked, pinned: ['locale', 'clock', 'location'] } });
  await set(tab3, {
    geo: { preset: 'tokyo' },
    locale: { dir: 'rtl', lang: 'ar' },
    timeZone: 'Asia/Tokyo',
  });
  const page3 = await framed(tab3);
  await page3.evaluate(() => (window as Window & { locate?: () => void }).locate?.());
  await page3.waitForFunction(() => document.getElementById('place')?.textContent?.includes('35.'));
  await frame(
    'Switch locale, right-to-left, time zone and location',
    img(await settled(tab3)),
    'screenshot-3-locale-v2.png',
  );
  await tab3.close();

  // 4. More contrast, a larger text and a red-green filter, where the chart's lines look alike.
  const tab4 = await fresh({
    contrast: 'more',
    panel: { ...docked, pinned: ['contrast', 'text', 'vision'] },
    text: 20,
    vision: 'deuteranopia',
  });
  await scrollTo(tab4, '.stat');
  await frame(
    'Check contrast, large text and color blindness',
    img(await settled(tab4)),
    'screenshot-4-accessibility-v2.png',
  );
  await tab4.close();

  // 5. Grab on the page's button: its box and its component's name on the page, then what
  // a click copies for the agent, the button's html, its component and its source file.
  const tab5 = await fresh();
  await scrollTo(tab5, '.greet');
  // A click on the page clear of everything, so the key goes to the page.
  await tab5.mouse.click(viewport.width / 2, 8);
  await tab5.keyboard.press('Shift+G');
  await tab5.waitForFunction(() => document.querySelector('[data-devknobs="grab"]') !== null);
  const box = (await tab5.locator('#reorder').boundingBox())!;
  await tab5.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await tab5.waitForFunction(() =>
    document
      .querySelector('[data-devknobs="grab"]')
      ?.shadowRoot?.textContent?.includes('TopSeller'),
  );
  const hover = await settled(tab5);
  await tab5.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const copied = await tab5.waitForFunction(async () => {
    const text = await navigator.clipboard.readText().catch(() => '');
    return text.includes('TopSeller') ? text : null;
  });
  const text = String(await copied.jsonValue());
  await tab5.close();
  await frame(
    'Grab an element for your coding agent',
    img(hover),
    'screenshot-5-grab-v2.png',
    `<div class="copied" style="left:40px;bottom:28px;width:560px">
      <header><b></b>Copied for your agent</header>
      <pre>${escape(text)}</pre>
    </div>`,
  );

  // The promo tiles: the logo, the name and what it is, on the panel's dark ground.
  const tile = (size: number, name: number, line: number, gap: number, extra = '') => `
    <div style="position:absolute;inset:0;background:radial-gradient(120% 120% at 20% 0%, #2a2a27 0%, #151513 70%)"></div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;gap:${gap}px;padding:0 ${gap}px;color:#e9e9e3">
      <div style="display:flex;flex-direction:column;gap:${gap / 2}px;flex:1">
        <div style="display:flex;align-items:center;gap:${gap / 2}px">
          <div style="width:${size}px;height:${size}px">${logo.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>
          <div style="font-size:${name}px;font-weight:700;letter-spacing:-0.03em;line-height:1">knobs</div>
        </div>
        <div style="font-size:${line}px;font-weight:600;line-height:1.2;letter-spacing:-0.01em;max-width:16em">Dark mode, mobile view and accessibility tester</div>
      </div>
      ${extra}
    </div>`;
  await draw(440, 280, tile(64, 48, 27, 36), 'promo-small-440x280-v2.png');
  await draw(
    1400,
    560,
    tile(
      96,
      80,
      40,
      72,
      // The first shot's split, light and dark, whole.
      `<div style="flex:none;position:relative;width:660px;height:${Math.round((660 * viewport.height) / viewport.width)}px;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px rgb(255 255 255 / 0.1), 0 24px 60px rgb(0 0 0 / 0.5)">
        ${img(light, 'position:absolute;inset:0;width:100%;height:100%;clip-path:inset(0 50% 0 0)')}
        ${img(dark, 'position:absolute;inset:0;width:100%;height:100%;clip-path:inset(0 0 0 50%)')}
        <div style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#ffffff"></div>
      </div>`,
    ),
    'promo-marquee-1400x560-v2.png',
  );
}
