---
title: knobs vs Responsively App
meta_title: knobs vs Responsively App: platform and features compared
description: knobs and Responsively App side by side: price, platform, license and each feature, from their own pages and code. Facts only, checked on 2026-11-13.
order: 2
updated: 2026-11-13
terms: responsively app alternative, responsively app vs, responsively alternative
---

Facts checked on 2026-11-13, from each product's own pages and code. The sources are at the end.

In the tables, "not documented" means the project's pages we read do not describe it. It does not mean the feature is missing. "Not found in source" means a search of the main branch of Responsively App's code on 2026-11-13 did not find it. That branch also holds the unreleased v2 beta code. It is our search, not a statement by the project.

## The two products

knobs is a free, open source panel for web developers and designers, under the MIT license. It comes as an npm package that runs inside your own app, in any browser, and as a Chrome extension for any site in Chrome and Edge. See [start](/docs/start) and [Chrome extension](/docs/extension).

Responsively App is a free, open source desktop app for Mac, Windows and Linux, under the AGPL-3.0 license. Its "Responsively Helper" browser extensions for Chrome, Firefox and Edge send links to the app.

|                | knobs                                                     | Responsively App                                           |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Price          | free                                                      | free                                                       |
| License        | MIT                                                       | AGPL-3.0                                                   |
| Platform       | npm package in any browser; extension for Chrome and Edge | desktop app: Mac, Windows, Linux                           |
| Latest release | Chrome extension 0.7.0, November 12, 2026                 | v1.18.0, 2026-02-17; v2.0.0-beta.0 pre-release, 2026-09-20 |

## Features

| Feature                    | knobs                                                         | Responsively App                                                |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Device presets             | iPhone, Pixel, iPad and laptop, with maker bezels             | "30+ built-in device profiles"; frames in v2 beta               |
| Several sizes at once      | no: one viewport per page                                     | yes: "All Devices at once"                                      |
| Dark mode                  | yes                                                           | yes, a color scheme toggle                                      |
| Reduced motion             | yes, plus animation speed and replay                          | not found in source                                             |
| Contrast and forced colors | `prefers-contrast` and reduced transparency; no forced colors | not found in source                                             |
| Color blindness simulation | protanopia, deuteranopia, tritanopia, achromatopsia, blur     | deuteranopia, protanopia and more                               |
| Text size                  | browser default font size, text spacing                       | not found in source                                             |
| Locale                     | any language tag, `Intl` included                             | a custom Accept-Language header                                 |
| Right to left              | yes                                                           | not found in source                                             |
| Pseudolocalization         | yes                                                           | not found in source                                             |
| Time zone                  | any IANA zone                                                 | not found in source                                             |
| Fake date and clock        | jump ahead, pick a date, freeze, speed up                     | not found in source                                             |
| Geolocation                | a city, your own coordinates, a route, errors                 | not found in source                                             |
| User agent                 | yes                                                           | yes, per device                                                 |
| Network throttling         | no: offline only, and `navigator.connection` values           | not found in source                                             |
| Element copy for agents    | html, components and source files                             | not documented; its MCP server gives screenshots                |
| Agent access               | a window API for Playwright or the Chrome DevTools MCP        | built-in MCP server, `npx -y @responsively/mcp`, in the v2 beta |
| Runs inside your own page  | yes, `npm i -D @vinena/knobs`                                 | no, it is a desktop browser                                     |

## Where knobs is limited

- knobs shows one viewport per page. Responsively App shows all devices at once.
- knobs has no network throttling. It can make the page read offline (with the extension, requests really fail) and set the values `navigator.connection` reads.
- `forced-colors` cannot be set from inside a page. See [limits](/docs/limits).

## When to use which

These follow from the facts above:

- Responsively App is a desktop app that shows one page on many devices at once.
- knobs runs inside your page as a dev dependency, or on any site through the Chrome extension, and has knobs for time zone, clock, geolocation and reduced motion.

Each knob has its own page: [mobile simulator](/use/mobile-simulator), [reduced motion](/use/reduced-motion), [time zone](/use/time-zone), [fake geolocation](/use/fake-geolocation), [right to left](/use/rtl) and [pseudolocalization](/use/pseudolocalization).

## Sources

- knobs: [every knob](/docs/knobs), [devices](/docs/devices), [agents](/docs/agents), [limits](/docs/limits), [Chrome Web Store listing](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj)
- Responsively App: [site](https://responsively.app/), [README and code](https://github.com/responsively-org/responsively-app), [releases](https://github.com/responsively-org/responsively-app/releases)
