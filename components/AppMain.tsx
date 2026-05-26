"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { shouldUseFocusedEditorSpacing } from "@/components/appChromeVisibility";

export default function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFocusedEditor = shouldUseFocusedEditorSpacing(pathname);

  return (
    <main
      className={
        isFocusedEditor
          ? "flex-1 pb-[env(safe-area-inset-bottom)]"
          : "flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]"
      }
    >
      {children}
    </main>
  );
}
