import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, User } from "lucide-react";

interface Profile {
  user_id: string;
  username: string;
  name?: string | null;
  dob?: string | null;
  city?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
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

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>

      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Avatar className="h-24 w-24">
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
          {profile.bio && (
            <div className="text-center">
              <p className="text-gray-700">{profile.bio}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.dob && (
              <div className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700">{formatDate(profile.dob)}</span>
              </div>
            )}

            {profile.city && (
              <div className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700">{profile.city}</span>
              </div>
            )}
          </div>

          <div className="text-sm text-gray-500 text-center">
            Member since {formatDate(profile.created_at)}
          </div>

          {profile.user_id === userId && (
            <div className="flex justify-center pt-4">
              <Link href="/profile/edit">
                <Button>Edit Profile</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
