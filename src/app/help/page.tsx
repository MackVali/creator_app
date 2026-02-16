"use client";

import Link from "next/link";
import { useCallback } from "react";
import { dashboardTourSteps } from "@/lib/tours/dashboardTour";
import { useTour } from "@/components/tour/TourProvider";

export default function HelpPage() {
  const finishTour = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dashboardTourCompleted", "true");
    }
  }, []);

  const { start } = useTour(dashboardTourSteps, finishTour);

  const handleRestart = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dashboardTourCompleted", "false");
    }
    start();
  }, [start]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm uppercase tracking-[0.3em] text-white/60">
          Help & Guidance
        </p>
        <h1 className="text-3xl font-semibold text-white">Need a walkthrough?</h1>
        <p className="text-sm leading-relaxed text-white/70">
          The dashboard tour surfaces a guided overlay explaining the floating action button,
          skills navigation, and the rest of your productivity controls. Restart it anytime to
          reacquaint yourself with the priorities.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={handleRestart}
          className="rounded-full bg-white/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
        >
          Restart dashboard tour
        </button>
        <Link
          href="/dashboard"
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:border-white/40 hover:text-white"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
