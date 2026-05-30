"use client";

import { Blocks, Calendar, LayoutDashboard, Link } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useEffect, useState, useTransition } from "react";
import BottomBarNav from "./BottomBarNav";
import { LazyFab } from "@/components/ui/LazyFab";
import { shouldHideBottomChrome } from "@/components/appChromeVisibility";
import {
  MAIN_TAB_ROUTES,
  type MainTabRouteKey,
} from "@/app/(routes)/navigation";

const bottomNavIconComponents: Record<
  MainTabRouteKey,
  ComponentType<{ className?: string }>
> = {
  command: LayoutDashboard,
  connect: Link,
  schedule: Calendar,
  source: Blocks,
};

const bottomNavItems = MAIN_TAB_ROUTES.map((item) => {
  const Icon = bottomNavIconComponents[item.key];

  return {
    key: item.key,
    label: item.label,
    href: item.href,
    icon: <Icon className="h-6 w-6" />,
  };
});

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const shouldHideNav = shouldHideBottomChrome(pathname);

  useEffect(() => {
    bottomNavItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [router]);

  const [isIos, setIsIos] = useState(false);
  useEffect(() => {
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isIosUa = /iPhone|iPad|iPod/.test(ua);
    setIsIos(isIosUa);
  }, []);

  if (shouldHideNav) {
    return null;
  }

  return (
    <>
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-0 ${isIos ? "transform translate-y-1" : ""}`}
        data-bottom-nav
        aria-busy={isPending}
      >
        <div className="relative">
          <div data-bottom-nav-bar>
            <BottomBarNav
              items={bottomNavItems}
              currentPath={pathname}
              onNavigate={(href) => {
                startTransition(() => {
                  router.push(href);
                });
              }}
              onPrefetch={(href) => router.prefetch(href)}
            />
          </div>
          <div
            className={`pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 ${isIos ? "-translate-y-7" : "-translate-y-6"}`}
            data-bottom-nav-fab-launcher
          >
            <LazyFab />
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
