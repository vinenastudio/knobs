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
// show there once at most. First, the copy in the band's picture is laid out on its own and
// a sample of its elements must lie within a px of the page's, all the way down.
// Build first, then: pnpm --filter @vinena/knobs underbar-oracle [index.global.js] [screenshot dir] [--url URL] [--scroll PX] [--dark]
// With --url and no --scroll it puts the page's first large picture across the band.
// Without --url it serves its own page: a rule for its root with more to it than `:root`, an
// icon from a sprite file, a number in a shadow root, a margin a script animates, a
// picture in a round clip, a background picture, a
// drawing, and a picture from another origin that the frame may not read. And videos, of a
// clip the browser records first, whose frames are all the same, so one that plays shows the
// same in the band and in the frame: one that loops under a sound button, one from another
// origin the frame may not read, one that shows only its poster, one scaled in a round clip,
// and six of another origin, paused, with a caption that paints over or under them as the
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
/**
 * A sprite file, whose dot the page shows through a `use`, in a color from the file's own
 * gradient and a ring from its own style, which also names a class the page has: that one
 * must not reach the page.
 */
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg"><style>.spr { fill: url(#g); color: #e5484d; } #dot circle { stroke: #111; stroke-width: 4px; } @keyframes paint { from, to { background-color: rgb(0, 0, 255); } } @font-face { font-family: system-ui; src: local(Courier); }</style><script>document.title = "ran"</script><defs><linearGradient id="g"><stop offset="0" stop-color="#f5d90a"/><stop offset="1" stop-color="#e5484d"/></linearGradient></defs><symbol id="dot" viewBox="0 0 40 40"><circle class="spr" cx="20" cy="20" r="16"/></symbol><symbol id="unused"><rect width="40" height="40"/></symbol></svg>`;
const pictures: Record<string, Buffer> = {
  '/hero.png': striped(400, 500),
  '/hero@2x.png': striped(800, 1000),
  '/paper.png': png(240, 160, (x, y) => [(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256]),
  '/away.png': png(300, 200, (x, y) => [240, Math.round((y / 200) * 255), Math.round((x / 300) * 255)]),
  '/still.png': png(640, 360, (x, y) => [Math.floor(x / 40) % 2 ? 230 : 40, Math.round((y / 360) * 255), 120]),
};
/** The clip the videos show, recorded in the browser before the page loads. */
let clip: Buffer | null = null;

const page = (away: string) => `<!doctype html><html data-look="a"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>band oracle</title>
<style>
html { color-scheme: dark; }
html:root[data-look=a] { --space: 8rem; font-size: 17px; }
.spaced { margin: var(--space, 0) 0 0; font: 600 1.5rem/40px system-ui; }
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
.icon { display: block; margin: 0 auto; }
@scope (:root[data-look=a]) { .spaced { padding-bottom: 24px; } }
.still { height: 24px; margin: 0 0 8px; background: rgb(229, 72, 77); }
@keyframes fadein { from { opacity: 0; } }
@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes paint { from, to { background-color: rgb(229, 72, 77); } }
@layer utilities { .gone-layer { animation: fadein 400ms !important; } }
body .col .gone-specific { animation: fadein 400ms !important; }
.bar { position: relative; background: rgb(0, 0, 255); }
.bar::before { content: ""; position: absolute; inset: 0; background: rgb(229, 72, 77); transform-origin: left; animation: grow 100s linear -30s paused; }
.painted { background: none; animation: paint 1s both; }
</style><script src="/devknobs.js"></script></head><body><div class="col">
<div class="lead"></div>
<h2 class="spaced" id="spaced">Spaced by the root's look</h2>
<count-up id="count">7</count-up>
<p id="lift" style="margin: 0; height: 40px">moved by a script</p>
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
<section class="case" id="paint-h"><div style="position: sticky; top: 0; height: 0"><p style="position: absolute; z-index: 50; top: 50px">under</p></div><video style="position: relative" src="${away}/clip.webm" muted playsinline preload="auto"></video></section>
<section class="case" id="paint-s"><div style="position: sticky; top: 0; height: 0"><video style="position: absolute; z-index: 3" src="${away}/clip.webm" muted playsinline preload="auto"></video></div><p style="position: relative; z-index: 1; margin-top: 50px">over</p></section>
<svg class="icon" id="icon" viewBox="0 0 40 40" width="40" height="40"><use href="/sprite.svg#dot"/></svg>
<p class="spr" style="margin: 0; height: 24px; font: 600 20px/24px system-ui">the sprite's own style reaches only the sprite</p>
<div class="still gone-layer" data-oracle-color="229,72,77"></div>
<div class="still gone-specific" data-oracle-color="229,72,77"></div>
<div class="still" style="animation: fadein 400ms !important" data-oracle-color="229,72,77"></div>
<div class="still bar" data-oracle-color="0,0,255"></div>
<div class="still painted" data-oracle-color="229,72,77"></div>
<div class="tail"></div>
</div><script>
const pen = document.getElementById('chart').getContext('2d');
for (let x = 0; x < 708; x += 12) {
  pen.fillStyle = 'hsl(' + x / 2 + ' 80% 55%)';
  pen.fillRect(x, 400 - ((x * 37) % 380), 10, 400);
}
// A number drawn in a shadow root, which lays its host out, and a margin a script animates.
customElements.define('count-up', class extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host { display: block; height: 48px; font: 600 32px/48px system-ui; }</style><slot></slot>';
  }
});
document.getElementById('lift').animate([{ marginTop: '0px' }, { marginTop: '40px' }], { duration: 1, fill: 'forwards' });
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
  } else if (path === '/sprite.svg') {
    response.setHeader('content-type', 'image/svg+xml');
    response.end(SPRITE);
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
/**
 * The spots whose band holds only flat color, text and the sprite's icon, nothing a picture
 * of the page draws at another size: they must match but for the screen's edge, about 1 in
 * 100 px, so an icon drawn without its file's style, about 3 in 100, or a page's text in a
 * color of the sprite file's, about 9 in 100, shows.
 */
const EXACT = new Set(['icon']);
const exact = (gap: { mean: number; off: number }) => gap.mean < 3 && gap.off < 0.025;
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
        const ids = ['icon', 'hero', 'paper', 'chart', 'away', 'loop', 'cors', 'wait', 'scaled', 'paint-a', 'paint-b', 'paint-c', 'paint-e', 'paint-h', 'paint-s'];
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

/** How many of the page's elements the layout of the copy is checked at, at most. */
const SAMPLE = 400;
/** How far an element of the copy may lie from the page's, in css px. */
const DRIFT = 1;

/**
 * How many elements were marked and found in the copy, how many of those the page moved on
 * its own while it was measured, and each of the rest, its top and height on the page and in
 * the copy, the worst apart first.
 */
interface Drift {
  marked: number;
  found: number;
  moved: number;
  rows: { name: string; top: number; height: number; copyTop: number; copyHeight: number; off: number }[];
}

/**
 * The page's elements against their copies in the band's picture, laid out on their own: a
 * sample of the elements of the frame's document gets a mark the copy takes along, the band
 * takes a new picture, and that is laid out in a frame of the top page. Each element's top in
 * the document and its height, the page's and the copy's, the worst apart first.
 */
/**
 * The band's picture drawn as a new picture is, at its first frame, against what the page
 * shows: each element of the page with a `data-oracle-color` must draw that color at its
 * middle there. A picture runs its animations from their start, so one the page has run, or
 * holds part way, shows otherwise there at once. The picture is drawn from a url of its own,
 * so the browser runs it from its start and not on from one it drew before.
 */
async function firstFrame(tab: Page): Promise<{ name: string; want: string; drawn: string }[]> {
  return tab.evaluate(async () => {
    const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    const view = shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    const picture = shadow?.querySelector<HTMLImageElement>('.underbar > img');
    if (!view || !picture) return [{ name: 'the band', want: 'a picture', drawn: 'none' }];
    const image = new Image();
    image.src = `${picture.src}${encodeURIComponent(`<!-- ${performance.now()} -->`)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const pen = canvas.getContext('2d', { willReadFrequently: true });
    if (!pen) return [{ name: 'the band', want: 'a canvas', drawn: 'none' }];
    pen.drawImage(image, 0, 0);
    const body = view.document.body;
    const down = view.scrollY + (body && view.document.scrollingElement !== body ? body.scrollTop : 0);
    const wrong = [];
    for (const node of view.document.querySelectorAll('[data-oracle-color]')) {
      const box = node.getBoundingClientRect();
      const want = (node.getAttribute('data-oracle-color') ?? '').split(',').map(Number);
      const drawn = [...pen.getImageData(Math.round(box.left + box.width / 2), Math.round(box.top + down + box.height / 2), 1, 1).data].slice(0, 3);
      if (drawn.some((value, at) => Math.abs(value - (want[at] ?? 0)) > 40)) {
        wrong.push({ name: `${node.localName}.${[...node.classList].join('.')}${node.getAttribute('style') ? '[style]' : ''}`, want: want.join(','), drawn: drawn.join(',') });
      }
    }
    return wrong;
  });
}

async function layoutDrift(tab: Page): Promise<Drift> {
  let drift: Drift = { marked: 0, found: 0, moved: 0, rows: [] };
  // A page that draws its elements again drops the marks, so it is marked again, a few times at most.
  for (let turn = 0; turn < 3 && (drift.marked === 0 || drift.found === 0); turn++) {
    const marked = await tab.evaluate(([most, round]) => {
      const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
      const view = shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
      if (!view?.document.body) return 0;
      for (const node of view.document.querySelectorAll('[data-oracle-at]')) node.removeAttribute('data-oracle-at');
      // The page holds still while it is measured, as the picture does: what an animation moves is where it is now in both.
      const held = view.document.getAnimations().filter((animation) => animation.playState === 'running');
      for (const animation of held) animation.pause();
      Reflect.set(view, 'oracleHeld', [...((Reflect.get(view, 'oracleHeld') as Animation[] | undefined) ?? []), ...held]);
      // What the page does not show, as the content of a closed details, is laid out only when asked, so it is left out.
      const shown = [...view.document.body.querySelectorAll('*')].filter((node) => {
        if (['script', 'style', 'link', 'noscript', 'template'].includes(node.localName)) return false;
        if (node.closest('[data-devknobs]') || !node.checkVisibility()) return false;
        for (let at: Element | null = node; at; at = at.parentElement) {
          if (view.getComputedStyle(at).position === 'fixed') return false;
        }
        return node.getBoundingClientRect().height > 0;
      });
      const step = Math.max(1, shown.length / most);
      let count = 0;
      // Where each was as it was marked, to tell one the page moves on its own, which no still picture follows.
      const places: Record<string, [number, number]> = {};
      const down = view.scrollY + (view.document.scrollingElement !== view.document.body ? view.document.body.scrollTop : 0);
      for (let at = 0; at < shown.length && count < most; at += step) {
        const node = shown[Math.floor(at)];
        if (!node) continue;
        const mark = `${round}-${count++}`;
        const box = node.getBoundingClientRect();
        places[mark] = [box.top + down, box.height];
        node.setAttribute('data-oracle-at', mark);
      }
      Reflect.set(view, 'oraclePlaces', places);
      return count;
    }, [SAMPLE, turn] as const);
    if (marked === 0) continue;
    // The marks change the page, so the band takes a new picture of it, with this turn's.
    const taken = await tab
      .waitForFunction(
        (round) => document.querySelector('[data-devknobs="viewport"]')?.shadowRoot?.querySelector<HTMLImageElement>('.underbar > img')?.src.includes(`data-oracle-at%3D%22${round}-`),
        turn,
        { timeout: 10000 },
      )
      .catch(() => null);
    if (!taken) continue;
    await tab.waitForTimeout(800);
    drift = await measureDrift(tab);
  }
  return drift;
}

/** The marked elements of the page against their copies in the band's picture, as `layoutDrift` tells. */
async function measureDrift(tab: Page): Promise<Drift> {
  return tab.evaluate(async () => {
    const shadow = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    const view = shadow?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    const picture = shadow?.querySelector<HTMLImageElement>('.underbar > img');
    if (!view || !picture) return { marked: 0, found: 0, rows: [] };
    const svg = decodeURIComponent(picture.src.slice(picture.src.indexOf(',') + 1));
    const probe = document.createElement('iframe');
    // A picture is laid out at one device pixel a px, whatever the screen's, so the frame that lays it out here is too: its zoom takes the screen's ratio back out.
    probe.style.cssText = `position: fixed; left: -100000px; top: 0; width: ${picture.naturalWidth}px; height: ${picture.naturalHeight}px; border: 0; zoom: ${1 / (window.devicePixelRatio || 1)}`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const loaded = new Promise((done) => probe.addEventListener('load', done, { once: true }));
    probe.src = url;
    document.body.append(probe);
    await loaded;
    await new Promise((done) => setTimeout(done, 500));
    // The copy's animations stand where the picture starts them, which is where the page held them.
    for (const animation of probe.contentDocument?.getAnimations() ?? []) {
      animation.pause();
      animation.currentTime = 0;
    }
    const copied = new Map<string, Element>();
    for (const node of probe.contentDocument?.querySelectorAll('[data-oracle-at]') ?? []) copied.set(node.getAttribute('data-oracle-at') ?? '', node);
    const body = view.document.body;
    const scrolled = view.scrollY + (body && view.document.scrollingElement !== body ? body.scrollTop : 0);
    const name = (node: Element) => node.localName + (node.id ? `#${node.id}` : '') + (node.classList.length > 0 ? `.${[...node.classList].slice(0, 2).join('.')}` : '');
    const rows = [];
    const places = (Reflect.get(view, 'oraclePlaces') as Record<string, [number, number]> | undefined) ?? {};
    let moved = 0;
    const marked = view.document.querySelectorAll('[data-oracle-at]');
    for (const node of marked) {
      const mark = node.getAttribute('data-oracle-at') ?? '';
      const copy = copied.get(mark);
      if (!copy) continue;
      const live = node.getBoundingClientRect();
      const drawn = copy.getBoundingClientRect();
      const top = live.top + scrolled;
      const was = places[mark];
      if (was && (Math.abs(was[0] - top) > 0.5 || Math.abs(was[1] - live.height) > 0.5)) {
        moved++;
        continue;
      }
      rows.push({
        name: `${node.parentElement ? `${name(node.parentElement)} > ` : ''}${name(node)}`,
        top,
        height: live.height,
        copyTop: drawn.top,
        copyHeight: drawn.height,
        off: Math.max(Math.abs(drawn.top - top), Math.abs(drawn.height - live.height)),
      });
    }
    for (const node of marked) node.removeAttribute('data-oracle-at');
    for (const animation of (Reflect.get(view, 'oracleHeld') as Animation[] | undefined) ?? []) animation.play();
    Reflect.set(view, 'oracleHeld', []);
    probe.remove();
    URL.revokeObjectURL(url);
    return { marked: marked.length, found: rows.length + moved, moved, rows: rows.sort((a, b) => b.off - a.off) };
  });
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
  // The copy in the band's picture lays the page out as the page does, all the way down, so it moves with the page.
  const drift = await layoutDrift(tab);
  const worst = drift.rows.filter((row) => row.off > DRIFT).slice(0, 8);
  check(
    `the copy lays the page out as the page does, ${DRIFT} px at most apart`,
    drift.marked > 0 && drift.found === drift.marked && worst.length === 0,
    `${drift.found} of ${drift.marked} elements found in the copy, ${drift.moved} the page moved on its own left out, most ${(drift.rows[0]?.off ?? 0).toFixed(1)} px apart` +
      worst
        .map((row) => `\n       ${row.name}: top ${row.top.toFixed(1)} height ${row.height.toFixed(1)}, copy top ${row.copyTop.toFixed(1)} height ${row.copyHeight.toFixed(1)}`)
        .join(''),
  );
  // Its own page has animations the copy must not run again, nor run on from their start.
  if (!target) {
    const wrong = await firstFrame(tab);
    check(
      'a new picture draws what the page shows at once: animations run, held part way, and named as the sprite names its own',
      wrong.length === 0,
      wrong.length === 0 ? 'each case as the page shows it' : wrong.map((one) => `\n       ${one.name}: ${one.drawn} for ${one.want}`).join(''),
    );
  }
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
      EXACT.has(spot.name) ? exact(whole) : close(whole),
      `mean channel gap ${whole.mean.toFixed(2)}, px off ${(whole.off * 100).toFixed(2)}%, closest at ${whole.shift} px down (${whole.shifted.toFixed(2)})`,
    );
    if (stripUnder && stripLive) {
      const sharp = await difference(tab, stripUnder, stripLive, inset);
      check(
        `${spot.name}: the strip over the capsules (${strip} px) is sharp page`,
        EXACT.has(spot.name) ? exact(sharp) : close(sharp),
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
