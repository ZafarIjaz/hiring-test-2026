import * as admin from 'firebase-admin';
import type Stripe from 'stripe';

export async function handlePaymentSucceeded(
  db: admin.firestore.Firestore,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.customer) return;

  const snap = await db
    .collection('subscriptions')
    .where('stripeCustomerId', '==', invoice.customer)
    .limit(1)
    .get();

  if (snap.empty) return;

  await snap.docs[0].ref.update({
    status: 'active',
    gracePeriodEnd: null,
  });
}
