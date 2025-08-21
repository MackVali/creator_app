import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

// Helper function to safely get environment variables
function getEnvVar(name: string): string | undefined {
  const value = process.env[name];
  if (!value?.trim()) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`⚠️  Missing or empty environment variable: ${name}`);
    }
    return undefined;
  }
  return value;
}

// Browser client - safe to use in client components
export function getSupabaseBrowser() {
  const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "❌ Supabase client not available - missing environment variables"
      );
      console.warn("Please add to your .env.local file:");
      console.warn("NEXT_PUBLIC_SUPABASE_URL=your_supabase_url");
      console.warn("NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key");
    }
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

// Server client - safe to use in server components and API routes
export async function getSupabaseServer(
  cookiesInstance: ReturnType<typeof cookies>
) {
  const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "❌ Supabase server client not available - missing environment variables"
      );
    }
    return null;
  }

  const cookies = await cookiesInstance;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
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
}

// Legacy export for backward compatibility (returns null if env vars missing)
export const supabase = getSupabaseBrowser();
