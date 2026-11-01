---
title: limits and faq
meta_title: devknobs limits and FAQ: what a page panel cannot fake
description: What devknobs cannot fake from inside a page, such as cross-origin stylesheets, worker time zones and real touch, and answers to common questions about it.
order: 9
updated: 2026-10-29
---

devknobs works from inside the page, so some things stay out of its reach.

## main limits

- only same-origin stylesheets can be rewritten. a cross-origin `<link>` keeps its real media behaviour.
- a `MediaQueryList` made before devknobs mounted gets no change event. reload, or load the [early script](/docs/start) first.
- the time zone and the clock live in the page. workers, service workers and the server keep the real ones.
- the clock moves the time a page reads, not the time that passes. timers keep real time.
- the user agent knob changes what page code reads. the server still sees the real `User-Agent`, unless you use the [extension](/docs/extension).
- the speed knob slows what the Web Animations API sees. a `requestAnimationFrame` loop keeps its own pace.
- the touch pointer is made in the page. css `:hover` still follows the mouse, and there is one finger only, with no pinch.
- the phone's browser bars do not open their menus, and there is no keyboard.
- the phone's browser gives the page Safari's real viewport, but `100svh`, `100lvh`, `100vh` and `clientHeight` follow the frame's height. under the bars the screen is one solid color, not the page itself. edge to edge only works with the phone held sideways.
- the frame loads the page a second time, so in-memory state is not shared between the two.

## what only devtools can do

- device pixel ratio outside chromium
- `forced-colors`, high contrast and print media
- trusted touch events and pinch
- network throttling and a real offline
- the time zone of workers

## faq

does it ship to production? not unless you put it there. gate the import itself, since a static import stays in the bundle even behind a dev check. see [start](/docs/start).

does it need react? no. it is vanilla typescript with zero runtime dependencies. react only adds component names to [grab](/docs/grab).

does it send data anywhere? no. there is no analytics and no telemetry. see [privacy](/docs/privacy).

why does my page load twice? the width, height, device and some other knobs render the page in a same-origin frame, which loads it again.
