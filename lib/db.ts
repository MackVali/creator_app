import { getSupabaseBrowser } from "./supabase";
import { getCurrentUserId } from "./auth";
import { PostgrestError } from "@supabase/supabase-js";
import {
  Profile,
  ProfileFormData,
  ProfileUpdateResult,
  ContentCard,
} from "./types";

// Helper function to get the current user's ID
export async function getUserId() {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("User not authenticated");
  }
  return userId;
}

// Generic create function that automatically adds user_id
export async function createRecord<T>(
  table: string,
  data: Omit<T, "id" | "user_id" | "created_at" | "updated_at">,
  options: { includeUpdatedAt?: boolean } = {}
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return {
      data: null,
      error: { message: "Supabase client not initialized" } as PostgrestError,
    };
  }
  const userId = await getUserId();

  const recordData = {
    ...data,
    user_id: userId,
    created_at: new Date().toISOString(),
    ...(options.includeUpdatedAt && { updated_at: new Date().toISOString() }),
  };

  const { data: result, error } = await supabase
    .from(table)
    .insert(recordData)
    .select()
    .single();

  return { data: result as T | null, error };
}

// Generic update function that ensures user_id matches
export async function updateRecord<T>(
  table: string,
  id: string,
  data: Partial<Omit<T, "id" | "user_id" | "created_at">>
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return {
      data: null,
      error: { message: "Supabase client not initialized" } as PostgrestError,
    };
  }
  const userId = await getUserId();

  const updateData = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  const { data: result, error } = await supabase
    .from(table)
    .update(updateData)
    .eq("id", id)
    .eq("user_id", userId) // Ensure user can only update their own records
    .select()
    .single();

  return { data: result as T | null, error };
}

// Generic delete function that ensures user_id matches
export async function deleteRecord(
  table: string,
  id: string,
  options?: { allowLocked?: boolean }
): Promise<{ error: PostgrestError | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return {
      error: { message: "Supabase client not initialized" } as PostgrestError,
    };
  }
  const userId = await getUserId();

  const tablesWithLock = ["skills", "cats"];
  const allowLocked = options?.allowLocked ?? false;
  if (!allowLocked && tablesWithLock.includes(table)) {
    const {
      data: lockedRow,
      error: selectError,
    } = await supabase
      .from(table)
      .select("id,is_locked")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (selectError) {
      return { error: selectError };
    }

    if (lockedRow?.is_locked) {
      return {
        error: { message: "Locked record" } as PostgrestError,
      };
    }
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("user_id", userId); // Ensure user can only delete their own records

  return { error };
}

// Generic query function that automatically filters by user_id
export async function queryRecords<T>(
  table: string,
  options: {
    select?: string;
    filters?: Record<string, string | number | boolean | null>;
    orderBy?: { column: string; ascending?: boolean };
    limit?: number;
  } = {}
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return {
      data: null,
      error: { message: "Supabase client not initialized" } as PostgrestError,
    };
  }
  const userId = await getUserId();

  let query = supabase
    .from(table)
    .select(options.select || "*")
    .eq("user_id", userId);

  // Apply additional filters
  if (options.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        query = query.eq(key, value);
      }
    });
  }

  // Apply ordering
  if (options.orderBy) {
    query = query.order(options.orderBy.column, {
      ascending: options.orderBy.ascending ?? true,
    });
  }

  // Apply limit
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  return { data: data as T[] | null, error };
}

// Get a single record by ID, ensuring user_id matches
export async function getRecord<T>(
  table: string,
  id: string
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return {
      data: null,
      error: { message: "Supabase client not initialized" } as PostgrestError,
    };
  }
  const userId = await getUserId();

  const { data: result, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  return { data: result as T | null, error };
}

export async function getProfileByUserId(
  userId: string
): Promise<Profile | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  console.log("🔍 getProfileByUserId called with userId:", userId);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle(); // Use maybeSingle to handle case where profile doesn't exist

  if (error) {
    console.error("❌ Error fetching profile for user", userId, ":", error);
    return null;
  }

  console.log("✅ Profile found for user", userId, ":", data);
  return data;
}

export async function updateProfilePreferences(
  userId: string,
  preferences: Partial<
    Pick<Profile, "prefers_dark_mode" | "notifications_enabled" | "timezone">
  >,
): Promise<{ data: Profile | null; error: PostgrestError | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return {
      data: null,
      error: {
        message: "Supabase client not initialized",
      } as PostgrestError,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...preferences,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to update profile preferences:", error);
  }

  return { data: data as Profile | null, error };
}

export async function getProfileByUsername(
  username: string
): Promise<Profile | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("username", username) // Use ilike for case-insensitive comparison
    .maybeSingle(); // Use maybeSingle to handle case where profile doesn't exist

  if (error) {
    console.error("Error fetching profile by username:", error);
    return null;
  }

  return data;
}

export async function updateProfile(
  userId: string,
  profileData: ProfileFormData,
  avatarUrl?: string,
  bannerUrl?: string
): Promise<ProfileUpdateResult> {
  try {
    console.log("🔍 updateProfile called with userId:", userId);
    console.log("🔍 Profile data:", profileData);

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      return { success: false, error: "Supabase client not initialized" };
    }

    // Prepare update data
    const updateData: Partial<Profile> = {
      name: profileData.name,
      username: profileData.username,
      dob: profileData.dob || null,
      city: profileData.city || null,
      bio: profileData.bio || null,
      is_private: profileData.is_private ?? false,
    };

    if (profileData.theme_color !== undefined) {
      updateData.theme_color = profileData.theme_color;
    }
    if (profileData.font_family !== undefined) {
      updateData.font_family = profileData.font_family;
    }
    if (profileData.accent_color !== undefined) {
      updateData.accent_color = profileData.accent_color;
    }

    // Add avatar and banner URLs if provided
    if (avatarUrl) {
      updateData.avatar_url = avatarUrl;
    }
    if (bannerUrl) {
      updateData.banner_url = bannerUrl;
    }

    const { data: existingProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("❌ Failed to determine if profile exists:", fetchError);
      return { success: false, error: fetchError.message };
    }

    const timestamp = new Date().toISOString();
    const mutation = existingProfile
      ? supabase
          .from("profiles")
          .update({
            ...updateData,
            updated_at: timestamp,
          })
          .eq("user_id", userId)
          .select()
          .maybeSingle()
      : supabase
          .from("profiles")
          .insert({
            id: userId,
            user_id: userId,
            ...updateData,
            created_at: timestamp,
            updated_at: timestamp,
          })
          .select()
          .single();

    const { data, error } = await mutation;

    if (error) {
      console.error("❌ Failed to update profile:", error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.error("❌ No profile returned after saving for user", userId);
      return { success: false, error: "Profile could not be saved" };
    }

    console.log("✅ Profile updated successfully:", data);
    return { success: true, profile: data };
  } catch (error) {
    console.error("Error in updateProfile:", error);
    return { success: false, error: "Failed to update profile" };
  }
}

export async function checkUsernameAvailability(
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseBrowser();
    if (!supabase) return false;

    const { data: existingProfile, error } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("username", username)
      .maybeSingle();

    if (error) {
      console.error("Error checking username availability:", error);
      return false;
    }

    if (!existingProfile) {
      // No profile found with this username, so it's available
      return true;
    }

    // If we're excluding a specific user ID and this profile belongs to that user, username is available
    if (excludeUserId && existingProfile.user_id === excludeUserId) {
      return true;
    }

    // Username is taken by another user
    return false;
  } catch (error) {
    console.error("Error checking username availability:", error);
    return false;
  }
}

// Enhanced profile functions
export async function createProfile(
  userId: string,
  profileData: Partial<ProfileFormData>
): Promise<ProfileUpdateResult> {
  try {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      return { success: false, error: "Supabase client not initialized" };
    }

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        user_id: userId,
        username: profileData.username || `user_${userId.slice(0, 8)}`,
        name: profileData.name || "New User",
        bio: profileData.bio || null,
        dob: profileData.dob || null,
        city: profileData.city || null,
        avatar_url: null,
        banner_url: null,
        verified: false,
        theme_color: "#3B82F6",
        font_family: "Inter",
        accent_color: "#8B5CF6",
        is_private: profileData.is_private ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating profile:", error);
      return { success: false, error: error.message };
    }

    return { success: true, profile: data };
  } catch (error) {
    console.error("Error in createProfile:", error);
    return { success: false, error: "Failed to create profile" };
  }
}

export async function ensureProfileExists(
  userId: string
): Promise<Profile | null> {
  try {
    // Simply check if the profile exists without creating a placeholder.
    return await getProfileByUserId(userId);
  } catch (error) {
    console.error("Error ensuring profile exists:", error);
    return null;
  }
}

// Get profile by username handle
export async function getProfileByHandle(
  handle: string
): Promise<Profile | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", handle)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile by handle:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in getProfileByHandle:", error);
    return null;
  }
}

// Get profile links (content cards) for a user
export async function getProfileLinks(userId: string): Promise<ContentCard[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("content_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching profile links:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getProfileLinks:", error);
    return [];
  }
}
