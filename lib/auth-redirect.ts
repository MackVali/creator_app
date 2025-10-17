const AUTH_CALLBACK_PATH = "/auth/callback";

export type AuthRedirectSource =
  | "supabaseRedirectEnv"
  | "siteUrlEnv"
  | "vercelProduction"
  | "browserPreview"
  | "browserDevelopment"
  | "none";

export type AuthRedirectResolution = {
  url: string | null;
  source: AuthRedirectSource;
  details?: {
    domain?: string;
    envVar?: string;
    note?: string;
  };
};

const EMPTY_RESOLUTION: AuthRedirectResolution = { url: null, source: "none" };

function normalizeBaseUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  return `https://${trimmed.replace(/\/$/, "")}`;
}

function buildRedirect(url: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${url}${normalizedPath}`;
}

function resolveConfiguredRedirect(
  path: string,
): AuthRedirectResolution | null {
  const explicitRedirect = process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL;
  if (explicitRedirect && explicitRedirect.trim()) {
    const normalized = normalizeBaseUrl(explicitRedirect);
    return {
      url: normalized ? buildRedirect(normalized, path) : null,
      source: "supabaseRedirectEnv",
      details: {
        domain: normalized ?? undefined,
        envVar: "NEXT_PUBLIC_SUPABASE_REDIRECT_URL",
      },
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && siteUrl.trim()) {
    const normalized = normalizeBaseUrl(siteUrl);
    return {
      url: normalized ? buildRedirect(normalized, path) : null,
      source: "siteUrlEnv",
      details: {
        domain: normalized ?? undefined,
        envVar: "NEXT_PUBLIC_SITE_URL",
      },
    };
  }

  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;

  if (
    vercelEnv &&
    vercelEnv.toLowerCase() === "production" &&
    vercelUrl &&
    vercelUrl.trim()
  ) {
    const normalized = normalizeBaseUrl(vercelUrl);
    return {
      url: normalized ? buildRedirect(normalized, path) : null,
      source: "vercelProduction",
      details: {
        domain: normalized ?? undefined,
        envVar: "NEXT_PUBLIC_VERCEL_URL",
      },
    };
  }

  return null;
}

export function getAuthRedirectResolution(
  path: string = AUTH_CALLBACK_PATH,
): AuthRedirectResolution {
  const configuredRedirect = resolveConfiguredRedirect(path);
  if (configuredRedirect) {
    return configuredRedirect;
  }

  if (typeof window === "undefined" || !window.location?.origin) {
    return EMPTY_RESOLUTION;
  }

  const shouldUseBrowserOrigin =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

  if (!shouldUseBrowserOrigin) {
    return EMPTY_RESOLUTION;
  }

  const source =
    process.env.NODE_ENV === "development"
      ? "browserDevelopment"
      : "browserPreview";

  return {
    url: buildRedirect(window.location.origin, path),
    source,
    details: {
      domain: window.location.origin,
      note:
        source === "browserPreview"
          ? "Using the browser origin because this is a Vercel preview."
          : "Using the browser origin in development mode.",
    },
  };
}

export function getAuthRedirectUrl(
  path: string = AUTH_CALLBACK_PATH,
): string | null {
  return getAuthRedirectResolution(path).url;
}

export function getAuthCallbackPath() {
  return AUTH_CALLBACK_PATH;
}
