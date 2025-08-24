"use client";

import { useAuth } from "@/components/auth/AuthProvider";

export default function BottomNav() {
  const { session } = useAuth();

  if (!session?.user) {
    return null; // Don't show navigation for unauthenticated users
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1E1E1E] border-t border-[#333] px-4 py-2">
      <div className="flex justify-around items-center">
        <button className="flex flex-col items-center p-2 text-zinc-400 hover:text-zinc-300 transition-colors">
          <span className="text-sm">Dashboard</span>
        </button>

        <button className="flex flex-col items-center p-2 text-zinc-400 hover:text-zinc-300 transition-colors">
          <span className="text-sm">Schedule</span>
        </button>

        <button className="flex flex-col items-center p-2 text-zinc-400 hover:text-zinc-300 transition-colors">
          <span className="text-lg font-bold">+</span>
        </button>

        <button className="flex flex-col items-center p-2 text-zinc-400 hover:text-zinc-300 transition-colors">
          <span className="text-sm">Friends</span>
        </button>

        <button className="flex flex-col items-center p-2 text-zinc-400 hover:text-zinc-300 transition-colors">
          <span className="text-sm">Coming Soon</span>
        </button>
      </div>
    </nav>
  );
}
