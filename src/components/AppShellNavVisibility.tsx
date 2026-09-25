"use client";

import { usePathname } from "next/navigation";

import {
  isIndividualInboxThreadRoute,
  isScheduleRoute,
  shouldHideBottomChrome,
} from "@/components/appChromeVisibility";
import AppMain from "@/components/AppMain";
import DesktopShellNav from "@/components/DesktopShellNav";
import BottomNav from "@/components/BottomNav";
import CreatorXpBurstOverlay from "@/components/effects/CreatorXpBurstOverlay";
import { GlobalMyList } from "@/components/my-list/GlobalMyList";
import ScheduleTabContent from "@/app/(app)/schedule/ScheduleTabContent";
import TopNav from "@/components/TopNav";

const profileManagementRouteSegments = new Set(["edit", "linked-accounts"]);

function isProfileViewRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "profile") {
    return false;
  }

  if (segments.length === 1) {
    return true;
  }

  return !profileManagementRouteSegments.has(segments[1]);
}

export default function AppShellNavVisibility({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // /site/preview is rendered inside the Site Builder iframe.
  // It must behave like the public website itself, not like
  // another nested CREATOR application shell.
  if (pathname === "/site/preview") {
    return <>{children}</>;
  }

  const hideNav = isIndividualInboxThreadRoute(pathname);
  const hideTopNav = hideNav || isProfileViewRoute(pathname);
  const showBottomChrome = !hideNav && !shouldHideBottomChrome(pathname);
  const showGlobalMyList =
    showBottomChrome || (!hideNav && isScheduleRoute(pathname));
  const isMainSchedulePage = pathname === "/schedule";
  const enableScheduleTimelineDrag =
    pathname === "/schedule" || pathname === "/dashboard";

  return (
    <>
      {!hideNav && pathname !== "/schedule" && <DesktopShellNav />}

      {!hideTopNav && (
        <div className="lg:hidden">
          <TopNav />
        </div>
      )}

      <CreatorXpBurstOverlay />

      <AppMain>{children}</AppMain>

      {!hideNav && pathname === "/dashboard" ? (
        <aside
          data-dashboard-right-rail
          data-dashboard-schedule-rail-scroll
          className="fixed inset-y-0 right-0 z-30 hidden w-[360px] overflow-y-auto overscroll-contain border-l border-white/10 bg-[#070708] text-white shadow-[inset_1px_0_0_rgba(255,255,255,0.035)] lg:block"
        >
          <ScheduleTabContent presentation="dashboard-rail" />
        </aside>
      ) : null}

      {showBottomChrome && (
        <div className="lg:hidden">
          <BottomNav />
        </div>
      )}

      {showGlobalMyList && (
        <div className="lg:hidden">
          <GlobalMyList
            useFullExpandedHeight={!isMainSchedulePage}
            enableScheduleTimelineDrag={enableScheduleTimelineDrag}
          />
        </div>
      )}
    </>
  );
}
