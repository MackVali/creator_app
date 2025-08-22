"use client";

import { Menu, CircleUser } from "lucide-react";
import Link from "next/link";

interface TopNavProps {
  username: string;
}

export default function TopNav({ username }: TopNavProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/30 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => console.log("see all pages")}
          className="text-white/60 transition-colors hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-white">{username}</span>
        <Link
          href="/profile"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10"
        >
          <CircleUser className="h-5 w-5 text-white" />
        </Link>
      </div>
    </header>
  );
}

