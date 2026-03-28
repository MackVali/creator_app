export interface SimpleCategory {
  id: string;
}

export interface PersistableCategoryOrderItem extends SimpleCategory {
  isReorderable: boolean;
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

export function shouldPreventScroll(dx: number, dy: number) {
  return Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy);
}

export function derivePersistedCategoryOrders(
  categories: PersistableCategoryOrderItem[]
): Record<string, number> {
  const orders: Record<string, number> = {};
  let persistedOrder = 1;

  for (const category of categories) {
    if (category.id === "uncategorized") {
      continue;
    }

    if (category.isReorderable) {
      orders[category.id] = persistedOrder;
    }
    persistedOrder += 1;
  }

  return orders;
}
