import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CHECKOUT_CANCEL_URL, CHECKOUT_SUCCESS_URL } from '../constants';
import { isDiscountValidServer } from '../discountServer';
import { fetchDiscountByCode } from '../lib/discountQueries';
import { assertClinicOwner, requireAuth } from '../lib/authz';
import { getOrCreateStripeCustomerId } from '../lib/stripeCustomers';
import { getStripe } from '../stripeClient';
import { STRIPE_PRICE_IDS } from '../stripePrices';

export const createCheckoutSession = functions.https.onCall(async (data, context) => {
  requireAuth(context);

  const { clinicId, plan, discountCode } = data as {
    clinicId: string;
    plan: 'pro' | 'premium' | 'vip';
    discountCode?: string;
  };

  const db = admin.firestore();
  const owner = await assertClinicOwner(
    db,
    context.auth.uid,
    clinicId,
    'Only clinic owners can manage billing',
  );

  const clinicDoc = await db.collection('clinics').doc(clinicId).get();
  const clinic = clinicDoc.data();

  const customerId = await getOrCreateStripeCustomerId({
    db,
    clinicId,
    ownerEmail: owner.email as string | undefined,
    clinicName: clinic?.name as string | undefined,
  });

  const stripe = getStripe();
  let stripeCouponId: string | undefined;
  let discountDocId: string | undefined;

  if (discountCode) {
    const found = await fetchDiscountByCode(db, discountCode);
    if (!found) {
      throw new functions.https.HttpsError('invalid-argument', 'Unknown discount code');
    }
    const d = found.data;
    if (!isDiscountValidServer(d)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Discount code is expired or fully used',
      );
    }
    if (!d.appliesToBase) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This discount does not apply to the base plan',
      );
    }
    const coupon = await stripe.coupons.create({
      percent_off: d.percentOff,
      duration: 'repeating',
      duration_in_months: 12,
      name: d.code,
      metadata: { discountDocId: found.id, clinicId },
    });
    stripeCouponId = coupon.id;
    discountDocId = found.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: STRIPE_PRICE_IDS[plan], quantity: 1 }],
    ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
    metadata: {
      clinicId,
      plan,
      ...(discountDocId ? { discountDocId } : {}),
    },
    success_url: CHECKOUT_SUCCESS_URL,
    cancel_url: CHECKOUT_CANCEL_URL,
  });

  return { sessionId: session.id, url: session.url };
});
