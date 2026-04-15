import { createAdminClient } from "@/lib/supabase/admin";
import {
  PRODUCT_ORDER_FULFILLMENT_STATUSES,
  type ProductOrderFulfillmentStatus,
} from "@/types/source";
import type { ProductCheckoutLineItem, ProductCheckoutStatus } from "@/types/checkout";

type ProductCheckoutReceiptRow = {
  id?: string;
  checkout_id: string;
  seller_handle: string;
  currency: string;
  total_amount: number | string | null;
  items: unknown;
  status: string;
  fulfillment_status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductCheckoutReceipt = {
  checkoutId: string;
  sellerHandle: string;
  currency: string;
  totalAmount: number;
  items: ProductCheckoutLineItem[];
  status: ProductCheckoutStatus;
  fulfillmentStatus: ProductOrderFulfillmentStatus;
  shipping: {
    trackingNumber: string | null;
    carrier: string | null;
    shippedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type BuyerProductCheckoutOrder = {
  id: string;
  checkoutId: string;
  sellerHandle: string;
  currency: string;
  subtotalAmount: number;
  status: ProductCheckoutStatus;
  fulfillmentStatus: ProductOrderFulfillmentStatus;
  itemCount: number;
  itemSummary: string;
  shipping: {
    trackingNumber: string | null;
    carrier: string | null;
    shippedAt: string | null;
  } | null;
  createdAt: string;
};

const CHECKOUT_STATUS_SET = new Set<ProductCheckoutStatus>([
  "pending",
  "completed",
  "canceled",
  "failed",
]);

const FULFILLMENT_STATUS_SET = new Set<string>(PRODUCT_ORDER_FULFILLMENT_STATUSES);

function normalizeCheckoutStatus(value: unknown): ProductCheckoutStatus {
  return typeof value === "string" && CHECKOUT_STATUS_SET.has(value as ProductCheckoutStatus)
    ? (value as ProductCheckoutStatus)
    : "pending";
}

function normalizeFulfillmentStatus(value: unknown): ProductOrderFulfillmentStatus {
  return typeof value === "string" && FULFILLMENT_STATUS_SET.has(value)
    ? (value as ProductOrderFulfillmentStatus)
    : "unfulfilled";
}

function normalizeLineItems(value: unknown): ProductCheckoutLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ProductCheckoutLineItem[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const id =
      typeof (candidate as { id?: unknown }).id === "string"
        ? (candidate as { id: string }).id
        : "";
    const title =
      typeof (candidate as { title?: unknown }).title === "string"
        ? (candidate as { title: string }).title
        : "";
    const quantityRaw = (candidate as { quantity?: unknown }).quantity;
    const unitPriceRaw = (candidate as { unitPrice?: unknown }).unitPrice;
    const lineTotalRaw = (candidate as { lineTotal?: unknown }).lineTotal;

    const quantity = typeof quantityRaw === "number" && Number.isFinite(quantityRaw)
      ? quantityRaw
      : Number(quantityRaw ?? 0);
    const unitPrice = typeof unitPriceRaw === "number" && Number.isFinite(unitPriceRaw)
      ? unitPriceRaw
      : Number(unitPriceRaw ?? 0);
    const lineTotal = typeof lineTotalRaw === "number" && Number.isFinite(lineTotalRaw)
      ? lineTotalRaw
      : Number(lineTotalRaw ?? 0);

    normalized.push({
      id,
      title: title || "Product",
      quantity: Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
    });
  }

  return normalized;
}

function mapReceiptRow(row: ProductCheckoutReceiptRow): ProductCheckoutReceipt {
  return {
    checkoutId: row.checkout_id,
    sellerHandle: row.seller_handle,
    currency: row.currency,
    totalAmount: Number(row.total_amount ?? 0),
    items: normalizeLineItems(row.items),
    status: normalizeCheckoutStatus(row.status),
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

function buildItemSummary(items: ProductCheckoutLineItem[]) {
  if (items.length === 0) {
    return "No items";
  }

  const first = items[0];
  const remainingCount = items.length - 1;
  const baseTitle = first?.title?.trim() || "Product";
  if (remainingCount <= 0) {
    return baseTitle;
  }
  if (remainingCount === 1) {
    return `${baseTitle} + 1 more`;
  }
  return `${baseTitle} + ${remainingCount} more`;
}

function mapBuyerOrderRow(row: ProductCheckoutReceiptRow): BuyerProductCheckoutOrder {
  const items = normalizeLineItems(row.items);
  const itemCount = items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);

  return {
    id: row.id || row.checkout_id,
    checkoutId: row.checkout_id,
    sellerHandle: row.seller_handle,
    currency: row.currency,
    subtotalAmount: Number(row.total_amount ?? 0),
    status: normalizeCheckoutStatus(row.status),
    fulfillmentStatus: normalizeFulfillmentStatus(row.fulfillment_status),
    itemCount,
    itemSummary: buildItemSummary(items),
    shipping:
      row.tracking_number || row.carrier || row.shipped_at
        ? {
            trackingNumber: row.tracking_number,
            carrier: row.carrier,
            shippedAt: row.shipped_at,
          }
        : null,
    createdAt: row.created_at,
  };
}

type ReceiptLookupArgs = {
  checkoutId: string;
  sessionId: string;
  sellerHandle?: string;
};

export async function getProductCheckoutReceipt({
  checkoutId,
  sessionId,
  sellerHandle,
}: ReceiptLookupArgs): Promise<ProductCheckoutReceipt | null> {
  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  const query = supabase
    .from("product_checkouts")
    .select(
      "checkout_id, seller_handle, currency, total_amount, items, status, fulfillment_status, tracking_number, carrier, shipped_at, created_at, updated_at",
    )
    .eq("checkout_id", checkoutId)
    .eq("stripe_session_id", sessionId);

  if (sellerHandle?.trim()) {
    query.eq("seller_handle", sellerHandle.trim());
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Failed to load product checkout receipt", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapReceiptRow(data as ProductCheckoutReceiptRow);
}

type BuyerOrdersLookupArgs = {
  buyerUserId: string;
  limit?: number;
};

export async function getBuyerProductCheckoutOrders({
  buyerUserId,
  limit = 50,
}: BuyerOrdersLookupArgs): Promise<BuyerProductCheckoutOrder[]> {
  const normalizedBuyerUserId = buyerUserId.trim();
  if (!normalizedBuyerUserId) {
    return [];
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return [];
  }

  const queryLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 50;
  const { data, error } = await supabase
    .from("product_checkouts")
    .select(
      "id, checkout_id, seller_handle, currency, total_amount, items, status, fulfillment_status, tracking_number, carrier, shipped_at, created_at",
    )
    .eq("buyer_user_id", normalizedBuyerUserId)
    .order("created_at", { ascending: false })
    .limit(queryLimit);

  if (error) {
    console.error("Failed to load buyer product checkout orders", error);
    return [];
  }

  return ((data ?? []) as ProductCheckoutReceiptRow[]).map(mapBuyerOrderRow);
}
