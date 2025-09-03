"use client";

import { Home, Calendar, Users, DollarSign } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import BottomBarNav from "./BottomBarNav";
import { Fab } from "@/components/ui/Fab";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    { key: "dashboard", label: "Dashboard", href: "/", icon: <Home className="h-6 w-6" /> },
    { key: "schedule", label: "Schedule", href: "/schedule", icon: <Calendar className="h-6 w-6" /> },
    { key: "friends", label: "Friends", href: "/friends", icon: <Users className="h-6 w-6" /> },
    { key: "source", label: "Source", href: "/source", icon: <DollarSign className="h-6 w-6" /> },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="relative">
        <BottomBarNav
          items={items}
          currentPath={pathname}
          onNavigate={(href) => router.push(href)}
        />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-6">
          <Fab />
        </div>
      </div>
    </div>
  );
}

