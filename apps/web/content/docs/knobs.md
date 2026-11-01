---
title: knobs
meta_title: Every devknobs knob: dark mode, locale, time zone and more
description: Every knob devknobs has and what it does to the page: color scheme, reduced motion, text size, locale, time zone, clock, geolocation, user agent and viewport.
order: 3
updated: 2026-10-29
---

every knob and what it does. search finds them by name or value, see [the panel](/docs/panel).

## look and motion

| knob                 | what it does                                   |
| -------------------- | ---------------------------------------------- |
| color scheme         | light or dark, in your css and in `matchMedia` |
| reduced motion       | `prefers-reduced-motion: reduce`               |
| animation speed      | runs animations at 0.25 or 0.1, or pauses them |
| contrast             | `prefers-contrast: more`                       |
| reduced transparency | `prefers-reduced-transparency: reduce`         |
| text size            | the browser's default font size                |
| text spacing         | the wcag 1.4.12 text spacing values            |
| vision               | a color blindness filter or a blur             |
| replay animations    | `⇧R` runs every animation again                |

## locale, place and time

| knob        | what it does                                       |
| ----------- | -------------------------------------------------- |
| locale      | any language tag and a direction, `Intl` included  |
| pseudo      | turns the page's text into `[Ŝéţţîñĝš ···]`        |
| geolocation | a city, your own coordinates, or a route           |
| geo error   | denied, unavailable or timeout                     |
| time zone   | any iana zone, or the geo city's zone              |
| clock       | jump ahead, pick a date, freeze it, or speed it up |

## browser and debug

| knob                  | what it does                                                        |
| --------------------- | ------------------------------------------------------------------- |
| online                | the page reads offline, requests still succeed                      |
| connection, save data | `navigator.connection` reads 2g to 4g, chromium only, no throttling |
| user agent            | iphone safari, googlebot, or your own string                        |
| requests, storage     | `⇧N` and `⇧S` show what the page sent and stored                    |
| overflow              | finds the boxes that scroll the page sideways                       |
| outlines              | outlines every element                                              |
| grab color            | the color of [grab](/docs/grab)'s boxes                             |

## viewport and device

these put the page in a frame, a real viewport, so media queries and `vw` follow. see [devices](/docs/devices).

| knob                   | what it does                               |
| ---------------------- | ------------------------------------------ |
| viewport width, height | a size in px                               |
| device, orientation    | a phone, tablet or laptop, turned          |
| posture                | folds a foldable                           |
| mock, browser, bars    | the phone's body and its browser           |
| edge to edge           | the page under Safari's top row, sideways  |
| touch pointer          | the mouse acts as a finger                 |
| device pixel ratio     | 1, 2 or 3                                  |
| frame, zoom, mat       | the frame alone, its zoom, the mat's color |

## the clock and your server

turn on "send to server" and `fetch` and `XMLHttpRequest` calls to the page's own origin carry the clock's time. the first page load does not. read it on your server:

```ts
const now = (request: Request) => {
  const header =
    process.env.NODE_ENV === 'development' ? request.headers.get('x-devknobs-now') : null;
  return header ? new Date(header) : new Date();
};
```

never honor the header in production. any client can send it.
