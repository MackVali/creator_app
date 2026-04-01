import { SocialLink } from "@/lib/types";

const PLATFORM_URL_BUILDERS: Record<string, (username: string) => string> = {
  instagram: (handle) => `https://instagram.com/${handle}`,
  tiktok: (handle) => `https://www.tiktok.com/@${handle}`,
  x: (handle) => `https://x.com/${handle}`,
  twitter: (handle) => `https://twitter.com/${handle}`,
  youtube: (handle) => `https://www.youtube.com/@${handle}`,
  facebook: (handle) => `https://www.facebook.com/${handle}`,
  spotify: (handle) => `https://open.spotify.com/${handle}`,
  snapchat: (handle) => `https://www.snapchat.com/add/${handle}`,
  linkedin: (handle) => `https://www.linkedin.com/in/${handle}`,
  pinterest: (handle) => `https://www.pinterest.com/${handle}`,
};

function extractHandleFromUrl(url?: string | null): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return parsed.hostname.replace(/^www\./, "");
    }
    return segments[segments.length - 1];
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

export function normalizeUsername(platform: string, input?: string | null): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  const looksLikeUrl = /https?:\/\//i.test(trimmed) || trimmed.includes("/");
  const candidate = looksLikeUrl ? extractHandleFromUrl(trimmed) : trimmed;
  return candidate.replace(/^@+/, "").trim();
}

export function buildSocialUrl(platform: string, username: string): string {
  const key = platform?.toLowerCase() ?? "";
  const builder = PLATFORM_URL_BUILDERS[key];
  return builder ? builder(username) : username;
}

export function getDisplayHandle(platform: string, username?: string | null, url?: string | null): string {
  const normalizedUsername = username ? username.trim() : "";
  if (normalizedUsername) {
    return normalizedUsername;
  }
  const fallbackHandle = extractHandleFromUrl(url);
  return fallbackHandle || platform;
}

export function resolveSocialLink(link: SocialLink) {
  const platformKey = link.platform ?? "";
  const normalizedUsername = normalizeUsername(platformKey, link.username);
  const usernameUrl = normalizedUsername ? buildSocialUrl(platformKey, normalizedUsername) : "";
  const finalUrl = usernameUrl || link.url || "";
  const display = getDisplayHandle(platformKey, normalizedUsername || undefined, finalUrl);

  return {
    platform: link.platform,
    url: finalUrl,
    display,
  };
}
