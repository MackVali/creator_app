"use client";

import { useEffect } from "react";
import { syncIlavCheckInLocalNotifications } from "@/lib/notifications/ilavCheckinLocalNotifications";

export default function IlavCheckInScheduler() {
  useEffect(() => {
    void syncIlavCheckInLocalNotifications().catch((error) => {
      console.warn("[ILAV_CHECKINS] local notification sync failed", error);
    });
  }, []);

  return null;
}
