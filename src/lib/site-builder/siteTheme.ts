import type { CSSProperties } from "react";

import type {
  SiteThemeConfig,
  SiteThemePalette,
} from "@/lib/site-builder/types";

type PaletteTokens = {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  accent: string;
};

const palettes: Record<
  SiteThemePalette,
  PaletteTokens
> = {
  graphite: {
    background: "#0d0d0c",
    surface: "#171715",
    text: "#f5f5f0",
    mutedText: "#a3a29b",
    border: "#2a2a27",
    accent: "#f5f5f0",
  },

  ink: {
    background: "#0c0f14",
    surface: "#141922",
    text: "#f4f7fb",
    mutedText: "#9ea8b6",
    border: "#2a303a",
    accent: "#b8c8e6",
  },

  slate: {
    background: "#111416",
    surface: "#181d1f",
    text: "#f2f4f3",
    mutedText: "#9ea7a6",
    border: "#2d3436",
    accent: "#bdc9c7",
  },

  warm: {
    background: "#17130f",
    surface: "#201a15",
    text: "#f5efe7",
    mutedText: "#b2a69a",
    border: "#392f27",
    accent: "#dfc2a3",
  },

  paper: {
    background: "#f7f5f0",
    surface: "#fcfbf8",
    text: "#1c1c1a",
    mutedText: "#706e68",
    border: "#d9d5cc",
    accent: "#1c1c1a",
  },
};

export function createDefaultSiteTheme(): SiteThemeConfig {
  return {
    palette: "graphite",
    accentColor: palettes.graphite.accent,
    typography: "sans",
    width: "standard",
    spacing: "normal",
    sectionSpacing: 40,
    pagePadding: 58,
    radius: "soft",
  };
}

export function getSiteThemeConfig(site: {
  theme?: SiteThemeConfig;
}): SiteThemeConfig {
  return site.theme ?? createDefaultSiteTheme();
}

export function getSiteThemePreset(
  palette: SiteThemePalette,
) {
  return { ...palettes[palette] };
}

export function getSiteThemeColors(
  theme: SiteThemeConfig,
) {
  const preset = palettes[theme.palette];

  return {
    background:
      theme.colors?.background ??
      preset.background,

    surface:
      theme.colors?.surface ??
      preset.surface,

    text:
      theme.colors?.text ??
      preset.text,

    mutedText:
      theme.colors?.mutedText ??
      preset.mutedText,

    border:
      theme.colors?.border ??
      preset.border,

    accent:
      theme.accentColor ||
      preset.accent,
  };
}

function hexToRgb(hex: string) {
  const match =
    /^#([0-9a-f]{6})$/i.exec(hex);

  if (!match) return null;

  const value = Number.parseInt(
    match[1],
    16,
  );

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(
  r: number,
  g: number,
  b: number,
) {
  return `#${[r, g, b]
    .map((value) =>
      Math.round(value)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function mixHex(
  first: string,
  second: string,
  amount: number,
) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);

  if (!a || !b) return first;

  return rgbToHex(
    a.r + (b.r - a.r) * amount,
    a.g + (b.g - a.g) * amount,
    a.b + (b.b - a.b) * amount,
  );
}

function getContrastColor(
  hex: string,
) {
  const rgb = hexToRgb(hex);

  if (!rgb) return "#000000";

  const luminance =
    0.2126 * rgb.r +
    0.7152 * rgb.g +
    0.0722 * rgb.b;

  return luminance > 145
    ? "#090909"
    : "#ffffff";
}

const pageWidths = {
  compact: "1120px",
  standard: "1440px",
  wide: "1680px",
} as const;

const legacySpacing = {
  compact: 24,
  normal: 40,
  spacious: 64,
} as const;

const radii = {
  sharp: "0px",
  soft: "6px",
  rounded: "14px",
} as const;

const fontFamilies = {
  sans:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

  serif:
    'ui-serif, Georgia, Cambria, "Times New Roman", serif',

  mono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const;

type ThemeStyle =
  CSSProperties &
  Record<`--site-${string}`, string>;

export function getSiteThemeStyle(
  theme: SiteThemeConfig,
): ThemeStyle {
  const colors =
    getSiteThemeColors(theme);

  const sectionSpacing =
    theme.sectionSpacing ??
    legacySpacing[theme.spacing];

  const pagePadding =
    theme.pagePadding ?? 58;

  const mutedSurface = mixHex(
    colors.surface,
    colors.text,
    0.045,
  );

  const strongSurface = mixHex(
    colors.background,
    colors.surface,
    0.45,
  );

  const subtleText = mixHex(
    colors.mutedText,
    colors.background,
    0.24,
  );

  const faintText = mixHex(
    colors.mutedText,
    colors.background,
    0.5,
  );

  const strongBorder = mixHex(
    colors.border,
    colors.text,
    0.18,
  );

  return {
    backgroundColor:
      colors.background,

    color:
      colors.text,

    fontFamily:
      fontFamilies[theme.typography],

    "--site-bg":
      colors.background,

    "--site-surface":
      colors.surface,

    "--site-surface-strong":
      strongSurface,

    "--site-surface-muted":
      mutedSurface,

    "--site-border":
      colors.border,

    "--site-border-strong":
      strongBorder,

    "--site-text":
      colors.text,

    "--site-text-muted":
      colors.mutedText,

    "--site-text-subtle":
      subtleText,

    "--site-text-faint":
      faintText,

    "--site-accent":
      colors.accent,

    "--site-accent-contrast":
      getContrastColor(
        colors.accent,
      ),

    "--site-page-width":
      pageWidths[theme.width],

    "--site-page-x":
      `clamp(18px, 4vw, ${pagePadding}px)`,

    "--site-section-y":
      `${sectionSpacing}px`,

    "--site-radius":
      radii[theme.radius],
  };
}
