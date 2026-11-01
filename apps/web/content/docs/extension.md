---
title: chrome extension
meta_title: knobs Chrome extension: the devknobs panel on any website
description: The devknobs Chrome extension puts the same panel on any site you open in Chrome or Edge, with no change to its code, and has Chrome set some knobs for real.
order: 8
updated: 2026-10-30
---

## what it does

the same devknobs panel on any page you open, with no change to the site's code. the toolbar button opens and closes it. Chrome and Edge only.

## install

install it from the [chrome web store](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj). it works in Chrome and Edge. tabs open before the install get the panel at their next load.

## with the npm package

the npm package is for your own app, in any browser. the extension is for any site, in Chrome and Edge. if the page runs devknobs too, the extension's panel wins, and the page's calls such as `setState` go to it. to try a local build of devknobs on your own site, set prefer to page in the panel's settings: the page's copy then runs the panel, with real browser settings off. it needs a page copy newer than 0.5.1 or a local build, and applies to every site in the Chrome profile. the panel's footer says which copy runs it.

## what Chrome sets for real

the npm package fakes every knob inside the page. the extension hands these to Chrome instead:

- text size: `rem`, `em` and em media queries all follow, with no jump after paint.
- offline: requests really fail.
- the preferences: color scheme, contrast, reduced motion and reduced transparency.
- viewport: a plain size, or a device with no mock or browser drawn around it, becomes the tab's own viewport, with no reload.
- user agent: every request of the tab carries it, so servers see it too.

while text size, offline, a preference or the viewport is set, Chrome shows its "started debugging this browser" bar. to avoid it, turn off "real browser settings" in the panel's settings, and those knobs work in the page as with the npm package. the user agent still reaches servers.

## permissions

- `debugger`: the knobs set for real.
- `declarativeNetRequestWithHostAccess` and `<all_urls>`: the user agent and framing rules.
- `offscreen`: reads your own scheme and motion.
- `storage`: each tab's knobs and the real or in-page switch.
- `webNavigation`: drops framing rules when a tab loads another page, and sees the width knob's frame sent to another host of the same site.

pages that refuse frames still load in the width knob's frame: while it is open, the extension removes `X-Frame-Options` from that tab's frame loads of the page's host, and `Content-Security-Policy` where its `frame-ancestors` leaves the page out. a site that sends the frame's first load to another host of its own, such as its mobile one for a phone, takes the tab there, with your knobs. later loads sent elsewhere get the notice.
