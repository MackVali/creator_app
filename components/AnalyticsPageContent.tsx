"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import PlusRoute from "@/components/auth/PlusRoute";
import { AnalyticsDashboardSkeleton } from "@/components/AnalyticsDashboardSkeleton";
import type { AnalyticsView } from "@/types/analytics";

const AnalyticsDashboard = dynamic(
  () => import("@/components/AnalyticsDashboard")
);

export default function AnalyticsPageContent() {
  const [activeView, setActiveView] = useState<AnalyticsView>("overview");

  return (
    <PlusRoute>
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-[calc(env(safe-area-inset-top)+0.25rem)] sm:px-6 sm:pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:px-8">
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
