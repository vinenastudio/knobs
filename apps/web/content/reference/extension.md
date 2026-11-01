---
title: chrome extension
description: The devknobs panel on any site, with text size, offline, the preferences, the viewport and the user agent set for real by Chrome.
order: 8
---

## what it does

the extension puts the devknobs panel on any page you open, the same panel as the npm package, with no change to the site's code. every knob, key and view of the panel is devknobs' own. some knobs go to the browser instead of being emulated in the page, so Chrome sets them for real.

the toolbar button opens and closes the panel in the tab. there is no handle on the page's edge, since the button does that job; the panel's [settings](/docs/panel#settings) can show the handle again. `window.devknobs` is on every page for [agents](/docs/agents), as with the npm package.

## install

install it from the [chrome web store](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj). it works in Chrome and Edge.

### build it yourself

build it from a clone of the repo and load it unpacked. you need node 24 or later, pnpm and [bun](https://bun.sh).

```sh
git clone https://github.com/vinenastudio/knobs.git
cd knobs
pnpm install
pnpm --filter @vinena/knobs build
pnpm --filter @knobs/extension build
```

then in Chrome:

1. open `chrome://extensions`
2. turn on developer mode
3. press load unpacked and pick `packages/extension/dist`

tabs open before the install get the panel at their next load.

## how it differs from the npm package

the npm package emulates every knob inside the page: it patches `matchMedia`, rewrites stylesheets and puts the page in a frame. the extension hands these knobs to Chrome instead, through the Chrome DevTools Protocol (`chrome.debugger`):

- **text size**: `Page.setFontSizes` changes the browser's default font size (monospace scales with it), so `rem`, `em` and `em` media queries all follow, with no rewrite of the page and no jump after paint.
- **offline** (the network knob's `online` field): `Network.emulateNetworkConditions` with `offline: true`. requests fail and `navigator.onLine` is false. the connection type and save data stay in the page.
- **preferences**: color scheme, contrast, reduced motion and reduced transparency, through `Emulation.setEmulatedMedia`.
- **viewport**: a plain width, height or ratio, or a device with nothing drawn around the page (mock off, browser off, not a foldable, no vision filter, zoom at fit, frame knob off, not docked), is the tab's own viewport with no frame: `Emulation.setDeviceMetricsOverride` (the size, the ratio, `mobile` for a phone or tablet, whose screen is its viewport), touch emulation with 5 touch points, and touch events from the mouse for the touch pointer knob. the page keeps its state: nothing reloads. one bigger than the tab is scaled down to fit it, and redrawn when the window resizes. anything drawn around the page keeps devknobs' frame exactly as before, and the override is cleared meanwhile, so the two never stack.
- **user agent** (the ua knob, and a device that is the whole tab): what servers see, with no debugger, in in-page mode too. see [what servers see](#what-servers-see). the page's `navigator` keeps devknobs' patches as with the npm package.

the debugger attaches to a tab when text size, offline, the preferences or the viewport leaves its default and detaches when all are back (reset in the panel does that). overrides survive navigation in the tab while attached, so a reload paints with them from the first frame. should a command fail, the tab goes back to its own settings and the debugger leaves, so the next change starts clean.

a tab's knobs win over the page's stored ones, so a page on another origin in the same tab shows what the tab has. the panel keeps your own scheme and motion: the extension reads them outside every tab and hands them to the panel.

## what servers see

a device picked in the frame sends nothing to servers: its browser lives in the frame's page alone (`navigator.userAgent`, `userAgentData` and `platform`), the page around the frame stays Chrome, and a responsive site still lays out by the frame's width. so a site never sees one session as two browsers at once, which some sites, LinkedIn among them, answer by signing you out.

**real phone mode**, a switch in the panel's settings, off by default, sends the device's user agent and client hints on the frame's own page loads, so a site that picks its mobile site by the user agent serves it, and a server that sends phones to another host (`www` to `m.`) does, with the tab following. its rule is for that tab, the frame's host and frame page loads (`sub_frame`) alone: never the page around the frame, its service worker or another tab. a rule cannot tell the frame's fetches, images and scripts from the page's, so those keep Chrome's own. some sites may sign you out, as they see one session as two browsers. the switch shows only with the extension; it is one setting for every tab and site, kept in the extension's storage: a turn in one tab turns every open tab, and `panel.realPhone` sets it from `setState()` too.

servers see another browser only when you pick one in the ua knob yourself, or when the viewport makes the whole tab the device (a device with nothing drawn around it, in real mode). then the tab's requests to its page's own host carry it: the page, its fetches, images, scripts, websockets and the frame. a session rule (`declarativeNetRequest`, for that tab and host only) sets `User-Agent` and the client hints:

| preset                                                        | `Sec-CH-UA`                                                  | `Sec-CH-UA-Mobile` | `Sec-CH-UA-Platform` |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ | -------------------- |
| iPhone Safari, iPad Safari, Mac Safari, Linux Firefox, custom | removed                                                      | removed            | removed              |
| Android Chrome                                                | Chromium, the made up brand, Google Chrome                   | `?1`               | `"Android"`          |
| Googlebot                                                     | Chromium, the made up brand                                  | `?1`               | `"Android"`          |
| Mac Chrome                                                    | Chromium, the made up brand, Google Chrome                   | `?0`               | `"macOS"`            |
| Windows Chrome, Windows Edge                                  | Chromium, the made up brand, Google Chrome or Microsoft Edge | `?0`               | `"Windows"`          |

the high entropy hints (`-Arch`, `-Bitness`, `-Form-Factors`, `-Full-Version`, `-Full-Version-List`, `-Model`, `-Platform-Version`, `-WoW64`) are always removed: Chrome sends them only to a site that asks, which a rule cannot tell. the page's scripts still read them from devknobs' `navigator.userAgentData`.

- what the page's service worker fetches belongs to no tab and serves every tab of the host, so it keeps Chrome's own, and so do other tabs and other hosts. no rule writes, removes or changes a cookie, `Origin`, `Referer` or a `Sec-Fetch-*` header.
- while the debugger is on the tab, it sets the same user agent, platform and, for a Chromium preset, its client hint metadata, so dedicated workers read it too. it is cleared before the debugger leaves.
- the device's frame loads, and loads again on a change, only once the rules are in. the tab's own page does not reload: reload it to send the new user agent with the page's load.
- the rules go with the tab, or once the page's ua knob goes back to system. a page that loaded while its rule was on loads again then, so it comes back as Chrome.

## real or in-page

while the debugger is on a tab, Chrome shows its "devknobs started debugging this browser" bar. no extension can hide it. the panel's settings have a switch for it, "real browser settings", on at first:

- **on (real)**: the knobs above go through the debugger, as described. the bar shows while one of them is set.
- **off (in-page)**: every knob is devknobs' own emulation in the page, exactly as the npm package does it, and the debugger leaves every tab. no bar, unless you press "load past the service worker", which turns the debugger on until the frame closes. the framing rule stays, so the width knob's frame still loads pages that refuse frames.

the switch is kept for every tab and site. flipping it keeps every knob's value and moves it live, with no reload: off, the tab's overrides are cleared and the page emulates the same knobs; on, the page's emulation goes and the debugger takes them back.

closing the bar (its x or cancel) detaches the debugger. the extension takes that as a choice: the switch goes off for every tab, the knobs stay as they are in the page, and the switch says why ("switched to in-page: Chrome's debugger bar was closed"). the tab keeps Chrome's font size from the debugger until its next load; in-page text size counts it as the browser's default, so it is not applied twice.

what in-page costs, as with the npm package:

- text size rewrites the page's root size after it starts, so text can jump on load, and `em` media queries only follow where devknobs rewrites them.
- offline only flips `navigator.onLine` and fires its `offline` event. requests still go out.
- the emulated scheme and the rest patch `matchMedia` and the page's stylesheets, which a server-rendered page can see as a hydration mismatch.
- a plain size or device is devknobs' frame, which loads the page a second time.

## pages that refuse frames

the width knob, or a [pinned panel](/docs/panel#pinning), loads the tab's own page in a frame, which `X-Frame-Options` or a `frame-ancestors` policy refuses. only while devknobs' frame is open, session rules for the tab have frame loads in that tab, to and from the page's host, lose `X-Frame-Options`, and `Content-Security-Policy` where its `frame-ancestors` leaves the page out: a policy with `frame-ancestors 'self'`, or with no `frame-ancestors`, stays whole. the frame's first load waits for the rules, so a new tab with knobs that frame it loads the first time. the extension sets the frame's address from its own world, which the page's own `frame-src` policy does not hold, so a page whose `frame-src` leaves itself out loads too. Chrome holds the frame's later loads to that policy as well, a link clicked in the frame or devknobs reloading it: when the page's policy refuses one of its own addresses and devknobs' frame lands on Chrome's error page, the extension loads that address again the same way. a POST so refused loads again as a GET. the rule goes as the frame closes, as the tab loads another page and with the tab.

where the page's service worker answers the frame's load, that load belongs to no tab, so while a tab has devknobs' frame open on a host, more rules take `X-Frame-Options`, and the CSP as above, off what that host's service worker fetches from it. they are gone once no tab has a frame open on the host. a service worker can answer from a copy it saved, refusing frames, while it saves a new one behind it, as X's does; that new copy comes through the rules. so a refusal on a page with a service worker loads the frame again after 1 second, then after 3 more, with the notice hidden and the screen covered by a quiet loading state, so Chrome's error page never shows, before it shows.

when the frame is still refused, devknobs' notice says why in a line under it, such as `x.com/i/flow/login answered 200 with X-Frame-Options: DENY (from a service worker)` or `redirected to another site: accounts.google.com`, with a "copy details" button for the whole record as json. the extension reads that from the tab's frame loads while the debugger is on. with no knob keeping the debugger on, the line says it was not watching, and "find out why" puts it on, loads the frame again and takes it off once it finds that load. in in-page mode, the line says to turn real browser settings on.

a service worker that answers the frame from its own cache sends the refused page itself, which no rule reaches. on such a page, still refused after those loads, the notice says the site's service worker serves a saved copy of the page that refuses frames, and offers "load past the service worker (Chrome shows a bar meanwhile)": the debugger goes on the tab, the tab's loads skip service workers, and the frame loads again. once the frame goes, service workers answer again and the debugger leaves, unless a knob keeps it.

a link, form or script in the frame that goes to another origin (a sign-in provider, say, which refuses frames anyway) takes the whole tab there, as it would with no frame; the knobs wait on the page's origin for the way back. a server that sends the frame's first load to another host of the same site, such as a mobile host for a phone (www.youtube.com to m.youtube.com), takes the tab there with your knobs, as the phone would get sent, and the frame opens there. a redirect to another site still gets devknobs' notice, whose button closes the frame.

## pages that run devknobs themselves

the extension's panel wins. it mounts before any of the page's scripts, as the page's host, so when the page mounts its own devknobs later, that copy puts up no panel of its own: its hotkey, grab key, grab on or off, open and grab color go to the extension's panel instead, and `window.devknobs` stays the extension's. the page's own calls to its copy, such as `setState` or `ready` imported from the package, go to the extension's panel too. when the page unmounts its copy, such as a component that goes on a route change, the extension's panel stays. the page's early script, if it has one, sees the extension's copy and patches nothing. an older devknobs (0.3.0 and before) does not know about the extension and takes the page; the extension takes it back, up to three times per page load, then leaves it to the page with a warning in the console.

prefer, in the panel's settings, picks who runs the panel on such a page: extension (the default, as above) or page. with page, the extension's copy steps aside once the page mounts its own: it takes its panel, frame and patches away, hands the page's knobs back to Chrome, and the page's copy mounts as on a page with no extension, with its own panel and `window.devknobs`. the extension does not take the page back; if the page unmounts its copy, the toolbar button brings the extension's panel back. real browser settings are off in that tab, since the debugger is the extension's. pages without a copy of their own keep the extension's panel. the choice is kept for every site in the Chrome profile; picking extension in the page's panel loads the page again with the extension's. the page's copy needs to know about prefer (devknobs after 0.5.1, or a local build of it); an older one stays under the extension's panel, and one that does not know about the extension (0.3.0 and before) keeps the page. the panel's footer names the copy that runs it and its version, such as `extension 0.5.1` or `page 0.5.1-local.1767225600` for a build `bun run link` put in the site.

### two copies of the extension

with the store's extension and a build of your own (loaded unpacked, its version in `chrome://extensions` such as `0.5.1 · local my-branch (9e966ae)`) both on, one of them holds each page, whichever Chrome runs first: a local build over the store's, then the newer version. the other stands down for that page load: no panel, no patches, no debugger, and its toolbar button opens the panel of the one that holds the page. the footer says so, such as `extension 0.5.1 · local my-branch (9e966ae) · store extension stood down`. prefer is the holding copy's choice.

| on the page                               | who runs the panel                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| the page's copy only                      | the page's                                                                       |
| the store extension only                  | the extension's                                                                  |
| the store extension and the page's copy   | the extension's; the page's with prefer set to page                              |
| a local extension and the page's copy     | the extension's; the page's with prefer set to page                              |
| the store extension and a local extension | the local extension's; the store's stands down                                   |
| all three                                 | the local extension's; the page's with prefer set to page in the local extension |

the store's 0.5.1 and older know no ranks. they stand down the same way for any build that has them, in either order, with `older extension stood down` in the footer: they let another copy of the extension have the page and never take it back from one. knobs such an older copy set in that tab before the local build came on stay set by Chrome until the tab closes or you turn that extension off.

## permissions

| permission                                                         | what it is for                                                                                                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debugger`                                                         | the knobs set for real, through the DevTools protocol, finding out why a frame was refused, and a frame's load past a service worker                                                          |
| `declarativeNetRequestWithHostAccess` and `<all_urls>` host access | the framing rule, which removes response headers, and the user agent rules, which set request headers. both need host access                                                                  |
| `offscreen`                                                        | a document outside every tab that reads your own scheme and motion for the panel                                                                                                              |
| `storage`                                                          | each tab's knobs, which tabs have a frame open on which host, and each tab's user agent with its page's host, in session storage, and the real or in-page switch and prefer, in local storage |
| `webNavigation`                                                    | drops a tab's framing rules as it loads another page; sees devknobs' frame's first load sent to another host of the same site, to take the tab there                                          |

the content scripts run on every page (`<all_urls>`, at `document_start`), so the panel is there before the page's own scripts. see [privacy](/docs/privacy#the-chrome-extension) for what the extension keeps.

## limits

- Chrome and Edge only (`chrome.debugger`).
- a device in the frame sends no user agent: a site that picks its mobile site by the user agent alone serves its desktop one, laid out at the frame's width. the ua knob, or a device that is the whole tab, sends one to the tab's own host, never to its service worker or other tabs. servers can still tell Chrome by other means: its TLS and HTTP/2 fingerprints, the order of its headers, and features a script tries. a site that asks for the high entropy client hints gets none. without the debugger, a worker of the page reads Chrome's own `navigator.userAgent`; with it on a Safari preset, a worker still has a `navigator.userAgentData`, empty, where Safari has none.
- while a knob is on in real mode, Chrome shows its "started debugging this browser" bar. in-page mode has none, unless you press "load past the service worker", which turns the debugger on until the frame closes.
- while devknobs' frame is open in a tab, every frame of the page's own host in that tab loses `X-Frame-Options`, and its CSP where its `frame-ancestors` refuses the page, not only devknobs' frame: a rule cannot tell them apart. a frame the page sandboxes through its CSP is not sandboxed then. with no frame of devknobs open, nothing is removed.
- where its `frame-ancestors` refuses the page, the framed copy of a page loses its whole Content Security Policy, not only `frame-ancestors`: a rule cannot edit part of a header. a policy with `frame-ancestors 'self'`, or with no `frame-ancestors`, stays; one that lists hosts but not `'self'` goes. the page in the tab itself keeps it.
- while a frame is open on a host, what that host's service worker fetches loses `X-Frame-Options`, and its CSP where its `frame-ancestors` refuses the page, in every tab. a service worker that answers from its cache needs the debugger, and with it Chrome's bar, to be passed by.
- a frame led to another host, a subdomain of the page's host aside, is refused. one exception: a server that sends the frame's first load to another host of the same site, by the same scheme, takes the tab there with your knobs.
- any script of a page can flip the real or in-page switch, as the panel does. the switch is kept for every tab, so the worst it does is a mode change, and Chrome's bar, in the tabs with knobs on. nothing else a page sends reaches the extension unchecked: only what devknobs sends passes, each field read and the sizes held to devknobs' bounds, and a tab acts on its own id and host alone.
- pages Chrome does not let extensions reach (`chrome://`, the web store) get no panel.
- the panel and grab keep the system's scheme and motion. the panel has no styles for contrast or transparency, so those knobs do not change it either. inside a device's frame, the cursor dot and grab's box still follow the motion knob.
- a page whose Content Security Policy leaves out `data:` images (`img-src`) loses the frame's zoom chevron and vision filters, and the pictures the fold and the frame's snapshot draw of the page. the panel and every sheet of devknobs' are constructed stylesheets, which `style-src` does not block.
- under a real viewport the panel lives in the page, so it is fixed within the emulated viewport: as narrow as the phone, and scaled with it when the tab is smaller. docking it beside the page is a later step.
- a phone's viewport is Chrome's mobile layout: a page with no `<meta name="viewport">` lays out at 980px, as on a real phone, where devknobs' frame gives it the device's width. `ontouchstart` is set in the page, since Chrome adds it only on a load.
- a tab's viewport follows the page's own size knobs: it is not carried to a page on another origin the way text size and preferences are.
- a page that tries to break out of the frame (`top.location = location`) cannot: devknobs' sandbox lets the frame move the tab only on a click.
