/**
 * Stripe Price IDs — override with env in deployment; placeholders keep the emulator build working.
 */
export const STRIPE_PRICE_IDS: Record<
  'pro' | 'premium' | 'vip' | 'extra_storage' | 'extra_seats' | 'advanced_analytics',
  string
> = {
  pro: process.env.STRIPE_PRICE_PRO ?? 'price_PRO_REPLACE_ME',
  premium: process.env.STRIPE_PRICE_PREMIUM ?? 'price_PREMIUM_REPLACE_ME',
  vip: process.env.STRIPE_PRICE_VIP ?? 'price_VIP_REPLACE_ME',
  extra_storage: process.env.STRIPE_PRICE_STORAGE ?? 'price_STORAGE_REPLACE_ME',
  extra_seats: process.env.STRIPE_PRICE_SEATS ?? 'price_SEATS_REPLACE_ME',
  advanced_analytics: process.env.STRIPE_PRICE_ANALYTICS ?? 'price_ANALYTICS_REPLACE_ME',
};

const BASE_PLAN_PRICE_IDS = new Set([
  STRIPE_PRICE_IDS.pro,
  STRIPE_PRICE_IDS.premium,
  STRIPE_PRICE_IDS.vip,
]);

export function isBasePlanPriceId(priceId: string): boolean {
  return BASE_PLAN_PRICE_IDS.has(priceId);
}

export function priceIdToPlan(priceId: string): 'pro' | 'premium' | 'vip' | null {
  if (priceId === STRIPE_PRICE_IDS.pro) return 'pro';
  if (priceId === STRIPE_PRICE_IDS.premium) return 'premium';
  if (priceId === STRIPE_PRICE_IDS.vip) return 'vip';
  return null;
}

/** CHF amounts in minor units (Rappen) for invoice-line discount math */
export const ADDON_PRICE_RAPPEN: Record<
  'extra_storage' | 'extra_seats' | 'advanced_analytics',
  number
> = {
  extra_storage: 19 * 100,
  extra_seats: 49 * 100,
  advanced_analytics: 79 * 100,
};
