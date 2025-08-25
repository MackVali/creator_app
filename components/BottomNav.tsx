"use client";

import Link from "next/link";
import {
  Home,
  Calendar,
  Users,
  MoreHorizontal,
  Plus,
} from "lucide-react";

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-gray-400 flex justify-around items-center py-2">
      <Link href="/" className="flex flex-col items-center gap-1 hover:text-blue-400">
        <Home className="h-6 w-6" />
        <span className="text-xs">Dashboard</span>
      </Link>
      <Link href="/schedule" className="flex flex-col items-center gap-1 hover:text-blue-400">
        <Calendar className="h-6 w-6" />
        <span className="text-xs">Schedule</span>
      </Link>
      <div className="relative">
        <Link
          href="/"
          className="flex items-center justify-center h-14 w-14 -translate-y-6 rounded-full bg-gradient-to-br from-gray-900 to-black text-gray-300 drop-shadow-lg hover:scale-110 transition"
        >
          <Plus className="h-8 w-8" />
        </Link>
      </div>
      <Link href="/skills" className="flex flex-col items-center gap-1 hover:text-blue-400">
        <Users className="h-6 w-6" />
        <span className="text-xs">Skills</span>
      </Link>
      <Link href="/coming-soon" className="flex flex-col items-center gap-1 hover:text-blue-400">
        <MoreHorizontal className="h-6 w-6" />
        <span className="text-xs">Coming Soon</span>
      </Link>
    </nav>
  );
}

