import { createClient } from "@supabase/supabase-js";

// Validate environment variables at module initialization
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
  const missingVars = [];
  if (!supabaseUrl?.trim()) missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey?.trim())
    missingVars.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (process.env.NODE_ENV === "development") {
    console.error(
      `❌ Missing or empty Supabase environment variables: ${missingVars.join(
        ", "
      )}`
    );
    console.error("Please add these to your .env.local file:");
    console.error("NEXT_PUBLIC_SUPABASE_URL=your_supabase_url");
    console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key");

    // In development, don't create a client - let the error component handle it
    supabase = null;
  } else {
    throw new Error(
      `Missing or empty Supabase environment variables: ${missingVars.join(
        ", "
      )}`
    );
  }
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };
