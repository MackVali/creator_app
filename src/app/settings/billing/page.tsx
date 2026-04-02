import Link from "next/link";
import BillingPageClient from "./BillingPageClient";

export const metadata = {
  title: "Billing",
};

export default function BillingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/40 hover:text-white"
          >
            <span aria-hidden="true" className="mr-1 text-base leading-none">
              ←
            </span>
            Back
          </Link>
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">Billing</h1>
        <div className="mt-8 w-full">
          <BillingPageClient />
        </div>
      </div>
    </div>
  );
}
