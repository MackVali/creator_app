import Link from "next/link";

import { getProductCheckoutReceipt } from "@/lib/queries/product-checkouts";
import type { ProductCheckoutStatus } from "@/types/checkout";
import type { ProductOrderFulfillmentStatus } from "@/types/source";

type CheckoutReturnPageProps = {
  searchParams: {
    checkout_id?: string | string[];
    session_id?: string | string[];
  };
};

const normalizeParam = (value?: string | string[] | null): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
};

const CHECKOUT_STATUS_LABELS: Record<ProductCheckoutStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  canceled: "Canceled",
  failed: "Failed",
};

const FULFILLMENT_STATUS_LABELS: Record<ProductOrderFulfillmentStatus, string> = {
  unfulfilled: "Unfulfilled",
  packed: "Packed",
  shipped: "Shipped",
};

function formatCurrencyValue(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode || "USD"} ${value.toFixed(2)}`;
  }
}

function formatAbsoluteDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutReturnPageProps) {
  const checkoutId = normalizeParam(searchParams.checkout_id);
  const sessionId = normalizeParam(searchParams.session_id);

  const order =
    checkoutId && sessionId
      ? await getProductCheckoutReceipt({
          checkoutId,
          sessionId,
        })
      : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 lg:px-0">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-[0_30px_60px_rgba(15,23,42,0.65)]">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Checkout complete</p>
        <h1 className="mt-3 text-3xl font-semibold">Thanks for your purchase.</h1>
        <p className="mt-3 text-base text-white/70">
          Stripe redirected you back after payment. This receipt reflects the persisted order record.
        </p>

        {order ? (
          <div className="mt-6 space-y-5 rounded-2xl border border-white/10 bg-slate-900/40 p-5 text-sm text-white/80">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Order ID</p>
                <p className="font-mono text-sm text-white">{order.checkoutId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Payment status</p>
                <p className="font-semibold text-white">{CHECKOUT_STATUS_LABELS[order.status]}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Fulfillment</p>
                <p className="font-semibold text-white">
                  {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Subtotal</p>
                <p className="font-semibold text-white">
                  {formatCurrencyValue(order.totalAmount, order.currency)}
                </p>
              </div>
            </div>

            {order.items.length > 0 ? (
              <div className="space-y-2 border-t border-white/10 pt-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Items</p>
                {order.items.map((item, index) => (
                  <div
                    key={`${item.id || item.title}-${index}`}
                    className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{item.title}</p>
                      <p className="text-[11px] text-white/60">Qty {item.quantity}</p>
                    </div>
                    <p className="text-xs font-semibold text-white/90">
                      {formatCurrencyValue(item.lineTotal, order.currency)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {order.shipping ? (
              <div className="space-y-2 border-t border-white/10 pt-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Shipping</p>
                {order.shipping.carrier ? (
                  <p>
                    <span className="text-white/60">Carrier:</span> {order.shipping.carrier}
                  </p>
                ) : null}
                {order.shipping.trackingNumber ? (
                  <p>
                    <span className="text-white/60">Tracking number:</span>{" "}
                    {order.shipping.trackingNumber}
                  </p>
                ) : null}
                {order.shipping.shippedAt ? (
                  <p>
                    <span className="text-white/60">Shipped at:</span>{" "}
                    {formatAbsoluteDateTime(order.shipping.shippedAt)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-white/80">
            <p>We could not load a persisted order receipt for this return URL.</p>
            {checkoutId ? (
              <p>
                <span className="font-semibold text-white">Checkout ID:</span> {checkoutId}
              </p>
            ) : null}
            {sessionId ? (
              <p>
                <span className="font-semibold text-white">Stripe session:</span> {sessionId}
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/settings/orders"
            className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/20"
          >
            View your orders
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/10"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
