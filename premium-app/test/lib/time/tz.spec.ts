import { describe, expect, it } from "vitest";
import { toLocal } from "../../../src/lib/time/tz";

describe("toLocal", () => {
  it("returns a Date representing the same instant as the input ISO string", () => {
    const iso = "2024-04-07T13:00:00.000Z";
    const result = toLocal(iso);
    expect(result.getTime()).toBe(new Date(iso).getTime());
  });

  it("falls back to the Date constructor for non-string inputs", () => {
    const date = new Date(1712491200000);
    // @ts-expect-error intentional incorrect type for runtime resilience check
    const result = toLocal(date as unknown as string);
    expect(result.getTime()).toBe(date.getTime());
  });
});
