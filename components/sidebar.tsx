"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Gauge,
  Target,
  FolderKanban,
  CheckSquare2,
  Repeat,
  Landmark,
  Users,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";

const navItems = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: Gauge, testId: "nav-dashboard" },
  { href: ROUTES.friends, label: "Friends", icon: Users, testId: "nav-friends" },
  { href: ROUTES.goals, label: "Goals", icon: Target, testId: "nav-goals" },
  { href: ROUTES.projects, label: "Projects", icon: FolderKanban, testId: "nav-projects" },
  { href: ROUTES.tasks, label: "Tasks", icon: CheckSquare2, testId: "nav-tasks" },
  { href: ROUTES.habits, label: "Habits", icon: Repeat, testId: "nav-habits" },
  { href: ROUTES.monuments, label: "Monuments", icon: Landmark, testId: "nav-monuments" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col gap-1 border-r border-white/5 bg-black/40 backdrop-blur supports-[backdrop-filter]:bg-black/30">
      <div className="px-4 py-4 text-xs uppercase tracking-widest text-zinc-400">Premium</div>
      <nav className="px-2 pb-4">
        {navItems.map(({ href, label, icon: Icon, testId }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              data-testid={testId}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white",
                active && "bg-white/10 text-white"
              )}
            >
              <Icon className="size-4 text-zinc-400 group-hover:text-zinc-200" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
