"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  // Normalize time zone to always be string | null
  const localTimeZone = (() => {
    const tz = profile?.timezone;
    if (typeof tz === "string") {
      return tz;
    }
    // Handle case where timezone might be an object (despite type definition)
    const tzObj = tz as unknown;
    if (
      tzObj &&
      typeof tzObj === "object" &&
      "name" in tzObj &&
      typeof tzObj.name === "string"
    ) {
      return tzObj.name;
    }
    return null;
  })();

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowser?.();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      setProfile(data);
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return {
    profile,
    userId,
    localTimeZone,
    loading,
    error,
    refreshProfile,
  };
}
