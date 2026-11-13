import { colors, spacing } from '@knobs/ui/tokens.stylex';
import { create, defaultMarker, props, type StyleXStyles, when } from '@stylexjs/stylex';
import { m } from '../paraglide/messages.js';
import { track } from './analytics.ts';

/** Where the credit is: the landing's footer, or the foot of a docs, blog or use page. */
type Placement = 'blog' | 'docs' | 'footer' | 'use';

const vinena = (placement: Placement) =>
  `https://vinena.studio/?utm_source=knobs.dev&utm_medium=referral&utm_campaign=${placement}`;

const styles = create({
  // The docs' and the blog's foot: the credit alone, centered under the page, at the landing footer's size.
  foot: {
    display: 'flex',
    fontSize: '0.8125rem',
    justifyContent: 'center',
    marginTop: spacing.s12,
  },
  // The landing footer's links' focus ring.
  footLink: {
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
  },
  // On the words and the wordmark, not the link: app.css sets `footer a` past StyleX.
  ink: {
    color: {
      default: colors.muted,
      [when.ancestor(':focus-visible')]: colors.fg,
      [when.ancestor(':hover')]: colors.fg,
    },
    transitionDuration: {
      '@media (prefers-reduced-motion: reduce)': '0s',
      default: '300ms',
    },
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
  link: {
    alignItems: 'center',
    columnGap: '0.4em',
    display: 'inline-flex',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  // About 11px at the footer's 13px text, the wordmark's own width beside it.
  wordmark: {
    height: '0.85em',
    width: 'auto',
  },
});

// The studio's line: muted words and wordmark, both turning to the text color together.
export function CraftedAtVinena({
  placement = 'footer',
  style,
}: {
  placement?: Placement;
  style?: StyleXStyles | undefined;
}) {
  return (
    <a
      href={vinena(placement)}
      onClick={() => track('outbound_click', { placement, to: 'vinena.studio' })}
      rel="noreferrer"
      target="_blank"
      {...props(styles.link, style, defaultMarker())}
    >
      <span {...props(styles.ink)}>{m.link_vinena_before()}</span>
      <svg
        aria-label={m.link_vinena()}
        fill="currentColor"
        role="img"
        viewBox="-3.1 0 537.6 100"
        {...props(styles.ink, styles.wordmark)}
      >
        <path d="M147.7 0L205.7 39.97C212.299 35.383 217.85 29.448 221.987 22.559C226.124 15.669 228.753 7.98 229.7 0C240.978 32.123 243.056 66.759 235.7 100L177.7 60.03C171.101 64.617 165.55 70.552 161.413 77.441C157.276 84.331 154.647 92.02 153.7 100C142.422 67.877 140.344 33.241 147.7 0ZM332.2 0L390.2 39.97C396.799 35.383 402.35 29.448 406.487 22.559C410.624 15.669 413.253 7.98 414.2 0C425.478 32.123 427.556 66.759 420.2 100L362.2 60.03C355.601 64.617 350.05 70.552 345.913 77.441C341.776 84.331 339.147 92.02 338.2 100C326.922 67.877 324.844 33.241 332.2 0ZM256.7 0L320.788 0C321.757 -0.025 322.728 -0.025 323.7 0C308.09 8.286 293.044 17.594 278.662 27.864C277.746 28.519 276.999 29.382 276.484 30.383C275.969 31.384 275.7 32.494 275.7 33.619C275.7 35.495 276.445 37.294 277.771 38.62C279.054 39.903 280.78 40.642 282.589 40.689C282.662 40.69 282.735 40.69 282.808 40.691C288.331 40.737 292.836 39.957 297.815 39.096C299.95 38.726 302.172 38.341 304.599 38C301.662 41.307 300.039 45.577 300.039 50C300.039 54.423 301.662 58.693 304.599 62C302.172 61.659 299.95 61.274 297.815 60.904C292.836 60.043 288.331 59.263 282.808 59.309C282.735 59.31 282.662 59.31 282.589 59.311C280.78 59.358 279.054 60.097 277.771 61.38C276.445 62.706 275.7 64.505 275.7 66.381C275.7 67.506 275.969 68.616 276.484 69.617C276.999 70.618 277.746 71.481 278.662 72.136C293.044 82.406 308.09 91.714 323.7 100C322.728 100.025 321.757 100.025 320.788 100L256.7 100C247.367 67.32 247.367 32.68 256.7 0ZM0 0C1.758 11.149 7.438 21.304 16.018 28.637C19.433 31.557 23.219 33.952 27.25 35.779C26.953 37.155 26.8 38.57 26.8 40C26.8 45.304 28.907 50.391 32.658 54.142C36.409 57.893 41.496 60 46.8 60C52.104 60 57.191 57.893 60.942 54.142C64.693 50.391 66.8 45.304 66.8 40C66.8 38.57 66.647 37.155 66.35 35.779C70.381 33.952 74.167 31.557 77.582 28.637C86.162 21.304 91.842 11.149 93.6 0C96.647 19.434 93.821 39.335 85.483 57.152C77.144 74.969 63.674 89.889 46.8 100C29.926 89.889 16.456 74.969 8.117 57.152C-0.221 39.335 -3.047 19.434 0 0ZM531.4 100C529.642 88.851 523.962 78.696 515.382 71.363C511.967 68.443 508.181 66.048 504.15 64.221C504.447 62.845 504.6 61.43 504.6 60C504.6 54.696 502.493 49.609 498.742 45.858C494.991 42.107 489.904 40 484.6 40C479.296 40 474.209 42.107 470.458 45.858C466.707 49.609 464.6 54.696 464.6 60C464.6 61.43 464.753 62.845 465.051 64.221C461.019 66.048 457.233 68.443 453.818 71.363C445.238 78.696 439.558 88.851 437.8 100C434.753 80.566 437.579 60.665 445.917 42.848C454.256 25.031 467.726 10.111 484.6 0C501.474 10.111 514.944 25.031 523.283 42.848C531.621 60.665 534.447 80.566 531.4 100ZM120.7 0C129.225 15.286 133.7 32.498 133.7 50C133.7 67.502 129.225 84.714 120.7 100C112.175 84.714 107.7 67.502 107.7 50C107.7 32.498 112.175 15.286 120.7 0Z" />
      </svg>
    </a>
  );
}

/** The credit as the whole foot of a docs, blog or use page. Site chrome, so left out of llms-full.txt. */
export function CraftedFoot({ placement }: { placement: Exclude<Placement, 'footer'> }) {
  return (
    <footer data-llms="skip" {...props(styles.foot)}>
      <CraftedAtVinena placement={placement} style={styles.footLink} />
    </footer>
  );
}
