import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/payments/db";
import { stripe } from "@/lib/stripe";

const requestSchema = z.object({
  businessId: z.string().min(1, "BUSINESS_ID_REQUIRED"),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { businessId } = requestSchema.parse(json);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business?.stripeAccountId) {
      return NextResponse.json({ error: "BUSINESS_NOT_CONNECTED" }, { status: 400 });
    }

    const login = await stripe.accounts.createLoginLink(business.stripeAccountId);

    return NextResponse.json({ url: login.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
