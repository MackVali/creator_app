import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

export const stripe = new Stripe(secretKey, {
  apiVersion: "2024-06-20",
});

export function toCents(amount: number): number {
  return Math.round(amount);
}

export function calcFeeCents(subtotalCents: number, feeBps: number): number {
  return Math.floor((subtotalCents * feeBps) / 10_000);
}
