"use client";

import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";

export default function EditProjectPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Edit Project"
            description="Update your project details"
          />
          <div className="text-center py-12">
            <p className="text-gray-400">
              Editing form for project {id} coming soon...
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

