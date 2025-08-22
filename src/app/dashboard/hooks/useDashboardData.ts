"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardData } from "@/types/dashboard";

export interface UseDashboardDataReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(): UseDashboardDataReturn {
  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });

  return {
    data: data || null,
    loading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Failed to fetch dashboard data"
      : null,
    refetch: async () => {
      await refetch();
    },
  };
}
