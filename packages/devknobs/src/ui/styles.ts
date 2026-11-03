/**
 * The panel's whole stylesheet. It lives inside the shadow root, so page css
 * cannot reach it and none of it reaches the page. `all: initial` on the
 * wrapper stops inherited page styles too, and `direction` is set by hand
 * because `all` leaves it alone and the locale knob flips it on `<html>`.
 *
 * Pointer events are off everywhere and turned back on one surface at a time,
 * so the panel only ever catches a click where the user can see it.
 *
 * The prefers queries here read what the browser really prefers: devknobs
 * rewrites the page's stylesheets, never this one, so the panel keeps the
 * user's own scheme and motion whatever the knobs emulate.
 *
 * Nested rounded boxes are concentric: a box's radius is its parent's less the
 * space between them. The panel is 13 with 1 of border and 4 of padding, so
 * the rows, results, add knob button and search are 8; an open row pads its
 * editor by 4, so controls are 4, and what sits 2 inside a control is 2.
 *
 * The panel lives on the right edge of the window, and `data-side="left"` on
 * the wrapper mirrors it onto the left: the handle on the panel's other side,
 * the borders, the radii and the slide.
 *
 * The panel is as wide as `--panel-width` on the wrapper says, which the
 * panel sets for what it shows and the strip on its page side changes. The
 * host is that wide and the handle more from the moment the width is set, and
 * the wrapper packs the two against the window's edge, so a panel on its way
 * to a new width keeps to the edge.
 *
 * The side on the window's edge has no border and no radius. A drag that
 * carries the panel off its edge sets `data-float`, which draws that side like
 * the others, and the padding there gives the border its pixel, so the box is
 * one size whatever shows. It eases back flush with the glide, and the border
 * goes only once it is clear: a clear border with a width still cuts the ends
 * of the lines it meets.
 *
 * Pinned, `data-dock="true"`, the panel is a column from the window's top to
 * its bottom, square, with one hairline on the page's side, as wide as the
 * panel is. Its rules come last, over the floating ones. Its slide is not the
 * stylesheet's: the panel draws the column each frame, and the handle after.
 *
 * Every line of the panel stands on one set of columns, the `--col-` tokens
 * on the wrapper, and nothing else says where a line starts or ends. A box
 * with a ground, a row, a field, a block of code, goes edge to edge. What is
 * read in it, an icon or a word, starts at `--view-start` and ends
 * `--view-end` short of the far edge. `data-layout` on a view sets where
 * that start is: both `rows` and `flush` are the panel's inset, with no
 * column kept for a knob row's grip, which stands over the row's icon. What folds out under a row sits a
 * row's pad inside it, and brings the start in by as much, so its words are
 * still at the inset. A head, a row and every piece of the kit read the two
 * properties, so a view's head starts where its content does whatever the
 * view holds.
 */
import { boxTint } from "../grab/colors";
import { HOLD } from "./hold";

export const CSS = `
.wrap {
  all: initial;
  direction: ltr;
  /* The host box stays the size of an open panel however far the wrapper is
     translated, so nothing in here takes a pointer by default. The reset above
     puts pointer-events back to auto, which is why the wrapper says it again. */
  pointer-events: none;
  color-scheme: light dark;
  --bg: #fbfbf9;
  --fg: #1b1b19;
  --faint: #73736d;
  --line: #e6e6e0;
  --card: #f1f1ec;
  --track: #e6e6e0;
  --raised: #ffffff;
  --lift: 0 1px 2px rgb(0 0 0 / 0.1);
  --hot: #e5484d;
  --ok: #18794e;
  --key: #1a65ad;
  --req-moved: #9e5c00;
  --req-get: #0b6fc6;
  --req-post: #6550b9;
  --req-put: #bd4800;
  --req-patch: #007f6d;
  --req-delete: #ce2c31;
  --req-image: #2a7e3b;
  --req-font: #c2298a;
  --req-media: #00749e;
  /* Code as the browsers' tools color it, each 4.5:1 on the ground and on a card. */
  --code-key: #881280;
  --code-str: #c41a16;
  --code-num: #1a1aa6;
  --code-kw: #0d22aa;
  --code-attr: #994500;
  --code-com: #236e25;
  /* An attribute's value in the DOM tree, and the ground of its selected line. */
  --code-val: #1a1aa6;
  --pick: #e4ecf8;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --edge: 0px;
  --edge-line: transparent;
  --glide: 220ms;
  --panel-width: 240px;
  /* The columns: what a row keeps clear inside its edges, an icon's width,
     the room between an icon and its word, and how far in a line of words
     starts and ends. */
  --col-pad: 4px;
  --col-icon: 14px;
  --col-gap: 8px;
  --col-inset: 10px;
  /* How far in a level of a tree is from the one over it: an icon and the
     gap, so a node's chevron stands under the icon of the node it is in. */
  --col-step: calc(var(--col-icon) + var(--col-gap));
  --view-end: var(--col-inset);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  /* Closed, the wrapper slides out by the panel less the pixel the handle
     sits over it, which leaves the handle on the edge. */
  transform: translateX(calc(var(--panel-width) - 1px));
  /* The open and close slide is the transform. A drag moves the wrapper by
     translate, one to one, and lets it glide to its place from there. A glide
     takes --glide, which the panel sets longer for a long way, and the edge
     eases back flush in the same time. */
  transition: transform 150ms ease-out, translate var(--glide) ease-out;
}
@media (prefers-color-scheme: dark) {
  .wrap {
    --bg: #151513;
    --fg: #e9e9e3;
    --faint: #8c8c85;
    --line: #2b2b28;
    --card: #1f1f1c;
    --track: #0f0f0e;
    --raised: #383833;
    --lift: none;
    --hot: #ff6369;
    --ok: #3dd68c;
    --key: #8cbcec;
    --req-moved: #f1a10d;
    --req-get: #70b8ff;
    --req-post: #baa7ff;
    --req-put: #ff977d;
    --req-patch: #0bd8b6;
    --req-delete: #ff9592;
    --req-image: #71d083;
    --req-font: #ff8dcc;
    --req-media: #4ccce6;
    --code-key: #5db0d7;
    --code-str: #f29766;
    --code-num: #9980ff;
    --code-kw: #c58af9;
    --code-attr: #9bbbdc;
    --code-com: #8fbf8f;
    --code-val: #f29766;
    --pick: #1e2a38;
  }
}
.wrap[data-side="left"] {
  flex-direction: row-reverse;
  transform: translateX(calc(1px - var(--panel-width)));
}
/* With the handle hidden, a closed panel slides all the way off its edge,
   handle and all, and once there nothing of it paints or takes a pointer. The
   panel key brings it back, and an open panel shows its handle as ever. */
.wrap[data-handle="hidden"][data-open="false"] {
  visibility: hidden;
  transform: translateX(100%);
  transition: transform 150ms ease-out, translate var(--glide) ease-out,
    visibility 0s linear 150ms;
}
.wrap[data-handle="hidden"][data-open="false"][data-side="left"] { transform: translateX(-100%); }
.wrap[data-handle="hidden"][data-open="false"] .handle { pointer-events: none; }
.wrap[data-open="true"] { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) {
  .wrap, .wrap *, .wrap *::before, .wrap *::after {
    transition: none !important;
    animation: none !important;
  }
}
.wrap [hidden] { display: none !important; }
/* Where a view's lines start, by the layout it names. */
[data-layout="rows"] { --view-start: var(--col-inset); }
[data-layout="flush"] { --view-start: var(--col-inset); }

button, input, textarea {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  margin: 0;
  font: inherit;
  color: inherit;
}
button {
  padding: 0;
  text-align: inherit;
  white-space: nowrap;
  background: none;
  border: 0;
  cursor: pointer;
}
:focus { outline: none; }
button:focus-visible { outline: 1px solid var(--faint); outline-offset: -1px; }

.handle {
  flex: none;
  box-sizing: border-box;
  /* Sits a pixel over the panel and above it, so the handle's own background
     hides the panel's border on that side and the two read as one outline. */
  position: relative;
  z-index: 1;
  width: 22px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: -1px;
  letter-spacing: 0.06em;
  text-align: center;
  writing-mode: vertical-rl;
  color: var(--faint);
  background: var(--bg);
  border: 1px solid var(--line);
  border-right: 0 solid var(--edge-line);
  border-radius: 8px var(--edge) var(--edge) 8px;
  /* The one thing a closed panel shows, so the one thing it can be clicked on. */
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.handle:hover { color: var(--fg); }
.handle:focus-visible { outline-offset: 2px; }
.wrap[data-drag="panel"] .handle { cursor: grabbing; }
.wrap[data-drag="handle"] .handle { cursor: ns-resize; }
.wrap[data-side="left"] .handle {
  margin-right: 0;
  margin-left: -1px;
  border-right: 1px solid var(--line);
  border-left: 0 solid var(--edge-line);
  border-radius: var(--edge) 8px 8px var(--edge);
}
/* A closed panel shows the handle alone, so off the edge the handle is what
   floats. Open, its edge side is the panel's and stays as it is. The border
   there comes at once and goes when its color has eased out, and the padding
   on the other side keeps the label in the middle. */
.wrap[data-open="false"] .handle {
  transition: border-top-right-radius var(--glide) ease-out,
    border-bottom-right-radius var(--glide) ease-out, border-right-color var(--glide) ease-out,
    border-right-width 0s linear var(--glide), padding-left 0s linear var(--glide);
}
.wrap[data-open="false"][data-side="left"] .handle {
  transition-property: border-top-left-radius, border-bottom-left-radius, border-left-color,
    border-left-width, padding-right;
}
.wrap[data-float="true"][data-open="false"] .handle {
  --edge: 8px;
  --edge-line: var(--line);
  padding-left: 1px;
  border-right-width: 1px;
  transition-delay: 0s;
}
.wrap[data-float="true"][data-open="false"][data-side="left"] .handle {
  padding: 0 1px 0 0;
  border-left-width: 1px;
}

.panel {
  flex: none;
  box-sizing: border-box;
  /* The strip that changes the width is placed in it. */
  position: relative;
  width: var(--panel-width);
  display: flex;
  flex-direction: column;
  /* All the height there is, less the gap the panel keeps top and bottom, and
     no taller than a list is worth. What is past it scrolls inside. */
  max-height: min(672px, calc(100vh - 16px));
  max-height: min(672px, calc(100dvh - 16px));
  padding: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-right: 0 solid var(--edge-line);
  border-radius: 13px var(--edge) var(--edge) 13px;
  /* Closed, the wrapper slides out only as far as the handle's width, and the
     handle overlaps the panel by a pixel, so the panel's border by the handle
     would stay on the window's edge as a line the panel's height. It hides
     once the slide is over. The edge side's border and the padding that pays
     for it go once its color has eased out. The width glides to a new one, as
     a view comes or goes, and the panel turns that off under the strip. */
  visibility: hidden;
  transition: visibility 0s linear 150ms, border-top-right-radius var(--glide) ease-out,
    border-bottom-right-radius var(--glide) ease-out, border-right-color var(--glide) ease-out,
    border-right-width 0s linear var(--glide), padding-right 0s linear var(--glide),
    width var(--glide) ease-out;
}
/* Only a panel that is out catches anything. The attribute flips the moment
   the close starts, so the slide back leaves nothing hit-testable behind. */
.wrap[data-open="true"] .panel {
  pointer-events: auto;
  visibility: visible;
  transition-delay: 0s, 0s, 0s, 0s, var(--glide), var(--glide), 0s;
}
/* The handle covers one of these corners, so square that one off. It goes by
   the tab alone, not by data-open: the open flag flips the moment a close
   starts, while the panel shows until the slide is over. A panel the handle
   meets in the middle keeps both radii. The left side's own radii come after
   the right side's corners here, so those never square its edge side. */
.wrap[data-tab="top"] .panel { border-top-left-radius: 0; }
.wrap[data-tab="bottom"] .panel { border-bottom-left-radius: 0; }
.wrap[data-side="left"] .panel {
  border-right: 1px solid var(--line);
  border-left: 0 solid var(--edge-line);
  border-radius: var(--edge) 13px 13px var(--edge);
  transition-property: visibility, border-top-left-radius, border-bottom-left-radius,
    border-left-color, border-left-width, padding-left, width;
}
.wrap[data-side="left"][data-tab="top"] .panel { border-top-right-radius: 0; }
.wrap[data-side="left"][data-tab="bottom"] .panel { border-bottom-right-radius: 0; }
/* Off the edge the border comes at once. A panel that closes there still
   hides only once its slide is over. */
.wrap[data-float="true"] .panel {
  --edge: 13px;
  --edge-line: var(--line);
  padding-right: 3px;
  border-right-width: 1px;
  transition-delay: 0s;
}
.wrap[data-float="true"][data-side="left"] .panel {
  padding: 4px 4px 4px 3px;
  border-left-width: 1px;
}
.wrap[data-float="true"][data-open="false"] .panel {
  transition-delay: 150ms, 0s, 0s, 0s, 0s, 0s, 0s;
}

/* The search opens where the add knob button was, and is as tall as a row. */
.head {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--col-gap);
  height: 26px;
  padding: 0 var(--view-end) 0 var(--view-start);
  background: var(--card);
  border-radius: 8px;
  cursor: text;
}
.head:focus-within { box-shadow: inset 0 0 0 1px var(--line); }
.search { flex: 1; min-width: 0; padding: 0; background: transparent; border: 0; }
.search::placeholder { color: var(--faint); }
/* 4 in from the search's edges, so 4 round. */
.search-close {
  flex: none;
  width: 22px;
  height: 22px;
  margin-right: calc(var(--col-pad) - var(--view-end));
  display: grid;
  place-items: center;
  color: var(--faint);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.search-close:hover { color: var(--fg); background: var(--track); }

/* Its plus and label line up with the rows' icons and names. */
.add {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--col-gap);
  height: 26px;
  padding: 0 var(--view-end) 0 var(--view-start);
  color: var(--faint);
  border-radius: 8px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.add:hover { color: var(--fg); background: var(--card); }
/* Icons sit in the middle of a line whose text sits on its baseline. Beside a
   row's or a result's name they stay faint, so the words are read first. */
.glyph { flex: none; align-self: center; }
.main .glyph, .entry .glyph { color: var(--faint); }
.entry .glyph { margin-right: 2px; }

/* The rows on top, then the add knob button, or the search in its place with
   its results under it. The rows and the results each scroll in their own
   room, so the results never cover the rows. The settings and a feature's
   view take the place of all of it. */
.body, .home {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* The settings push in from the right and push the rows out to the left, the
   two moving together by the body's width and the 4px out to the border, so
   the view that leaves is clipped away whole by the time it is taken out.
   They pop back the same way, with the curve and the time of an iOS sheet. A
   view coming in starts from where it rests while it is away, and one turned
   round on its way goes back from where it is. The body eases between the
   heights of the two and clips what is past it, out to the panel's border
   across. The view that leaves is taken out of the
   flow and the panel holds it at the height it had, and the settings ride
   above the rows. Reduced motion swaps them at once, as the panel finds no
   time on them. A feature's view sits between the two: it pushes the rows
   out as the settings do, and the settings push it out in turn. data-slide
   names the view the slide left, so a view the settings leave comes back in
   from the left. It may shrink while it slides, so it is measured at the
   height the panel leaves it and grows with the body. */
.body[data-slide] {
  clip-path: inset(0 -4px);
  transition: height 500ms cubic-bezier(0.32, 0.72, 0, 1);
}
.body[data-slide] > .pane {
  flex: none;
  transition: transform 500ms cubic-bezier(0.32, 0.72, 0, 1);
}
.body[data-slide] > .keys { position: relative; z-index: 1; background: var(--bg); }
.body[data-slide] > .view {
  position: relative;
  z-index: 1;
  flex: 0 1 auto;
  background: var(--bg);
}
.body[data-slide] > .pane.leaving { position: absolute; top: 0; left: 0; width: 100%; }
.wrap[data-mode="keys"] .body[data-slide] > .home { transform: translateX(calc(-100% - 4px)); }
.wrap[data-mode="view"] .body[data-slide] > .home { transform: translateX(calc(-100% - 4px)); }
.wrap[data-mode="keys"] .body[data-slide] > .view { transform: translateX(calc(-100% - 4px)); }
.wrap:not([data-mode="keys"]) .body[data-slide] > .keys { transform: translateX(calc(100% + 4px)); }
.wrap:not([data-mode="keys"], [data-mode="view"]) .body[data-slide] > .view {
  transform: translateX(calc(100% + 4px));
}
@starting-style {
  .wrap[data-mode="keys"] .body[data-slide] > .keys { transform: translateX(calc(100% + 4px)); }
  .wrap:not([data-mode="keys"]) .body[data-slide] > .home { transform: translateX(calc(-100% - 4px)); }
  .wrap[data-mode="view"] .body[data-slide] > .view { transform: translateX(calc(100% + 4px)); }
  .wrap[data-mode="view"] .body[data-slide="keys"] > .view {
    transform: translateX(calc(-100% - 4px));
  }
}
.rows, .results {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
/* While the search is open the rows keep their height up to two fifths of the
   tallest panel, and scroll past it, so the results have the rest. */
.wrap:is([data-mode="results"], [data-mode="browse"]) .rows {
  flex-shrink: 0;
  max-height: calc(min(672px, 100vh - 16px) * 0.4);
  max-height: calc(min(672px, 100dvh - 16px) * 0.4);
}
/* The rows view stays as it was while the settings or a view show, so it
   leaves and comes back as it is. */
.wrap:not([data-mode="results"], [data-mode="browse"]) .results,
.wrap:not([data-mode="results"], [data-mode="browse"]) .head,
.wrap:is([data-mode="results"], [data-mode="browse"]) .add,
.wrap:is([data-mode="results"], [data-mode="browse"]) .home > .empty,
.wrap[data-mode="keys"] .home:not(.leaving),
.wrap[data-mode="view"] .home:not(.leaving),
.wrap:not([data-mode="keys"]) .keys:not(.leaving),
.wrap:not([data-mode="view"]) .view:not(.leaving) { display: none; }
.empty { padding: 4px var(--view-end) 4px var(--view-start); color: var(--faint); }
/* An empty line that is a button: the same line, a row wide, so 8 round, on
   the rows' ground under the pointer. */
.empty-action {
  display: block;
  width: 100%;
  text-align: left;
  white-space: normal;
  border-radius: 8px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.empty-action:hover { color: var(--fg); background: var(--card); }
/* Heard, not seen. */
.said {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; align-content: start; }
.row { position: relative; border-radius: 8px; transition: background-color 120ms ease-out; }
.row:hover, .row.open { background: var(--card); }
/* The grip stands over the row's icon, where the row's content starts, and
   takes no room of its own. It is the one rule that says where it stands. */
.lead {
  position: absolute;
  top: 4px;
  left: var(--view-start);
  width: var(--col-icon);
  height: 18px;
  display: grid;
  place-items: center;
  color: var(--faint);
  border-radius: 4px;
}
/* The grip shows only while the pointer is over its row, or the row is
   dragged, or the grip has the keys' focus, in place of the icon under it,
   so nothing moves on hover. */
.grip {
  z-index: 1;
  opacity: 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: opacity 120ms ease-out, color 120ms ease-out;
}
.grip:hover { color: var(--fg); }
@media (hover: hover) {
  .row:hover .grip { opacity: 1; }
  .row:hover > .line > .grip:not([hidden]) + .main > .glyph { opacity: 0; }
}
.row.lifted .grip, .grip:focus-visible { opacity: 1; }
.line > .grip + .main > .glyph { transition: opacity 120ms ease-out; }
.row:is(.lifted, :has(> .line > .grip:focus-visible)) > .line > .grip:not([hidden]) + .main > .glyph { opacity: 0; }
/* While a row is dragged the others make way for it, and it rides above them. */
.rows.reordering .row { transition: transform 150ms ease-out, background-color 120ms ease-out; }
.rows.reordering .row.lifted {
  z-index: 2;
  background: var(--card);
  box-shadow: var(--lift);
  transition: none;
}
.rows.reordering .grip { cursor: grabbing; }
.line { display: flex; align-items: center; }
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--col-gap);
  padding: 4px var(--view-end) 4px var(--view-start);
  border-radius: 8px;
}
/* A title too long for its row is cut short, in the head of a view as in a row. */
.row-label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--faint);
}
.row-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
/* A row kept in the list with its knobs back at their defaults. */
.row-value.idle { color: var(--faint); }
.row-value.hot { color: var(--hot); }
/* The small icon button a row ends with: a row's x, and an action in the
   head of a view. Half the pad in from the row's edges, 2, so 6 round. */
.row-button {
  flex: none;
  width: 22px;
  height: 22px;
  margin: calc(var(--col-pad) / 2);
  display: grid;
  place-items: center;
  color: var(--faint);
  border-radius: 6px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.row-button:hover { color: var(--fg); background: var(--track); }
/* One that is a toggle, while it is on. */
.row-button[aria-pressed="true"] { color: var(--fg); }
/* A button with a hold, as a row's x: no menu or selection on a long touch,
   and a fill from its leading edge while the hold runs. With reduced motion
   the fill is there at once, and the hold still counts. */
.hold {
  position: relative;
  isolation: isolate;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.hold.holding { color: var(--hot); }
.hold.holding::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: color-mix(in srgb, var(--hot) 16%, transparent);
  animation: hold-fill ${HOLD}ms linear;
}
/* A clip, not a scale: a scaled fill squeezes its corners and spills past the
   button's round ones. */
@keyframes hold-fill {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0); }
}

/* An open row's editor folds out under its line and pushes the rows below it
   down. The fold eases between none and all of the editor's height, and clips
   what is past it without scrolling, so a control focused while it folds out
   never shifts the editor. The track's floor of 0 lets it close past the
   editor's padding, which a bare 0fr keeps open. */
.fold {
  display: grid;
  grid-template-rows: minmax(0, 0fr);
  overflow: clip;
  transition: grid-template-rows 180ms ease-out;
}
.row.open > .fold { grid-template-rows: minmax(0, 1fr); }
/* A fold whose body is very tall goes at once, see kit.ts. */
.row.still > .fold { transition: none; }
/* The editor and a view's stack sit a row's pad inside it, and what is read
   in them starts and ends that much less far in, at the inset still. */
.editor, .stack {
  --view-start: calc(var(--col-inset) - var(--col-pad));
  --view-end: calc(var(--col-inset) - var(--col-pad));
}
.editor {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 2px var(--col-pad) 6px;
  animation: editor-in 140ms ease-out;
}
@keyframes editor-in {
  from { opacity: 0; transform: translateY(-2px); }
}
.knob { display: grid; grid-template-columns: minmax(0, 1fr); gap: 3px; }
.knob-label { padding: 0 var(--view-end) 0 var(--view-start); font-size: 11px; color: var(--faint); }
.knob-switch { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.knob-switch .switch { margin-right: 2px; }

.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--track);
  border-radius: 4px;
}
.seg-item {
  flex: 1 1 auto;
  min-width: 0;
  padding: 1px 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  color: var(--faint);
  border-radius: 2px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.seg-item:hover { color: var(--fg); }
/* What is on has a ground of its own: a segment, and a bar's toggle. */
.seg-item.on, .tool[aria-pressed="true"] { color: var(--fg); background: var(--raised); box-shadow: var(--lift); }

.swatches { display: flex; flex-wrap: wrap; gap: 8px; padding: 3px 5px; }
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--card), 0 0 0 3px transparent;
  transition: box-shadow 120ms ease-out;
}
.swatch:hover { box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--faint); }
.swatch.on { box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--fg); }
.swatch:focus-visible { outline-offset: 4px; }
/* Colors of the user's own stand after a knob's own, each with an x on its
   corner that shows with the pointer or the focus on it, then a plus the
   size of a swatch. The x stands after its swatch in the track and lies over
   its corner, its margins taking back the room and the gap it would take. The browser's color input lies unseen under the plus, so
   its picker opens there, and the field for a color typed out shows under
   the swatches while one is being added. A color it cannot read shakes it
   and turns it red, as a key a shortcut cannot take does. */
.colors { display: grid; grid-template-columns: minmax(0, 1fr); gap: 3px; }
.swatch-plus { position: relative; display: flex; }
.swatch-x {
  position: relative;
  flex: none;
  align-self: flex-start;
  width: 12px;
  height: 12px;
  margin: -5px -5px 0 -15px;
  display: grid;
  place-items: center;
  color: var(--faint);
  background: var(--raised);
  border-radius: 50%;
  box-shadow: var(--lift);
  opacity: 0;
  /* Unseen, it is hidden too, so it takes no press meant for the swatch under it. */
  visibility: hidden;
  transition: opacity 120ms ease-out, color 120ms ease-out, visibility 0s linear 120ms;
}
.swatch-own:hover + .swatch-x, .swatch-own:focus + .swatch-x, .swatch-x:hover {
  opacity: 1;
  visibility: visible;
  transition: opacity 120ms ease-out, color 120ms ease-out;
}
.swatch-x:hover { color: var(--fg); }
.swatch-add {
  display: grid;
  place-items: center;
  color: var(--faint);
  background: var(--track);
  transition: box-shadow 120ms ease-out, color 120ms ease-out;
}
.swatch-add:hover { color: var(--fg); }
.swatch-pick {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}

.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
  height: 22px;
  padding: 0 6px;
  line-height: 22px;
  color: var(--faint);
  background: var(--track);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.chip:hover { color: var(--fg); }
.chip.on { color: var(--fg); background: var(--raised); box-shadow: var(--lift); }

.switch {
  position: relative;
  width: 28px;
  height: 16px;
  background: var(--track);
  border-radius: 8px;
  transition: background-color 140ms ease-out;
}
.switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: var(--raised);
  border-radius: 6px;
  box-shadow: var(--lift);
  transition: transform 140ms ease-out, background-color 140ms ease-out;
}
.switch.on { background: var(--fg); }
.switch.on::after { background: var(--bg); transform: translateX(12px); }

.field {
  height: 22px;
  padding: 0 6px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 4px;
}
.field::placeholder { color: var(--faint); }
.field:focus { border-color: var(--faint); }
.field::-webkit-outer-spin-button,
.field::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.chip-field { width: 48px; padding: 0 6px; border: 0; background: var(--track); }
.chip-field.on { background: var(--raised); box-shadow: var(--lift); }
.chip-field:focus { box-shadow: inset 0 0 0 1px var(--faint); }
.fields { display: flex; align-items: center; gap: 4px; }
/* A device's size and fold, set apart from the list over it. */
.knob-list > .extra-device { margin-top: 5px; }
.fields .field-num { flex: 1; min-width: 0; }
.field-clock { width: 100%; }
.field-route { width: 100%; height: 44px; padding: 3px 6px; resize: vertical; }
.field-ua { width: 100%; height: 56px; padding: 3px 6px; resize: vertical; }
.unit { flex: none; font-size: 11px; color: var(--faint); }
/* The fold slider, experimental: a thumb on a track as far along as the hinge
   is open, a tick under where it lands a third of the way. The thumb eases to
   a stop once let go, and follows the pointer while held, and the hinge
   while the knobs fold it. */
.fold-slider {
  position: relative;
  height: 22px;
  background: var(--track);
  border-radius: 4px;
  cursor: grab;
  touch-action: none;
}
.fold-slider:focus-visible { outline: 1px solid var(--faint); outline-offset: -1px; }
.fold-tick {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: calc(16px + (100% - 32px) * 0.333);
  width: 1px;
  background: var(--faint);
  opacity: 0.5;
}
.fold-thumb {
  position: absolute;
  top: 2px;
  left: calc(2px + (100% - 32px) * var(--at, 0));
  width: 28px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg);
  background: var(--raised);
  border-radius: 2px;
  box-shadow: var(--lift);
  transition: left 200ms ease-out;
}
.fold-slider.held { cursor: grabbing; }
.fold-slider.held .fold-thumb,
.fold-slider.following .fold-thumb { transition: none; }
.extra { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.note { padding: 0 var(--view-end) 0 var(--view-start); font-size: 10.5px; line-height: 1.4; color: var(--faint); }

.list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.items {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  /* Items clip their text, which would let the rows shrink to fit the box. */
  grid-auto-rows: max-content;
  max-height: 136px;
  overflow-y: auto;
  padding: 2px;
  background: var(--bg);
  border-radius: 4px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px 1px 4px;
  overflow: hidden;
  color: var(--faint);
  border-radius: 2px;
}
/* The check that marks the value that is on, faint as a result's is. */
.item::before {
  content: "";
  flex: none;
  display: inline-block;
  width: 3px;
  height: 7px;
  margin: 0 4px 2px 3px;
  border: solid transparent;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
.item:hover, .item.cursor { color: var(--fg); background: var(--card); }
.item.on { color: var(--fg); }
.item.on::before { border-color: var(--faint); }

.results { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px var(--view-end) 4px var(--view-start);
  white-space: nowrap;
  border-radius: 8px;
  cursor: pointer;
}
.entry.cursor { background: var(--card); }
.entry-knob { flex: none; color: var(--faint); }
/* Past the entry's padding to the right edge the rows' x ends on. */
.entry .entry-check { margin: 0 calc(var(--col-pad) / 2 - var(--view-end)) 0 auto; }
.entry-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.entry-name { flex: none; }
.entry-now {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
  color: var(--faint);
}
/* A small quiet label over a run of lines: the search's results, a list's
   options, a group of a view's content. One rule, so it starts where the
   lines under it do, and is cut short where it has no room. */
.group-label {
  flex: 1;
  min-width: 0;
  padding: 8px var(--view-end) 2px var(--view-start);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--faint);
}
.group-label:first-child { padding-top: 2px; }

.foot {
  flex: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 4px;
  padding: 6px 6px 2px;
  border-top: 1px solid var(--line);
}
.badge { color: var(--faint); }
.badge.hot { color: var(--hot); }
/* Says fresh mode is on, as quiet as the key hints under it. */
.fresh-note { font-size: 10px; line-height: 1.4; color: var(--faint); }
/* Which copy runs the panel, as quiet. */
.runtime { font-size: 10px; line-height: 1.4; color: var(--faint); font-variant-numeric: tabular-nums; }
/* The key hints, each a button for what its key does. Where they leave no
   room, the line wraps. */
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--faint);
}
/* A key and its word. Only the key is a box. */
.hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  border-radius: 4px;
  transition: color 120ms ease-out;
}
.hint:hover { color: var(--fg); }
.hint:focus-visible { outline-offset: 2px; }
.hint:disabled { cursor: default; opacity: 0.5; }
.hint:disabled:hover { color: inherit; }
/* The pin and the way into the settings, at the end of the last line, and
   before them the two controls of a pinned panel. */
.pin-toggle, .flip-toggle { margin-left: auto; }
.flip-toggle:not([hidden]) ~ .pin-toggle { margin-left: 0; }
.keys-toggle[aria-pressed="true"], .pin-toggle[aria-pressed="true"] { color: var(--fg); }
/* The tooltip of an icon-only control, set over it by the panel. */
.tip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  box-sizing: border-box;
  padding: 3px 8px;
  white-space: nowrap;
  color: var(--fg);
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 6px;
  box-shadow: var(--lift);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease-out;
}
.tip.on { opacity: 1; }
.tip.hot { color: var(--hot); }
/* A tooltip of more than one line: each on its own, and one said quietly. */
.tip-line { display: block; }
.tip-quiet { color: var(--faint); }
.hint-key {
  box-sizing: border-box;
  min-width: 14px;
  padding: 0 3px;
  font: inherit;
  color: inherit;
  text-align: center;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 4px;
}
/* A binding with no key shows its word alone. */
.hint-key:empty { display: none; }

/* The settings, in place of the rows: the head every view has on top, then
   each a row as the knob rows are, as their layout, rows, says. Nothing here pads
   the head or a row: both are the shared ones. A row has no x after it, so
   the handle's main ends with a switch, and a shortcut's with its key as a
   button that records a new one, an x before it that puts it back. A key it
   cannot take shakes the key and turns it red for a moment; reduced motion
   keeps only the red. */
.keys { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
/* A title over a run of rows, over where their content starts. */
.rows-label { padding: 8px var(--view-end) 2px var(--view-start); font-size: 10.5px; color: var(--faint); }
/* A line under a setting's row, where its words start, past its icon. */
.row-hint { padding: 0 var(--view-end) 4px calc(var(--view-start) + var(--col-step)); font-size: 10.5px; color: var(--faint); }
/* An action's key, at the end of its row, as quiet as the footer shows a key. */
.row-key { flex: none; align-self: center; font-size: 10px; line-height: 1.4; color: var(--faint); }
.row-control { flex: none; align-self: center; margin-left: auto; }
/* A row's small button inside its main, before what the main ends with,
   takes no height of its own, so the row is as tall as any. */
.main > .row-button { align-self: center; margin: -2px 0 -2px auto; }
.main > .row-button:not([hidden]) + .row-control { margin-left: 0; }
/* Segments at a row's end, as the settings' choice of who runs the panel, take no more height than its title. */
.main > .seg.row-control { margin-top: -3px; margin-bottom: -3px; }
/* The panel's icons face the side the panel is on. */
.wrap[data-side="left"] .glyph.sided { transform: scaleX(-1); }
.key-set {
  flex: none;
  box-sizing: border-box;
  min-width: 26px;
  height: 18px;
  /* The line sits a little above the middle, so the text looks centered: a
     key's capitals, and while it records the lowercase by their x-height. */
  padding: 0 6px 1px;
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  border: 1px solid var(--line);
  border-radius: 4px;
  transition: border-color 120ms ease-out, color 120ms ease-out, background-color 120ms ease-out;
}
.key-set:hover { border-color: var(--faint); }
.key-set.recording {
  padding-bottom: 3px;
  line-height: 13px;
  color: var(--faint);
  border-color: var(--faint);
}
.key-set.refused, .field.refused {
  color: var(--hot);
  background: color-mix(in srgb, var(--hot) 8%, transparent);
  border-color: var(--hot);
  animation: key-shake 320ms ease-out;
}
@keyframes key-shake {
  15% { transform: translateX(-4px); }
  35% { transform: translateX(4px); }
  55% { transform: translateX(-2.5px); }
  75% { transform: translateX(1.5px); }
  90% { transform: translateX(-0.5px); }
}

/* A feature's view, in place of the rows as the settings are: the way back
   on top, a row built and styled as every row is, its chevron where the
   view's lines start, with the view's title and then its actions, each the
   button a row's x is. Nothing here says how the
   head is padded, edged or rounded: it differs from a row only by what is in
   its slots, and starts where the view's layout says. Its body under that scrolls on its own. The view asks for the panel's tallest and the panel's
   own limit shrinks it to what the window has, so the panel is as tall as it
   gets whatever the view holds. The body is a container, so what a view
   holds can lay itself out by how wide the view is. A view takes the
   window's whole height, past the limit a list keeps. */
.wrap[data-mode="view"] .panel {
  max-height: calc(100vh - 16px);
  max-height: calc(100dvh - 16px);
}
.view {
  flex: 0 1 auto;
  min-height: 0;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.view-head { flex: none; }
.view-actions { flex: none; display: flex; }
.view-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  container: view / inline-size;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

/* What a view builds its chrome from, see kit.ts. The bar stays over what
   scrolls under it, flush with the rows' edges, and holds a filter, which
   takes the room, and segments, which keep theirs, after a toggle where it
   starts with one. Where the panel is narrow
   the filter has a line of its own. It never moves, so the browser does not
   hold the scroll by it. */
.toolbar {
  overflow-anchor: none;
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding-bottom: 4px;
  background: var(--bg);
}
.toolbar > .filter { flex: 1 1 96px; min-width: 0; }
.toolbar > .seg { flex: none; max-width: 100%; }
/* The small icon button a bar starts with, a toggle: its icon stands where
   the view's lines start, with the pad clear on each side of it, so 4 round
   as the filter beside it is. */
.tool {
  flex: none;
  width: calc(var(--col-icon) + var(--col-pad) * 2);
  height: 22px;
  margin-left: calc(var(--view-start) - var(--col-pad));
  display: grid;
  place-items: center;
  color: var(--faint);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.tool:hover { color: var(--fg); }
.tool[aria-pressed="false"]:hover { background: var(--track); }
/* A bar's own controls have a line to themselves, under its filter. */
.toolbar > .chips { flex: 1 1 100%; }
/* A line of a table: its name in the type code is read in, then its value on
   one line, cut where it is long and quiet, then what the line ends with.
   Where a value follows, the name has a column every line of the table has,
   a share of the line with a floor and a ceiling, so names and values line
   up down the list. A quiet name is told by its fainter text alone. */
.cell-name { font: 11px/1.5 var(--mono); color: var(--fg); }
.cell-name.columned { flex: 0 0 clamp(72px, 38%, 200px); }
.cell-name.quiet { color: var(--faint); }
.cell-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 11px/1.5 var(--mono);
  color: var(--faint);
}
.cell-end { flex: none; margin-left: auto; font-size: 10px; color: var(--faint); }
/* A line's number, on a narrow column of its own before the name, two icons
   wide in a head as in a line, whatever type each is set in. */
.cell-index {
  flex: none;
  width: calc(var(--col-icon) * 2);
  overflow: hidden;
  font: 11px/1.5 var(--mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--faint);
}
/* The head of a table: a line laid out as a row's is, with the room of a
   row's chevron left empty, so each of its words stands over its column. The
   words are small and quiet, and nothing is drawn around or under them. */
.cells-head {
  display: flex;
  align-items: baseline;
  gap: var(--col-gap);
  padding: 2px var(--view-end) 2px var(--view-start);
  font-size: 10.5px;
  color: var(--faint);
}
.cells-head > span { font: inherit; color: inherit; }
.cell-lead { flex: none; width: var(--col-icon); }
/* What a node of a tree holds: its own nodes and lines, a step in, so each
   starts under the icon of the node it is in. A node in there is on
   its tree's ground already: it takes none of its own while folded out, and
   a step darker under the pointer. */
.branch {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1px;
  padding-left: var(--col-step);
}
.branch .row.open { background: none; }
.branch .row:hover { background: var(--track); }
/* A note that is a control: a line wide, with room over and under it to
   press, and in the text's color under the pointer. */
.note-button { display: block; width: 100%; padding-top: 4px; padding-bottom: 4px; transition: color 120ms ease-out; }
.note-button:hover { color: var(--fg); }
/* A section of a view that folds, a row as the rows are: its chevron where
   a row's icon is, to the side while folded and down while out. */
.turn { flex: none; align-self: center; display: grid; }
.turn .glyph { transform: rotate(180deg); transition: transform 120ms ease-out; }
.row.open > .line .turn .glyph { transform: rotate(270deg); }
.fold-body { min-height: 0; }
/* A group of a view's content under a small quiet label, with no fold. Its
   first line is the label, where all of a view's text starts, and the small
   controls for what it holds at its far end, as tall as the line. */
.group { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; }
.group-head { display: flex; align-items: center; gap: 4px; min-height: 22px; }
.group-head > .row-button { margin-top: 0; margin-bottom: 0; }
/* Names and their values in two columns, in mono, the names a key's color. Both wrap
   anywhere and can be selected. Where the view is under 290 wide, a panel of
   300, a name stands over its value. */
.pairs {
  display: grid;
  grid-template-columns: fit-content(45%) minmax(0, 1fr);
  gap: 2px 12px;
  margin: 0;
  padding: 0 var(--view-end) 0 var(--view-start);
  font-family: var(--mono);
  font-size: 11px;
  overflow-wrap: anywhere;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}
.pair-name { color: var(--key); }
.pair-value { margin: 0; }
@container view (max-width: 290px) {
  .pairs { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .pair-value { margin-bottom: 4px; }
}
/* A block of text as it was written, in mono on the rows' ground. It wraps,
   and with wrapping off it scrolls in itself, so its view never scrolls
   sideways. A row wide, so 8 round, its text where a view's starts. */
.code { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: start; gap: 4px; }
.code-text {
  justify-self: stretch;
  margin: 0;
  padding: 6px var(--view-end) 6px var(--view-start);
  font-family: var(--mono);
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 2;
  background: var(--card);
  border-radius: 8px;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}
.code-text.nowrap {
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
/* A row of tabs, as the browsers' tools have them over a request: words
   alone, quiet, and the one that is on in the text's color on a card. A bar
   wider than the view scrolls sideways, with no bar of its own. */
.tabs {
  flex: 1 1 100%;
  min-width: 0;
  display: flex;
  gap: 2px;
  padding: 0 var(--view-end) 0 calc(var(--view-start) - var(--col-pad));
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: none;
  height: 22px;
  padding: 0 var(--col-pad);
  line-height: 22px;
  color: var(--faint);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.tab:hover { color: var(--fg); }
.tab.on { color: var(--fg); background: var(--card); }
/* A section under a head that opens and closes it: a triangle where the
   view's lines start, the label in the text's color, a quiet count, and small
   controls in words at the far end. What it holds stands under the label. */
.sect { display: grid; grid-template-columns: minmax(0, 1fr); }
/* Where the head has no room for its controls, they go under it, at the end. */
.sect-top { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 2px; min-height: 24px; padding-right: calc(var(--view-end) - var(--col-pad)); }
.sect-head {
  flex: 1 0 auto;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: var(--col-gap);
  min-height: 24px;
  padding-left: var(--view-start);
  overflow: hidden;
  font-size: 11.5px;
  color: var(--fg);
}
.sect-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sect-count { flex: none; color: var(--faint); }
.sect-turn { flex: none; width: var(--col-icon); display: grid; place-items: center; color: var(--faint); }
.sect-turn .glyph { transform: rotate(180deg); transition: transform 120ms ease-out; }
[aria-expanded="true"] > .sect-turn .glyph { transform: rotate(270deg); }
.sect-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 0 0 6px var(--col-step); }
.act {
  flex: none;
  height: 20px;
  padding: 0 var(--col-pad);
  font-size: 10.5px;
  line-height: 20px;
  color: var(--faint);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.act:hover { color: var(--fg); }
.act.on { color: var(--fg); background: var(--card); }
/* Text as the browsers' tools show a response: a line a row, its number in
   a gutter as wide as the longest, on the panel's ground. A long line wraps
   and goes on a little in from where it starts, never back at the edge. */
.src {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 10px;
  padding: 0 var(--view-end) 0 var(--view-start);
  font: 11px/1.6 var(--mono);
  tab-size: 2;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}
.src-line { display: contents; }
.src-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--faint); user-select: none; -webkit-user-select: none; }
.src-text { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--fg); }
.tok-key, .tok-tag { color: var(--code-key); }
.tok-str { color: var(--code-str); }
.tok-num { color: var(--code-num); }
.tok-kw { color: var(--code-kw); }
.tok-attr { color: var(--code-attr); }
.tok-com { color: var(--code-com); }
.tok-val { color: var(--code-val); }
.tok-text { color: var(--fg); }
.tok-doc { color: var(--faint); }
/* Json as a tree: a node a line that opens to what it holds, a step in. */
.json { padding: 0 var(--view-end) 0 var(--view-start); font: 11px/1.6 var(--mono); overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
.json-head { display: flex; align-items: baseline; width: 100%; white-space: pre; text-align: left; }
.json-head > .sect-turn { align-self: center; }
.json-preview { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); }
.json-kids { padding-left: var(--col-icon); }
/* A long value wraps two steps in from where its line starts, as the browsers' preview has it. */
.json-leaf { padding-left: calc(var(--col-icon) + 2ch); text-indent: -2ch; }
/* What folds out under a view's row, one thing under another, padded as a
   row's editor is: 4 in from the row's edges, so what it holds is 4 round. */
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 2px var(--col-pad) 6px; }
/* In a stack a block of code stands on a row: on the panel's ground and 4
   round, with less over and under it. It stops growing where it would crowd
   the view, and scrolls from there. */
.stack .code-text {
  max-height: 240px;
  padding-top: 3px;
  padding-bottom: 3px;
  overflow-y: auto;
  background: var(--bg);
  border-radius: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.field-line { width: 100%; }
/* A text box, in the type code is read in. It stops growing where it would
   crowd the view, and scrolls from there. */
.field-area {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: auto;
  max-height: 240px;
  padding: 3px 6px;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-y: auto;
  resize: vertical;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.ask { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }

/* The strip that changes the panel's width, as the edge of a docked devtools
   does: it lies across the border on the panel's page side, as tall as the
   panel, and shows a hairline on that border under the pointer, the keys'
   focus or a drag, clear of the round corners. The handle rides above it
   where the two meet. */
.sizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 7px;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.wrap[data-side="left"] .sizer { right: -4px; left: auto; }
.sizer::after {
  content: "";
  position: absolute;
  top: 13px;
  bottom: 13px;
  left: 3px;
  width: 1px;
  background: var(--faint);
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.sizer:hover::after,
.sizer:focus-visible::after,
.wrap[data-sizing="true"] .sizer::after { opacity: 1; }

/* The styles view: its bar, its filter, the control of its two modes, the
   fold of what is inherited and its empty lines are the kit's, and what is
   here is its own content. The crumbs head it, the bar stays on top, and the
   blocks scroll under it, one for each rule. The panel is 13 with 1 of border
   and 4 of padding, so a block is 8. What is css is set in mono, a size under
   the rows, and every word about it in the panel's own face, as quiet as a
   label. The panel is as wide as its edge is dragged to, so nothing here has
   a width of its own: a line wraps, and a name that must stay on one line is
   cut short. */
/* Inspect's view as the Elements panel: the DOM tree over the styles, the
   crumbs between them. The tree scrolls in itself, a share of the window's
   height, and its bottom edge drags for another. A line is a node, a step in
   for each level, and wraps where it is long, but never narrower than 30
   characters: past that the tree is wider than its box and scrolls sideways,
   as deep lines do in the browser's tools. The selected line has a ground of
   its own, a blue one while the tree has the focus, and ends with a quiet
   reference to it. A node that changed lights for a moment. */
/* The tree takes what the styles leave of the view, and keeps the height its
   edge was dragged to once it was. */
.elements { display: flex; flex-direction: column; min-height: 100%; gap: 4px; }
.elements > * { min-width: 0; }
.dom {
  position: relative;
  flex: 1 0 auto;
  height: 40vh;
  min-height: 96px;
  max-height: 85vh;
  overflow: auto;
  resize: vertical;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.dom[style*="height"] { flex-grow: 0; }
.dom-tree { width: min-content; min-width: 100%; font: 11px/1.6 var(--mono); }
.dom-row {
  display: flex;
  align-items: flex-start;
  padding-right: var(--view-end);
  cursor: default;
  user-select: text;
  -webkit-user-select: text;
}
.dom-row:hover { background: var(--card); }
.dom-row.on { background: var(--card); }
.dom-tree:focus-within .dom-row.on { background: var(--pick); }
.dom-row > .sect-turn { height: 1.6em; cursor: pointer; }
.dom-code { flex: 0 1 auto; min-width: 30ch; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--fg); }
.dom-ref { white-space: pre; color: var(--faint); }
.dom-code > .act { margin-left: var(--col-pad); height: 1.6em; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6em; vertical-align: top; }
/* A line whose element the panel hid, faint as its box on the page is gone. */
.dom-hid > .dom-code { opacity: 0.5; }
.dom-code > .dom-html { display: block; width: 100%; min-width: 30ch; resize: vertical; white-space: pre; }
.dom-code > .dom-apply { margin: 4px 0 2px; }
/* The selected line's actions, kept in sight at the foot of the tree as it scrolls either way. */
.dom-acts {
  position: sticky;
  left: 0;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px var(--view-end) 4px var(--view-start);
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.dom-flash { animation: dom-flash 900ms ease-out; }
@keyframes dom-flash {
  from { background: var(--pick); }
  to { background: transparent; }
}
.styles { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
/* One line, which scrolls sideways with no bar, and shows its end. */
.crumbs {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 0 var(--view-end) 0 var(--view-start);
  overflow-x: auto;
  scrollbar-width: none;
  font-size: 11px;
  color: var(--faint);
}
.crumb { flex: none; border-radius: 4px; transition: color 120ms ease-out; }
.crumb:hover, .crumb[aria-current] { color: var(--fg); }
.crumb-sep { flex: none; opacity: 0.6; }
.css-blocks { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
/* Clear of the bar that stays on top, when a block is scrolled to. */
.css-block {
  padding: 6px var(--view-end) 6px var(--view-start);
  background: var(--card);
  border-radius: 8px;
  scroll-margin-top: 32px;
}
.css-block.flash { animation: css-flash 900ms ease-out; }
@keyframes css-flash {
  from { background: var(--track); }
  to { background: var(--card); }
}
.css-context, .css-selector, .css-decl {
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
}
.css-context { color: var(--faint); }
/* The selector, then where the rule is from at the line's end: its mark and
   its file. Where the panel is too narrow for both, that goes under the
   selector, still at the end, and the file's name is cut short at the
   block's width. */
.css-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; }
.css-selector { flex: 1 1 14ch; min-width: 0; }
.css-part.off { color: var(--faint); }
.css-from {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 10.5px;
  color: var(--faint);
}
.css-mark { flex: none; }
.css-source {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A declaration that wraps goes on further in than it starts. */
.css-decl { display: block; padding-left: 24px; text-indent: -12px; text-decoration: none; }
/* A name has the color of a key, its value the text's, and the marks between
   them are quiet. A declaration that is struck through is quiet all over. */
.css-name { color: var(--key); }
.css-punct { color: var(--faint); }
s.css-decl, s.css-decl .css-var, s.css-decl .css-name { color: var(--faint); text-decoration: line-through; }
.css-swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 4px;
  vertical-align: -1px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px var(--line);
}
/* A custom property's name, which says what the element sees for it. It has
   no line at rest, and one under it while the pointer or the focus is on it. */
.css-var {
  display: inline;
  white-space: normal;
  text-indent: 0;
  text-underline-offset: 2px;
  border-radius: 2px;
}
.css-var:hover, .css-var:focus-visible { text-decoration: underline dotted; }
.css-group {
  justify-self: start;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 6px var(--view-end) 0 var(--view-start);
  font-size: 10.5px;
  color: var(--faint);
  border-radius: 4px;
  transition: color 120ms ease-out;
}
.css-group:hover { color: var(--fg); }
/* The simple mode: what applies as one list, with no selector to stand
   under, so a line starts at the box's edge and wraps further in. A group's
   name is a label of the panel's, and what a custom property comes to is as
   quiet. */
.css-applied {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  padding-right: var(--view-end);
  padding-left: var(--view-start);
}
.css-applied .css-decl { padding-left: 12px; }
.css-label { font-size: 10.5px; color: var(--faint); }
.css-comes { color: var(--faint); }
.css-hidden { padding: 2px var(--view-end) 2px var(--view-start); font-size: 10.5px; color: var(--faint); overflow-wrap: anywhere; }
/* Editing, as in the browsers' tools: a box at a line's start turns it off
   and on, shown on hover, on focus and on a line that is off, filled while
   the line is on. A value is a
   field on a click, as wide as what it holds, on the track's fill, its text
   red where the page did not take it. Adding a property is a quiet line
   under a block, in from its edge as a declaration's first line is. */
.css-decl.can-edit { position: relative; }
.css-applied .css-decl.can-edit { padding-left: 24px; }
.css-toggle {
  position: absolute;
  top: 3px;
  left: 0;
  width: 11px;
  height: 11px;
  opacity: 0;
  background: var(--track);
  border-radius: 2px;
  cursor: pointer;
  transition: opacity 120ms ease-out;
}
.css-toggle:checked { background: var(--faint); }
.css-decl.can-edit:hover > .css-toggle, .css-toggle:focus-visible, .css-decl.off > .css-toggle { opacity: 1; }
.css-editable { border-radius: 2px; cursor: text; }
.css-editable:hover, .css-editable:focus-visible { background: var(--track); }
.css-edit {
  max-width: 100%;
  padding: 0;
  font: inherit;
  text-indent: 0;
  color: var(--fg);
  background: var(--track);
  border-radius: 2px;
}
.css-edit.bad { color: var(--hot); }
/* The field's ring, as a chip's field has it while focused, in place of the browser's border. */
.inline-field { border: 0; box-shadow: inset 0 0 0 1px var(--faint); }
.css-add, .css-adding { padding-left: 12px; }
.css-add {
  display: block;
  font: 11px/1.5 var(--mono);
  color: var(--faint);
  border-radius: 2px;
  transition: color 120ms ease-out;
}
.css-add:hover { color: var(--fg); }
.css-adding { text-indent: 0; }

/* The changes at the foot of the Elements view, which stay in sight while
   the styles scroll: a quiet head, each edit as diff lines tinted for what
   went and what came, then the buttons, the prompt the filled one. */
.changes {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  padding: 8px var(--view-end) 8px var(--view-start);
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.changes-head, .changes-note { font-size: 10.5px; color: var(--faint); }
.changes-list {
  max-height: 30vh;
  overflow: auto;
  font: 11px/1.5 var(--mono);
  overflow-wrap: anywhere;
  scrollbar-width: thin;
}
.diff-place { padding: 4px var(--col-pad) 0; color: var(--faint); }
.diff-place:first-child { padding-top: 0; }
.diff-del, .diff-add { padding: 0 var(--col-pad); border-radius: 2px; }
.diff-del { background: color-mix(in srgb, var(--hot) 14%, transparent); }
.diff-add { background: color-mix(in srgb, var(--ok) 14%, transparent); }
.changes-acts { display: flex; flex-wrap: wrap; gap: 4px; }
.chip.changes-go, .chip.changes-go:hover { color: var(--bg); background: var(--fg); }

/* The element's box, in a fold of the kit's: a picture of the element, so
   its areas are filled, each in the hue the page's own tint of it has, mixed
   into the panel's ground. The margin is a block as the css blocks are, 8,
   and the areas in it go down the scale, 4 and 2. An area is a grid of three
   by three: a length on each side, the next area in the middle, its name in
   the corner. A narrow one drops the lengths, and the line under it says
   those of the area the pointer or the focus is on. */
.box-model { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 2px 0 6px; }
.bm-ring {
  display: grid;
  grid-template-columns: minmax(22px, auto) minmax(0, 1fr) minmax(22px, auto);
  grid-template-rows: minmax(18px, auto) auto minmax(18px, auto);
  align-items: center;
  justify-items: center;
  min-width: 0;
}
.bm-ring:focus-visible { outline: 1px solid var(--faint); outline-offset: -1px; }
.bm-ring > .bm-ring { grid-area: 2 / 2; justify-self: stretch; }
.bm-name { grid-area: 1 / 1 / 2 / 3; justify-self: start; padding-left: 6px; font-size: 10px; color: var(--faint); }
.bm-v, .bm-content, .bm-values, .bm-fact {
  font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bm-v { padding: 0 4px; }
.bm-top { grid-area: 1 / 2; }
.bm-left { grid-area: 2 / 1; }
.bm-right { grid-area: 2 / 3; }
.bm-bottom { grid-area: 3 / 2; }
.bm-margin { background: ${boxTint("margin", 30, "var(--bg)")}; border-radius: 8px; }
.bm-border { background: ${boxTint("border", 30, "var(--bg)")}; border-radius: 4px; }
.bm-padding { background: ${boxTint("padding", 30, "var(--bg)")}; border-radius: 2px; }
.bm-content {
  display: block;
  padding: 4px 6px;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  background: ${boxTint("content", 30, "var(--bg)")};
}
/* The offsets of an element that has none: nothing but the box in them. */
.bm-position.off { display: block; }
.bm-position.off > .bm-name, .bm-position.off > .bm-v { display: none; }
.box-model.narrow .bm-ring {
  grid-template-columns: 8px minmax(0, 1fr) 8px;
  grid-template-rows: minmax(16px, auto) auto 8px;
}
.box-model.narrow .bm-v { display: none; }
.bm-line { display: none; align-items: baseline; gap: 8px; padding: 0 var(--view-end) 0 var(--view-start); }
.box-model.narrow .bm-line { display: flex; }
.bm-line .bm-name { padding: 0; }
.bm-values { white-space: pre; }
.bm-facts { display: flex; flex-wrap: wrap; gap: 0 12px; padding: 0 var(--view-end) 0 var(--view-start); color: var(--faint); }

/* The requests view, in the panel. Its bar, its rows and its
   empty line are the kit's, and what is here is only what stands in them: the
   count at the bar's far end, and the cells of a row. A row a request, built
   as the panel's rows are: the method, or the kind's mark, where a row's icon
   is, the name where its label is, then the status and the time. The panel is
   as wide as the user drags it, 240 to 720, and only the name gives way or
   takes the room: the method, the status and the time each keep their width,
   so the columns line up down the list, and no row wraps.
   New rows go in at the top, and the view moves the scroll for them itself,
   so the browser's own scroll anchoring is off here: one of the two only.
   Color is in the text and the marks alone: a method in its own tone, a kind
   as a mark in the method's place, a status green in the 200s, amber in the
   300s and hot from 400 up. Nothing is drawn around or behind any of them. */
.req-count {
  flex: none;
  min-width: 20px;
  margin-left: auto;
  padding-right: var(--view-end);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--faint);
}
.req-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; overflow-anchor: none; }
.req-method { flex: none; width: 36px; overflow: hidden; font-size: 10.5px; color: var(--faint); }
/* A mark sits mid row, where the text of the row is laid out by its baseline. */
.req-method.mark { display: flex; align-self: center; }
/* A mark keeps its kind's tone, where a row's icon is faint. */
.req-method .glyph { color: inherit; }
.req-get { color: var(--req-get); }
.req-post { color: var(--req-post); }
.req-put { color: var(--req-put); }
.req-patch { color: var(--req-patch); }
.req-delete { color: var(--req-delete); }
.req-rest { color: var(--faint); }
.req-image { color: var(--req-image); }
.req-font { color: var(--req-font); }
.req-media { color: var(--req-media); }
/* The name is the row's label, in the text's own color and in mono, with all the room the row has left. */
.req-name { flex: 1; min-width: 0; display: flex; font-family: var(--mono); font-size: 11px; color: inherit; }
.req-path { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* The query keeps its whole width while that leaves the path 64, and half the name's room at least. */
.req-query {
  flex: none;
  max-width: max(50%, calc(100% - 64px));
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--faint);
}
.req-status { flex: none; width: 44px; font-variant-numeric: tabular-nums; text-align: right; }
.req-time {
  flex: none;
  width: 40px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--faint);
}
/* What the page loads on its own, of which the browser tells less, is a step quieter. */
.req-row.light { color: var(--faint); }

/* One request in full, under the head that is its way back. Its summary and
   its tabs are in the kit's bar, so they stay while the rest scrolls, and
   its sections, lists, code and bar are the kit's. What is here is only the
   cells of the summary, of the Status Code and of a stack's frames. Everything starts where
   the kit's lists do. The path is the main thing: it has the room, breaks
   anywhere and keeps to two lines, cut in its middle by the view. */
.req-detail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.req-detail > .note { padding-top: 4px; padding-bottom: 4px; }
.req-sum { flex: 1 1 100%; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 2px var(--view-end) 2px var(--view-start); }
.req-first, .req-second { display: flex; align-items: baseline; gap: 8px; }
.req-verb { flex: none; font-size: 10.5px; }
.req-verb.mark { display: flex; align-self: flex-start; align-items: center; height: 18px; }
.req-url {
  flex: 1;
  min-width: 0;
  max-height: 36px;
  overflow: hidden;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 18px;
  white-space: normal;
  word-break: break-all;
}
.req-stat { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.req-status.ok, .req-stat.ok { color: var(--ok); }
.req-status.moved, .req-stat.moved { color: var(--req-moved); }
.req-status.hot, .req-stat.hot { color: var(--hot); }
.req-status.idle, .req-stat.idle { color: var(--faint); }
.req-took { flex: none; font-variant-numeric: tabular-nums; color: var(--faint); }
.req-host {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 11px;
  text-align: right;
  color: var(--faint);
}
.req-body, .req-response { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
/* The Status Code: a dot in the status's tone, a mark in its text, then the code in the text's color. */
.req-code { display: inline-flex; align-items: baseline; gap: 6px; }
.req-dot { font-size: 9px; }
/* The browsers' warning over Request Headers, its mark amber. */
.req-warn { display: flex; gap: 6px; padding: 0 var(--view-end) 0 var(--view-start); font-size: 11px; }
.req-warn-mark { color: var(--req-moved); }
/* A frame a line: the function in the text's color, then where it is, quiet, which a press copies. */
.req-stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 0 var(--view-end) 0 var(--view-start); font-family: var(--mono); font-size: 11px; }
.req-frame { display: flex; align-items: baseline; gap: 8px; }
.req-fn { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.req-where { flex: 0 1 auto; min-width: 32px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; color: var(--faint); text-decoration: underline; text-underline-offset: 2px; }
/* Preview: an image as itself on a card, its size under it, and html drawn in a frame on white, as a page is. */
.req-shot { display: grid; justify-items: start; gap: 4px; padding: 0 var(--view-end) 0 var(--view-start); }
.req-picture { display: block; max-width: 100%; max-height: 320px; object-fit: contain; background: var(--card); border-radius: 4px; }
.req-natural { font-family: var(--mono); font-size: 11px; font-variant-numeric: tabular-nums; }
.req-html { all: unset; display: block; width: 100%; height: 320px; background: #ffffff; border-radius: 8px; color-scheme: light; }
/* The initiator chain: an address a line, each a step in from what loaded it, the request itself in the text's color. */
.req-chain { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 0 var(--view-end) 0 var(--view-start); font-family: var(--mono); font-size: 11px; overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
.req-link { color: var(--faint); }
.req-link.self { color: inherit; }
/* Timing: when, then a phase a line with its bar on a track of the whole and its time, and the total under them. */
.req-timing { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.req-when { padding: 0 var(--view-end) 0 var(--view-start); font-size: 11px; color: var(--faint); font-variant-numeric: tabular-nums; }
.req-dur { flex: none; padding-right: var(--col-pad); font-size: 10px; letter-spacing: 0.04em; color: var(--faint); }
.req-phases {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(32px, 1fr) auto;
  align-items: center;
  gap: 2px 8px;
  padding: 0 var(--view-end) 0 var(--view-start);
  font-size: 11px;
}
.req-total { padding-left: calc(var(--view-start) + var(--col-step)); }
.req-ms { font-family: var(--mono); font-variant-numeric: tabular-nums; text-align: right; }
.req-track { position: relative; height: 8px; }
.req-span { position: absolute; top: 0; bottom: 0; min-width: 1px; border-radius: 1px; background: var(--faint); }
.req-span.dns { background: var(--req-patch); }
.req-span.connect { background: var(--req-put); }
.req-span.ssl { background: var(--req-post); }
.req-span.wait { background: var(--ok); }
.req-span.download { background: var(--req-get); }
/* Cookies: a cookie under another, each its fields in the table's words. */
.req-cookie + .req-cookie { margin-top: 6px; }
/* EventStream: a message a line under a head that names the columns, its data in mono and wrapping anywhere. */
.req-events {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  gap: 2px 8px;
  padding: 0 var(--view-end) 0 var(--view-start);
  font-size: 11px;
}
.req-event { display: contents; }
.req-event-head > .req-cell { font-size: 10.5px; color: var(--faint); }
.req-event > .req-cell:nth-last-child(2) { font-family: var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
.req-event > .req-cell:last-child { font-variant-numeric: tabular-nums; color: var(--faint); }

/* The lists of the storage view, a row under a row as the panel's rows are. */
.st-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }

/* The pinned panel: a column the window's height, flush with its edge and
   square, the one hairline it keeps on the page's side. The top and bottom
   borders go, and the padding there pays for them, so nothing in it moves
   across. What it shows takes all the height there is, the rows, the
   settings or a feature's view, and scrolls in it, with the footer at the
   bottom. The window sets its height, so a slide between the views eases
   none. Dragged off its edge it is still a column, square all round. */
.wrap[data-dock="true"] .panel {
  height: 100vh;
  height: 100dvh;
  max-height: none;
  padding-top: 5px;
  padding-bottom: 5px;
  border-top-width: 0;
  border-bottom-width: 0;
  border-radius: 0;
}
.wrap[data-dock="true"] .body,
.wrap[data-dock="true"] .home,
.wrap[data-dock="true"] .view,
.wrap[data-dock="true"] .keys { flex: 1 1 auto; }
.wrap[data-dock="true"] .body[data-slide] { transition: none; }
.wrap[data-dock="true"] .view { height: auto; }
.wrap[data-dock="true"] .keys {
  min-height: 0;
  align-content: start;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.wrap[data-dock="true"]:is([data-mode="results"], [data-mode="browse"]) .rows {
  max-height: 40vh;
  max-height: 40dvh;
}
/* The pinned column slides by the panel alone, where the panel puts it each
   frame: out, sliding off its edge by whole px, or away, all the way off it.
   The wrapper stays where it is, still the box the handle and the tooltip
   are placed in, so the handle does not ride the column. The panel shows for
   as long as it is not away, and not by the clock, so the page's frame
   always has the edge that shows to keep to. */
.wrap[data-dock="true"],
.wrap[data-dock="true"][data-side="left"],
.wrap[data-dock="true"][data-handle="hidden"][data-open="false"],
.wrap[data-dock="true"][data-handle="hidden"][data-open="false"][data-side="left"] {
  visibility: visible;
  transform: translateX(0);
}
.wrap[data-dock="true"] .panel { visibility: visible; }
.wrap[data-dock="true"][data-column="sliding"] .panel { transform: translateX(var(--column-away, 0px)); }
.wrap[data-dock="true"][data-column="away"] .panel { transform: translateX(100%); }
.wrap[data-dock="true"][data-column="away"][data-side="left"] .panel { transform: translateX(-100%); }
/* Away and closed it hides, so a drag of the handle carries none of it into
   the window. One that opens shows from the start, to take the focus. */
.wrap[data-dock="true"][data-open="false"][data-column="away"] .panel { visibility: hidden; }
/* Open, the pinned panel shows no handle: its edge on the page's side is the
   strip that changes its width, and the controls by the pin close it and
   take it across. Closed, the handle sits at the window's edge, over the
   page and out of the column's flow, so it takes no room from either. It
   comes in from the edge once the column is away, and goes off it under the
   column that comes out, and takes no pointer on its way. */
.wrap[data-dock="true"] .handle { display: none; }
.wrap[data-dock="true"]:is([data-handle-at="edge"], [data-handle-at="sliding"]) .handle {
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
  margin: 0;
}
.wrap[data-dock="true"][data-side="left"]:is([data-handle-at="edge"], [data-handle-at="sliding"]) .handle {
  right: auto;
  left: 0;
}
.wrap[data-dock="true"][data-handle-at="sliding"] .handle {
  z-index: 0;
  transform: translateX(calc(100% * var(--handle-away, 0)));
  pointer-events: none;
}
/* Down a pinned panel the hairline runs the window's height, as its border does. */
.wrap[data-dock="true"] .sizer::after { top: 0; bottom: 0; }
/* While it is dragged the strip covers the window, so every move of the drag
   comes to it, over the page and a frame in it, whatever the capture does. */
.wrap[data-sizing="true"] .sizer::before {
  content: "";
  position: absolute;
  top: -100vh;
  right: -100vw;
  bottom: -100vh;
  left: -100vw;
}
`;
