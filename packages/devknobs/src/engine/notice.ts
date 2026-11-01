import { copyText } from "../ui/copytext";
import type { FrameRefusal } from "./native";

/**
 * Over the frame when the page is out of reach: `X-Frame-Options` or a
 * `frame-ancestors` policy left an error page there, or a link led away to
 * another origin. Either way none of the knobs can follow it. Its button
 * calls `close`.
 */
export function createNotice(close: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = "blocked";
  box.hidden = true;
  const text = document.createElement("div");
  text.textContent = "this page refuses to load in a frame";
  const why = document.createElement("div");
  why.className = "why";
  why.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "close the frame";
  button.addEventListener("click", close);
  box.append(text, why, button);
  return box;
}

/**
 * Say why under the notice, as a host told it, with a button for its details
 * and one to find out more, which runs the host's `retry` and then `again`.
 * Null takes it away.
 */
export function explain(box: HTMLElement, refusal: FrameRefusal | null, again: () => void): void {
  const [why] = box.querySelectorAll<HTMLElement>(".why");
  if (!why) return;
  why.replaceChildren();
  why.hidden = refusal === null;
  if (!refusal) return;
  const line = document.createElement("div");
  line.textContent = refusal.why;
  why.append(line);
  const { details, retry } = refusal;
  if (details !== undefined) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy";
    copy.textContent = "copy details";
    copy.addEventListener("click", () => {
      void copyText(details).then((copied) => {
        copy.textContent = copied ? "copied" : "could not copy";
      });
    });
    why.append(copy);
  }
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "retry";
    button.textContent = retry.label;
    const run = () => {
      button.disabled = true;
      retry.run().then(again, (error: unknown) => {
        line.textContent = error instanceof Error ? error.message : String(error);
        button.disabled = false;
      });
    };
    button.addEventListener("click", run);
    why.append(button);
  }
}
