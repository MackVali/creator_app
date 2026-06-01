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

export type FabCreationRequest = {
  id: number;
  type: "PROJECT";
  goalId?: string | null;
};

type FabCreationContextValue = {
  creationRequest: FabCreationRequest | null;
  requestProjectCreation: (goalId?: string | null) => void;
};

const FabCreationContext = createContext<FabCreationContextValue | null>(null);

export function FabCreationProvider({ children }: { children: ReactNode }) {
  const [creationRequest, setCreationRequest] =
    useState<FabCreationRequest | null>(null);
  const nextRequestIdRef = useRef(0);

  const requestProjectCreation = useCallback((goalId?: string | null) => {
    nextRequestIdRef.current += 1;
    setCreationRequest({
      id: nextRequestIdRef.current,
      type: "PROJECT",
      goalId: goalId ?? null,
    });
  }, []);

  const value = useMemo(
    () => ({
      creationRequest,
      requestProjectCreation,
    }),
    [creationRequest, requestProjectCreation],
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
