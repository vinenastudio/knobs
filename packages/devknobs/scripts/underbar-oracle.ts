// The picture under Safari's bottom bar against the page itself. The band under the viewport
// must show what the page paints there, as the phone does. Loads the global build into
// Playwright's Chromium, draws an iPhone 17 Pro in compact Safari, and for each element it
// checks puts that element in the band, shoots the band with the bars hidden, then scrolls the
// page one band on and shoots the same document rows in the live frame, just above the band.
// The two must match: a picture, video, drawing or background the band misses shows as a
// difference. The strip between the viewport's bottom and the capsule's top, which Safari
// paints sharp, is checked with the bars on too. A page that scrolls in its body, not its
// document, is scrolled there. The console of the page is read throughout, the frame
// loaded again once, and each address the console tells of a failed CORS request for may
// show there once at most.
// Build first, then: pnpm --filter @vinena/knobs underbar-oracle [index.global.js] [screenshot dir] [--url URL] [--scroll PX] [--dark]
// With --url and no --scroll it puts the page's first large picture across the band.
// Without --url it serves its own page: a picture in a round clip, a background picture, a
// drawing, and a picture from another origin that the frame may not read. And videos, of a
// clip the browser records first, whose frames are all the same, so one that plays shows the
// same in the band and in the frame: one that loops under a sound button, one from another
// origin the frame may not read, one that shows only its poster, one scaled in a round clip,
// and four of another origin, paused, with a caption that paints over or under them as the
// browser stacks it. The looping one is watched for some turns: it takes no picture at each.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { Page } from 'playwright-core';

const root = join(import.meta.dirname, '..');
// Playwright comes from the ui package, the one that has it.
const require = createRequire(join(root, '../ui/package.json'));
const { chromium } = require('playwright') as typeof import('playwright-core');

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  if (at < 0) return null;
  const [value] = args.splice(at, 2).slice(1);
  return value ?? null;
};
const target = flag('--url');
const scrollAt = flag('--scroll');
const dark = args.includes('--dark');
if (dark) args.splice(args.indexOf('--dark'), 1);
const script = resolve(args[0] ?? join(root, 'dist/index.global.js'));
const out = args[1] ? resolve(args[1]) : null;

/** A png `width` by `height` px of `pixel`'s colors. */
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * row + 1 + x * 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, check]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head.set([8, 2, 0, 0, 0], 8);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Stripes that change down the picture, so a picture moved, cut or missing shows. */
const striped = (width: number, height: number) =>
  png(width, height, (x, y) => [
    Math.round((y / height) * 255),
    Math.floor((y / height) * 24) % 2 ? 210 : 50,
    Math.round((x / width) * 255),
  ]);
const pictures: Record<string, Buffer> = {
  '/hero.png': striped(400, 500),
  '/hero@2x.png': striped(800, 1000),
  '/paper.png': png(240, 160, (x, y) => [(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256]),
  '/away.png': png(300, 200, (x, y) => [240, Math.round((y / 200) * 255), Math.round((x / 300) * 255)]),
  '/still.png': png(640, 360, (x, y) => [Math.floor(x / 40) % 2 ? 230 : 40, Math.round((y / 360) * 255), 120]),
};
/** The clip the videos show, recorded in the browser before the page loads. */
let clip: Buffer | null = null;

const page = (away: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>band oracle</title>
<style>
html { color-scheme: dark; }
body { margin: 0; background: #1b1b18; color: #ddd; font: 16px/1.5 system-ui; }
.col { padding: 0 24px; }
.lead { height: 420px; }
.media { display: block; border-radius: 18px; overflow: hidden; margin: 0 0 40px; }
.media img { display: block; width: 100%; height: auto; background: #383835; scale: 1.04; }
.paper { height: 260px; margin: 0 0 40px; border-radius: 12px; background: #383835 url(/paper.png) center / cover no-repeat; }
canvas { display: block; width: 100%; height: 200px; margin: 0 0 40px; }
.away { display: block; width: 100%; height: auto; margin: 0 0 40px; }
.card { position: relative; border-radius: 28px; overflow: clip; margin: 0 0 300px; }
.card video, .clip video { display: block; width: 100%; height: auto; }
.sound { position: absolute; right: 12px; bottom: 12px; width: 44px; height: 44px; border: 0; border-radius: 22px; background: #f4f4f0; }
.clip { display: block; width: 100%; margin: 0 0 300px; border: 0; padding: 0; border-radius: 28px; overflow: clip; background: none; }
.clip video { scale: 1.03; object-fit: contain; background: #2b2b28; }
.case { display: flow-root; height: 160px; margin: 0 0 300px; }
.case video { display: block; top: 0; left: 0; width: 100%; height: 160px; object-fit: cover; }
.case p, .case h2 { width: 70%; height: 60px; margin: 0; background: #f5d90a; color: #111; font: 600 28px/60px system-ui; text-align: center; }
.tail { height: 1400px; }
</style><script src="/devknobs.js"></script></head><body><div class="col">
<div class="lead"></div>
<span class="media"><img id="hero" loading="lazy" src="/hero.png" srcset="/hero.png 1x, /hero@2x.png 2x" alt=""></span>
<div class="paper" id="paper"></div>
<canvas id="chart" width="708" height="400"></canvas>
<img class="away" id="away" src="${away}/away.png" alt="" style="margin-bottom: 300px">
<div class="card"><video id="loop" src="/clip.webm" muted loop autoplay playsinline width="640" height="360"></video><button class="sound"></button></div>
<div class="card"><video id="cors" src="${away}/clip.webm" muted loop autoplay playsinline width="640" height="360"></video></div>
<div class="card"><video id="wait" src="/clip.webm" poster="/still.png" muted playsinline preload="none" width="640" height="360"></video></div>
<button class="clip"><video id="scaled" src="${away}/clip.webm" muted playsinline preload="auto" width="640" height="360"></video></button>
<section class="case" id="paint-a"><div style="position: relative; height: 0"><video style="position: absolute; z-index: -10" src="${away}/clip.webm" muted playsinline preload="auto"></video></div><h2 style="margin-top: 50px">over</h2></section>
<section class="case" id="paint-b" style="position: relative"><video style="position: absolute; z-index: 2" src="${away}/clip.webm" muted playsinline preload="auto"></video><div style="position: relative"><p style="position: absolute; z-index: 5; top: 50px">over</p></div></section>
<section class="case" id="paint-c"><video style="position: relative" src="${away}/clip.webm" muted playsinline preload="auto"></video><p style="opacity: 0.9; margin-top: -110px">over</p></section>
<section class="case" id="paint-e"><p style="z-index: 5; margin-top: 50px">under</p><video style="position: relative; margin-top: -110px" src="${away}/clip.webm" muted playsinline preload="auto"></video></section>
<div class="tail"></div>
</div><script>
const pen = document.getElementById('chart').getContext('2d');
for (let x = 0; x < 708; x += 12) {
  pen.fillStyle = 'hsl(' + x / 2 + ' 80% 55%)';
  pen.fillRect(x, 400 - ((x * 37) % 380), 10, 400);
}
// The turns the looping video took, each a seek back to its start.
window.turns = 0;
document.getElementById('loop').addEventListener('seeked', () => window.turns++);
</script></body></html>`;

/**
 * Record `seconds` of a clip in `tab` as webm, its frames all the same: stripes and a square,
 * drawn again at each frame, so the recorder takes each.
 */
async function recordClip(tab: Page, seconds: number): Promise<Buffer> {
  const data = await tab.evaluate(async (long) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('no canvas');
    const draw = () => {
      for (let y = 0; y < 360; y += 20) {
        pen.fillStyle = `hsl(${y} 70% ${y % 40 ? 30 : 60}%)`;
        pen.fillRect(0, y, 640, 20);
      }
      pen.fillStyle = '#fff';
      pen.fillRect(40, 40, 120, 120);
    };
    draw();
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 8e6 });
    const parts: Blob[] = [];
    recorder.ondataavailable = (event) => parts.push(event.data);
    const stopped = new Promise((done) => (recorder.onstop = done));
    recorder.start();
    const end = performance.now() + long * 1000;
    await new Promise<void>((done) => {
      const step = () => {
        draw();
        if (performance.now() < end) requestAnimationFrame(step);
        else done();
      };
      step();
    });
    recorder.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  }, seconds);
  return Buffer.from(data, 'base64');
}

const code = await readFile(script, 'utf8');
const serve = (html: () => string) => (request: IncomingMessage, response: ServerResponse) => {
  const path = (request.url ?? '/').split('?')[0] ?? '/';
  const picture = pictures[path];
  if (picture) {
    response.setHeader('content-type', 'image/png');
    response.end(picture);
  } else if (path === '/clip.webm' && clip) {
    // In the parts the browser asks for, as a video is.
    response.setHeader('content-type', 'video/webm');
    response.setHeader('accept-ranges', 'bytes');
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1;
      response.statusCode = 206;
      response.setHeader('content-range', `bytes ${start}-${end}/${clip.length}`);
      response.end(clip.subarray(start, end + 1));
    } else response.end(clip);
  } else if (path === '/devknobs.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(code);
  } else {
    response.setHeader('content-type', 'text/html');
    response.end(html());
  }
};
const listen = async (handler: ReturnType<typeof serve>, host: string) => {
  const server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, host, done));
  return { server, port: (server.address() as AddressInfo).port };
};
// The other origin: another host name, with no CORS headers, so its picture taints a canvas.
const other = await listen(
  serve(() => ''),
  '127.0.0.1',
);
const own = await listen(
  serve(() => page(`http://localhost:${other.port}`)),
  '127.0.0.1',
);
const base = target ?? `http://127.0.0.1:${own.port}/`;

/** How far in from either side the screen's round corners reach over the band, in the top page's css px. */
const CORNER = 64;
/** How far up the screen's bottom edge reaches over the band, in the top page's css px. */
const EDGE = 2;
/**
 * Shots this close show the same page: a picture read again as data and drawn at another
 * size moves a hard edge by a part of a px, while a band that misses a picture is 15 to 140
 * apart.
 */
const close = (gap: { mean: number; off: number }) => gap.mean < 12 && gap.off < 0.1;
/** How many px of a shot a css px of the top page takes. */
const SHOT = 2;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far apart two shots of the same size are, `inset` px in from either side and `cut` px at
 * the bottom left out: the
 * mean difference of a channel, 0 to 255, and the share of px off by more than 48 in any
 * channel. And the shift down of the first, in px of the shots, that brings them closest, to
 * tell a picture moved from one missing.
 */
async function difference(tab: Page, a: Buffer, b: Buffer, inset: number, cut = 0): Promise<{ mean: number; off: number; shift: number; shifted: number }> {
  return tab.evaluate(
    async ([one, two, side, end]) => {
      const read = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no canvas');
        context.drawImage(image, 0, 0);
        return { px: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
      };
      const [first, second] = await Promise.all([read(one), read(two)]);
      const width = Math.min(first.width, second.width);
      const height = Math.min(first.height, second.height) - end;
      const compare = (shift: number) => {
        let sum = 0;
        let off = 0;
        let count = 0;
        for (let y = Math.max(0, shift); y < Math.min(height, height + shift); y++) {
          for (let x = side; x < width - side; x++) {
            const at = (y * first.width + x) * 4;
            const to = ((y - shift) * second.width + x) * 4;
            let worst = 0;
            for (let channel = 0; channel < 3; channel++) {
              const gap = Math.abs((first.px[at + channel] ?? 0) - (second.px[to + channel] ?? 0));
              sum += gap;
              worst = Math.max(worst, gap);
            }
            if (worst > 48) off++;
            count++;
          }
        }
        return { mean: sum / (count * 3), off: off / count };
      };
      const still = compare(0);
      let shift = 0;
      let shifted = still.mean;
      for (let by = -8; by <= 8; by++) {
        const mean = compare(by).mean;
        if (mean < shifted) {
          shift = by;
          shifted = mean;
        }
      }
      return { ...still, shift, shifted };
    },
    [a.toString('base64'), b.toString('base64'), inset, cut] as const,
  );
}

/** The band, the frame's viewport, its scroll, and the top of the capsules over the band, in the top page's css px. */
async function measure(tab: Page) {
  return tab.evaluate(() => {
    const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    const frame = shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]');
    const band = shadow?.querySelector<HTMLElement>('.underbar');
    const view = frame?.contentWindow;
    if (!shadow || !frame || !band || band.hidden || !view) return null;
    const box = band.getBoundingClientRect();
    const body = view.document.body;
    const inBody = body && view.document.scrollingElement !== body ? body.scrollTop : 0;
    const capsules = [...shadow.querySelectorAll('.capsule')].map((node) => node.getBoundingClientRect().top).filter((top) => top > box.top);
    return {
      band: { x: box.x, y: box.y, width: box.width, height: box.height },
      scale: frame.getBoundingClientRect().width / view.innerWidth,
      innerHeight: view.innerHeight,
      scrollY: view.scrollY + inBody,
      capsule: capsules.length > 0 ? Math.min(...capsules) : null,
      pictured: band.querySelector('img') !== null,
    };
  });
}

async function scrollFrame(tab: Page, y: number): Promise<void> {
  await tab.evaluate((to) => {
    const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    const view = shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    if (!view) return;
    // A page whose root does not scroll and whose body does is scrolled in its body.
    const { body, documentElement: root } = view.document;
    if (root.scrollHeight <= view.innerHeight && body && body.scrollHeight > body.clientHeight) body.scrollTop = to;
    else view.scrollTo(0, to);
  }, y);
  // A scroll past the pictures read takes a new picture, a quarter second apart at least.
  await tab.waitForTimeout(1200);
}

/** Hide or show the bars, and the seams on the frame's edges, so the band and the frame show bare. */
async function bars(tab: Page, shown: boolean): Promise<void> {
  await tab.evaluate((on) => {
    const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    if (!shadow) return;
    let style = shadow.querySelector('style[data-oracle]');
    if (!style) {
      style = document.createElement('style');
      style.setAttribute('data-oracle', '');
      style.textContent = '.browser, .seam { visibility: hidden !important; }';
      shadow.append(style);
    }
    (style as HTMLStyleElement).disabled = on;
  }, shown);
  await tab.waitForTimeout(100);
}

/** Where in the frame's document each element the fixture checks lies, or a page's first picture taller than `least` past its first screen. */
async function places(tab: Page, least: number): Promise<{ name: string; top: number; height: number }[]> {
  return tab.evaluate(
    ([fixture, tall]) => {
      const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
      const view = shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
      if (!view) return [];
      const body = view.document.body;
      const scrolled = view.scrollY + (body && view.document.scrollingElement !== body ? body.scrollTop : 0);
      const at = (name: string, node: Element | null | undefined) => {
        const rect = node?.getBoundingClientRect();
        return rect ? [{ name, top: rect.top + scrolled, height: rect.height }] : [];
      };
      if (fixture) {
        const ids = ['hero', 'paper', 'chart', 'away', 'loop', 'cors', 'wait', 'scaled', 'paint-a', 'paint-b', 'paint-c', 'paint-e'];
        return ids.flatMap((id) => at(id, view.document.getElementById(id)));
      }
      const picture = [...view.document.querySelectorAll('img')].find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.height >= tall && rect.top + scrolled > view.innerHeight;
      });
      return at('picture', picture);
    },
    [!target, least] as const,
  );
}

if (out) await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: string[] = [];
let failed = false;

function check(name: string, ok: boolean, detail: string): void {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) failed = true;
}

try {
  if (!target) {
    const maker = await browser.newPage();
    clip = await recordClip(maker, 1);
    await maker.close();
  }
  const tab = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: SHOT, colorScheme: dark ? 'dark' : 'light' });
  // What the page's console shows, the frame's included: errors and warnings.
  const logged: string[] = [];
  tab.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') logged.push(message.text());
  });
  // A page that does not load knobs gets it in its top window only: the frame's copy runs without.
  if (target) await tab.addInitScript(`if (window === window.top) {\n${code}\n}`);
  await tab.goto(base);
  await tab.evaluate(() => window.devknobs?.ready());
  await tab.evaluate(() =>
    window.devknobs?.setState({ device: 'iphone-17-pro', mock: true, browser: 'compact', bars: 'expanded', zoom: 1 }),
  );
  await tab.waitForFunction(
    () => {
      const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
      return shadow?.querySelector('.underbar:not([hidden]) > img') != null;
    },
    undefined,
    { timeout: 15000 },
  );
  await tab.waitForTimeout(800);
  const first = await measure(tab);
  if (!first) throw new Error('no band under the bars');
  const bandDoc = first.band.height / first.scale;
  const spots = scrollAt !== null
    ? [{ name: 'page', scroll: Number(scrollAt) }]
    : (await places(tab, 2 * bandDoc)).map(({ name, top, height }) => ({
        name,
        scroll: Math.max(0, Math.round(top + height / 2 - first.innerHeight - bandDoc / 2)),
      }));
  for (const spot of spots) {
    await scrollFrame(tab, spot.scroll);
    const at = await measure(tab);
    if (!at) throw new Error(`no band at ${spot.name}`);
    const { band } = at;
    // The band, bare, and the strip of it over the capsules' top, with the bars on.
    await bars(tab, false);
    const under = await tab.screenshot({ clip: band });
    await bars(tab, true);
    // The bottom of the screen as it shows, bars and all, to look at.
    const screen = out ? await tab.screenshot({ clip: { ...band, y: band.y - 160, height: band.height + 160 } }) : null;
    const strip = at.capsule === null ? 0 : Math.floor(at.capsule - band.y - 4);
    const stripUnder = strip > 0 ? await tab.screenshot({ clip: { ...band, height: strip } }) : null;
    // The same rows of the document, one band on, in the live frame just above the band.
    await scrollFrame(tab, at.scrollY + bandDoc);
    const moved = await measure(tab);
    const above: Box = { ...band, y: band.y - band.height };
    await bars(tab, false);
    const live = await tab.screenshot({ clip: above });
    await bars(tab, true);
    const stripLive = strip > 0 ? await tab.screenshot({ clip: { ...above, height: strip } }) : null;
    const reached = moved !== null && Math.abs(moved.scrollY - (at.scrollY + bandDoc)) < 0.5;
    if (out) {
      await writeFile(join(out, `${spot.name}-band.png`), under);
      await writeFile(join(out, `${spot.name}-live.png`), live);
      if (screen) await writeFile(join(out, `${spot.name}-screen.png`), screen);
    }
    if (!reached) {
      check(`${spot.name}: the page scrolls one band on`, false, `at ${moved?.scrollY} for ${at.scrollY + bandDoc}`);
      continue;
    }
    // The screen's round corners and its bottom edge cut the band and not the frame's rows above it.
    const inset = Math.ceil(CORNER * SHOT);
    const whole = await difference(tab, under, live, inset, Math.ceil(EDGE * SHOT));
    check(
      `${spot.name}: the band shows what the page paints there (scroll ${at.scrollY}, bars hidden)`,
      close(whole),
      `mean channel gap ${whole.mean.toFixed(2)}, px off ${(whole.off * 100).toFixed(2)}%, closest at ${whole.shift} px down (${whole.shifted.toFixed(2)})`,
    );
    if (stripUnder && stripLive) {
      const sharp = await difference(tab, stripUnder, stripLive, inset);
      check(
        `${spot.name}: the strip over the capsules (${strip} px) is sharp page`,
        close(sharp),
        `mean channel gap ${sharp.mean.toFixed(2)}, px off ${(sharp.off * 100).toFixed(2)}%, closest at ${sharp.shift} px down (${sharp.shifted.toFixed(2)})`,
      );
    }
  }
  // The looping video under the band for some turns: the cover draws each of its frames, so a turn takes no picture.
  const looping = spots.find((spot) => spot.name === 'loop');
  if (looping) {
    await scrollFrame(tab, looping.scroll);
    const count = () =>
      tab.evaluate(() => {
        const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
        const view = shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow as (Window & { turns?: number }) | null | undefined;
        return { pictures: performance.getEntriesByName('devknobs underbar picture').length, turns: view?.turns ?? 0 };
      });
    const start = await count();
    await tab.waitForTimeout(4500);
    const end = await count();
    const pictures = end.pictures - start.pictures;
    const turns = end.turns - start.turns;
    check(
      'loop: a looping video under the band takes no new picture at each turn',
      turns >= 3 && pictures <= 1,
      `${pictures} pictures over ${turns} turns`,
    );
  }
  // The frame loaded again, a new document, which asks for no address the last one was refused.
  const corsBefore = logged.filter((text) => text.includes('blocked by CORS policy')).length;
  await tab.evaluate(() => {
    const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow?.location.reload();
  });
  await tab.waitForTimeout(1500);
  for (const spot of spots) await scrollFrame(tab, spot.scroll);
  const cors = logged.filter((text) => text.includes('blocked by CORS policy'));
  const refused = new Map<string, number>();
  for (const text of cors) {
    const address = /at '([^']*)'/.exec(text)?.[1] ?? text;
    refused.set(address, (refused.get(address) ?? 0) + 1);
  }
  const most = Math.max(0, ...refused.values());
  check(
    'each address refused CORS shows in the console once at most, the frame loaded again too',
    most <= 1,
    `${logged.length} errors and warnings in all, ${cors.length} about CORS (${corsBefore} before the reload) for ${refused.size} addresses, ${most} at most for one`,
  );
  // What each picture of the page cost, as knobs measures it.
  const costs = await tab.evaluate(() => performance.getEntriesByName('devknobs underbar picture').map((entry) => entry.duration));
  const sorted = [...costs].sort((a, b) => a - b);
  results.push(
    `     ${costs.length} pictures taken, median ${(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(1)} ms, most ${(sorted.at(-1) ?? 0).toFixed(1)} ms`,
  );
  await tab.close();
} finally {
  await browser.close();
  own.server.close();
  other.server.close();
}

console.log(results.join('\n'));
if (failed) process.exit(1);
