"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";
import { BloomingHexagonLoader } from "@/components/loading/BloomingHexagonLoader";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiresPlus?: boolean;
}

export function ProtectedRoute({
  children,
  requiresPlus = false,
}: ProtectedRouteProps) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const { isPlus, isReady } = useEntitlement();

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user) {
      router.push("/auth");
    }
  }, [ready, user, router]);

  useEffect(() => {
    if (!ready || !requiresPlus || !user || !isReady || isPlus) {
      return;
    }

    router.push("/settings?upgrade=1");
  }, [ready, requiresPlus, user, isPlus, isReady, router]);

  if (!ready || !user) {
    return <BloomingHexagonLoader statusText="Syncing your system" />;
  }

  return <>{children}</>;
}
