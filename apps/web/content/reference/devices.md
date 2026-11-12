---
title: devices
description: The device presets, their mocks and bezels, the phone browsers drawn around the page, the touch pointer and how the iPhone Duo folds.
order: 4
---

## the presets

the device knob sets a size, a ratio and a touch screen in one pick. the list
in the panel groups them by kind, and search finds them by name, kind or
platform (`iphone`, `pixel`, `ipad`, `macbook`, `phone`, `tablet`,
`android`). `landscape` turns the frame, and a size typed out such as
`390x844` sets a custom one. the presets are also `PRESETS.device`.

| device            | css px                    | dpr   | touch |
| ----------------- | ------------------------- | ----- | ----- |
| iPhone 18 Pro     | 402 × 874                 | 3     | yes   |
| iPhone 18 Pro Max | 440 × 956                 | 3     | yes   |
| iPhone Duo        | 466 × 678, open 951 × 669 | 3     | yes   |
| iPhone Air        | 420 × 912                 | 3     | yes   |
| iPhone 17         | 402 × 874                 | 3     | yes   |
| iPhone 17 Pro     | 402 × 874                 | 3     | yes   |
| iPhone 17 Pro Max | 440 × 956                 | 3     | yes   |
| iPhone 16         | 393 × 852                 | 3     | yes   |
| iPhone 16 Plus    | 430 × 932                 | 3     | yes   |
| iPhone 16 Pro     | 402 × 874                 | 3     | yes   |
| iPhone 16 Pro Max | 440 × 956                 | 3     | yes   |
| iPhone SE         | 375 × 667                 | 2     | yes   |
| Pixel 10          | 412 × 924                 | 2.625 | yes   |
| Pixel 10 Pro      | 427 × 952                 | 3     | yes   |
| Pixel 10 Pro XL   | 448 × 998                 | 3     | yes   |
| Pixel 10a         | 412 × 924                 | 2.625 | yes   |
| Pixel 9           | 412 × 924                 | 2.625 | yes   |
| Pixel 9 Pro       | 427 × 952                 | 3     | yes   |
| Pixel 9 Pro XL    | 448 × 998                 | 3     | yes   |
| iPad mini         | 744 × 1133                | 2     | yes   |
| iPad Air 11       | 820 × 1180                | 2     | yes   |
| iPad Pro 13       | 1032 × 1376               | 2     | yes   |
| MacBook Air 13    | 1470 × 956                | 2     | no    |
| laptop            | 1366 × 768                | 1     | no    |
| desktop           | 1920 × 1080               | 1     | no    |

each size is the whole screen in css px, the device held its usual way:
phones and tablets upright, laptops and desktops across. a phone shows its
browser in that screen too, see below, and a laptop's menu bar and window
frame would take some of the height as well.

a phone or tablet picked after another is held the same way, anything else
comes up its usual way, unless the patch names an orientation. a width or
height set by hand that is no longer the device's drops the device and keeps
the size, and a device pixel ratio set by hand keeps the device.

## the iphone duo

the iPhone Duo folds. it comes up closed, on its cover screen, and the device
row's `unfold` and `fold`, or `posture`, open it onto its inner screen and
shut it again. like a book, its hinge stays where it is, so the cover screen
held upright opens to the inner screen held across, and held across, it opens
upright. it folds in view: the page goes under a cover in its own color, the
half past the hinge swings toward you about it, and the page comes back laid
out on the other screen. in its bezels the half that swings is Apple's own
Duo, rendered offline every degree from Apple's model, with the page on its
turned screen, once those frames have loaded, and a copy of the bezel till then. search finds it as `unfold`, `fold`, `open`,
`closed` or `duo open`. a session kept from when the two screens were two
devices, `iphone-duo-closed` and `iphone-duo-open`, comes back as the Duo in
that posture.

## mock and bezels

a phone or tablet comes up in a mock of its body, drawn in svg around the
frame: the front glass in its band, the dynamic island, the punch hole, the
camera or the home button, and the side buttons. each device has its own
bezels, corners and parts, taken from apple's dimensional drawings and
android's display config, so an iPhone SE has its square screen, round corners,
tall forehead and chin and home button. it turns with the frame, is fitted
and zoomed with it, and never takes a pointer. the viewport stays the device's
size. the mock switch in the device editor turns it off. laptops and desktops
have none.

every iPhone and every Pixel wears its maker's own bezel instead: Apple's
product bezels from Apple Design Resources, Apple's marketing image of the
iPhone SE, and the Pixel frames of Google's Android Studio emulator. each is
drawn at its own size, 3 image px per css px on the newer iPhones, 3.52 on
the SE and 2.62 or 3 on a Pixel, with its screen opening exactly on the
frame, so no model is ever stretched onto another. the punch hole, the home
button and the buttons are the image's own. it loads from `dist/bezels` the
first time the device is shown with the mock on, the drawn mock standing in
its place until then, and the drawn mock stays where an image does not load.
the Duo's fold frames load with it, from `dist/bezels/duo-fold`, about 2.7 MB.
the images are not under this project's license, see [THIRD_PARTY_NOTICES.md](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/THIRD_PARTY_NOTICES.md):
delete `assets/bezels` and run `bun run build`, which then names no image, and
every phone draws its own mock again.

## the phone's browser

a phone shows the page in its browser, drawn in the screen around the frame:
Safari's status bar and Liquid Glass bars on an iPhone, and Android's status
bar, Chrome's toolbar and the chin on a Pixel. the home indicator
and the gesture handle are left out, as they go once you switch apps and here
none are switched. the browser knob picks the layout, Safari's compact, bottom
or top and Chrome's top or bottom, or off for the whole screen. the readout
says the size the page gets.

upright, the page gets Safari's real viewport, measured in iOS 27.0 (the same
as in iOS 26.5) on an iPhone 17 Pro: 402 × 714 in compact, 402 × 654 with the bar at the bottom
and 402 × 660 at the top (the page starts under the address bar, at 122),
754, 754 and 768 minimized. `innerHeight`, `visualViewport`, `100dvh` and
`position: fixed; bottom: 0` follow the bars as on the phone. `screen.width`
and `screen.height` are the device's own size, 402 × 874 on a 17 Pro: an
iPhone keeps it upright however it is held, an Android phone turns it; the
iPhone Duo reports its cover screen, 466 × 678, on either screen. under the bars, where the frame
ends, the page runs on to the bottom of the screen, as a picture of the
document past the viewport that follows the scroll, or the color of a fixed
bar at the bottom of the viewport, carried down as on the phone. the strip over the page takes the color of a fixed or
sticky bar at the top, else the page's background. minimized, the strip
goes: the content at the top of the page shows under the status bar, in a
wash of the page's color that fades out over 100 px, and the status bar's
glyphs follow it. iOS 27 draws no scroll edge under the bottom bars, so the page
runs on under them at full strength, on the iPhone Duo too. the edge to edge switch
is offered only with the iPhone held sideways, where it still changes the
frame: on, by default, the page runs under the top row of bars; off, it
starts under it. upright it is not offered, and a value set earlier is kept
for the next turn. Chrome always gives
its real viewport, as its toolbar is opaque: a Pixel 9 is 412 × 777 with the
toolbar and 412 × 857 without. the 9s' status bars are AOSP's own. Google
publishes none for the 10s, so theirs are derived from where the punch hole
sits, as AOSP lines the 9s' bars up with theirs.

the iPhone Duo has Safari 27.1's own layout, the only one it offers, as
measured on the iOS 27.1 simulator. upright on the cover screen the status
and Safari's buttons stack in a column on the right, under the camera hole:
the time, a ring for the battery round wifi with the signal's four dots in
its gap, back, reader, and new tab with tabs. the address floats at the
bottom of the page. the page never runs under the column, which takes the
page's color. held across, the cover turns its top to the right, the camera
hole to the bottom right, and has no status and no column: one bar
along the top holds back, reader, the address, share, new tab and tabs. the
inner screen has one bar at the top, held either way: back, reader, the
address, new tab with tabs, then the time and the ring; minimized, only a
small domain pill is left. the edge to edge switch is not offered on the
Duo. the page gets the simulator's viewports: 382 × 580 on the cover screen
upright (618 minimized, WebKit's, as the simulator's cover takes no
swipe), 678 × 386 and 440 across, 669 × 871 and 900 on the inner screen
upright, 951 × 589 and 618 across.

the bars minimize and come back with the page's scroll, or stay one way with
the bars knob. Safari's address capsule, or the bottom layout's card, is one
glass shape that becomes the minimized pill: its box and corners tween over
500 ms when it minimizes and 400 ms when it expands (the transitions.dev
very slow and slow durations) on css's ease, the address glides and shrinks
from 17 to 13 px in it, the page menu, reload and the bottom buttons fade out
early and in late, and the capsules beside it fade and drift 10 px. a scroll
the other way mid way turns it back from where it is. Chrome's toolbar
slides away under the status bar, or down with the chin, on the same timing.
as the page's height changes with the bars, it gets one
resize for each change, at the start when its viewport grows and at the end
when it shrinks, so no gap shows, and its own scrolling as it settles never
flips the bars again. with reduced motion in the browser the bars just
switch. turned across, Safari keeps one row at the top and leaves room for
the island at both sides. Chrome's numbers come from the Chromium and AOSP
sources. the screen around
the bars takes the page's own background, read again on each load,
navigation and scheme change. Safari is drawn as iOS 27.0 has it on the
simulator: its glass takes its tint from the page under it and from the
scheme, #f8f8f8 over white and gray with black glyphs over black in light,
gray with white glyphs over white and #222222 over black in dark, and a
saturated page's own hue, lighter in light. compact ends in the tabs button,
the page menu is three lines, and the status bar's glyphs are iOS 27's, about
7% bigger than iOS 26's, with a flat battery: the charged part in the glyph's
color, the rest gray, no outline. the iOS 27 simulator does not draw the
dynamic island, so the island keeps its iOS 26.5 size. the address shows the frame's host, back
and forward step through the frame's history and reload reloads it, and the
rest is drawn only. the glyphs are drawn for knobs, none come from Apple
or Google. tablets, laptops and desktops have no browser drawn.

## user agent and reloads

a device sets the user agent knob to its own browser too: iPhone or iPad
Safari, Android Chrome, Mac Safari on the MacBook, Windows Chrome on the laptop
and desktop. taking the device away puts the user agent back to system, unless
it was changed since.

a page reads some of a device once, as it loads: a script sniffs the user
agent or the touch screen, a canvas sets up for the pixel ratio. so the frame
reloads, keeping where it is, when a pick changes any of the user agent, the
touch screen or the ratio: iPhone to Pixel, a device to the laptop, the user
agent or ratio knob on its own, a reset. one pick reloads once, and a frame
still on its first load finishes it first. iPhone 16 to iPhone 16 Pro, a turn,
the zoom, the mock, the browser bars, the touch pointer, the scheme and every
other knob follow live with no reload. the page above patches each new page in
the frame before its first script runs, as soon as the frame's window has it:
the user agent fields, `ontouchstart`, the touch points and the pointer and
hover answers of `matchMedia`, so even an inline script at the top of `<head>`
reads the device, with no early script. on its first load, on a reload and on
a link followed inside the frame alike. the copy of knobs in the frame takes
those patches over when it mounts. tested in chrome. without a frame, a new
user agent does not reload the page: reload it yourself, or load the [early
script](/docs/start#early-script).

## touch screens

a device with a touch screen gets one inside its frame: `(pointer: coarse)`,
`(any-pointer: coarse)`, `(hover: none)` and `(any-hover: none)` match, in
stylesheets and `matchMedia` alike, through the same rewrite as the prefers
knobs, `'ontouchstart' in window` is true, and `navigator.maxTouchPoints` reads
5, or what the user agent preset says while one is set. the page above the
frame keeps its own pointer.

its scrollbars take no room either, as a phone's lie over the page: every
scroller in the frame, the page itself included, has its scrollbar hidden from
before the page's first script, so `documentElement.clientWidth` and
`innerWidth` both read the device's width. the page scrolls as before, by the
wheel and the touch pointer. laptops and desktops keep their scrollbars.

the mouse acts as a finger there too, as in the devtools device toolbar. the
cursor over the frame is a round dot, a little smaller and darker while
pressed. a press sends `touchstart`, `touchmove` and `touchend` (`touchcancel`
when the browser cancels it) to the element it went down on, for the whole
gesture, and page listeners read `pointerType: "touch"` on pointer events. a
finger does not hover, so no move, over, out, enter or leave event reaches the
page without a press. a press that stays within 10px is a tap and clicks as
usual. one that moves further scrolls the nearest element that can scroll that
way, both ways where it can, within the `touch-action` of every element on the
way up, and flings on with the speed it was let go at until the next press. the
page gets a `pointercancel` then, its mouse events stop, and no click follows
a drag. after a tap the page gets `mousemove`, `mousedown` and `mouseup` once
the finger is up, after `touchend`, as a phone sends them, but the browser
still focuses and places the caret at the press, so a `preventDefault` on
`mousedown` does not keep the focus where it was. a touch listener that calls
`preventDefault` keeps the page from scrolling, and on `touchstart` or
`touchend` stops the mouse events and the click as a touch screen does. text
does not get selected and nothing starts a native drag along the way. a press
on a range slider, editable text or a scrollbar, or with any button but the
main one, is left to the browser: the page's own pointer and mouse moves pass
through untouched, and the pointer type stays the mouse's. while grab is on the
mouse is a mouse again, until grab ends. the touch pointer switch in the device
editor turns it off, and the panel never gets it.

## how the iphone duo folds

the Duo's case is never rendered in your browser. it is rendered once,
offline, from Apple's own iPhone Duo model, the Star White USDZ from Apple's
AR viewer, in a three.js scene adapted from jadon7's
[iphone-duo](https://github.com/jadon7/iphone-duo) ([live
demo](https://iphone-duo-tawny.vercel.app/)): one frame every degree from
shut to open, 181 of them, its screens cut out, and the half that stays with
each, one image of it for every angle where it differs. its metal and the
black glass round its screens are shaded from Apple's bezel pictures, and
shut, its hinge wraps into the spine those show, so both ends of a fold look
as the Duo does at rest. each frame is packed small, as its outline round a
clear middle at 1.5 px per css px, and ships as an image. three.js runs only
in that script, never in the package.

in the page, the hinge sets the angle, at one constant speed, or through
Apple's hinge spring under a hand on the fold slider. knobs shows the frame
nearest it, and the page sits in that frame's screen. the turning screen shows
a picture of the page through a small WebGL2 blur, or plain layers where
WebGL2 is not, and it stays still behind the turning glass, as on Apple's
product page. the half that stays keeps the live page. only the frames
within about 10 degrees of the current angle, and 10 more ahead, are decoded,
about 55 MB at most, and at rest the Duo is Apple's bezel picture.

thanks to jadon7: the scene, the fold rig and the screen projection come from
jadon7's iphone-duo, MIT. see [THIRD_PARTY_NOTICES.md](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/THIRD_PARTY_NOTICES.md), and
[`scripts/render-duo-fold/README.md`](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/scripts/render-duo-fold/README.md) to render the frames again.
