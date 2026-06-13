"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  shouldHideBottomChrome,
  shouldUseFocusedEditorSpacing,
  shouldUseCompactTopSpacing,
} from "@/components/appChromeVisibility";
import MainTabSwipeNavigator from "@/components/MainTabSwipeNavigator";

export default function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldHideBottomNav = shouldHideBottomChrome(pathname);
  const isFocusedEditor = shouldUseFocusedEditorSpacing(pathname);
  const isCompactTop = shouldUseCompactTopSpacing(pathname);

  return (
    <main
      className={`app-bg flex-1 ${
        shouldHideBottomNav || isFocusedEditor
          ? "pb-[env(safe-area-inset-bottom)]"
          : "pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
      } ${isCompactTop ? "pt-0" : ""}`}
    >
      <MainTabSwipeNavigator>{children}</MainTabSwipeNavigator>
    </main>
  );
}
