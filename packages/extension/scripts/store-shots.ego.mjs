// The Chrome Web Store images: knobs on our live sites, in ego-browser with the knobs extension.
// Run from the repo root (see packages/extension/README.md, "Store"); the run command puts the
// repo root in ROOT. Captures at 2x, then draws each image down to the store's exact size.
// It runs in ego's runtime (node plus taskSpace); the page.evaluate bodies run in the page.

const ROOT = '__ROOT__';
// The headline font, Suisse Intl Medium (licensed, not in the repo): the run command puts its
// path here. Without it the headlines use system-ui.
const FONT = '__FONT__';
const LOGO = `${ROOT}/apps/web/public/favicon.svg`;
const OUT = `${ROOT}/packages/extension/store`;

const panel = (pinned) => ({ open: true, pinned });

const SHOTS = [
  {
    headline: 'Dark mode, without changing your Mac',
    keep: ['device', 'scheme'],
    name: 'scheme',
    state: {
      device: 'iphone-18-pro',
      mat: 'graphite',
      mock: true,
      panel: panel(['scheme']),
      scheme: 'dark',
      zoom: 0.68,
    },
    url: 'https://snug.so/',
  },
  {
    headline: 'Bigger text, to see what breaks',
    keep: ['device', 'text'],
    name: 'text',
    state: {
      device: 'pixel-10-pro',
      mat: 'graphite',
      mock: true,
      panel: panel(['text']),
      text: 22,
      zoom: 0.62,
    },
    url: 'https://caffeinagent.com/',
  },
  {
    headline: 'Right-to-left, on any page',
    keep: ['device', 'locale'],
    name: 'rtl',
    state: {
      device: 'iphone-18-pro',
      locale: { dir: 'rtl', lang: 'ar' },
      mat: 'graphite',
      mock: true,
      panel: panel(['locale']),
      scheme: 'light',
      zoom: 0.68,
    },
    url: 'https://snug.so/',
  },
  {
    headline: 'See your colors with color blindness',
    keep: ['device', 'vision'],
    name: 'vision',
    state: {
      device: 'iphone-duo',
      mat: 'graphite',
      mock: true,
      panel: panel(['vision']),
      posture: 'closed',
      vision: 'deuteranopia',
      zoom: 0.72,
    },
    url: 'https://snug.so/',
  },
];

const TAGLINE = 'Dark mode, mobile view and accessibility tester';

const TILES = [
  {
    device: true,
    file: 'promo-marquee-1400x560.png',
    height: 560,
    logo: 64,
    state: {
      device: 'iphone-18-pro',
      mat: 'graphite',
      mock: true,
      panel: panel(['scheme']),
      scheme: 'dark',
      zoom: 0.5,
    },
    tag: 30,
    title: 64,
    url: 'https://snug.so/',
    width: 1400,
  },
  {
    device: false,
    file: 'promo-small-440x280.png',
    height: 280,
    logo: 48,
    state: { device: 'iphone-18-pro', mat: 'graphite', mock: true, panel: { open: false } },
    tag: 20,
    title: 44,
    url: 'https://snug.so/',
    width: 440,
  },
];

const fs = await import('node:fs/promises');

let font = null;
try {
  font = (await fs.readFile(FONT)).toString('base64');
} catch {
  console.log('no Suisse Intl at', FONT, '- headlines fall back to system-ui');
}
const logo = await fs.readFile(LOGO, 'utf8');
const sizedLogo = (px) => logo.replace('<svg ', `<svg width="${px}" height="${px}" `);
const FAMILY = 'StoreSuisse, system-ui, sans-serif';
const INK = '#f4f3ee';

const task = await taskSpace('knobs: store shots');
console.log('space', task.spaceId);
const page = task.page('p1');

const ready = () =>
  page.waitForFunction(
    () => window.devknobs && document.querySelector('[data-devknobs="panel"]'),
    undefined,
    {
      timeout: 15_000,
    },
  );

async function load(url, state, width, height) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 2,
    height,
    mobile: false,
    width,
  });
  await page.goto(url);
  await ready();
  await page.evaluate(() => window.devknobs.reset());
  await page.waitForTimeout(800);
  await page.evaluate((st) => window.devknobs.setState(st), state);
  await page.waitForTimeout(1500);
  await ready();
  await page.waitForTimeout(3500);
  // Wait until the page's text holds still (a ticking clock or counter would be caught mid-roll).
  let last = '';
  for (let tries = 0; tries < 12; tries++) {
    const text = await page.evaluate(() => {
      const frame = document
        .querySelector('[data-devknobs="viewport"]')
        ?.shadowRoot?.querySelector('iframe');
      return (frame?.contentDocument ?? document).body.innerText;
    });
    if (text === last) {
      break;
    }
    last = text;
    await page.waitForTimeout(700);
  }
}

// Hides what the store image should not show and lays the overlay (headline, logo) over the page.
async function dress({ html, keep, onlyMat }) {
  await page.evaluate(
    async ({ font, html, keep, onlyMat }) => {
      const panelHost = document.querySelector('[data-devknobs="panel"]');
      const panel = panelHost.shadowRoot;
      for (const row of panel.querySelectorAll('.row')) {
        const label = row.querySelector('.row-label')?.textContent.trim();
        if (label && !keep.includes(label)) {
          row.style.display = 'none';
        }
      }
      for (const el of panel.querySelectorAll('*')) {
        if (el.children.length === 0 && /^extension [0-9.]+$/.test(el.textContent.trim())) {
          el.style.display = 'none';
        }
      }
      const vp = document.querySelector('[data-devknobs="viewport"]').shadowRoot;
      vp.querySelector('.size').style.visibility = 'hidden';
      if (onlyMat) {
        panelHost.style.display = 'none';
        for (const el of vp.querySelectorAll('*')) {
          if (
            !el.matches('.back, .back *, svg.mat, svg.mat *') &&
            !el.querySelector('.back, svg.mat')
          ) {
            el.style.visibility = 'hidden';
          }
        }
      }
      if (font) {
        const bytes = Uint8Array.from(atob(font), (c) => c.charCodeAt(0));
        const face = new FontFace('StoreSuisse', bytes.buffer, { weight: '500' });
        await face.load();
        document.fonts.add(face);
      }
      document.getElementById('store-cap')?.remove();
      const host = document.createElement('div');
      host.id = 'store-cap';
      host.dir = 'ltr';
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
      host.attachShadow({ mode: 'open' }).innerHTML = html;
      document.documentElement.append(host);
    },
    { font, html, keep, onlyMat },
  );
  await page.waitForTimeout(700);
}

// Captures the 2x page and draws it down to width x height in the page, high quality.
async function save(file, width, height) {
  const { data } = await page.cdp('Page.captureScreenshot', { format: 'png' });
  const small = await page.evaluate(
    async ({ data, height, width }) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
        resizeHeight: height,
        resizeQuality: 'high',
        resizeWidth: width,
      });
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const out = new Uint8Array(
        await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
      );
      let binary = '';
      for (let i = 0; i < out.length; i += 0x80_00) {
        binary += String.fromCharCode(...out.subarray(i, i + 0x80_00));
      }
      return btoa(binary);
    },
    { data, height, width },
  );
  await fs.writeFile(`${OUT}/${file}`, Buffer.from(small, 'base64'));
  console.log('ok', file);
}

try {
  for (const [index, shot] of SHOTS.entries()) {
    await load(shot.url, shot.state, 1280, 800);

    // The device's left edge and top, so the headline column ends before the device.
    const edge = await page.evaluate(() => {
      const vp = document.querySelector('[data-devknobs="viewport"]').shadowRoot;
      let best = vp.querySelector('iframe').getBoundingClientRect();
      for (const el of vp.querySelectorAll('img, svg:not(.mat), div')) {
        const r = el.getBoundingClientRect();
        if (
          r.width > 150 &&
          r.height > 150 &&
          r.width < 1100 &&
          r.left < best.left &&
          r.right >= best.right - 2
        ) {
          best = r;
        }
      }
      return { left: best.left, top: best.top };
    });

    const column = Math.max(220, Math.round(edge.left - 112));
    await dress({
      html: `<div style="position:absolute;left:56px;top:${Math.max(56, Math.round(edge.top))}px;width:${column}px;font:500 40px/1.12 ${FAMILY};letter-spacing:-0.02em;color:${INK};text-wrap:balance">${shot.headline}</div>
        <div style="position:absolute;left:56px;bottom:44px;display:flex;align-items:center;gap:10px;font:500 20px ${FAMILY};color:${INK};opacity:.9">
          <span style="width:28px;height:28px;display:block">${sizedLogo(28)}</span>knobs</div>`,
      keep: shot.keep,
      onlyMat: false,
    });
    await save(`screenshot-${index + 1}-${shot.name}.png`, 1280, 800);
  }

  for (const tile of TILES) {
    await load(tile.url, tile.state, tile.width, tile.height);
    const pad = tile.device ? 72 : 32;
    const column = tile.device ? 470 : tile.width - 2 * pad;
    const gap = tile.logo / 3;
    await dress({
      html: `<div style="position:absolute;left:${pad}px;top:50%;transform:translateY(-50%);width:${column}px;color:${INK};font-family:${FAMILY};font-weight:500">
        <div style="display:flex;align-items:center;gap:${gap}px">
          <span style="width:${tile.logo}px;height:${tile.logo}px;display:block">${sizedLogo(tile.logo)}</span>
          <span style="font-size:${tile.title}px;letter-spacing:-0.03em;line-height:1">knobs</span></div>
        <div style="margin-top:${gap}px;font-size:${tile.tag}px;line-height:1.15;letter-spacing:-0.01em;text-wrap:balance;opacity:.92">${TAGLINE}</div></div>`,
      keep: ['device', 'scheme'],
      onlyMat: !tile.device,
    });
    await save(tile.file, tile.width, tile.height);
  }
} finally {
  await page
    .evaluate(() => {
      document.getElementById('store-cap')?.remove();
      window.devknobs?.reset();
    })
    .catch(() => {});
  await page.cdp('Emulation.clearDeviceMetricsOverride', {}).catch(() => {});
  await task.finish({ keep: [] });
}
