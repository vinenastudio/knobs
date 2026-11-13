---
title: Fake geolocation
meta_title: Fake geolocation: spoof navigator.geolocation in a page
description: Spoof geolocation for a web page with the knobs geolocation knob: a city, your own coordinates or a route, plus denied, unavailable and timeout errors.
order: 3
updated: 2026-11-13
terms: spoof geolocation, geolocation spoofing
---

The geolocation knob gives the page a position of your choice. It patches `navigator.geolocation`, so `getCurrentPosition` and `watchPosition` answer with a city, your own coordinates or a route. Answers come a task later, as on a real device, and active watches hear every move of the knob.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for a city, such as "tokyo", or type a position, such as `36.9, 30.7`. The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The knob takes four kinds of value:

- A city preset.
- Custom: a latitude, a longitude and an accuracy of your own.
- A route: `lat,lng` per line, or a pasted GPX file. It plays on a loop at a set speed, with `heading` and `speed` in the coordinates and a new position for watches every second.
- `system`: the browser's real geolocation.

`maximumAge` can hand back the last position, and `timeout: 0` without one fails like a real device. `clearWatch` stops a watch.

The geo error knob next to it makes the page get an error instead of a position: `denied`, `unavailable` or `timeout`. The error reads like a `GeolocationPositionError`, with `code`, `message` and the code constants. The error works with the position on `system` too. `navigator.permissions.query({ name: "geolocation" })` reports granted, or denied for `denied`, and fires `change` when the knob moves.

The time zone knob follows the city's zone unless you set it, see [time zone and clock](/use/time-zone). Every knob is listed in [every knob](/docs/knobs).

## Limits

- The position lives in the page. The knob is not one of the knobs the extension hands to Chrome, so it works in the page with the npm package and with the extension alike.
- A `timeout` error waits for `options.timeout`, and never fires without one, like a fix that never comes.

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.devknobs.setState({ geo: { preset: 'custom', lat: 36.9, lng: 30.7 } });
await window.devknobs.ready();
```

To test a refusal, set `{ geo: { error: 'denied' } }`. Object knobs take one field at a time. `ready()` resolves with the state once the page has caught up with the knobs. `setState()` throws a `TypeError` at a value the state does not take, and then changes nothing. `reset()` sets the knobs back. See [agents](/docs/agents).

Next: run a [reduced motion test](/use/reduced-motion).
