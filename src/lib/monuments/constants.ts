export const FREE_MONUMENTS_PER_AREA = 4;
export const PLUS_MONUMENTS_PER_AREA = 20;

export function getMaxMonumentsPerArea(isPlus: boolean) {
  return isPlus ? PLUS_MONUMENTS_PER_AREA : FREE_MONUMENTS_PER_AREA;
}
