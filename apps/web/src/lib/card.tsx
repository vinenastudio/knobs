import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props, type StyleXStyles } from '@stylexjs/stylex';
import { type ReactNode, type Ref, useId } from 'react';

// The one breakpoint on the page. A device or a width puts the page in a frame
// that size, so these columns collapse the way they do on a real phone.
const WIDE = '@media (min-width: 640px)';

const styles = create({
  // The page's card: the card ground, 8 round, no line.
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    minWidth: 0,
    paddingBlock: '10px 12px',
    paddingInline: spacing.s3,
  },
  cards: {
    display: 'grid',
    gap: spacing.s2,
    gridTemplateColumns: {
      default: '1fr',
      [WIDE]: '1fr 1fr',
    },
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.4,
  },
  line: {
    color: colors.muted,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    margin: 0,
    maxWidth: '65ch',
  },
  // The name takes the room beside a value that fits, so the value sits at the row's end.
  name: {
    color: colors.muted,
    flexGrow: 1,
  },
  row: {
    alignItems: 'baseline',
    columnGap: spacing.s3,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: '0.8125rem',
    justifyContent: 'space-between',
    lineHeight: 1.5,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    margin: 0,
  },
  swatch: {
    borderRadius: radius.base,
    flexBasis: 0,
    flexGrow: 1,
    height: 24,
  },
  swatches: {
    columnGap: spacing.s1,
    display: 'flex',
  },
  // An icon beside the title sits on its line, a fixed gap apart.
  title: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    fontSize: '0.8125rem',
    fontWeight: font.weightMedium,
    lineHeight: 1.5,
    margin: 0,
  },
  // A value too long for the room beside its name goes under it, from the start, as wide as the card.
  value: {
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    fontVariantNumeric: 'tabular-nums',
    margin: 0,
    minWidth: 0,
    overflowWrap: 'break-word',
  },
  wide: {
    gridColumn: '1 / -1',
  },
});

/** The page's grid of cards: two columns, one on a phone. */
export function Cards({ children }: { children: ReactNode }) {
  return <div {...props(styles.cards)}>{children}</div>;
}

/**
 * The page's card. On the stage its title names what to move in the panel, in
 * the panel's own words. `wide` takes the whole row of the grid, and so does a
 * card left alone in the last row before the wide ones (see `app.css`).
 */
export function Card({
  children,
  ref,
  title,
  wide = false,
}: {
  children: ReactNode;
  ref?: Ref<HTMLElement>;
  title: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <section
      {...props(styles.card, wide && styles.wide)}
      aria-labelledby={id}
      data-card={wide ? 'wide' : 'half'}
      ref={ref}
    >
      <h3 {...props(styles.title)} id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A muted line of a card: what to do, or what the specimen is. */
export function Line({ children }: { children: ReactNode }) {
  return <p {...props(styles.line)}>{children}</p>;
}

/** A card's readout: a name and what the page reads for it, one per row. */
export function Rows({ children }: { children: ReactNode }) {
  return <dl {...props(styles.rows)}>{children}</dl>;
}

// Holds the row's height until the page has read the value.
const EMPTY = ' ';

export function Row({ name, value }: { name: string; value: string | null }) {
  return (
    <div {...props(styles.row)}>
      <dt {...props(styles.name)}>{name}</dt>
      <dd {...props(styles.value)}>{value ?? EMPTY}</dd>
    </div>
  );
}

/** A small label over a row of chips. */
export function Group({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div {...props(styles.group)}>
      <span {...props(styles.groupLabel)}>{label}</span>
      <div {...props(styles.chips)}>{children}</div>
    </div>
  );
}

/** A row of chips with no label. */
export function Chips({ children }: { children: ReactNode }) {
  return <div {...props(styles.chips)}>{children}</div>;
}

/** A row of color samples, one per fill. */
export function Swatches({ fills }: { fills: ReadonlyArray<StyleXStyles> }) {
  return (
    <div {...props(styles.swatches)} aria-hidden="true">
      {fills.map((fill, index) => (
        <span {...props(styles.swatch, fill)} key={index} />
      ))}
    </div>
  );
}
