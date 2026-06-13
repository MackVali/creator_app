export const THEME_STORAGE_KEY = "creator-theme";
export const DEFAULT_THEME = "dark";

export const APP_THEMES = ["dark", "light"] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" && APP_THEMES.includes(value as AppTheme);
}
