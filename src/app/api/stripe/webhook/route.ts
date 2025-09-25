import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/payments/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "SIGNATURE_HEADER_MISSING" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? "",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as { metadata?: Record<string, string | undefined> };
        const orderId = session.metadata?.orderId;

        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: { status: "PAID" },
          });
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as { metadata?: Record<string, string | undefined> };
        const orderId = paymentIntent.metadata?.orderId;

        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: { status: "CANCELED" },
          });
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const config = {
  api: { bodyParser: false },
};
