---
title: Mobile simulator
meta_title: Mobile simulator in Chrome: iPhone, Pixel and iPad frames
description: A mobile simulator for your pages. The knobs device knob shows a page on an iPhone, Pixel or iPad, in a real viewport with the phone's body and browser.
order: 9
updated: 2026-11-13
terms: mobile simulator chrome extension, iphone simulator
---

The device knob shows the page on a phone, a tablet or a laptop. One pick sets the width, height, device pixel ratio and touch screen of that device. The page runs in a same-origin frame, a real viewport, so media queries, `vw` units and fixed elements follow the device's size.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for "iphone", "pixel" or "tablet". The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The presets come in six families: iPhone, such as iPhone 18 Pro (402 × 874) and iPhone SE (375 × 667); Pixel, such as Pixel 10 (412 × 924); iPad, such as iPad mini (744 × 1133); MacBook Air 13; laptop; and desktop. The full list is in [devices](/docs/devices).

- Orientation: `landscape` turns the frame. Type a size such as `390x844` for a custom one.
- Mock: a phone or tablet comes up in a mock of its body, with the island or punch hole and the buttons. Every iPhone and Pixel wears its maker's own bezel.
- Browser: a phone shows the page in its browser, Safari's bars on an iPhone and Chrome's toolbar on a Pixel. The bars minimize as the page scrolls, or stay one way.
- Touch pointer: on a touch device, `(pointer: coarse)` matches and the mouse acts as a finger. A press scrolls and flings, and a tap clicks.
- Posture: the iPhone Duo folds, and `unfold` and `fold` open and shut it.

A device sets the user agent to its own browser too. The frame reloads when a pick changes the user agent, the touch screen or the ratio.

With the extension, a device with no mock or browser drawn becomes the tab's own viewport, with no reload. Turn on "real phone mode" in the panel's settings to send the device's user agent with the frame's page loads, so sites serve their mobile site.

## Limits

The page runs in your own browser, in a frame, with the phone drawn around it:

- The touch pointer is made in the page. CSS `:hover` still follows the mouse, and there is one finger only, with no pinch.
- The phone's browser bars do not open their menus, and there is no keyboard.
- `100svh`, `100lvh`, `100vh` and `clientHeight` follow the frame's height.
- The frame loads the page a second time, so in-memory state is not shared between the two.
- Device pixel ratio works in Chromium only.

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.knobs.setState({ device: 'iphone-17', orientation: 'landscape' });
await window.knobs.ready();
```

To leave the device, call `reset()` or set `{ device: 'none', width: 'full', height: 'full', dpr: 'system' }`. `device: 'none'` alone keeps the device's size, so the frame stays up. See [agents](/docs/agents).

Next: check your breakpoints with [window sizes](/use/window-sizes).
