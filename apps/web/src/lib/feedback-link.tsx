import { props, type StyleXStyles } from '@stylexjs/stylex';
import type { MouseEvent } from 'react';
import { m } from '../paraglide/messages.js';

const FEEDBACK_URL = 'https://feedback.vinena.studio/?product=knobs';

function withPage(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.href = `${FEEDBACK_URL}&page=${encodeURIComponent(location.origin + location.pathname)}`;
}

export function FeedbackLink({ style }: { style: StyleXStyles }) {
  return (
    <a
      href={FEEDBACK_URL}
      onAuxClick={withPage}
      onClick={withPage}
      onContextMenu={withPage}
      rel="noopener noreferrer"
      target="_blank"
      {...props(style)}
    >
      {m.link_feedback()}
    </a>
  );
}
