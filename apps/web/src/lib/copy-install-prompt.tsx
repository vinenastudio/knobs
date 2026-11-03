import type { StyleXStyles } from '@stylexjs/stylex';
import { m } from '../paraglide/messages.js';
import { CodeBox } from './code-box.tsx';

/**
 * The secondary button beside a page's main action: it copies the whole setup
 * prompt for a coding agent and says "Copied" for a moment, without showing the
 * prompt. The same prompt is in packages/devknobs/README.md under install and in
 * apps/web/content/reference/start.md; change all three together.
 */
export function CopyInstallPrompt({ name, style }: { name: string; style?: StyleXStyles }) {
  return (
    <CodeBox
      code={m.install_prompt()}
      copyLabel={m.copy_install_prompt()}
      label={m.copy_install_prompt()}
      name={name}
      style={style}
      wrap
    />
  );
}
