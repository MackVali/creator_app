"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllWindows,
  fetchProjectsMap,
  fetchReadyTasks,
  type WindowLite,
} from "@/lib/scheduler/repo";
import type { ProjectLite, TaskLite } from "@/lib/scheduler/weight";

type SchedulerMetaResult = {
  tasks: TaskLite[];
  projectMap: Record<string, ProjectLite>;
  windows: WindowLite[];
};

type LoadStatus = "idle" | "loading" | "loaded" | "error";

type SchedulerMetaState = {
  tasks: TaskLite[];
  projects: ProjectLite[];
  projectMap: Record<string, ProjectLite>;
  windows: WindowLite[];
  windowMap: Record<string, WindowLite>;
  status: LoadStatus;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useSchedulerMeta(): SchedulerMetaState {
  const { data, isPending, isError, error, refetch } = useQuery<SchedulerMetaResult>({
    queryKey: ["scheduler", "meta"],
    queryFn: async () => {
      const [tasks, projectMap, windows] = await Promise.all([
        fetchReadyTasks(),
        fetchProjectsMap(),
        fetchAllWindows(),
      ]);

      return { tasks, projectMap, windows };
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    onError: err => {
      console.error("Failed to load scheduler context", err);
    },
  });

  const projects = useMemo(() => {
    if (!data?.projectMap) return [] as ProjectLite[];
    return Object.values(data.projectMap);
  }, [data?.projectMap]);

  const windowMap = useMemo(() => {
    if (!data?.windows) return {} as Record<string, WindowLite>;
    return data.windows.reduce<Record<string, WindowLite>>((map, window) => {
      map[window.id] = window;
      return map;
    }, {});
  }, [data?.windows]);

  const status: LoadStatus = isPending ? "loading" : data ? "loaded" : isError ? "error" : "idle";

  return {
    tasks: data?.tasks ?? [],
    projects,
    projectMap: data?.projectMap ?? {},
    windows: data?.windows ?? [],
    windowMap,
    status,
    error: error ? (error instanceof Error ? error.message : "Failed to load scheduler context") : null,
    refetch: async () => {
      await refetch();
    },
  };
}
