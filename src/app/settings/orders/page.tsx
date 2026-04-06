import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getBuyerProductCheckoutOrders,
  type BuyerProductCheckoutOrder,
} from "@/lib/queries/product-checkouts";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ProductCheckoutStatus } from "@/types/checkout";
import type { ProductOrderFulfillmentStatus } from "@/types/source";

export const metadata = {
  title: "Orders",
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function OrderCard({ order }: { order: BuyerProductCheckoutOrder }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-white/50">Checkout ID</p>
          <p className="mt-1 font-mono text-sm text-white">{order.checkoutId}</p>
          <p className="mt-2 text-xs text-white/60">From @{order.sellerHandle}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-white">
            {formatCurrencyValue(order.subtotalAmount, order.currency)}
          </p>
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Subtotal</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">Payment</p>
          <p className="font-semibold text-white">{CHECKOUT_STATUS_LABELS[order.status]}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">Fulfillment</p>
          <p className="font-semibold text-white">
            {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">Items</p>
          <p className="font-semibold text-white">
            {order.itemSummary} ({order.itemCount})
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">Created</p>
          <p className="font-semibold text-white">{formatDate(order.createdAt)}</p>
        </div>
      </div>

      {order.shipping ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-3 text-sm text-white/80">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Shipping Preview</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <p>
              <span className="text-white/60">Carrier:</span> {order.shipping.carrier || "Pending"}
            </p>
            <p>
              <span className="text-white/60">Tracking:</span>{" "}
              {order.shipping.trackingNumber || "Pending"}
            </p>
            <p>
              <span className="text-white/60">Shipped:</span>{" "}
              {order.shipping.shippedAt ? formatDate(order.shipping.shippedAt) : "Pending"}
            </p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default async function BuyerOrdersPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth");
  }

  const orders = await getBuyerProductCheckoutOrders({
    buyerUserId: user.id,
    limit: 50,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
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

        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Product Purchases</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Your order history</h1>
          <p className="text-sm text-white/65">
            Product checkouts only. Services are intentionally excluded from this view.
          </p>
        </header>

        {orders.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-white/20 bg-white/[0.03] p-8 text-sm text-white/70">
            <p className="font-semibold text-white">No product purchases yet.</p>
            <p className="mt-2">
              Completed checkouts tied to your signed-in buyer account will appear here.
            </p>
          </section>
        ) : (
          <section className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
