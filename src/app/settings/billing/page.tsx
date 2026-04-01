import Link from "next/link";

import { Button } from "@/components/ui/button";
import BillingPageClient from "./BillingPageClient";

export const metadata = {
  title: "Billing",
};

export default function BillingPage() {
  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-200">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
        <div>
          <Button asChild variant="ghost" className="text-zinc-300 hover:text-zinc-100">
            <Link href="/dashboard">← Back to dashboard</Link>
          </Button>
        </div>
        <BillingPageClient />
      </main>
    </div>
  );
}
