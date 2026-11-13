---
title: Window sizes
meta_title: Window sizes: a responsive viewer for your breakpoints
description: Test window sizes with the knobs width and height knobs. The page runs in a frame of that size, so media queries, vw units and container queries follow.
order: 10
updated: 2026-11-13
terms: window resizer chrome extension, responsive viewer
---

The viewport width and height knobs give the page a viewport of any size, with no change to the browser window. The page runs in a same-origin frame of that size, a real viewport, so media queries, fixed elements, `vw` units and container queries all see it. The other knobs follow the page into the frame.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and type a width such as `390` or `500`. The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

- Width: a size in px, or `full` for the window.
- Height: a size in px, or `full`. With a height, `innerHeight`, `100vh`, `svh`, `dvh` and height media queries see the frame's height.
- Orientation: turns a frame that has a width and a height.
- Device pixel ratio: 1, 2 or 3, so resolution queries and `srcset` follow.
- Zoom: how big the frame is drawn, `fit`, or 50, 75, 100, 125 or 150 percent. The page inside keeps its viewport.

A frame wider or taller than the window is scaled down to fit. The readout says the device, the size and the ratio, such as `iPhone 16 Pro · 402 × 874 · 3x`. Meta or Ctrl with `+` and `-` zoom the frame a step, and with `0` fit it again.

With the extension, a plain size becomes the tab's own viewport, with no reload. While it is set, Chrome shows its "started debugging this browser" bar. To avoid the bar, turn off "real browser settings" in the panel's settings.

For a phone or tablet with its body and browser, see [mobile simulator](/use/mobile-simulator). Every knob is listed in [every knob](/docs/knobs).

## Limits

- knobs shows one frame at a time. It does not show several sizes side by side, so set them one after another.
- The frame loads the page a second time, so in-memory state, such as a half-filled form, is not shared between the two.
- A page that refuses to be framed with `X-Frame-Options` or `frame-ancestors` gets a notice. The extension removes those headers for the frame's loads of the page's host.
- Device pixel ratio outside Chromium needs devtools.

## Drive it from an agent

A coding agent can set the knobs through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.devknobs.setState({ width: 390, height: 844 });
await window.devknobs.ready();
```

`ready()` resolves with the state once the frame has caught up. To check several sizes, repeat with each one and take a screenshot after each `ready()`. `setState({ width: 'full', height: 'full' })` or `reset()` gives the page the window back. See [agents](/docs/agents).

Next: see the page through a [color blindness simulator](/use/color-blindness-simulator).
