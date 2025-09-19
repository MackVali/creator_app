import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { normalizeTimezone } from "@/lib/time/tz";

// Profile schema validation
export const profileSchema = z.object({
  name: z.string().min(1).max(80),
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/)
    .toLowerCase(),
  dob: z.string().nullable(),
  city: z.string().max(100).nullable(),
  bio: z.string().max(300).nullable(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing Supabase environment variables:", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return { url: null, key: null };
  }

  return { url, key };
}

// Get Supabase server client
function getSupabaseServer(cookies: {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): void;
}) {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: {
      get: (name) => cookies.get(name)?.value,
      set: (name, value, options) => cookies.set(name, value, options),
    },
  });
}

// Get current authenticated user
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

// Get profile for a specific user - ensure single result
export async function getProfile(userId: string) {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) return null;

  // Use .eq('user_id', uid).maybeSingle() to ensure single result and avoid PGRST116
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle(); // Use maybeSingle to handle case where profile doesn't exist

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  return data;
}

// Ensure profile exists for user (idempotent) - create if missing
export async function ensureProfile(userId: string) {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) return null;

  // Check if profile exists
  const existingProfile = await getProfile(userId);
  if (existingProfile) {
    return existingProfile;
  }

  // Create profile if it doesn't exist
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      name: "New User",
      username: `user_${userId.slice(0, 8)}`,
      dob: null,
      city: null,
      bio: null,
      avatar_url: null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating profile:", error);
    return null;
  }

  return data;
}

// Update current user's profile
export async function updateMyProfile(input: ProfileFormData) {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) return { success: false, error: "Supabase not initialized" };

  // Get current user
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Validate input
    const validatedData = profileSchema.parse(input);

    // Check username uniqueness (case-insensitive) - exclude current user
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("username", validatedData.username) // Use ilike for case-insensitive comparison
      .neq("user_id", user.id)
      .maybeSingle();

    if (existingProfile) {
      return { success: false, error: "Username is taken" };
    }

    // Update profile - ensure we only update the current user's profile
    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        ...validatedData,
      })
      .eq("user_id", user.id) // Ensure we only update current user's profile
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      return { success: false, error: "Failed to update profile" };
    }

    return { success: true, profile: data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input data" };
    }

    console.error("Error in updateMyProfile:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateMyTimezone(timezoneInput: string | null) {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) return { success: false, error: "Supabase not initialized" };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const normalized = normalizeTimezone(timezoneInput);

  try {
    await ensureProfile(user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        timezone: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("timezone")
      .maybeSingle();

    if (error) {
      console.error("Error updating timezone:", error);
      return { success: false, error: "Failed to update timezone" };
    }

    return { success: true, timezone: data?.timezone ?? null };
  } catch (error) {
    console.error("Error in updateMyTimezone:", error);
    return { success: false, error: "Failed to update timezone" };
  }
}

// Get profile by username (for public profiles)
export async function getProfileByUsername(username: string) {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("username", username)
    .maybeSingle();

  if (error) {
    console.error("Error fetching profile by username:", error);
    return null;
  }

  return data;
}
