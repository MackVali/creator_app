"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User } from "lucide-react";
import { getProfileByUsername } from "@/lib/db";
import { Profile } from "@/lib/types";
import LinkedAccountsBar from "@/components/profile/LinkedAccountsBar";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";

interface PublicProfileContentProps {
  username: string;
}

export default function PublicProfileContent({
  username,
}: PublicProfileContentProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const userProfile = await getProfileByUsername(username);
        if (!userProfile) {
          setError("Profile not found");
          return;
        }
        setProfile(userProfile);
      } catch (err) {
        setError("Failed to load profile");
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [username]);

  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name
        .split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !profile) {
    const headline = error || "Profile not found";
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-[-20%] h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[160px]" />
          <div className="absolute bottom-[-25%] right-[-15%] h-[260px] w-[260px] rounded-full bg-neutral-800/15 blur-[200px]" />
        </div>

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center shadow-[0_25px_45px_rgba(15,23,42,0.45)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">Public profile</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">{headline}</h1>
          <p className="mt-3 text-sm text-white/60">
            We couldn&apos;t load this profile. Double-check the handle or head back.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-6 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const initials = getInitials(profile.name || null, profile.username);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-3xl font-bold">@{profile.username}</h1>
      <div className="space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-6">
              <Avatar className="h-24 w-24">
                {profile.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={`${profile.name || profile.username}'s avatar`}
                  />
                ) : null}
                <AvatarFallback className="text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="mb-2 flex items-center space-x-3">
                  <h2 className="text-2xl font-bold">
                    {profile.name || "No name set"}
                  </h2>
                  <Badge variant="secondary">@{profile.username}</Badge>
                </div>
                {profile.bio && <p className="text-gray-600">{profile.bio}</p>}
                <LinkedAccountsBar userId={profile.user_id} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Details */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {profile.name && (
                <div className="flex items-center space-x-3">
                  <User className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium">{profile.name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <Badge variant="outline">@{profile.username}</Badge>
                <div>
                  <p className="text-sm text-gray-500">Username</p>
                  <p className="font-medium">{profile.username}</p>
                </div>
              </div>

              {profile.dob && (
                <div className="flex items-center space-x-3">
                  <Calendar className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Date of Birth</p>
                    <p className="font-medium">
                      {new Date(profile.dob).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {profile.city && (
                <div className="flex items-center space-x-3">
                  <MapPin className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">City</p>
                    <p className="font-medium">{profile.city}</p>
                  </div>
                </div>
              )}
            </div>

            {profile.bio && (
              <div className="border-t pt-4">
                <p className="mb-2 text-sm text-gray-500">Bio</p>
                <p className="text-gray-900">{profile.bio}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
