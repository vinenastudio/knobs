import { colors, font, spacing } from '@knobs/ui/tokens.stylex';
import { create, props, type StyleXStyles } from '@stylexjs/stylex';
import { m } from '../paraglide/messages.js';
import { CodeBox } from './code-box.tsx';

/** One command the page shows under the prompt, such as the install line. */
export interface AgentCommand {
  command: string;
  /** The small label over the command, such as "Install". */
  label: string;
  /** The command's name for analytics, such as `install`. */
  snippet: string;
}

// The same steps as the docs (content/docs/start.md and agents.md); change them together.
export const AGENT_PROMPT = `Read https://knobs.dev/llms-full.txt first: it is the full devknobs reference. Then set up devknobs in this project:

1. Add @vinena/knobs as a dev dependency with the project's package manager: npm i -D @vinena/knobs, or the pnpm, yarn or bun equivalent.
2. Mount it once, on the client, in development only, the way the reference shows for this framework: mount() from @vinena/knobs behind the bundler's dev flag, <DevKnobs /> from @vinena/knobs/react in React (in Next.js, loaded with dynamic() behind the dev check), or the unpkg script tag on a plain page. Gate the import itself, so no devknobs reaches the production build.
3. If the app reads media queries, the time or the user agent while it boots, or renders with React, add the early script as the first element in <head>, in development only.
4. Open the app in your browser tool, such as Playwright or the Chrome DevTools MCP, and drive the knobs through window.devknobs: describe() lists them. For each check, call reset(), then setState(), then await ready(). Check the page on a phone ({ device: "iphone-17" }), in dark mode ({ scheme: "dark" }) and in another language ({ locale: { lang: "ar", dir: "rtl" } }). The locale knob can reload the page, so wait for the load.
5. grab() what breaks, fix the code, and check again. Then call reset() and tell me what you changed and what you fixed.`;

/** The commands under the prompt, each from the docs. */
export const agentCommands = (): ReadonlyArray<AgentCommand> => [
  { command: 'npm i -D @vinena/knobs', label: m.agent_start_install(), snippet: 'agent_install' },
  {
    command:
      'mkdir -p .claude/skills && cp -R node_modules/@vinena/knobs/skills/devknobs .claude/skills/',
    label: m.agent_start_skill(),
    snippet: 'agent_skill',
  },
];

const styles = create({
  commands: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s4,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    minWidth: 0,
  },
  // Small and calm, like the panel's own labels.
  label: {
    color: colors.muted,
    fontSize: '0.8125rem',
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s4,
    scrollMarginTop: spacing.s16,
  },
  title: {
    color: colors.muted,
    fontSize: '0.8125rem',
    fontWeight: font.weightRegular,
    margin: 0,
  },
});

/**
 * The first section of a start page: a prompt to give to a coding agent, the
 * commands it runs, and a link down to the steps by hand.
 */
export function AgentStart({
  commands = [],
  id = 'agent-start',
  manualHref,
  prompt,
  snippet,
  style,
}: {
  commands?: ReadonlyArray<AgentCommand>;
  /** The section's id, the target of a `#agent-start` link. */
  id?: string;
  /** Where the steps by hand start, such as `#manual`. No link when left out. */
  manualHref?: string;
  /** What the reader gives their agent. It is code, not copy, so it stays literal. */
  prompt: string;
  /** The prompt's name for analytics. */
  snippet: string;
  style?: StyleXStyles;
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} {...props(styles.section, style)}>
      <h2 id={`${id}-title`} {...props(styles.title)}>
        {m.agent_start_title()}
      </h2>
      <p {...props(styles.label)}>{m.agent_start_caption()}</p>
      <CodeBox code={prompt} copyLabel={m.agent_start_copy()} name={snippet} wrap />
      {commands.length > 0 && (
        <ul {...props(styles.commands)}>
          {commands.map((item) => (
            <li key={item.snippet} {...props(styles.item)}>
              <p {...props(styles.label)}>{item.label}</p>
              <CodeBox code={item.command} copyLabel={m.copy_code()} name={item.snippet} />
            </li>
          ))}
        </ul>
      )}
      {manualHref !== undefined && (
        <p {...props(styles.label)}>
          <a href={manualHref}>{m.agent_start_manual()}</a>
        </p>
      )}
    </section>
  );
}
