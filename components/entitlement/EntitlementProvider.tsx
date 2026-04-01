"use client";

import { Capacitor } from "@capacitor/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type EntitlementCore = {
  tier: string;
  is_active: boolean;
  isPlus: boolean;
  current_period_end: string | null;
};

type Entitlement = EntitlementCore & {
  isReady: boolean;
  refreshEntitlement: () => Promise<void>;
};

const defaultCore: EntitlementCore = {
  tier: "CREATOR",
  is_active: false,
  isPlus: false,
  current_period_end: null,
};

const defaultEntitlement: Entitlement = {
  ...defaultCore,
  isReady: false,
};

const EntitlementContext = createContext<Entitlement>({
  ...defaultEntitlement,
  refreshEntitlement: async () => {},
});
export const useEntitlement = () => useContext(EntitlementContext);

function normalizeEntitlement(payload?: {
  tier?: string;
  is_active?: boolean;
  current_period_end?: string | null;
}) {
  const rawTier = payload?.tier ?? defaultCore.tier;
  const tier = rawTier.trim().toUpperCase();
  const is_active = payload?.is_active ?? defaultCore.is_active;
  const isPlus = is_active && (tier === "CREATOR PLUS" || tier === "ADMIN");
  const current_period_end = payload?.current_period_end ?? defaultCore.current_period_end;

  return { tier, is_active, isPlus, current_period_end };
}

export default function EntitlementProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [entitlement, setEntitlement] = useState(defaultCore);
  const [isReady, setIsReady] = useState(!user);
  const cancelRef = useRef(false);

  const refreshEntitlement = useCallback(async () => {
    cancelRef.current = false;

    if (!user) {
      setEntitlement(defaultCore);
      setIsReady(true);
      return;
    }

    setIsReady(false);

    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await fetch(`/api/me/entitlement/sync`, { method: "POST" });
        } catch {
          // ignore sync errors
        }
      }

      const response = await fetch(`/api/me/entitlement`, { cache: "no-store" });
      if (!response.ok || cancelRef.current) {
        if (!cancelRef.current) {
          setEntitlement(defaultCore);
          setIsReady(true);
        }
        return;
      }

      const data = await response.json();
      if (cancelRef.current) {
        return;
      }

      setEntitlement(normalizeEntitlement(data));
      setIsReady(true);
    } catch {
      if (!cancelRef.current) {
        setEntitlement(defaultCore);
        setIsReady(true);
      }
    }
  }, [user]);

  useEffect(() => {
    cancelRef.current = false;

    if (!user) {
      setEntitlement(defaultCore);
      setIsReady(true);
      return () => {
        cancelRef.current = true;
      };
    }

    void refreshEntitlement();

    return () => {
      cancelRef.current = true;
    };
  }, [refreshEntitlement, user]);

  const value = useMemo(
    () => ({ ...entitlement, isReady, refreshEntitlement }),
    [entitlement, isReady, refreshEntitlement]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}
