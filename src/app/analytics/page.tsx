"use client";

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import PlusRoute from "@/components/auth/PlusRoute";
import type { AnalyticsView } from "@/types/analytics";

// Lazy load the existing dashboard sections
const AnalyticsDashboard = dynamic(
  () => import("@/components/AnalyticsDashboard")
);

export default function AnalyticsPage() {
  const [activeView, setActiveView] = useState<AnalyticsView>("overview");

  return (
    <PlusRoute>
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-8">
          <Suspense
            fallback={
              <div className="py-10 text-center text-zinc-400">Loading...</div>
            }
          >
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
