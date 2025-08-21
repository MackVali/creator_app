import { getSupabaseBrowser } from "./supabase";
import { User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export async function signInWithMagicLink(email: string) {
  const supabase = getSupabaseBrowser();
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
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseBrowser();
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
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
}
