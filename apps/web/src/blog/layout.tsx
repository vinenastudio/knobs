import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, defaultMarker, props, when } from '@stylexjs/stylex';
import { Link, Outlet } from '@tanstack/react-router';
import { KnobsMark } from '../lib/brand-marks.tsx';
import { CodeBox } from '../lib/code-box.tsx';
import { CraftedFoot } from '../lib/crafted-at-vinena.tsx';
import { GitHubButton } from '../lib/github.tsx';
import { usePanel } from '../lib/panel.ts';
import { m } from '../paraglide/messages.js';
import { findPost, posts } from './posts.ts';

const styles = create({
  codeBlock: {
    marginBlock: '1rem',
  },
  date: {
    color: colors.muted,
    fontSize: '0.8125rem',
    margin: 0,
  },
  description: {
    color: colors.muted,
    margin: 0,
  },
  // A post in the list: the track ground on hover, like the docs' page list.
  entry: {
    backgroundColor: {
      ':hover': colors.track,
      default: 'transparent',
    },
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    marginInline: `calc(-1 * ${spacing.s3})`,
    outlineColor: colors.muted,
    outlineOffset: -1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: spacing.s3,
    paddingInline: spacing.s3,
    transitionDuration: '120ms',
    transitionProperty: 'background-color',
    transitionTimingFunction: 'ease-out',
  },
  // The link's text color, on a span: the theme's global `a` rules outrank StyleX's.
  entryTitle: {
    color: colors.fg,
    fontWeight: font.weightMedium,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    listStyle: 'none',
    margin: 0,
    marginTop: spacing.s6,
    padding: 0,
  },
  logo: {
    height: '1.25rem',
    width: '1.25rem',
  },
  main: {
    marginInline: 'auto',
    maxWidth: '70ch',
    minWidth: 0,
  },
  muted: {
    color: {
      default: colors.muted,
      [when.ancestor(':hover')]: colors.fg,
    },
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
  section: {
    color: colors.muted,
    fontWeight: font.weightRegular,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: font.weightMedium,
    letterSpacing: '-0.015em',
    lineHeight: 1.3,
    margin: 0,
  },
  titleGap: {
    marginBottom: spacing.s2,
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

/** A `YYYY-MM-DD` day as "October 29, 2026". */
const formatDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  });

/** The frame of every blog page: the top bar, then the page in its column. */
export function BlogLayout() {
  usePanel();
  return (
    <div {...props(styles.page)}>
      <nav {...props(styles.top)}>
        <Link to="/" {...props(styles.wordmark)}>
          <KnobsMark size={20} style={styles.logo} />
          {m.app_name()}
          <span {...props(styles.section)}>{m.link_blog()}</span>
        </Link>
        <GitHubButton />
      </nav>
      <Outlet />
      <CraftedFoot placement="blog" />
    </div>
  );
}

/** `/blog`: every post, newest first, with its description and day. */
export function BlogIndex() {
  return (
    <main {...props(styles.main)}>
      <h1 {...props(styles.title)}>{m.blog_heading()}</h1>
      <ul {...props(styles.list)}>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              params={{ slug: post.slug }}
              to="/blog/$slug"
              {...props(styles.entry, defaultMarker())}
            >
              <span {...props(styles.entryTitle)}>{post.title}</span>
              <span {...props(styles.muted)}>{post.description}</span>
              <time dateTime={post.date} {...props(styles.date)}>
                {formatDate(post.date)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** One post: its title, the day it last changed, and its markdown. */
export function PostPage({ slug }: { slug: string }) {
  const post = findPost(slug);
  if (post === undefined) {
    return null;
  }
  return (
    <main {...props(styles.main)}>
      <article>
        <h1 {...props(styles.title, styles.titleGap)}>{post.title}</h1>
        <p {...props(styles.date)}>
          <time dateTime={post.updated}>{m.blog_updated({ date: formatDate(post.updated) })}</time>
        </p>
        {post.segments.map((segment) =>
          segment.kind === 'code' ? (
            <CodeBox
              code={segment.code}
              copyLabel={m.copy_code()}
              html={segment.html}
              key={segment.id}
              name={`blog_${slug}`}
              style={styles.codeBlock}
            />
          ) : (
            // Rendered from the repo's own markdown at build, never from a visitor.
            <div dangerouslySetInnerHTML={{ __html: segment.html }} key={segment.id} />
          ),
        )}
      </article>
    </main>
  );
}

/** What `/blog/<slug>` shows for a post that does not exist. */
export function BlogNotFound() {
  return (
    <main {...props(styles.main)}>
      <h1 {...props(styles.title)}>{m.blog_not_found()}</h1>
      <p>
        <Link to="/blog">{m.blog_not_found_link()}</Link>
      </p>
    </main>
  );
}
