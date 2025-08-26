"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";

export default function NewHabitPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Create New Habit"
            description="Build a new habit to improve your life"
          />
          <div className="text-center py-12">
            <p className="text-gray-400">Habit creation form coming soon...</p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
