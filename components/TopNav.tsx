"use client";

import { Menu } from "lucide-react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useEffect, useState } from "react";

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

  const toggleSidebar = () => {
    // Placeholder for future sidebar toggle
    console.log("toggle sidebar");
  };

  return (
    <nav className="w-full flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
      <button onClick={toggleSidebar} className="p-2 hover:text-blue-400">
        <Menu className="h-6 w-6" />
      </button>
      <span className="font-semibold" data-testid="username">
        {profile?.username || userEmail || "Guest"}
      </span>
      <TopNavAvatar profile={profile} userId={userId} />
    </nav>
  );
}
