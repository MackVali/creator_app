import Link from "next/link";

type CheckoutReturnPageProps = {
  params: {
    handle: string;
  };
  searchParams: {
    checkout_id?: string | string[];
  };
};

const normalizeParam = (value?: string | string[] | null): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
};

export default function ProfileCheckoutCancelPage({ params, searchParams }: CheckoutReturnPageProps) {
  const { handle } = params;
  const checkoutId = normalizeParam(searchParams.checkout_id);
  const returnHref = handle ? `/profile/${encodeURIComponent(handle)}` : "/profile";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 lg:px-0">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-[0_30px_60px_rgba(15,23,42,0.65)]">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Checkout canceled</p>
        <h1 className="mt-3 text-3xl font-semibold">You left before completing payment.</h1>
        <p className="mt-3 text-base text-white/70">
          No worries—your cart is untouched. Keep browsing the profile, adjust quantities, or return when you’re ready to confirm the purchase.
        </p>
        {checkoutId ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-white/80">
            <p>
              <span className="font-semibold text-white">Checkout ID:</span> {checkoutId}
            </p>
            <p className="text-[11px] text-white/60">Use this ID if you need to reference the session later.</p>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={returnHref}
            className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/20"
          >
            Back to profile
          </Link>
        </div>
      </section>
    </div>
  );
}
