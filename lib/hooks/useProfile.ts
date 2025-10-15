import { useState, useEffect, useCallback } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { getProfileByUserId } from "@/lib/db";
import { Profile } from "@/lib/types";

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
          setError("You must be logged in to view your profile");
          setLoading(false);
          return;
        }

        setUserId(currentUserId);
        const userProfile = await getProfileByUserId(currentUserId);
        setProfile(userProfile);
      } catch (err) {
        setError("Failed to load profile");
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const userProfile = await getProfileByUserId(userId);
      setProfile(userProfile);
      setError(null);
    } catch (err) {
      setError("Failed to refresh profile");
      console.error("Error refreshing profile:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    profile,
    userId,
    loading,
    error,
    refreshProfile,
  };
}
