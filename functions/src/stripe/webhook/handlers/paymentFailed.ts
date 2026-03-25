import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { GRACE_PERIOD_DAYS } from '../../constants';

export async function handlePaymentFailed(
  db: admin.firestore.Firestore,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const snap = await db
    .collection('subscriptions')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snap.empty) return;

  const end = new Date();
  end.setDate(end.getDate() + GRACE_PERIOD_DAYS);

  await snap.docs[0].ref.update({
    status: 'grace_period',
    gracePeriodEnd: admin.firestore.Timestamp.fromDate(end),
  });
}
