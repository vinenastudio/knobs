---
title: agents
description: Let a coding agent drive the knobs from a browser tool, wait for the page, grab what broke and fix it.
order: 7
---

## drive the knobs

a coding agent can drive the knobs through any browser tool that runs js in
the page, such as playwright's `page.evaluate` or the chrome devtools mcp's
`evaluate_script`, and fix what breaks.

- `describe()` lists every knob as json: its key, what it does, the values it
  takes, its default, and what applying it reloads: `none`, `frame` or `page`.
- `setState()` throws a `TypeError` at a knob, a field or a value the state
  does not take, and then changes nothing. `setState(getState())`
  takes the whole state back.
- `ready()` resolves with the state once the frame has caught up with the
  knobs, the frame's own devknobs is up and the panel has finished its slide.
  a page devknobs reloads for the locale knob never settles it, so ask again on
  the new page. it rejects at once when devknobs is not mounted, and past 10
  seconds, so a timeout never passes for success.
- [`grab()`](/docs/grab) takes an element, an array or a NodeList of them, and skips entries
  that are not elements, such as a `querySelector` that found nothing.
- `reset()` leaves the panel as it is: open or closed, docked or not, its
  handle shown or hidden, its dev tab icon (`devIcon`) and real phone mode (`realPhone`) as set.
- `setState({ panel: { realPhone } })` with the extension turns real phone mode for that tab alone: the setting for every tab and site is kept only from the user's own click on the panel's switch, so a page's script cannot turn it.

```js
window.devknobs.setState({ scheme: 'dark', panel: { open: false, handle: false } });
await window.devknobs.ready();
```

every way in puts the api on `window.devknobs` while devknobs is mounted: the
script tag, `mount()` and `<DevKnobs />`. so does the copy inside the width
knob's frame, so `grab` works there too. the script tag build keeps the api
after `unmount()`, so it can mount again: `ready()` tells whether it is mounted.
the [chrome extension](/docs/extension) puts the same api on `window.devknobs`
on any page it runs on.

## the agent skill

the package ships an agent skill that walks an agent through the loop: learn
the knobs, set a condition, wait, check the page, grab what is broken, fix it,
reset. it is at `node_modules/@vinena/knobs/skills/devknobs/SKILL.md`
([on GitHub](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/skills/devknobs/SKILL.md)). copy it into
the project's skills to install it, for claude code:

```sh
mkdir -p .claude/skills && cp -R node_modules/@vinena/knobs/skills/devknobs .claude/skills/
```
