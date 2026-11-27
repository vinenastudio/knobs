import { checkPatch } from "./engine/check";
import { isGrabSend } from "./grab/send";
import type { MountOptions } from "./index";

/**
 * What a page's own mount may choose on a host's panel: its keys, grab, its
 * color, where grabs are sent and whether the panel starts open. The rest is the host's to say.
 * Read field by field, as it comes from another copy, maybe of another version.
 */
export function pageChoices(options: object): MountOptions {
  const chosen: MountOptions = {};
  const hotkey: unknown = Reflect.get(options, "hotkey");
  const grabKey: unknown = Reflect.get(options, "grabKey");
  const grab: unknown = Reflect.get(options, "grab");
  const open: unknown = Reflect.get(options, "open");
  const grabColor: unknown = Reflect.get(options, "grabColor");
  const grabSend: unknown = Reflect.get(options, "grabSend");
  if (typeof hotkey === "string") chosen.hotkey = hotkey;
  if (typeof grabKey === "string") chosen.grabKey = grabKey;
  if (typeof grab === "boolean") chosen.grab = grab;
  if (typeof open === "boolean") chosen.open = open;
  if (isGrabSend(grabSend)) chosen.grabSend = grabSend;
  if (grabColor !== undefined) {
    const patch = { grabColor };
    try {
      checkPatch(patch);
      if (patch.grabColor !== undefined) chosen.grabColor = patch.grabColor;
    } catch {
      // Not a color grab draws in: the host keeps its own.
    }
  }
  return chosen;
}

/** Which copy runs the panel on a page that mounts its own: the extension's, or the page's. */
export type PreferValue = "extension" | "page";

/**
 * A host's choice of who runs the panel where the page mounts its own copy,
 * shown in the panel's settings. With `page`, the host steps aside for a page
 * copy that can take the page from it: it takes its panel, frame and patches
 * away and that copy mounts as on a page with no host.
 */
export interface PreferSetting {
  /** The choice as the mount begins. `setPrefer` brings a later one. */
  value: PreferValue;
  /** The user picked another in the settings: keep it for the next load. */
  change: (value: PreferValue) => void;
  /** The host let a copy of the page's have the page, and will not take it back. */
  yielded?: () => void;
  /** The choice as it is now, where it can change elsewhere, such as in another tab. */
  now?: () => PreferValue;
}

/** What the settings say under the choice. */
export const PREFER_HINT =
  "page: a site's own knobs, say a local build, runs the panel where the site has one; real browser settings are off then";

/**
 * A host's preference, as a page copy reads it from the host that handed the
 * page over, field by field: it comes from another copy, maybe of another version.
 */
export function preferOf(handed: object): PreferSetting | null {
  const prefer: unknown = Reflect.get(handed, "prefer");
  if (typeof prefer !== "object" || prefer === null) return null;
  const value: unknown = Reflect.get(prefer, "value");
  const change: unknown = Reflect.get(prefer, "change");
  if ((value !== "extension" && value !== "page") || typeof change !== "function") return null;
  const now: unknown = Reflect.get(prefer, "now");
  return {
    value,
    change: (next) => void Reflect.apply(change, prefer, [next]),
    ...(typeof now === "function"
      ? {
          now: () => {
            const current: unknown = Reflect.apply(now, prefer, []);
            return current === "extension" ? "extension" : "page";
          },
        }
      : {}),
  };
}

/**
 * Does a host step aside for a page copy? Only where the user prefers the
 * page's and that copy left a way to take the page: older copies leave none.
 */
export function stepsAside(prefer: PreferValue | null, take: unknown): boolean {
  return prefer === "page" && typeof take === "function";
}

/** Does a host take the page back from a copy that took it? Not where the user prefers the page's. */
export function takesBack(prefer: PreferValue | null): boolean {
  return prefer !== "page";
}

/** Which build of a host: the one a store ships, or a local one, such as an unpacked extension. */
export type HostBuild = "store" | "local";

/** A host's rank, on the host slot, so that where two hosts meet on a page, one holds it. */
export interface HostRank {
  build: HostBuild;
  /** Its version as its footer names it, such as `0.5.1` or `0.5.1 · local ios26-preview (9e966ae)`. */
  version: string;
}

/** A host's rank as another copy reads it from the host slot, field by field. Null for an older host that leaves none. */
export function rankOf(host: object): HostRank | null {
  const rank: unknown = Reflect.get(host, "rank");
  if (typeof rank !== "object" || rank === null) return null;
  const build: unknown = Reflect.get(rank, "build");
  const version: unknown = Reflect.get(rank, "version");
  if ((build !== "store" && build !== "local") || typeof version !== "string") return null;
  return { build, version };
}

/** The numbers a version starts with, zeros where it has none, such as `source`. */
function numbers(version: string): number[] {
  const found = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return found ? found.slice(1).map(Number) : [0, 0, 0];
}

/**
 * Does host `a` outrank host `b`, so it holds the page where both meet? A
 * local build outranks a store one, then the newer version, then the version
 * as text, so the answer never depends on which came first. Any host with a
 * rank outranks an older one that leaves none.
 */
export function outranks(a: HostRank, b: HostRank | null): boolean {
  if (!b) return true;
  if (a.build !== b.build) return a.build === "local";
  const [x, y] = [numbers(a.version), numbers(b.version)];
  for (let index = 0; index < 3; index++) {
    if (x[index] !== y[index]) return (x[index] ?? 0) > (y[index] ?? 0);
  }
  return a.version > b.version;
}

/** What a host's footer says of a host that stood down for it, such as `store extension stood down`. */
export function stoodDownNote(other: HostRank | null): string {
  return `${other?.build ?? "older"} extension stood down`;
}
