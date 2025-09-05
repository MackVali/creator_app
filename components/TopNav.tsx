"use client";

import { Menu } from "lucide-react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TopNav() {
  const { profile, userId } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    const getUserEmail = async () => {
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUserEmail(user?.email || null);
      }
    };
    getUserEmail();
  }, [supabase]);

  return (
    <nav className="w-full flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-11 w-11 p-2 hover:text-purple-400 focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="bg-[#222224] border-[#2F343A] text-[#E6E6E6]"
        >
          <DropdownMenuItem asChild>
            <Link href="/analytics">Analytics</Link>
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
