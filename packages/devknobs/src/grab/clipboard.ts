// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import { copyText } from "./copy";
import { escapeText } from "./preview";
import { announceGrab, sendGrab } from "./send";
import type { GrabEntry, GrabPayload } from "./types";

export const KNOBS_TYPE = "application/x-knobs-grab";

/** The type's old name, written beside it with the same payload until 1.0. */
export const DEVKNOBS_TYPE = "application/x-devknobs-grab";

/** react-grab's own type, which agents that paste from it already read. */
export const REACT_GRAB_TYPE = "application/x-react-grab";

interface ReactGrabEntry {
  tagName?: string;
  componentName?: string;
  content: string;
  source?: GrabEntry["source"];
  stackContext?: string;
  frames?: GrabEntry["frames"];
}

/** Every format a grab puts on the clipboard, by type. */
export function clipboardData(payload: GrabPayload, now = Date.now()): Record<string, string> {
  const entries: ReactGrabEntry[] = payload.entries.map((entry) => ({
    tagName: entry.tagName,
    componentName: entry.componentName,
    content: entry.content,
    source: entry.source,
    stackContext: entry.stackContext,
    frames: entry.frames,
  }));
  const own = JSON.stringify({ ...payload, timestamp: now });
  return {
    "text/plain": payload.content,
    "text/html": `<meta charset='utf-8'><pre><code>${escapeText(payload.content)}</code></pre>`,
    [KNOBS_TYPE]: own,
    [DEVKNOBS_TYPE]: own,
    [REACT_GRAB_TYPE]: JSON.stringify({
      version: "devknobs",
      content: payload.content,
      entries,
      timestamp: now,
    }),
  };
}

/** Copy a grab, in all its formats. Where those cannot go, only its text does. */
export function copyGrab(payload: GrabPayload): Promise<boolean> {
  return copyText(payload.content, clipboardData(payload));
}

/** What became of a grab: whether it reached the clipboard, and the send target (null with none). */
export interface Delivery {
  copied: Promise<boolean>;
  sent: Promise<boolean | null>;
}

/**
 * Hand a grab out: copy it first, inside the gesture that asked, then tell the
 * page with a `knobs:grab` event and send it to the target. One call per grab.
 */
export function deliverGrab(payload: GrabPayload, copy: (payload: GrabPayload) => Promise<boolean> = copyGrab): Delivery {
  const copied = copy(payload);
  announceGrab(payload);
  return { copied, sent: sendGrab(payload) };
}
