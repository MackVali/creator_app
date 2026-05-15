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
        <div className="relative flex min-h-14 items-center justify-center sm:min-h-16">
          <Link
            href="/settings"
            className="absolute left-0 inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-white/[0.035] px-4 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-white/40 hover:bg-white/[0.06] sm:h-16 sm:gap-3 sm:px-7 sm:text-2xl"
          >
            <ArrowLeft className="h-5 w-5 sm:h-8 sm:w-8" aria-hidden="true" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-4xl">
            Billing
          </h1>
        </div>
        <div className="mt-8 w-full sm:mt-11">
          <BillingPageClient />
        </div>
      </div>
    </div>
  );
}
