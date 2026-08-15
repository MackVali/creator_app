"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  FOCUS_GATE_STATUS_CHANGED_EVENT,
  FOCUS_GATE_STATUS_QUERY_ROOT,
  fetchFocusGateStatus,
  getFocusGateStatusQueryKey,
  notifyFocusGateStatusChanged,
} from "@/lib/focus-gate/client";
import {
  getFocusGateNativeAvailability,
  syncFocusGateAllowance,
} from "@/lib/focus-gate/focusGateNative";

function logFocusGateDebug(
  message: string,
  details?: Record<string, unknown>
) {
  if (process.env.NODE_ENV === "production") return;
  console.debug("[FocusGate]", message, details ?? {});
}

function isXpMutation(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "POST") return false;

  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const url = new URL(rawUrl, window.location.origin);
    return (
      url.origin === window.location.origin &&
      (url.pathname === "/api/xp/award" || url.pathname === "/api/xp/reverse")
    );
  } catch {
    return false;
  }
}

export function FocusGateXpRefreshBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const syncNativeAllowance = async () => {
      const availability = getFocusGateNativeAvailability();
      if (!availability.canUse) {
        logFocusGateDebug("native syncAllowance skipped", {
          platform: availability.platform,
          isNative: availability.isNative,
          isIos: availability.isIos,
          pluginAvailable: availability.pluginAvailable,
        });
        return;
      }

      logFocusGateDebug("Focus Gate GET started");
      const status = await fetchFocusGateStatus();
      logFocusGateDebug("Focus Gate GET completed", {
        xpToday: status.xpToday,
        allowedMinutes: status.allowedMinutes,
      });
      queryClient.setQueryData(getFocusGateStatusQueryKey(), status);
      logFocusGateDebug("native syncAllowance invoked", {
        enabled: status.enabled,
        xpToday: status.xpToday,
        allowedMinutes: status.allowedMinutes,
      });
      const result = await syncFocusGateAllowance({
        enabled: status.enabled,
        xpToday: status.xpToday,
        allowedMinutes: status.allowedMinutes,
        creatorDayStartsAt: status.creatorDay.startsAt,
        creatorDayEndsAt: status.creatorDay.endsAt,
        timezone: status.creatorDay.timezone,
      });
      logFocusGateDebug("native syncAllowance result", result);
    };

    const invalidate = () => {
      logFocusGateDebug("XP refresh event received");
      void queryClient.invalidateQueries({
        queryKey: FOCUS_GATE_STATUS_QUERY_ROOT,
      });
      void syncNativeAllowance().catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Unable to sync native Focus Gate allowance", error);
        }
      });
    };
    window.addEventListener(FOCUS_GATE_STATUS_CHANGED_EVENT, invalidate);
    window.addEventListener("creator:app-active", invalidate);
    invalidate();
    return () => {
      window.removeEventListener(FOCUS_GATE_STATUS_CHANGED_EVENT, invalidate);
      window.removeEventListener("creator:app-active", invalidate);
    };
  }, [queryClient]);

  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (input, init) => {
      const shouldNotify = isXpMutation(input, init);
      const response = await originalFetch(input, init);
      if (shouldNotify && response.ok) {
        logFocusGateDebug("XP mutation completed; dispatching Focus Gate refresh");
        notifyFocusGateStatusChanged();
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
