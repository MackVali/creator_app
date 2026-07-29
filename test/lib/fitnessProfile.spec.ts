import { describe, expect, it } from "vitest";

import {
  FITNESS_PROFILE_METADATA_KEY,
  buildFitnessProfileEntry,
  buildFitnessProfileFromDraft,
  getFitnessProfileFromEntries,
  mergeFitnessProfileMetadata,
  readFitnessProfileFromMetadata,
  type FitnessProfile,
} from "../../src/lib/fitness/profile";

const now = "2026-07-28T12:00:00.000Z";

function profile(overrides: Partial<FitnessProfile> = {}): FitnessProfile {
  return {
    version: 1,
    primaryGoal: "Build muscle",
    experienceLevel: "Intermediate",
    equipment: "Full gym",
    trainingDaysPerWeek: 4,
    sessionDurationMinutes: 60,
    preferredWeightUnit: "lb",
    anatomyDisplay: "neutral",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Fitness profile metadata", () => {
  it("builds a versioned profile from a complete draft", () => {
    expect(
      buildFitnessProfileFromDraft(
        {
          primaryGoal: "Build muscle",
          experienceLevel: "Intermediate",
          equipment: "Full gym",
          trainingDaysPerWeek: 4,
          sessionDurationMinutes: 60,
          preferredWeightUnit: "lb",
          anatomyDisplay: "neutral",
        },
        { now },
      ),
    ).toEqual(profile());
  });

  it("does not overwrite unrelated metadata", () => {
    const merged = mergeFitnessProfileMetadata(
      { unrelated: "keep-me", nested: { ok: true } },
      profile(),
    );

    expect(merged.unrelated).toBe("keep-me");
    expect(merged.nested).toEqual({ ok: true });
    expect(merged[FITNESS_PROFILE_METADATA_KEY]).toEqual(profile());
  });

  it("reads a saved profile from a metadata-only Fitness entry", () => {
    const entry = buildFitnessProfileEntry({
      databaseId: "fitness",
      profile: profile(),
      now,
    });

    expect(readFitnessProfileFromMetadata(entry.values.metadata)).toEqual(profile());
    expect(getFitnessProfileFromEntries([entry])).toEqual(profile());
  });

  it("preserves createdAt when editing", () => {
    const existingProfile = profile({ createdAt: "2026-07-20T10:00:00.000Z" });
    const edited = buildFitnessProfileFromDraft(
      {
        primaryGoal: "Get stronger",
        experienceLevel: "Advanced",
        equipment: "Home gym",
        trainingDaysPerWeek: 5,
        sessionDurationMinutes: 45,
        preferredWeightUnit: "kg",
        anatomyDisplay: "female",
      },
      {
        existingProfile,
        now: "2026-07-28T13:00:00.000Z",
      },
    );

    expect(edited).toMatchObject({
      primaryGoal: "Get stronger",
      experienceLevel: "Advanced",
      equipment: "Home gym",
      trainingDaysPerWeek: 5,
      sessionDurationMinutes: 45,
      preferredWeightUnit: "kg",
      anatomyDisplay: "female",
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-28T13:00:00.000Z",
    });
  });
});
