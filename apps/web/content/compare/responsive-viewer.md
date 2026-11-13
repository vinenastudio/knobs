---
title: knobs vs Responsive Viewer
meta_title: knobs vs Responsive Viewer: two Chrome extensions compared
description: knobs and Responsive Viewer side by side: price, platform, license and each feature, from their own pages. Facts only, checked on 2026-11-13.
order: 4
updated: 2026-11-13
terms: responsive viewer alternative, responsive viewer vs, responsive viewer chrome extension
---

Facts checked on 2026-11-13, from each product's own pages. The sources are at the end. We read Responsive Viewer's site and store page; we did not install it. Several other Chrome Web Store extensions use the same name. This page is about the one from responsiveviewer.org.

In the tables, "not documented" means the project's pages we read do not describe it. It does not mean the feature is missing.

## The two products

knobs is a free, open source panel for web developers and designers, under the MIT license. It comes as an npm package that runs inside your own app, in any browser, and as a Chrome extension for any site in Chrome and Edge. See [start](/docs/start) and [Chrome extension](/docs/extension).

Responsive Viewer is a Chrome extension, open source under the MIT license. It is free to add. A "Professional" plan, $4.99 monthly or $3.99 yearly, removes ads and adds all mockups, all screens and annotations.

|                | knobs                                                     | Responsive Viewer                                     |
| -------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Price          | free                                                      | free; Professional plan $4.99 monthly or $3.99 yearly |
| License        | MIT                                                       | MIT                                                   |
| Platform       | npm package in any browser; extension for Chrome and Edge | Chrome extension                                      |
| Latest release | Chrome extension 0.7.0, November 12, 2026                 | store version 1.1.25, August 12, 2026                 |

## Features

| Feature                    | knobs                                                         | Responsive Viewer                                            |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Device presets and frames  | iPhone, Pixel, iPad and laptop, with maker bezels             | yes: "real screen mockups"                                   |
| Several sizes at once      | no: one viewport per page                                     | yes: multi-screen preview, with synced scroll and navigation |
| Dark mode                  | yes                                                           | not documented                                               |
| Reduced motion             | yes, plus animation speed and replay                          | not documented                                               |
| Contrast and forced colors | `prefers-contrast` and reduced transparency; no forced colors | not documented                                               |
| Color blindness simulation | protanopia, deuteranopia, tritanopia, achromatopsia, blur     | not documented                                               |
| Text size                  | browser default font size, text spacing                       | not documented                                               |
| Locale and right to left   | any language tag and direction, `Intl` included               | not documented                                               |
| Pseudolocalization         | yes                                                           | not documented                                               |
| Time zone and clock        | any IANA zone; jump ahead, pick a date, freeze, speed up      | not documented                                               |
| Geolocation                | a city, your own coordinates, a route, errors                 | not documented                                               |
| User agent                 | yes                                                           | not documented                                               |
| Network throttling         | no: offline only, and `navigator.connection` values           | not documented                                               |
| Element copy for agents    | html, components and source files                             | not documented                                               |
| Agent access               | a window API for Playwright or the Chrome DevTools MCP        | not documented                                               |
| Runs inside your own page  | yes, `npm i -D @vinena/knobs`                                 | no, it is an extension                                       |

## Where knobs is limited

- knobs shows one viewport per page. Responsive Viewer shows several screens at once and keeps their scroll and navigation in sync.
- knobs has no network throttling. It can make the page read offline (with the extension, requests really fail) and set the values `navigator.connection` reads.
- `forced-colors` cannot be set from inside a page. See [limits](/docs/limits).

## When to use which

These follow from the facts above:

- Both are Chrome extensions. To see one page on several screens at once, Responsive Viewer does that and knobs does not.
- knobs is one viewport with knobs for look, locale, time, place and the user agent. It also comes as an npm package for your own app in any browser.

Each knob has its own page: [mobile simulator](/use/mobile-simulator), [window sizes](/use/window-sizes), [dark mode](/use/dark-mode), [user agent switcher](/use/user-agent-switcher) and [time zone](/use/time-zone).

## Sources

- knobs: [every knob](/docs/knobs), [devices](/docs/devices), [limits](/docs/limits), [Chrome Web Store listing](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj)
- Responsive Viewer: [site](https://responsiveviewer.org/), [Chrome Web Store listing](https://chromewebstore.google.com/detail/responsive-viewer/inmopeiepgfljkpkidclfgbgbmfcennb), [code](https://github.com/skmail/responsive-viewer)
