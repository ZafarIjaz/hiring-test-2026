import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { DEFAULT_SUBSCRIPTION_PERIOD_MS } from '../../constants';
import { firestoreSeatCap } from '../../planConfig';
import { getStripe } from '../../stripeClient';
import { isBasePlanPriceId } from '../../stripePrices';

export async function handleCheckoutCompleted(
  db: admin.firestore.Firestore,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const clinicId = session.metadata?.clinicId;
  const plan = session.metadata?.plan as 'pro' | 'premium' | 'vip';
  const discountDocId = session.metadata?.discountDocId;

  if (!clinicId || !plan) {
    throw new Error('Missing clinicId or plan in session metadata');
  }

  const seatCap = firestoreSeatCap(plan);

  await db.runTransaction(async (tx) => {
    const subRef = db.collection('subscriptions').doc(clinicId);
    const clinicRef = db.collection('clinics').doc(clinicId);

    tx.set(
      subRef,
      {
        clinicId,
        plan,
        status: 'active',
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        currentPeriodEnd: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + DEFAULT_SUBSCRIPTION_PERIOD_MS),
        ),
        gracePeriodEnd: null,
      },
      { merge: true },
    );

    tx.update(clinicRef, {
      plan,
      'seats.max': seatCap,
    });

    if (discountDocId) {
      tx.update(db.collection('discounts').doc(discountDocId), {
        usedCount: FieldValue.increment(1),
      });
    }
  });

  if (!session.subscription) return;

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
  const line = stripeSub.items.data.find((i) => isBasePlanPriceId(i.price.id));
  if (line?.current_period_end) {
    await db.collection('subscriptions').doc(clinicId).update({
      currentPeriodEnd: admin.firestore.Timestamp.fromDate(
        new Date(line.current_period_end * 1000),
      ),
    });
  }
}
