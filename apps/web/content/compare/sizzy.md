---
title: knobs vs Sizzy
meta_title: knobs vs Sizzy: price, platform and features side by side
description: knobs and Sizzy side by side: price, platform and each feature, taken from the vendors' own pages. Facts only, checked on 2026-11-13.
order: 3
updated: 2026-11-13
terms: sizzy alternative, sizzy vs, sizzy vs knobs
---

Facts checked on 2026-11-13, from each product's own pages. The sources are at the end.

In the tables, "not documented" means the vendor's pages we read do not describe it. It does not mean the feature is missing.

## The two products

knobs is a free, open source panel for web developers and designers, under the MIT license. It comes as an npm package that runs inside your own app, in any browser, and as a Chrome extension for any site in Chrome and Edge. See [start](/docs/start) and [Chrome extension](/docs/extension).

Sizzy is a desktop app for macOS (Apple silicon and Intel), Windows and Linux. It costs $15 a month, $144 a year or $499 for a lifetime license. Its pricing says: "There is no free tier and no trial".

|                | knobs                                                     | Sizzy                                       |
| -------------- | --------------------------------------------------------- | ------------------------------------------- |
| Price          | free                                                      | $15 a month, $144 a year, $499 lifetime     |
| Platform       | npm package in any browser; extension for Chrome and Edge | desktop app: macOS, Windows, Linux          |
| Latest release | Chrome extension 0.7.0, November 12, 2026                 | not documented; the homepage names Sizzy 74 |

## Features

| Feature                    | knobs                                                         | Sizzy                                                                                                        |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Device presets and frames  | iPhone, Pixel, iPad and laptop, with maker bezels             | yes: "Device frames, minimal headers, custom devices"                                                        |
| Several sizes at once      | no: one viewport per page                                     | yes: "Real device sizes side by side"                                                                        |
| Dark mode                  | yes                                                           | yes                                                                                                          |
| Reduced motion             | yes, plus animation speed and replay                          | not documented                                                                                               |
| Contrast and forced colors | `prefers-contrast` and reduced transparency; no forced colors | not documented                                                                                               |
| Color blindness simulation | protanopia, deuteranopia, tritanopia, achromatopsia, blur     | not documented                                                                                               |
| Text size                  | browser default font size, text spacing                       | zoom per device                                                                                              |
| Locale                     | any language tag, `Intl` included                             | yes                                                                                                          |
| Right to left              | yes                                                           | not documented                                                                                               |
| Pseudolocalization         | yes                                                           | not documented                                                                                               |
| Time zone                  | any IANA zone                                                 | not documented                                                                                               |
| Fake date and clock        | jump ahead, pick a date, freeze, speed up                     | not documented                                                                                               |
| Geolocation                | a city, your own coordinates, a route, errors                 | not documented                                                                                               |
| User agent                 | yes                                                           | yes: "real viewports and user agents"                                                                        |
| Network throttling         | no: offline only, and `navigator.connection` values           | yes                                                                                                          |
| Element copy for agents    | html, components and source files                             | in-app agents get screenshots from your devices                                                              |
| Agent access               | a window API for Playwright or the Chrome DevTools MCP        | runs Claude Code or Codex CLI inside the app, with MCP servers and skills; no external MCP server documented |
| Runs inside your own page  | yes, `npm i -D @vinena/knobs`                                 | no, it is a desktop browser                                                                                  |

## Where knobs is limited

- knobs shows one viewport per page. Sizzy shows device sizes side by side.
- knobs has no network throttling. It can make the page read offline (with the extension, requests really fail) and set the values `navigator.connection` reads. Sizzy lists network throttling.
- `forced-colors` cannot be set from inside a page. See [limits](/docs/limits).

## When to use which

These follow from the facts above:

- Sizzy is a paid desktop app that shows many devices side by side and runs coding agents inside the app.
- knobs is free and runs inside your page as a dev dependency, or on any site through the Chrome extension. A coding agent drives it through the browser tool it already uses. See [agents](/docs/agents).

Each knob has its own page: [mobile simulator](/use/mobile-simulator), [window sizes](/use/window-sizes), [color blindness simulator](/use/color-blindness-simulator), [time zone](/use/time-zone) and [fake geolocation](/use/fake-geolocation).

## Sources

- knobs: [every knob](/docs/knobs), [devices](/docs/devices), [agents](/docs/agents), [limits](/docs/limits), [Chrome Web Store listing](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj)
- Sizzy: [site](https://sizzy.co/), [pricing](https://sizzy.co/pricing), [llms-full.txt](https://sizzy.co/llms-full.txt)
