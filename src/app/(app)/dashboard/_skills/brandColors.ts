export const BRAND_CAT_COLORS = [
  "#6366F1",
  "#2563EB",
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#84CC16",
  "#FACC15",
  "#F97316",
  "#EF4444",
  "#F43F5E",
  "#EC4899",
  "#A855F7",
] as const;

export type BrandCatColor = (typeof BRAND_CAT_COLORS)[number];
