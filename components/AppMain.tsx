"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  shouldHideBottomChrome,
  shouldUseFocusedEditorSpacing,
} from "@/components/appChromeVisibility";
import MainTabSwipeNavigator from "@/components/MainTabSwipeNavigator";

export default function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldHideBottomNav = shouldHideBottomChrome(pathname);
  const isFocusedEditor = shouldUseFocusedEditorSpacing(pathname);

  return (
    <main
      className={
        shouldHideBottomNav || isFocusedEditor
          ? "flex-1 pb-[env(safe-area-inset-bottom)]"
          : "flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
      }
    >
      <MainTabSwipeNavigator>{children}</MainTabSwipeNavigator>
    </main>
  );
}
