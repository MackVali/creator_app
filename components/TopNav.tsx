"use client";

import { Menu } from "lucide-react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserProgress } from "@/lib/hooks/useUserProgress";

export default function TopNav() {
  const pathname = usePathname();
  const shouldHideNav = pathname?.startsWith("/schedule");
  const { profile, userId } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [shouldPulse, setShouldPulse] = useState(false);
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const { progress, lastEventAt } = useUserProgress(userId, {
    enabled: !shouldHideNav,
    subscribe: true,
    client: supabase,
  });
  const currentLevel = progress?.currentLevel ?? 0;

  useEffect(() => {
    if (!supabase || shouldHideNav) {
      return;
    }

    const getUserEmail = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };

    getUserEmail();
  }, [shouldHideNav, supabase]);

  useEffect(() => {
    if (!lastEventAt) {
      return;
    }

    setShouldPulse(true);
  }, [lastEventAt]);

  useEffect(() => {
    if (!shouldPulse) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setShouldPulse(false);
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [shouldPulse]);

  if (shouldHideNav) {
    return null;
  }

  return (
    <nav className="w-full flex items-center justify-between px-4 py-2 bg-black/80 text-white border-b border-white/10 backdrop-blur">
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-11 w-11 p-2 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="bg-[#111111] border-[#2A2A2A] text-[#E6E6E6]"
          >
            <DropdownMenuItem asChild>
              <Link href="/analytics">Analytics</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/goals">Goals</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/habits">Habits</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help">Help</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <LevelBadge level={currentLevel} pulsing={shouldPulse} />
      </div>
      <span className="font-semibold" data-testid="username">
        {profile?.username || userEmail || "Guest"}
      </span>
      <TopNavAvatar profile={profile} userId={userId} />
    </nav>
  );
}

function LevelBadge({ level, pulsing }: { level: number; pulsing: boolean }) {
  return (
    <div className="relative flex h-11 w-11 items-center justify-center">
      {pulsing && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-white/20 opacity-75 animate-[ping_1.2s_ease-out_1]" />
      )}
      <div className="relative flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-full border border-white/30 bg-white/10 text-[11px] font-semibold leading-none tracking-tight">
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/60">Level</span>
        <span className="text-sm text-white">{level}</span>
      </div>
    </div>
  );
}
