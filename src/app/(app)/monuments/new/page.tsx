"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { MonumentCreationForm } from "@/components/monuments/MonumentCreationForm";

export default function AddMonumentPage() {
  const router = useRouter();
  const handleCreate = () => {
    router.push("/monuments");
    router.refresh();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#05070c] pb-16 text-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageHeader
            title={
              <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                Create a monument
              </span>
            }
            description="Take a milestone from idea to reality and keep it connected to your story."
          >
            <Button asChild variant="outline" size="sm" className="text-white border-black">
              <Link href="/dashboard">BACK</Link>
            </Button>
          </PageHeader>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.85)] sm:p-8">
            <MonumentCreationForm onCreate={handleCreate} />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
