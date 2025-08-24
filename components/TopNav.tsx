"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function TopNav() {
  const { session } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowser();
    if (supabase) {
      await supabase.auth.signOut();
      router.push("/auth");
    }
  };

  if (!session?.user) {
    return null; // Don't show navigation for unauthenticated users
  }

  return (
    <nav className="bg-[#1E1E1E] border-b border-[#333] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-white">ACCOUNTABILITY</h1>
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-zinc-300">
            Welcome,{" "}
            {session.user.user_metadata?.full_name || session.user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
