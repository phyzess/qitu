export const spacing = {
  xs: "var(--s-1)",
  sm: "var(--s0)",
  md: "var(--s1)",
  lg: "var(--s2)",
  xl: "var(--s3)",
} as const;

export const radii = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
} as const;

export const typography = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
  number: "var(--font-number)",
} as const;

export const colorTokens = {
  background: "var(--bg)",
  surface: "var(--surface)",
  surfaceRaised: "var(--surface-2)",
  line: "var(--line)",
  text: "var(--text)",
  muted: "var(--muted)",
  dim: "var(--dim)",
  positive: "var(--green)",
  negative: "var(--red)",
  warning: "var(--amber)",
  info: "var(--blue)",
} as const;
