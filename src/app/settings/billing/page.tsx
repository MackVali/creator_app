import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BillingPageClient from "./BillingPageClient";

export const metadata = {
  title: "Billing",
};

export default function BillingPage() {
  return (
    <div className="min-h-screen bg-[#02050a] text-white">
      <div className="safe-page-y mx-auto flex w-full max-w-5xl flex-col px-5 sm:px-6 lg:px-8">
        <div className="relative flex h-10 items-center sm:h-11">
          <Link
            href="/settings"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.025] px-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.05] hover:text-white sm:h-9 sm:px-3 sm:text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
            Back
          </Link>
          <h1 className="sr-only">Billing</h1>
        </div>
        <div className="mt-8 w-full sm:mt-11">
          <BillingPageClient />
        </div>
      </div>
    </div>
  );
}
