---
title: Time zone and clock
meta_title: Change the time zone and fake the date for testing
description: Change the time zone and fake the date for testing with the knobs time zone and clock knobs: any IANA zone, a jump ahead, a frozen or faster clock.
order: 6
updated: 2026-11-13
terms: change timezone chrome, fake date for testing
---

The time zone knob puts the page in another zone, and the clock knob sets the time it reads. Both replace the page's `Date`. Local getters, `getTimezoneOffset`, `toString` and `toLocale*String` use the zone, and `Date.now()` and `new Date()` read the clock. `Intl.DateTimeFormat` and `Temporal.Now`, where the browser has it, follow too.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and type a zone such as `Europe/Paris`, or a jump such as `+2d`. The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The time zone knob takes any IANA zone, `geo` to follow the zone of the geolocation city, or `system`. UTC methods, `toISOString` and `toJSON` are left alone.

The clock knob takes a jump from +1 hour to +30 days, or a date and time, in one of two modes:

- Offset: the clock runs on from the set instant, at speed 1, 60 or 3600.
- Frozen: the clock stays at the set instant.

A date built from an argument, such as `new Date(ms)` or a string, names its own instant and is left alone. A reload carries on where the clock was.

Turn on "send to server" and `fetch` and `XMLHttpRequest` calls to the page's own origin carry the clock's time, in an `x-knobs-now` header. Read it on your server behind a dev check, see [the clock and your server](/docs/knobs#the-clock-and-your-server). Never honor the header in production.

The geolocation knob sets a city and its zone together, see [fake geolocation](/use/fake-geolocation).

## Limits

Both knobs live in the page. They are not among the knobs the extension hands to Chrome, so they work the same with the extension and the npm package:

- Workers, service workers and the server keep the real zone and time, so a server rendered date can mismatch on hydration.
- The clock moves the time a page reads, not the time that passes. `setTimeout`, `setInterval`, `requestAnimationFrame` and `performance.now()` keep real time.
- Code that kept `Date` or `Date.now` from before knobs loaded reads the real time. Load the early script first, see [start](/docs/start).
- The first page load is a navigation, not a fetch, so it never carries the header.

## Drive it from an agent

A coding agent can set the knobs through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.knobs.setState({
  timeZone: 'Asia/Kathmandu',
  clock: { mode: 'frozen', at: Date.parse('2027-01-01T09:00:00Z') },
});
await window.knobs.ready();
```

`at` is epoch ms. Set `mode` and `at` in one patch, as a new mode starts from what the clock reads now. `ready()` resolves with the state once the page has caught up with the knobs. `reset()` sets the knobs back. See [agents](/docs/agents).

Next: test the page's text with [pseudolocalization](/use/pseudolocalization).
