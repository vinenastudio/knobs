---
title: Dark mode test
meta_title: Dark mode test: emulate prefers-color-scheme in the page
description: Test dark mode on any page with the knobs color scheme knob. It sets prefers-color-scheme for your CSS, matchMedia and light-dark() in the page.
order: 5
updated: 2026-11-13
terms: prefers-color-scheme, dark mode test
---

The color scheme knob puts a page in light or dark mode, in your CSS and in `matchMedia`. It rewrites every `prefers-color-scheme` media rule in the page's own stylesheets, and patches `matchMedia` so JavaScript reads the same value. It also sets `color-scheme` on `<html>`, so `light-dark()` flips too.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for "color scheme". The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The knob takes three values:

- `light`: the page reads `prefers-color-scheme: light`.
- `dark`: the page reads `prefers-color-scheme: dark`.
- `system`: the page reads your real setting.

New stylesheets are picked up as they arrive, so the knob keeps working through hot reloads and lazily loaded CSS. A list from `matchMedia` gets a real `change` event when the knob moves its verdict, so `onchange` and `addListener` work.

When the page is in a frame (the width, height and device knobs), the browser does the work: the frame's `color-scheme` becomes the framed page's `prefers-color-scheme`, in Chrome 129 and later and Firefox 105 and later. Then cross-origin stylesheets and shadow roots follow too. Safari gets the rewrite.

With the extension, Chrome sets the color scheme for real. While it is set, Chrome shows its "started debugging this browser" bar. To avoid the bar, turn off "real browser settings" in the panel's settings, and the knob works in the page as with the npm package.

Other knobs next to it: reduced motion, contrast and reduced transparency. Each one is listed in [every knob](/docs/knobs).

## Limits

knobs works from inside the page, so some things stay out of its reach:

- Only same-origin stylesheets can be rewritten. A cross-origin `<link>` keeps its real media behavior.
- A `MediaQueryList` made before knobs mounted gets no change event. Reload, or load the early script first, see [start](/docs/start).
- `forced-colors`, high contrast and print media need devtools.

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.devknobs.setState({ scheme: 'dark' });
await window.devknobs.ready();
```

`ready()` resolves with the state once the page has caught up with the knobs. `setState()` throws a `TypeError` at a value the state does not take, and then changes nothing. `reset()` sets the knobs back. See [agents](/docs/agents).

Next: test the page's text with [pseudolocalization](/use/pseudolocalization).
