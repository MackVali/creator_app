"use client";

import { useAuth } from "./AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!session?.user) {
      router.push("/auth");
    }
  }, [session, router]);

  if (!session?.user) {
    return null;
  }

  return <>{children}</>;
}
