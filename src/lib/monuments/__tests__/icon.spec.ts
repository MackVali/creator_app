import { describe, expect, it } from "vitest";

import {
  getMonumentIconOrDefault,
  normalizeMonumentIconInput,
} from "@/lib/monuments/icon";

describe("normalizeMonumentIconInput", () => {
  it.each(["🙂", "❤️", "✍️", "👍🏽", "👨‍💻", "🏳️‍🌈", "🇺🇸"])(
    "preserves the selected emoji grapheme %s",
    (emoji) => {
      expect(normalizeMonumentIconInput(emoji)).toBe(emoji);
    },
  );

  it("limits pasted emoji input to the first grapheme cluster", () => {
    expect(normalizeMonumentIconInput("👨‍💻🙂")).toBe("👨‍💻");
  });

  it("preserves non-emoji icon names", () => {
    expect(normalizeMonumentIconInput("landmark")).toBe("landmark");
  });
});

describe("getMonumentIconOrDefault", () => {
  it("falls back to the default monument icon for empty input", () => {
    expect(getMonumentIconOrDefault("")).toBe("🏛️");
  });
});
