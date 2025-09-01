"use client";

import Link from "next/link";
import { Home, Calendar, Users, MoreHorizontal } from "lucide-react";
import { Fab } from "@/components/ui/Fab";

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-gray-400 flex justify-around items-center h-16">
      <Link
        href="/"
        className="flex flex-col items-center gap-1 hover:text-blue-400"
      >
        <Home className="h-6 w-6" />
        <span className="text-xs">Dashboard</span>
      </Link>
      <Link
        href="/schedule"
        className="flex flex-col items-center gap-1 hover:text-blue-400"
      >
        <Calendar className="h-6 w-6" />
        <span className="text-xs">Schedule</span>
      </Link>

      <div className="relative">
        <Fab className="-translate-y-6" />
      </div>
      <Link
        href="/friends"
        className="flex flex-col items-center gap-1 hover:text-blue-400"
      >
        <Users className="h-6 w-6" />
        <span className="text-xs">Friends</span>
      </Link>
      <Link
        href="/coming-soon"
        className="flex flex-col items-center gap-1 hover:text-blue-400"
      >
        <MoreHorizontal className="h-6 w-6" />
        <span className="text-xs">Coming Soon</span>
      </Link>
    </nav>
  );
}
