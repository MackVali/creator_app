"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { FocusGateSettings, FocusGateStatus } from "./types";

export const FOCUS_GATE_STATUS_QUERY_ROOT = ["focus-gate", "status"] as const;
export const FOCUS_GATE_STATUS_CHANGED_EVENT = "creator:focus-gate-status-changed";

export function getFocusGateDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getFocusGateStatusQueryKey(
  deviceTimezone = getFocusGateDeviceTimezone()
) {
  return [...FOCUS_GATE_STATUS_QUERY_ROOT, deviceTimezone] as const;
}

export async function fetchFocusGateStatus({
  deviceTimezone,
  signal,
}: {
  deviceTimezone?: string;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    device_timezone: deviceTimezone ?? getFocusGateDeviceTimezone(),
  });
  const response = await fetch(`/api/focus-gate?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | FocusGateStatus
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : "Unable to load Focus Gate."
    );
  }

  return payload as FocusGateStatus;
}

export async function updateFocusGateSettings(
  settings: Partial<FocusGateSettings>
) {
  const params = new URLSearchParams({
    device_timezone: getFocusGateDeviceTimezone(),
  });
  const response = await fetch(`/api/focus-gate?${params.toString()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(settings),
  });
  const payload = (await response.json().catch(() => null)) as
    | FocusGateStatus
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : "Unable to update Focus Gate."
    );
  }

  return payload as FocusGateStatus;
}

export function notifyFocusGateStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FOCUS_GATE_STATUS_CHANGED_EVENT));
}

export function useFocusGateStatus({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const deviceTimezone = useMemo(() => getFocusGateDeviceTimezone(), []);
  const queryKey = useMemo(
    () => getFocusGateStatusQueryKey(deviceTimezone),
    [deviceTimezone]
  );
  const query = useQuery<FocusGateStatus>({
    queryKey,
    queryFn: ({ signal }) => fetchFocusGateStatus({ deviceTimezone, signal }),
    enabled,
    staleTime: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: FOCUS_GATE_STATUS_QUERY_ROOT });
  }, [queryClient]);

  return {
    status: query.data ?? null,
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data),
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : "Unable to load Focus Gate."
      : null,
    refetch: query.refetch,
    invalidate,
  };
}

export function useFocusGateXpRefreshListener() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: FOCUS_GATE_STATUS_QUERY_ROOT });
  }, [queryClient]);
}
