export interface SimpleCategory {
  id: string;
}

export const FALLBACK_ACCENT = "#6366f1";

const FALLBACK_RGB = hexToRgb(FALLBACK_ACCENT) ?? { r: 99, g: 102, b: 241 };

export function deriveInitialIndex(categories: SimpleCategory[], id?: string) {
  const idx = categories.findIndex((c) => c.id === id);
  return idx >= 0 ? idx : 0;
}

export function hexToRgb(hex?: string | null) {
  if (!hex) return null;
  let normalized = hex.trim();
  if (!normalized) return null;
  if (!normalized.startsWith("#")) {
    normalized = `#${normalized}`;
  }
  if (normalized.length === 4) {
    const [, r, g, b] = normalized;
    normalized = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (normalized.length !== 7) return null;
  const parsed = Number.parseInt(normalized.slice(1), 16);
  if (Number.isNaN(parsed)) return null;
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function rgba(hex?: string | null, alpha = 1) {
  const rgb = hexToRgb(hex) ?? FALLBACK_RGB;
  const safeAlpha = clamp(alpha, 0, 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
}

export function tintColor(hex?: string | null, amount = 0.5, alpha = 1) {
  const rgb = hexToRgb(hex) ?? FALLBACK_RGB;
  const ratio = clamp(amount, 0, 1);
  const safeAlpha = clamp(alpha, 0, 1);
  const r = Math.round(rgb.r + (255 - rgb.r) * ratio);
  const g = Math.round(rgb.g + (255 - rgb.g) * ratio);
  const b = Math.round(rgb.b + (255 - rgb.b) * ratio);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function getReadableColor(hex?: string | null, light = "#ffffff", dark = "#000000") {
  const rgb = hexToRgb(hex);
  if (!rgb) return light;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? dark : light;
}

export function computeNextIndex(
  activeIndex: number,
  offset: number,
  velocity: number,
  length: number
) {
  const threshold = 32;
  const velocityThreshold = 300;
  if ((offset < -threshold || velocity < -velocityThreshold) && activeIndex < length - 1) {
    return activeIndex + 1;
  }
  if ((offset > threshold || velocity > velocityThreshold) && activeIndex > 0) {
    return activeIndex - 1;
  }
  return activeIndex;
}

export function shouldPreventScroll(dx: number, dy: number) {
  return Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy);
}

