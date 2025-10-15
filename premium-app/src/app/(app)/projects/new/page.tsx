"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";

export default function NewProjectPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Create New Project"
            description="Start a new project to achieve your goals"
          />
          <div className="text-center py-12">
            <p className="text-gray-400">
              Project creation form coming soon...
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
