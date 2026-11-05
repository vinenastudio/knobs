import type { Keeper } from "../edit/keep";
import type { GrabControl } from "../grab/control";
import { PREFER_HINT, type PreferValue } from "../host";
import { BINDING_WORDS, type LiveKeys, recordStep } from "./bindings";
import { button, el, lay, mark, rowBox, rowButton, rowsLabel } from "./dom";
import { BINDING_ICONS, icon, type IconName } from "./icons";
import { type Binding, comboLabel, comboSpoken, type Keys } from "./keys";
import { viewHead } from "./pane";
import type { LivePrefs } from "./prefs";
import { segments } from "./radio";
import { focusOn, type View } from "./slide";
import { createRefusal, type Tips } from "./tooltip";

/**
 * The settings view, which slides in over the rows: whether the handle shows
 * while the panel is closed, the host's switch for its native driver where it
 * gives one, which copy runs the panel where a host gives the choice, whether the page keeps its Elements edits after a reload, whether the tab's icon has the dev ribbon, and each binding's
 * key, recorded from the next
 * keys pressed. A key a binding cannot take is refused, and the chip says why.
 */

/** What a binding's chip says while it has no key: its default went to another binding. */
export const NO_KEY = "not set";

/** How long the way back to a panel whose handle was just hidden shows, in ms. */
const HANDLE_HINT = 4000;

/**
 * What the panel says as the user hides the handle, so the way back to a
 * closed panel is never lost: the panel's key, as `comboLabel` shows it.
 */
export function handleHint(keys: Keys, mac: boolean): string {
  return `press ${comboLabel(keys.panel, mac)} to open knobs`;
}

/** What the settings need from the panel. */
export interface SettingsContext {
  keys: LiveKeys;
  prefs: LivePrefs;
  grab: GrabControl | null;
  inspect: GrabControl | null;
  mac: boolean;
  /** The bindings the shortcuts list. */
  bindingsHere: readonly Binding[];
  /** The footer's control that opens and leaves the settings. */
  keysToggle: HTMLButtonElement;
  /** The live region that says why a key was not taken. */
  said: HTMLElement;
  tips: Tips;
  /** Draw the whole panel again. */
  render(): void;
  /** Show the keys in force, everywhere the panel shows them. */
  renderKeys(): void;
  /** Whether the handle shows on a closed panel: the user, the mount and the knobs all let it. */
  handleShown(): boolean;
  /** Let the knobs show the handle, which an agent may have hidden. */
  showHandle(): void;
  /** Whether the tab's icon has the dev ribbon. */
  devIconShown(): boolean;
  /** The user turned the dev ribbon on the tab's icon off or on. */
  setDevIcon(on: boolean): void;
  /** Real phone mode is offered: only a host that sends requests as another browser can. */
  realPhone: boolean;
  /** The user turned real phone mode off or on. */
  setRealPhone(on: boolean): void;
  /** What keeps the page's edits after a reload, null with none. It starts after the panel, so it is asked again as the settings open. */
  keep(): Keeper | null;
  /** The words of the host's switch for its native driver, null with none. */
  native: { label: string; hint: string } | null;
  /** The user turned the native driver off or on. */
  setNative(on: boolean): void;
  /** Whether the host or the page runs the panel, where a host gives the choice; null with none. */
  prefer: { value(): PreferValue } | null;
  /** The user picked who runs the panel. */
  setPrefer(value: PreferValue): void;
  /** Whether the search is open. */
  searching(): boolean;
  leaveSearch(): void;
}

export interface Settings {
  /** The settings pane. */
  view: HTMLElement;
  /** Whether the settings show in place of the rows. */
  editing(): boolean;
  setEditing(on: boolean): void;
  drawKeys(now: Keys): void;
  /** Show whether the handle shows while the panel is closed. */
  drawHandle(shown: boolean): void;
  /** Show whether the tab's icon has the dev ribbon. */
  drawDevIcon(shown: boolean): void;
  /** Show whether real phone mode is on. */
  drawRealPhone(on: boolean): void;
  /** Show whether the native driver is on, and why it last went off or on in place of its hint. */
  drawNative(on: boolean, note: string | null): void;
  /** Show who runs the panel, where a host gives the choice. */
  drawPrefer(): void;
  /** Take a key for the binding that records, if one does, and say whether it did. */
  recordingKey(event: KeyboardEvent): boolean;
  stopRecording(): void;
  /** Show the settings in place of the rows, as the footer's control does. */
  openKeys(): void;
  leaveKeys(): void;
  destroy(): void;
}

/** What real phone mode costs, under its switch. */
export const REAL_PHONE_HINT = "sends the phone's user agent to sites, so they serve their mobile site. some sites may sign you out.";

/** The title of the switch that keeps the page's edits after a reload. */
export const KEEP_LABEL = "keep edits after reload";

/** What the keep switch does, under it. */
export const KEEP_HINT = "keeps your Elements edits on this page after a reload.";

export interface KeepRow {
  /** The row, hidden while there is no keeper. */
  node: HTMLElement;
  /** Ask for the keeper again, and show it. */
  sync(): void;
  destroy(): void;
}

/**
 * The switch that keeps the page's edits after a reload, as the keeper has
 * it, and off to a click until the keeper knows what the page keeps.
 */
export function keepRow(resolve: () => Keeper | null): KeepRow {
  const control = button("switch row-control", "");
  control.setAttribute("role", "switch");
  control.setAttribute("aria-label", KEEP_LABEL);
  const hint = el("div", "row-hint", KEEP_HINT);
  hint.id = "devknobs-keep-hint";
  control.setAttribute("aria-describedby", hint.id);
  const node = rowBox({
    main: el("div", "main"),
    glyph: icon("rotate-ccw"),
    title: KEEP_LABEL,
    ends: [control],
  }).box;
  node.append(hint);
  let keep: Keeper | null = null;
  let stop: (() => void) | null = null;
  const draw = (): void => {
    if (!keep) return;
    mark(control, keep.on(), "aria-checked");
    control.disabled = !keep.known();
  };
  control.addEventListener("click", () => keep?.set(!keep.on()));
  function sync(): void {
    const now = resolve();
    if (now !== keep) {
      stop?.();
      keep = now;
      stop = keep ? keep.subscribe(draw) : null;
    }
    node.hidden = !keep;
    draw();
  }
  sync();
  return {
    node,
    sync,
    destroy(): void {
      stop?.();
      stop = null;
    },
  };
}

export function createSettings(context: SettingsContext): Settings {
  const { keys, prefs, grab, mac, bindingsHere, keysToggle, said, tips, render, renderKeys } =
    context;

  // The settings, in place of the rows: the head every view has, with the
  // way back to them, whether the handle shows while the panel is closed,
  // then each binding's key, to set or put back. A key that is not taken
  // shakes its chip and says why in the tooltip. The panel's icons face the
  // side it is on. Its layout is the knob rows', as a view names its own.
  const keysView = el("div", "keys pane");
  lay(keysView, "rows");
  keysView.setAttribute("role", "group");
  keysView.setAttribute("aria-label", "settings");
  const head = viewHead();
  const keysBack = head.back;
  head.title.textContent = "settings";
  keysBack.setAttribute("aria-label", "back from settings");
  const handleSwitch = button("switch row-control", "");
  handleSwitch.setAttribute("role", "switch");
  handleSwitch.setAttribute("aria-label", "show handle");
  const sided = (name: IconName): SVGElement => {
    const glyph = icon(name);
    if (name.startsWith("panel-")) glyph.classList.add("sided");
    return glyph;
  };
  keysView.append(
    head.box,
    rowBox({
      main: el("div", "main"),
      glyph: sided("panel-right"),
      title: "show handle",
      ends: [handleSwitch],
    }).box,
  );
  const native = context.native;
  const nativeSwitch = button("switch row-control", "");
  const nativeHint = el("div", "row-hint", native?.hint ?? "");
  if (native) {
    nativeSwitch.setAttribute("role", "switch");
    nativeSwitch.setAttribute("aria-label", native.label);
    nativeHint.id = "devknobs-native-hint";
    nativeSwitch.setAttribute("aria-describedby", nativeHint.id);
    const row = rowBox({
      main: el("div", "main"),
      glyph: icon("bug"),
      title: native.label,
      ends: [nativeSwitch],
    }).box;
    row.append(nativeHint);
    keysView.append(row);
    nativeSwitch.addEventListener("click", () =>
      context.setNative(nativeSwitch.getAttribute("aria-checked") !== "true"),
    );
  }
  const prefer = context.prefer;
  const preferChoice = segments({
    options: [
      { value: "extension", label: "extension" },
      { value: "page", label: "page" },
    ],
    label: "prefer",
    onChange: (value) => context.setPrefer(value === "page" ? "page" : "extension"),
  });
  if (prefer) {
    preferChoice.node.classList.add("row-control");
    const hint = el("div", "row-hint", PREFER_HINT);
    hint.id = "devknobs-prefer-hint";
    preferChoice.node.setAttribute("aria-describedby", hint.id);
    const row = rowBox({
      main: el("div", "main"),
      glyph: icon("chevrons-left-right"),
      title: "prefer",
      ends: [preferChoice.node],
    }).box;
    row.append(hint);
    keysView.append(row);
  }
  const realPhoneSwitch = button("switch row-control", "");
  if (context.realPhone) {
    realPhoneSwitch.setAttribute("role", "switch");
    realPhoneSwitch.setAttribute("aria-label", "real phone mode");
    const hint = el("div", "row-hint", REAL_PHONE_HINT);
    hint.id = "devknobs-real-phone-hint";
    realPhoneSwitch.setAttribute("aria-describedby", hint.id);
    const row = rowBox({
      main: el("div", "main"),
      glyph: icon("smartphone"),
      title: "real phone mode",
      ends: [realPhoneSwitch],
    }).box;
    row.append(hint);
    keysView.append(row);
    realPhoneSwitch.addEventListener("click", () =>
      context.setRealPhone(realPhoneSwitch.getAttribute("aria-checked") !== "true"),
    );
  }
  const devIconSwitch = button("switch row-control", "");
  devIconSwitch.setAttribute("role", "switch");
  devIconSwitch.setAttribute("aria-label", "dev tab icon");
  const devIconRow = rowBox({
    main: el("div", "main"),
    glyph: icon("image"),
    title: "dev tab icon",
    ends: [devIconSwitch],
  }).box;
  keysView.append(devIconRow);
  const keepEdits = keepRow(context.keep);
  /** Show the keep switch before the dev tab icon's once the page has a keeper, which starts after the panel. */
  const placeKeep = (): void => {
    keepEdits.sync();
    if (!keepEdits.node.hidden && !keysView.contains(keepEdits.node)) keysView.insertBefore(keepEdits.node, devIconRow);
  };
  placeKeep();
  devIconSwitch.addEventListener("click", () => context.setDevIcon(!context.devIconShown()));
  keysView.append(rowsLabel("shortcuts"));
  const keyViews = new Map<
    Binding,
    { set: HTMLButtonElement; back: HTMLButtonElement }
  >();
  for (const binding of bindingsHere) {
    const word = BINDING_WORDS[binding];
    const set = button("key-set row-control", "");
    const back = rowButton("clear", icon("x"), `put the ${word} key back`);
    // Its x sits before its key, so every key ends on the row's right edge.
    keysView.append(
      rowBox({
        main: el("div", "main"),
        glyph: sided(BINDING_ICONS[binding]),
        title: word,
        ends: [back, set],
      }).box,
    );
    keyViews.set(binding, { set, back });
  }

  /** The shortcuts show in place of the rows. */
  let editingKeys = false;
  /** The binding waiting for its new key. */
  let recording: Binding | null = null;
  /** A key a chip's binding cannot take: the chip shakes and goes red, and says why. */
  const { refuse, unrefuse, destroy: stopRefusing } = createRefusal(tips, said);

  /** Show the keys in force on the settings, and whether they show. */
  function drawKeys(now: Keys): void {
    keysToggle.setAttribute("aria-pressed", editingKeys ? "true" : "false");
    for (const [binding, view] of keyViews) {
      const word = BINDING_WORDS[binding];
      const on = recording === binding;
      const combo = now[binding];
      view.set.textContent = on ? "press keys…" : combo ? comboLabel(combo, mac) : NO_KEY;
      view.set.classList.toggle("recording", on);
      view.set.setAttribute(
        "aria-label",
        on
          ? `press the new ${word} key`
          : `${word}, ${combo ? comboSpoken(combo) : NO_KEY}, ${combo ? "change" : "set"}`,
      );
      view.back.hidden = !keys.custom(binding);
    }
  }

  /** The keys of the bindings listed, which a new key must not be one of. */
  function keysHere(): Partial<Keys> {
    const now = keys.get();
    return Object.fromEntries(bindingsHere.map((binding) => [binding, now[binding]]));
  }

  /**
   * Wait for a binding's new key. Until it comes, every key goes to the
   * recording and to nothing else: not to the panel, grab or the page.
   */
  function startRecording(binding: Binding): void {
    recording = binding;
    keys.recording = true;
    // Grab's mode reads the keys ahead of the panel, escape and the arrows too,
    // and inspect's is the same mode.
    grab?.set(false);
    context.inspect?.set(false);
    renderKeys();
    keyViews.get(binding)?.set.focus({ preventScroll: true });
  }

  function stopRecording(): void {
    if (recording === null) return;
    const chip = keyViews.get(recording)?.set;
    recording = null;
    keys.recording = false;
    if (chip) unrefuse(chip);
    renderKeys();
  }

  /**
   * A key pressed while a binding records. Tab moves on, and the blur that
   * follows ends it. Every other key is swallowed: escape cancels, a key the
   * binding can take becomes its key, and one it cannot says why.
   */
  function recordKey(event: KeyboardEvent, binding: Binding): void {
    if (event.key === "Tab") {
      stopRecording();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const step = recordStep(event, binding, keysHere());
    const chip = keyViews.get(binding)?.set;
    // The reason a key was refused stays until the next key.
    if (chip && tips.isFor(chip)) tips.hide();
    if (step.type === "cancel") stopRecording();
    else if (step.type === "refuse" && chip) refuse(chip, step.reason);
    else if (step.type === "keep") {
      stopRecording();
      keys.set(binding, step.combo);
    }
  }

  /** Hand the focus to what a view takes it on, as it slides there. */
  function focusView(view: View): void {
    (focusOn(view) === "back" ? keysBack : keysToggle).focus({ preventScroll: true });
  }

  function openKeys(): void {
    if (context.searching()) context.leaveSearch();
    editingKeys = true;
    placeKeep();
    render();
    focusView("keys");
  }

  function leaveKeys(): void {
    stopRecording();
    editingKeys = false;
    render();
    focusView("home");
  }

  keysToggle.addEventListener("click", () => (editingKeys ? leaveKeys() : openKeys()));
  keysBack.addEventListener("click", leaveKeys);
  tips.tooltip(keysToggle, "settings");
  // Hiding the handle says how to bring the closed panel back, so nobody is shut out.
  handleSwitch.addEventListener("click", () => {
    const on = !context.handleShown();
    prefs.setHandle(on);
    if (on) {
      context.showHandle();
      if (tips.isFor(handleSwitch)) tips.hide();
      return;
    }
    const hint = handleHint(keys.get(), mac);
    tips.show(handleSwitch, hint);
    tips.hideAfter(HANDLE_HINT);
    said.textContent = hint;
  });
  for (const [binding, view] of keyViews) {
    view.set.addEventListener("click", () => {
      if (recording === binding) stopRecording();
      else startRecording(binding);
    });
    view.set.addEventListener("blur", () => {
      if (recording === binding) stopRecording();
    });
    view.back.addEventListener("click", () => {
      stopRecording();
      keys.set(binding, null);
      view.set.focus({ preventScroll: true });
    });
  }

  return {
    view: keysView,
    editing: () => editingKeys,
    setEditing(on: boolean): void {
      editingKeys = on;
    },
    drawKeys,
    drawHandle(shown: boolean): void {
      mark(handleSwitch, shown, "aria-checked");
    },
    drawDevIcon(shown: boolean): void {
      mark(devIconSwitch, shown, "aria-checked");
    },
    drawRealPhone(on: boolean): void {
      mark(realPhoneSwitch, on, "aria-checked");
    },
    drawNative(on: boolean, note: string | null): void {
      mark(nativeSwitch, on, "aria-checked");
      const hint = note ?? native?.hint ?? "";
      if (nativeHint.textContent === hint) return;
      nativeHint.textContent = hint;
      if (note) said.textContent = note;
    },
    drawPrefer(): void {
      if (prefer) preferChoice.set(prefer.value());
    },
    recordingKey(event: KeyboardEvent): boolean {
      if (recording === null) return false;
      recordKey(event, recording);
      return true;
    },
    stopRecording,
    openKeys,
    leaveKeys,
    destroy(): void {
      stopRefusing();
      keepEdits.destroy();
    },
  };
}
