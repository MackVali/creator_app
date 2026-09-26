"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { MonumentCreationForm } from "@/components/monuments/MonumentCreationForm";
import { PaywallModal } from "@/components/billing/PaywallModal";

export default function AddMonumentPage() {
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const handleCreate = () => {
    router.push("/monuments");
    router.refresh();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <PageHeader
            title="Create Monument"
            icon={
              <span className="text-2xl" role="img" aria-label="Monument">
                🏛️
              </span>
            }
            description="Take a milestone from idea to reality and keep it connected to your story."
          >
            <Button asChild variant="outline" size="sm" className="border-black text-white">
              <Link href="/dashboard">BACK</Link>
            </Button>
          </PageHeader>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.85)] sm:p-8">
            <MonumentCreationForm
              onCreate={handleCreate}
              onLimitReached={() => setPaywallOpen(true)}
            />
          </div>
        </div>
      </div>

      <PaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        title="This Area already has 4 Monuments"
        description="Free includes up to 4 Monuments per Area. CREATOR Pro removes the Monument limit."
        featureList={[
          "Unlimited Monuments.",
          "Source, Analytics, and ILAV included.",
        ]}
        ctaLabel="Upgrade to CREATOR Pro"
        onCta={() => router.push("/settings/billing")}
        secondaryLabel="Maybe later"
        onSecondary={() => setPaywallOpen(false)}
      />
    </ProtectedRoute>
  );
}
