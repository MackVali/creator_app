import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAuthRedirectResolution,
  getAuthRedirectUrl,
} from "../../lib/auth-redirect";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function clearManagedEnvVars() {
  delete process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_VERCEL_URL;
  delete process.env.NEXT_PUBLIC_VERCEL_ENV;
}

beforeEach(() => {
  restoreEnv();
  clearManagedEnvVars();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).window;
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).window;
});

describe("getAuthRedirectUrl", () => {
  it("prefers an explicit Supabase redirect URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL = "https://app.example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example.com";

    expect(getAuthRedirectUrl()).toBe("https://app.example.com/auth/callback");
  });

  it("falls back to the configured site url", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example.com";

    expect(getAuthRedirectUrl()).toBe("https://site.example.com/auth/callback");
  });

  it("uses the browser origin for Vercel previews", () => {
    const origin = "https://preview.vercel.app";
    process.env.NEXT_PUBLIC_VERCEL_URL = "preview.vercel.app";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    vi.stubGlobal("window", { location: { origin } });

    expect(getAuthRedirectUrl()).toBe(`${origin}/auth/callback`);
  });

  it("uses the Vercel production host when available", () => {
    process.env.NEXT_PUBLIC_VERCEL_URL = "prod.vercel.app";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";

    expect(getAuthRedirectUrl()).toBe("https://prod.vercel.app/auth/callback");
  });

  it("uses the browser origin as a development fallback", () => {
    const origin = "https://preview.example.com";
    process.env.NODE_ENV = "development";
    vi.stubGlobal("window", { location: { origin } });

    expect(getAuthRedirectUrl()).toBe(`${origin}/auth/callback`);
  });

  it("returns null when no context is available", () => {
    expect(getAuthRedirectUrl("custom")).toBeNull();
  });
});

describe("getAuthRedirectResolution", () => {
  it("returns metadata for explicit redirect envs", () => {
    process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL = "https://app.example.com";

    const resolution = getAuthRedirectResolution();
    expect(resolution).toEqual({
      url: "https://app.example.com/auth/callback",
      source: "supabaseRedirectEnv",
      details: {
        domain: "https://app.example.com",
        envVar: "NEXT_PUBLIC_SUPABASE_REDIRECT_URL",
      },
    });
  });

  it("captures the browser fallback metadata", () => {
    const origin = "https://preview.vercel.app";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    vi.stubGlobal("window", { location: { origin } });

    const resolution = getAuthRedirectResolution();
    expect(resolution.url).toBe(`${origin}/auth/callback`);
    expect(resolution.source).toBe("browserPreview");
    expect(resolution.details).toEqual({
      domain: origin,
      note: "Using the browser origin because this is a Vercel preview.",
    });
  });
});
