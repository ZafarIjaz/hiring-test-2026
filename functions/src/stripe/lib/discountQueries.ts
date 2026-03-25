import * as admin from 'firebase-admin';
import type { DiscountDoc } from '../discountServer';

export async function fetchDiscountByCode(
  db: admin.firestore.Firestore,
  rawCode: string,
): Promise<{ id: string; data: DiscountDoc } | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const q = await db.collection('discounts').where('code', '==', code).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, data: doc.data() as DiscountDoc };
}
