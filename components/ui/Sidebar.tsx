"use client";

import {
  LayoutDashboard,
  Target,
  FolderOpen,
  CheckSquare,
  Repeat,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

const navigation = [
  { name: 'Dashboard', href: ROUTES.dashboard, icon: LayoutDashboard, testId: 'nav-dashboard' },
  { name: 'Friends', href: ROUTES.friends, icon: Users, testId: 'nav-friends' },
  { name: 'Goals', href: ROUTES.goals, icon: Target, testId: 'nav-goals' },
  { name: 'Projects', href: ROUTES.projects, icon: FolderOpen, testId: 'nav-projects' },
  { name: 'Tasks', href: ROUTES.tasks, icon: CheckSquare, testId: 'nav-tasks' },
  { name: 'Habits', href: ROUTES.habits, icon: Repeat, testId: 'nav-habits' },
  { name: 'Monuments', href: ROUTES.monuments, icon: Trophy, testId: 'nav-monuments' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-16 md:w-64 bg-[#15161A] border-r border-white/5 flex-shrink-0">
      <div className="p-4">
        <div className="text-center md:text-left mb-8">
          <h1 className="text-xl font-bold text-zinc-200 hidden md:block">Premium</h1>
        </div>

        <nav className="space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                data-testid={item.testId}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white/10 text-zinc-200'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="hidden md:block text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
