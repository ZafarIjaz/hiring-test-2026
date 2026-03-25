/** Billing / checkout URLs returned to the mobile app (deep links). */
export const CHECKOUT_SUCCESS_URL = 'clinicapp://billing?success=true';
export const CHECKOUT_CANCEL_URL = 'clinicapp://billing?canceled=true';

/** Grace period after a failed invoice payment (aligned with Stripe retry window). */
export const GRACE_PERIOD_DAYS = 7;

/** Fallback subscription length when Stripe period end is unavailable (ms). */
export const DEFAULT_SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Firestore cannot store Infinity; mirror unlimited plans with a large integer for seat.max.
 */
export const UNLIMITED_SEATS_FIRESTORE_CAP = 99_999;

export const PAYABLE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const;
