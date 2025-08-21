import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

// Helper function to safely get environment variables
function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`⚠️  Missing or empty environment variable: ${name}`);
    }
    return ""; // Return empty string instead of undefined
  }
  return value;
}

// Browser client - safe to use in client components
export function getSupabaseBrowser() {
  const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (process.env.NODE_ENV === "development") {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn(
        "⚠️  Supabase environment variables missing - client may not work properly"
      );
      console.warn("Please add to your .env.local file:");
      console.warn("NEXT_PUBLIC_SUPABASE_URL=your_supabase_url");
      console.warn("NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key");
    }
  }

  // Use fallback URLs if environment variables are missing
  const url = supabaseUrl || "https://placeholder.supabase.co";
  const key = supabaseAnonKey || "placeholder-key";

  try {
    return createClient(url, key);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️  Failed to create Supabase client:", error);
    }
    // Return a dummy client that won't crash the app
    return createClient("https://placeholder.supabase.co", "placeholder-key");
  }
}

// Server client - safe to use in server components and API routes
export async function getSupabaseServer(
  cookiesInstance: ReturnType<typeof cookies>
) {
  const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (process.env.NODE_ENV === "development") {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn(
        "⚠️  Supabase environment variables missing - server client may not work properly"
      );
    }
  }

  const cookies = await cookiesInstance;

  // Use fallback URLs if environment variables are missing
  const url = supabaseUrl || "https://placeholder.supabase.co";
  const key = supabaseAnonKey || "placeholder-key";

  try {
    return createServerClient(url, key, {
      cookies: {
        get(name: string) {
          return cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookies.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          cookies.set(name, "", options);
        },
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️  Failed to create Supabase server client:", error);
    }
    // Return a dummy client that won't crash the app
    return createServerClient(
      "https://placeholder.supabase.co",
      "placeholder-key",
      {
        cookies: {
          get() {
            return undefined;
          },
          set() {
            return;
          },
          remove() {
            return;
          },
        },
      }
    );
  }
}

// Legacy export for backward compatibility (always returns a safe client)
export const supabase = getSupabaseBrowser();
