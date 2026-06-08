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
  type: "GOAL" | "PROJECT" | "TASK";
  goalId?: string | null;
  projectId?: string | null;
  originRect?: FabCreationOriginRect | null;
};

type FabCreationContextValue = {
  creationRequest: FabCreationRequest | null;
  editRequest: FabEditTarget | null;
  requestGoalCreation: (originRect?: FabCreationOriginRect | null) => void;
  requestProjectCreation: (
    goalId?: string | null,
    originRect?: FabCreationOriginRect | null
  ) => void;
  requestTaskCreation: (
    projectId?: string | null,
    goalId?: string | null,
    originRect?: FabCreationOriginRect | null
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
    (originRect?: FabCreationOriginRect | null) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "GOAL",
        goalId: null,
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
      requestEntityEdit,
    }),
    [
      creationRequest,
      editRequest,
      requestGoalCreation,
      requestProjectCreation,
      requestTaskCreation,
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
