/**
 * A declaration block as a browser keeps one, for the edit tests, and the
 * browser's word on a value, which css edits ask before they set one.
 */

/** The browser's word on a value: a `;` or `nope` is no css. */
export const fakeCss = { supports: (_name: string, value: string) => !/;|nope/.test(value) };

const SIDES = ["top", "right", "bottom", "left"];
const SHORTHANDS: Record<string, string[]> = {
  padding: SIDES.map((side) => `padding-${side}`),
  margin: SIDES.map((side) => `margin-${side}`),
};

interface Longhand {
  name: string;
  value: string;
  important: boolean;
}

/** `a b c d` as css writes four sides back, shortest first. */
function sides([a, b, c, d]: string[]): string {
  if (a === b && b === c && c === d) return `${a}`;
  if (a === c && b === d) return `${a} ${b}`;
  if (b === d) return `${a} ${b} ${c}`;
  return `${a} ${b} ${c} ${d}`;
}

/**
 * A declaration block as a browser keeps one: longhands in order, a
 * shorthand set as its longhands and written back as one where all of them
 * are there, a value with `var()` in a shorthand kept apart, its longhands
 * empty in the text, and a value that is no css left out.
 */
export class Block {
  private list: Longhand[] = [];
  /** A shorthand's value with `var()`, which its longhands cannot hold. */
  private pending = new Map<string, string>();

  constructor(text = "") {
    this.cssText = text;
  }

  get cssText(): string {
    const out: string[] = [];
    const done = new Set<string>();
    for (const one of this.list) {
      if (done.has(one.name)) continue;
      const short = Object.keys(SHORTHANDS).find((name) => SHORTHANDS[name]?.includes(one.name));
      const longs = short ? (SHORTHANDS[short] ?? []) : [];
      const all = longs.map((name) => this.list.find((each) => each.name === name));
      if (short && all.every((each) => each && each.value !== "" && each.important === one.important)) {
        for (const name of longs) done.add(name);
        out.push(`${short}: ${sides(all.map((each) => each?.value ?? ""))}${one.important ? " !important" : ""};`);
        continue;
      }
      done.add(one.name);
      out.push(`${one.name}: ${one.value}${one.important ? " !important" : ""};`);
    }
    return out.join(" ");
  }

  set cssText(text: string) {
    this.list = [];
    this.pending.clear();
    for (const piece of text.split(";")) {
      const at = piece.indexOf(":");
      if (at < 0) continue;
      const value = piece.slice(at + 1).trim();
      const important = /!important$/.test(value);
      this.setProperty(piece.slice(0, at).trim(), value.replace(/\s*!important$/, ""), important ? "important" : "");
    }
  }

  private put(name: string, value: string, important: boolean): void {
    const found = this.list.find((one) => one.name === name);
    if (found) Object.assign(found, { value, important });
    else this.list.push({ name, value, important });
  }

  setProperty(name: string, value: string, priority = ""): void {
    if (value === "" || /;|nope/.test(value)) return;
    const important = priority === "important";
    const longs = SHORTHANDS[name];
    if (!longs) {
      this.put(name, value, important);
      return;
    }
    if (value.includes("var(")) {
      this.pending.set(name, value);
      for (const long of longs) this.put(long, "", important);
      return;
    }
    this.pending.delete(name);
    const parts = value.split(/\s+/);
    const [a = "", b = a, c = a, d = b] = parts;
    longs.forEach((long, i) => this.put(long, [a, b, c, d][i] ?? a, important));
  }

  removeProperty(name: string): string {
    const longs = SHORTHANDS[name] ?? [name];
    this.pending.delete(name);
    this.list = this.list.filter((one) => !longs.includes(one.name));
    return "";
  }

  getPropertyValue(name: string): string {
    const pending = this.pending.get(name);
    if (pending) return pending;
    const longs = SHORTHANDS[name];
    if (!longs) return this.list.find((one) => one.name === name)?.value ?? "";
    const all = longs.map((long) => this.list.find((one) => one.name === long)?.value ?? "");
    return all.every((value) => value !== "") ? sides(all) : "";
  }

  getPropertyPriority(name: string): string {
    const long = SHORTHANDS[name]?.[0] ?? name;
    return this.list.find((one) => one.name === long)?.important ? "important" : "";
  }
}

