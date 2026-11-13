---
title: RTL layout test
meta_title: RTL layout test: right to left testing in any web page
description: RTL testing for any web page with the knobs locale knob. It sets lang and dir on html and the default locale of Intl, so the layout runs right to left.
order: 8
updated: 2026-11-13
terms: rtl layout, rtl testing
---

The locale knob puts the page in another language tag and direction. It sets `lang` and `dir` on `<html>`, and puts them back if the page writes them over. It also patches `navigator.language` and makes the tag the default locale of every `Intl` service.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for "rtl". The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The knob takes any BCP 47 language tag, such as `ar` or `pt-BR`, and a direction:

- `rtl`: right to left.
- `ltr`: left to right.
- `system`: the direction comes from the tag, through `Intl.Locale` text info, with `ar`, `he`, `fa` and `ur` as the fallback.

The tag and the direction are set apart, so you can pair an English tag with `rtl` and keep text you can read.

The knob also writes the tag into the stores i18n libraries read, and reloads the page when it changes: the Paraglide cookie, Paraglide and i18next local storage, and `NEXT_LOCALE` on Next.js pages. Back to `system`, each store gets its old value, unless the page changed it since.

The knob works in the page with the npm package and with the extension alike. It is not one of the knobs the extension hands to Chrome.

Use it with the pseudo knob, which turns the page's text into accented, padded strings, see [pseudolocalization](/use/pseudolocalization). Both are listed in [every knob](/docs/knobs).

## Limits

- The knob does not translate the page. Text changes only where the page's own i18n library reads the tag.
- A call that names its own locale, such as `toLocaleString('en-US')`, keeps it.
- In fresh mode, a locale the page keeps in `localStorage` does not follow the knob, see [the panel](/docs/panel).

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.devknobs.setState({ locale: { lang: 'ar', dir: 'rtl' } });
await window.devknobs.ready();
```

A new tag can reload the page. If it does, the evaluate ends with it: wait for the load, then call `ready()` on the new page. `reset()` sets the knobs back, and can reload the page too. See [agents](/docs/agents).

Next: open the page on a phone with the [mobile simulator](/use/mobile-simulator).
