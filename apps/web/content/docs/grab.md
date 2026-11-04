---
title: grab and inspect
meta_title: Grab and inspect elements for a coding agent with devknobs
description: Grab any element on the page and copy its html, the components that rendered it and their source files for a coding agent, or inspect its box and css.
order: 5
updated: 2026-11-04
---

## grab

press `⇧G` (`Shift G` off a Mac), hover an element and click it. its html,
the components that rendered it and where they live go on the clipboard:

```
[<button type="button" data-testid="save">Save</button> in SaveButton (at src/App.jsx:5:5) in App (at src/App.jsx:28:7)]
```

paste that into your agent and it can find the code.

- shift and a click gather several elements, one line each.
- the arrows move to the parent, a child or a sibling. enter or `c` copies.
- escape or `⇧G` again turns grab off.

for a file, a line and a column on every component, React needs a devtools
hook from its first render: the React devtools extension, or the
[early script](/docs/start).

## change the key

```js
mount({ grabKey: 'alt+shift+g' });
```

`grab: false` leaves grab out. `grab(elements)` copies elements from code.

## coming from react-grab

devknobs has the same grab, the same line format and the same clipboard
type. remove `react-grab`, mount devknobs, and pass `grabKey: "meta+c"`
(`"ctrl+c"` off a Mac) to keep react-grab's key.

## inspect

press `⇧C` (`Shift C` off a Mac) and click an element to see its css in the
panel, as the browser's Elements panel shows it:

- the DOM tree on top, the element selected, with its breadcrumbs under it
- its box: margin, border, padding and content, with their sizes
- its styles, in `simple` mode (what applies) or `advanced` (every rule, in
  cascade order)

while you pick, the box is drawn on the page in the browser's colors, and a
card shows the color, font, contrast and spacing.

click a value to edit it, the box at a line's start turns it off and on, and
`+ add property` adds one. the changes at the foot list each edit as `-` and
`+` lines: `Z` undoes and `⇧Z` (`Shift Z` off a Mac) redoes while the focus
is in the view and not in a field (⌘Z and Ctrl Z do not), and `copy prompt
for agent` copies a prompt that asks your agent to put them in the code.

`+ new rule` adds a rule for the element, its selector from the element's
classes. the chips `:hover`, `:focus`, `:focus-visible`, `:active` and
`:focus-within` over the rules force a state: each makes the page draw the
element in that state, and the styles show the rules of that state as
applying. a forced state is no edit, and it ends when you pick another
element or close the view.

the DOM tree can be edited too: double-click a text or an attribute to edit
it, and on the selected line `a` adds an attribute, `F2` edits it as html,
`h` hides it, Delete deletes it and `⇧↑` / `⇧↓` move it among its
siblings, or use the bar under the tree. drag an element's line by its
handle, `⋮⋮`, to move it before or after another element, or into one. those
edits go into the same changes, and the prompt asks your agent to change the
component, as a re-render may undo an edit of the DOM. `<html>`, `<head>`
and `<body>` and devknobs' own nodes and attributes cannot be replaced,
hidden, deleted or moved.

the switch `keep edits after reload` at the top of the view keeps the edits
for the page: after a reload they are made again where the page still has
them, and the changes say how many came back and which could not be found.
it is off at first, and off forgets them. html and attribute edits are
never made on load: they wait in the changes until you click `apply`, as a
page script could have planted them, and one that could run a script is
never made. a page keeps its first 200 edits, up to 256 KB, for 20 pages at
most; forced states and edits in the width knob's frame are never kept. kept edits hold the page's text, attribute values and markup as
edited. with the npm package they are in the page's `localStorage`, with the
extension in its own storage.
