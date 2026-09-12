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
  const hideNav = isIndividualInboxThreadRoute(pathname);
  const hideTopNav = hideNav || isProfileViewRoute(pathname);
  const showBottomChrome = !hideNav && !shouldHideBottomChrome(pathname);
  const showGlobalMyList =
    showBottomChrome ||
    (!hideNav && (isScheduleRoute(pathname) || pathname === "/dashboard"));
  const isMainSchedulePage = pathname === "/schedule";
  const enableScheduleTimelineDrag = pathname === "/schedule";

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

      {showBottomChrome && (
        <div className="lg:hidden">
          <BottomNav />
        </div>
      )}

      {showGlobalMyList && (
        <div className={pathname === "/dashboard" ? "" : "lg:hidden"}>
          <GlobalMyList
            useFullExpandedHeight={!isMainSchedulePage}
            enableScheduleTimelineDrag={enableScheduleTimelineDrag}
          />
        </div>
      )}
    </>
  );
}
