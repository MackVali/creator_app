"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Gauge,
  Target,
  FolderKanban,
  CheckSquare2,
  Repeat,
  Landmark,
  Users,
  X,
} from 'lucide-react';
import { ROUTES } from '@/lib/routes';

const navItems = [
  { href: ROUTES.dashboard, label: 'Dashboard', icon: Gauge, testId: 'nav-dashboard' },
  { href: ROUTES.goals, label: 'Goals', icon: Target, testId: 'nav-goals' },
  { href: ROUTES.projects, label: 'Projects', icon: FolderKanban, testId: 'nav-projects' },
  { href: ROUTES.tasks, label: 'Tasks', icon: CheckSquare2, testId: 'nav-tasks' },
  { href: ROUTES.habits, label: 'Habits', icon: Repeat, testId: 'nav-habits' },
  { href: ROUTES.monuments, label: 'Monuments', icon: Landmark, testId: 'nav-monuments' },
  { href: ROUTES.friends, label: 'Friends', icon: Users, testId: 'nav-friends' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden h-8 w-8 p-0">
          <Gauge className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-black/95 border-r border-white/10">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="text-sm uppercase tracking-widest text-zinc-400 font-semibold">
              Premium
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <nav className="flex-1 px-2 py-4">
            {navItems.map(({ href, label, icon: Icon, testId }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={testId}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors',
                    active && 'bg-white/10 text-white'
                  )}
                >
                  <Icon className="size-4 text-zinc-400 group-hover:text-zinc-200" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="text-xs text-zinc-500">Premium Performance OS</div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
