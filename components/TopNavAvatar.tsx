"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Profile {
  user_id: string;
  username: string;
  name?: string | null;
  avatar_url?: string | null;
}

interface TopNavAvatarProps {
  profile: Profile | null;
  userId: string | null;
  href: string;
}

export default function TopNavAvatar({ profile, userId, href }: TopNavAvatarProps) {
  const router = useRouter();

  const handleClick = () => {
    if (userId) {
      router.push(href);
    }
  };

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

  const initials = getInitials(profile?.name || null, profile?.username || "U");

  return (
    <button
      onClick={handleClick}
      className="h-8 w-8 rounded-full overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
      data-testid="nav-profile"
    >
      <Avatar className="h-8 w-8">
        {profile?.avatar_url ? (
          <AvatarImage
            src={profile.avatar_url}
            alt={`${profile.name || profile.username}'s avatar`}
          />
        ) : null}
        <AvatarFallback className="bg-gray-700 text-white text-sm font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
    </button>
  );
}
