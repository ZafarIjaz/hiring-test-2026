import type { Timestamp } from 'firebase-admin/firestore';

export type DiscountDoc = {
  code: string;
  percentOff: number;
  appliesToBase: boolean;
  appliesToAddons: string[] | 'all';
  validUntil: Timestamp;
  usageLimit: number;
  usedCount: number;
};

export function isDiscountValidServer(d: DiscountDoc): boolean {
  const now = new Date();
  return d.validUntil.toDate() > now && d.usedCount < d.usageLimit;
}

export function discountAppliesToAddon(
  d: DiscountDoc,
  addonType: 'extra_storage' | 'extra_seats' | 'advanced_analytics',
): boolean {
  if (!isDiscountValidServer(d)) return false;
  if (d.appliesToAddons === 'all') return true;
  return Array.isArray(d.appliesToAddons) && d.appliesToAddons.includes(addonType);
}
