"use client";

import { useAuth } from "./AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session?.user) {
      router.push("/auth");
    }
  }, [session, router, loading]);

  if (loading || !session?.user) {
    return null;
  }

  return <>{children}</>;
}
