import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { Stage } from '../demo/stage.tsx';
import { track } from '../lib/analytics.ts';
import { ChromeMark, GitHubMark, KnobsMark, NpmMark } from '../lib/brand-marks.tsx';
import { CANONICAL_ORIGIN, canonicalLink } from '../lib/canonical.ts';
import { CopyInstallPrompt } from '../lib/copy-install-prompt.tsx';
import { CraftedAtVinena } from '../lib/crafted-at-vinena.tsx';
import { FeedbackLink } from '../lib/feedback-link.tsx';
import { GitHubButton, onGitHub, REPO, StarLink } from '../lib/github.tsx';
import { type PanelTour, usePanel } from '../lib/panel.ts';
import { jsonLd, ORGANIZATION } from '../lib/schema.ts';
import { IMAGE } from '../lib/share.ts';
import { m } from '../paraglide/messages.js';
import { openTour, watchKnobs } from '../tour/progress.ts';
import { Tour } from '../tour/tour.tsx';

const HOME = `${CANONICAL_ORIGIN}/`;

const NPM = 'https://www.npmjs.com/package/@vinena/knobs';

const EXTENSION_STORE =
  'https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj';

export const Route = createFileRoute('/')({
  component: import.meta.env.DEV ? DevPage : Landing,
  head: () => ({
    links: [canonicalLink('/')],
    meta: [{ content: HOME, property: 'og:url' }],
    scripts: [
      jsonLd(ORGANIZATION),
      jsonLd({
        '@type': 'WebSite',
        name: m.app_name(),
        publisher: { '@id': ORGANIZATION['@id'] },
        url: HOME,
      }),
      jsonLd({
        '@type': 'SoftwareApplication',
        alternateName: m.app_name(),
        applicationCategory: 'DeveloperApplication',
        description: m.home_description(),
        image: IMAGE,
        name: 'knobs',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        operatingSystem: 'Web, Chrome',
        publisher: { '@id': ORGANIZATION['@id'] },
        sameAs: [NPM, REPO, EXTENSION_STORE],
        url: HOME,
      }),
    ],
  }),
});

// Dev-only: a reference image in place of the page (`src/dev/reference.tsx`),
// for `ref=<name>` in the address, on the top page and on the copy in a
// device's frame, which loads the same address. The server reads the same
// address, so both draw the same shell. A build drops all of this and the file
// with it, and reads no `ref`.
const Reference = import.meta.env.DEV ? lazy(() => import('../dev/reference.tsx')) : null;

function DevPage() {
  const name = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get('ref'),
  });
  // On the page itself, however it was reached, the top page gives back the
  // browser knob a reference page took.
  useEffect(() => {
    if (name === null && window.top === window) {
      void import('../dev/refscreen.ts').then(({ leaveReference }) => leaveReference());
    }
  }, [name]);
  return Reference !== null && name !== null && /^[a-z0-9-]+$/.test(name) ? (
    <Suspense>
      <Reference name={name} />
    </Suspense>
  ) : (
    <Landing />
  );
}

// The one breakpoint on the page. A device or a width puts the page in a frame
// that size, so these columns collapse the way they do on a real phone.
const WIDE = '@media (min-width: 640px)';

const DOCS = '/docs/start';

const BLOG = '/blog';

const EXTENSION_DOCS = '/docs/extension';

// Where the hero's "Add to Chrome" goes: the extension's Chrome Web Store listing.
const EXTENSION_URL = EXTENSION_STORE;

const onExtension = (placement: 'footer' | 'hero') => () =>
  track('extension_clicked', { placement });

const NOTICES =
  'https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/THIRD_PARTY_NOTICES.md';

const styles = create({
  // The wordmark, and the way to the code at the end of its row.
  brand: {
    alignItems: 'center',
    columnGap: spacing.s4,
    display: 'flex',
    justifyContent: 'space-between',
  },
  // The studio's row: a centered line of its own under the links, at every width. The row is this
  // wrapper, so the link itself stays the size of its words. Its margin plus the footer's row gap
  // matches the footer's top padding, so it sits as far under the links as they sit under the border.
  credit: {
    display: 'flex',
    flexBasis: '100%',
    justifyContent: 'center',
    marginTop: spacing.s4,
  },
  // The hero's two ways in, one row of equal height: the extension, then the installation prompt. On a
  // narrow screen the prompt goes under the extension. Below the breakpoint the star link comes under
  // the prompt's button after a copy, in the flow: the two keep their own height there (the same
  // one, from the same padding and line), so the link does not stretch the extension's button.
  cta: {
    alignItems: {
      default: 'flex-start',
      [WIDE]: 'stretch',
    },
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  // The page's one filled button, ink on the page's ground turned around, the copy box's size: its
  // padding, its text size and its line. Its label's color is on `ctaLabel`: the theme's global
  // `a` rules outrank StyleX's.
  ctaButton: {
    alignItems: 'center',
    backgroundColor: colors.fg,
    borderRadius: radius.row,
    display: 'inline-flex',
    flexShrink: 0,
    fontSize: font.sizeSm,
    fontWeight: font.weightMedium,
    lineHeight: '1.375rem',
    opacity: {
      ':hover': {
        '@media (hover: hover)': 0.88,
        default: null,
      },
      default: 1,
    },
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: spacing.s1,
    paddingInline: spacing.s3,
    textDecoration: 'none',
    transitionDuration: '120ms',
    transitionProperty: 'opacity',
    transitionTimingFunction: 'ease-out',
  },
  ctaLabel: {
    alignItems: 'center',
    color: colors.bg,
    columnGap: spacing.s2,
    display: 'inline-flex',
  },
  // The page's 16px icon, in rem, so it grows with the text.
  glyph: {
    height: '1rem',
    width: '1rem',
  },
  // A button sizes to its content; this one fills the row it sits in.
  fill: {
    width: '100%',
  },
  footer: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    columnGap: spacing.s6,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: '0.8125rem',
    justifyContent: { default: 'center', [WIDE]: 'flex-start' },
    paddingTop: spacing.s6,
    rowGap: spacing.s2,
  },
  // The footer's links' focus ring. Their color is set in app.css, past the theme's
  // global `a` rules.
  link: {
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
  },
  page: {
    backgroundColor: colors.bg,
    color: colors.fg,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.family,
    fontSize: '0.9375rem',
    gap: spacing.s12,
    lineHeight: 1.6,
    marginInline: 'auto',
    maxWidth: 680,
    paddingBlock: {
      default: spacing.s12,
      [WIDE]: spacing.s16,
    },
    paddingInline: spacing.s4,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s4,
  },
  // A quiet line under the hero's buttons.
  note: {
    color: colors.muted,
    fontSize: '0.8125rem',
    margin: 0,
  },
  // Small and calm, like the panel's own labels.
  sectionHeading: {
    color: colors.muted,
    fontSize: '0.8125rem',
    fontWeight: font.weightRegular,
    margin: 0,
  },
  text: {
    margin: 0,
  },
  // An icon beside its label, centered on the line, a fixed gap apart.
  withIcon: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'inline-flex',
  },
  // The logo beside the name, 20px at the page's default size and growing with it.
  logo: {
    height: '1.25rem',
    width: '1.25rem',
  },
  // The mark beside the name, centered on its line.
  wordmark: {
    alignItems: 'center',
    columnGap: '0.375rem',
    display: 'flex',
    fontSize: '1.1875rem',
    fontWeight: font.weightMedium,
    letterSpacing: '-0.01em',
    margin: 0,
  },
});

// The tour, opened before the panel mounts and watching its knobs once it does.
const TOUR: PanelTour = { open: openTour, watch: watchKnobs };

function Landing() {
  usePanel(TOUR);

  return (
    <main {...props(styles.page)}>
      <header {...props(styles.section)}>
        <div {...props(styles.brand)}>
          <h1 {...props(styles.wordmark)}>
            <KnobsMark size={20} style={styles.logo} />
            {m.app_name()}
          </h1>
          <GitHubButton />
        </div>
        <p {...props(styles.text)}>{m.hero_line()}</p>
        <div {...props(styles.cta)}>
          <a
            href={EXTENSION_URL}
            onClick={onExtension('hero')}
            rel="noreferrer"
            target="_blank"
            {...props(styles.ctaButton)}
          >
            <span {...props(styles.ctaLabel)}>
              <ChromeMark style={styles.glyph} />
              {m.extension_cta()}
            </span>
          </a>
          <CopyInstallPrompt name="install_prompt" />
        </div>
        <p {...props(styles.note)}>{m.extension_line()}</p>
      </header>

      <Tour
        install={<CopyInstallPrompt name="install_prompt_tour" star={false} style={styles.fill} />}
      />

      <section {...props(styles.section)} id="try">
        <h2 {...props(styles.sectionHeading)}>{m.stage_title()}</h2>
        <p {...props(styles.text)}>{m.stage_line()}</p>
        {/* Live readouts, empty when the llms files are built: left out of them. */}
        <div data-llms="skip">
          <Stage />
        </div>
      </section>

      {/* Site links, not page content: left out of llms-full.txt. */}
      <footer data-llms="skip" {...props(styles.footer)}>
        <a href={DOCS} {...props(styles.link)}>
          {m.link_docs()}
        </a>
        <a href={EXTENSION_DOCS} onClick={onExtension('footer')} {...props(styles.link)}>
          {m.link_extension()}
        </a>
        <a href={BLOG} {...props(styles.link)}>
          {m.link_blog()}
        </a>
        <a
          href={REPO}
          onClick={onGitHub('footer')}
          rel="noreferrer"
          target="_blank"
          {...props(styles.link, styles.withIcon)}
        >
          <GitHubMark />
          {m.link_github()}
        </a>
        <StarLink placement="footer" />
        <a href={NPM} rel="noreferrer" target="_blank" {...props(styles.link, styles.withIcon)}>
          <NpmMark />
          {m.link_npm()}
        </a>
        {/* The licenses of grab's sources (react-grab, bippy) and the bezel images. */}
        <a href={NOTICES} rel="noreferrer" target="_blank" {...props(styles.link)}>
          {m.link_notices()}
        </a>
        <FeedbackLink style={styles.link} />
        <div {...props(styles.credit)}>
          <CraftedAtVinena style={styles.link} />
        </div>
      </footer>
    </main>
  );
}
