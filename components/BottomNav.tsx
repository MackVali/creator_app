"use client";

import { Home, Calendar, Users, DollarSign } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BottomBarNav from "./BottomBarNav";
import { Fab } from "@/components/ui/Fab";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const shouldHideNav = pathname?.startsWith("/schedule");
  const [isEditableFocused, setEditableFocused] = useState(false);
  const items = [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: <Home className="h-6 w-6" /> },
    { key: "schedule", label: "Schedule", href: "/schedule", icon: <Calendar className="h-6 w-6" /> },
    { key: "friends", label: "Friends", href: "/friends", icon: <Users className="h-6 w-6" /> },
    { key: "source", label: "Source", href: "/source", icon: <DollarSign className="h-6 w-6" /> },
  ];

  useEffect(() => {
    const isEditableElementFocused = () => {
      const activeElement = document.activeElement;
      if (!activeElement) return false;
      const tagName = activeElement.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea") return true;
      return (
        activeElement instanceof HTMLElement &&
        activeElement.getAttribute("contenteditable") === "true"
      );
    };

    const updateEditableFocus = () => {
      setEditableFocused(isEditableElementFocused());
    };

    window.addEventListener("focusin", updateEditableFocus);
    window.addEventListener("focusout", updateEditableFocus);
    updateEditableFocus();

    return () => {
      window.removeEventListener("focusin", updateEditableFocus);
      window.removeEventListener("focusout", updateEditableFocus);
    };
  }, []);

  if (shouldHideNav || isEditableFocused) {
    // Hide the fixed bottom nav/Fab while typing so keyboard viewport changes don't shift it.
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50" data-bottom-nav>
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
