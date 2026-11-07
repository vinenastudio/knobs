// The Chrome Web Store's screenshots and promo tiles: builds the extension as the store
// gets it, loads it into Playwright's Chromium, headless, puts the demo shop in store/demo/
// in a tab, sets knobs through the panel's own api, and lays each shot under its caption in
// an html frame drawn in the same browser. Writes into store/. Needs devknobs built.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DevknobsStatePatch } from '@vinena/knobs';
import { chromium, type Frame, type Page } from 'playwright-core';

const root = join(import.meta.dirname, '..');
const store = join(root, 'store');
const demo = await readFile(join(store, 'demo/index.html'), 'utf8');
const logo = await readFile(join(root, '../../apps/web/public/favicon.svg'), 'utf8');

// A release build, whose panel shows the version alone and no local build's label.
const own = await mkdtemp(join(tmpdir(), 'knobs-store-shots-'));
const dist = join(own, 'dist');
execFileSync('bun', [join(root, 'scripts/build.ts'), dist], {
  env: { ...process.env, KNOBS_RELEASE: '1' },
  stdio: 'inherit',
});

// The demo answers at a shop's own address, served from here, not from the network.
const url = 'https://fernwood.coffee/';
// The tab, drawn at twice its size so it stays sharp in the frame.
const viewport = { height: 600, width: 960 };
const context = await chromium.launchPersistentContext(join(own, 'profile'), {
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    `--window-size=${viewport.width},${viewport.height}`,
  ],
  channel: 'chromium',
  // A light system, whatever this machine's, so the knobs' own change is what shows.
  colorScheme: 'light',
  contrast: null,
  deviceScaleFactor: 2,
  headless: true,
  reducedMotion: null,
  // The shop's own zone and language, whatever this machine's.
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  viewport,
});
await context.route(`${url}**`, (route) => {
  const { pathname } = new URL(route.request().url());
  if (pathname.startsWith('/api/')) {
    return route.fulfill({ contentType: 'application/json', json: { ok: true } });
  }
  return route.fulfill({ body: demo, contentType: 'text/html; charset=utf-8' });
});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
// The frames are drawn in a browser of their own, with no extension on its pages.
const drawing = await chromium.launch({ channel: 'chromium', headless: true });

/** The panel's api, once devknobs has mounted and settled. */
const ready = (tab: Page) =>
  tab.waitForFunction(async () => {
    await window.devknobs?.ready();
    return document.querySelector('[data-devknobs="panel"]') !== null;
  });

/** Set knobs, and wait for the page's load where a knob loads it again. */
async function set(tab: Page, patch: DevknobsStatePatch) {
  const loaded = tab.waitForEvent('load', { timeout: 4000 }).catch(() => null);
  await tab
    .evaluate((patch) => {
      window.devknobs!.setState(patch);
    }, patch)
    .catch((error: unknown) => {
      if (!String(error).includes('Execution context was destroyed')) {
        throw error;
      }
    });
  await loaded;
  await ready(tab);
  await tab.evaluate(() => window.devknobs!.ready());
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
  return last;
}

/** A fresh tab on the demo, devknobs up with its knobs at their defaults. */
async function fresh(patch: DevknobsStatePatch = {}) {
  const tab = await context.newPage();
  await tab.goto(url);
  await ready(tab);
  await tab.evaluate(() => window.devknobs!.reset());
  await set(tab, patch);
  return tab;
}

/** The demo's page inside devknobs' frame, where a device is up. */
async function framed(tab: Page): Promise<Frame> {
  for (let tries = 0; tries < 100; tries++) {
    const frame = tab.frames().find((frame) => frame !== tab.mainFrame() && frame.url() === url);
    if (frame) {
      await frame.waitForLoadState();
      return frame;
    }
    await tab.waitForTimeout(50);
  }
  throw new Error('no frame for the device');
}

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

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
    position: absolute; top: 46px; left: 0; right: 0; margin: 0; text-align: center;
    font-size: 44px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em;
  }
  .window {
    position: absolute; left: 50%; top: 136px; transform: translateX(-50%);
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
`;

/** A 1280x800 shot: the caption over the tab in a browser window. */
async function frame(caption: string, page: string, out: string) {
  const width = 1056;
  const height = Math.round((width * viewport.height) / viewport.width);
  await draw(
    1280,
    800,
    `<h1>${caption}</h1>
    <div class="window" style="width:${width}px">
      <div class="bar"><i></i><i></i><i></i><span>fernwood.coffee/dashboard</span></div>
      <div class="page" style="width:${width}px;height:${height}px">${page}</div>
    </div>`,
    out,
  );
}

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

const img = (png: Buffer, extra = '') => `<img src="${dataUrl(png)}" style="${extra}">`;

// 1. The same page at a larger text, light, and dark with reduced motion.
const before = await fresh({ text: 20 });
const light = await settled(before);
await before.close();
const tab1 = await fresh();
await set(tab1, {
  motion: 'reduce',
  panel: { open: true, pinned: ['scheme', 'motion', 'text', 'contrast', 'location'] },
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
  'screenshot-1-dark-mode.png',
);

// 2. An iPhone: its size, its browser's bars and touch, the page's mobile menu open.
const tab2 = await fresh();
await set(tab2, {
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
  'screenshot-2-phone.png',
);
await tab2.close();

// 3. Arabic, right to left, in Tokyo's time zone and at Tokyo.
const tab3 = await fresh();
await set(tab3, {
  geo: { preset: 'tokyo' },
  locale: { dir: 'rtl', lang: 'ar' },
  panel: { open: true, pinned: ['locale', 'clock', 'location'], side: 'left' },
  timeZone: 'Asia/Tokyo',
});
await tab3.evaluate(() => (window as Window & { locate?: () => void }).locate?.());
await tab3.waitForFunction(() => document.getElementById('place')?.textContent?.includes('35.'));
await frame(
  'Switch locale, right-to-left, time zone and location',
  img(await settled(tab3)),
  'screenshot-3-locale.png',
);
await tab3.close();

// 4. More contrast, a larger text and a red-green filter, where the chart's lines look alike.
const tab4 = await fresh();
await set(tab4, {
  contrast: 'more',
  panel: { open: true, pinned: ['contrast', 'text', 'vision'] },
  text: 22,
  vision: 'deuteranopia',
});
// Its filter draws the page in devknobs' frame, which is what scrolls.
const filtered = await framed(tab4);
await filtered.evaluate(() =>
  scrollTo(0, document.querySelector<HTMLElement>('.chart')!.offsetTop - 140),
);
await frame(
  'Check contrast, large text and color blindness',
  img(await settled(tab4)),
  'screenshot-4-accessibility.png',
);
await tab4.close();

// 5. Grab on the page's button, the panel's requests view open beside it.
const tab5 = await fresh({ panel: { side: 'left' } });
// The button's own request, and the page scrolled so the button sits clear of the frame's edge.
await tab5.evaluate(() => {
  document.getElementById('reorder')!.click();
  scrollTo(0, 160);
});
// A click on the page clear of the panel, so the keys go to the page.
const onPage = () => tab5.mouse.click(viewport.width - 120, 120);
await onPage();
await tab5.keyboard.press('Shift+N');
await tab5.evaluate(() => window.devknobs!.ready());
await onPage();
await tab5.keyboard.press('Shift+G');
await tab5.waitForFunction(() => document.querySelector('[data-devknobs="grab"]') !== null);
const button = tab5.locator('#reorder').boundingBox();
const box = (await button)!;
await tab5.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
await frame(
  'Grab an element for your coding agent',
  img(await settled(tab5)),
  'screenshot-5-grab.png',
);
await tab5.close();

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
await draw(440, 280, tile(64, 48, 27, 36), 'promo-small-440x280.png');
await draw(
  1400,
  560,
  tile(
    104,
    84,
    44,
    80,
    // The first shot's split, light and dark, cropped to its middle and the panel.
    `<div style="flex:none;position:relative;width:600px;height:375px;border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px rgb(255 255 255 / 0.1), 0 24px 60px rgb(0 0 0 / 0.5)">
      <div style="position:absolute;left:-200px;top:0;width:800px;height:500px">
        ${img(light, 'position:absolute;inset:0;width:100%;height:100%;clip-path:inset(0 50% 0 0)')}
        ${img(dark, 'position:absolute;inset:0;width:100%;height:100%;clip-path:inset(0 0 0 50%)')}
      </div>
      <div style="position:absolute;top:0;bottom:0;left:200px;width:2px;margin-left:-1px;background:#ffffff"></div>
    </div>`,
  ),
  'promo-marquee-1400x560.png',
);

await context.close();
await drawing.close();
await rm(own, { force: true, recursive: true });
