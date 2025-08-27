"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/AuthProvider";
import { User, LogIn, Settings, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";

interface Profile {
  user_id: string;
  username: string;
  name?: string | null;
  avatar_url?: string | null;
}

interface TopNavAvatarProps {
  profile: Profile | null;
  userId: string | null;
}

export default function TopNavAvatar({ profile, userId }: TopNavAvatarProps) {
  const router = useRouter();
  const { session } = useAuth();

  const handleAvatarClick = () => {
    if (session && userId) {
      // Auto-direct signed-in users to their profile
      router.push("/profile");
    } else if (!session) {
      // If not signed in, go to auth page
      router.push("/auth");
    }
  };

  const handleProfileClick = () => {
    if (userId) {
      router.push("/profile");
    }
  };

  const handleEditProfileClick = () => {
    if (userId) {
      router.push("/profile/edit");
    }
  };

  const handleSignInClick = () => {
    router.push("/auth");
  };

  const handleSignOut = async () => {
    await signOut();
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={handleAvatarClick}
          className="h-8 w-8 rounded-full overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
          data-testid="topnav-avatar"
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
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        {session ? (
          // User is signed in
          <>
            <DropdownMenuItem
              onClick={handleProfileClick}
              className="cursor-pointer"
            >
              <User className="mr-2 h-4 w-4" />
              View Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleEditProfileClick}
              className="cursor-pointer"
            >
              <Settings className="mr-2 h-4 w-4" />
              Edit Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-red-600 focus:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </>
        ) : (
          // User is not signed in
          <DropdownMenuItem
            onClick={handleSignInClick}
            className="cursor-pointer"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Sign In
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
