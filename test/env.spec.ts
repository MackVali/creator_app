import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key";
});

describe("Supabase env", () => {
  it("loads test vars", () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
  });

  it("validates Supabase URL format", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(url).toBeDefined();
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain(".supabase.co");
  });
});
