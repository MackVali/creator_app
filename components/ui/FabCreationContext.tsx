"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LazyFab } from "@/components/ui/LazyFab";
import type { FabEditTarget } from "@/components/ui/Fab";

export type FabCreationOriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type FabCreationRequest = {
  id: number;
  type: "GOAL" | "PROJECT" | "TASK" | "HABIT";
  goalId?: string | null;
  campaignId?: string | null;
  projectId?: string | null;
  routineId?: string | null;
  skillId?: string | null;
  originRect?: FabCreationOriginRect | null;
};

type FabCreationContextValue = {
  creationRequest: FabCreationRequest | null;
  editRequest: FabEditTarget | null;
  requestGoalCreation: (
    originRect?: FabCreationOriginRect | null,
    campaignId?: string | null
  ) => void;
  requestProjectCreation: (
    goalId?: string | null,
    originRect?: FabCreationOriginRect | null
  ) => void;
  requestTaskCreation: (
    projectId?: string | null,
    goalId?: string | null,
    originRect?: FabCreationOriginRect | null
  ) => void;
  requestHabitCreation: (
    originRect?: FabCreationOriginRect | null,
    defaults?: {
      routineId?: string | null;
      skillId?: string | null;
    } | null
  ) => void;
  requestEntityEdit: (target: FabEditTarget) => void;
};

const FabCreationContext = createContext<FabCreationContextValue | null>(null);

export function FabCreationProvider({ children }: { children: ReactNode }) {
  const [creationRequest, setCreationRequest] =
    useState<FabCreationRequest | null>(null);
  const [editRequest, setEditRequest] = useState<FabEditTarget | null>(null);
  const nextRequestIdRef = useRef(0);

  const requestGoalCreation = useCallback(
    (
      originRect?: FabCreationOriginRect | null,
      campaignId?: string | null
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "GOAL",
        goalId: null,
        campaignId: campaignId ?? null,
        originRect: originRect ?? null,
      });
    },
    []
  );

  const requestProjectCreation = useCallback((goalId?: string | null, originRect?: FabCreationOriginRect | null) => {
    nextRequestIdRef.current += 1;
    setCreationRequest({
      id: nextRequestIdRef.current,
      type: "PROJECT",
      goalId: goalId ?? null,
      originRect: originRect ?? null,
    });
  }, []);

  const requestTaskCreation = useCallback(
    (
      projectId?: string | null,
      goalId?: string | null,
      originRect?: FabCreationOriginRect | null
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "TASK",
        goalId: goalId ?? null,
        projectId: projectId ?? null,
        originRect: originRect ?? null,
      });
    },
    []
  );

  const requestHabitCreation = useCallback(
    (
      originRect?: FabCreationOriginRect | null,
      defaults?: {
        routineId?: string | null;
        skillId?: string | null;
      } | null
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "HABIT",
        routineId: defaults?.routineId ?? null,
        skillId: defaults?.skillId ?? null,
        originRect: originRect ?? null,
      });
    },
    []
  );

  const requestEntityEdit = useCallback((target: FabEditTarget) => {
    setEditRequest({ ...target });
  }, []);

  const clearEditRequest = useCallback(() => {
    setEditRequest(null);
  }, []);

  const value = useMemo(
    () => ({
      creationRequest,
      editRequest,
      requestGoalCreation,
      requestProjectCreation,
      requestTaskCreation,
      requestHabitCreation,
      requestEntityEdit,
    }),
    [
      creationRequest,
      editRequest,
      requestGoalCreation,
      requestProjectCreation,
      requestTaskCreation,
      requestHabitCreation,
      requestEntityEdit,
    ],
  );

  return (
    <FabCreationContext.Provider value={value}>
      {children}
      <LazyFab
        creationRequest={creationRequest}
        editTarget={editRequest}
        onEditClose={clearEditRequest}
        onEditSaved={clearEditRequest}
        hideLauncher
        portalToBody
        prewarm
      />
    </FabCreationContext.Provider>
  );
}

export function useFabCreation() {
  return useContext(FabCreationContext);
}
