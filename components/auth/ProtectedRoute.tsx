"use client";

import { useAuth } from "./AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!session?.user) {
      router.push("/auth");
    }
  }, [isReady, session, router]);

  if (!isReady) {
    return null;
  }

  if (!session?.user) {
    return null;
  }

  return <>{children}</>;
}
