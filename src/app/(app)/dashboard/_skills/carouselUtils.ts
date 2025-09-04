export interface SimpleCategory {
  id: string;
}

export function deriveInitialIndex(categories: SimpleCategory[], id?: string) {
  const idx = categories.findIndex((c) => c.id === id);
  return idx >= 0 ? idx : 0;
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
