---
title: Reduced motion test
meta_title: Reduced motion test: emulate prefers-reduced-motion
description: Test reduced motion on any page with the knobs reduced motion knob. It sets prefers-reduced-motion for your CSS and matchMedia, and can slow animations.
order: 4
updated: 2026-11-13
terms: prefers-reduced-motion, test reduced motion
---

The reduced motion knob makes the page read `prefers-reduced-motion: reduce`, in your CSS and in `matchMedia`. It rewrites every `prefers-reduced-motion` media rule in the page's own stylesheets, and patches `matchMedia` so JavaScript reads the same value.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for "reduced motion". The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The knob takes two values:

- `reduce`: the page reads `prefers-reduced-motion: reduce`.
- `system`: the page reads your real setting.

New stylesheets are picked up as they arrive, so the knob keeps working through hot reloads and lazily loaded CSS. A list from `matchMedia` gets a real `change` event when the knob moves its verdict.

With the extension, Chrome sets reduced motion for real. While it is set, Chrome shows its "started debugging this browser" bar. To avoid the bar, turn off "real browser settings" in the panel's settings, and the knob works in the page as with the npm package.

Two knobs next to it help with motion too:

- Animation speed runs every animation at 0.25 or 0.1, or pauses it. CSS animations and transitions are included, in the document and every open shadow root. When `window.gsap` exists, its global timeline follows too.
- Replay animations, `⇧R`, runs every animation again.

Each one is listed in [every knob](/docs/knobs).

## Limits

knobs works from inside the page, so some things stay out of its reach:

- Only same-origin stylesheets can be rewritten. A cross-origin `<link>` keeps its real media behavior.
- A `MediaQueryList` made before knobs mounted gets no change event. Reload, or load the early script first, see [start](/docs/start).
- The speed knob slows what the Web Animations API sees. A `requestAnimationFrame` loop keeps its own pace, and only the WAAPI-backed animations of Motion slow down.
- Scroll-driven animations keep following the scroll.

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.devknobs.setState({ motion: 'reduce' });
await window.devknobs.ready();
```

To pause every animation instead, set `{ speed: 0 }`. `ready()` resolves with the state once the page has caught up with the knobs. `setState()` throws a `TypeError` at a value the state does not take, and then changes nothing. `reset()` sets the knobs back. See [agents](/docs/agents).

Next: run a [dark mode test](/use/dark-mode) on the same page.
