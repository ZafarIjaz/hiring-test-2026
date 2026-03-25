import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { PLAN_CONFIG_SERVER, ADDON_SEATS_BONUS } from '../planConfig';
import { discountAppliesToAddon } from '../discountServer';
import { fetchDiscountByCode } from '../lib/discountQueries';
import { assertClinicOwner, requireAuth } from '../lib/authz';
import { assertAddonEligibleSubscription } from '../lib/subscriptionGuards';
import { subscriptionCustomerId } from '../lib/stripeCustomers';
import { getStripe } from '../stripeClient';
import { ADDON_PRICE_RAPPEN, STRIPE_PRICE_IDS } from '../stripePrices';

export const purchaseAddon = functions.https.onCall(async (data, context) => {
  requireAuth(context);

  const { clinicId, addonType, discountCode } = data as {
    clinicId: string;
    addonType: 'extra_storage' | 'extra_seats' | 'advanced_analytics';
    discountCode?: string;
  };

  const db = admin.firestore();
  await assertClinicOwner(db, context.auth.uid, clinicId, 'Only clinic owners can manage billing');

  const subSnap = await db.collection('subscriptions').doc(clinicId).get();
  const sub = subSnap.data();
  assertAddonEligibleSubscription(sub);

  const stripeSubscriptionId = sub.stripeSubscriptionId as string;

  const existing = await db
    .collection('addons')
    .doc(clinicId)
    .collection('items')
    .where('type', '==', addonType)
    .where('active', '==', true)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new functions.https.HttpsError('already-exists', 'This add-on is already active');
  }

  let discountPercent = 0;
  let discountFirestoreId: string | undefined;

  if (discountCode) {
    const found = await fetchDiscountByCode(db, discountCode);
    if (!found) {
      throw new functions.https.HttpsError('invalid-argument', 'Unknown discount code');
    }
    if (!discountAppliesToAddon(found.data, addonType)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This discount does not apply to this add-on (or is expired)',
      );
    }
    discountPercent = found.data.percentOff;
    discountFirestoreId = found.id;
  }

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const customerId = subscriptionCustomerId(stripeSub);

  const subscriptionItem = await stripe.subscriptionItems.create({
    subscription: stripeSubscriptionId,
    price: STRIPE_PRICE_IDS[addonType],
  });

  const baseRappen = ADDON_PRICE_RAPPEN[addonType];
  const discountRappen =
    discountPercent > 0 ? Math.round((baseRappen * discountPercent) / 100) : 0;

  if (discountRappen > 0) {
    await stripe.invoiceItems.create({
      customer: customerId,
      subscription: stripeSubscriptionId,
      amount: -discountRappen,
      currency: 'chf',
      description: `Add-on discount (${discountCode})`,
    });
  }

  const addonRef = db.collection('addons').doc(clinicId).collection('items').doc();

  await db.runTransaction(async (tx) => {
    const clinicRef = db.collection('clinics').doc(clinicId);
    const clinicSnap = await tx.get(clinicRef);
    const clinic = clinicSnap.data();
    if (!clinic) throw new Error('Clinic missing');

    const priceChf = baseRappen / 100;
    tx.set(addonRef, {
      clinicId,
      type: addonType,
      price: priceChf,
      active: true,
      stripeItemId: subscriptionItem.id,
    });

    const updates: Record<string, unknown> = {
      addons: FieldValue.arrayUnion(addonRef.id),
    };

    if (addonType === 'extra_seats') {
      const max =
        typeof clinic.seats?.max === 'number' ? clinic.seats.max : PLAN_CONFIG_SERVER.pro.seats;
      updates['seats.max'] = max + ADDON_SEATS_BONUS;
    }
    if (addonType === 'extra_storage') {
      updates.extraStorage = true;
    }

    tx.update(clinicRef, updates);

    if (discountFirestoreId) {
      tx.update(db.collection('discounts').doc(discountFirestoreId), {
        usedCount: FieldValue.increment(1),
      });
    }
  });

  return { ok: true };
});
