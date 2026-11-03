---
title: grab and inspect
description: Grab an element for a coding agent with its html, components and source places, or inspect its box and css in the panel.
order: 5
---

## grab

press `⇧G` (`Shift G` off a Mac) to grab an element for a coding agent. hover
it, click it, and its html, the components that rendered it and where they live
are on the clipboard, one line per element:

```
[<button type="button" data-testid="save">Save</button> in SaveButton (at src/App.jsx:5:5) in App (at src/App.jsx:28:7)]
```

paste that into the agent and it can find the code. the clipboard also carries
the same context as json, under `application/x-devknobs-grab` and react-grab's
own `application/x-react-grab`.

grab turns on with the press, and stays on until a copy, escape or `⇧G` again.
holding the key down does not turn it off. in a field of the page `⇧G` types a
capital and grab stays off, and in the panel's search it is grab's. a grab key
with meta, ctrl or alt, such as `alt+shift+g` or a copy shortcut like
`meta+c`, turns on once it is held for 100ms, and a quick press of a copy
shortcut is still a copy. the hold is 500ms while a field has
the focus and 700ms while text is selected, and a key that copied something
waits for the key to repeat, or to be let go after 200ms. grab then stays on
until a copy or escape. the search finds it too:
`grab` or `pick`. grab is an action, not a row: it is never
listed, and never kept, so a reload starts with it off.

while it is on:

- the element under the pointer gets a box and a label with its tag and its
  component, and the cursor is a crosshair. devknobs' own panel and frame are
  passed over, open shadow roots are reached into, and so are the children a
  hit test passes over: those that take no pointer events, or sit under a clear
  layer or a pseudo element stretched over a card.
- a click copies the element, and grab ends. the page's own click, mouse and
  pointer handlers never hear of it, and its hover handlers neither.
- shift and a click gather elements, lighter boxes, and a second one takes one
  back out. letting go of shift, or a click without it, copies them all, one
  line each.
- up goes to the parent, down back the way it came or to the first child, left
  and right (and tab, shift-tab) to the previous and the next element, siblings
  first, then the sibling of the nearest parent that has one. enter or `c`
  copies.
- a check and "Copied" show by the element for a moment, the box still on it.

the context of the element under the pointer is worked out while the pointer
rests there, so a click copies it whole, inside the click, as Safari wants.
where it is not ready yet, the click copies it without lines and columns, by
component names, and the rest is worked out for the next copy.

grab runs in the page that owns React. with the width knob's frame up, the
page above hands grab to the frame, and the box and the copy happen there.
escape in the frame ends it.

pass `grabKey: "alt+shift+g"` for another key, or `grab: false` to leave it out.
`grab(elements)` copies elements from code and resolves with the payload, its
`content` and `entries`. it comes back even when the copy fails, with `copied`
false, and is null only when the elements give nothing. the overlay and the
context load the first time grab is used.

for the full owner stack, with a file, a line and a column for each component,
React has to report to a devtools hook from its first render. the React
devtools extension has one. without it, load the [early script](/docs/start#early-script) first, which puts one in place. with neither, grab names the components it
finds on the element and falls back to a selector. the line shows a selector
only when it is built from a test id, a label, a stable id or another meaningful
attribute (href, src, role, name, title, alt); each entry's
`selector` has one for the element in any case.

the copied line keeps to the app's own code: the component the element is
written in, at the line and column of its jsx, then the components that
rendered it, three at most, with paths from the project's root. a library's
frames, React's and nameless ones stay out, a place shows once, and class
names a tool generated (StyleX, CSS modules, emotion, styled-components) are
dropped. where a dev
server's source map has no place for an element, as a route split from its
file can, the place is looked up in the source the map carries.

grab is adapted from [react-grab](https://github.com/aidenybai/react-grab) and
reads React's internals through [bippy](https://github.com/aidenybai/bippy),
both by Aiden Bai and MIT, see
[THIRD_PARTY_NOTICES.md](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/THIRD_PARTY_NOTICES.md).

## migrating from react-grab

devknobs covers it: the same grab, the same line format, the same
clipboard type. remove the `react-grab` script or package, and mount devknobs.
pass `grabKey: "meta+c"` (`"ctrl+c"` off a Mac) to keep react-grab's key.

## inspect

press `⇧C` (`Shift C` off a Mac) to see the css of an element. it picks as
grab does, with the same box, arrows and escape, and its label says `styles`
before the element. a click copies nothing: the element's styles open in the
panel, in place of the rows, and the panel grows wider for them. drag its
edge for another width.

picking is a mode, as in the browsers' own tools. a click picks the element
and ends the picking: nothing is left drawn on the page, and the page takes
clicks again. the element stays in the styles view. to pick another, press
the select button at the left of the view's bar, the dashed square with a pointer, or
`⇧C` again. the button is pressed while the picking is on, and `⇧C` while
picking stops it. escape ends the picking and keeps the element shown, the
next escape clears the filter if it has text, and the next goes back to the
rows, as the back button on top does. going back ends the picking and keeps
the element: inspect's row says its name, and opens the view on it again
without picking. with no element, the row starts the picking. `⇧E` opens the
view without picking too, on the element held, else on the page's body, and
opens the panel for it where it is closed. pressed again while the view shows,
it closes the view. the row says
`picking` while the mode is on, and `off` with nothing picked.

the view points at the page only while the pointer is on what stands for an
element: a crumb, the box's diagram, or the name in the view's head box that
element on the page, and the box goes when the pointer leaves. an element
that left the page is said so, in a line you press to pick another. with no
element the view has no bar, and its one line starts the picking. the
search finds inspect as `inspect`, `styles` or `css`, the footer has its
key, and the shortcuts in the settings set another. grab and inspect are
never on together: starting one ends the other. while grab is on `c` is
grab's copy.

while inspect is on, the element under the pointer shows its box as the
browsers' own tools draw it: the content in blue, the padding in green, the
border in yellow and the margin in orange, see-through, under the box's own
line. a negative margin makes no area on its side. an element in several
pieces, as a link over two lines is, is drawn by its bounding box, and so is
one a transform turns or scales, unless the browser has `getBoxQuads`, which
gives its own corners. an element with `display: contents` or of no size has
no box, only its label. an element the view points at is drawn the same way,
with no label. grab draws none of this.

the label by the box is a small card in inspect. its first line is the
element and its size. under it, once the pointer rests, only what applies:

- `color` and `background`, each with a swatch, as a hex or as `rgb()` with
  its alpha. where the element has no background of its own, it is the one
  that shows through from an ancestor, said quietly
- `font`: the family, then the size over the line height, the weight, and
  the letter spacing where it is not `normal`
- `contrast`: the wcag ratio of the text on its background, with a check
  where it meets level AA at the text's size and weight, or a cross
- `margin` and `padding`, top, right, bottom, left, where any side has some

the color, the font and the contrast are for an element with text of its
own. what the `font` row can know: it is the first family of the computed
`font-family` that `document.fonts.check` says is there, or the first
generic one such as `sans-serif`. for a web font the answer is exact: it is
there once it has loaded. for a family the page did not load, most browsers answer yes whether
the system has it or not, so the row trusts the name. and no browser tells
a page which font a glyph really fell back to, so text that mixes scripts
may be drawn in more fonts than the one named. the background is the
`background-color` only: an image or a gradient behind the text is not seen,
and the contrast is then against the color under it.

the styles start with the element's box, under `box`, which folds away
and stays the way you leave it: the margin, the border, the padding and the
content one inside the other, each with the length of its four sides in css
px, a dash for 0, the content with its width by its height, and around them
the offsets of a positioned element. the pointer on the box draws the
element's on the page, and on one area that one alone. where the panel is too narrow for the
lengths, they leave the areas, and those of the area the pointer or the
focus is on stand in a line under them. under that are the element's
`box-sizing` and `display`, and its `position` where it is not `static`. the
box is read again with the styles, and when the element changes size.

the view has two modes, set by the control beside the filter, and the one
you pick is kept. `simple`, the one it starts in, lists only the styles that
apply to the element, by what they do, with what it inherits folded under
them, and after a value that reads a custom property what it comes to.
`advanced` shows, in the order the cascade settles them:

- the element's `style` attribute, as `element.style`
- every rule that reaches it, the strongest first, with the selectors of a
  list that do not match muted, the `@layer`, `@media`, `@supports` and
  `@container` it sits in above it, and the stylesheet's file after it
- declarations another one overrides, struck through
- the rules of its `::before` and `::after`
- what each ancestor hands down, under `inherited from` and its name

a color has a swatch before it. in both modes a property's name has a color
of its own, the one the names in a request's headers and a cookie's fields
have, and every custom property a value reads through `var()` is a piece you
can rest the pointer on or reach with the tab key, as is the name of a
`--custom` declaration: the tooltip says what the element sees for it right
then, with a swatch for a color and under it the selector that sets it, or
`not set` and what its fallback comes to. in `advanced` a click on one goes to
the block that sets it, and no click copies. the crumbs under the tree are the element's ancestors, each a
click away, and the filter keeps the declarations that have its text in
their name or value. the view reads the styles again when the element or an
ancestor changes, when a stylesheet in the head does, when the window is
resized and when a knob moves. with the width knob's frame up, inspect picks
in the frame and the styles show in the panel. what a knob of devknobs
writes on `<html>`, the root size of the text size knob and the
`color-scheme` of the scheme knob, is left out.

### the elements tree

the view is laid out as the browsers' own Elements panel: the DOM tree on
top, the element's breadcrumbs under it, and the styles under those. the
tree is the page's document, or the frame's page with the width knob's frame
up, from `<!DOCTYPE html>` and `<html>` down, with the element picked
selected and every node on the way to it open. each line is a node as the
Elements panel writes it: `<tag attr="value">` in its colors, a triangle on
what opens, `<tag>…</tag>` for one that is closed, an element's one short
text inside its line, other text in quotes, `<!-- comments -->`,
`#shadow-root (open)` for an open shadow root, and `::marker`, `::before`
and `::after` where they have content. an open element ends on a line of its
own, `</tag>`. long values and texts are cut short with `…`. past 500
children a line says `Show all nodes (N more)`. devknobs' own nodes, its
panel, boxes, frame and styles, are never in it.

the pointer on a line boxes its element on the page, margin and padding as
the picking draws them. a click selects a line and the styles follow it, and
a pick on the page or a crumb selects its element in the tree. the arrows
move as in the Elements panel: up and down a line, right opens a line or goes
into it, left closes it or goes to its parent, Home and End to the ends. the
selected line ends with `== $0`, and `$0` on the page's window is that node
while the view is open, unless the page has a `$0` of its own. its `copy`,
or cmd or ctrl and c in the tree, copies the node's outer html, as Copy
element does. the tree follows the page as it changes, and a node that
changed lights for a moment. drag the tree's bottom corner for more or less
of it.

### edit the html

the tree can be edited as in the browsers' own tools, and each edit goes on
the page at once, into the same changes as the style edits:

- a double-click on a line's text, or ↩ on its line, makes the text a
  field. ↩ puts it on the page and esc leaves it. only that text changes:
  the element's other children stay. an empty text is refused
- a double-click on an attribute makes it a field with `name="value"`, as in
  the tag, a `"` in the value written `&quot;` and a `&` as `&amp;`. change
  the value or the name, write several `name="value"` pairs in one field, or
  clear the field to take the attribute out. `class` is edited like any
  other attribute
- a text or a value with line breaks, as in a `<pre>` or an svg path, opens
  in a field that keeps them, where ↩ breaks the line, and `⇧↩`
  (`Shift Enter` off a Mac) or its `apply` button puts it on the page
- `a` on the selected line adds an attribute, in a field before the tag's end
- `F2` edits the element as html: a field with its outer html, where ↩
  breaks the line. `⇧↩` (`Shift Enter` off a Mac), its `apply` button, or a
  click elsewhere puts the new html in the element's place and selects it;
  esc leaves it. html with no element in it, or with devknobs' own
  `data-devknobs` attributes, is refused: applying it with `⇧↩` or the
  button turns the field red and keeps it open, while a click elsewhere
  closes it without the edit. undo puts the very element back, unless the
  page moved the new nodes since
- `h` hides the selected element and all in it, and shows it again:
  `visibility: hidden` through an attribute of devknobs', so the page's own
  `style` stays as it is. its line goes faint
- Delete or Backspace deletes the selected node, and the line after it is
  selected. undo puts it back where it stood

a field closed as it was opened makes no edit, and one whose edit is refused
stays open, red, until it is fixed, left with esc or the focus leaves it,
and no key or button of the tree acts while it is open. `<html>`, `<head>`, `<body>` and an element that holds devknobs'
own nodes are not edited as html, hidden or deleted, and a text straight in
a shadow root or the document is not edited.

the keys are plain and act only on the selected line, never while a field
has the focus. the bar under the tree has the same actions for the selected
line: `edit text`, `+ attribute`, `edit as html`, `hide` (or `show`) and
`delete`, and the line's `copy` copies its markup. it works the same on the
width knob's frame. an edit of the html is made on the live DOM: where the
page's framework renders again and changes or replaces the node, the edit
stays in the list as text, and undo then only takes it out.

### edit the styles

the styles can be edited in place, as in the browsers' own tools, in both
modes, and each edit goes on the page at once:

- a click on a value makes it a field. a click elsewhere puts its value on
  the page too, and that click still does what it does, as opening another
  value or turning a line off. enter puts the new value on the page,
  escape leaves it as it was, and tab puts it on and goes to the next value,
  shift and tab to the one before. a value the page does not take turns red
  and stays open. `!important` at its end is kept
- the box at a line's start, shown with the pointer on the line, turns the
  declaration off and on. a line that is off stays where it stood, struck
  through, and goes back there when it is turned on
- `+ add property` under `element.style` and under each rule takes a name,
  then a value. `element.style` shows even with no `style` attribute, so a
  property can be added to the element itself. in `simple` mode the line is
  under the list and adds to the element's own style

the changes at the foot of the view count the edits and list them as diff
lines, `-` the value before and `+` the value after, under the rule, what
it sits in (`@media`, `@layer`, the rule a nested `&` is in) and its
stylesheet, or `style=""` and the element for its own style. an element's
html edits are under `html of` and its selector: `- text: "Start now"`,
`+ class: "cta cta-lg"`, the markup an element had and has, `+ hidden`, and
the markup of a node deleted.
several edits of one property come to one change, and one that went back to
where it started to none. `Z` undoes the last edit and `⇧Z` (`Shift Z` off
a Mac) does it again, while the focus is in the view and not in a field. `copy prompt for
agent` copies a prompt that asks a coding agent to put the edits in the
code: each element's selector, its file and line where grab finds them, the
rule and its stylesheet, and each property from its value before to its
value after, and for the html each text, attribute and markup from before
to after, a hide and a delete. with html edits it ends by asking the agent
to change the component or template that renders the element, not the DOM,
as the framework's next render may undo an edit of the DOM. `copy diff` copies the diff lines alone, and `undo all` takes
every edit back. reset in the footer undoes the edits with the knobs, and so
does `unmount()`; `devknobs.reset()` leaves them. an edit whose page goes, as
a frame's reloads, stays in the list as text, and undo then only takes it
out. `window.devknobs.edits()` gives the edits in force as json
(see [agents](/docs/agents)). the edits are not kept: a reload of the page
loses them.

### what inspect cannot show

- the rules of a stylesheet from another origin. the page may not read them,
  so the view says `rules hidden` with the file's name and guesses nothing,
  and its tooltip says they cannot be edited
- the browser's own default styles, which cannot be edited either
- a forced state such as `:hover`: a rule shows while it applies
- a rule in a `@container` it could not confirm is marked `container`, and
  may not apply
- an edit made through the CSSOM alone, or to a stylesheet outside the head,
  may show late
- a closed shadow root, a frame's document inside the tree, and a
  `<template>`'s content

the tree has no line numbers, no node is dragged yet, and there is no right
click menu: the bar under the tree holds the actions.
