"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  Target,
  FolderKanban,
  CheckSquare2,
  Repeat,
  Landmark,
} from "lucide-react";
import { Fab } from "@/components/ui/Fab";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const navItems = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: Home, testId: "nav-dashboard" },
  { href: ROUTES.goals, label: "Goals", icon: Target, testId: "nav-goals" },
  { href: ROUTES.projects, label: "Projects", icon: FolderKanban, testId: "nav-projects" },
  { href: ROUTES.tasks, label: "Tasks", icon: CheckSquare2, testId: "nav-tasks" },
  { href: ROUTES.habits, label: "Habits", icon: Repeat, testId: "nav-habits" },
  { href: ROUTES.monuments, label: "Monuments", icon: Landmark, testId: "nav-monuments" },
  { href: ROUTES.friends, label: "Friends", icon: Users, testId: "nav-friends" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-gray-400 flex justify-around items-center py-2">
      {navItems.slice(0, 3).map(({ href, label, icon: Icon, testId }) => (
        <Link
          key={href}
          href={href}
          data-testid={testId}
          className={cn(
            "flex flex-col items-center gap-1 hover:text-blue-400",
            pathname === href && "text-blue-400"
          )}
        >
          <Icon className="h-6 w-6" />
          <span className="text-xs">{label}</span>
        </Link>
      ))}
      <div className="relative">
        <Fab className="-translate-y-6" />
      </div>
      {navItems.slice(3).map(({ href, label, icon: Icon, testId }) => (
        <Link
          key={href}
          href={href}
          data-testid={testId}
          className={cn(
            "flex flex-col items-center gap-1 hover:text-blue-400",
            pathname === href && "text-blue-400"
          )}
        >
          <Icon className="h-6 w-6" />
          <span className="text-xs">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
