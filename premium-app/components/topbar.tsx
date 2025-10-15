"use client";

import { cn } from "@/lib/utils";
import { Bell, Search, LogOut, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileNav } from "./mobile-nav";

export function Topbar() {
  const { session } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/5 bg-black/40 px-4 backdrop-blur supports-[backdrop-filter]:bg-black/30"
      )}
    >
      {/* Mobile navigation */}
      <MobileNav />

      <div className="flex-1">
        <div className="text-sm text-zinc-400 hidden sm:block">Overview</div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 text-zinc-400">
        {/* Search button - hidden on very small screens */}
        <button className="hidden sm:inline-flex size-8 items-center justify-center rounded-md bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
          <Search className="size-4" />
        </button>

        {/* Notification button */}
        <button className="inline-flex size-8 items-center justify-center rounded-md bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
          <Bell className="size-4" />
        </button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <div className="size-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center">
                <User className="size-4 text-zinc-300" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm text-muted-foreground border-b mb-1">
              {session?.user?.email}
            </div>
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-600 focus:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
