"use client";

import { useEffect, useRef } from "react";
import { useProfileContext } from "@/components/ProfileProvider";

export default function SchedulerActivityHeartbeat() {
  const { userId } = useProfileContext();
  const didPingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (didPingRef.current === userId) return;

    didPingRef.current = userId;

    fetch("/api/scheduler/activity", {
      method: "POST",
      cache: "no-store",
    }).catch((err: unknown) => {
      console.warn("Scheduler activity heartbeat failed:", err);
    });
  }, [userId]);

  return null;
}
