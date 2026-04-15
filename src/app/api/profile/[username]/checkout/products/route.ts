import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LISTING_FIELDS,
  serializeListing,
  type ListingRow,
} from "@/lib/source/listings/shared";
import type { ProductCheckoutItemInput, ProductCheckoutResponse } from "@/types/checkout";

const MINIMUM_QUANTITY = 1;

function buildErrorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeItems(payload: unknown): ProductCheckoutItemInput[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const { items } = payload as { items?: unknown };
  if (!Array.isArray(items)) {
    return [];
  }

  const bucket = new Map<string, number>();
  const order: string[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const id = typeof (raw as { id?: unknown }).id === "string"
      ? (raw as { id?: string }).id.trim()
      : "";

    if (!id) {
      continue;
    }

    const rawQuantity = (raw as { quantity?: unknown }).quantity;
    const quantityCandidate =
      typeof rawQuantity === "number" && Number.isFinite(rawQuantity)
        ? Math.floor(rawQuantity)
        : MINIMUM_QUANTITY;
    const quantity = Math.max(MINIMUM_QUANTITY, quantityCandidate);

    if (!bucket.has(id)) {
      order.push(id);
      bucket.set(id, quantity);
    } else {
      bucket.set(id, bucket.get(id)! + quantity);
    }
  }

  return order.map((id) => ({ id, quantity: bucket.get(id)! }));
}

export async function POST(
  request: Request,
  context: { params?: { username?: string } },
) {
  const username = (context.params?.username ?? "").trim();
  if (!username) {
    return buildErrorResponse("Username is required to start checkout.", 400);
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return buildErrorResponse("Checkout service currently unavailable.", 503);
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error("Stripe secret key missing for checkout");
    return buildErrorResponse("Payment service unavailable.", 503);
  }
  const serverSupabase = await createSupabaseServerClient();
  const { data: viewerAuth } = serverSupabase
    ? await serverSupabase.auth.getUser()
    : { data: { user: null } };
  const buyerUserId = viewerAuth?.user?.id ?? null;

  let normalizedItems: ProductCheckoutItemInput[];
  try {
    const payload = await request.json().catch(() => null);
    normalizedItems = normalizeItems(payload);
  } catch (error) {
    console.error("Failed to parse checkout payload", error);
    return buildErrorResponse("Invalid checkout payload.", 400);
  }

  if (normalizedItems.length === 0) {
    return buildErrorResponse("At least one cart item is required.", 400);
  }

  const { data: sellerUserId, error: lookupError } = await supabase.rpc(
    "get_profile_user_id",
    { p_username: username },
  );

  if (lookupError || !sellerUserId) {
    console.error("Failed to resolve profile for checkout", lookupError);
    return buildErrorResponse("Profile not found.", 404);
  }

  const listingIds = normalizedItems.map((item) => item.id);
  const { data, error: listingsError } = await supabase
    .from("source_listings")
    .select(LISTING_FIELDS)
    .in("id", listingIds)
    .eq("user_id", sellerUserId)
    .eq("type", "product")
    .eq("status", "published");

  if (listingsError) {
    console.error("Failed to load listings for checkout", listingsError);
    return buildErrorResponse("Unable to validate cart items.", 500);
  }

  const rows = (data ?? []) as ListingRow[];
  const listings = rows.map((row) => serializeListing(row));
  const listingMap = new Map(listings.map((listing) => [listing.id, listing]));

  const missingIds = normalizedItems.filter((item) => !listingMap.has(item.id));
  if (missingIds.length > 0) {
    return buildErrorResponse("One or more products are unavailable for purchase.", 400);
  }

  if (listings.length === 0) {
    return buildErrorResponse("Cart items could not be validated.", 400);
  }

  const currency = listings[0].currency || "USD";

  let totalAmount = 0;
  const orderedLineItems: ProductCheckoutResponse["items"] = [];

  for (const requested of normalizedItems) {
    const listingRow = listingMap.get(requested.id);
    if (!listingRow || listingRow.price === null) {
      return buildErrorResponse("Cart items could not be validated.", 400);
    }

    if (listingRow.currency !== currency) {
      return buildErrorResponse("All items must use the same currency.", 400);
    }

    const lineTotal = listingRow.price * requested.quantity;
    totalAmount += lineTotal;

    orderedLineItems.push({
      id: listingRow.id,
      title: listingRow.title,
      quantity: requested.quantity,
      unitPrice: listingRow.price,
      lineTotal,
    });
  }

  if (orderedLineItems.length === 0) {
    return buildErrorResponse("At least one priced item is required.", 400);
  }
  const checkoutId = randomUUID();
  const normalizedCurrency = (currency || "USD").toLowerCase();

  for (const item of orderedLineItems) {
    const unitAmount = Math.round(item.unitPrice * 100);
    if (unitAmount <= 0) {
      return buildErrorResponse("Cart items must have a positive price.", 400);
    }
  }

  const stripeLineItems = orderedLineItems.map((item) => ({
    listingId: item.id,
    title: item.title,
    quantity: item.quantity,
    unitAmount: Math.round(item.unitPrice * 100),
  }));

  const origin = new URL(request.url).origin;
  const encodedHandle = encodeURIComponent(username);
  const successUrl = `${origin}/profile/${encodedHandle}/checkout/success?checkout_id=${checkoutId}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/profile/${encodedHandle}/checkout/cancel?checkout_id=${checkoutId}`;

  let stripeSession;
  try {
    stripeSession = await createStripeCheckoutSession(stripeSecretKey, {
      clientReferenceId: checkoutId,
      currency: normalizedCurrency,
      successUrl,
      cancelUrl,
      lineItems: stripeLineItems,
      metadata: {
        seller_handle: username,
        seller_user_id: String(sellerUserId),
        ...(buyerUserId ? { buyer_user_id: buyerUserId } : {}),
      },
    });
  } catch (error) {
    console.error("Failed to create Stripe Checkout session", error);
    return buildErrorResponse("Unable to initialize payment session.", 502);
  }

  if (!stripeSession || !stripeSession.id || !stripeSession.url) {
    console.error("Stripe session creation returned incomplete data", stripeSession);
    return buildErrorResponse("Unable to initialize payment session.", 502);
  }

  const { error: persistenceError } = await supabase
    .from("product_checkouts")
    .insert({
      checkout_id: checkoutId,
      seller_handle: username,
      seller_user_id: String(sellerUserId),
      buyer_user_id: buyerUserId,
      currency,
      total_amount: totalAmount,
      stripe_session_id: stripeSession.id,
      status: "pending",
      items: orderedLineItems,
    })
    .select("id")
    .maybeSingle();

  if (persistenceError) {
    console.error("Failed to persist checkout record", persistenceError);
    return buildErrorResponse("Unable to initialize payment session.", 502);
  }

  const checkoutResponse: ProductCheckoutResponse = {
    checkoutId,
    sellerHandle: username,
    sellerUserId: String(sellerUserId),
    currency,
    totalAmount,
    preparedAt: new Date().toISOString(),
    items: orderedLineItems,
    payment: {
      provider: "stripe",
      status: "ready",
      sessionId: stripeSession.id,
      checkoutUrl: stripeSession.url,
    },
  };

  return NextResponse.json(checkoutResponse);
}

type StripeLineItemPayload = {
  listingId: string;
  title: string;
  quantity: number;
  unitAmount: number;
};

type CreateStripeCheckoutSessionArgs = {
  successUrl: string;
  cancelUrl: string;
  currency: string;
  lineItems: StripeLineItemPayload[];
  clientReferenceId: string;
  metadata?: Record<string, string>;
};

async function createStripeCheckoutSession(
  secretKey: string,
  {
    successUrl,
    cancelUrl,
    currency,
    lineItems,
    clientReferenceId,
    metadata,
  }: CreateStripeCheckoutSessionArgs,
) {
  const payload = new URLSearchParams();
  payload.append("mode", "payment");
  payload.append("submit_type", "pay");
  payload.append("payment_method_types[]", "card");
  payload.append("success_url", successUrl);
  payload.append("cancel_url", cancelUrl);
  payload.append("client_reference_id", clientReferenceId);
  payload.append("metadata[checkout_id]", clientReferenceId);
  payload.append("locale", "en");

  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (!value) continue;
      payload.append(`metadata[${key}]`, value);
    }
  }

  lineItems.forEach((item, index) => {
    const prefix = `line_items[${index}]`;
    payload.append(`${prefix}[quantity]`, String(item.quantity));
    payload.append(`${prefix}[price_data][currency]`, currency);
    payload.append(`${prefix}[price_data][unit_amount]`, String(item.unitAmount));
    payload.append(`${prefix}[price_data][product_data][name]`, item.title);
    payload.append(
      `${prefix}[price_data][product_data][metadata][listing_id]`,
      item.listingId,
    );
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Stripe responded with ${response.status}: ${errorText}`);
  }

  const body = (await response.json().catch(() => null)) as {
    id?: string;
    url?: string;
  };

  if (!body || !body.id || !body.url) {
    throw new Error("Stripe Checkout session did not return an ID and URL.");
  }

  return { id: body.id, url: body.url };
}
