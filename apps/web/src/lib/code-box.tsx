import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, defaultMarker, props, type StyleXStyles, when } from '@stylexjs/stylex';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { m } from '../paraglide/messages.js';
import { track } from './analytics.ts';
import { ICON } from './icon.ts';

const styles = create({
  // A code box is a panel field: the card ground, 8 round, and the copy
  // button 4 inside it, so 4 round.
  code: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.row,
    columnGap: spacing.s1,
    display: 'flex',
    padding: spacing.s1,
  },
  codeText: {
    flexGrow: 1,
    fontFamily: font.mono,
    fontSize: '0.78125rem',
    lineHeight: '1.375rem',
    margin: 0,
    minWidth: 0,
    overflowX: 'auto',
    paddingBlock: 0,
    paddingInline: '8px',
    whiteSpace: 'pre',
  },
  // A box that is all one copy button: no button chrome, and the copy button's focus ring.
  codeButton: {
    borderStyle: 'none',
    color: 'inherit',
    cursor: 'pointer',
    outlineColor: colors.muted,
    outlineOffset: -1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    textAlign: 'start',
  },
  // Words in place of the code: the page's font, not the code's, and a step larger. The label and
  // "Copied" share one grid cell, so the box keeps the width of the longer one.
  codeLabel: {
    display: 'grid',
    fontFamily: font.family,
    fontSize: font.sizeSm,
  },
  labelOff: {
    visibility: 'hidden',
  },
  labelText: {
    gridArea: '1 / 1',
  },
  // A long text, such as the install prompt, breaks instead of scrolling.
  codeWrap: {
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  // The panel's small icon button: faint, and the track ground on hover. One code line tall, so it
  // sits on the first line, and in rem, so it grows with the text.
  copy: {
    alignItems: 'center',
    backgroundColor: {
      ':hover': colors.track,
      default: 'transparent',
    },
    borderRadius: radius.base,
    borderStyle: 'none',
    color: {
      ':hover': colors.fg,
      default: colors.muted,
    },
    cursor: 'pointer',
    display: 'flex',
    flexShrink: 0,
    height: '1.375rem',
    justifyContent: 'center',
    outlineColor: colors.muted,
    outlineOffset: -1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    padding: 0,
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
    transitionTimingFunction: 'ease-out',
    width: '1.375rem',
  },
  // The page's 16px icon, in rem, so it grows with the text.
  glyph: {
    height: '1rem',
    width: '1rem',
  },
  // The copy button's icon inside a box that is the button: its hover ground follows the box's.
  copyIcon: {
    backgroundColor: {
      default: 'transparent',
      [when.ancestor(':hover')]: colors.track,
    },
    color: {
      default: colors.muted,
      [when.ancestor(':hover')]: colors.fg,
    },
  },
  // Read by screen readers, never drawn.
  live: {
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: 1,
  },
});

/**
 * A code box with a copy button at its right edge. The code stays plain text,
 * selectable by hand. Where the clipboard refuses the write (an insecure
 * context, an old browser), the code is selected instead, ready to copy.
 * With `label`, the box shows the label in place of code too long to show,
 * the whole box one copy button that says "Copied" for a moment, and shows the code only where the clipboard
 * refuses it. `html` draws the code highlighted (the repo's own markup, never
 * a visitor's); the copy button still copies `code`. `onCopied` hears each copy the clipboard took.
 */
export function CodeBox({
  code,
  copyLabel,
  html,
  label,
  name,
  onCopied,
  style,
  wrap = false,
}: {
  code: string;
  copyLabel: string;
  html?: string | undefined;
  label?: string;
  name: string;
  onCopied?: (() => void) | undefined;
  style?: StyleXStyles;
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // How many times the clipboard refused the code, each one selecting it once it shows.
  const [refused, setRefused] = useState(0);
  const showCode = label === undefined || refused > 0;
  const text = useRef<HTMLPreElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  // The label button is gone once the code shows, so focus moves to the copy button that took its place.
  useEffect(() => {
    if (refused > 0 && text.current !== null) {
      copyButton.current?.focus();
      getSelection()?.selectAllChildren(text.current);
    }
  }, [refused]);
  const copy = () => {
    track('copy_click', { snippet: name });
    // Inside a promise, so a missing `navigator.clipboard` rejects too.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(
        () => {
          setCopied(true);
          onCopied?.();
        },
        () => setRefused((count) => count + 1),
      );
  };
  const icon = copied ? (
    <CheckIcon {...ICON} {...props(styles.glyph)} />
  ) : (
    <CopyIcon {...ICON} {...props(styles.glyph)} />
  );
  const live = (
    <span {...props(styles.live)} aria-live="polite">
      {copied ? m.copy_done() : ''}
    </span>
  );
  // The label is words, not code, so the whole box is the copy button, named by them.
  if (!showCode) {
    return (
      <>
        <button
          {...props(styles.code, styles.codeButton, defaultMarker(), style)}
          aria-label={label}
          data-copied={copied}
          onClick={copy}
          type="button"
        >
          <span
            {...props(styles.codeText, wrap && styles.codeWrap, styles.codeLabel)}
            aria-hidden="true"
          >
            <span {...props(styles.labelText, copied && styles.labelOff)}>{label}</span>
            <span {...props(styles.labelText, !copied && styles.labelOff)}>{m.copy_done()}</span>
          </span>
          <span {...props(styles.copy, styles.copyIcon)}>{icon}</span>
        </button>
        {live}
      </>
    );
  }
  return (
    <div {...props(styles.code, style)}>
      <pre
        {...props(styles.codeText, wrap && styles.codeWrap)}
        ref={text}
        {...(html === undefined
          ? { children: code }
          : { dangerouslySetInnerHTML: { __html: html } })}
      />
      <button
        {...props(styles.copy)}
        aria-label={copyLabel}
        onClick={copy}
        ref={copyButton}
        type="button"
      >
        {icon}
      </button>
      {live}
    </div>
  );
}
