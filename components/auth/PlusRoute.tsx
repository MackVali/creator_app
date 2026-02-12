"use client";

import { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function PlusRoute({
  children,
}: {
  children: ReactNode;
}) {
  return <ProtectedRoute requiresPlus>{children}</ProtectedRoute>;
}
