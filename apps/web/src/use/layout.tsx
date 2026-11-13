import { defaultMarker, props } from '@stylexjs/stylex';
import { Link, Outlet } from '@tanstack/react-router';
import { styles } from '../blog/layout.tsx';
import { KnobsMark } from '../lib/brand-marks.tsx';
import { CodeBox } from '../lib/code-box.tsx';
import { CraftedFoot } from '../lib/crafted-at-vinena.tsx';
import { GitHubButton } from '../lib/github.tsx';
import { usePanel } from '../lib/panel.ts';
import { m } from '../paraglide/messages.js';
import { findKnobPage, knobPages } from './pages.ts';

/** The frame of every use page, as the blog's: the top bar, then the page in its column. */
export function UseLayout() {
  usePanel();
  return (
    <div {...props(styles.page)}>
      <nav {...props(styles.top)}>
        <Link to="/" {...props(styles.wordmark)}>
          <KnobsMark size={20} style={styles.logo} />
          {m.app_name()}
          <span {...props(styles.section)}>{m.link_use()}</span>
        </Link>
        <GitHubButton />
      </nav>
      <Outlet />
      <CraftedFoot placement="use" />
    </div>
  );
}

/** `/use`: every use page, with its description. */
export function UseIndex() {
  return (
    <main {...props(styles.main)}>
      <h1 {...props(styles.title)}>{m.use_heading()}</h1>
      <ul {...props(styles.list)}>
        {knobPages.map((page) => (
          <li key={page.slug}>
            <Link
              params={{ slug: page.slug }}
              to="/use/$slug"
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

/** One use page: its title and its markdown. */
export function UsePageView({ slug }: { slug: string }) {
  const page = findKnobPage(slug);
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
              name={`use_${slug}`}
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
