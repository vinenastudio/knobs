import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, defaultMarker, props, when } from '@stylexjs/stylex';
import { Link, Outlet, useParams, useRouter } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { AGENT_PROMPT, AgentStart, agentCommands } from '../lib/agent-start.tsx';
import { KnobsMark } from '../lib/brand-marks.tsx';
import { CodeBox } from '../lib/code-box.tsx';
import { GitHubButton } from '../lib/github.tsx';
import { ICON } from '../lib/icon.ts';
import { asElement, usePanel } from '../lib/panel.ts';
import { m } from '../paraglide/messages.js';
import { FIRST } from './head.ts';
import { findPage, pages } from './pages.ts';

// Wide enough for the sidebar beside the text, and for "on this page" too.
const NAV = '@media (min-width: 800px)';
const TOC = '@media (min-width: 1200px)';

const styles = create({
  // The way to the whole text, set apart below the pages.
  agents: {
    marginTop: spacing.s4,
  },
  agentStart: {
    marginTop: spacing.s6,
  },
  body: {
    columnGap: spacing.s8,
    display: {
      default: 'block',
      [TOC]: 'grid',
    },
    gridTemplateColumns: 'minmax(0, 70ch) 11rem',
  },
  codeBlock: {
    marginBlock: '1rem',
  },
  columns: {
    columnGap: spacing.s8,
    display: {
      default: 'block',
      [NAV]: 'grid',
    },
    gridTemplateColumns: '11rem minmax(0, 1fr)',
  },
  current: {
    backgroundColor: colors.card,
  },
  currentText: {
    color: colors.fg,
  },
  // A page in the list: the track ground on hover, the card ground for the one open.
  item: {
    backgroundColor: {
      ':hover': colors.track,
      default: 'transparent',
    },
    borderRadius: radius.row,
    display: 'block',
    fontSize: '0.875rem',
    lineHeight: 1.4,
    outlineColor: colors.muted,
    outlineOffset: -1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: '6px',
    paddingInline: spacing.s3,
    transitionDuration: '120ms',
    transitionProperty: 'background-color',
    transitionTimingFunction: 'ease-out',
  },
  // The link's text color, on a span: the theme's global `a` rules outrank StyleX's.
  itemText: {
    color: {
      default: colors.muted,
      [when.ancestor(':hover')]: colors.fg,
    },
  },
  label: {
    color: colors.muted,
    fontSize: '0.8125rem',
    margin: 0,
    paddingBlock: '6px',
    paddingInline: spacing.s3,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  logo: {
    height: '1.25rem',
    width: '1.25rem',
  },
  main: {
    maxWidth: '70ch',
    minWidth: 0,
  },
  // The steps by hand, clear of the top when the agent block's link jumps to them.
  manual: {
    scrollMarginTop: spacing.s6,
  },
  // On a phone the list folds into one row above the text.
  menu: {
    display: {
      default: 'block',
      [NAV]: 'none',
    },
    marginBottom: spacing.s6,
  },
  menuList: {
    paddingTop: spacing.s2,
  },
  next: {
    gridColumn: 2,
    textAlign: 'end',
  },
  page: {
    backgroundColor: colors.bg,
    color: colors.fg,
    fontFamily: font.family,
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    marginInline: 'auto',
    maxWidth: 1200,
    paddingBottom: spacing.s16,
    paddingInline: spacing.s4,
  },
  // The previous and next pages, at each end of one row.
  pager: {
    columnGap: spacing.s4,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    marginTop: spacing.s12,
  },
  pagerLabel: {
    color: colors.muted,
    fontSize: '0.8125rem',
  },
  pagerLink: {
    backgroundColor: {
      ':hover': colors.track,
      default: colors.card,
    },
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: spacing.s2,
    paddingInline: spacing.s3,
    transitionDuration: '120ms',
    transitionProperty: 'background-color',
    transitionTimingFunction: 'ease-out',
  },
  section: {
    color: colors.muted,
    fontWeight: font.weightRegular,
  },
  // The page list beside the text, held in view as the text scrolls.
  sidebar: {
    alignSelf: 'start',
    display: {
      default: 'none',
      [NAV]: 'block',
    },
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    position: 'sticky',
    top: spacing.s6,
  },
  summary: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.row,
    cursor: 'pointer',
    display: 'flex',
    fontSize: '0.875rem',
    justifyContent: 'space-between',
    listStyle: 'none',
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: spacing.s2,
    paddingInline: spacing.s3,
  },
  summaryIcon: {
    color: colors.muted,
    height: '1rem',
    width: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: font.weightMedium,
    letterSpacing: '-0.015em',
    lineHeight: 1.3,
    margin: 0,
  },
  toc: {
    alignSelf: 'start',
    display: {
      default: 'none',
      [TOC]: 'block',
    },
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    position: 'sticky',
    top: spacing.s6,
  },
  // The wordmark, and the way to the code at the end of its row.
  top: {
    alignItems: 'center',
    columnGap: spacing.s4,
    display: 'flex',
    justifyContent: 'space-between',
    paddingBlock: spacing.s6,
  },
  wordmark: {
    alignItems: 'center',
    columnGap: '0.375rem',
    display: 'flex',
    fontSize: '1.1875rem',
    fontWeight: font.weightMedium,
    letterSpacing: '-0.01em',
  },
});

/** One list of the pages, the open one marked by its ground, not its weight, then the full text. */
function PageList({ current, menu = false }: { current: string | undefined; menu?: boolean }) {
  return (
    <ul {...props(styles.list, menu && styles.menuList)}>
      {pages.map((page) => {
        const open = page.slug === current;
        return (
          <li key={page.slug}>
            <Link
              aria-current={open ? 'page' : undefined}
              params={{ slug: page.slug }}
              to="/docs/$slug"
              {...props(styles.item, open && styles.current, defaultMarker())}
            >
              <span {...props(styles.itemText, open && styles.currentText)}>{page.title}</span>
            </Link>
          </li>
        );
      })}
      {/* A text file, not a route: a plain link, out of the app. */}
      <li {...props(styles.agents)}>
        <a href="/llms-full.txt" {...props(styles.item, defaultMarker())}>
          <span {...props(styles.itemText)}>{m.docs_full_reference()}</span>
        </a>
      </li>
    </ul>
  );
}

/** The frame of every docs page: the top bar, the page list, and the page in its column. */
export function DocsLayout() {
  usePanel();
  const { slug } = useParams({ strict: false });
  const current = slug ?? FIRST;
  const page = findPage(current);
  return (
    <div {...props(styles.page)}>
      <nav {...props(styles.top)}>
        <Link to="/" {...props(styles.wordmark)}>
          <KnobsMark size={20} style={styles.logo} />
          {m.app_name()}
          <span {...props(styles.section)}>{m.link_docs()}</span>
        </Link>
        <GitHubButton />
      </nav>
      <div {...props(styles.columns)}>
        <nav aria-label={m.docs_pages()} {...props(styles.sidebar)}>
          <PageList current={current} />
        </nav>
        {/* A new key per page closes the menu once a page is picked from it. */}
        <details key={current} {...props(styles.menu)}>
          <summary {...props(styles.summary)}>
            {page?.title ?? m.docs_pages()}
            <ChevronDownIcon {...ICON} {...props(styles.summaryIcon)} />
          </summary>
          <nav aria-label={m.docs_pages()}>
            <PageList current={current} menu />
          </nav>
        </details>
        <Outlet />
      </div>
    </div>
  );
}

/** One docs page: its title, its markdown, anything live it carries, and the pages either side. */
export function DocPage({ slug }: { slug: string }) {
  const router = useRouter();
  const page = findPage(slug);
  if (page === undefined) {
    return null;
  }
  const index = pages.indexOf(page);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  // Links between the docs pages stay in the app, so the panel is not mounted again.
  const follow = (event: MouseEvent<HTMLElement>) => {
    const link = asElement(event.target)?.closest('a');
    const href = link?.getAttribute('href');
    if (
      href?.startsWith('/docs') !== true ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    void router.navigate({ href });
  };
  return (
    <div {...props(styles.body)}>
      <main {...props(styles.main)}>
        <article onClick={follow}>
          <h1 {...props(styles.title)}>{page.title}</h1>
          {/* The first page is where a reader sets devknobs up: the agent's way first. */}
          {slug === FIRST && (
            <AgentStart
              commands={agentCommands()}
              manualHref="#manual"
              prompt={AGENT_PROMPT}
              snippet="agent_prompt_docs"
              style={styles.agentStart}
            />
          )}
          <div id={slug === FIRST ? 'manual' : undefined} {...props(styles.manual)}>
            {page.segments.map((segment) =>
              segment.kind === 'code' ? (
                <CodeBox
                  code={segment.code}
                  copyLabel={m.copy_code()}
                  html={segment.html}
                  key={segment.id}
                  name={`docs_${slug}`}
                  style={styles.codeBlock}
                />
              ) : (
                // Rendered from the repo's own markdown at build, never from a visitor.
                <div dangerouslySetInnerHTML={{ __html: segment.html }} key={segment.id} />
              ),
            )}
          </div>
        </article>
        <nav {...props(styles.pager)}>
          {previous === undefined ? null : (
            <Link params={{ slug: previous.slug }} to="/docs/$slug" {...props(styles.pagerLink)}>
              <span {...props(styles.pagerLabel)}>{m.docs_previous()}</span>
              {previous.title}
            </Link>
          )}
          {next === undefined ? null : (
            <Link
              params={{ slug: next.slug }}
              to="/docs/$slug"
              {...props(styles.pagerLink, styles.next)}
            >
              <span {...props(styles.pagerLabel)}>{m.docs_next()}</span>
              {next.title}
            </Link>
          )}
        </nav>
      </main>
      {page.headings.length === 0 ? null : (
        <aside {...props(styles.toc)}>
          <p {...props(styles.label)}>{m.docs_on_this_page()}</p>
          <nav aria-label={m.docs_on_this_page()}>
            <ul {...props(styles.list)}>
              {page.headings.map((heading) => (
                <li key={heading.id}>
                  <a href={`#${heading.id}`} {...props(styles.item, defaultMarker())}>
                    <span {...props(styles.itemText)}>{heading.text}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}

/** What `/docs/<slug>` shows for a page that does not exist. */
export function DocsNotFound() {
  return (
    <main {...props(styles.main)}>
      <h1 {...props(styles.title)}>{m.docs_not_found()}</h1>
      <p>
        <Link params={{ slug: FIRST }} to="/docs/$slug">
          {m.docs_not_found_link()}
        </Link>
      </p>
    </main>
  );
}
