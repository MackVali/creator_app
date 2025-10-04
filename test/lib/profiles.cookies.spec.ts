import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn((url: string, key: string, options?: any) => {
    options?.cookies?.set?.("sb", "token", {});
    return {
      auth: { getUser },
    };
  }),
}));

const cookiesMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

describe("profiles Supabase server client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      originalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("does not throw when provided a read-only cookie store", async () => {
    const { getCurrentUser } = await import("../../lib/db/profiles");
    await expect(getCurrentUser()).resolves.toBeNull();
    const { createServerClient } = await import("@supabase/ssr");
    expect(createServerClient).toHaveBeenCalled();
  });

  it("still delegates to the cookie setter when available", async () => {
    const { getCurrentUser } = await import("../../lib/db/profiles");
    const { createServerClient } = await import("@supabase/ssr");

    const set = vi.fn();
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
      set,
    });

    await getCurrentUser();

    const options = (createServerClient as any).mock.calls.at(-1)?.[2];
    options.cookies.set("sb", "token", {});
    expect(set).toHaveBeenCalledWith("sb", "token", {});
  });
});
