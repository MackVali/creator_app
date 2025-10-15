export function baseBracket(level: number): number {
  if (level >= 1 && level <= 9) return 10;
  if (level >= 10 && level <= 19) return 14;
  if (level >= 20 && level <= 29) return 20;
  if (level >= 30 && level <= 39) return 24;
  if (level >= 40 && level <= 99) return 30;
  if (level === 100) return 50;
  return 30;
}

export function xpRequired(level: number, prestige: number): number {
  const base = baseBracket(level);
  const prestigeBonus = Math.max(0, prestige) * 2;
  return base + prestigeBonus;
}
