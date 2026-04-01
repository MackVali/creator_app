import { getSupabaseBrowser } from "../supabase";
import { LinkedAccount } from "../types";
import { buildSocialUrl, normalizeUsername } from "@/lib/profile/socialLinks";

export type SupportedPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "spotify"
  | "snapchat"
  | "facebook"
  | "twitter";

export const PLATFORM_CONFIG: Record<
  SupportedPlatform,
  { label: string; domain: string; color: string }
> = {
  instagram: {
    label: "Instagram",
    domain: "instagram.com",
    color: "#E1306C",
  },
  tiktok: { label: "TikTok", domain: "tiktok.com", color: "#010101" },
  youtube: { label: "YouTube", domain: "youtube.com", color: "#FF0000" },
  spotify: { label: "Spotify", domain: "spotify.com", color: "#1DB954" },
  snapchat: { label: "Snapchat", domain: "snapchat.com", color: "#FFFC00" },
  facebook: { label: "Facebook", domain: "facebook.com", color: "#1877F2" },
  twitter: { label: "X/Twitter", domain: "twitter.com", color: "#000000" },
};

export type LinkedAccountInput =
  | string
  | {
      username?: string | null;
      url?: string | null;
    };

export function resolveLinkedAccountInput(
  platform: SupportedPlatform,
  input: LinkedAccountInput
): { url: string; username: string | null } | null {
  const rawInput =
    typeof input === "string"
      ? { username: input, url: undefined }
      : { username: input.username, url: input.url };

  const trimmedUsername = rawInput.username?.trim();
  const trimmedUrl = rawInput.url?.trim() ?? "";

  const normalizedFromUsername = trimmedUsername
    ? normalizeUsername(platform, trimmedUsername)
    : "";
  const normalizedFromUrl =
    !normalizedFromUsername && trimmedUrl
      ? normalizeUsername(platform, trimmedUrl)
      : "";
  const normalizedUsername = normalizedFromUsername || normalizedFromUrl;
  const usernameMaybe = normalizedUsername || null;

  const canonicalUrl = normalizedUsername
    ? buildSocialUrl(platform, normalizedUsername)
    : trimmedUrl;

  if (!canonicalUrl) {
    return null;
  }

  return {
    url: canonicalUrl,
    username: usernameMaybe,
  };
}

export async function getLinkedAccounts(
  userId: string
): Promise<LinkedAccount[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("linked_accounts")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching linked accounts:", error);
    return [];
  }

  return data as LinkedAccount[];
}

export async function upsertLinkedAccount(
  userId: string,
  platform: SupportedPlatform,
  input: LinkedAccountInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  const resolved = resolveLinkedAccountInput(platform, input);
  if (!resolved) {
    return {
      success: false,
      error: "Please provide a username or link for this platform",
    };
  }

  const { error } = await supabase
    .from("linked_accounts")
    .upsert(
      {
        user_id: userId,
        platform,
        url: resolved.url,
        username: resolved.username,
      },
      { onConflict: "user_id,platform" }
    );

  if (error) {
    console.error("Error upserting linked account:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteLinkedAccount(
  userId: string,
  platform: SupportedPlatform
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  const { error } = await supabase
    .from("linked_accounts")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) {
    console.error("Error deleting linked account:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
