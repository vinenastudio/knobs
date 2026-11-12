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
- `edits()` gives the style and html edits made in inspect's view that are in force,
  oldest first, as json: each one's `kind` (`css-value`, `css-toggle` or
  `css-add` for styles, `css-rule` for a new rule; `text`, `attr`, `html`,
  `hide`, `delete` or `move` for the html), its `target` (the element's `selector`, its `source` file and
  line where grab finds it, and the `rule`'s `selectorText`, `sheet`,
  `owner` (the element that brought the stylesheet in), `sheetId` (tells
  two stylesheets with the same address apart), `path` and `context`, the
  `@media`, `@layer` or outer rule it sits in, left out for the element's
  own style), the `property`, and its value `before` and `after`, null where
  it is not set (`after: null` means the declaration was turned off). each
  edit is listed as made: several edits of one property come to the first
  `before` and the last `after`. put the changes in the project's own
  styles (classes, CSS modules, a stylesheet), not in inline styles. for the
  html, `property` is the attribute's name, `text` (`text 2` and on for an
  element's later texts), `html`, `hidden` or `node`; `before` and `after`
  are the text, the value or the markup, and `hide` has `after: "hidden"`.
  put those in the component or template that renders the element, as the
  framework's next render may undo an edit of the DOM. a `css-rule` is a
  rule made in the panel: `property` is `rule`, `after` its selector, and
  its `target.rule.sheet` is `new rule`; the `css-add` edits with the same
  `target.rule` are its declarations. add it where the element's styles are
  written. a `move` is an element moved in the DOM tree: `property` is
  `node`, `before` and `after` say where it stood and stands in words
  (`at the end of <ul class="menu">`, `before <li class="a"> in <ul class="menu">`),
  and `from` and `to` say it as selectors read before the move: `parent`,
  the element it is in, and `next`, the element it stands before, null at
  the end. move it in the markup the component renders.
- `setEdits(list)` makes edits again from a list in the shape `edits()`
  gives, oldest first, through the same log as the panel's: the panel lists
  them, `Z` and `undoEdit()` undo them. each is made only where its element
  is found by its `selector` (and its rule by its `selectorText`, `context`,
  `sheet` and `owner`) and the page still has the value `before`; a
  `css-rule` makes a new rule, and the edits of its declarations go to it.
  it resolves to `{ applied, skipped }`: the edits made, as `edits()` gives
  them, and each one not made as `{ edit, reason }` (`not found on the page`,
  `its rule is not on the page`, `the page has another value now`, `the page
did not take it`, `not an edit devknobs reads`). anything but a list
  throws a `TypeError`. so an agent can read `edits()`, save the list, and
  make the same edits again on a fresh load, to compare or to screenshot
  them before they are in the code. an html or attribute edit that could run
  a script, or an attribute or text edit of the page's own `<script>`,
  `<base>`, frame, `<object>`, `<embed>`, `<link>` or `<meta>`, is skipped
  with `could run a script`.
- `undoEdit()` undoes the last edit in force, as `Z` does in the panel, and
  returns it, or null with none.
- `forceState(element, states)` forces states on an element, so it renders
  as if hovered, focused or pressed, for a screenshot of that state. it takes
  the element or a selector for it, and `hover`, `focus`, `focus-visible`,
  `active` or `focus-within`, with or without the colon, and returns the
  states forced. one element at a time: forcing another, or no states, takes
  them off the first. a forced state is no edit and is not in `edits()`;
  the panel's reset and `unmount()` take it off, `reset()` leaves it. it is
  emulated, so a `:not(:hover)` rule of the page still draws (see
  [grab and inspect](/docs/grab)).
- `reset()` leaves the panel as it is: open or closed, docked or not, its
  handle shown or hidden, its dev tab icon (`devIcon`) and real phone mode (`realPhone`) as set.
- edits kept after a reload with the extension (the settings' `keep edits after reload` switch): only a change made during a user gesture is kept, so `setEdits()` and `undoEdit()` from a script change the page and the panel, and not what is kept, unless they run right after a click or a key on the page.
- `setState({ panel: { realPhone } })` with the extension: a change made during a user gesture, such as a click (the panel's switch included), is saved for every tab and site; a change a script makes without one stays in that tab, so a page's script cannot turn it for the others.

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
reset. it is at `node_modules/@vinena/knobs/skills/knobs/SKILL.md`
([on GitHub](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/skills/knobs/SKILL.md)). copy it into
the project's skills to install it, for claude code:

```sh
mkdir -p .claude/skills && cp -R node_modules/@vinena/knobs/skills/knobs .claude/skills/
```
