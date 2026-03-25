import { UNLIMITED_SEATS_FIRESTORE_CAP } from './constants';

// Server-side plan config — keep in sync with src/types/subscription.ts
// Duplicated here to avoid importing client-side code into Cloud Functions.
export const PLAN_CONFIG_SERVER = {
  free:    { price: 0,   seats: 1,         label: 'Free' },
  pro:     { price: 99,  seats: 5,         label: 'Pro' },
  premium: { price: 249, seats: 15,        label: 'Premium' },
  vip:     { price: 499, seats: Infinity,  label: 'VIP' },
} as const;

export type PlanKey = keyof typeof PLAN_CONFIG_SERVER;

export const ADDON_SEATS_BONUS = 5; // Extra Seats Pack adds 5 seats per purchase

/** Seat cap persisted in Firestore (handles VIP “unlimited” as a large int). */
export function firestoreSeatCap(plan: PlanKey): number {
  const n = PLAN_CONFIG_SERVER[plan].seats;
  return n === Infinity ? UNLIMITED_SEATS_FIRESTORE_CAP : n;
}
