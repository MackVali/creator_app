import { describe, expect, it } from "vitest";

import { validateLinkedAccountUrl } from "../../lib/db/linked-accounts";

describe("validateLinkedAccountUrl", () => {
  it("accepts URLs on the exact domain", () => {
    const result = validateLinkedAccountUrl(
      "instagram",
      "https://instagram.com/example"
    );

    expect(result.valid).toBe(true);
    expect(result.cleaned).toBe("https://instagram.com/example");
  });

  it("accepts URLs on a subdomain of the platform", () => {
    const result = validateLinkedAccountUrl(
      "instagram",
      "https://www.instagram.com/example"
    );

    expect(result.valid).toBe(true);
    expect(result.cleaned).toBe("https://www.instagram.com/example");
  });

  it("rejects URLs on deceptive look-alike domains", () => {
    const result = validateLinkedAccountUrl(
      "instagram",
      "https://instagram.com.evil.example/profile"
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("URL must be on instagram.com");
  });
});
