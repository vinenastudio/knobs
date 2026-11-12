---
title: agents
meta_title: Drive devknobs from a coding agent with Playwright or MCP
description: Let a coding agent drive devknobs from a browser tool like Playwright or the Chrome DevTools MCP: set knobs, wait for the page, grab what broke and fix it.
order: 7
updated: 2026-11-04
---

## drive the knobs

a coding agent can drive the knobs through any browser tool that runs js in
the page, such as playwright's `page.evaluate` or the chrome devtools mcp's
`evaluate_script`, and fix what breaks.

- `describe()` lists every knob as json: its key, the values it takes, its
  default, and what applying it reloads: `none`, `frame` or `page`.
- `setState()` throws a `TypeError` at a value the state does not take, and
  then changes nothing. `setState(getState())` takes the whole state back.
- `ready()` resolves with the state once the page has caught up with the
  knobs. it rejects when devknobs is not mounted, and past 10 seconds, so a
  timeout never passes for success.
- [`grab()`](/docs/grab) takes an element, an array or a NodeList of them.
- `edits()` gives the style and html edits made in inspect's view as json,
  to put in the code, a new rule (`css-rule`) and a moved element (`move`)
  included. `setEdits(list)` makes such a list again on a fresh load, where
  the page still has each edit's target and value before, and resolves to
  `{ applied, skipped }`; `undoEdit()` undoes the last one. it makes html
  and attribute edits at once, but never one that could run a script
  (`could run a script`), and after a delete, move or html edit that was not
  made, it skips every later one.
- `forceState(element, ['hover'])` makes an element render as hovered,
  focused or pressed, for a screenshot; `forceState(null)` ends it.
- `reset()` sets the knobs back and leaves the panel as it is.

```js
window.devknobs.setState({ scheme: 'dark', panel: { open: false, handle: false } });
await window.devknobs.ready();
```

every way in puts the api on `window.devknobs` while devknobs is mounted: the
script tag, `mount()` and `<DevKnobs />`. so does the copy inside the width
knob's frame, and the [chrome extension](/docs/extension) on any page it runs on.

## the agent skill

the package ships an agent skill that walks an agent through the loop: learn
the knobs, set a condition, wait, check the page, grab what is broken, fix it,
reset. it is at `node_modules/@vinena/knobs/skills/devknobs/SKILL.md`
([on GitHub](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/skills/knobs/SKILL.md)). copy it into
the project's skills to install it, for claude code:

```sh
mkdir -p .claude/skills && cp -R node_modules/@vinena/knobs/skills/devknobs .claude/skills/
```
