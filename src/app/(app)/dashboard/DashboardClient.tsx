"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTour } from "@/components/tour/TourProvider";
import { dashboardTourSteps } from "@/lib/tours/dashboardTour";
import { useHasExistingTimeBlocks } from "@/lib/hooks/useHasExistingTimeBlocks";
import {
  CREATOR_TOUR_RESTART_PENDING_KEY,
  DASHBOARD_TOUR_COMPLETED_KEY,
  clearCreatorTourPendingState,
  completeCreatorTourState,
} from "@/lib/tours/creatorTourState";
import CommandTabContent from "./CommandTabContent";

export default function DashboardClient() {
  const router = useRouter();
  const [tourTimeBlockQueryState, setTourTimeBlockQueryState] = useState({
    hasResolvedStorage: false,
    isEnabled: false,
    isManualRestart: false,
  });
  const { hasExistingTimeBlocks, isLoading: isLoadingExistingTimeBlocks } =
    useHasExistingTimeBlocks({ enabled: tourTimeBlockQueryState.isEnabled });
  const hasResolvedTourStorage = tourTimeBlockQueryState.hasResolvedStorage;
  const isManualTourRestart = tourTimeBlockQueryState.isManualRestart;
  const hasStartedTourRef = useRef(false);

  const finishTour = useCallback(() => {
    completeCreatorTourState("dashboard");
    router.push("/schedule");
  }, [router]);

  const { start } = useTour(dashboardTourSteps, finishTour);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isManualRestart =
      window.localStorage.getItem(CREATOR_TOUR_RESTART_PENDING_KEY) === "1";
    const isDashboardTourCompleted =
      window.localStorage.getItem(DASHBOARD_TOUR_COMPLETED_KEY) === "true";

    setTourTimeBlockQueryState({
      hasResolvedStorage: true,
      isEnabled: isManualRestart || !isDashboardTourCompleted,
      isManualRestart,
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasResolvedTourStorage) return;
    if (hasStartedTourRef.current) return;
    const isManualRestart = isManualTourRestart;
    if (isLoadingExistingTimeBlocks && !isManualRestart) return;

    if (hasExistingTimeBlocks && !isManualRestart) {
      completeCreatorTourState("dashboard");
      clearCreatorTourPendingState();
      return;
    }

    if (
      !isManualRestart &&
      window.localStorage.getItem(DASHBOARD_TOUR_COMPLETED_KEY) === "true"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      hasStartedTourRef.current = true;
      window.localStorage.removeItem(CREATOR_TOUR_RESTART_PENDING_KEY);
      start();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    hasExistingTimeBlocks,
    hasResolvedTourStorage,
    isLoadingExistingTimeBlocks,
    isManualTourRestart,
    start,
  ]);

  return <CommandTabContent />;
}
