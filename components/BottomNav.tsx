"use client";

import { Blocks, Calendar, LayoutDashboard, Link } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useEffect, useState, useTransition } from "react";
import BottomBarNav from "./BottomBarNav";
import { LazyFab } from "@/components/ui/LazyFab";
import { shouldHideBottomChrome } from "@/components/appChromeVisibility";
import { CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT } from "@/components/monuments/events";
import {
  MAIN_TAB_ROUTES,
  isPersistentMainTabRoute,
  navigateMainTabRoute,
  type MainTabRouteKey,
  type MainTabRouteHref,
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

function isMonumentDetailOverlayOpen() {
  return (
    typeof document !== "undefined" &&
    document.body.classList.contains("monument-detail-open")
  );
}

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
        className={`pointer-events-none fixed inset-x-0 z-50 px-3 pb-0 ${
          isIos
            ? "bottom-[max(0.125rem,calc(env(safe-area-inset-bottom,0px)-1.25rem))]"
            : "bottom-0"
        }`}
        data-bottom-nav
        aria-busy={isPending}
      >
        <div className="relative">
          <div data-bottom-nav-bar>
            <BottomBarNav
              items={bottomNavItems}
              currentPath={pathname}
              shouldHandleActiveClick={(href) =>
                href === "/dashboard" && isMonumentDetailOverlayOpen()
              }
              onNavigate={(href) => {
                startTransition(() => {
                  const targetHref = href as MainTabRouteHref;

                  if (targetHref === "/dashboard" && isMonumentDetailOverlayOpen()) {
                    window.dispatchEvent(
                      new CustomEvent(CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT)
                    );
                    return;
                  }

                  if (targetHref === "/dashboard" && !isPersistentMainTabRoute(pathname)) {
                    router.replace(targetHref);
                    return;
                  }

                  navigateMainTabRoute(targetHref, router.push);
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
