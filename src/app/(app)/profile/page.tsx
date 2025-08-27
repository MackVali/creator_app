"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getProfileByUserId, ensureProfileExists } from "@/lib/db";
import { Profile, SocialLink, ContentCard } from "@/lib/types";
import LinkMeProfile from "./LinkMeProfile";

export default function ProfilePage() {
  const router = useRouter();
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user?.id) {
        router.push("/auth");
        return;
      }

      try {
        setLoading(true);
        
        // Ensure profile exists, create if it doesn't
        let userProfile = await ensureProfileExists(session.user.id);
        
        if (!userProfile) {
          // Create a basic profile if none exists
          userProfile = {
            id: 0,
            user_id: session.user.id,
            username: session.user.email?.split('@')[0] || 'user',
            name: session.user.user_metadata?.full_name || 'New User',
            dob: null,
            city: null,
            bio: null,
            avatar_url: null,
            banner_url: null,
            verified: false,
            theme_color: "#3B82F6",
            font_family: "Inter",
            accent_color: "#8B5CF6",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        
        setProfile(userProfile);
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [session, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Profile not found</p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <LinkMeProfile profile={profile} />;
}
