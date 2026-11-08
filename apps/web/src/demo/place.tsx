import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, keyframes, props } from '@stylexjs/stylex';
import { ChevronRightIcon, LocateIcon, LocateOffIcon, MapPinOffIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Card, Chips, Row, Rows } from '../lib/card.tsx';
import { Chip } from '../lib/chip.tsx';
import { ICON } from '../lib/icon.ts';
import {
  all,
  every,
  held,
  live,
  onMedia,
  onWindow,
  useInView,
  useLive,
  type Watch,
} from '../lib/live.ts';
import { m } from '../paraglide/messages.js';
import { LAND } from './land.ts';
import { or, unit } from './read.ts';

const API = '/api/demo';

const LESS_MOTION = '@media (prefers-reduced-motion: reduce)';

// The scenes' illustrative colors, in one place, mixed from the page's tokens so they follow the scheme.
const SCENE = {
  closed: colors.error,
  grid: `color-mix(in srgb, ${colors.fg} 7%, transparent)`,
  land: `color-mix(in srgb, ${colors.fg} 17%, ${colors.bg})`,
  open: colors.codeString,
  sea: `color-mix(in srgb, ${colors.accent} 9%, ${colors.bg})`,
};

const pulse = keyframes({
  from: { opacity: 0.7, transform: 'scale(0.6)' },
  to: { opacity: 0, transform: 'scale(2.4)' },
});

const styles = create({
  // A scene sits on the raised ground inside the card, a step in from its corners.
  box: {
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    paddingBlock: spacing.s2,
    paddingInline: 10,
  },
  chevron: {
    color: colors.muted,
    flexShrink: 0,
  },
  clock: {
    display: 'block',
    flexShrink: 0,
    height: 88,
    width: 88,
  },
  code: {
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    fontFamily: font.mono,
    fontSize: '0.85em',
    paddingBlock: '0.1em',
    paddingInline: '0.3em',
  },
  dot: {
    borderRadius: '50%',
    flexShrink: 0,
    height: 8,
    width: 8,
  },
  face: { fill: colors.card },
  flip: { transform: 'scaleX(-1)' },
  grid: { stroke: SCENE.grid, strokeWidth: 1 },
  hand: { stroke: colors.fg, strokeLinecap: 'round' },
  inset: { fill: SCENE.sea },
  insetDot: { fill: colors.accent, stroke: colors.raised, strokeWidth: 1 },
  insetLand: { fill: SCENE.land },
  land: { fill: SCENE.land },
  line: {
    alignItems: 'baseline',
    columnGap: spacing.s3,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: '0.8125rem',
    justifyContent: 'space-between',
    lineHeight: 1.5,
  },
  map: {
    aspectRatio: '2 / 1',
    borderRadius: radius.base,
    display: 'block',
    overflow: 'hidden',
    width: '100%',
  },
  mapBox: { position: 'relative' },
  // A blocked or missing position mutes the map under its chip.
  muted: { filter: 'grayscale(1)', opacity: 0.45 },
  muteText: { color: colors.muted },
  // The map's state, over its corner, on the page's raised ground.
  faded: { opacity: 0.35 },
  note: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    boxShadow: shadow.lift,
    color: colors.fg,
    columnGap: 6,
    display: 'flex',
    fontSize: font.sizeXs,
    insetBlockStart: spacing.s2,
    insetInlineStart: spacing.s2,
    lineHeight: 1.4,
    paddingBlock: 2,
    paddingInline: 6,
    position: 'absolute',
  },
  num: {
    fontFamily: font.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  pin: { fill: colors.accent, stroke: colors.raised, strokeWidth: 2 },
  reach: { fill: `color-mix(in srgb, ${colors.accent} 18%, transparent)` },
  ring: {
    animationDuration: '1400ms',
    animationIterationCount: 'infinite',
    animationName: { default: pulse, [LESS_MOTION]: 'none' },
    animationTimingFunction: 'ease-out',
    fill: 'none',
    stroke: colors.accent,
    strokeWidth: 2,
    transformBox: 'fill-box',
    transformOrigin: 'center',
  },
  scene: {
    alignItems: 'center',
    columnGap: spacing.s3,
    flexDirection: 'row',
  },
  sea: { fill: SCENE.sea },
  second: { stroke: colors.accent, strokeLinecap: 'round' },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  status: {
    alignItems: 'center',
    columnGap: 6,
    display: 'flex',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
  },
  storeClosed: { backgroundColor: SCENE.closed },
  storeOpen: { backgroundColor: SCENE.open },
  story: { margin: 0 },
  strong: { fontWeight: font.weightMedium },
  tick: { stroke: colors.muted, strokeLinecap: 'round' },
  time: {
    fontFamily: font.mono,
    fontSize: font.sizeLg,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.3,
  },
  total: {
    fontWeight: font.weightMedium,
    paddingBlockStart: spacing.s1,
  },
  // Where the route started: a ring in the trail's color.
  start: { fill: colors.raised, stroke: colors.accent, strokeWidth: 2 },
  trail: {
    fill: 'none',
    stroke: colors.accent,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2.5,
  },
  xs: { color: colors.muted, fontSize: font.sizeXs, lineHeight: 1.4 },
});

/** Whether the visitor, or the motion knob, asks for less motion. */
function still(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const lessMotion = live(still, onMedia('(prefers-reduced-motion: reduce)'));

// One fixed instant for the order's date, read in UTC, so only the locale moves it.
const SAMPLE_DATE = Date.UTC(2026, 9, 4, 9, 30);
const SAMPLE_COUNTS = [0, 1, 2, 5];
// The cart: product names, the same in every language, and their prices in euros.
const CART: ReadonlyArray<readonly [string, number]> = [
  ['iPhone', 999],
  ['Pixel', 699],
  ['iPad', 449],
];

/** The `lang` and `dir` of the document, which the locale and direction knobs write. */
const onLanguage: Watch = (update) => {
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributeFilter: ['dir', 'lang'] });
  return () => observer.disconnect();
};

function euros(value: number): string {
  return or(() =>
    new Intl.NumberFormat(undefined, { currency: 'EUR', style: 'currency' }).format(value),
  );
}

const locale = live(
  () => {
    const count = CART.length;
    return {
      count: or(() => new Intl.NumberFormat().format(count)),
      date: or(() =>
        new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
          SAMPLE_DATE,
        ),
      ),
      direction: getComputedStyle(document.documentElement).direction,
      language: navigator.language,
      list: or(() =>
        new Intl.ListFormat(undefined, { type: 'conjunction' }).format(CART.map(([name]) => name)),
      ),
      number: or(() => new Intl.NumberFormat().format(1_234_567.891)),
      one: or(() => new Intl.PluralRules().select(count)) === 'one',
      plural: or(() => {
        const rules = new Intl.PluralRules();
        return SAMPLE_COUNTS.map((sample) => `${sample} ${rules.select(sample)}`).join(', ');
      }),
      prices: CART.map(([, price]) => euros(price)),
      relative: or(() =>
        new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-1, 'day'),
      ),
      total: euros(CART.reduce((sum, [, price]) => sum + price, 0)),
    };
  },
  all(onWindow('languagechange'), onLanguage),
);

// Holds a line's height until the page has read its value.
const EMPTY = ' ';

/** A line of the receipt: a name at the start, its value at the end, in either direction. */
function ReceiptLine({ end, start, style }: { end: ReactNode; start: ReactNode; style?: 'total' }) {
  return (
    <div {...props(styles.line, style === 'total' && styles.total)}>
      <span>{start}</span>
      <span {...props(styles.num)}>{end}</span>
    </div>
  );
}

/**
 * A small checkout, written by `Intl` in the language the page reads: the
 * date, the prices, the count, the list and when it was ordered. Its lines
 * are laid out from the start of the line, so a right-to-left direction turns
 * it around; pseudo rewrites its words with the rest of the page.
 */
export function LocaleCard() {
  const read = useLive(locale);
  const count = read?.count ?? EMPTY;
  return (
    <Card title={m.knob_locale()}>
      <div {...props(styles.box)}>
        <div {...props(styles.line)}>
          <span {...props(styles.status)}>
            <span {...props(styles.muteText)}>{m.locale_cart()}</span>
            <ChevronRightIcon
              {...ICON}
              {...props(styles.chevron, read?.direction === 'rtl' && styles.flip)}
            />
            <span {...props(styles.strong)}>{m.locale_checkout()}</span>
          </span>
          <span {...props(styles.xs)}>{read?.date ?? EMPTY}</span>
        </div>
        {CART.map(([name], index) => (
          <ReceiptLine end={read?.prices[index] ?? EMPTY} key={name} start={name} />
        ))}
        <span {...props(styles.xs)}>
          {read === null ? EMPTY : read.one ? m.locale_item({ count }) : m.locale_items({ count })}
          {read === null ? null : ` · ${read.list}`}
        </span>
        <ReceiptLine end={read?.total ?? EMPTY} start={m.locale_total()} style="total" />
        <span {...props(styles.xs)}>
          {read === null ? EMPTY : m.locale_ordered({ when: read.relative })}
        </span>
      </div>
      <Rows>
        <Row name={m.read_language()} value={read?.language ?? null} />
        <Row name={m.read_direction()} value={read?.direction ?? null} />
        <Row name={m.read_number()} value={read?.number ?? null} />
        <Row name={m.read_plural()} value={read?.plural ?? null} />
      </Rows>
    </Card>
  );
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The store's hours, on the page's clock in its zone.
const OPENS = 9;
const CLOSES = 18;

function two(value: number): string {
  return String(Math.trunc(value)).padStart(2, '0');
}

/** `UTC+03:00`, from what `getTimezoneOffset` reports. */
function offsetOf(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const size = Math.abs(minutes);
  return `UTC${minutes < 0 ? '-' : '+'}${two(size / 60)}:${two(size % 60)}`;
}

/** A span of time in its largest unit, as the language says it: `2 days ago`. */
function relative(ms: number): string {
  const size = Math.abs(ms);
  const [unit, per]: [Intl.RelativeTimeFormatUnit, number] =
    size >= DAY
      ? ['day', DAY]
      : size >= HOUR
        ? ['hour', HOUR]
        : size >= MINUTE
          ? ['minute', MINUTE]
          : ['second', SECOND];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    Math.trunc(ms / per),
    unit,
  );
}

/** `05:12:09`, in the language's digits. */
function countdown(ms: number): string {
  const pad = new Intl.NumberFormat(undefined, { minimumIntegerDigits: 2, useGrouping: false });
  return [
    Math.floor(ms / HOUR),
    Math.floor((ms % HOUR) / MINUTE),
    Math.floor((ms % MINUTE) / SECOND),
  ]
    .map((part) => pad.format(part))
    .join(':');
}

/** The hour of today on the page's clock, as the language writes a time: `9:00 AM`. */
function hourOf(now: Date, hour: number): string {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  return or(() => new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(at));
}

// The first instant the page read, on whatever clock it had then.
let opened: number | undefined;
// The last time the page measured its clock against real time, and what it found.
let measured: { at: number; now: number; rate: number } | undefined;

/** How fast the page's clock runs against `performance.now`, which keeps real time. */
function rateOf(now: number): number {
  const at = performance.now();
  if (measured === undefined) {
    measured = { at, now, rate: 1 };
  } else if (at - measured.at >= 900) {
    measured = { at, now, rate: (now - measured.now) / (at - measured.at) };
  }
  return measured.rate;
}

// The clock as the last tick read it. A read uses it and never the clock itself, so two reads
// between ticks agree, as React needs them to, however fast the clock runs.
let tick: { now: Date; rate: number } | undefined;
const ticks = all(every(SECOND), onWindow('languagechange'));

function readTick(): { now: Date; rate: number } {
  const now = new Date();
  return { now, rate: rateOf(now.getTime()) };
}

const time = live(
  () => {
    tick ??= readTick();
    const { now, rate } = tick;
    opened ??= now.getTime();
    const since = opened;
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const hour = now.getHours();
    const open = hour >= OPENS && hour < CLOSES;
    return {
      change: hourOf(now, open ? CLOSES : OPENS),
      date: or(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now)),
      midnight: or(() => countdown(midnight.getTime() - now.getTime())),
      open,
      opened: or(() => relative(since - now.getTime())),
      // Two digits are enough to tell 1, 60 and 3600 apart through a frame's jitter.
      rate: or(
        () => `${new Intl.NumberFormat(undefined, { maximumSignificantDigits: 2 }).format(rate)}×`,
      ),
      time: or(() => new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(now)),
      zone: `${new Intl.DateTimeFormat().resolvedOptions().timeZone}, ${offsetOf(now)}`,
    };
  },
  // The clock has no event: the page looks again every second, as a page with a clock on it does.
  (update) =>
    ticks(() => {
      tick = readTick();
      update();
    }),
);

/**
 * The page's clock as hands, read every frame while the card is in view (every
 * second where less motion is asked for), so a fast clock spins them. The
 * second hand goes where the clock runs too fast for it to read as one.
 */
function Face() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref);
  const calm = useLive(lessMotion) === true;
  const [hands, setHands] = useState<{
    hour: number;
    minute: number;
    second: number | null;
  } | null>(null);
  useEffect(() => {
    if (!inView) {
      return;
    }
    let frame = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let last = { clock: Date.now(), rate: 1, real: performance.now() };
    const draw = () => {
      const now = new Date();
      const real = performance.now();
      if (real - last.real >= 500) {
        last = {
          clock: now.getTime(),
          rate: (now.getTime() - last.clock) / (real - last.real),
          real,
        };
      }
      const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
      const minutes = now.getMinutes() + seconds / 60;
      setHands({
        hour: ((now.getHours() % 12) + minutes / 60) * 30,
        minute: minutes * 6,
        second: Math.abs(last.rate) > 20 ? null : seconds * 6,
      });
    };
    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    if (calm) {
      draw();
      timer = setInterval(draw, SECOND);
    } else {
      loop();
    }
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [inView, calm]);
  return (
    // Redrawn every frame, so session replays leave it out (`data-replay-block`).
    <svg
      {...props(styles.clock)}
      aria-hidden="true"
      data-replay-block=""
      ref={ref}
      viewBox="-50 -50 100 100"
    >
      <circle {...props(styles.face)} r={49} />
      {Array.from({ length: 12 }, (_, index) => (
        <line
          {...props(styles.tick)}
          key={index}
          strokeWidth={index % 3 === 0 ? 3 : 1.5}
          transform={`rotate(${index * 30})`}
          x1={0}
          x2={0}
          y1={-43}
          y2={index % 3 === 0 ? -35 : -39}
        />
      ))}
      {hands === null ? null : (
        <>
          <line
            {...props(styles.hand)}
            strokeWidth={4}
            transform={`rotate(${hands.hour})`}
            y1={6}
            y2={-24}
          />
          <line
            {...props(styles.hand)}
            strokeWidth={3}
            transform={`rotate(${hands.minute})`}
            y1={8}
            y2={-36}
          />
          {hands.second === null ? null : (
            <line
              {...props(styles.second)}
              strokeWidth={1.5}
              transform={`rotate(${hands.second})`}
              y1={10}
              y2={-40}
            />
          )}
        </>
      )}
      <circle {...props(styles.pin)} r={3.5} />
    </svg>
  );
}

// What the server said it got with the last press, null before the first.
const server = held<string | null>(null);

async function askServer(): Promise<void> {
  try {
    const response = await fetch(`${API}/echo`);
    const answer = (await response.json()) as { headers?: Record<string, string> };
    const sent = answer.headers?.['x-devknobs-now'];
    server.set(sent ?? m.time_server_none());
  } catch {
    server.set(m.requests_failed());
  }
}

/**
 * A clock face, a store open from 9 to 18 and the time left until midnight,
 * all on the page's clock in its zone, so the clock and the time zone knobs
 * move them. The button asks the page's own server which time came with the
 * request, for "send to server".
 */
export function TimeCard() {
  const read = useLive(time);
  const got = useLive(server);
  return (
    <Card title={m.knob_time()}>
      <div {...props(styles.box, styles.scene)}>
        <Face />
        <div {...props(styles.stack)}>
          <span {...props(styles.status)}>
            <span
              {...props(styles.dot, read?.open === true ? styles.storeOpen : styles.storeClosed)}
            />
            {read === null
              ? EMPTY
              : read.open
                ? m.time_open({ time: read.change })
                : m.time_closed({ time: read.change })}
          </span>
          <span {...props(styles.time)}>{read?.time ?? EMPTY}</span>
          <span {...props(styles.xs)}>{read?.zone ?? EMPTY}</span>
          <span {...props(styles.xs)}>
            {read === null ? EMPTY : m.time_midnight({ left: read.midnight })}
          </span>
        </div>
      </div>
      <Rows>
        <Row name={m.read_day()} value={read?.date ?? null} />
        <Row name={m.read_opened()} value={read?.opened ?? null} />
        <Row name={m.read_clock_rate()} value={read?.rate ?? null} />
        <Row name={m.read_server()} value={got} />
      </Rows>
      <Chips>
        <Chip onClick={() => void askServer()}>{m.time_ask()}</Chip>
      </Chips>
      <p {...props(styles.xs, styles.story)}>
        {m.time_story()} <code {...props(styles.code)}>{'+2d'}</code> {m.time_story_end()}
      </p>
    </Card>
  );
}

type Fix = { accuracy: number; lat: number; lng: number };
type Point = readonly [lng: number, lat: number];

type Place = {
  /** The error's code, 0 without one. */
  code: number;
  /** The last position heard, kept through a failure so the map stays there. */
  fix: Fix | null;
  message: string;
  status: 'asking' | 'failed' | 'found' | 'missing';
  /** The positions heard one after another, close together, as a route plays them. */
  trail: ReadonlyArray<Point>;
};

// What geolocation last said, null until the visitor asks.
const place = held<Place | null>(null);
// The watch that is on, so a second press starts over and leaving the page ends it.
let watching: number | undefined;

function stopWatching(): void {
  if (watching !== undefined) {
    navigator.geolocation.clearWatch(watching);
    watching = undefined;
  }
}

/** The three failures by the names the spec gives their codes. */
const FAILURES: Record<number, string> = {
  1: 'PERMISSION_DENIED',
  2: 'POSITION_UNAVAILABLE',
  3: 'TIMEOUT',
};
const DENIED = 1;
const TIMEOUT = 3;

// A position this many degrees from the last is a jump, which starts a new trail.
const JUMP = 0.5;
const TRAIL = 400;
// A move shorter than this, or than either fix's accuracy, is a device's jitter, not a step of a route.
const STEADY = 25;
const METERS_PER_DEGREE = 111_320;

/** About how far apart two positions are, in meters: plenty for the few meters a step takes. */
function metersBetween([lngA, latA]: Point, [lngB, latB]: Point): number {
  const across = (lngB - lngA) * Math.cos((((latA + latB) / 2) * Math.PI) / 180);
  return Math.hypot(across, latB - latA) * METERS_PER_DEGREE;
}

/**
 * Asks for the position, and keeps hearing where it is, so a route in the geo
 * knob moves the pin and draws its trail. Only a press starts it: the browser
 * may ask the visitor for permission.
 */
function watchPlace(): void {
  if (!('geolocation' in navigator)) {
    place.set({ code: 0, fix: null, message: '', status: 'missing', trail: [] });
    return;
  }
  stopWatching();
  const last = place.read();
  place.set({
    code: 0,
    fix: last?.fix ?? null,
    message: '',
    status: 'asking',
    trail: last?.trail ?? [],
  });
  watching = navigator.geolocation.watchPosition(
    ({ coords }) => {
      const now = place.read();
      const trail = now?.trail ?? [];
      const point: Point = [coords.longitude, coords.latitude];
      const end = trail.at(-1);
      const near =
        end !== undefined &&
        Math.abs(end[0] - point[0]) < JUMP &&
        Math.abs(end[1] - point[1]) < JUMP;
      const same =
        end !== undefined &&
        metersBetween(end, point) <= Math.max(STEADY, coords.accuracy, now?.fix?.accuracy ?? 0);
      place.set({
        code: 0,
        fix: { accuracy: coords.accuracy, lat: coords.latitude, lng: coords.longitude },
        message: '',
        status: 'found',
        trail: same ? trail : near ? [...trail, point].slice(-TRAIL) : [point],
      });
    },
    (error) => {
      const now = place.read();
      place.set({
        code: error.code,
        fix: now?.fix ?? null,
        message: error.message,
        status: 'failed',
        trail: now?.trail ?? [],
      });
    },
    { timeout: 6000 },
  );
}

// The map's frame, in its own units: twice as wide as tall, so the whole world fits at 360 degrees.
const WIDTH = 320;
const HEIGHT = 160;
// How much of the world the map shows around one position, and around a route at least, in degrees of longitude.
const AROUND = 40;
const CLOSEST = 0.008;
const GLIDE = 900;
// A playing route moves once a second.
const STEP = 1000;

/** Where the map looks: its center and how many degrees of longitude it spans, and where the pin is. */
type View = { lat: number; lng: number; pinLat: number; pinLng: number; span: number };

const WORLD: View = { lat: 0, lng: 0, pinLat: 0, pinLng: 0, span: 360 };

/**
 * The whole world with no position, or where the page is blocked from one;
 * the region around a position; the route so far while one plays.
 */
function viewOf(read: Place | null): View {
  const fix = read?.fix;
  if (fix === null || fix === undefined || (read?.status === 'failed' && read.code !== TIMEOUT)) {
    return WORLD;
  }
  const pin = { pinLat: fix.lat, pinLng: fix.lng };
  const trail = read?.status === 'found' ? read.trail : [];
  if (trail.length < 2) {
    return { ...pin, ...clamp(fix.lat, fix.lng, AROUND) };
  }
  const lngs = [...trail.map(([lng]) => lng), fix.lng];
  const lats = [...trail.map(([, lat]) => lat), fix.lat];
  const [west, east, south, north] = [
    Math.min(...lngs),
    Math.max(...lngs),
    Math.min(...lats),
    Math.max(...lats),
  ];
  const span = Math.min(AROUND, Math.max(CLOSEST, (east - west) * 1.6, (north - south) * 3.2));
  return { ...pin, ...clamp((south + north) / 2, (west + east) / 2, span) };
}

/** A center that keeps the poles' edges inside the frame. */
function clamp(lat: number, lng: number, span: number): Pick<View, 'lat' | 'lng' | 'span'> {
  const half = span / 4;
  return { lat: Math.max(-90 + half, Math.min(90 - half, lat)), lng, span };
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * The view on screen, which glides to each new one: a pan with a zoom out and
 * back in for a long way, a steady pan for a step along a route (which moves
 * once a second), at once where less motion is asked for or off screen.
 */
function useGlide(target: View, inView: boolean): View {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  const calm = useLive(lessMotion) === true;
  const { lat, lng, pinLat, pinLng, span } = target;
  useEffect(() => {
    const to = { lat, lng, pinLat, pinLng, span };
    const from = current.current;
    if (
      from.lat === to.lat &&
      from.lng === to.lng &&
      from.pinLat === to.pinLat &&
      from.pinLng === to.pinLng &&
      from.span === to.span
    ) {
      return;
    }
    const show = (view: View) => {
      current.current = view;
      setShown(view);
    };
    if (calm || !inView) {
      show(to);
      return;
    }
    const far = Math.hypot(to.lng - from.lng, to.lat - from.lat);
    const lift = Math.min(6, far / Math.max(from.span, to.span));
    const steady = far < Math.min(from.span, to.span) / 2;
    const glide = steady ? STEP : GLIDE;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / glide);
      const e = steady ? t : ease(t);
      const mix = (a: number, b: number) => a + (b - a) * e;
      show({
        lat: mix(from.lat, to.lat),
        lng: mix(from.lng, to.lng),
        pinLat: mix(from.pinLat, to.pinLat),
        pinLng: mix(from.pinLng, to.pinLng),
        span: Math.min(
          360,
          Math.exp(mix(Math.log(from.span), Math.log(to.span))) *
            (1 + lift * Math.sin(Math.PI * e)),
        ),
      });
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lat, lng, pinLat, pinLng, span, calm, inView]);
  return shown;
}

// Closer than this many degrees the 1:110m land says little, so a small world beside it shows where the map is.
const INSET_FROM = 8;
const INSET = { gap: 6, height: 36, width: 72 };

/**
 * The whole world, small, in a corner of the map, with a dot where the pin is:
 * the bottom right, or the top left when the pin is under that corner.
 */
function WorldInset({ lat, lng, x, y }: { lat: number; lng: number; x: number; y: number }) {
  const { gap, height, width } = INSET;
  const right = WIDTH - gap - width;
  const bottom = HEIGHT - gap - height;
  const covered = x > right - gap && y > bottom - gap;
  const left = covered ? gap : right;
  const top = covered ? gap : bottom;
  const k = width / 360;
  return (
    <g aria-hidden="true">
      <rect {...props(styles.inset)} height={height} rx={4} width={width} x={left} y={top} />
      <path
        {...props(styles.insetLand)}
        d={LAND}
        transform={`translate(${left + width / 2} ${top + height / 2}) scale(${k / 4})`}
      />
      <circle
        {...props(styles.insetDot)}
        cx={left + width / 2 + lng * k}
        cy={top + height / 2 - lat * k}
        r={2.5}
      />
    </g>
  );
}

const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45];

/** Lines of longitude and latitude, a few across the frame, so a pan shows at any zoom. */
function gridOf(view: View, k: number): { xs: Array<number>; ys: Array<number> } {
  const step = STEPS.find((size) => size >= view.span / 6) ?? 45;
  const xs: Array<number> = [];
  const ys: Array<number> = [];
  const west = view.lng - WIDTH / 2 / k;
  const north = view.lat + HEIGHT / 2 / k;
  for (let lng = Math.ceil(west / step) * step; (lng - west) * k <= WIDTH; lng += step) {
    xs.push((lng - west) * k);
  }
  for (let lat = Math.floor(north / step) * step; (north - lat) * k <= HEIGHT; lat -= step) {
    ys.push((north - lat) * k);
  }
  return { xs, ys };
}

/** A map of the position the page heard, the route it came along, and how sure it is. */
function PlaceMap({ read }: { read: Place | null }) {
  const box = useRef<HTMLDivElement>(null);
  const view = useGlide(viewOf(read), useInView(box));
  // Pixels of the frame per degree.
  const k = WIDTH / view.span;
  const at = (lng: number, lat: number) =>
    [WIDTH / 2 + (lng - view.lng) * k, HEIGHT / 2 - (lat - view.lat) * k] as const;
  const grid = gridOf(view, k);
  const status = read?.status;
  const failed = status === 'failed' && read?.code !== TIMEOUT;
  const looking = status === 'asking' || (status === 'failed' && read?.code === TIMEOUT);
  const showPin = read?.fix !== null && read?.fix !== undefined && !failed;
  const [x, y] = at(view.pinLng, view.pinLat);
  const reach = showPin && read?.fix ? (read.fix.accuracy / METERS_PER_DEGREE) * k : 0;
  const [startX, startY] = at(...(read?.trail[0] ?? [0, 0]));
  // The trail ends where the pin is drawn, which glides behind the last position heard.
  const path = read?.trail ?? [];
  const end = path.at(-1);
  const heard = end !== undefined && end[0] === read?.fix?.lng && end[1] === read.fix.lat;
  const trail = [...(heard ? path.slice(0, -1) : path).map(([lng, lat]) => at(lng, lat)), [x, y]]
    .map((point) => point.join(','))
    .join(' ');
  const note =
    status === undefined
      ? { icon: <LocateIcon {...ICON} />, text: m.location_idle() }
      : status === 'missing'
        ? { icon: <MapPinOffIcon {...ICON} />, text: m.read_none() }
        : status === 'asking'
          ? { icon: <LocateIcon {...ICON} />, text: m.location_looking() }
          : status === 'failed'
            ? read?.code === DENIED
              ? { icon: <LocateOffIcon {...ICON} />, text: m.location_blocked() }
              : read?.code === TIMEOUT
                ? { icon: <LocateIcon {...ICON} />, text: m.location_timeout() }
                : { icon: <MapPinOffIcon {...ICON} />, text: m.location_unavailable() }
            : null;
  return (
    <div {...props(styles.mapBox)} ref={box}>
      <svg
        {...props(styles.map, (failed || status === 'missing') && styles.muted)}
        aria-label={m.location_map()}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <rect {...props(styles.sea)} height={HEIGHT} width={WIDTH} />
        <path
          {...props(styles.land)}
          d={LAND}
          transform={`translate(${WIDTH / 2 - view.lng * k} ${HEIGHT / 2 + view.lat * k}) scale(${k / 4})`}
        />
        {grid.xs.map((gx) => (
          <line {...props(styles.grid)} key={`x${gx}`} x1={gx} x2={gx} y1={0} y2={HEIGHT} />
        ))}
        {grid.ys.map((gy) => (
          <line {...props(styles.grid)} key={`y${gy}`} x1={0} x2={WIDTH} y1={gy} y2={gy} />
        ))}
        {read?.status === 'found' && read.trail.length > 1 ? (
          <>
            <polyline {...props(styles.trail)} points={trail} />
            <circle {...props(styles.start)} cx={startX} cy={startY} r={3.5} />
          </>
        ) : null}
        {reach > 7 ? <circle {...props(styles.reach)} cx={x} cy={y} r={reach} /> : null}
        {looking ? <circle {...props(styles.ring)} cx={x} cy={y} r={6} /> : null}
        {showPin || looking ? (
          <circle {...props(styles.pin, looking && styles.faded)} cx={x} cy={y} r={5} />
        ) : null}
        {showPin && view.span < INSET_FROM ? (
          <WorldInset lat={view.pinLat} lng={view.pinLng} x={x} y={y} />
        ) : null}
      </svg>
      {note === null ? null : (
        <span {...props(styles.note)}>
          {note.icon}
          {note.text}
        </span>
      )}
    </div>
  );
}

function stateOf(read: Place | null): string {
  switch (read?.status) {
    case undefined:
      return m.location_idle();
    case 'missing':
      return m.read_none();
    case 'asking':
      return m.location_asking();
    case 'found':
      return m.location_found();
    case 'failed':
      return FAILURES[read.code] ?? read.message;
  }
}

/** A map of the position geolocation reports, or the error it fails with. */
export function LocationCard() {
  const read = useLive(place);
  useEffect(() => stopWatching, []);
  const fix = read?.status === 'found' ? read.fix : null;
  return (
    <Card title={m.knob_location()}>
      <PlaceMap read={read} />
      <Rows>
        <Row name={m.read_position()} value={stateOf(read)} />
        <Row name={m.read_latitude()} value={fix ? fix.lat.toFixed(5) : null} />
        <Row name={m.read_longitude()} value={fix ? fix.lng.toFixed(5) : null} />
        <Row name={m.read_accuracy()} value={fix ? unit(fix.accuracy, 'meter') : null} />
      </Rows>
      <Chips>
        <Chip onClick={watchPlace}>{m.location_ask()}</Chip>
      </Chips>
    </Card>
  );
}
