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

export type FabCreationOriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type FabCreationRequest = {
  id: number;
  type: "GOAL" | "PROJECT";
  goalId?: string | null;
  originRect?: FabCreationOriginRect | null;
};

type FabCreationContextValue = {
  creationRequest: FabCreationRequest | null;
  requestGoalCreation: (originRect?: FabCreationOriginRect | null) => void;
  requestProjectCreation: (
    goalId?: string | null,
    originRect?: FabCreationOriginRect | null
  ) => void;
};

const FabCreationContext = createContext<FabCreationContextValue | null>(null);

export function FabCreationProvider({ children }: { children: ReactNode }) {
  const [creationRequest, setCreationRequest] =
    useState<FabCreationRequest | null>(null);
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

  const value = useMemo(
    () => ({
      creationRequest,
      requestGoalCreation,
      requestProjectCreation,
    }),
    [creationRequest, requestGoalCreation, requestProjectCreation],
  );

  return (
    <FabCreationContext.Provider value={value}>
      {children}
      <LazyFab
        creationRequest={creationRequest}
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
