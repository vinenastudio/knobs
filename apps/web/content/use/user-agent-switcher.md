---
title: User agent switcher
meta_title: User agent switcher for Chrome and your own dev app
description: A user agent switcher in the knobs panel. Pick iPhone Safari, Googlebot or a custom string, and the page's navigator reads it. The extension sends it too.
order: 2
updated: 2026-11-13
terms: user agent switcher, user agent switcher chrome
---

The user agent knob changes the browser the page thinks it runs in. It patches `userAgent`, `appVersion`, `platform`, `vendor` and `maxTouchPoints` on `Navigator.prototype`, and `navigator.userAgentData` with its brands, `mobile`, `platform` and `getHighEntropyValues`, all from the same browser.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for "user agent". The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The knob takes a preset, a custom string or `system`:

- Presets: iPhone Safari, Android Chrome, iPad Safari, Mac Safari, Mac Chrome, Windows Chrome, Windows Edge, Linux Firefox and Googlebot.
- Custom: any string. It sets `userAgent` and `appVersion` alone, as Chrome DevTools does. Platform, vendor and touch points stay the browser's.
- `system`: every property is the browser's own again.

Safari and Firefox have no `userAgentData`, so their presets take it away. The iPad preset is the one iPadOS shows sites by default, a Mac with touch points.

With the extension, the user agent you pick goes to the tab's own host, so servers see it too. A device in the frame sends none, so no site signs you out. Turn on "real phone mode" in the panel's settings to send the device's user agent with the frame's page loads, so sites serve their mobile site. Some sites may sign you out then.

A device sets the user agent to its own browser too, see [mobile simulator](/use/mobile-simulator). Every knob is listed in [every knob](/docs/knobs).

## Limits

With the npm package, the knob changes what page code reads, not what goes over the wire:

- The server still sees the real `User-Agent` header, so a mobile redirect or a bot check on the server does not follow the knob. Use the extension for that.
- The `Sec-CH-UA` client hint headers stay real.
- Workers and service workers keep the real `navigator`.
- Without a frame, code that read the user agent before the knob moved keeps what it read. Reload, or load the early script first, see [start](/docs/start).

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.knobs.setState({ ua: { preset: 'googlebot' } });
await window.knobs.ready();
```

For a string of your own, set `{ ua: { preset: 'custom', custom: 'MyBot/1.0' } }`. `ready()` resolves with the state once the page has caught up with the knobs. `setState()` throws a `TypeError` at a value the state does not take, and then changes nothing. `reset()` sets the knobs back. See [agents](/docs/agents).

Next: put the page in another city with [fake geolocation](/use/fake-geolocation).
