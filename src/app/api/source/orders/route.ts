import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePlus } from "@/lib/entitlements/requirePlus";
import type { ProductCheckoutLineItem, ProductCheckoutStatus } from "@/types/checkout";
import {
  PRODUCT_ORDER_FULFILLMENT_STATUSES,
  type OrdersResponse,
  type ProductOrderFulfillmentStatus,
} from "@/types/source";

export const runtime = "nodejs";

type ProductCheckoutOrderRow = {
  id: string;
  checkout_id: string;
  currency: string;
  total_amount: number | string | null;
  items: unknown;
  stripe_session_id: string | null;
  status: string;
  fulfillment_status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
};

const PRODUCT_ORDER_FULFILLMENT_STATUS_SET = new Set<string>(
  PRODUCT_ORDER_FULFILLMENT_STATUSES,
);

function normalizeFulfillmentStatus(value: unknown): ProductOrderFulfillmentStatus {
  return typeof value === "string" && PRODUCT_ORDER_FULFILLMENT_STATUS_SET.has(value)
    ? (value as ProductOrderFulfillmentStatus)
    : "unfulfilled";
}

function mapOrderRow(row: ProductCheckoutOrderRow) {
  const itemsCandidate = row.items;
  const itemsArray: ProductCheckoutLineItem[] = Array.isArray(itemsCandidate)
    ? (itemsCandidate as ProductCheckoutLineItem[])
    : [];
  const stripeSessionId =
    typeof row.stripe_session_id === "string" && row.stripe_session_id.trim().length > 0
      ? row.stripe_session_id
      : null;

  return {
    id: row.id,
    checkoutId: row.checkout_id,
    currency: row.currency,
    totalAmount: Number(row.total_amount ?? 0),
    items: itemsArray,
    stripeSessionId,
    status: row.status as ProductCheckoutStatus,
    fulfillmentStatus: normalizeFulfillmentStatus(row.fulfillment_status),
    shipping:
      row.tracking_number || row.carrier || row.shipped_at
        ? {
            trackingNumber: row.tracking_number,
            carrier: row.carrier,
            shippedAt: row.shipped_at,
          }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const gate = await requirePlus();
  if (gate) {
    return gate;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ orders: [] } satisfies OrdersResponse, { status: 200 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ orders: [] } satisfies OrdersResponse, { status: 200 });
  }

  const { data, error } = await supabase
    .from("product_checkouts")
    .select(
      "id, checkout_id, currency, total_amount, items, stripe_session_id, status, fulfillment_status, tracking_number, carrier, shipped_at, created_at, updated_at"
    )
    .eq("seller_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to load product checkouts", error);
    return NextResponse.json({ orders: [] } satisfies OrdersResponse, { status: 200 });
  }

  const orders = ((data ?? []) as ProductCheckoutOrderRow[]).map(mapOrderRow);

  return NextResponse.json({ orders }, { status: 200 });
}

type UpdateOrderPayload = {
  orderId?: unknown;
  fulfillmentStatus?: unknown;
  shipping?: {
    trackingNumber?: unknown;
    carrier?: unknown;
    shippedAt?: unknown;
  } | null;
};

export async function PATCH(request: Request) {
  const gate = await requirePlus();
  if (gate) {
    return gate;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Source orders unavailable." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as UpdateOrderPayload | null;
  const orderId = typeof payload?.orderId === "string" ? payload.orderId.trim() : "";
  const requestedFulfillmentStatus =
    typeof payload?.fulfillmentStatus === "string"
      ? normalizeFulfillmentStatus(payload?.fulfillmentStatus)
      : null;
  const hasShippingPayload =
    payload !== null && typeof payload === "object" && "shipping" in payload;

  if (!orderId) {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
  }
  if (
    typeof payload?.fulfillmentStatus !== "undefined" &&
    (typeof payload?.fulfillmentStatus !== "string" ||
      !PRODUCT_ORDER_FULFILLMENT_STATUS_SET.has(payload.fulfillmentStatus))
  ) {
    return NextResponse.json({ error: "Invalid fulfillment status." }, { status: 400 });
  }
  if (
    hasShippingPayload &&
    payload?.shipping !== null &&
    typeof payload?.shipping !== "object"
  ) {
    return NextResponse.json({ error: "Invalid shipping metadata." }, { status: 400 });
  }
  if (requestedFulfillmentStatus === null && !hasShippingPayload) {
    return NextResponse.json({ error: "No order updates were provided." }, { status: 400 });
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("product_checkouts")
    .select(
      "id, checkout_id, currency, total_amount, items, stripe_session_id, status, fulfillment_status, tracking_number, carrier, shipped_at, created_at, updated_at",
    )
    .eq("id", orderId)
    .eq("seller_user_id", user.id)
    .maybeSingle();

  if (existingOrderError) {
    console.error("Failed to load product checkout before update", existingOrderError);
    return NextResponse.json({ error: "Unable to update fulfillment status." }, { status: 500 });
  }

  if (!existingOrder) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const nextFulfillmentStatus =
    requestedFulfillmentStatus ?? normalizeFulfillmentStatus(existingOrder.fulfillment_status);

  const updatePayload: {
    fulfillment_status?: ProductOrderFulfillmentStatus;
    tracking_number?: string | null;
    carrier?: string | null;
    shipped_at?: string | null;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (requestedFulfillmentStatus !== null) {
    updatePayload.fulfillment_status = requestedFulfillmentStatus;
  }

  if (hasShippingPayload) {
    if (nextFulfillmentStatus !== "shipped") {
      return NextResponse.json(
        { error: "Shipping metadata can only be edited when order is shipped." },
        { status: 400 },
      );
    }

    const shipping = payload?.shipping;
    const trackingNumber =
      typeof shipping?.trackingNumber === "string" && shipping.trackingNumber.trim().length > 0
        ? shipping.trackingNumber.trim()
        : null;
    const carrier =
      typeof shipping?.carrier === "string" && shipping.carrier.trim().length > 0
        ? shipping.carrier.trim()
        : null;

    let shippedAt: string | null = null;
    if (typeof shipping?.shippedAt === "string" && shipping.shippedAt.trim().length > 0) {
      const parsedShippedAt = new Date(shipping.shippedAt);
      if (Number.isNaN(parsedShippedAt.getTime())) {
        return NextResponse.json({ error: "Invalid shipped date." }, { status: 400 });
      }
      shippedAt = parsedShippedAt.toISOString();
    }

    updatePayload.tracking_number = trackingNumber;
    updatePayload.carrier = carrier;
    updatePayload.shipped_at = shippedAt;
  }

  const { data, error } = await supabase
    .from("product_checkouts")
    .update(updatePayload, { returning: "representation" })
    .eq("id", orderId)
    .eq("seller_user_id", user.id)
    .select(
      "id, checkout_id, currency, total_amount, items, stripe_session_id, status, fulfillment_status, tracking_number, carrier, shipped_at, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    console.error("Failed to update product checkout fulfillment status", error);
    return NextResponse.json({ error: "Unable to update fulfillment status." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({ order: mapOrderRow(data as ProductCheckoutOrderRow) }, { status: 200 });
}
