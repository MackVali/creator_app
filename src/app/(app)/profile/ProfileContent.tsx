import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, User, Edit3 } from "lucide-react";

interface Profile {
  user_id: string;
  username: string;
  name?: string | null;
  dob?: string | null;
  city?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileContentProps {
  profile: Profile;
  userId: string;
}

export default function ProfileContent({
  profile,
  userId,
}: ProfileContentProps) {
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

  const initials = getInitials(profile.name || null, profile.username);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not specified";
    return new Date(dateString).toLocaleDateString();
  };

  const hasProfileData = profile.name || profile.bio || profile.dob || profile.city;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <Link href="/profile/edit">
          <Button variant="outline" size="sm">
            <Edit3 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        {profile.banner_url ? (
          <div className="h-32 w-full">
            <img
              src={profile.banner_url}
              alt="Cover photo"
              className="object-cover w-full h-full"
            />
          </div>
        ) : (
          <div className="h-32 w-full bg-gradient-to-r from-purple-500 to-blue-500" />
        )}
        <CardHeader className="-mt-12 text-center">
          <div className="flex justify-center mb-4">
            <Avatar className="h-24 w-24 border-4 border-white">
              {profile.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt="Profile avatar" />
              ) : null}
              <AvatarFallback className="text-3xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <CardTitle className="text-2xl">
            {profile.name || "No name set"}
          </CardTitle>
          <p className="text-gray-600 text-lg">@{profile.username}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {profile.bio ? (
            <div className="text-center">
              <p className="text-gray-700">{profile.bio}</p>
            </div>
          ) : (
            <div className="text-center text-gray-500 italic">
              <p>No bio added yet</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.dob ? (
              <div className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700">{formatDate(profile.dob)}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-gray-400">
                <Calendar className="h-5 w-5" />
                <span>Birthday not set</span>
              </div>
            )}

            {profile.city ? (
              <div className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700">{profile.city}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-gray-400">
                <MapPin className="h-5 w-5" />
                <span>Location not set</span>
              </div>
            )}
          </div>

          <div className="text-sm text-gray-500 text-center">
            Member since {formatDate(profile.created_at)}
          </div>

          {!hasProfileData && (
            <div className="text-center py-6 border-t border-gray-200">
              <p className="text-gray-500 mb-4">
                Your profile is looking a bit empty. Add some details to make it more personal!
              </p>
              <Link href="/profile/edit">
                <Button>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Complete Your Profile
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
