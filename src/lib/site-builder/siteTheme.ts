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
    background: "#080808",
    surface: "#101011",
    text: "#f4f3ef",
    mutedText: "#969693",
    border: "#29292b",
    accent: "#f4f3ef",
  },

  ink: {
    background: "#070a12",
    surface: "#0d1420",
    text: "#f2f6ff",
    mutedText: "#93a2ba",
    border: "#293750",
    accent: "#7ea7ff",
  },

  slate: {
    background: "#10171c",
    surface: "#172127",
    text: "#f1f5f7",
    mutedText: "#9cabb3",
    border: "#34434c",
    accent: "#9dc8d9",
  },

  warm: {
    background: "#15100c",
    surface: "#201811",
    text: "#f7eee5",
    mutedText: "#b7a496",
    border: "#49362a",
    accent: "#e8b783",
  },

  paper: {
    background: "#f4f0e8",
    surface: "#fffdf8",
    text: "#1b1814",
    mutedText: "#686057",
    border: "#d4cabc",
    accent: "#1b1814",
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
  soft: "8px",
  rounded: "18px",
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
