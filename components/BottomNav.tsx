"use client";

import { Blocks, Calendar, LayoutDashboard, Link } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import BottomBarNav from "./BottomBarNav";
import { Fab } from "@/components/ui/Fab";
import { shouldHideBottomChrome } from "@/components/appChromeVisibility";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const shouldHideNav = shouldHideBottomChrome(pathname);
  const items = [
    { key: "dashboard", label: "COMMAND", href: "/dashboard", icon: <LayoutDashboard className="h-6 w-6" /> },
    { key: "friends", label: "CONNECT", href: "/friends", icon: <Link className="h-6 w-6" /> },
    { key: "schedule", label: "Schedule", href: "/schedule", icon: <Calendar className="h-6 w-6" /> },
    { key: "source", label: "Source", href: "/source", icon: <Blocks className="h-6 w-6" /> },
  ];

  if (shouldHideNav) {
    return null;
  }

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]"
        data-bottom-nav
      >
        <div className="relative">
          <div data-bottom-nav-bar>
            <BottomBarNav
              items={items}
              currentPath={pathname}
              onNavigate={(href) => router.push(href)}
            />
          </div>
          <div
            className="pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 -translate-y-6"
            data-bottom-nav-fab-launcher
          >
            <Fab />
          </div>
        </div>
      </div>
      <style jsx>{`
        :global([data-bottom-nav] [data-tour="fab"]) {
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.65) !important;
          filter: none !important;
        }
        :global(body.fab-panel-active [data-bottom-nav-bar]),
        :global(body.fab-panel-active [data-bottom-nav] [data-tour="fab"]) {
          opacity: 0;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: no-preference) {
          :global(body.fab-panel-active [data-bottom-nav-bar]),
          :global(body.fab-panel-active [data-bottom-nav] [data-tour="fab"]) {
            transition: opacity 0.12s ease;
          }
        }
      `}</style>
    </>
  );
}
