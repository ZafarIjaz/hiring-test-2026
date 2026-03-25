import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { DEFAULT_SUBSCRIPTION_PERIOD_MS } from '../../constants';
import { firestoreSeatCap } from '../../planConfig';
import { isBasePlanPriceId, priceIdToPlan } from '../../stripePrices';

export async function handleSubscriptionUpdated(
  db: admin.firestore.Firestore,
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  const snap = await db
    .collection('subscriptions')
    .where('stripeSubscriptionId', '==', stripeSubscription.id)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn('No clinic found for subscription', stripeSubscription.id);
    return;
  }

  const subDoc = snap.docs[0];
  const clinicId = subDoc.id;

  const baseItem = stripeSubscription.items.data.find((i) => isBasePlanPriceId(i.price.id));
  if (!baseItem) {
    console.warn('No base plan item on subscription', stripeSubscription.id);
    return;
  }

  const mapped = priceIdToPlan(baseItem.price.id);
  if (!mapped) {
    console.warn('Unknown price id on subscription item', baseItem.price.id);
    return;
  }

  const seatCap = firestoreSeatCap(mapped);

  const periodEnd =
    baseItem.current_period_end != null
      ? admin.firestore.Timestamp.fromDate(new Date(baseItem.current_period_end * 1000))
      : admin.firestore.Timestamp.fromDate(new Date(Date.now() + DEFAULT_SUBSCRIPTION_PERIOD_MS));

  const status =
    stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing'
      ? 'active'
      : stripeSubscription.status === 'past_due'
        ? 'grace_period'
        : 'canceled';

  await db.runTransaction(async (tx) => {
    tx.update(subDoc.ref, {
      plan: mapped,
      status,
      currentPeriodEnd: periodEnd,
    });
    tx.update(db.collection('clinics').doc(clinicId), {
      plan: mapped,
      'seats.max': seatCap,
    });
  });
}
