---
title: privacy
meta_title: knobs privacy: what the panel, extension and site collect
description: What the devknobs npm package, the Chrome extension and the knobs.dev site keep and send: no telemetry in the panel, and page views and clicks on the site only.
order: 10
updated: 2026-10-25
---

## the npm package

devknobs has no analytics and no telemetry, and it sends nothing about you or your page anywhere.

the few requests it makes for itself, such as device images and source maps for grab, never leave the page's origin or the host devknobs' script came from.

- the requests view keeps the last 300 requests in memory. nothing is stored or sent.
- what you copy goes to your clipboard and nowhere else.
- the clock's "send to server" switch, off at first, adds an `x-devknobs-now` header to calls to the page's own origin only.
- it keeps its settings in your browser, for the page's origin: the knobs under `devknobs` and a few `devknobs:` keys (scroll position, locale and reload notes, the last frame's look) in `sessionStorage`, and `devknobs:` keys such as the panel's settings, place, shortcuts, colors and storage presets in `localStorage`.
- the locale knob writes the language into the stores i18n libraries read: the paraglide cookie always, the paraglide and i18next `localStorage` keys and the i18next `sessionStorage` key and cookie only when the page already has them, and `NEXT_LOCALE` on next.js pages or when that cookie exists. it gives each its old value back when you set it to system, within the same tab session only.

## the chrome extension

the extension's own code makes no network requests. its device images ship inside it. the panel is devknobs, so it loads what the npm package loads, from the page.

- session storage, cleared when Chrome closes: each tab's knobs, which host has devknobs' frame open in each tab, and each tab's user agent with its page's host.
- local storage: the real or in-page switch.
- the panel it puts on a page keeps the same `devknobs` and `devknobs:` keys in that page's own storage as the npm package does.

Chrome's debugger attaches only when you ask for something that needs it, and Chrome shows its bar while it is on. while on, it notes the last few loads of the tab's frames in memory, to say why a frame was refused: the address, redirects, the status, the headers that bear on framing, the `sec-fetch` values sent, why a load failed, and Chrome's console lines about it. to read the `sec-fetch` values it keeps the headers of up to 50 recent requests in memory, cookies and authorization included. those headers are never stored or sent. when a frame is refused, the extension hands the record of that load to the panel in the page, which shows it under the notice, and "copy details" puts it on your clipboard.

servers see another user agent only while you set the ua knob or pick a device. response headers change only while devknobs' frame is open. see [chrome extension](/docs/extension) for the permissions.

## knobs.dev

only knobs.dev counts visits, with a self-hosted [OpenPanel](https://openpanel.dev) through the site's own `/api/op`. it records page views, link and button clicks, and the tour's progress. the proxy hands your IP address and user agent to the analytics server, and no cookies.

the server logs each request's method, path, status and duration, the Cloudflare request id, and the country, network and data center Cloudflare reports. it logs no IP address, no user agent and no cookies.

four of the demo's request buttons leave the site on purpose, and only when pressed: two ask `https://example.com/`, and two ask `https://demo.invalid/`, which never resolves. the demo panel is devknobs itself, so it keeps the same `devknobs` keys in your browser as above.

the site keeps the `PARAGLIDE_LOCALE` cookie for 400 days, `knobs:tour` in `localStorage`, and the storage demo's data only when you press its buttons.

questions go to the [GitHub issues](https://github.com/vinenastudio/knobs/issues).
