"use client";

import { Capacitor } from "@capacitor/core";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type EntitlementCore = {
  tier: string;
  is_active: boolean;
  isPlus: boolean;
};

type Entitlement = EntitlementCore & {
  isReady: boolean;
};

const defaultCore: EntitlementCore = {
  tier: "CREATOR",
  is_active: false,
  isPlus: false,
};

const defaultEntitlement: Entitlement = {
  ...defaultCore,
  isReady: false,
};

const EntitlementContext = createContext<Entitlement>(defaultEntitlement);
export const useEntitlement = () => useContext(EntitlementContext);

function normalizeEntitlement(payload?: {
  tier?: string;
  is_active?: boolean;
}) {
  const rawTier = payload?.tier ?? defaultCore.tier;
  const tier = rawTier.trim().toUpperCase();
  const is_active = payload?.is_active ?? defaultCore.is_active;
  const isPlus = is_active && (tier === "CREATOR PLUS" || tier === "ADMIN");

  return { tier, is_active, isPlus };
}

export default function EntitlementProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [entitlement, setEntitlement] = useState(defaultCore);
  const [isReady, setIsReady] = useState(!user);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setEntitlement(defaultCore);
      setIsReady(true);
      return;
    }

    setIsReady(false);

    const fetchEntitlement = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          try {
            await fetch(`/api/me/entitlement/sync`, { method: "POST" });
          } catch {
            // ignore sync errors
          }
        }

        const response = await fetch(`/api/me/entitlement`, { cache: "no-store" });
        if (!response.ok || cancelled) {
          if (!cancelled) {
            setEntitlement(defaultCore);
            setIsReady(true);
          }
          return;
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setEntitlement(normalizeEntitlement(data));
        setIsReady(true);
      } catch {
        if (!cancelled) {
          setEntitlement(defaultCore);
          setIsReady(true);
        }
      }
    };

    void fetchEntitlement();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo(
    () => ({ ...entitlement, isReady }),
    [entitlement, isReady]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}
