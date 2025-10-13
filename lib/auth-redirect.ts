const AUTH_CALLBACK_PATH = "/auth/callback";

function normalizeBaseUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  return `https://${trimmed.replace(/\/$/, "")}`;
}

export function getAuthRedirectUrl(path: string = AUTH_CALLBACK_PATH): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      const normalized = normalizeBaseUrl(candidate);
      if (normalized) {
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return `${normalized}${normalizedPath}`;
      }
    }
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${window.location.origin}${normalizedPath}`;
  }

  return path.startsWith("/") ? path : `/${path}`;
}

export function getAuthCallbackPath() {
  return AUTH_CALLBACK_PATH;
}
