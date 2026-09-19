"use client";

import * as React from "react";
import { syncIlavCheckInLocalNotifications } from "@/lib/notifications/ilavCheckInLocalNotifications";

function getTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

export default function IlavCheckInNotificationSync() {
  React.useEffect(() => {
    void syncIlavCheckInLocalNotifications({
      deviceTimezone: getTimeZone(),
    });
  }, []);

  return null;
}

