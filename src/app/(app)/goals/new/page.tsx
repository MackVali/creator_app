"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";

export default function NewGoalPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#1E1E1E] text-[#E0E0E0]">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Create New Goal"
            description="Set a new goal to work towards"
          />
          <div className="text-center py-12">
            <p className="text-[#A0A0A0]">Goal creation form coming soon...</p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
