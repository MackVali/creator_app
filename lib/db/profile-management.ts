import { getSupabaseBrowser } from "../supabase";
import { 
  SocialLink, 
  ContentCard, 
  ProfileTheme, 
  SocialLinkFormData, 
  ContentCardFormData,
  SocialLinkUpdateResult,
  ContentCardUpdateResult
} from "../types";

// ============================================================================
// SOCIAL LINKS MANAGEMENT
// ============================================================================

export async function getSocialLinks(userId: string): Promise<SocialLink[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("social_links")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching social links:", error);
    return [];
  }

  return data || [];
}

export async function createSocialLink(
  userId: string, 
  linkData: SocialLinkFormData
): Promise<SocialLinkUpdateResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    // Get the next position
    const { data: existingLinks } = await supabase
      .from("social_links")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1);

    const nextPosition = existingLinks && existingLinks.length > 0 
      ? existingLinks[0].position + 1 
      : 0;

    const { data, error } = await supabase
      .from("social_links")
      .insert({
        user_id: userId,
        platform: linkData.platform,
        url: linkData.url,
        icon: linkData.icon,
        color: linkData.color,
        position: nextPosition,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating social link:", error);
      return { success: false, error: error.message };
    }

    return { success: true, socialLink: data };
  } catch (error) {
    console.error("Error in createSocialLink:", error);
    return { success: false, error: "Failed to create social link" };
  }
}

export async function updateSocialLink(
  linkId: string,
  userId: string,
  linkData: Partial<SocialLinkFormData>
): Promise<SocialLinkUpdateResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    const { data, error } = await supabase
      .from("social_links")
      .update(linkData)
      .eq("id", linkId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating social link:", error);
      return { success: false, error: error.message };
    }

    return { success: true, socialLink: data };
  } catch (error) {
    console.error("Error in updateSocialLink:", error);
    return { success: false, error: "Failed to update social link" };
  }
}

export async function deleteSocialLink(
  linkId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    const { error } = await supabase
      .from("social_links")
      .delete()
      .eq("id", linkId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting social link:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in deleteSocialLink:", error);
    return { success: false, error: "Failed to delete social link" };
  }
}

export async function reorderSocialLinks(
  userId: string,
  linkIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    // Update positions for all links
    const updates = linkIds.map((id, index) => ({
      id,
      position: index,
    }));

    const { error } = await supabase
      .from("social_links")
      .upsert(updates, { onConflict: "id" });

    if (error) {
      console.error("Error reordering social links:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in reorderSocialLinks:", error);
    return { success: false, error: "Failed to reorder social links" };
  }
}

// ============================================================================
// CONTENT CARDS MANAGEMENT
// ============================================================================

export async function getContentCards(userId: string): Promise<ContentCard[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("content_cards")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching content cards:", error);
    return [];
  }

  return data || [];
}

export async function createContentCard(
  userId: string,
  cardData: ContentCardFormData
): Promise<ContentCardUpdateResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    // Get the next position
    const { data: existingCards } = await supabase
      .from("content_cards")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1);

    const nextPosition = existingCards && existingCards.length > 0 
      ? existingCards[0].position + 1 
      : 0;

    const { data, error } = await supabase
      .from("content_cards")
      .insert({
        user_id: userId,
        title: cardData.title,
        description: cardData.description,
        url: cardData.url,
        thumbnail_url: cardData.thumbnail ? null : null, // Will be set after upload
        category: cardData.category,
        position: nextPosition,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating content card:", error);
      return { success: false, error: error.message };
    }

    return { success: true, contentCard: data };
  } catch (error) {
    console.error("Error in createContentCard:", error);
    return { success: false, error: "Failed to create content card" };
  }
}

export async function updateContentCard(
  cardId: string,
  userId: string,
  cardData: Partial<ContentCardFormData>
): Promise<ContentCardUpdateResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    const { data, error } = await supabase
      .from("content_cards")
      .update(cardData)
      .eq("id", cardId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating content card:", error);
      return { success: false, error: error.message };
    }

    return { success: true, contentCard: data };
  } catch (error) {
    console.error("Error in updateContentCard:", error);
    return { success: false, error: "Failed to update content card" };
  }
}

export async function deleteContentCard(
  cardId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    const { error } = await supabase
      .from("content_cards")
      .delete()
      .eq("id", cardId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting content card:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in deleteContentCard:", error);
    return { success: false, error: "Failed to delete content card" };
  }
}

export async function reorderContentCards(
  userId: string,
  cardIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    // Update positions for all cards
    const updates = cardIds.map((id, index) => ({
      id,
      position: index,
    }));

    const { error } = await supabase
      .from("content_cards")
      .upsert(updates, { onConflict: "id" });

    if (error) {
      console.error("Error reordering content cards:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in reorderContentCards:", error);
    return { success: false, error: "Failed to reorder content cards" };
  }
}

// ============================================================================
// PROFILE THEMES
// ============================================================================

export async function getProfileThemes(): Promise<ProfileTheme[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("profile_themes")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching profile themes:", error);
    return [];
  }

  return data || [];
}

export async function getProfileTheme(themeId: string): Promise<ProfileTheme | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profile_themes")
    .select("*")
    .eq("id", themeId)
    .single();

  if (error) {
    console.error("Error fetching profile theme:", error);
    return null;
  }

  return data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getPlatformIcon(platform: string): string {
  const platformIcons: Record<string, string> = {
    instagram: "📷",
    facebook: "📘",
    twitter: "🐦",
    x: "𝕏",
    linkedin: "💼",
    youtube: "📺",
    tiktok: "🎵",
    email: "✉️",
    website: "🌐",
    github: "🐙",
    discord: "🎮",
    snapchat: "👻",
    pinterest: "📌",
    reddit: "🤖",
    twitch: "🎮",
    spotify: "🎵",
    apple: "🍎",
    google: "🔍",
  };

  return platformIcons[platform.toLowerCase()] || "🔗";
}

export function getPlatformColor(platform: string): string {
  const platformColors: Record<string, string> = {
    instagram: "bg-gradient-to-r from-purple-500 to-pink-500",
    facebook: "bg-blue-600",
    twitter: "bg-blue-400",
    x: "bg-black",
    linkedin: "bg-blue-700",
    youtube: "bg-red-600",
    tiktok: "bg-black",
    email: "bg-gray-600",
    website: "bg-blue-500",
    github: "bg-gray-800",
    discord: "bg-indigo-600",
    snapchat: "bg-yellow-400",
    pinterest: "bg-red-500",
    reddit: "bg-orange-500",
    twitch: "bg-purple-600",
    spotify: "bg-green-500",
    apple: "bg-gray-900",
    google: "bg-blue-500",
  };

  return platformColors[platform.toLowerCase()] || "bg-gray-600";
}
