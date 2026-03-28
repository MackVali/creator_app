export const FALLBACK_CATEGORY_COLOR = "#6a63ff";

export const CATEGORY_COLOR_OPTIONS = [
  { label: "Velvet Indigo", value: "#6A63FF" },
  { label: "Royal Iris", value: "#7A5AF8" },
  { label: "Electric Sapphire", value: "#3576F6" },
  { label: "Lagoon Teal", value: "#1F9AA8" },
  { label: "Emerald Studio", value: "#1FA971" },
  { label: "Golden Amber", value: "#C9922E" },
  { label: "Burnished Coral", value: "#D36A53" },
  { label: "Mulberry Glow", value: "#B75C9D" },
] as const;

export function parseHex(hex?: string | null) {
  if (!hex) {
    return { r: 106, g: 99, b: 255 };
  }

  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return { r: 106, g: 99, b: 255 };
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return { r: 106, g: 99, b: 255 };
  }

  return { r, g, b };
}

function channelToHex(channel: number) {
  const clamped = Math.max(0, Math.min(255, Math.round(channel)));
  return clamped.toString(16).padStart(2, "0");
}

function blend(hex: string, target: string, amount: number) {
  const start = parseHex(hex);
  const end = parseHex(target);
  const r = start.r + (end.r - start.r) * amount;
  const g = start.g + (end.g - start.g) * amount;
  const b = start.b + (end.b - start.b) * amount;
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

export function lighten(hex: string, amount: number) {
  return blend(hex, "#ffffff", amount);
}

export function darken(hex: string, amount: number) {
  return blend(hex, "#000000", amount);
}

export function withAlpha(hex: string | null | undefined, alpha: number) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getOnColor(hex: string) {
  if (!hex) return "#fff";
  const { r, g, b } = parseHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#08111f" : "#f8fafc";
}

export function buildCategoryCardPalette(color: string, active: boolean) {
  const base = color || FALLBACK_CATEGORY_COLOR;
  const on = getOnColor(base);
  const shellTop = active ? lighten(base, 0.18) : lighten(base, 0.1);
  const shellMid = active
    ? blend(base, "#132033", 0.18)
    : blend(base, "#101826", 0.3);
  const shellBottom = active ? darken(base, 0.34) : darken(base, 0.42);
  const innerGlow = active ? lighten(base, 0.42) : lighten(base, 0.28);
  const rim =
    on === "#f8fafc"
      ? withAlpha("#ffffff", active ? 0.24 : 0.16)
      : withAlpha("#08111f", active ? 0.2 : 0.14);
  const frame =
    on === "#f8fafc"
      ? withAlpha("#ffffff", active ? 0.24 : 0.16)
      : withAlpha("#0f172a", active ? 0.24 : 0.16);
  const track =
    on === "#f8fafc" ? withAlpha("#ffffff", 0.2) : withAlpha("#0f172a", 0.22);
  const fill =
    on === "#f8fafc" ? withAlpha("#ffffff", 0.9) : withAlpha("#0f172a", 0.78);
  const listBg = active
    ? `linear-gradient(180deg, ${withAlpha(darken(base, 0.52), 0.34)} 0%, ${withAlpha(darken(base, 0.62), 0.24)} 100%)`
    : `linear-gradient(180deg, ${withAlpha(darken(base, 0.58), 0.28)} 0%, ${withAlpha(darken(base, 0.66), 0.18)} 100%)`;
  const badgeBg =
    on === "#f8fafc"
      ? withAlpha("#ffffff", active ? 0.16 : 0.12)
      : withAlpha("#08111f", active ? 0.14 : 0.1);
  const badgeBorder =
    on === "#f8fafc"
      ? withAlpha("#ffffff", active ? 0.24 : 0.16)
      : withAlpha("#08111f", active ? 0.22 : 0.16);
  const badgeNameBg =
    on === "#f8fafc"
      ? `linear-gradient(180deg, ${withAlpha("#ffffff", active ? 0.22 : 0.16)} 0%, ${withAlpha("#ffffff", active ? 0.12 : 0.08)} 100%)`
      : `linear-gradient(180deg, ${withAlpha("#ffffff", active ? 0.58 : 0.48)} 0%, ${withAlpha("#dbe4f0", active ? 0.42 : 0.34)} 100%)`;
  const badgeNameBorder =
    on === "#f8fafc"
      ? withAlpha("#ffffff", active ? 0.28 : 0.18)
      : withAlpha("#ffffff", active ? 0.52 : 0.4);
  const halo = withAlpha(lighten(base, 0.34), active ? 0.22 : 0.12);
  const dropShadow = active
    ? `0 24px 50px ${withAlpha(darken(base, 0.7), 0.36)}, 0 10px 20px rgba(2, 6, 23, 0.24)`
    : `0 18px 36px ${withAlpha(darken(base, 0.76), 0.24)}, 0 8px 16px rgba(2, 6, 23, 0.18)`;
  const highlight = `radial-gradient(circle at 18% 14%, ${withAlpha("#ffffff", active ? 0.26 : 0.18)} 0%, ${withAlpha("#ffffff", 0)} 42%)`;
  const colorBloom = `radial-gradient(circle at 82% 12%, ${withAlpha(innerGlow, active ? 0.22 : 0.16)} 0%, ${withAlpha(innerGlow, 0)} 44%)`;
  const depthShade = `linear-gradient(180deg, ${withAlpha("#020617", active ? 0.04 : 0.08)} 0%, ${withAlpha("#020617", active ? 0.14 : 0.22)} 100%)`;
  const surface = `linear-gradient(165deg, ${shellTop} 0%, ${shellMid} 54%, ${shellBottom} 100%)`;
  const contentGlass = `linear-gradient(180deg, ${withAlpha("#ffffff", on === "#f8fafc" ? 0.09 : 0.56)} 0%, ${withAlpha("#ffffff", on === "#f8fafc" ? 0.02 : 0.22)} 100%)`;

  return {
    base,
    on,
    surface,
    halo,
    frame,
    rim,
    track,
    fill,
    listBg,
    badgeBg,
    badgeBorder,
    badgeNameBg,
    badgeNameBorder,
    dropShadow,
    highlight,
    colorBloom,
    depthShade,
    contentGlass,
  };
}
