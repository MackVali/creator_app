"use client";

import { Blocks, Calendar, LayoutDashboard, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import BottomBarNav from "./BottomBarNav";
import { LazyFab } from "@/components/ui/LazyFab";
import {
  isCircleDetailRoute,
  shouldHideBottomChrome,
} from "@/components/appChromeVisibility";
import { CLOSE_ACTIVE_COMMAND_CIRCLE_DETAIL_EVENT } from "@/components/command/events";
import { CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT } from "@/components/monuments/events";
import { CLOSE_ACTIVE_SKILL_DETAIL_EVENT } from "@/components/skills/events";
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
  connect: Users,
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

const bottomNavPrefetchHrefs = Array.from(
  new Set([...bottomNavItems.map((item) => item.href), "/", "/profile"])
);

function isMonumentDetailOverlayOpen() {
  return (
    typeof document !== "undefined" &&
    document.body.classList.contains("monument-detail-open")
  );
}

function isCommandCircleDetailOverlayOpen() {
  return (
    typeof document !== "undefined" &&
    document.body.classList.contains("command-circle-detail-open")
  );
}

function isSkillDetailOverlayOpen() {
  return (
    typeof document !== "undefined" &&
    document.body.classList.contains("skill-detail-open")
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const shouldHideNav = shouldHideBottomChrome(pathname);
  const isCircleDetail = isCircleDetailRoute(pathname);
  const currentBottomNavPath = isCircleDetail ? "/dashboard" : pathname;

  useEffect(() => {
    bottomNavPrefetchHrefs.forEach((href) => {
      router.prefetch(href);
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
      >
        <div className="relative">
          <div data-bottom-nav-bar>
            <BottomBarNav
              items={bottomNavItems}
              currentPath={currentBottomNavPath}
              shouldHandleActiveClick={(href) =>
                href === "/dashboard" &&
                (isCircleDetail ||
                  isMonumentDetailOverlayOpen() ||
                  isSkillDetailOverlayOpen() ||
                  isCommandCircleDetailOverlayOpen())
              }
              onNavigate={(href) => {
                const targetHref = href as MainTabRouteHref;
                const skillDetailOverlayOpen = isSkillDetailOverlayOpen();

                if (skillDetailOverlayOpen) {
                  window.dispatchEvent(
                    new CustomEvent(CLOSE_ACTIVE_SKILL_DETAIL_EVENT)
                  );

                  if (targetHref === "/dashboard") {
                    return;
                  }
                }

                if (
                  targetHref === "/dashboard" &&
                  isCommandCircleDetailOverlayOpen()
                ) {
                  window.dispatchEvent(
                    new CustomEvent(CLOSE_ACTIVE_COMMAND_CIRCLE_DETAIL_EVENT)
                  );
                  return;
                }

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
