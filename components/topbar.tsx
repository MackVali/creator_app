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

export function Topbar() {
  const { user } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className={cn(
      "sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/5 bg-black/40 px-4 backdrop-blur supports-[backdrop-filter]:bg-black/30"
    )}>
      <div className="flex-1">
        <div className="text-sm text-zinc-400">Overview</div>
      </div>
      <div className="flex items-center gap-3 text-zinc-400">
        <button className="inline-flex size-8 items-center justify-center rounded-md bg-white/[0.03] hover:bg-white/[0.06]">
          <Search className="size-4" />
        </button>
        <button className="inline-flex size-8 items-center justify-center rounded-md bg-white/[0.03] hover:bg-white/[0.06]">
          <Bell className="size-4" />
        </button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <div className="size-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center">
                <User className="size-4 text-zinc-300" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {user?.email}
            </div>
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}


