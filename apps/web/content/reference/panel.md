---
title: the panel
description: How the devknobs panel opens, moves, lists its knobs, searches, docks to the side of the window and takes its keys.
order: 2
---

## opening and moving it

the panel starts closed, as a handle on the right edge of the window, 128px below its top, and opens from that height. a window too short for that has the panel rise until it fits. click it or press shift and the hotkey (`⇧K`) to open it, and it stays open across reloads. opening it puts the focus on its add knob button, where typing a knob's name opens the search with it, so `⇧K` then `dark` works in one go, and closing it gives the focus back to what had it before. a panel that comes back open after a reload leaves the focus on the page.

drag the handle to move the panel and the handle together up and down the edge of the window. hold shift while dragging to move the handle alone along the panel. with the panel closed, a drag moves the handle, and the panel opens beside it where it left it. drag the panel's edge on the page's side to change its width, which is kept in `localStorage` under `devknobs:prefs`.

the handle follows the pointer sideways too. let go past the middle of the window, or fling it toward the other edge, and the panel moves to the left or the right edge; anywhere else it glides back to its own. each time you let go of it, its side and where it sits on it are also kept in `localStorage` under `devknobs:place`, so a new tab starts with the panel where you last put it. a tab you did not drag in never writes it.

within 24px of an edge, the panel snaps flush with the top or the bottom of the window, and the handle with the top or the bottom corner of the panel, or of the window while the panel is closed. each stays with the edge it snapped to: a panel at the bottom grows upward as rows and editors open, and keeps to the bottom when the window resizes.

## rows

the panel lists the knobs that are off their default, one row each, with related knobs together: the device row holds the device, its mock, touch pointer, browser, bars, edge to edge and user agent, the viewport row the width, device pixel ratio, zoom and frame, and the time row the clock with its mode, speed, time zone and server header. the rows stand by group: look (scheme, contrast, transparency, vision, text), motion, locale, location, time, network, device, viewport and debug.

a control that does nothing yet stays out of its editor until it does: the clock's mode, speed and "send to server" show once a time is set, the speed only while the clock runs, and zoom and mat once the frame is up. their values stay as set, the row's summary leaves them out while they wait, and search sets them all the same. the clock's "now" readout shows once a time is set, and the time zone's "in use" note only while it follows geo.

a fresh session starts with four rows at their defaults, in this order: the device, scheme, text and locale. a row added from the panel goes to the bottom of the list. the `×` of the device row takes the size and device pixel ratio the device brought along with it. that size and ratio are the device row's, so the viewport row lists only for a value set on it, and its `×` leaves the device as it is, its own pixel ratio included.

click a row to open its editor in place under it, pushing the rows below it down, and click it again to close it. one editor is open at a time. a click on `×` puts that row back to its default and keeps it in the list; holding `×` for a second, or holding enter or space on it, takes the row off, with a fill growing across the `×` while you hold. a knob named the same as its row shows no label of its own under the row's title. a row set or added from the panel stays in the list, at its default too, until a hold on its `×` takes it off, for the session, and reset all puts every knob back to its default and the four rows back in the list, in their order. with every row taken off the panel says nothing emulated, over the add knob button.

drag a row by the six dots at its leading edge, which show on hover and focus and always on a touch screen, to put it elsewhere in the list. with the dots focused, the up and down arrows move the row a place. the order is kept with the rest of the session.

## search

the rows stay on top. the add knob button under them opens a field in its place that finds knobs and values, and the results show under the field, the rows and the results each scrolling in its own room. type `dark`, `390`, `+2d`, `tr`, `tokyo`, `rtl`, `pause` or `offline` and enter sets the first result and shows its row. a value typed out in full works too: `500` for a width, `3d` for the clock, `pt-BR`, `Europe/Paris`, or `36.9, 30.7` for a position. a knob's name adds its row and opens its editor, with no value to set, and with nothing typed the list shows every knob by category.

arrows move through the results. a value or knob picked adds its row at the bottom, if it is not listed yet, and gives it the focus. escape leaves the search, query and all, back to the add knob button, then closes an open editor, and then the panel. a click anywhere outside the search and its results, or on the `×` at its end, leaves it too. with the focus on any of the panel's buttons, typing a character opens the search with it typed in.

## keys

while the panel is out and the focus is in no field:

- `/` opens the search
- `⇧R` replays the page's animations
- `⇧N` shows the [requests](/docs/requests-and-storage#requests), and opens the panel for them where it is closed; pressed again while they show, it leaves them
- `⇧S` shows the [storage](/docs/requests-and-storage#storage) view, and opens the panel for it where it is closed
- `⇧E` shows inspect's [elements view](/docs/grab#inspect), the DOM tree and the styles, on the element inspect last picked, else the page's body, without picking; it opens the panel where it is closed, and pressed again while the view shows, it leaves it
- `⇧O` shows the [settings](#settings), with the shortcuts, and opens the panel for them where it is closed; pressed again while they show, it leaves them
- shift backspace (or shift delete) resets every knob, from the frame too

while the frame is up, meta or ctrl with `+` and `-` zoom it a step in and out, and with `0` fit it again, from the frame too, unless the focus is in a field.

every other key goes to the page as it would without the panel. `⇧K` toggles the panel everywhere except in a field of the page, where shift types a capital as ever. in the panel's search, which finds in lower case anyway, `⇧K`, `⇧R`, `⇧N`, `⇧S`, `⇧E`, `⇧O`, `⇧G` and `⇧C` are the panel's keys and are not typed, so `⇧K` closes the panel from it, and a plain `k` is just a letter. the panel's other fields, a list's filter and the user agent and route boxes, take every letter.

the footer lists the keys, most used first: `⇧K` for the panel, `/` for search, the grab key, the inspect key, `⇧R` for replay animations and `⇧⌫` for reset, as `Shift K`, `Shift R` and `Shift Backspace` off a Mac. each one is a button too, so a click does what its key does. with the overflow knob on, the count of overflowing boxes sits above them.

the panel keeps the real color scheme and motion preference of the browser, whatever the knobs emulate for the page.

## pinning

the pin button in the footer, before the gear, docks the panel to its side the way devtools dock: a column from the top of the window to the bottom, flush with the edge, with the rows using the whole height and the footer at the bottom. the settings and a feature's view fill the column the same way, and scroll in it. the pin panel action in the search does the same, and unpin, the same button or action, makes it the floating panel again, where it was.

the page gets narrower, for real. it runs in a same-origin frame, the one the width knob uses, that fills the window less the panel, so the viewport itself ends where the panel starts: media queries, `100vw`, and `position: fixed` and `sticky` boxes all follow, which a margin on the page could not give. the window's address still follows the page, and reloads, grab and every knob work as they do in any frame. with no device and no width set, that frame is the page and nothing else: no mat, no readout, no zoom. with a device or a width set, the mat simply ends where the panel starts, and the device is fitted in what is left.

pinning loads the page once more when no frame is up yet, like picking a width, and unpinning hands the window its own page back, at the address the frame was on. with a device or a width set already, pinning and unpinning only change the room, and nothing loads. closing a pinned panel (`⇧K`, or the close button by the pin) gives the page the whole window back and keeps the frame, so opening and closing never load anything either. closed, the handle is where it always is.

open, the pinned panel has no handle out on the page. its edge on the page's side changes its width, as a floating panel's does: drag it, double click it, or focus it and press the arrows. two buttons show by the pin while the panel is pinned: one moves the column to the other side of the window, which the move panel across action in the search does too, and one closes the panel.

it is one column, as wide as the panel is: the rows' width, or a view's while one shows. the page's frame follows that width with no load. under a drag it follows the edge, once a frame. it follows the column the same way whenever the column moves on its own: as the panel opens and closes, and as it glides to a new width when a view opens or closes, the page's edge is the column's edge in every frame, so the page lays out as it shrinks and grows. taken to the other side, the column crosses over the page while the page slides across, as wide as it was. a page too slow to keep up (two frames in a row over 50ms) takes its final width at once, and so does every page when the system asks for reduced motion.

the page never gets narrower than 320px, so the edge stops there. in a window too narrow to leave it that beside the panel (under 560px for a panel 240px wide), the panel lies over the page instead, and the pin's tooltip says so.

the pin is kept with the panel's place, in `localStorage` under `devknobs:place`, so a new tab starts pinned too. reset all leaves it, as it leaves the side.

## settings

the gear button at the end of the footer opens the settings, in place of the rows. the show handle switch there hides the handle while the panel is closed, so nothing of devknobs sits on the edge of the page; the panel key (`⇧K`) still opens it, and an open panel shows its handle as ever, to drag it or click it closed. turning the switch off says which key brings the panel back. the choice is kept in `localStorage` under `devknobs:prefs`, for every tab of the origin, and wins over the `handle` option. reset all leaves it.

the dev tab icon switch draws a yellow `DEV` ribbon on every icon link of the page, the apple touch icon too, from the icon's own picture. an icon the page cannot read, from another origin that does not allow it (CORS), keeps its own picture, and below 32px the ribbon has no `DEV` text. it is `panel.devIcon`: `auto`, the default, shows it on a local host only (localhost, `*.localhost`, `*.local`, `0.0.0.0`, a loopback or private network address), `on` on any host, `off` on none, and it holds for this tab. turned off, or with devknobs unmounted, every link has its own address back.

the real phone mode switch shows only with a host that sends requests as another browser, the extension. on, the device's user agent and client hints go with the frame's own page loads, so a site serves its mobile site; the page around the frame, its service worker and other tabs keep the real browser. some sites may sign you out, as they see one session as two browsers. it is `panel.realPhone`, off by default, one setting for every tab and site, which the host keeps (`native.realPhone`). see [what servers see](/docs/extension#what-servers-see).

## shortcuts

the panel, grab, inspect, replay, requests, storage, elements, settings and reset keys above are the defaults, and each can be set from the panel: the settings list them under shortcuts, click one and press the new key, esc to cancel.

- any key or combination works, a key alone too, such as `c`, or `⇧C`. a key alone acts only when no field has the focus, the panel's search included, so it never takes what is typed.
- where the `hotkey` or `grabKey` option takes `⇧E` or `⇧O`, the elements view takes `⇧L` (then `⇧D`) and the settings `⇧U` (then `⇧P`), as inspect takes `⇧I` where `⇧C` is taken.
- the browser's own keys (meta or ctrl with c, v, x, z, a, w, r, t, q, l, n, f, p, s, h, m, a digit or the zoom keys, F5, F11, F12), `/` and a key another shortcut has are refused, with the reason under the row.
- a key with shift alone, like the defaults, is the panel's in its search and the page's in a field of the page, and so is one with alt, ctrl or meta; a function key works in fields too.
- a grab key with meta, ctrl or alt turns grab on with a hold, as [grab](/docs/grab) explains, and any other with a press.

the keys set are kept in `localStorage` under `devknobs:keys`, for every tab of the origin, the width knob's frame included at once, and win over the `hotkey` and `grabKey` options. reset all leaves them; the x by a key puts that one back. the extension keeps them in its own storage instead, the same on every site: see [the extension](/docs/extension#how-it-differs-from-the-npm-package).

## fresh mode

to see the page and the panel as a first visit does, add `devknobs=fresh` to the address:

```
http://localhost:3000/?devknobs=fresh
```

while it is on, devknobs leaves `localStorage` alone: the panel's place, its settings and the keys read as their defaults, nothing is written, and what was kept there is back as soon as the parameter goes. every load of the page starts with no knobs set, a reload too. the knobs still hold inside a visit and in the frame, and across the two loads devknobs asks for itself: the locale knob's reload, and the frame handing the address it went to back to the page as it goes. the parameter stays in the address while the frame navigates, so that load and a reload after it are in fresh mode too.

the footer says `fresh mode: nothing is kept`. it needs no change in the code, and works with the script tag, the import, the react component and the early script. a locale kept by the page in `localStorage` does not follow the locale knob while it is on.
