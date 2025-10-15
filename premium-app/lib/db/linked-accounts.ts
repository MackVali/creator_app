import { getSupabaseBrowser } from "../supabase";
import { LinkedAccount } from "../types";

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
  url: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  const { error } = await supabase
    .from("linked_accounts")
    .upsert(
      { user_id: userId, platform, url },
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

export function validateLinkedAccountUrl(
  platform: SupportedPlatform,
  url: string
): { valid: boolean; cleaned?: string; error?: string } {
  try {
    const config = PLATFORM_CONFIG[platform];
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const domain = config.domain.toLowerCase();
    const isExactMatch = hostname === domain;
    const isSubdomainMatch = hostname.endsWith(`.${domain}`);

    if (!isExactMatch && !isSubdomainMatch) {
      return { valid: false, error: `URL must be on ${config.domain}` };
    }
    parsed.search = ""; // remove query params
    const cleaned = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    return { valid: true, cleaned };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}
