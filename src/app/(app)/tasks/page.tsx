"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader, TaskList } from "@/components/ui";

export default function TasksPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Tasks"
            description="Manage your tasks and track completion"
          />
          <TaskList />
        </div>
      </div>
    </ProtectedRoute>
  );
}
