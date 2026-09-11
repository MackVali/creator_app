"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";

import {
  FOCUS_GATE_STATUS_CHANGED_EVENT,
  FOCUS_GATE_STATUS_QUERY_ROOT,
  fetchFocusGateStatus,
  getFocusGateStatusQueryKey,
  notifyFocusGateStatusChanged,
} from "@/lib/focus-gate/client";
import {
  getFocusGateAuthorizationStatus,
  getFocusGateNativeAvailability,
  requestFocusGateAuthorization,
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

const FOCUS_GATE_SYNC_RETRY_DELAYS_MS = [0, 300, 1000, 2500] as const;

function shouldRetryNativeAvailability(
  availability: ReturnType<typeof getFocusGateNativeAvailability>
) {
  return (
    availability.isBrowser &&
    availability.isNative &&
    availability.isIos &&
    !availability.pluginAvailable
  );
}

export function FocusGateXpRefreshBridge() {
  const queryClient = useQueryClient();
  const { ready: authReady, user } = useAuth();
  const userId = user?.id ?? null;
  const inFlightRef = useRef(false);
  const rerunRequestedRef = useRef(false);
  const retryTimersRef = useRef<ReturnType<typeof window.setTimeout>[]>([]);

  useEffect(() => {
    if (!authReady || !userId) {
      return;
    }
    let cancelled = false;

    const clearRetryTimers = () => {
      for (const timer of retryTimersRef.current) {
        window.clearTimeout(timer);
      }
      retryTimersRef.current = [];
    };

    const runSyncAttempt = async () => {
      const availability = getFocusGateNativeAvailability();
      if (!availability.canUse) {
        logFocusGateDebug("native syncAllowance skipped", {
          platform: availability.platform,
          isNative: availability.isNative,
          isIos: availability.isIos,
          pluginAvailable: availability.pluginAvailable,
        });
        return shouldRetryNativeAvailability(availability) ? "retry" : "done";
      }

      logFocusGateDebug("Focus Gate GET started");
      const status = await fetchFocusGateStatus();
      logFocusGateDebug("Focus Gate GET completed", {
        xpToday: status.xpToday,
        baselineAllowedMinutes: status.baselineAllowedMinutes,
        allowedMinutes: status.allowedMinutes,
      });

      if (status.enabled) {
        const authorization = await getFocusGateAuthorizationStatus();

        if (authorization.status === "notDetermined") {
          logFocusGateDebug(
            "refreshing Family Controls authorization before native sync"
          );
          await requestFocusGateAuthorization();
        }
      }

      queryClient.setQueryData(getFocusGateStatusQueryKey(), status);
      logFocusGateDebug("native syncAllowance invoked", {
        enabled: status.enabled,
        xpToday: status.xpToday,
        baselineAllowedMinutes: status.baselineAllowedMinutes,
        allowedMinutes: status.allowedMinutes,
      });
      const result = await syncFocusGateAllowance({
        enabled: status.enabled,
        xpToday: status.xpToday,
        baselineAllowedMinutes: status.baselineAllowedMinutes,
        allowedMinutes: status.allowedMinutes,
        creatorDayStartsAt: status.creatorDay.startsAt,
        creatorDayEndsAt: status.creatorDay.endsAt,
        timezone: status.creatorDay.timezone,
      });
      logFocusGateDebug("native syncAllowance result", result);
      return "done";
    };

    const syncNativeAllowance = async (attemptIndex = 0): Promise<void> => {
      if (cancelled) return;

      if (inFlightRef.current) {
        rerunRequestedRef.current = true;
        return;
      }

      inFlightRef.current = true;
      try {
        const result = await runSyncAttempt();
        if (
          result === "retry" &&
          attemptIndex + 1 < FOCUS_GATE_SYNC_RETRY_DELAYS_MS.length
        ) {
          const nextAttemptIndex = attemptIndex + 1;
          const retryDelay = FOCUS_GATE_SYNC_RETRY_DELAYS_MS[nextAttemptIndex];
          logFocusGateDebug("native syncAllowance retry scheduled", {
            attempt: nextAttemptIndex,
            retryDelay,
          });
          const timer = window.setTimeout(() => {
            if (cancelled) return;
            retryTimersRef.current = retryTimersRef.current.filter(
              (current) => current !== timer
            );
            void syncNativeAllowance(nextAttemptIndex).catch((error) => {
              if (process.env.NODE_ENV !== "production") {
                console.warn("Unable to sync native Focus Gate allowance", error);
              }
            });
          }, retryDelay);
          retryTimersRef.current.push(timer);
        }
      } catch (error) {
        if (attemptIndex + 1 >= FOCUS_GATE_SYNC_RETRY_DELAYS_MS.length) {
          throw error;
        }

        const nextAttemptIndex = attemptIndex + 1;
        const retryDelay = FOCUS_GATE_SYNC_RETRY_DELAYS_MS[nextAttemptIndex];
        logFocusGateDebug("native syncAllowance failure retry scheduled", {
          attempt: nextAttemptIndex,
          retryDelay,
          error,
        });
        const timer = window.setTimeout(() => {
          if (cancelled) return;
          retryTimersRef.current = retryTimersRef.current.filter(
            (current) => current !== timer
          );
          void syncNativeAllowance(nextAttemptIndex).catch((retryError) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn("Unable to sync native Focus Gate allowance", retryError);
            }
          });
        }, retryDelay);
        retryTimersRef.current.push(timer);
      } finally {
        inFlightRef.current = false;
        if (!cancelled && rerunRequestedRef.current) {
          rerunRequestedRef.current = false;
          await syncNativeAllowance(0);
        }
      }
    };

    const invalidate = () => {
      logFocusGateDebug("XP refresh event received");
      clearRetryTimers();
      void queryClient.invalidateQueries({
        queryKey: FOCUS_GATE_STATUS_QUERY_ROOT,
      });
      void syncNativeAllowance().catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Unable to sync native Focus Gate allowance", error);
        }
      });
    };
    const invalidateWhenVisible = () => {
      if (document.visibilityState === "visible") {
        invalidate();
      }
    };
    window.addEventListener(FOCUS_GATE_STATUS_CHANGED_EVENT, invalidate);
    window.addEventListener("creator:app-active", invalidate);
    window.addEventListener("pageshow", invalidate);
    document.addEventListener("visibilitychange", invalidateWhenVisible);
    invalidate();
    return () => {
      cancelled = true;
      clearRetryTimers();
      window.removeEventListener(FOCUS_GATE_STATUS_CHANGED_EVENT, invalidate);
      window.removeEventListener("creator:app-active", invalidate);
      window.removeEventListener("pageshow", invalidate);
      document.removeEventListener("visibilitychange", invalidateWhenVisible);
    };
  }, [authReady, queryClient, userId]);

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
