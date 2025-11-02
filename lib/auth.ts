import { getSupabaseBrowser } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

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
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  return { error };
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
  const handleAuthChange = async (session: Session | null) => {
    if (!session) {
      callback(null);
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        callback(null);
        return;
      }
      callback(data.user ?? null);
    } catch {
      callback(null);
    }
  };

  return supabase.auth.onAuthStateChange((_event, session) => {
    void handleAuthChange(session);
  });
}
