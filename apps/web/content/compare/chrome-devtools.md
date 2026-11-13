---
title: knobs vs Chrome DevTools
meta_title: knobs vs Chrome DevTools device mode and emulation compared
description: knobs and Chrome DevTools side by side: device mode, rendering emulation, sensors and agent access, from their own docs. Facts only, checked on 2026-11-13.
order: 5
updated: 2026-11-13
terms: chrome devtools device mode, chrome devtools emulation, chrome devtools alternative
---

Facts checked on 2026-11-13, from each product's own pages. The sources are at the end.

In the tables, "not documented" means the Chrome DevTools pages we read do not describe it. It does not mean the feature is missing.

## The two products

knobs is a free, open source panel for web developers and designers, under the MIT license. It comes as an npm package that runs inside your own app, in any browser, and as a Chrome extension for any site in Chrome and Edge. See [start](/docs/start) and [Chrome extension](/docs/extension).

Chrome DevTools is free and part of Chrome, on every desktop system Chrome runs on. Its frontend is open source under the BSD-3-Clause license.

|                | knobs                                                     | Chrome DevTools                                            |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Price          | free                                                      | free, part of Chrome                                       |
| License        | MIT                                                       | frontend under BSD-3-Clause                                |
| Platform       | npm package in any browser; extension for Chrome and Edge | Chrome on desktop                                          |
| Latest release | Chrome extension 0.7.0, November 12, 2026                 | ships with Chrome; Stable 158.0.8127.37 on Mac, 2026-11-12 |

## Features

| Feature                    | knobs                                                         | Chrome DevTools                                                                                                                  |
| -------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Device presets and frames  | iPhone, Pixel, iPad and laptop, with maker bezels             | presets in the Dimensions list; "Show device frame", art missing for some devices                                                |
| Several sizes at once      | no: one viewport per page                                     | one resizable viewport                                                                                                           |
| Dark mode                  | yes                                                           | yes, Rendering tab                                                                                                               |
| Reduced motion             | yes, plus animation speed and replay                          | yes                                                                                                                              |
| Contrast and forced colors | `prefers-contrast` and reduced transparency; no forced colors | `forced-colors`, `prefers-contrast`, `prefers-reduced-transparency`                                                              |
| Vision simulation          | protanopia, deuteranopia, tritanopia, achromatopsia, blur     | blurred vision, reduced contrast, protanopia, deuteranopia, tritanopia, achromatopsia                                            |
| Text size                  | browser default font size, text spacing                       | not documented                                                                                                                   |
| Locale                     | any language tag, `Intl` included                             | a Locale field in a custom location                                                                                              |
| Right to left              | yes                                                           | not documented                                                                                                                   |
| Pseudolocalization         | yes                                                           | not documented                                                                                                                   |
| Time zone                  | any IANA zone                                                 | a Timezone ID in a custom location                                                                                               |
| Fake date and clock        | jump ahead, pick a date, freeze, speed up                     | not documented                                                                                                                   |
| Geolocation                | a city, your own coordinates, a route, errors                 | yes, Sensors                                                                                                                     |
| User agent                 | yes                                                           | yes, Network conditions                                                                                                          |
| Network throttling         | no: offline only, and `navigator.connection` values           | Fast 3G, Slow 3G, offline, custom profiles                                                                                       |
| Element copy for agents    | html, components and source files                             | AI assistance chats about a selected element; needs sign-in, age 18 or over, a supported location, off by default                |
| Agent access               | a window API for Playwright or the Chrome DevTools MCP        | chrome-devtools-mcp (Apache-2.0), whose `emulate` tool sets color scheme, forced colors, geolocation, network conditions and CPU |
| Runs inside your own page  | yes, `npm i -D @vinena/knobs`                                 | no, it is part of the browser                                                                                                    |

## Where knobs is limited

- knobs has no network throttling and no `forced-colors`. Chrome DevTools has both.
- The knobs docs list what only the browser's devtools can do: device pixel ratio outside Chromium, `forced-colors`, high contrast and print media, trusted touch events and pinch, network throttling and a real offline, and the time zone of workers. See [limits](/docs/limits).

## How they work together

These follow from the facts above:

- The knobs extension hands some knobs to Chrome itself: text size, offline, color scheme, contrast, reduced motion, reduced transparency, the viewport and the user agent. See [Chrome extension](/docs/extension).
- A coding agent can drive knobs through the Chrome DevTools MCP's `evaluate_script`. See [agents](/docs/agents).

Each knob has its own page: [mobile simulator](/use/mobile-simulator), [dark mode](/use/dark-mode), [reduced motion](/use/reduced-motion), [time zone](/use/time-zone), [fake geolocation](/use/fake-geolocation) and [user agent switcher](/use/user-agent-switcher).

## Sources

- knobs: [every knob](/docs/knobs), [Chrome extension](/docs/extension), [agents](/docs/agents), [limits](/docs/limits), [Chrome Web Store listing](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj)
- Chrome DevTools: [device mode](https://developer.chrome.com/docs/devtools/device-mode), [emulate CSS media features](https://developer.chrome.com/docs/devtools/rendering/emulate-css), [rendering effects](https://developer.chrome.com/docs/devtools/rendering/apply-effects), [locations](https://developer.chrome.com/docs/devtools/settings/locations), [sensors](https://developer.chrome.com/docs/devtools/sensors), [user agent](https://developer.chrome.com/docs/devtools/device-mode/override-user-agent), [AI assistance](https://developer.chrome.com/docs/devtools/ai-assistance), [frontend code](https://github.com/ChromeDevTools/devtools-frontend), [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp), [Chrome releases](https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Mac&num=1)
