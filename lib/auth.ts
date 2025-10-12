import { User } from "@supabase/supabase-js";
import { isRedirectUrlError } from "./error-handling";
import { getSupabaseBrowser } from "./supabase";
import { getSiteUrl } from "./utils";

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export async function signInWithMagicLink(email: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { error: { message: "Supabase client not initialized" } };
  }
  const emailRedirectTo = `${getSiteUrl()}/auth/callback`;

  let result = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
    },
  });

  if (result.error && isRedirectUrlError(result.error)) {
    result = await supabase.auth.signInWithOtp({
      email,
    });
  }

  return { error: result.error };
}

export async function signOut() {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { error: { message: "Supabase client not initialized" } };
  }
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id || null;
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  return supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user || null;

    // Create empty profile on sign-in if it doesn't exist
    if (event === "SIGNED_IN" && user) {
      try {
        await upsertEmptyProfile(user);
      } catch (error) {
        console.error("Failed to upsert empty profile:", error);
      }
    }

    callback(user);
  });
}

export async function upsertEmptyProfile(user: User) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;

  try {
    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (!existingProfile) {
      // Create empty profile
      const { error } = await supabase.from("profiles").insert({
        user_id: user.id,
        username: user.user_metadata?.username || `user_${user.id.slice(0, 8)}`,
        name: user.user_metadata?.name || null,
        bio: "",
      });

      if (error) {
        console.error("Error creating empty profile:", error);
      }
    }
  } catch (error) {
    console.error("Error in upsertEmptyProfile:", error);
  }
}
