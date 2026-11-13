import { ensureStyle, removeStyle } from "./style";
import { OWN_AND_IN } from "../mark";

const NAME = "outlines";

export function apply(value: boolean): void {
  if (!value) {
    reset();
    return;
  }
  ensureStyle(NAME).textContent =
    `body *:not(${OWN_AND_IN}){outline:1px solid rgba(127,127,127,.5)!important}`;
}

export function reset(): void {
  removeStyle(NAME);
}
