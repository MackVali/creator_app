import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";

import { prisma, getBusinessBySlugOrThrow } from "@/lib/payments/db";
import { calcFeeCents, stripe } from "@/lib/stripe";

const itemSchema = z.object({
  name: z.string().min(1, "ITEM_NAME_REQUIRED"),
  priceCents: z
    .number({ invalid_type_error: "INVALID_PRICE" })
    .int("PRICE_MUST_BE_INT")
    .min(0, "PRICE_MUST_BE_POSITIVE"),
  quantity: z
    .number({ invalid_type_error: "INVALID_QUANTITY" })
    .int("QUANTITY_MUST_BE_INT")
    .min(1, "QUANTITY_MIN_ONE")
    .max(99, "QUANTITY_TOO_LARGE")
    .optional()
    .default(1),
});

const requestSchema = z.object({
  items: z.array(itemSchema).min(1, "ITEMS_REQUIRED"),
  tipCents: z
    .number({ invalid_type_error: "INVALID_TIP" })
    .int("TIP_MUST_BE_INT")
    .min(0, "TIP_MUST_BE_POSITIVE")
    .max(1_000_00, "TIP_TOO_LARGE")
    .optional()
    .default(0),
  taxCents: z
    .number({ invalid_type_error: "INVALID_TAX" })
    .int("TAX_MUST_BE_INT")
    .min(0, "TAX_MUST_BE_POSITIVE")
    .max(1_000_00, "TAX_TOO_LARGE")
    .optional()
    .default(0),
  orderMetadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const business = await getBusinessBySlugOrThrow(params.slug);
    const json = await req.json();
    const { items, tipCents, taxCents, orderMetadata } = requestSchema.parse(json);

    if (!business.tipEnabled && tipCents > 0) {
      throw new Error("TIP_NOT_ALLOWED");
    }

    if (!business.taxEnabled && taxCents > 0) {
      throw new Error("TAX_NOT_ALLOWED");
    }

    const baseLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map(
      ({ name, priceCents, quantity }) => ({
        quantity,
        price_data: {
          currency: "usd",
          product_data: { name },
          unit_amount: priceCents,
        },
      }),
    );

    const lineItems = [...baseLineItems];

    if (tipCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: "Tip" },
          unit_amount: tipCents,
        },
      });
    }

    if (taxCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: "Tax" },
          unit_amount: taxCents,
        },
      });
    }

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    );
    const feeCents = calcFeeCents(subtotalCents, business.feeBps);

    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        subtotalCents,
        tipCents,
        taxCents,
        feeCents,
        metadataJson: JSON.stringify(orderMetadata ?? {}),
      },
    });

    const appUrl = process.env.APP_URL;

    if (!appUrl) {
      throw new Error("APP_URL_NOT_CONFIGURED");
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: lineItems,
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: business.stripeAccountId! },
        metadata: {
          orderId: order.id,
          businessId: business.id,
          businessSlug: business.slug,
        },
      },
      metadata: {
        orderId: order.id,
        businessId: business.id,
        businessSlug: business.slug,
      },
      success_url: `${appUrl}/${business.slug}/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/${business.slug}/order?canceled=1`,
    };

    const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId ?? undefined,
      },
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      orderId: order.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
