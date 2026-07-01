"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

import { MatrixContent } from "./MatrixContent";

export default function MatrixPage() {
  return (
    <ProtectedRoute>
      <MatrixContent />
    </ProtectedRoute>
  );
}
