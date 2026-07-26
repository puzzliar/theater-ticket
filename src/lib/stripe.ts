import "server-only";
import Stripe from "stripe";

// STRIPE_SECRET_KEY 未設定時は null (モック決済モードで動作)
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
