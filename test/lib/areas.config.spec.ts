import { describe, expect, it } from "vitest";

import { AREA_IDS, AREAS, getAreaById, isAreaId } from "../../src/config/areas";

describe("Areas config", () => {
  it("keeps the temporary dashboard Areas in the requested order", () => {
    expect(AREAS.map((area) => area.id)).toEqual([
      "body",
      "mind",
      "work",
      "money",
      "people",
      "life",
      "creation",
      "experience",
    ]);

    expect(AREAS.map((area) => area.label)).toEqual([
      "Body",
      "Mind",
      "Work",
      "Money",
      "People",
      "Life",
      "Creation",
      "Experience",
    ]);
  });

  it("uses stable sort orders and replaceable emoji defaults", () => {
    expect(AREAS.map((area) => area.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(AREAS.map((area) => area.emoji)).toEqual([
      "❤️",
      "🧠",
      "💼",
      "💰",
      "👥",
      "🏠",
      "🎨",
      "🌎",
    ]);
  });

  it("exposes stable Area ids and validates unknown ids", () => {
    expect(AREA_IDS).toEqual(AREAS.map((area) => area.id));
    expect(isAreaId("body")).toBe(true);
    expect(isAreaId("monument")).toBe(false);
    expect(isAreaId(null)).toBe(false);
    expect(getAreaById("creation")?.label).toBe("Creation");
    expect(getAreaById("unknown")).toBeNull();
  });
});
