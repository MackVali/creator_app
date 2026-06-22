"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/AuthProvider";
import { User, LogIn, Settings, LogOut, Inbox, FlaskConical } from "lucide-react";
import { signOut } from "@/lib/auth";
import { userIsAdmin } from "@/lib/auth/userRoles";

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
  const { user } = useAuth();

  const handleProfileClick = () => {
    if (user) {
      router.push(profile?.username ? `/profile/${profile.username}` : "/profile");
    } else {
      router.push("/auth");
    }
  };

  const handleEditProfileClick = () => {
    if (userId) {
      router.push("/profile/edit");
    }
  };

  const handleInboxClick = () => {
    router.push("/inbox");
  };

  const handleTestClick = () => {
    router.push("/test");
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
  const displayName = profile?.name?.trim() || profile?.username || "You";
  const handleTagline = profile?.username ? `@${profile.username}` : user?.email;
  const isAdmin = userIsAdmin(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
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

      <DropdownMenuContent
        align="end"
        className="w-56 overflow-hidden rounded-2xl border border-white/10 bg-black/90 p-1.5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      >
        {user ? (
          // User is signed in
          <>
            <div className="mx-1 mb-1 flex items-center gap-2.5 border-b border-white/10 px-2 py-2.5">
              <Avatar className="h-8 w-8 border border-white/10">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={`${profile.name || profile.username}'s avatar`}
                  />
                ) : null}
                <AvatarFallback className="bg-white/10 text-xs font-medium text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight text-white">
                  {displayName}
                </p>
                {handleTagline ? (
                  <p className="truncate text-xs text-white/50">{handleTagline}</p>
                ) : null}
              </div>
            </div>

            <div className="text-sm">
              <DropdownMenuItem
                onClick={handleProfileClick}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.07] focus:text-white"
              >
                <User className="h-4 w-4 text-white/55" />
                View profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleEditProfileClick}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.07] focus:text-white"
              >
                <Settings className="h-4 w-4 text-white/55" />
                Edit profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleInboxClick}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.07] focus:text-white"
              >
                <Inbox className="h-4 w-4 text-white/55" />
                Inbox
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem
                  onClick={handleTestClick}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.07] focus:text-white"
                >
                  <FlaskConical className="h-4 w-4 text-white/55" />
                  Test
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={handleSignOut}
                className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-t border-white/10 px-3 py-2.5 text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.07] focus:text-white"
              >
                <LogOut className="h-4 w-4 text-white/45" />
                Sign out
              </DropdownMenuItem>
            </div>
          </>
        ) : (
          // User is not signed in
          <div className="text-sm">
            <div className="mx-1 mb-1 border-b border-white/10 px-2 py-2.5">
              <p className="text-sm font-medium text-white">CREATOR</p>
              <p className="mt-0.5 text-xs text-white/50">
                Sign in to access your creator hub.
              </p>
            </div>
            <DropdownMenuItem
              onClick={handleSignInClick}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.07] focus:text-white"
            >
              <LogIn className="h-4 w-4 text-white/55" />
              Sign in
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
