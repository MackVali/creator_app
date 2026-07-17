import { describe, expect, it } from "vitest";
import {
  compareMatrixTimeBlockStarts,
  matrixTimeBlockSortValue,
} from "../src/app/(app)/schedule/matrix/matrixTimeBlockOrder";

describe("Matrix Time Block creator-day ordering", () => {
  it("places midnight through 3:59 AM at the end of the creator day", () => {
    const starts = ["00:30", "20:00", "03:00", "06:00", "23:00", "12:00"];

    expect(starts.sort(compareMatrixTimeBlockStarts)).toEqual([
      "06:00",
      "12:00",
      "20:00",
      "23:00",
      "00:30",
      "03:00",
    ]);
  });

  it("preserves input order when start times are identical", () => {
    const blocks = [
      { id: "first", start: "00:30" },
      { id: "second", start: "00:30:00" },
    ];

    expect(
      blocks
        .sort((left, right) =>
          compareMatrixTimeBlockStarts(left.start, right.start)
        )
        .map((block) => block.id)
    ).toEqual(["first", "second"]);
  });

  it("reads clock values from dates, timestamps, and ISO strings", () => {
    const date = new Date(2026, 6, 17, 3, 0);

    expect(matrixTimeBlockSortValue(date)).toBe(27 * 60);
    expect(matrixTimeBlockSortValue(date.getTime())).toBe(27 * 60);
    expect(matrixTimeBlockSortValue("2026-07-17T03:00:00-05:00")).toBe(27 * 60);
  });
});
