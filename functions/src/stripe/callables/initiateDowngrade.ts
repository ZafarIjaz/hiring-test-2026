import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { PLAN_CONFIG_SERVER } from '../planConfig';
import { assertClinicOwner, requireAuth } from '../lib/authz';
import { countActiveSeatMembers } from '../lib/seating';
import { getStripe } from '../stripeClient';
import { STRIPE_PRICE_IDS, isBasePlanPriceId } from '../stripePrices';

export const initiateDowngrade = functions.https.onCall(async (data, context) => {
  requireAuth(context);

  const { clinicId, targetPlan } = data as {
    clinicId: string;
    targetPlan: 'free' | 'pro' | 'premium';
  };

  const db = admin.firestore();
  await assertClinicOwner(db, context.auth.uid, clinicId, 'Only clinic owners can manage billing');

  const targetLimit = PLAN_CONFIG_SERVER[targetPlan].seats;
  if (targetLimit === Infinity) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid downgrade target');
  }

  const activeCount = await countActiveSeatMembers(db, clinicId);
  if (activeCount > targetLimit) {
    return {
      strategy: 'blocked' as const,
      conflictingSeats: activeCount - targetLimit,
    };
  }

  const subSnap = await db.collection('subscriptions').doc(clinicId).get();
  const stripeSubId = subSnap.data()?.stripeSubscriptionId as string | undefined;
  if (!stripeSubId) {
    throw new functions.https.HttpsError('failed-precondition', 'No Stripe subscription to change');
  }

  const stripe = getStripe();
  if (targetPlan === 'free') {
    await stripe.subscriptions.cancel(stripeSubId);
  } else {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    const baseItem = stripeSub.items.data.find((i) => isBasePlanPriceId(i.price.id));
    if (!baseItem) {
      throw new functions.https.HttpsError('internal', 'Could not find base subscription item');
    }
    await stripe.subscriptions.update(stripeSubId, {
      items: [{ id: baseItem.id, price: STRIPE_PRICE_IDS[targetPlan] }],
      proration_behavior: 'create_prorations',
    });
  }

  return { strategy: 'immediate' as const };
});
