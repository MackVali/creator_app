"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/AuthProvider";
import { User, LogIn, Settings, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";
import { getProfileByUserId } from "@/lib/db";

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

  const defaultDestination = useMemo(
    () => (session ? "/profile" : "/auth"),
    [session]
  );
  const [profileHref, setProfileHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveProfileHref = async () => {
      if (!session) {
        setProfileHref("/auth");
        return;
      }

      if (profile?.username?.trim()) {
        setProfileHref(`/profile/${profile.username}`);
        return;
      }

      const sessionHandle = session.user.user_metadata?.username;
      if (typeof sessionHandle === "string" && sessionHandle.trim()) {
        setProfileHref(`/profile/${sessionHandle.trim()}`);
        return;
      }

      setProfileHref("/profile");

      if (!userId) {
        return;
      }

      try {
        const fetchedProfile = await getProfileByUserId(userId);
        if (cancelled) return;

        if (fetchedProfile?.username?.trim()) {
          setProfileHref(`/profile/${fetchedProfile.username}`);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to resolve profile handle:", error);
        }
      }
    };

    resolveProfileHref();

    return () => {
      cancelled = true;
    };
  }, [profile?.username, session, userId]);

  const navigateToProfile = () => {
    router.push(profileHref || defaultDestination);
  };

  const handleAvatarClick = () => {
    navigateToProfile();
  };

  const handleProfileClick = () => {
    navigateToProfile();
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
  const displayName = profile?.name?.trim() || profile?.username || "You";
  const handleTagline = profile?.username ? `@${profile.username}` : session?.user.email;

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

      <DropdownMenuContent
        align="end"
        className="w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#090B11]/95 p-0 text-white shadow-[0px_24px_60px_rgba(8,9,14,0.45)] backdrop-blur"
      >
        {session ? (
          // User is signed in
          <>
            <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-br from-indigo-500/10 via-transparent to-slate-900 px-4 py-4">
              <Avatar className="h-11 w-11 border border-white/10 shadow-lg">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={`${profile.name || profile.username}'s avatar`}
                  />
                ) : null}
                <AvatarFallback className="bg-slate-800 text-sm font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="space-y-0.5">
                <p className="text-sm font-semibold leading-tight text-white">
                  {displayName}
                </p>
                {handleTagline ? (
                  <p className="text-xs text-white/60">{handleTagline}</p>
                ) : null}
              </div>
            </div>

            <div className="px-2 py-2 text-sm">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  handleProfileClick();
                }}
                className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-white/70 transition-colors group-hover:bg-white/15 group-hover:text-white">
                  <User className="h-4 w-4" />
                </span>
                View profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  handleEditProfileClick();
                }}
                className="group mt-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-white/70 transition-colors group-hover:bg-white/15 group-hover:text-white">
                  <Settings className="h-4 w-4" />
                </span>
                Edit profile
              </DropdownMenuItem>
            </div>

            <div className="border-t border-white/5 bg-white/5 px-4 py-3">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500/80 to-orange-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:from-rose-500 hover:to-orange-500"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </>
        ) : (
          // User is not signed in
          <div className="px-4 py-5 text-center text-sm">
            <p className="mb-3 text-base font-semibold text-white">Ready to get started?</p>
            <p className="mb-4 text-xs text-white/70">
              Sign in to personalize your experience and access your creator hub.
            </p>
            <button
              onClick={handleSignInClick}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:from-indigo-400 hover:to-purple-400"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
