import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, firstThatWorks, props } from '@stylexjs/stylex';
import { ClipboardCheckIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bubble } from '../lib/bubble.tsx';
import { StarLink } from '../lib/github.tsx';
import { ICON } from '../lib/icon.ts';
import { Key } from '../lib/keys.tsx';
import { m } from '../paraglide/messages.js';
import { Layer } from './layer.tsx';
import {
  closeTour,
  exploreKnobs,
  isTop,
  STOPS,
  takesEscape,
  tourKnobs,
  useProgress,
} from './progress.ts';
import { type Aim, aimAt, aimAtPanel, aimAtSearch, type Say } from './targets.ts';

const LINES: Record<Say, () => string> = {
  addDevice: m.tour_add_device,
  addMat: m.tour_add_mat,
  bars: m.tour_bars,
  browser: m.tour_browser,
  duo: m.tour_duo,
  entryDevice: m.tour_entry_device,
  entryMat: m.tour_entry_mat,
  explore: m.tour_explore,
  filter: m.tour_filter,
  grab: m.tour_grab,
  iphone: m.tour_iphone,
  mat: m.tour_mat,
  open: m.tour_open,
  pick: m.tour_pick,
  rowDevice: m.tour_row_device,
  rowMat: m.tour_row_mat,
  scroll: m.tour_scroll,
  searchDevice: m.tour_search_device,
  searchMat: m.tour_search_mat,
  settings: m.tour_settings,
  unfold: m.tour_unfold,
};

// The key that does the same as the control the caption points at.
const KEYS: Partial<Record<Say, () => string>> = {
  grab: m.hint_grab_key,
  open: m.hint_panel_key,
};

// The targets on a device's screen, where the frame takes its stronger line.
const ON_SCREEN: ReadonlySet<Say> = new Set<Say>(['bars', 'scroll']);

const styles = create({
  // grab's label bar, with what to do next in it.
  bar: {
    alignItems: 'center',
    backgroundColor: colors.grabBar,
    borderRadius: radius.bar,
    color: colors.grabBarText,
    columnGap: 6,
    display: 'flex',
    fontSize: '0.8125rem',
    lineHeight: '1rem',
    paddingBlock: 6,
    paddingInline: spacing.s2,
    whiteSpace: 'nowrap',
  },
  barClose: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: radius.base,
    borderStyle: 'none',
    color: {
      ':hover': colors.grabBarText,
      default: colors.grabTag,
    },
    cursor: 'pointer',
    display: 'flex',
    outlineColor: colors.grabBarText,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    padding: 0,
    pointerEvents: 'auto',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease-out',
  },
  // The panel's small icon button: faint, and the track ground on hover.
  bubbleClose: {
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
    pointerEvents: 'auto',
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
    transitionTimingFunction: 'ease-out',
    width: 22,
  },
  bubbleLine: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    margin: 0,
    paddingBlock: spacing.s1,
    paddingInline: '10px 4px',
  },
  // What grab copied, all of it, as the page's code boxes show code. A long
  // one scrolls in its box, which takes the pointer to scroll and to select.
  copied: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    fontFamily: font.mono,
    fontSize: '0.75rem',
    lineHeight: '18px',
    margin: 0,
    maxHeight: firstThatWorks('40dvh', '40vh'),
    overflowWrap: 'anywhere',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    paddingBlock: 6,
    paddingInline: spacing.s2,
    pointerEvents: 'auto',
    whiteSpace: 'pre-wrap',
  },
  // The panel's chip as a button, 4 round inside the bubble's 8 and 13: the track ground, raised on hover.
  explore: {
    alignItems: 'center',
    backgroundColor: {
      ':hover': colors.raised,
      default: colors.track,
    },
    borderRadius: radius.base,
    borderStyle: 'none',
    boxShadow: {
      ':hover': shadow.lift,
      default: 'none',
    },
    color: colors.fg,
    columnGap: spacing.s2,
    cursor: 'pointer',
    display: 'flex',
    flexShrink: 0,
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    lineHeight: '20px',
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: spacing.s1,
    paddingInline: spacing.s2,
    pointerEvents: 'auto',
    transitionDuration: '120ms',
    transitionProperty: 'background-color, box-shadow',
    transitionTimingFunction: 'ease-out',
    whiteSpace: 'nowrap',
  },
  grow: {
    flexGrow: 1,
    minWidth: 0,
  },
  icon: {
    display: 'flex',
    flexShrink: 0,
  },
  // The setup prompt and what to do after it: side by side, or one under the other in a narrow bubble.
  next: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s1,
  },
  // The star link under the bubble's buttons, which takes the pointer.
  star: {
    pointerEvents: 'auto',
  },
  // The setup prompt, whose copy button takes the pointer.
  takes: {
    flexBasis: 'auto',
    flexGrow: 1,
    minWidth: 0,
    pointerEvents: 'auto',
  },
});

/**
 * The guided tour: a frame around the real control to use next, which moves on
 * by itself as the visitor uses it. Only the top page draws it.
 * `install` is the setup prompt. Once every stop is done one bubble takes
 * the caption's place: what the last pick copied, and how to install.
 */
export function Tour({ install }: { install: ReactNode }) {
  const progress = useProgress();
  // What the layer last found to say, which follows the page, not only the stop.
  const [say, setSay] = useState<Say | null>(null);
  const ended = progress.phase === 'end';
  // The list of knobs did not open: the panel's search is the place, for a moment.
  const exploring = progress.phase === 'explore';
  const showing = progress.phase !== 'off' && isTop();
  // The scroll just done keeps the screen a moment, to watch the bars move.
  const stop = progress.watching ? 'scroll' : STOPS.find((id) => !progress.done.includes(id));

  useEffect(() => {
    if (!showing) {
      return;
    }
    // After the panel's and grab's own listeners, and only when neither had a use for the key.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && takesEscape()) {
        closeTour();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showing]);

  const aim = (): Aim => {
    const knobs = tourKnobs();
    let next: Aim = { clip: null, el: null, say: ended ? null : 'open' };
    if (exploring) {
      next = aimAtSearch();
    } else if (knobs !== undefined) {
      next =
        ended || stop === undefined ? aimAtPanel(knobs) : aimAt(stop, knobs, progress.watching);
    }
    setSay(next.say);
    return next;
  };

  const line = ended || say === null ? null : LINES[say]();
  const key = ended || say === null ? undefined : KEYS[say]?.();

  return (
    showing &&
    typeof document !== 'undefined' &&
    createPortal(
      <Layer
        aim={aim}
        boxed={!ended}
        // Only at the first stop, until the panel opens: from there the panel and the page are the
        // visitor's to use.
        dim={progress.phase === 'on' && progress.done.length === 0}
        pulseKey={exploring ? 'explore' : progress.watching ? 'bars' : (stop ?? 'end')}
        said={ended ? m.tour_copied() : (line ?? '')}
        strong={say !== null && ON_SCREEN.has(say)}
      >
        {line !== null && (
          <div {...props(styles.bar)}>
            {line}
            {key !== undefined && <Key>{key}</Key>}
            {/* While grab is on every click on the page is a pick: the caption takes none. */}
            {say !== 'pick' && (
              <button
                {...props(styles.barClose)}
                aria-label={m.tour_close()}
                onClick={closeTour}
                type="button"
              >
                <XIcon {...ICON} />
              </button>
            )}
          </div>
        )}
        {ended && (
          <Bubble>
            <p {...props(styles.bubbleLine)}>
              <span {...props(styles.icon)}>
                <ClipboardCheckIcon {...ICON} />
              </span>
              <span {...props(styles.grow)}>{m.tour_copied()}</span>
              <button
                {...props(styles.bubbleClose)}
                aria-label={m.tour_close()}
                onClick={closeTour}
                type="button"
              >
                <XIcon {...ICON} />
              </button>
            </p>
            {progress.grabbed !== null && <pre {...props(styles.copied)}>{progress.grabbed}</pre>}
            <p {...props(styles.bubbleLine)}>{m.tour_end()}</p>
            <div {...props(styles.next)}>
              <div {...props(styles.takes)}>{install}</div>
              <button {...props(styles.explore)} onClick={exploreKnobs} type="button">
                <SlidersHorizontalIcon {...ICON} />
                {m.tour_explore()}
              </button>
            </div>
            <p {...props(styles.bubbleLine)}>
              <StarLink placement="tour" quiet style={styles.star} />
            </p>
          </Bubble>
        )}
      </Layer>,
      document.body,
    )
  );
}
