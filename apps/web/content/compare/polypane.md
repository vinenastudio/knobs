---
title: knobs vs Polypane
meta_title: knobs vs Polypane: price, platform and features compared
description: knobs and Polypane side by side: price, platform and each feature, taken from the vendors' own pages. Facts only, checked on 2026-11-13.
order: 1
updated: 2026-11-13
terms: polypane alternative, polypane vs, polypane vs knobs
---

Facts checked on 2026-11-13, from each product's own pages. The sources are at the end.

In the tables, "not documented" means the vendor's pages we read do not describe it. It does not mean the feature is missing.

## The two products

knobs is a free, open source panel for web developers and designers, under the MIT license. It comes as an npm package that runs inside your own app, in any browser, and as a Chrome extension for any site in Chrome and Edge. See [start](/docs/start) and [Chrome extension](/docs/extension).

Polypane is a desktop app for Windows, macOS and Linux. It has a 14 day free trial with no credit card, then Individual, Business (2 to 20 seats) and Enterprise plans. There is no permanent free plan. Students get it free through the GitHub Student Developer Pack. The structured data on its pricing page lists offers from USD 9 to USD 320.

|                | knobs                                                     | Polypane                           |
| -------------- | --------------------------------------------------------- | ---------------------------------- |
| Price          | free                                                      | 14 day trial, then paid plans      |
| Platform       | npm package in any browser; extension for Chrome and Edge | desktop app: Windows, macOS, Linux |
| Latest release | Chrome extension 0.7.0, November 12, 2026                 | v31.0.0, September 29, 2026        |

## Features

| Feature                    | knobs                                                     | Polypane                                           |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Device presets             | iPhone, Pixel, iPad and laptop, with maker bezels         | yes; device frames not documented                  |
| Several sizes at once      | no: one viewport per page                                 | yes: "every breakpoint visible and synchronized"   |
| Dark mode                  | yes                                                       | yes                                                |
| Reduced motion             | yes, plus animation speed and replay                      | yes                                                |
| Contrast                   | `prefers-contrast` and reduced transparency               | `prefers-contrast`                                 |
| Forced colors              | no                                                        | yes                                                |
| Color blindness simulation | protanopia, deuteranopia, tritanopia, achromatopsia, blur | 9 color blindness types, plus visual impairments   |
| Text size                  | browser default font size, text spacing                   | default font size, text scale                      |
| Locale                     | any language tag, `Intl` included                         | browser locale (request and `Intl`), page language |
| Right to left              | yes                                                       | yes                                                |
| Pseudolocalization         | yes                                                       | not documented                                     |
| Time zone                  | any IANA zone                                             | not documented                                     |
| Fake date and clock        | jump ahead, pick a date, freeze, speed up                 | not documented                                     |
| Geolocation                | a city, your own coordinates, a route, errors             | not documented                                     |
| User agent                 | yes                                                       | yes                                                |
| Network throttling         | no: offline only, and `navigator.connection` values       | Fast 4G, Slow 4G, 3G, offline                      |
| Element copy for agents    | html, components and source files                         | not documented                                     |
| Agent access               | a window API for Playwright or the Chrome DevTools MCP    | MCP through chrome-devtools-mcp on port 5858       |
| Runs inside your own page  | yes, `npm i -D @vinena/knobs`                             | no, it is a desktop browser                        |

## Where knobs is limited

- knobs shows one viewport per page. It has no view of several sizes side by side.
- knobs has no network throttling. It can make the page read offline (with the extension, requests really fail) and set the values `navigator.connection` reads, without slowing anything down.
- `forced-colors` and high contrast mode cannot be set from inside a page. The knobs docs send you to the browser's devtools for them. See [limits](/docs/limits).

## When to use which

These follow from the facts above:

- Polypane is a desktop app that shows many synchronized panes. To see several breakpoints at once, Polypane does that and knobs does not.
- knobs runs inside your page as a dev dependency, or on any site through the Chrome extension, so it stays in the browser you test in.

Each knob has its own page: [mobile simulator](/use/mobile-simulator), [window sizes](/use/window-sizes), [dark mode](/use/dark-mode), [time zone](/use/time-zone), [fake geolocation](/use/fake-geolocation) and [pseudolocalization](/use/pseudolocalization). Coding agents: see [agents](/docs/agents).

## Sources

- knobs: [every knob](/docs/knobs), [devices](/docs/devices), [agents](/docs/agents), [limits](/docs/limits), [Chrome Web Store listing](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj)
- Polypane: [pricing](https://polypane.app/pricing/), [changelog](https://polypane.app/docs/changelog/), [features](https://polypane.app/features/), [emulation](https://polypane.app/docs/emulation/), [device presets](https://polypane.app/docs/device-presets/), [simulators](https://polypane.app/docs/simulators/), [MCP server](https://polypane.app/docs/mcp-server/)
