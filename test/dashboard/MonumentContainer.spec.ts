import { describe, expect, it } from "vitest";

import { buildEmbeddedMonumentPages } from "../../src/components/ui/monumentPagination";

function monuments(count: number) {
  return Array.from({ length: count }, (_, index) => `monument-${index + 1}`);
}

describe("buildEmbeddedMonumentPages", () => {
  it.each([
    { count: 0, expectedCells: [1] },
    { count: 7, expectedCells: [8] },
    { count: 8, expectedCells: [8, 1] },
    { count: 9, expectedCells: [8, 2] },
    { count: 15, expectedCells: [8, 8] },
    { count: 16, expectedCells: [8, 8, 1] },
    { count: 17, expectedCells: [8, 8, 2] },
  ])(
    "keeps every command monument page within 8 cells for $count monuments",
    ({ count, expectedCells }) => {
      const pages = buildEmbeddedMonumentPages(monuments(count), 8);
      const cellCounts = pages.map(
        (page) => page.monuments.length + (page.showNewCard ? 1 : 0)
      );

      expect(cellCounts).toEqual(expectedCells);
      expect(Math.max(...cellCounts)).toBeLessThanOrEqual(8);
      expect(pages.filter((page) => page.showNewCard)).toHaveLength(1);
      expect(pages.at(-1)?.showNewCard).toBe(true);
    }
  );

  it("tracks each page start index for local reorder persistence", () => {
    const pages = buildEmbeddedMonumentPages(monuments(17), 8);

    expect(pages.map((page) => page.pageStartIndex)).toEqual([0, 8, 16]);
    expect(pages.map((page) => page.monuments)).toEqual([
      monuments(8),
      monuments(17).slice(8, 16),
      monuments(17).slice(16),
    ]);
  });
});
