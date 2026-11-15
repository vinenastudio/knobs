import { defineVars } from '@stylexjs/stylex';

const DARK = '@media (prefers-color-scheme: dark)';

/**
 * The devknobs panel's own palette (its `styles.ts`), so the site and the
 * panel on it look like one thing. Warm neutrals that follow the visitor's
 * scheme the way the panel does. Do not use these directly in components:
 * use the semantic `colors` vars below so dark mode keeps working.
 */
export const palette = defineVars({
  ink: '#1b1b19',
  inkDark: '#e9e9e3',
  paper: '#fbfbf9',
  paperDark: '#151513',
});

/**
 * Semantic colors, each the panel's value of the same name in light and dark.
 * `muted` is the panel's `--faint`, a step darker in light so small text on a
 * `card` keeps 4.5:1. `accent` is grab's blue; `link` is link text, a darker
 * blue in light so it keeps 4.5:1 on the page.
 */
export const colors = defineVars({
  accent: 'rgb(41, 151, 255)',
  bg: { [DARK]: '#151513', default: '#fbfbf9' },
  border: { [DARK]: '#2b2b28', default: '#e6e6e0' },
  card: { [DARK]: '#1f1f1c', default: '#f1f1ec' },
  // The docs' code: four quiet roles, each 4.5:1 on a `card`. Comments are `muted`.
  codeKeyword: { [DARK]: '#6cb6ff', default: '#1f6fbf' },
  codeName: { [DARK]: '#bfa3ea', default: '#7a4cb8' },
  codeNumber: { [DARK]: '#e3a066', default: '#a8501c' },
  codeString: { [DARK]: '#86c79b', default: '#2a7444' },
  disabled: { [DARK]: '#8c8c85', default: '#6d6d67' },
  error: { [DARK]: '#ff6369', default: '#e5484d' },
  fg: { [DARK]: '#e9e9e3', default: '#1b1b19' },
  // grab's label bar, which is dark on a light page and light on a dark one.
  grabBar: { [DARK]: '#ffffff', default: '#161616' },
  grabBarText: { [DARK]: '#171717', default: '#ffffff' },
  grabTag: { [DARK]: '#737373', default: '#a7a7a7' },
  link: { [DARK]: 'rgb(41, 151, 255)', default: '#1d69b5' },
  muted: { [DARK]: '#8c8c85', default: '#666661' },
  raised: { [DARK]: '#383833', default: '#ffffff' },
  track: { [DARK]: '#0f0f0e', default: '#e6e6e0' },
  warning: { [DARK]: '#fbbf24', default: '#d97706' },
});

/** The panel's lift under a raised chip: a hairline shadow in light, none in dark. */
export const shadow = defineVars({
  lift: { [DARK]: 'none', default: '0 1px 2px rgb(0 0 0 / 0.1)' },
});

/**
 * The panel's concentric radii: 13 for a panel, 8 for what sits 4 inside it
 * (rows, fields), 4 for controls. `bar` is grab's label bar.
 */
export const radius = defineVars({
  bar: '6px',
  base: '4px',
  panel: '13px',
  row: '8px',
});

/** 4px spacing scale. */
export const spacing = defineVars({
  s1: '4px',
  s12: '48px',
  s16: '64px',
  s2: '8px',
  s3: '12px',
  s4: '16px',
  s6: '24px',
  s8: '32px',
});

/** The panel's system stack, and the monospace its readout strip uses. */
export const font = defineVars({
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  sizeLg: '1.25rem',
  sizeMd: '1rem',
  sizeSm: '0.875rem',
  sizeXs: '0.75rem',
  weightBold: '700',
  weightMedium: '500',
  weightRegular: '400',
});
