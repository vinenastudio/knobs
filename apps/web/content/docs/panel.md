---
title: the panel
meta_title: The devknobs panel: open, move, search and pin your knobs
description: Open the devknobs panel with Shift K, move it along the window edge, search every knob by name or value, pin the ones you use, and change its shortcuts.
order: 2
updated: 2026-10-28
---

## open and move it

the panel starts closed, as a handle on the right edge of the window. click it or press `⇧K` to open it. it stays open across reloads.

- drag the handle to move the panel along the edge, or past the middle to the other side.
- drag the panel's inner edge to change its width.

## rows and search

the panel lists the knobs that are off their default, one row each. click a row to open its editor, `×` puts it back to its default, and holding `×` for a second takes the row off. drag a row by its six dots to move it.

the add knob button opens a search. type `dark`, `390`, `+2d`, `tokyo` or `offline`, and enter sets the first result.

## keys

while the panel is out and the focus is in no field:

| key           | what it does                                     |
| ------------- | ------------------------------------------------ |
| `⇧K`          | opens and closes the panel                       |
| `/`           | opens the search                                 |
| `⇧G`          | grabs an element, see [grab](/docs/grab)         |
| `⇧R`          | replays the page's animations                    |
| `⇧N`          | shows the [requests](/docs/requests-and-storage) |
| `⇧S`          | shows the [storage](/docs/requests-and-storage)  |
| `⇧` backspace | resets every knob                                |

every other key goes to the page. the gear in the footer opens the settings, where you can change every key but `/` and hide the handle. the dev tab icon switch there puts a `DEV` ribbon on the tab's icon: on local hosts only by default, or on any host or none, for this tab. turned off or unmounted, the page has its own icons back.

## pinning

the pin button in the footer docks the panel to its side, the way devtools dock. the page gets narrower for real, so media queries and fixed boxes follow. press it again to float the panel.

## fresh mode

add `devknobs=fresh` to the address to see the page and the panel as a first visit does. nothing is kept while it is on.

```
http://localhost:3000/?devknobs=fresh
```
