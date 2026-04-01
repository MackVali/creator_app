import { describe, expect, it } from "vitest";

import {
  resolveLinkedAccountInput,
  SupportedPlatform,
} from "../../lib/db/linked-accounts";

const platform: SupportedPlatform = "instagram";

describe("resolveLinkedAccountInput", () => {
  it("builds a canonical URL when given a username string", () => {
    const result = resolveLinkedAccountInput(platform, "  @Example  ");

    expect(result).toEqual({
      url: "https://instagram.com/Example",
      username: "Example",
    });
  });

  it("derives the username from an existing URL and still returns the canonical link", () => {
    const result = resolveLinkedAccountInput(platform, {
      url: "https://www.instagram.com/Existing/?utm=1",
    });

    expect(result).toEqual({
      url: "https://instagram.com/Existing",
      username: "Existing",
    });
  });

  it("returns null when neither username nor URL are provided", () => {
    expect(resolveLinkedAccountInput(platform, "")).toBeNull();
    expect(resolveLinkedAccountInput(platform, { url: "   " })).toBeNull();
  });
});
