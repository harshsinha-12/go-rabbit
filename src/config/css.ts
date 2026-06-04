export const GO_RABBIT_CSS_VARIABLES = {
  dark: "--GO_RABBIT_DARK",
  light: "--GO_RABBIT_LIGHT",
  background: "--GO_RABBIT_BACKGROUND",
  muted: "--GO_RABBIT_MUTED",
  textSoft: "--GO_RABBIT_TEXT_SOFT",
  border: "--GO_RABBIT_BORDER",
  primary: "--GO_RABBIT_PRIMARY",
  primaryDark: "--GO_RABBIT_PRIMARY_DARK",
  primaryLight: "--GO_RABBIT_PRIMARY_LIGHT",
  focus: "--GO_RABBIT_FOCUS",
} as const;

export type GoRabbitCSSVariable =
  (typeof GO_RABBIT_CSS_VARIABLES)[keyof typeof GO_RABBIT_CSS_VARIABLES];
