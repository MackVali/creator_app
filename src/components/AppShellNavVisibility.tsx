"use client";

import { usePathname } from "next/navigation";

import AppMain from "@/components/AppMain";
import BottomNav from "@/components/BottomNav";
import TopNav from "@/components/TopNav";

const individualNoteRoutePattern =
  /^\/(?:monuments|skills)\/[^/]+\/notes\/[^/]+\/?$/;
const individualInboxThreadRoutePattern = /^\/inbox\/[^/]+\/?$/;
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
  const hideNav =
    individualNoteRoutePattern.test(pathname) ||
    individualInboxThreadRoutePattern.test(pathname);
  const hideTopNav = hideNav || isProfileViewRoute(pathname);

  return (
    <>
      {!hideTopNav && <TopNav />}
      <AppMain>{children}</AppMain>
      {!hideNav && <BottomNav />}
    </>
  );
}
