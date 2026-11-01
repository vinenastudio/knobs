/**
 * Draws the site's one Open Graph image, `public/og.png`: the real devknobs
 * on the landing, an iPhone Duo held half open on the blue mat, with the mark,
 * the name and the headline over the mat on the left. It starts the dev server
 * on a free port (or uses `OG_URL`), drives the panel in the system Chrome
 * through playwright-core, takes the shot at 2x and draws it down to 1200 by
 * 630 in the same browser. The fold slider is held with the mouse while the
 * shot is taken, so the hinge stays where the hand left it.
 *
 * Run with `pnpm --filter @knobs/web og` after a copy or look change and
 * commit the PNG. `--out <file>` and `--angle <0..1>` (shut to open flat)
 * draw other takes of the same scene, to compare. `--posts` draws each blog
 * post's image instead, `public/og/blog/<slug>.png`: the same scene with the
 * post's title as the headline, wrapped to at most three lines.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { crc32 } from 'node:zlib';
import type {} from '@vinena/knobs';
import { chromium, type Browser, type Page } from 'playwright-core';
import messages from '../messages/en.json' with { type: 'json' };
import { postFrontmatter } from '../src/blog/frontmatter.ts';

const root = path.resolve(import.meta.dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const { values: args } = parseArgs({
  options: {
    angle: { default: '0.72', type: 'string' },
    out: { default: path.join(root, 'public/og.png'), type: 'string' },
    posts: { default: false, type: 'boolean' },
  },
});

const mark = `data:image/svg+xml;base64,${readFileSync(path.join(root, 'public/favicon.svg')).toString('base64')}`;
// Two lines, broken by hand, so "design engineers" stays together.
const HEADLINE = ['devtools for', 'design engineers'];

/** An image to draw: its headline, as lines broken by hand or as one text to wrap, and its file. */
type Take = { headline: Array<string> | string; out: string };

const blog = path.join(root, 'content/blog');
const takes: Array<Take> = args.posts
  ? readdirSync(blog)
      .filter((name) => name.endsWith('.md'))
      .map((name) => {
        const slug = name.slice(0, -'.md'.length);
        const { title } = postFrontmatter(slug, readFileSync(path.join(blog, name), 'utf8'));
        return { headline: title, out: path.join(root, `public/og/blog/${slug}.png`) };
      })
  : [{ headline: HEADLINE, out: args.out }];

// The window is wider than the image, so devknobs centers the device right of
// the image's middle and the left of the mat is free for the words. The panel,
// whose slider holds the fold, sits past the image's right edge.
const view = { height: HEIGHT, width: 1700, zoom: 0.64 };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address !== null
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

function stop(server: ChildProcess) {
  if (server.pid === undefined || server.exitCode !== null) {
    return;
  }
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch (error) {
    // The group is gone already.
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
  }
}

async function startServer(onSpawn: (server: ChildProcess) => void): Promise<string> {
  if (process.env['OG_URL']) {
    return process.env['OG_URL'];
  }
  const port = await freePort();
  const server = spawn(
    process.execPath,
    [path.join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--strictPort'],
    // Its own process group, so the stop takes workerd, its child, with it.
    { cwd: root, detached: true, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' },
  );
  onSpawn(server);
  const url = `http://localhost:${port}/`;
  for (let tries = 0; tries < 120; tries += 1) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`og: the dev server exited (${server.signalCode ?? server.exitCode})`);
    }
    try {
      if ((await fetch(url)).ok) {
        return url;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop(server);
  throw new Error(`og: the dev server did not answer at ${url}`);
}

// What devknobs draws for a person at work and not for a picture: the strip
// with the device's name and size, and the numbers on the mat's rulers. The
// address in Safari's bar goes too: the image names no domain.
const QUIET = `
.size, .mat text { visibility: hidden !important; }
.safari .domain { color: transparent !important; }
`;

// The words, over the mat on the left, in the site's system stack, all in the
// upper two thirds: X lays the site's name over the bottom left corner.
// A wrapped headline stays clear of the device's edge. A popover,
// so it sits in the top layer with devknobs' own layers.
/** A post title as html text. */
const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const overlay = (headline: Take['headline']) => `
<style>
  .og {
    position: fixed; inset: 0 auto 0 0; margin: 0; border: 0; background: none; overflow: visible;
    box-sizing: border-box; width: 560px; height: 100%; padding: 72px 0 0 80px;
    display: flex; flex-direction: column; gap: 168px;
    pointer-events: none; color: #f4f6fb;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .og .brand { display: flex; align-items: center; gap: 18px; font-size: 44px; font-weight: 500; letter-spacing: -0.01em; }
  .og .brand img { width: 56px; height: 56px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0, 8, 30, 0.45); }
  .og h1 { margin: 0; font-size: 60px; line-height: 1.06; font-weight: 500; letter-spacing: -0.035em; text-shadow: 0 2px 24px rgba(0, 10, 40, 0.35); text-wrap: balance; max-width: 440px; }
</style>
<div class="og" data-devknobs="og" popover="manual">
  <div class="brand"><img alt="" src="${mark}">${messages['app_name']}</div>
  <h1>${typeof headline === 'string' ? escape(headline) : headline.map((line) => `<span style="display: block; white-space: nowrap">${line}</span>`).join('')}</h1>
</div>`;

/** Every open shadow root on the page, for the style that quiets devknobs' own strip. */
async function quiet(page: Page) {
  await page.evaluate((css) => {
    for (const host of document.querySelectorAll('*')) {
      if (host.shadowRoot && host.shadowRoot.querySelector('[data-og]') === null) {
        const style = document.createElement('style');
        style.dataset['og'] = '';
        style.textContent = css;
        host.shadowRoot.append(style);
        // The fold draws the bar's picture from the address text, which
        // devknobs writes again on each change, so it is emptied each time.
        const empty = () => {
          for (const domain of host.shadowRoot?.querySelectorAll('.domain') ?? []) {
            if (domain.textContent !== '') {
              domain.textContent = '';
            }
          }
        };
        empty();
        new MutationObserver(empty).observe(host.shadowRoot, {
          characterData: true,
          childList: true,
          subtree: true,
        });
      }
    }
  }, QUIET);
}

async function shoot(page: Page, url: string, headline: Take['headline']) {
  await page.addInitScript(() => {
    try {
      // The tour's first bubble would sit over the page: it counts as seen.
      localStorage.setItem('knobs:tour', '1');
    } catch {
      // No storage, no tour either.
    }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.devknobs !== undefined, null, { timeout: 60_000 });
  await page.evaluate(async (zoom) => {
    const knobs = window.devknobs;
    if (knobs === undefined) {
      throw new Error('og: devknobs is not on the page');
    }
    knobs.setState({
      bars: 'expanded',
      browser: 'compact',
      device: 'iphone-duo',
      mat: 'blue',
      mock: true,
      panel: { docked: false, handle: false, open: true },
      posture: 'closed',
      scheme: 'dark',
      // The finger dot the mouse would draw in the frame.
      touchPointer: false,
      zoom,
    });
    await knobs.ready();
  }, view.zoom);

  // Down to the stage, whose cards hold the page's colors, before the fold
  // takes its picture of the page.
  const frame = page.frameLocator('iframe').first();
  await frame.locator('#try').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(600);
  await quiet(page);

  await page
    .locator('.row-label', { hasText: /^device$/ })
    .first()
    .click();
  const slider = page.locator('.fold-slider').first();
  await slider.waitFor();
  // The row's editor slides open first.
  await page.waitForTimeout(800);
  const box = await slider.boundingBox();
  if (box === null) {
    throw new Error('og: the fold slider is not on the page');
  }
  // The thumb is 28 px wide, 2 px inside the track.
  const y = box.y + box.height / 2;
  const at = (share: number) => box.x + 2 + 14 + share * (box.width - 32);
  await page.mouse.move(at(0), y);
  await page.mouse.down();
  await page.mouse.move(at(Number(args.angle)), y, { steps: 30 });
  await page.waitForTimeout(1800);

  await quiet(page);
  await page.evaluate((html) => {
    document.documentElement.insertAdjacentHTML('beforeend', html);
    document.querySelector<HTMLElement>('.og')?.showPopover();
  }, overlay(headline));
  await page.evaluate(() => document.fonts.ready);
  // A long title steps down in size until it fits three lines and its width.
  await page.evaluate(() => {
    const h1 = document.querySelector<HTMLElement>('.og h1');
    if (h1 === null) {
      throw new Error('og: no headline');
    }
    for (let size = 60; size >= 36; size -= 2) {
      h1.style.fontSize = `${size}px`;
      if (
        h1.getBoundingClientRect().height <= size * 1.06 * 3 + 1 &&
        h1.scrollWidth <= h1.clientWidth
      ) {
        return;
      }
    }
    throw new Error(`og: "${h1.textContent}" does not fit three lines`);
  });
  await page.waitForTimeout(300);
  return page.screenshot({ clip: { height: HEIGHT, width: WIDTH, x: 0, y: 0 }, type: 'png' });
}

/** The 2x shot drawn down to 1200 by 630 with the browser's own smoothing. */
async function downscale(page: Page, shot: Buffer) {
  const data = await page.evaluate(
    async ({ height, src, width }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { colorSpace: 'srgb' });
      if (context === null) {
        throw new Error('og: no 2d canvas');
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL('image/png');
    },
    { height: HEIGHT, src: `data:image/png;base64,${shot.toString('base64')}`, width: WIDTH },
  );
  return srgb(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
}

/**
 * The PNG with an `sRGB` chunk after its header: the canvas writes none, and
 * a viewer that reads an untagged image in the display's own space would
 * shift the mat's blue.
 */
function srgb(png: Buffer) {
  const body = Buffer.from([0x73, 0x52, 0x47, 0x42, 0]);
  const chunk = Buffer.alloc(4 + body.length + 4);
  chunk.writeUInt32BE(1, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 4 + body.length);
  // The signature (8 bytes) and the header chunk (25) come first.
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

let server: ChildProcess | null = null;
let browser: Browser | null = null;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (server !== null) {
      stop(server);
    }
    process.exit(130);
  });
}
try {
  const url = await startServer((child) => {
    server = child;
  });
  // sRGB throughout: no Display P3 in the shot, and the mat's sRGB stops, not its P3 ones.
  browser = await chromium.launch({
    args: ['--force-color-profile=srgb', '--hide-scrollbars'],
    executablePath: CHROME,
  });
  const context = await browser.newContext({
    colorScheme: 'dark',
    deviceScaleFactor: SCALE,
    viewport: { height: view.height, width: view.width },
  });
  const small = await browser.newPage();
  for (const { headline, out } of takes) {
    const page = await context.newPage();
    const png = await downscale(small, await shoot(page, url, headline));
    await page.close();
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, png);
    process.stdout.write(
      `${path.relative(process.cwd(), out)} ${Math.round(png.length / 1024)} KB\n`,
    );
  }
} finally {
  await browser?.close();
  if (server !== null) {
    stop(server);
  }
}
