"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader, ProjectList } from "@/components/ui";

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Projects"
            description="Manage your projects and track progress"
          />
          <ProjectList />
        </div>
      </div>
    </ProtectedRoute>
  );
}
