---
title: 'How to test dark mode, time zones and RTL on your site'
description: 'Emulate prefers-color-scheme, change the time zone and locale in Chrome DevTools, and test right-to-left layouts. Exact steps and their limits.'
slug: test-dark-mode-time-zones-rtl
date: 2026-10-29
updated: 2026-10-29
faq:
  - q: 'How do I emulate dark mode in Chrome?'
    a: "Open DevTools, press Command+Shift+P (Ctrl+Shift+P on Windows), run Show Rendering, and set Emulate CSS media feature prefers-color-scheme to dark. The page's dark styles apply to that tab only, and your system setting stays as it is."
  - q: 'How do I change the time zone in Chrome DevTools?'
    a: "Add a location in DevTools Settings > Locations with a Timezone ID such as Asia/Tokyo, then pick it in the Sensors panel's Location list. The page's Date and Intl now use that zone, in that tab only."
  - q: 'How do I test a right-to-left layout?'
    a: 'Set `dir="rtl"` on the `<html>` element, in the Elements panel or with `document.documentElement.dir = ''rtl''` in the Console. Then check margins, icons, carets and scroll direction. Real Arabic or Hebrew text also tests fonts and line height, which a direction flip alone does not.'
  - q: 'Can I test dark mode without changing my system settings?'
    a: "Yes. Chrome, Edge and Firefox DevTools each emulate `prefers-color-scheme` per tab. In automated tests, Playwright's `colorScheme` option does the same per browser context. Your Mac or Windows theme stays as it is."
  - q: 'Does the DevTools time zone override affect my server?'
    a: "No. It changes what the page's JavaScript reads. Your server still runs in its own zone, so dates the server renders or computes keep the real time zone. To test both, set the server's zone too, for example with the TZ environment variable."
---

To emulate dark mode, open Chrome DevTools, open the Rendering tab, and set **Emulate CSS media feature prefers-color-scheme** to dark. To change the time zone, give a location a Timezone ID in DevTools Settings > Locations and pick it in the Sensors panel. To test right-to-left, set `dir="rtl"` on the `<html>` element. None of these changes your system settings. Each one applies only to the tab you are inspecting.

Below are the exact steps as of October 2026, how to put the same conditions in automated tests, and what each method misses.

## Dark mode: emulate prefers-color-scheme

Sites switch to dark styles with the `prefers-color-scheme` media query. You can make a tab report dark without changing your system theme.

### Chrome and Edge

1. Open DevTools: Command+Option+I on a Mac, Ctrl+Shift+I on Windows and Linux.
2. Press Command+Shift+P (Ctrl+Shift+P) to open the Command Menu, type `rendering`, and choose **Show Rendering**. Or press Esc to open the Drawer and choose **More Tools > Rendering**.
3. Scroll to **Emulate CSS media feature prefers-color-scheme** and pick `prefers-color-scheme: dark`.

CSS media rules update at once. A script that read `matchMedia('(prefers-color-scheme: dark)')` only at page load will not see the change, so reload the page. Google's guide also says to reload.

The same Rendering tab has the neighbors you will want next: `prefers-reduced-motion`, `prefers-contrast`, `forced-colors` (a stand-in for Windows high contrast) and **Emulate CSS media type** set to print.

### Firefox

In the Inspector, the Rules view toolbar has two buttons that simulate the light and the dark color scheme for the page. The **@** button next to them opens the full emulation panel, which also simulates print media. If `privacy.resistFingerprinting` is on, Firefox forces light, so turn it off to test dark.

### Safari

In Web Inspector's Elements tab, the toggles at the top right of the main area include **Override user preferences**. It opens a popover where you set the color scheme, reduced motion and increased contrast. The overrides last while Web Inspector is open. The **Force print media styles** toggle sits next to it.

### What to check in dark mode

- Images and logos with a transparent background on a dark page.
- Form fields, scroll bars and native controls: set `color-scheme: light dark` on `:root`, or they stay light.
- Colors set in JavaScript, charts and canvas, which media queries do not reach.
- Third-party embeds, which follow their own rules.
- Text contrast in both themes, not only the one you designed first.

## Time zones and locale

Dates break at time zone edges: a deadline that shows as "tomorrow" in Tokyo, a calendar day that moves at midnight, a daylight saving week. You can test them without changing your computer's clock.

### Chrome DevTools: Sensors

Chrome sets the time zone and the locale together with a location.

1. Open DevTools, then click the gear (Settings) and choose **Locations**.
2. Click **Add location**.
3. Fill in **Location name**, **Latitude**, **Longitude**, **Timezone ID** (an IANA name such as `Asia/Tokyo` or `America/New_York`) and **Locale** (a BCP 47 tag such as `ja-JP` or `ar-EG`).
4. Click **Save**.
5. Press Command+Shift+P, type `sensors`, and choose **Show Sensors**.
6. In the **Location** list, pick your new location.

Now check it in the Console:

```js
Intl.DateTimeFormat().resolvedOptions().timeZone; // "Asia/Tokyo"
new Date().toString(); // local time in Tokyo
```

Limits:

- It changes what the page reads, not the time itself. To test "next Monday" you still need to move the clock, which DevTools does not do.
- Your server keeps its own zone. A date that the server renders will not move.
- The Locale field overrides the locale that `Intl` formatting uses. Check what else follows it on your page: run `navigator.language` in the Console before you rely on it.

### Your operating system

To test the whole browser and every tab, change the zone on the computer. On a Mac: System Settings > General > Date & Time, turn off **Set time zone automatically using your current location**, then choose a city. Remember to turn it back on.

## Right-to-left layouts

Arabic, Hebrew, Persian and Urdu read right to left. A layout that looks right in English can put icons, margins and arrows on the wrong side.

### Flip the direction by hand

Browsers have no "emulate RTL" switch. You flip the page yourself:

1. Open DevTools and go to the Elements panel.
2. Double-click the `<html>` tag's attributes and add `dir="rtl"`.

Or in the Console:

```js
document.documentElement.dir = 'rtl';
document.documentElement.lang = 'ar';
```

The direction holds until the page reloads or your framework writes `dir` back. If your app sets `lang` and `dir` from its own locale, switch the app's locale instead, so you test the real path.

### What to check in RTL

- Spacing written with `margin-left` and `padding-right` instead of logical properties (`margin-inline-start`, `padding-inline-end`). Physical properties do not flip.
- Icons with a direction, such as arrows, "back" and "next", which should mirror. Icons like a clock or a play button should not.
- Horizontal carousels and scroll positions, which start on the right.
- Numbers, phone numbers, code and URLs inside RTL text, which stay left to right.
- Text truncation, `text-align: left` that should be `start`, and focus order.

A direction flip with English text finds most layout bugs. Real Arabic or Hebrew text also tests fonts, line height and length. A pseudo-locale, where every string is padded and accented, finds text that is not translated at all.

## The same conditions in automated tests

For tests that run on every change, set these per browser context. In Playwright:

```js
const context = await browser.newContext({
  colorScheme: 'dark',
  timezoneId: 'Asia/Tokyo',
  locale: 'ar-EG',
});
```

Playwright's docs say `locale` "emulates the browser locale" and `timezoneId` "emulates the browser timezone", not the test runner's. Playwright does not set `dir`; your app has to do that from the locale, which is what you want to test. Playwright's `page.clock` moves the time for date tests.

## Where knobs fits

The steps above are spread across the Rendering tab, a settings page, the Sensors panel and the Console. We make [knobs](/), an open source, dev-only panel inside your page that puts them in one place and keeps them across reloads.

- **Color scheme.** Light or dark, in your CSS, in `matchMedia` and in `light-dark()`, next to reduced motion, contrast and text size.
- **Locale and direction.** Any language tag with a direction. It sets `lang` and `dir` on `<html>`, patches `navigator.language`, makes the tag the default for `Intl`, and writes the tag into the stores that common i18n libraries read (paraglide, i18next, `NEXT_LOCALE`), so your app switches its own language too.
- **Time zone and clock.** Any IANA zone, and a clock you can move ahead, freeze or speed up, so "tomorrow 9 AM in Tokyo" is one search away. With "send to server" on, requests to your own origin carry the clock's time in a header your dev server can read.
- **Agents.** A coding agent can set `{ scheme: 'dark' }` or a locale through `window.knobs.setState()`, wait with `ready()`, and check the page. See [agents](/docs/agents).

It has limits: the zone and the clock live in the page, so workers and your server keep the real ones, and `forced-colors` and print still need DevTools. [Limits and FAQ](/docs/limits) lists them all. Add it with `npm i -D @vinena/knobs` and mount it in development only, see [start](/docs/start), or use the [Chrome extension](/docs/extension) on any site.

To check the same page at phone sizes, see [how to test your website on mobile devices](/blog/test-website-on-mobile-devices).

<!-- faq -->

## Sources

- Chrome for Developers: [Rendering tab overview](https://developer.chrome.com/docs/devtools/rendering), [Emulate CSS media features](https://developer.chrome.com/docs/devtools/rendering/emulate-css), [Custom locations](https://developer.chrome.com/docs/devtools/settings/locations), [Sensors](https://developer.chrome.com/docs/devtools/sensors)
- Microsoft Learn: [Emulate dark or light schemes in the rendered page](https://learn.microsoft.com/microsoft-edge/devtools-guide-chromium/accessibility/preferred-color-scheme-simulation)
- Playwright: [Emulation](https://playwright.dev/docs/emulation)
- MDN: [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme), [dir](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir)
- knobs: [knobs](/docs/knobs), [limits](/docs/limits)
