export const MONEY_SEMANTIC_COLORS = {
  positive: "#6FD68A",
  negative: "#D86A82",
  allocated: "#5AA7E8",
} as const;

export const MONEY_CATEGORY_COLORS = {
  gray: { label: "Gray", color: "#9CA3AF" },
  red: { label: "Red", color: "#D97878" },
  orange: { label: "Orange", color: "#D99062" },
  amber: { label: "Amber", color: "#D5AC62" },
  lime: { label: "Lime", color: "#A6C96A" },
  green: { label: "Green", color: "#6FC58A" },
  teal: { label: "Teal", color: "#62B8A8" },
  cyan: { label: "Cyan", color: "#68B8CC" },
  blue: { label: "Blue", color: "#659FD4" },
  indigo: { label: "Indigo", color: "#7E8FD0" },
  violet: { label: "Violet", color: "#A083CF" },
  pink: { label: "Pink", color: "#CF7FAA" },
} as const;

export type MoneyCategoryColorKey = keyof typeof MONEY_CATEGORY_COLORS;

export const DEFAULT_MONEY_CATEGORY_COLOR_KEY: MoneyCategoryColorKey = "gray";

export function normalizeMoneyCategoryColorKey(
  value: string | null | undefined,
): MoneyCategoryColorKey {
  return value && value in MONEY_CATEGORY_COLORS
    ? (value as MoneyCategoryColorKey)
    : DEFAULT_MONEY_CATEGORY_COLOR_KEY;
}

export function getMoneyCategoryColor(value: string | null | undefined) {
  return MONEY_CATEGORY_COLORS[normalizeMoneyCategoryColorKey(value)];
}
