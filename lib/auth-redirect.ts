const AUTH_CALLBACK_PATH = "/auth/callback";

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

function resolveConfiguredRedirect(path: string): string | null {
  const explicitDomain =
    process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (explicitDomain && explicitDomain.trim()) {
    const normalized = normalizeBaseUrl(explicitDomain);
    return normalized ? buildRedirect(normalized, path) : null;
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
    return normalized ? buildRedirect(normalized, path) : null;
  }

  return null;
}

export function getAuthRedirectUrl(
  path: string = AUTH_CALLBACK_PATH,
): string | null {
  const configuredRedirect = resolveConfiguredRedirect(path);
  if (configuredRedirect) {
    return configuredRedirect;
  }

  if (typeof window === "undefined" || !window.location?.origin) {
    return null;
  }

  const shouldUseBrowserOrigin =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

  if (!shouldUseBrowserOrigin) {
    return null;
  }

  return buildRedirect(window.location.origin, path);
}

export function getAuthCallbackPath() {
  return AUTH_CALLBACK_PATH;
}
