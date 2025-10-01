"use client";

import { Menu } from "lucide-react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TopNav() {
  const pathname = usePathname();
  const shouldHideNav = pathname?.startsWith("/schedule");
  const { profile, userId } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = getSupabaseBrowser();

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

  if (shouldHideNav) {
    return null;
  }

  return (
    <nav className="w-full flex items-center justify-between px-4 py-2 bg-black/80 text-white border-b border-white/10 backdrop-blur">
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
      <span className="font-semibold" data-testid="username">
        {profile?.username || userEmail || "Guest"}
      </span>
      <TopNavAvatar profile={profile} userId={userId} />
    </nav>
  );
}
