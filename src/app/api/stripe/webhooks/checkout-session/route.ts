import crypto from "crypto";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

const SIGNATURE_TOLERANCE_SECONDS = 300;

type StripeWebhookEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
    };
  };
};

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Stripe webhook secret is not configured");
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  }

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return NextResponse.json({ error: "Stripe signature missing" }, { status: 400 });
  }

  const payload = await request.text();
  if (!verifyStripeSignature(payload, signatureHeader, webhookSecret)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch (error) {
    console.error("Invalid Stripe webhook payload", error);
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const sessionId = event.data?.object?.id;
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { error } = await supabase
    .from("product_checkouts")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    }, { returning: "minimal" })
    .eq("stripe_session_id", sessionId);

  if (error) {
    console.error("Failed to update checkout status", error);
    return NextResponse.json({ error: "Unable to update record" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

function verifyStripeSignature(payload: string, header: string, secret: string) {
  const { timestamp, signatures } = parseStripeSignatureHeader(header);
  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  return signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, "utf8");
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  });
}

function parseStripeSignatureHeader(header: string) {
  const segments = header.split(",");
  const timestampEntry = segments.find((segment) => segment.trim().startsWith("t="));
  const timestamp = timestampEntry ? Number(timestampEntry.split("=")[1]) : null;
  const signatures = segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.startsWith("v1="))
    .map((segment) => segment.split("=")[1])
    .filter(Boolean);

  return { timestamp, signatures };
}
