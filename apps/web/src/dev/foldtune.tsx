import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, firstThatWorks, props } from '@stylexjs/stylex';
import type { TopLayerHold } from '@vinena/knobs';
import { ChevronDownIcon, ChevronUpIcon, XIcon } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chip } from '../lib/chip.tsx';
import { ICON } from '../lib/icon.ts';
import { leaveReference } from './refscreen.ts';

/**
 * A development tool, never in a build: live sliders for the constants of
 * devknobs' fold (the iPhone Duo), drawn from the spec devknobs lists, so the
 * owner tunes the fold by eye and saves what he picked. See `AGENTS.md`,
 * "Tuning the fold (dev)".
 */

interface Entry {
  default: number;
  hint?: string;
  key: string;
  label: string;
  max: number;
  min: number;
  step: number;
  unit?: string;
  value: number;
}

/** What drew the last fold, and why that one. */
interface Info {
  drawnBy: string;
  why: string;
}

/** The hook devknobs puts on the top page's window once its fold code has run. */
interface FoldTune {
  /** The hinge's angle, 0 shut to 180 open flat, or null with no Duo up. Not on older builds. */
  angle?(): number | null;
  get(): Record<string, number>;
  /** Not on older builds. */
  info?(): { drawnBy: 'webgl' | 'layers' | 'none'; why: string };
  /** Named sets of values. Not on older builds. */
  presets?(): Record<string, Record<string, number>>;
  reset(): void;
  set(key: string, value: number): void;
  /** The picture of the page the fold draws on the turning screen, as a PNG. Not on older builds. */
  shot?(): Promise<Blob | null>;
  /** Why `shot` gave none. */
  shotWhy?(): string;
  spec: Array<Entry>;
  subscribe(listener: () => void): () => void;
}

type Values = Record<string, number>;

const HOOK = Symbol.for('devknobs.foldtune');
const STORE = 'knobs:foldtune';
const ENDPOINT = '/__tune/fold';
const REFS = '/__tune/ref';
const JADON = 'https://iphone-duo-tawny.vercel.app/';

// The reference page this visit is on (`src/dev/reference.tsx`), read once as the card loads.
const REF_NOW = new URLSearchParams(globalThis.location?.search ?? '').get('ref');

/** What goes with the values into a copy and a save, each only when there is one. */
interface Extra {
  angle?: number;
  preset?: string;
  ref?: string;
}

// The card's width, and the gutter it keeps to the window's edges.
const CARD = 300;
const GUTTER = 16;

// Where the card was dragged to, from its corner, for the visit.
const place = { x: 0, y: 0 };

/** The hook that already got this tab's stored values, so they go in once. */
let adopted: FoldTune | null = null;

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9;
}

/** The values that are not their defaults. */
function changedOf(spec: ReadonlyArray<Entry>, values: Values): Values {
  const changed: Values = {};
  for (const entry of spec) {
    const value = values[entry.key];
    if (value !== undefined && differs(value, entry.default)) {
      changed[entry.key] = value;
    }
  }
  return changed;
}

/** Set every value of `values` the spec has a key for. */
function apply(tune: FoldTune, values: unknown): void {
  if (typeof values !== 'object' || values === null) {
    return;
  }
  for (const entry of tune.spec) {
    const value = (values as Record<string, unknown>)[entry.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      tune.set(entry.key, value);
    }
  }
}

/** Keep the changed values for a reload of this tab. With none changed, keep nothing. */
function remember(spec: ReadonlyArray<Entry>, values: Values): void {
  try {
    const changed = changedOf(spec, values);
    if (Object.keys(changed).length === 0) {
      sessionStorage.removeItem(STORE);
    } else {
      sessionStorage.setItem(STORE, JSON.stringify(changed));
    }
  } catch {
    // No storage: the values last as long as the page does.
  }
}

/** The hook, once devknobs has put it there. The first sight of it gets the tab's stored values back. */
function findHook(): FoldTune | null {
  const tune = (window as unknown as Record<symbol, FoldTune | undefined>)[HOOK] ?? null;
  if (tune !== null && tune !== adopted) {
    adopted = tune;
    try {
      apply(tune, JSON.parse(sessionStorage.getItem(STORE) ?? 'null'));
    } catch {
      // Nothing stored that can be read.
    }
  }
  return tune;
}

/** What the hook says drew the fold, or null on a build that does not say. */
function infoOf(tune: FoldTune): Info | null {
  if (typeof tune.info !== 'function') {
    return null;
  }
  try {
    const info: unknown = tune.info();
    if (typeof info !== 'object' || info === null) {
      return null;
    }
    const { drawnBy, why } = info as Record<string, unknown>;
    return {
      drawnBy: typeof drawnBy === 'string' ? drawnBy : 'none',
      why: typeof why === 'string' ? why : '',
    };
  } catch {
    return null;
  }
}

/** The hook's named sets, each cut to its finite numbers. None on a build that has none. */
function presetsOf(tune: FoldTune): Record<string, Values> {
  const found: Record<string, Values> = {};
  if (typeof tune.presets !== 'function') {
    return found;
  }
  try {
    const all: unknown = tune.presets();
    if (typeof all !== 'object' || all === null) {
      return found;
    }
    for (const [name, set] of Object.entries(all)) {
      if (typeof set !== 'object' || set === null) {
        continue;
      }
      const values: Values = {};
      for (const [key, value] of Object.entries(set)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          values[key] = value;
        }
      }
      found[name] = values;
    }
  } catch {
    // A hook that throws has no presets to show.
  }
  return found;
}

/** How many of the spec's keys the preset sets, when the values are all the preset's. Else 0. */
function fits(spec: ReadonlyArray<Entry>, values: Values, preset: Values): number {
  let count = 0;
  for (const entry of spec) {
    const want = preset[entry.key];
    if (want === undefined) {
      continue;
    }
    if (differs(values[entry.key] ?? entry.default, want)) {
      return 0;
    }
    count += 1;
  }
  return count;
}

/** The preset the values are, the one with the most keys when several fit, or none. */
function presetOf(
  spec: ReadonlyArray<Entry>,
  values: Values,
  presets: Record<string, Values>,
): string | undefined {
  let best: string | undefined;
  let most = 0;
  for (const [name, preset] of Object.entries(presets)) {
    const count = fits(spec, values, preset);
    if (count > most) {
      best = name;
      most = count;
    }
  }
  return best;
}

/** The hinge's angle, null with no Duo up, or undefined on a build that does not say. */
function angleOf(tune: FoldTune): number | null | undefined {
  if (typeof tune.angle !== 'function') {
    return undefined;
  }
  try {
    const angle: unknown = tune.angle();
    return typeof angle === 'number' && Number.isFinite(angle) ? angle : null;
  } catch {
    return null;
  }
}

/** Why the hook gave no picture, in its words where it has them. */
function shotWhyOf(tune: FoldTune): string {
  try {
    const why: unknown = tune.shotWhy?.();
    return typeof why === 'string' && why !== '' ? why : 'no picture';
  } catch {
    return 'no picture';
  }
}

/** Hand the picture to the browser as a download, named by its size. */
async function download(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const link = document.createElement('a');
    link.href = url;
    link.download = `knobs-page-${image.naturalWidth}x${image.naturalHeight}.png`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // After the download has taken the picture: a revoke in the same task can stop it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** The names of the reference pages, from files named `<name>-inner.*` and `<name>-outer.*`. */
function refNames(files: unknown): Array<string> {
  const names = new Set<string>();
  for (const file of Array.isArray(files) ? files : []) {
    const name =
      typeof file === 'string' ? /^(.+)-(?:inner|outer)\.[a-z0-9]+$/.exec(file)?.[1] : null;
    if (typeof name === 'string') {
      names.add(name);
    }
  }
  return [...names].sort();
}

/** Load this address with `ref` set, or without it for the page itself, the card kept. */
function goTo(ref: string | null): void {
  const url = new URL(window.location.href);
  if (ref === null) {
    leaveReference();
    url.searchParams.delete('ref');
  } else {
    url.searchParams.set('ref', ref);
  }
  if (!url.searchParams.has('tune')) {
    url.searchParams.set('tune', '');
  }
  window.location.assign(url.href);
}

function drawnLine(info: Info): string {
  return info.drawnBy === 'none' ? 'not drawn yet' : `drawn by ${info.drawnBy}`;
}

/** As many decimals as the step has, so the readout does not jump in width. */
function shown(value: number, entry: Entry): string {
  const decimals = String(entry.step).split('.')[1]?.length ?? 0;
  return `${value.toFixed(decimals)}${entry.unit ?? ''}`;
}

/**
 * The values as JSON, then the changed ones against their defaults, then what
 * drew the fold, then the preset, the angle and the reference page.
 */
function copyText(
  spec: ReadonlyArray<Entry>,
  values: Values,
  info: Info | null,
  extra: Extra,
): string {
  const lines = spec
    .filter((entry) => differs(values[entry.key] ?? entry.default, entry.default))
    .map((entry) => `// ${entry.key}: ${entry.default} -> ${values[entry.key]}`);
  const changed = lines.length === 0 ? '// none changed' : lines.join('\n');
  const drawn = info === null ? '' : `\n// info\n// ${JSON.stringify(info)}\n`;
  const more = Object.entries(extra)
    .map(([key, value]) => `// ${key}: ${typeof value === 'number' ? value.toFixed(1) : value}\n`)
    .join('');
  return `${JSON.stringify(values, null, 2)}\n\n// defaults\n${changed}\n${drawn}${more}`;
}

function clock(date: Date): string {
  return date.toLocaleTimeString([], { hour12: false });
}

const styles = create({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s1,
    paddingBlock: spacing.s1,
    paddingInline: 6,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
  },
  // The angle: the note's line, its number in the readouts' face.
  angle: {
    alignItems: 'baseline',
    columnGap: spacing.s1,
    display: 'flex',
    fontFamily: font.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  // A small panel: hairline, 13 round, its rows 4 inside it, so 8 round. It
  // sits in the window's bottom left corner, away from the devknobs panel,
  // and scrolls inside when it is taller than the window.
  card: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    bottom: GUTTER,
    boxShadow: shadow.lift,
    boxSizing: 'border-box',
    color: colors.fg,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.family,
    fontSize: 13,
    gap: spacing.s1,
    height: 'auto',
    left: GUTTER,
    lineHeight: 1.5,
    margin: 0,
    maxHeight: firstThatWorks(`calc(100dvh - ${GUTTER * 2}px)`, `calc(100vh - ${GUTTER * 2}px)`),
    maxWidth: `calc(100vw - ${GUTTER * 2}px)`,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    padding: spacing.s1,
    position: 'fixed',
    right: 'auto',
    top: 'auto',
    width: CARD,
    zIndex: 2_147_483_647,
  },
  // The whole head moves the card. No touch scroll starts on it.
  head: {
    alignItems: 'center',
    columnGap: 2,
    cursor: 'grab',
    display: 'flex',
    paddingInlineStart: 6,
    touchAction: 'none',
    userSelect: 'none',
  },
  hint: {
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.4,
  },
  // The panel's small icon button: faint, and the track ground on hover.
  icon: {
    alignItems: 'center',
    backgroundColor: {
      ':hover': colors.track,
      default: 'transparent',
    },
    borderRadius: radius.base,
    borderStyle: 'none',
    color: {
      ':hover': colors.fg,
      default: colors.muted,
    },
    cursor: 'pointer',
    display: 'flex',
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    outlineColor: colors.muted,
    outlineOffset: -1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    padding: 0,
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
    transitionTimingFunction: 'ease-out',
    width: 22,
  },
  // What drew the fold: the note's text, which wraps and can be copied.
  info: {
    overflowWrap: 'anywhere',
    userSelect: 'text',
  },
  label: {
    flexGrow: 1,
    minWidth: 0,
  },
  line: {
    color: colors.muted,
    margin: 0,
    paddingBlock: spacing.s1,
    paddingInline: 6,
  },
  link: {
    color: {
      ':hover': colors.fg,
      default: 'inherit',
    },
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  name: {
    color: colors.muted,
    flexGrow: 1,
  },
  note: {
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.4,
    margin: 0,
    paddingBottom: spacing.s1,
    paddingInline: 6,
  },
  // The chip that is the one in use: its hover ground and ink, held.
  on: {
    backgroundColor: colors.card,
    color: colors.fg,
  },
  // A row of chips to pick one of, after the word for what they are.
  picks: {
    alignItems: 'baseline',
  },
  picksName: {
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.4,
  },
  range: {
    accentColor: colors.fg,
    boxSizing: 'border-box',
    margin: 0,
    marginBlock: spacing.s1,
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    width: '100%',
  },
  // A row's own small word, shown only once its value has left the default.
  reset: {
    backgroundColor: 'transparent',
    borderRadius: radius.base,
    borderStyle: 'none',
    color: {
      ':hover': colors.fg,
      default: colors.muted,
    },
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: font.sizeXs,
    lineHeight: 1.4,
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: 0,
    paddingInline: spacing.s1,
  },
  // Out of sight and out of the tab order, its room kept, so the readout does not move.
  resetOff: {
    visibility: 'hidden',
  },
  // A panel row, 4 inside the card, so 8 round.
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    paddingBlock: spacing.s1,
    paddingInline: 10,
  },
  rowTop: {
    alignItems: 'baseline',
    columnGap: spacing.s1,
    display: 'flex',
  },
  value: {
    cursor: 'default',
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
});

/** What the save endpoint last wrote, as far as the panel reads it. */
type Saved = { values?: unknown };

function Rows({ tune }: { tune: FoldTune }) {
  const [values, setValues] = useState<Values>(() => tune.get());
  const [info, setInfo] = useState<Info | null>(() => infoOf(tune));
  // While the defaults stand in for the tuned values, the hook's are not the panel's.
  const comparing = useRef(false);
  const [held, setHeld] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [said, setSaid] = useState<{ on: 'angle' | 'copy' | 'save'; text: string } | null>(null);
  const [presets] = useState(() => presetsOf(tune));
  const [angle, setAngle] = useState(() => angleOf(tune));
  const [making, setMaking] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  useEffect(
    () =>
      tune.subscribe(() => {
        if (!comparing.current) {
          const next = tune.get();
          setValues(next);
          remember(tune.spec, next);
        }
      }),
    [tune],
  );

  // On each notice, and on a light poll for a build that gives none.
  useEffect(() => {
    const read = () => {
      const next = infoOf(tune);
      setInfo((last) => (last?.drawnBy === next?.drawnBy && last?.why === next?.why ? last : next));
    };
    read();
    const stop = tune.subscribe(read);
    const timer = setInterval(read, 500);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [tune]);

  // The angle moves with the fold: on each notice, and on a light poll while the card is open.
  useEffect(() => {
    if (typeof tune.angle !== 'function') {
      return;
    }
    const read = () => setAngle(angleOf(tune));
    const stop = tune.subscribe(read);
    const timer = setInterval(read, 250);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [tune]);

  useEffect(() => {
    if (why === null) {
      return;
    }
    const timer = setTimeout(() => setWhy(null), 4000);
    return () => clearTimeout(timer);
  }, [why]);

  useEffect(() => {
    let live = true;
    fetch(ENDPOINT)
      .then((response) => (response.ok ? (response.json() as Promise<Saved>) : null))
      .then(
        (last) => {
          if (live && last !== null) {
            setSaved(last);
          }
        },
        () => {},
      );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (said === null) {
      return;
    }
    const timer = setTimeout(() => setSaid(null), 2500);
    return () => clearTimeout(timer);
  }, [said]);

  // What the hook has after a write, which it may have clamped.
  const take = () => {
    const next = tune.get();
    setValues(next);
    remember(tune.spec, next);
  };
  const set = (key: string, value: number) => {
    tune.set(key, value);
    take();
  };
  const resetAll = () => {
    tune.reset();
    take();
  };
  const load = () => {
    apply(tune, saved?.values);
    take();
  };
  const pick = (preset: Values) => {
    apply(tune, preset);
    take();
  };

  const preset = presetOf(tune.spec, values, presets);
  const extra: Extra = {
    ...(typeof angle === 'number' && { angle }),
    ...(preset !== undefined && { preset }),
    ...(REF_NOW !== null && { ref: REF_NOW }),
  };

  const copyAngle = () => {
    if (typeof angle !== 'number') {
      return;
    }
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(angle.toFixed(1)))
      .then(
        () => setSaid({ on: 'angle', text: 'copied' }),
        () => setSaid({ on: 'angle', text: 'copy failed' }),
      );
  };
  const picture = () => {
    if (making) {
      return;
    }
    setMaking(true);
    Promise.resolve()
      .then(() => tune.shot?.())
      .then((blob) => {
        if (blob === null || blob === undefined) {
          setWhy(shotWhyOf(tune));
          return;
        }
        return download(blob);
      })
      .then(
        () => setMaking(false),
        () => {
          setMaking(false);
          setWhy('no picture');
        },
      );
  };

  const hold = () => {
    if (comparing.current) {
      return;
    }
    comparing.current = true;
    setHeld(true);
    for (const entry of tune.spec) {
      tune.set(entry.key, entry.default);
    }
  };
  const release = () => {
    if (!comparing.current) {
      return;
    }
    for (const entry of tune.spec) {
      tune.set(entry.key, values[entry.key] ?? entry.default);
    }
    comparing.current = false;
    setHeld(false);
  };
  const holdByPointer = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    hold();
  };
  const holdByKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      hold();
    }
  };

  const copy = () => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(copyText(tune.spec, values, info, extra)))
      .then(
        () => setSaid({ on: 'copy', text: 'copied' }),
        () => setSaid({ on: 'copy', text: 'copy failed' }),
      );
  };
  const save = () => {
    const changed: Record<string, { from: number; to: number }> = {};
    for (const entry of tune.spec) {
      const value = values[entry.key];
      if (value !== undefined && differs(value, entry.default)) {
        changed[entry.key] = { from: entry.default, to: value };
      }
    }
    const now = new Date();
    const body = {
      ...extra,
      changed,
      ...(info !== null && { info }),
      savedAt: now.toISOString(),
      spec: tune.spec,
      userAgent: navigator.userAgent,
      values,
    };
    fetch(ENDPOINT, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).then(
      (response) => {
        if (response.ok) {
          setSaved(body);
        }
        setSaid({ on: 'save', text: response.ok ? `saved ${clock(now)}` : 'save failed' });
      },
      () => setSaid({ on: 'save', text: 'save failed' }),
    );
  };

  return (
    <>
      {info !== null && (
        <div {...props(styles.note, styles.info)}>
          <div>{drawnLine(info)}</div>
          {info.why !== '' && <div>{info.why}</div>}
        </div>
      )}
      {Object.keys(presets).length > 0 && (
        <div {...props(styles.actions, styles.picks)}>
          <span {...props(styles.picksName)}>presets</span>
          {Object.entries(presets).map(([name, set]) => {
            const on = fits(tune.spec, values, set) > 0;
            return (
              <Chip aria-pressed={on} key={name} onClick={() => pick(set)} style={on && styles.on}>
                {name}
              </Chip>
            );
          })}
        </div>
      )}
      {angle !== undefined && (
        <div {...props(styles.note, styles.angle)}>
          <span>{angle === null ? 'no Duo up' : `angle ${angle.toFixed(1)}`}</span>
          {angle !== null && (
            <button {...props(styles.reset)} onClick={copyAngle} type="button">
              {said?.on === 'angle' ? said.text : 'copy'}
            </button>
          )}
        </div>
      )}
      {tune.spec.map((entry) => {
        const value = values[entry.key] ?? entry.default;
        const changed = differs(value, entry.default);
        return (
          <div {...props(styles.row)} key={entry.key}>
            <div {...props(styles.rowTop)}>
              <span {...props(styles.label)}>{entry.label}</span>
              <button
                {...props(styles.reset, !changed && styles.resetOff)}
                onClick={() => set(entry.key, entry.default)}
                type="button"
              >
                reset
              </button>
              <span
                {...props(styles.value)}
                onDoubleClick={() => set(entry.key, entry.default)}
                title="double-click to reset"
              >
                {shown(value, entry)}
              </span>
            </div>
            {entry.hint !== undefined && <span {...props(styles.hint)}>{entry.hint}</span>}
            <input
              {...props(styles.range)}
              aria-label={entry.label}
              disabled={held}
              max={entry.max}
              min={entry.min}
              onChange={(event) => set(entry.key, event.currentTarget.valueAsNumber)}
              step={entry.step}
              type="range"
              value={value}
            />
          </div>
        );
      })}
      <div {...props(styles.actions)}>
        <Chip onClick={resetAll}>reset all</Chip>
        <Chip onClick={copy}>{said?.on === 'copy' ? said.text : 'copy'}</Chip>
        <Chip onClick={save}>{said?.on === 'save' ? said.text : 'save'}</Chip>
        <Chip
          aria-pressed={held}
          onBlur={release}
          onKeyDown={holdByKey}
          onKeyUp={release}
          onLostPointerCapture={release}
          onPointerCancel={release}
          onPointerDown={holdByPointer}
          onPointerUp={release}
          title="hold to see the defaults, let go for the tuned values"
        >
          {held ? 'defaults' : 'compare'}
        </Chip>
        {saved !== null && <Chip onClick={load}>load last saved</Chip>}
      </div>
      {typeof tune.shot === 'function' && (
        <>
          <div {...props(styles.actions)}>
            <Chip disabled={making} onClick={picture}>
              {making ? 'making' : 'page picture'}
            </Chip>
          </div>
          {why !== null && <p {...props(styles.note)}>{why}</p>}
          <p {...props(styles.note)}>
            Drop it into Custom in{' '}
            <a {...props(styles.link)} href={JADON} rel="noreferrer" target="_blank">
              {"jadon's demo"}
            </a>
            , set the same angle
          </p>
        </>
      )}
      <p {...props(styles.note)}>Hold the fold slider in the panel at an angle, then drag</p>
    </>
  );
}

/** The reference pages there are images for, and the page itself: a press loads that one. */
function Refs() {
  const [names, setNames] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    let live = true;
    fetch(REFS)
      .then((response) => (response.ok ? (response.json() as Promise<{ files?: unknown }>) : null))
      .then(
        (list) => {
          if (live && list !== null) {
            setNames(refNames(list.files));
          }
        },
        () => {},
      );
    return () => {
      live = false;
    };
  }, []);

  if (names.length === 0 && REF_NOW === null) {
    return null;
  }
  return (
    <div {...props(styles.actions, styles.picks)}>
      <span {...props(styles.picksName)}>reference</span>
      {names.map((name) => (
        <Chip
          aria-pressed={name === REF_NOW}
          key={name}
          onClick={() => goTo(name)}
          style={name === REF_NOW && styles.on}
        >
          {name}
        </Chip>
      ))}
      <Chip
        aria-pressed={REF_NOW === null}
        onClick={() => goTo(null)}
        style={REF_NOW === null && styles.on}
      >
        page
      </Chip>
    </div>
  );
}

export default function FoldTunePanel() {
  const [tune, setTune] = useState(findHook);
  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ grabX: number; grabY: number; left: number; top: number } | null>(null);

  // devknobs puts the hook up when its fold code first runs, which a Duo starts.
  useEffect(() => {
    if (tune !== null) {
      return;
    }
    const timer = setInterval(() => {
      const found = findHook();
      if (found !== null) {
        setTune(found);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [tune]);

  // Closing takes the card away and lets go of its place in the top layer.
  useEffect(() => {
    const el = card.current;
    if (closed || el === null) {
      return;
    }
    el.style.transform = `translate(${place.x}px, ${place.y}px)`;
    // Into the browser's top layer, over the device's mat and the panel, in the order devknobs keeps.
    let hold: TopLayerHold | null = null;
    let gone = false;
    void import('@vinena/knobs').then(({ holdInTopLayer, LAYER }) => {
      if (!gone) {
        hold = holdInTopLayer(el, LAYER.guide);
      }
    });
    return () => {
      gone = true;
      hold?.release();
    };
  }, [closed]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    if (el === null || event.button !== 0 || (event.target as Element).closest('button') !== null) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const { left, top } = el.getBoundingClientRect();
    // The pointer's place on the card, and the card's corner with no move on
    // it, so a move is clamped as a place in the window.
    drag.current = {
      grabX: event.clientX - left,
      grabY: event.clientY - top,
      left: left - place.x,
      top: top - place.y,
    };
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    const from = drag.current;
    if (el === null || from === null) {
      return;
    }
    const room = document.documentElement;
    const left = Math.min(event.clientX - from.grabX, room.clientWidth - GUTTER - el.offsetWidth);
    const top = Math.min(event.clientY - from.grabY, room.clientHeight - GUTTER - el.offsetHeight);
    place.x = Math.max(GUTTER, left) - from.left;
    place.y = Math.max(GUTTER, top) - from.top;
    el.style.transform = `translate(${place.x}px, ${place.y}px)`;
  };
  const endDrag = () => {
    drag.current = null;
  };

  if (closed) {
    return null;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  // On the body and marked as devknobs' own, as the tour is: devknobs hides
  // every other child of the body, and every other popover, under a device.
  return createPortal(
    <div {...props(styles.card)} data-devknobs="foldtune" data-knobs="foldtune" ref={card}>
      <div
        {...props(styles.head)}
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <span {...props(styles.name)}>fold tune</span>
        <button
          {...props(styles.icon)}
          aria-expanded={open}
          aria-label={open ? 'fold the card' : 'unfold the card'}
          onClick={() => setOpen(!open)}
          type="button"
        >
          {open ? <ChevronDownIcon {...ICON} /> : <ChevronUpIcon {...ICON} />}
        </button>
        <button
          {...props(styles.icon)}
          aria-label="close until reload"
          onClick={() => setClosed(true)}
          type="button"
        >
          <XIcon {...ICON} />
        </button>
      </div>
      {open && (
        <div {...props(styles.body)}>
          <Refs />
          {tune === null ? (
            <p {...props(styles.line)}>Pick the iPhone Duo in the panel and fold it once</p>
          ) : (
            <Rows tune={tune} />
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
