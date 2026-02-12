"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiresPlus?: boolean;
}

export function ProtectedRoute({
  children,
  requiresPlus = false,
}: ProtectedRouteProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { isPlus, isReady } = useEntitlement();

  useEffect(() => {
    if (!user) {
      router.push("/auth");
    }
  }, [user, router]);

  useEffect(() => {
    if (!requiresPlus || !user || !isReady || isPlus) {
      return;
    }

    router.push("/settings?upgrade=1");
  }, [requiresPlus, user, isPlus, isReady, router]);

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
