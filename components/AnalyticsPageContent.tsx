"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import PlusRoute from "@/components/auth/PlusRoute";
import { AnalyticsDashboardSkeleton } from "@/components/AnalyticsDashboardSkeleton";
import type { AnalyticsView } from "@/types/analytics";

const AnalyticsDashboard = dynamic(
  () => import("@/components/AnalyticsDashboard")
);

function classNames(
  ...classes: (string | boolean | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}

export default function AnalyticsPageContent({
  compactTopSpacing = false,
}: {
  compactTopSpacing?: boolean;
}) {
  const [activeView, setActiveView] = useState<AnalyticsView>("overview");

  return (
    <PlusRoute>
      <div className="relative">
        <div
          className={classNames(
            "mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8",
            compactTopSpacing
              ? "pt-1 sm:pt-2"
              : "pt-[calc(env(safe-area-inset-top)+0.25rem)] sm:pt-[calc(env(safe-area-inset-top)+0.5rem)]"
          )}
        >
          <Suspense fallback={<AnalyticsDashboardSkeleton includeHeader />}>
            <AnalyticsDashboard
              activeView={activeView}
              onViewChange={setActiveView}
            />
          </Suspense>
        </div>
      </div>
    </PlusRoute>
  );
}
