"use client";

import { usePathname } from "next/navigation";

import AppMain from "@/components/AppMain";
import BottomNav from "@/components/BottomNav";
import TopNav from "@/components/TopNav";

const individualNoteRoutePattern =
  /^\/(?:monuments|skills)\/[^/]+\/notes\/[^/]+\/?$/;
const individualInboxThreadRoutePattern = /^\/inbox\/[^/]+\/?$/;

export default function AppShellNavVisibility({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideNav =
    individualNoteRoutePattern.test(pathname) ||
    individualInboxThreadRoutePattern.test(pathname);

  return (
    <>
      {!hideNav && <TopNav />}
      <AppMain>{children}</AppMain>
      {!hideNav && <BottomNav />}
    </>
  );
}
