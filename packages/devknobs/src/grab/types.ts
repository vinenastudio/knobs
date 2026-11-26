/**
 * The shapes a grab hands out. They live apart from the code that builds them,
 * so the public types never reach into bippy.
 */

export type SourceOrigin = "app" | "package" | "unknown";

export interface ResolvedSource {
  filePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName: string | null;
  origin: SourceOrigin;
  /** The line and column came through a source map, or from React's own debug source. */
  symbolicated: boolean;
}

export interface GrabOptions {
  /** App source lines per element. Defaults to 3. */
  maxLines?: number;
  /** Stops waiting on source maps. What resolved by then is used. */
  signal?: AbortSignal;
}

/** A stack frame as the clipboard carries it, without bippy's raw text. */
export interface GrabFrame {
  functionName?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  isServer?: boolean;
  isSymbolicated?: boolean;
}

export interface GrabEntry {
  tagName: string;
  componentName?: string;
  /** The element's line, `[<html> in Comp (at path) ...]`. */
  content: string;
  /**
   * A selector for the element. `content` shows it only when it is semantic. Steps into a
   * shadow root (`>>>`) or a frame (`>>iframe>>`) make it more than a plain css selector.
   */
  selector: string;
  source: ResolvedSource | null;
  stackContext: string;
  frames: GrabFrame[];
}

export interface GrabPayload {
  /** Every entry's line, one per line, numbered with the note last when there is more than one or a note. */
  content: string;
  entries: GrabEntry[];
  /** The tray's note, trimmed. Left out when empty. */
  note?: string;
}

/** What `grab` hands back: the payload, and whether it reached the clipboard. */
export interface GrabResult extends GrabPayload {
  copied: boolean;
}
