---
title: Pseudolocalization
meta_title: Pseudo localization for i18n testing in any web page
description: Pseudo localization for i18n testing. The knobs pseudo knob turns a page's text into accented, padded, bracketed strings and puts it back when off.
order: 7
updated: 2026-11-13
terms: pseudo localization, i18n testing
---

The pseudo knob turns the page's text into accented, padded, bracketed strings, such as `[Ŝéţţîñĝš ···]`. It rewrites the text and the `placeholder`, `title`, `aria-label` and `alt` attributes. It waits until the page is loaded and idle, so hydration never sees the change.

## Turn it on

On any site, install the knobs [Chrome extension](/docs/extension). It works in Chrome and Edge, with no change to the site's code.

In your own app, in any browser, install the package and add the mount line for development only:

```sh
npm i -D @vinena/knobs
npx @vinena/knobs init
```

The init command works in a Next or Vite project. Other setups are in [start](/docs/start). Then press `⇧K` to open the panel, press `/` and search for "pseudo". The knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## Options

The knob is on or off.

- On: the page's text and those attributes get the pseudo strings. New and changed text follows.
- Off: the original text comes back, also in nodes the page detached since.

Text the page reads back and writes again stays one layer deep.

The knob works in the page with the npm package and with the extension alike. It is not one of the knobs the extension hands to Chrome.

Use it with the locale knob, which takes any BCP 47 language tag and a direction. The locale knob sets `lang` and `dir` on `<html>` and makes the tag the default locale of every `Intl` service. Both are listed in [every knob](/docs/knobs).

## Limits

- The knob skips scripts, styles, textareas, contenteditable and options without a value. The text of those is what their form sends.
- It also changes data values, such as numbers and names. That is not a bug.

## Drive it from an agent

A coding agent can set the knob through any browser tool that runs JavaScript in the page, such as Playwright's `page.evaluate` or the Chrome DevTools MCP's `evaluate_script`:

```js
window.devknobs.setState({ pseudo: true });
await window.devknobs.ready();
```

`ready()` resolves with the state once the page has caught up with the knobs. The agent skill that ships with the package uses `{ pseudo: true }` to find text that is cut off or not translated. Then the agent can `grab()` the broken elements, fix the code and check again. `reset()` sets the knobs back. See [agents](/docs/agents).

Next: run an [RTL layout test](/use/rtl) on the same page.
