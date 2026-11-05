---
title: privacy
description: What the devknobs npm package, the Chrome extension and the knobs.dev site keep, and what they send anywhere.
order: 10
---

## the npm package

devknobs runs in your page, in development, where you mount it. it has no analytics and no telemetry, and it sends nothing about you or your page anywhere.

the only requests it makes for itself:

- the device images (bezels and the iPhone Duo's fold frames) load from beside devknobs' own script: your dev server, or unpkg when you use the script tag from there.
- grab reads the page's own bundles and source maps, from the page's own origin only, to find where a component lives.
- the picture of the page that the fold and the frame draw loads the fonts the page itself uses.
- the width knob, a device and a pinned panel load your page a second time, in a frame.
- the ESM build loads its later parts (grab, the frame's code, the storage and styles views) from beside its own script, when first used.
- the locale knob reloads the page once it writes the stores below, so the page starts in the new language.

none of these leave the page's origin or the host devknobs' script came from.

the [requests view](/docs/requests-and-storage#requests) only watches what the page asks for. it keeps the last 300 requests in memory: nothing is stored, nothing is sent, and a reload starts the log again. the [storage view](/docs/requests-and-storage#storage) reads through the page's own apis. what you copy (a grab, a request, a stored value) goes to your clipboard and nowhere else.

the clock's "send to server" switch, off at first, adds an `x-devknobs-now` header to `fetch` and `XMLHttpRequest` calls to the page's own origin only, never to another one. see [the clock and your server](/docs/knobs#the-clock-and-your-server).

what it keeps, all in your browser, for the page's origin:

- `sessionStorage`: the knobs, under `devknobs` (pass `persist: false` to keep them in memory), the last frame's look for the early script, the scroll position and page path across a frame reload (`devknobs:scroll`), the old values of the locale stores it wrote (`devknobs:locale-stores`), and when it last asked for a reload (`devknobs:locale-reload`, `devknobs:fresh-reload`).
- `localStorage`: keys that start with `devknobs:`, such as the panel's width and settings (`devknobs:prefs`), its place and pin (`devknobs:place`), your shortcuts (`devknobs:keys`), your own colors (`devknobs:colors`) and storage presets (`devknobs:storage-presets`).
- `localStorage`, only while the Elements view's `keep edits after reload` switch is on for a page: that page's edits, under `devknobs:edits:` and its path, as json: each edit's kind, selectors and rule, and its values before and after, which are the page's text, attribute values and element markup as edited, up to 64K characters each, at most 200 edits and 256 KB per page. they stay until you turn the switch off or the page is forgotten past 20 pages of the origin. forced states are never kept, and edits made in devknobs' frame are kept only if it showed the same page (its origin and path) as they were made, and are stored as long as the page's own. turning the switch off removes the page's item; clearing the site's data removes them all. a script of the page can write there too, as it can anything in the origin's storage: devknobs never makes a kept html or attribute edit as the page loads, but lists it until you click `apply`, and never makes one that could run a script. see [keep edits after reload](/docs/grab#keep-edits-after-reload).
- the locale knob writes the tag into the stores i18n libraries read: the paraglide cookie always, the paraglide and i18next local storage keys and the i18next session key and cookie only when the page already has them, and `NEXT_LOCALE` on next.js pages or when that cookie exists. it gives each its old value back when you set it to system, within the same tab session only.

with `devknobs=fresh` in the address, devknobs' own items skip `localStorage`. the storage view still reads the page's storage, and writes it when you edit there. see [fresh mode](/docs/panel#fresh-mode).

## the chrome extension

the extension's own code makes no network requests: no `fetch`, no `XMLHttpRequest`, nothing to a server. its device images ship inside it. the panel it puts on a page is devknobs, so it loads what the npm package loads (see above), from the page.

what it keeps, in `chrome.storage`:

- session storage, which Chrome clears when it closes: each tab's knobs, which tabs have devknobs' frame open on which host, and each tab's user agent with its page's host.
- local storage: the real or in-page switch, prefer, real phone mode, the shortcuts you set in the panel, and the edits a page keeps after a reload while its switch is on (`edits:` and the page's origin and path, for 20 pages at most): the page's text, attribute values and element markup as edited, up to 64K characters each, until you turn the switch off or the page is forgotten. clearing a site's data does not remove them: turn the switch off, or remove the extension. real phone mode, the shortcuts and the edits are saved there only in the short time after a click or a key press of yours on the page, which a page script can use too; a page script that sets them otherwise changes them in its own tab alone. the extension's bridge binds every write of edits to the path the page loaded at, which it reads itself, never one the page names, so a script can only change the kept edits of the page it runs on, and only right after a click or key press of yours there. turning a page's switch off removes its edits; removing the extension removes them all. a script of a page could, right after you click or press a key there, write edits for any path of its origin. so the panel never makes a kept html or attribute edit as a page loads: it lists them until you click `apply` in the panel, and neither keeps nor makes one that could run a script (`<script>`, frames, `<object>`, `<embed>`, `<base>`, `<meta>`, `<link>`, `on…` handlers, `srcdoc`, `javascript:` addresses). the other kept edits (styles, texts, hides, deletes and moves) are made as the page loads, as such a script could make them itself.

the panel it puts on a page keeps the same `devknobs` and `devknobs:` keys in that page's own storage as the npm package does, but for the shortcuts, which it keeps in the extension's storage, the same on every site, and the edits kept after a reload, which it keeps there per page.

**the debugger.** Chrome's debugger attaches to a tab only when you ask for something that needs it, and Chrome shows its bar while it is on:

- in real mode, a knob that goes to the browser (text size, offline, the preferences or a plain viewport) leaves its default. it detaches when they are all back, as reset does.
- you press "find out why" under a refused frame's notice. it detaches once it finds the frame's load; if none matches, it may stay attached until the tab closes, you close the bar, or a knob is set and reset.
- you press "load past the service worker", in either mode. it detaches once the frame closes, unless a knob keeps it.

while it is on, it notes the last few loads of the tab's frames in memory, to say why a frame was refused: the address, redirects, the status, the headers that bear on framing, the `sec-fetch` metadata sent, why a load failed, and Chrome's console lines and Audits issues about it. to read that metadata it keeps the headers of up to 50 recent requests in memory, cookies and authorization included; only the `sec-fetch` values go into the record, and the headers are never stored or sent. when a frame is refused, the extension hands the record of that load to the panel in the page, which shows it under the notice; "copy details" puts it on your clipboard. with real browser settings off, the debugger never attaches for a knob.

**the user agent.** servers see another user agent only while you set the ua knob to a preset or a custom string yourself, or the viewport makes the whole tab a device. a device in the frame sends none, unless you turn on real phone mode, which sends it on the frame's own page loads alone. then a rule sets `User-Agent` and the client hints on that tab's requests to its page's own host, never on what a service worker fetches or on another tab. no rule touches cookies. it goes with the tab, or once the knob is back to system, and a page loaded under it loads again.

**the framing rule.** response headers are changed only while devknobs' frame is open in a tab: frame loads of the page's own host in that tab, and what that host's service worker fetches, lose `X-Frame-Options`, and `Content-Security-Policy` where its `frame-ancestors` refuses the page. see [pages that refuse frames](/docs/extension#pages-that-refuse-frames).

each permission and what it is for is listed under [permissions](/docs/extension#permissions).

## knobs.dev

the site counts visits with a self-hosted [OpenPanel](https://openpanel.dev), through this site's own `/api/op`, so the page never reaches the analytics host directly. it records page views, link clicks (`link_click`, with the link's address and label), the panel's buttons (`knob_click`), the copy buttons, the GitHub links, and the guided tour's progress (each stop done, where it was closed, finished, and "explore other knobs"). OpenPanel's own link and attribute tracking are off; the site sends its link clicks itself. it does not run in an automated browser, nor in the copy of the page in a device's frame, nor anywhere but on knobs.dev. the proxy hands your IP address and user agent to the analytics server, so two visitors do not count as one device, and no cookies.

the server logs each request with its method, path, status and how long it took, the Cloudflare request id, and the country, network and data center Cloudflare reports. it logs no IP address, no user agent and no cookies.

the demo requests under `/api/demo` keep no state and make no request of their own. four of the demo's request buttons leave the site on purpose, and only when pressed: two ask `https://example.com/`, and two ask `https://demo.invalid/`, which never resolves. the demo panel on the site is devknobs itself, so it keeps the same `devknobs` keys in your browser as above. what the site keeps in your browser:

- the `PARAGLIDE_LOCALE` cookie, the page's language, set on every visit for 400 days.
- `knobs:tour` in `localStorage`, once you close or finish the tour.
- the storage demo's shop, only when you press its buttons: the cart (`knobs-demo:cart` in `localStorage`), what you viewed (`knobs-demo:viewed` in `sessionStorage`), your cookie banner choice (the `knobs-demo-consent` cookie), what you saved for later (the `knobs-demo` IndexedDB database) and its offline copy (the `knobs-demo` Cache Storage).

questions go to the [GitHub issues](https://github.com/vinenastudio/knobs/issues).
