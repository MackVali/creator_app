"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User } from "lucide-react";
import { getProfileByUsername } from "@/lib/db";
import { Profile } from "@/lib/types";

interface PublicProfileContentProps {
  username: string;
}

export default function PublicProfileContent({
  username,
}: PublicProfileContentProps) {
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
    return <div>Loading...</div>;
  }

  if (error || !profile) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            {error || "Profile not found"}
          </div>
        </CardContent>
      </Card>
    );
  }

  const initials = getInitials(profile.name || null, profile.username);

  return (
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
              <div className="flex items-center space-x-3 mb-2">
                <h2 className="text-2xl font-bold">
                  {profile.name || "No name set"}
                </h2>
                <Badge variant="secondary">@{profile.username}</Badge>
              </div>
              {profile.bio && <p className="text-gray-600">{profile.bio}</p>}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500 mb-2">Bio</p>
              <p className="text-gray-900">{profile.bio}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
