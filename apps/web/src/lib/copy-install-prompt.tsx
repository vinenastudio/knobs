import { spacing } from '@knobs/ui/tokens.stylex';
import { create, keyframes, props, type StyleXStyles } from '@stylexjs/stylex';
import { useState } from 'react';
import { m } from '../paraglide/messages.js';
import { CodeBox } from './code-box.tsx';
import { StarLink } from './github.tsx';

// The same breakpoint as the landing's.
const WIDE = '@media (min-width: 640px)';

const LESS_MOTION = '@media (prefers-reduced-motion: reduce)';

const appear = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const styles = create({
  // The button's own size. On a narrow screen the star link goes under the button, in the flow;
  // from the breakpoint this is the box the link is placed against.
  box: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      [WIDE]: 'row',
    },
    position: 'relative',
    width: 'fit-content',
  },
  button: {
    flexGrow: 1,
  },
  // Under the button on a narrow screen, where what follows moves down for it. Beside the button
  // from the breakpoint, out of the flow, so nothing moves there.
  star: {
    animationDuration: '200ms',
    animationFillMode: 'backwards',
    animationName: {
      default: appear,
      [LESS_MOTION]: 'none',
    },
    animationTimingFunction: 'ease-out',
    display: 'flex',
    insetBlockStart: {
      default: null,
      [WIDE]: '50%',
    },
    insetInlineStart: {
      default: null,
      [WIDE]: '100%',
    },
    marginBlockStart: {
      default: spacing.s2,
      [WIDE]: 0,
    },
    marginInlineStart: {
      default: 0,
      [WIDE]: spacing.s3,
    },
    position: {
      default: 'static',
      [WIDE]: 'absolute',
    },
    transform: {
      default: null,
      [WIDE]: 'translateY(-50%)',
    },
  },
});

/**
 * The secondary button beside a page's main action: it copies the whole setup
 * prompt for a coding agent and says "Copied" for a moment, without showing the
 * prompt. The same prompt is in packages/devknobs/README.md under install and in
 * apps/web/content/reference/start.md; change all three together.
 * After the first copy a quiet "give us a star" link fades in next to the button and
 * stays; `star={false}` leaves it out where the place has its own.
 */
export function CopyInstallPrompt({
  name,
  star = true,
  style,
}: {
  name: string;
  star?: boolean;
  style?: StyleXStyles;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div {...props(styles.box, style)}>
      <CodeBox
        code={m.install_prompt()}
        copyLabel={m.copy_install_prompt()}
        label={m.copy_install_prompt()}
        name={name}
        onCopied={() => setCopied(true)}
        style={styles.button}
        wrap
      />
      {star && copied && (
        <span {...props(styles.star)}>
          <StarLink placement="copy" quiet />
        </span>
      )}
    </div>
  );
}
