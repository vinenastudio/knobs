import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import { m } from '../paraglide/messages.js';
import { ChromeMark, XMark } from './brand-marks.tsx';

// The landing page's one breakpoint, the same as in `routes/index.tsx`.
const WIDE = '@media (min-width: 640px)';

type Quote = {
  avatar: string;
  line: string;
  name: string;
  quote: string;
  source: 'chrome' | 'x';
  url: string;
};

// What people said, word for word: never translated, never edited.
const QUOTES: ReadonlyArray<Quote> = [
  {
    avatar: '/praise/jalco.webp',
    line: 'Engineer at Mastra',
    name: 'justin (jalco) levine',
    quote:
      'if you wanna work with different viewports you can ask your agent to add knobs.dev by @mertduzgun',
    source: 'x',
    url: 'https://x.com/jalcowastaken/status/2117033975097249915',
  },
  {
    avatar: '/praise/baytas.webp',
    line: 'Creative director at Moment',
    name: 'Mehmet Aydın Baytaş',
    quote: 'excellent',
    source: 'chrome',
    url: 'https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj/reviews',
  },
  {
    avatar: '/praise/andreuzza.webp',
    line: '@Mike_Andreuzza',
    name: 'Michael Andreuzza',
    quote: 'Dude, this is so useful....',
    source: 'x',
    url: 'https://x.com/Mike_Andreuzza/status/2116596595173294510',
  },
  {
    avatar: '/praise/sami.webp',
    line: '@TheXSami',
    name: 'Sami',
    quote: 'Knobs looks handy for my frontend work. Gave you a follow, Mert',
    source: 'x',
    url: 'https://x.com/TheXSami/status/2109781587458142455',
  },
  {
    avatar: '/praise/carson.webp',
    line: '@mrterrycarson',
    name: 'Terry Carson',
    quote: "That's a fantastic update! Live editing sounds incredibly useful. Great work!",
    source: 'x',
    url: 'https://x.com/mrterrycarson/status/2118550912734285839',
  },
];

const SOURCE_LABEL = { chrome: 'Chrome Web Store review', x: 'on X' } as const;

const styles = create({
  avatar: {
    borderRadius: '50%',
    flexShrink: 0,
    height: 48,
    objectFit: 'cover',
    width: 48,
  },
  // A filled card on the page's ground, the panel's radius; the card is the link.
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.panel,
    boxShadow: shadow.lift,
    color: colors.fg,
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    padding: spacing.s4,
    textDecoration: 'none',
  },
  figure: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: spacing.s4,
    justifyContent: 'space-between',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gap: spacing.s4,
    gridTemplateColumns: { default: '1fr', [WIDE]: 'repeat(2, 1fr)' },
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  heading: {
    color: colors.muted,
    fontSize: '0.8125rem',
    fontWeight: font.weightRegular,
    margin: 0,
  },
  icon: {
    color: colors.muted,
    flexShrink: 0,
    height: '1rem',
    marginInlineStart: 'auto',
    width: '1rem',
  },
  item: {
    display: 'flex',
  },
  line: {
    color: colors.muted,
    fontSize: '0.8125rem',
  },
  name: {
    fontWeight: font.weightMedium,
  },
  person: {
    alignItems: 'center',
    columnGap: spacing.s3,
    display: 'flex',
  },
  quote: {
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s4,
  },
  text: {
    margin: 0,
  },
  who: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.4,
    minWidth: 0,
  },
});

export function Praise() {
  return (
    <section id="praise" {...props(styles.section)}>
      <h2 {...props(styles.heading)}>{m.praise_title()}</h2>
      <ul {...props(styles.grid)}>
        {QUOTES.map((item) => (
          <li key={item.url} {...props(styles.item)}>
            <a href={item.url} rel="noreferrer" target="_blank" {...props(styles.card)}>
              <figure {...props(styles.figure)}>
                <blockquote cite={item.url} {...props(styles.quote)}>
                  <p {...props(styles.text)}>{item.quote}</p>
                </blockquote>
                <figcaption {...props(styles.person)}>
                  <img
                    alt=""
                    decoding="async"
                    height={48}
                    loading="lazy"
                    src={item.avatar}
                    width={48}
                    {...props(styles.avatar)}
                  />
                  <div {...props(styles.who)}>
                    <div {...props(styles.name)}>{item.name}</div>
                    <div {...props(styles.line)}>{item.line}</div>
                  </div>
                  <span aria-label={SOURCE_LABEL[item.source]} role="img" {...props(styles.icon)}>
                    {item.source === 'x' ? <XMark /> : <ChromeMark />}
                  </span>
                </figcaption>
              </figure>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
