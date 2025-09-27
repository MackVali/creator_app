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

    if (!business) {
      return NextResponse.json({ error: "BUSINESS_NOT_FOUND" }, { status: 404 });
    }

    let accountId = business.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        business_type: "individual",
      });

      accountId = account.id;

      await prisma.business.update({
        where: { id: businessId },
        data: { stripeAccountId: accountId },
      });
    }

    const appUrl = process.env.APP_URL;

    if (!appUrl) {
      throw new Error("APP_URL_NOT_CONFIGURED");
    }

    const refreshUrl = `${appUrl}/onboarding/refresh?businessId=${encodeURIComponent(
      businessId,
    )}`;
    const returnUrl = `${appUrl}/onboarding/return?businessId=${encodeURIComponent(
      businessId,
    )}`;

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
