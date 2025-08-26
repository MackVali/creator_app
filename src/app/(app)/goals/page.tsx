"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { GoalList } from "@/components/ui/GoalList";

export default function GoalsPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Goals"
            description="Track and manage your personal goals"
          />
          <GoalList />
        </div>
      </div>
    </ProtectedRoute>
  );
}
