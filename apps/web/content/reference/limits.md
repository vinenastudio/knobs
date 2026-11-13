---
title: limits and faq
description: What knobs cannot fake from inside a page, and answers to common questions about it.
order: 9
---

knobs works from inside the page, so some things stay out of its reach. these are the limits, knob by knob.

## stylesheets

only same-origin stylesheets can be rewritten. a cross-origin `<link>` keeps
its real media behaviour, because the browser refuses to hand over its rules.
the same goes for css inside a shadow root that knobs cannot reach.

## media query lists

a `MediaQueryList` made before knobs mounted reads the emulated `matches`,
because the getter is patched on the prototype, but it gets no change event:
there is no way to find it. reload once the knob is set, so the page makes its
lists after the mount, or load the [early script](/docs/start#early-script) first.

## the time zone

the time zone knob lives in the page, so workers, service workers and server
rendering keep the host zone, and a server rendered date can mismatch on
hydration. code that kept a reference to `Date` from before knobs loaded
builds dates from local fields in the host zone (reading them is still
emulated), and an `Intl.DateTimeFormat` made before then keeps the host zone.
`Date.parse` reads a string as local time unless it has a `Z`, an offset or a
zone name such as `GMT` or `EST`. an old date in a zone that has since dropped
daylight time can show a different zone name in `toString`.

## the clock

the clock moves the time a page reads, not the time that passes.
`performance.now()`, `setTimeout`, `setInterval`, `requestAnimationFrame` and
event `timeStamp`s keep real time: they measure durations, which a date jump
does not change, and a stopped or racing timer would hang or flood the page. a
countdown that ticks every second still ticks every second, and what each
tick reads off `Date.now()` follows the clock, so at speed 60 each tick moves
a minute. an offset clock is anchored to real time, so it keeps running while
the tab is closed or reloading: an hour away at speed 60 is 60 hours on the
clock. a frozen clock waits. like the time zone, the clock lives in the page:
workers, service workers and the server keep real time (see [the clock and
your server](/docs/knobs#the-clock-and-your-server)), and a server rendered timestamp can mismatch on hydration.
code that kept `Date`, `Date.now` or a `Temporal.Now` reader from before
knobs loaded reads the real time, so load the [early script](/docs/start#early-script) first.
`Intl.DateTimeFormat` `format()` with no date, `document.lastModified` and a
file's `lastModified` read the real time too. only `fetch` and
`XMLHttpRequest` carry the header: forms, links, `sendBeacon`, `EventSource`
and websockets do not.

## the user agent

the user agent knob changes what page code reads, not what goes over the
wire. the server still sees the real `User-Agent` request header, as browsers
do not let page code change it on the page's own loads, so server-side
sniffing (a mobile redirect, a bot check, rendering per device) does not
follow the knob. the `Sec-CH-UA` client hint headers stay real too, in a
device's frame as well, its reloads included. workers and service workers keep
the real `navigator`. without a frame, code that read the user agent before
the knob moved keeps what it read: reload, or load the [early script](/docs/start#early-script) first. in
a frame the page reloads on its own. stylesheets in the frame's page see the
touch screen's pointer and hover once knobs mounts there, as before.

## animation speed

the speed knob reaches what the Web Animations API can see. an animation
that javascript drives frame by frame (a `requestAnimationFrame` loop, a
spring in Motion) keeps its own pace. Motion's global config has no time scale
to set, so only its WAAPI-backed animations slow down.

## text size

the text size knob reads the root `font-size` from same-origin stylesheets; one
set in a cross-origin sheet is taken as relative. a `matchMedia` list made from
an em or rem query keeps the size it was made at when the knob changes later.

## the touch pointer

the touch pointer is made in the page, not by the browser. css `:hover` still
follows the real mouse, as no script can turn it off. touch events and the
`pointercancel` it sends are not trusted (`isTrusted` is false), it is one
finger only, with no pinch and no long press menu, and a fling is a simple
one, with no overscroll bounce. a page's own capture listeners on the window
still get hover moves, and ones it put there before knobs loaded read
`pointerType: "mouse"`. desktop Safari and Firefox have no
`Touch` constructor, so they get the cursor, the pointer type and the scrolling
but no touch events. turn the switch off for the mouse as it is: clicks,
hover and `pointerType: "mouse"`. `ontouchstart` is on the window only, not on
elements or the document. in a phone's or tablet's frame `screen.width`,
`screen.height`, `availWidth` and `availHeight` are the device's (the
iPhone Duo's cover screen on either of its screens); `screen.orientation`
keeps the real screen's.

a touch device's scrollbars are hidden, not drawn as a phone draws them: the
thin indicator that shows over the page while it scrolls is left out, and a
page's own `::-webkit-scrollbar` or `scrollbar-width` styles do not show in
the frame.

## the phone's browser

the bars follow the scroll of the document only, as on the phone, so a page
that scrolls an inner box keeps them as they are, and they do not come back
at the bottom of the page. upright, what shows of the page under Safari's
bottom bars, past the viewport, is a picture of it, not the page itself:
what is fixed to the screen is left out, pictures, videos and drawings show
as the background of their box, it is taken again at most four times a
second while the page changes, and a page from another origin gets one
color there, the content's at the page's bottom edge. a fixed footer's
color is carried down, as on the phone. minimized, the content under the
status bar is that at the page's top, not what scrolled past it. `100svh`, `100lvh` and `100vh` follow the frame's
height, where Safari keeps `svh` at the expanded height and `lvh` and `vh`
at the minimized one (the whole screen in top), and so does
`document.documentElement.clientHeight`, which Safari keeps at the expanded
height: both are the frame's own layout viewport, which a page's script and
css cannot set apart from `innerHeight`. the edge to edge switch
only works with the phone held sideways. the top edge has no fade, as Safari
shows none there. `env(safe-area-inset-*)` stays 0. there is no keyboard, and the tabs, the
menus and the share sheet do not open. a page that changes its background
without a load, a navigation or a scheme change keeps the old color around
the bars until the next one. Safari is drawn as iOS 27.0 has it; the dynamic
island keeps its iOS 26.5 size, as the iOS 27 simulator does not draw it. Chrome is its
classic toolbar, with no theme color and no dynamic color.

## the frame

the frame loads the page a second time, so in-memory state (a half-filled form,
a client store) is not shared between the two, and the page under the frame
keeps running, though it skips rendering. a navigation to another origin inside
the frame, a link, a form or a script's (a sign-in provider, say), takes the
whole tab there instead, as it would with no frame, in browsers with the
Navigation API (chromium); the knobs wait on this origin for the way back. one
that only a server's redirect sends to another origin, and one in a browser
without that api, gets the refusal notice, whose button closes the frame.

## what only devtools can do

these cannot be faked from inside a page, so use the browser devtools for
them:

- device pixel ratio outside chromium (device toolbar)
- `forced-colors` and high contrast mode (rendering panel)
- print media (rendering panel, or print preview)
- trusted touch events, pinch and `:hover` that follows touch (device toolbar)
- network throttling and a real offline (network panel)
- the time zone of workers and of the page before knobs loads (sensors panel, or a `TZ` environment variable when the browser starts)

## faq

### does it ship to production?

not unless you put it there. knobs is for development only, and every way in is yours to gate: a dev check around a dynamic import, `next/dynamic` behind `NODE_ENV` in next.js, or a script tag kept out of the deployed page. a static import stays in the production bundle even behind a dev check, because the bundler still has to keep the module, so gate the import itself. see [start](/docs/start#usage).

### which frameworks does it work with?

any page. it works on the page itself, so it needs no framework: the script tag on a plain page, `mount()` with any bundler (vite, tanstack start, react router, sveltekit), and `<Knobs />` in react, next.js included. add the [early script](/docs/start#early-script) where the page reads media queries, the time or the user agent while it boots.

### does it need react?

no. knobs is vanilla typescript with zero runtime dependencies, and react is optional (`@vinena/knobs/react`). react matters to [grab](/docs/grab) only: the component names and source places it copies come from react. without them, grab falls back to the element's html and a selector.

### the extension or the npm package?

the npm package goes into your app, for development, runs in any browser and emulates every knob inside the page. the extension needs no change to the code and works on any site, in chrome and edge only. it sets text size, offline, the color scheme and the other preferences, and a plain size or device for real through chrome's debugger, and changes the user agent servers see. see [chrome extension](/docs/extension#how-it-differs-from-the-npm-package).

### does it send data anywhere?

no. there is no analytics and no telemetry. the requests view keeps the last 300 requests in memory, and nothing of it is stored or sent. the storage view reads through the page's own apis, and its copy controls are the only way out. the clock's header goes only to your page's own origin, and only after you turn on "send to server". see [privacy](/docs/privacy).

### why does my page load twice?

the width, height, device, frame, device pixel ratio and vision knobs, and a [pinned panel](/docs/panel#pinning), render the page in a same-origin frame, a real viewport, which loads the page a second time. in-memory state, such as a half-filled form or a client store, is not shared between the two. see [the frame](/docs/knobs#the-frame).
