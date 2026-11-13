import { defaultMarker, props } from '@stylexjs/stylex';
import { Link, Outlet } from '@tanstack/react-router';
import { styles } from '../blog/layout.tsx';
import { KnobsMark } from '../lib/brand-marks.tsx';
import { CodeBox } from '../lib/code-box.tsx';
import { CraftedFoot } from '../lib/crafted-at-vinena.tsx';
import { GitHubButton } from '../lib/github.tsx';
import { usePanel } from '../lib/panel.ts';
import { m } from '../paraglide/messages.js';
import { comparePages, findComparePage } from './pages.ts';

/** The frame of every comparison page, as the use pages': the top bar, then the page in its column. */
export function CompareLayout() {
  usePanel();
  return (
    <div {...props(styles.page)}>
      <nav {...props(styles.top)}>
        <Link to="/" {...props(styles.wordmark)}>
          <KnobsMark size={20} style={styles.logo} />
          {m.app_name()}
          <span {...props(styles.section)}>{m.link_compare()}</span>
        </Link>
        <GitHubButton />
      </nav>
      <Outlet />
      <CraftedFoot placement="compare" />
    </div>
  );
}

/** `/compare`: every comparison page, with its description. */
export function CompareIndex() {
  return (
    <main {...props(styles.main)}>
      <h1 {...props(styles.title)}>{m.compare_heading()}</h1>
      <ul {...props(styles.list)}>
        {comparePages.map((page) => (
          <li key={page.slug}>
            <Link
              params={{ slug: page.slug }}
              to="/compare/$slug"
              {...props(styles.entry, defaultMarker())}
            >
              <span {...props(styles.entryTitle)}>{page.title}</span>
              <span {...props(styles.muted)}>{page.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** One comparison page: its title and its markdown. */
export function ComparePageView({ slug }: { slug: string }) {
  const page = findComparePage(slug);
  if (page === undefined) {
    return null;
  }
  return (
    <main {...props(styles.main)}>
      <article>
        <h1 {...props(styles.title)}>{page.title}</h1>
        {page.segments.map((segment) =>
          segment.kind === 'code' ? (
            <CodeBox
              code={segment.code}
              copyLabel={m.copy_code()}
              html={segment.html}
              key={segment.id}
              name={`compare_${slug}`}
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

/** What `/compare/<slug>` shows for a page that does not exist. */
export function CompareNotFound() {
  return (
    <main {...props(styles.main)}>
      <h1 {...props(styles.title)}>{m.compare_not_found()}</h1>
      <p>
        <Link to="/compare">{m.compare_not_found_link()}</Link>
      </p>
    </main>
  );
}
