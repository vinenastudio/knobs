# Chrome Web Store listing

What the Chrome Web Store developer dashboard asks for, ready to paste. Upload
`devknobs-<version>.zip` from `pnpm --filter @knobs/extension package`. Keep this file true to the
code: a new permission or a new request the extension makes changes the answers below.

## Store listing

**Name** (the manifest's `name`, at most 75 characters)

```
knobs: Dark Mode, Responsive and Accessibility Tester for Developers
```

**Summary** (the manifest's `description`, at most 132 characters)

```
Test dark mode, mobile view, reduced motion, text size, locale, time zone, geolocation and user agent on any page from one panel.
```

**Description**

```
knobs is a free, open source panel for web developers and designers. Open any page and test how it looks in dark mode, on a phone, with reduced motion, with larger text, in another language or in another time zone. You do not change your system settings or your code.

WHAT YOU CAN TEST

Look and accessibility
- Dark mode and light mode (prefers-color-scheme), per tab
- Reduced motion (prefers-reduced-motion), animation speed and replay
- Higher contrast (prefers-contrast) and reduced transparency
- Text size and text spacing
- Color blindness filters: protanopia, deuteranopia, tritanopia, achromatopsia, and blur

Devices and responsive design
- Any width or height, with touch, so your breakpoints really change
- Phone, tablet and laptop sizes, with a device frame drawn around the page if you want one
- A user agent switcher, so the server sees that browser. The Chromium presets (Chrome, Edge, Googlebot) also set the client hints; Safari, Firefox and a custom string send none

Language, place and time
- Any locale, with right-to-left (RTL) or left-to-right text direction
- Pseudolocalization, to find text that does not fit
- Geolocation from city presets or your own coordinates
- Time zone and the page clock: a different zone, a time offset, or a stopped clock

Network
- Offline, to see how the page acts with no connection

SET FOR REAL BY CHROME

Some knobs are set by Chrome itself, not imitated in the page:
- Text size changes the browser's default font size, so rem and em units and em media queries follow.
- Offline really cuts the tab's network.
- Color scheme, contrast, reduced motion and reduced transparency reach every media query of the tab.
- A width or a phone becomes the tab's own viewport, with touch, and nothing reloads. This is only when no device frame is drawn around the page: with a frame, the page shows inside it.

For this, knobs uses Chrome's debugger, so Chrome shows its "started debugging this browser" bar while one of these knobs is set. If you do not want the bar, turn off "real browser settings" in the panel. Then every knob except the user agent is imitated inside the page. The user agent is always set by a request rule, which shows no bar.

TOOLS FOR YOUR WORK

- Grab: click an element to copy its html, the components that rendered it and their source files, ready to paste to a coding agent
- Inspect an element
- Requests, laid out like the network panel in Chrome DevTools
- Storage
- A key to open and close the panel: ⇧K

HOW TO START

1. Add knobs to Chrome.
2. Open the page you are building, also on localhost.
3. Click the knobs icon and set a knob. The page changes at once.

WHAT SERVERS SEE

Nothing changes until you set a knob. The user agent knob changes the User-Agent and client hint headers of that tab's requests to its own host, never those of a service worker or another tab. A device in the frame changes none, unless real phone mode is on: then the frame's own page loads in that tab carry the device's. While the panel's width frame is open, frames of the page's own host in that tab load without X-Frame-Options, and without a Content-Security-Policy whose frame-ancestors refuses the page, so the page can show inside the frame.

PRIVACY

The extension sends nothing to us or any third party, and has no analytics. The panel's requests go to the page you are on: its bundles and source maps for grab, and a second load of the page in the frame. To draw a picture of the page while a folding phone folds, it also fetches the font files the page has loaded, from the addresses the page uses, which can be on other hosts, such as a font service. The device images ship in the extension. Settings stay in Chrome's storage on your computer and in that page's own storage. Privacy policy: https://knobs.dev/docs/privacy

ALSO AS AN NPM PACKAGE

The same panel ships as the npm package @vinena/knobs. Add it to your own app in development, and the panel opens there for your whole team, with no extension.

Docs: https://knobs.dev/docs/extension
Source (MIT license): https://github.com/vinenastudio/knobs
Made by Vinena Studio.
```

**Category**: Developer Tools

**Language**: English

**Graphics**, in this folder:

| Asset                         | File                         |
| ----------------------------- | ---------------------------- |
| Store icon (128x128)          | `../static/icon-128.png`     |
| Screenshot 1 (1280x800)       | `screenshot-1-scheme.png`    |
| Screenshot 2 (1280x800)       | `screenshot-2-text.png`      |
| Screenshot 3 (1280x800)       | `screenshot-3-rtl.png`       |
| Screenshot 4 (1280x800)       | `screenshot-4-vision.png`    |
| Small promo tile (440x280)    | `promo-small-440x280.png`    |
| Marquee promo tile (1400x560) | `promo-marquee-1400x560.png` |

`packages/extension/scripts/store-shots.ego.mjs` makes all of them but the icon, on our live
sites in ego-browser with the knobs extension (see the extension's README, "Store"). The shots:
dark mode, bigger text, right to left and color blindness, each on a phone with the panel open.

**Homepage URL**: https://knobs.dev

**Support URL**: https://github.com/vinenastudio/knobs/issues

## Privacy practices

**Single purpose**

```
knobs puts a developer panel on the page you are building, so you can see how it behaves under other browser settings (text size, color scheme, contrast, motion, offline, viewport, user agent and more), with some of those settings applied for real by Chrome to that tab.
```

**Permission justifications**

`debugger` (the store takes at most 1000 characters per justification)

```
Used only on the user's action, to apply a setting for real to the tab they are working on. It attaches in three cases: (1) "real browser settings" is on and the user sets text size, offline, a media preference or a viewport; it detaches when all are back to default. (2) The user presses "find out why" after a page refused to load in the panel's frame; it watches that frame's next load. (3) The user presses "load past the service worker"; it detaches when the frame closes. Commands: Page.getFrameTree, Page.setFontSizes, Emulation.setEmulatedMedia, setDeviceMetricsOverride, clearDeviceMetricsOverride, setTouchEmulationEnabled, setEmitTouchEventsForMouse, setUserAgentOverride, Network.enable, emulateNetworkConditions, setBypassServiceWorker, Audits.enable, Log.enable. While attached it notes frame loads in memory; only Sec-Fetch values are shown in the panel, nothing is stored or sent. With real browser settings off it never attaches for a setting.
```

`declarativeNetRequestWithHostAccess`

```
Session rules for the tab the user is working on, added and removed by the user's settings. (1) The user agent setting: a rule sets the User-Agent and client hint request headers on that tab's requests to its page's own host. With real phone mode on, a device's rule sets them on the frame's page loads of that host in that tab alone. No rule touches cookies. It goes when the setting goes back to system or the tab closes. (2) The width frame: only while the panel's frame is open in a tab, rules remove X-Frame-Options, and a Content-Security-Policy whose frame-ancestors refuses the page (one that allows 'self', or has no frame-ancestors, stays), from frame loads of the page's own host in that tab (and from what that host's service worker fetches from itself), so the page can load inside the frame. It goes when the frame closes, the tab loads another page or the tab closes.
```

`offscreen`

```
One offscreen document reads the user's own color scheme and reduced motion preference with matchMedia, outside every tab. The panel uses it to keep the user's own look while a tab's media preferences are emulated, since the emulation hides the real values from every media query in that tab.
```

`storage`

```
chrome.storage.session keeps each tab's settings, which tabs have the panel's frame open on which host, and each tab's user agent setting with its page's host, so they survive the extension's service worker restarting. Chrome clears it when it closes. chrome.storage.local keeps one switch: real browser settings on or off. The panel on the page keeps its own settings under devknobs keys in that page's sessionStorage and localStorage. Nothing is sent to the developer or any third party.
```

`webNavigation`

```
Listens to onBeforeNavigate for a tab's top frame, to remove that tab's frame rules (and stop skipping service workers) when the tab loads another page, since the frame they were for is gone with the old page. While the panel's frame is open, it also listens to onBeforeNavigate, onCommitted and onErrorOccurred for subframes of that tab, only to find the panel's frame's first load and where it ended. If a server sent that load to another host of the same site, such as a phone's mobile host, the extension moves that tab to that address (chrome.tabs.update), as the phone would be sent, and hands the panel's settings to the new page. No navigation data is stored or sent.
```

Host permission `<all_urls>`

```
The panel is a developer tool for whatever page the user is building, on any host, including localhost, so its content scripts run on every page at document_start, before the page's own scripts, as the npm package would. declarativeNetRequestWithHostAccess needs host access to modify the headers described above on the page's host.
```

**Remote code**

```
No, I am not using remote code.
```

Every script is bundled in the package (`background.js`, `bridge.js`, `content.js`, `offscreen.js`): no `eval`, no `new Function`, no remote `<script>` or `import()`. The device images ship in `bezels/`.

**Data usage**

What user data do you plan to collect: tick none. Nothing goes to the developer or any third
party, and there are no analytics. The panel's requests go to the page the user is on: its
bundles and source maps for grab, and a second load of the page in the frame. It also fetches
the font files the page has loaded, from the addresses the page uses, which can be on other
hosts, such as a font service. The device images ship in the package. The extension keeps what is listed under `storage` above, and
the panel keeps its settings under `devknobs` keys in that page's own storage, on the user's
computer only. While the debugger is attached, in any of its three cases, it notes the tab's
frame loads in memory, including the full headers of up to 50 recent requests with cookies and
authorization; only their `Sec-Fetch-*` values go into the record shown in the panel, and none of
it is stored or sent. See the privacy policy: https://knobs.dev/docs/privacy

Tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**: https://knobs.dev/docs/privacy
