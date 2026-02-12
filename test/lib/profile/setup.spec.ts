import { describe, expect, it } from "vitest";
import type { Profile } from "@/lib/types";
import { isProfileSetupIncomplete } from "@/lib/profile/setup";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    user_id: "user-1",
    username: "creator",
    name: "Creator Name",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("isProfileSetupIncomplete", () => {
  it("returns true when profile is missing", () => {
    expect(isProfileSetupIncomplete(null)).toBe(true);
  });

  it("returns true when username is empty", () => {
    expect(
      isProfileSetupIncomplete(makeProfile({ username: "   " }))
    ).toBe(true);
  });

  it("returns true when display name is missing", () => {
    expect(isProfileSetupIncomplete(makeProfile({ name: null }))).toBe(true);
  });

  it("returns false when both username and name are set", () => {
    expect(isProfileSetupIncomplete(makeProfile())).toBe(false);
  });
});

