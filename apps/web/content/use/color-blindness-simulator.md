---
title: Color blindness simulator
meta_title: Color blindness simulator: emulate vision deficiencies
description: A color blindness simulator for your web page. The knobs vision knob draws protanopia, deuteranopia, tritanopia, achromatopsia or a blur over it.
order: 1
updated: 2026-11-13
terms: color blindness simulator, emulate vision deficiencies
---

The vision knob shows a page as people with a color vision deficiency see it. It draws an SVG color matrix over the page, from Machado et al. 2009, the same model Chromium DevTools uses. A blur is there too. The filter sits on the frame the page runs in, so fixed elements keep their place and the panel stays readable.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for "vision". The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The knob takes six values:

- `protanopia`, `deuteranopia`, `tritanopia` and `achromatopsia`: a color blindness filter, each from the color matrix.
- `blur`: a 2px blur.
- `none`: the page as it is.

Any value other than `none` brings up the frame, a same-origin iframe and a real viewport. It is the same frame the width, height and device knobs use.

The knob works in the page with the npm package and with the extension alike. It is not one of the knobs the extension hands to Chrome.

Other knobs next to it: contrast, text size and text spacing. Each one is listed in [every knob](/docs/knobs).

## Limits

- These six filters are all the knob has. It has no levels for a partial deficiency.
- The frame loads the page a second time, so in-memory state, such as a half-filled form, is not shared between the two.

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.devknobs.setState({ vision: 'deuteranopia' });
await window.devknobs.ready();
```

`ready()` resolves with the state once the page has caught up with the knobs, the frame included. Then take a screenshot. `setState()` throws a `TypeError` at a value the state does not take, and then changes nothing. `reset()` sets the knobs back. See [agents](/docs/agents).

Next: change what the page reads with a [user agent switcher](/use/user-agent-switcher).
