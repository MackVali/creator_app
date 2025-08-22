"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Users, Sparkles, Plus } from "lucide-react";
import clsx from "clsx";

export default function BottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/schedule", label: "Schedule", icon: Calendar },
    { href: "/coming-soon?from=friends", label: "Friends", icon: Users },
    { href: "/coming-soon", label: "Coming Soon", icon: Sparkles },
  ];

  const renderItem = (item: (typeof items)[number]) => {
    const Icon = item.icon;
    const isActive = pathname === item.href;
    return (
      <Link key={item.label} href={item.href} className="group flex flex-col items-center gap-1">
        <Icon
          className={clsx(
            "h-5 w-5 transition-colors",
            isActive ? "text-white" : "text-white/60 group-hover:text-white",
          )}
        />
        <span
          className={clsx(
            "text-[10px] transition-colors",
            isActive ? "text-white" : "text-white/60 group-hover:text-white",
          )}
        >
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/30 backdrop-blur">
      <div className="flex h-16 items-center justify-around px-6">
        {renderItem(items[0])}
        {renderItem(items[1])}
        <div className="-mt-6">
          <Link
            href="/create"
            className={clsx(
              "flex h-12 w-12 items-center justify-center rounded-full border border-white/10",
              "bg-gradient-to-br from-neutral-900 via-black to-neutral-950 shadow-lg transition hover:scale-110 active:scale-95",
            )}
          >
            <Plus className="h-6 w-6 text-white" />
          </Link>
        </div>
        {renderItem(items[2])}
        {renderItem(items[3])}
      </div>
    </nav>
  );
}

