import type { CSSProperties } from "react";

import type {
  SiteThemeConfig,
  SiteThemePalette,
} from "@/lib/site-builder/types";

type PaletteTokens = {
  background: string;
  surface: string;
  strong: string;
  muted: string;
  border: string;
  text: string;
  mutedText: string;
};

const palettes: Record<SiteThemePalette, PaletteTokens> = {
  graphite: {
    background: "#080808",
    surface: "#0c0c0c",
    strong: "#000000",
    muted: "#101010",
    border: "#242424",
    text: "#f4f3ef",
    mutedText: "#898989",
  },
  ink: {
    background: "#06070a",
    surface: "#0b0d12",
    strong: "#020307",
    muted: "#10131a",
    border: "#242936",
    text: "#f3f6ff",
    mutedText: "#8790a0",
  },
  slate: {
    background: "#0b0e11",
    surface: "#11161b",
    strong: "#07090b",
    muted: "#151b21",
    border: "#29323b",
    text: "#f1f4f6",
    mutedText: "#89949d",
  },
  warm: {
    background: "#0c0a08",
    surface: "#14100d",
    strong: "#050403",
    muted: "#18130f",
    border: "#30271f",
    text: "#f5eee6",
    mutedText: "#9b8e82",
  },
};

export function createDefaultSiteTheme(): SiteThemeConfig {
  return {
    palette: "graphite",
    accentColor: "#f4f3ef",
    typography: "sans",
    width: "standard",
    spacing: "normal",
    radius: "soft",
  };
}

export function getSiteThemeConfig(site: {
  theme?: SiteThemeConfig;
}): SiteThemeConfig {
  return site.theme ?? createDefaultSiteTheme();
}

const pageWidths = {
  compact: "1180px",
  standard: "1600px",
  wide: "1920px",
} as const;

const sectionSpacing = {
  compact: "20px",
  normal: "32px",
  spacious: "48px",
} as const;

const radii = {
  sharp: "0px",
  soft: "4px",
  rounded: "12px",
} as const;

const fontFamilies = {
  sans:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif:
    'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const;

type ThemeStyle = CSSProperties &
  Record<`--site-${string}`, string>;

export function getSiteThemeStyle(
  theme: SiteThemeConfig,
): ThemeStyle {
  const palette = palettes[theme.palette];

  return {
    backgroundColor: palette.background,
    color: palette.text,
    fontFamily: fontFamilies[theme.typography],

    "--site-bg": palette.background,
    "--site-surface": palette.surface,
    "--site-surface-strong": palette.strong,
    "--site-surface-muted": palette.muted,
    "--site-border": palette.border,
    "--site-text": palette.text,
    "--site-muted-text": palette.mutedText,
    "--site-accent": theme.accentColor,
    "--site-page-width": pageWidths[theme.width],
    "--site-section-y": sectionSpacing[theme.spacing],
    "--site-radius": radii[theme.radius],
  };
}
