import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };

vi.mock("@supabase/ssr", () => {
  return {
    createBrowserClient: vi.fn(),
    createServerClient: vi.fn((url: string, key: string, options?: any) => {
      options?.cookies?.set?.("sb", "token", {});
      return {};
    }),
  };
});

describe("getSupabaseServer", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      originalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("no-ops cookie set when store is read-only", async () => {
    const { getSupabaseServer } = await import("../../lib/supabase");
    const store = {
      get: vi.fn(() => ({ name: "sb", value: "token" })),
    };

    expect(() => getSupabaseServer(store as any)).not.toThrow();
    const { createServerClient } = await import("@supabase/ssr");
    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        cookies: expect.objectContaining({
          get: expect.any(Function),
          set: expect.any(Function),
        }),
      }),
    );
  });

  it("forwards to the underlying cookie store when set exists", async () => {
    const { getSupabaseServer } = await import("../../lib/supabase");
    const set = vi.fn();
    const store = {
      get: vi.fn(() => ({ name: "sb", value: "token" })),
      set,
    };

    getSupabaseServer(store as any);
    const { createServerClient } = await import("@supabase/ssr");
    const options = (createServerClient as any).mock.calls.at(-1)?.[2];
    options.cookies.set("sb", "new-token", {});
    expect(set).toHaveBeenCalledWith("sb", "new-token", {});
  });
});
