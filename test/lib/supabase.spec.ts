import type { CookieOptions } from "@supabase/ssr";
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import type { Mock } from "vitest";

const originalEnv = { ...process.env };

type CookieSetter = (
  name: string,
  value: string,
  options: CookieOptions,
) => void;

type SupabaseServerClientOptions = {
  cookies?: {
    set?: CookieSetter;
  };
};

type CookieStore = {
  get(name: string): { name: string; value: string } | undefined;
  set?: (name: string, value: string, options: CookieOptions) => void;
};

type CreateServerClientMock = Mock<
  [string, string, SupabaseServerClientOptions?],
  Record<string, never>
>;

vi.mock("@supabase/ssr", () => {
  return {
    createBrowserClient: vi.fn(),
    createServerClient: vi.fn(
      (url: string, key: string, options?: SupabaseServerClientOptions) => {
        options?.cookies?.set?.("sb", "token", {});
        return {};
      },
    ),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({})),
}));

describe("getSupabaseServer", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      originalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_URL = originalEnv.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_ANON_KEY = originalEnv.VITE_SUPABASE_ANON_KEY;
  });

  it("no-ops cookie set when store is read-only", async () => {
    const { getSupabaseServer } = await import("../../lib/supabase");
    const store: CookieStore = {
      get: vi.fn(() => ({ name: "sb", value: "token" })),
    };

    expect(() => getSupabaseServer(store)).not.toThrow();
    const { createServerClient } = await import("@supabase/ssr");
    const { createClient } = await import("@supabase/supabase-js");
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        }),
      }),
    );
    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        }),
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
    const store: CookieStore = {
      get: vi.fn(() => ({ name: "sb", value: "token" })),
      set,
    };

    getSupabaseServer(store);
    const { createServerClient } = await import("@supabase/ssr");
    const serverClientMock = createServerClient as CreateServerClientMock;
    const options = serverClientMock.mock.calls.at(-1)?.[2];
    if (!options?.cookies?.set) {
      throw new Error("Expected cookies.set to be defined");
    }
    options.cookies.set("sb", "new-token", {});
    expect(set).toHaveBeenCalledWith("sb", "new-token", {});
  });

  it("falls back to legacy VITE env vars when NEXT_PUBLIC vars are absent", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_URL = "https://legacy.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "legacy-key";
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const { getSupabaseBrowser } = await import("../../lib/supabase");
    expect(getSupabaseBrowser()).toEqual({});
    const { createClient } = await import("@supabase/supabase-js");
    expect(createClient).toHaveBeenCalledWith(
      "https://legacy.supabase.co",
      "legacy-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        }),
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      "Falling back to legacy VITE_SUPABASE_* environment variables. Update your configuration to NEXT_PUBLIC_SUPABASE_*.",
    );
    warn.mockRestore();
  });
});
