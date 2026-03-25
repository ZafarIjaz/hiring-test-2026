import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { firestoreSeatCap } from '../../planConfig';

export async function handleSubscriptionDeleted(
  db: admin.firestore.Firestore,
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  const snap = await db
    .collection('subscriptions')
    .where('stripeSubscriptionId', '==', stripeSubscription.id)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn('No clinic for deleted subscription', stripeSubscription.id);
    return;
  }

  const subRef = snap.docs[0].ref;
  const clinicId = snap.docs[0].id;
  const clinicRef = db.collection('clinics').doc(clinicId);
  const freeCap = firestoreSeatCap('free');

  await db.runTransaction(async (tx) => {
    tx.set(
      subRef,
      {
        plan: 'free',
        status: 'canceled',
        stripeSubscriptionId: null,
        gracePeriodEnd: null,
        currentPeriodEnd: admin.firestore.Timestamp.fromDate(new Date()),
      },
      { merge: true },
    );

    tx.update(clinicRef, {
      plan: 'free',
      'seats.max': freeCap,
    });
  });

  const membersSnap = await db.collection('seats').doc(clinicId).collection('members').get();

  const batch = db.batch();
  const revokeUids: string[] = [];

  for (const doc of membersSnap.docs) {
    const data = doc.data();
    if (data.role === 'owner') {
      if (data.active !== true) {
        batch.update(doc.ref, { active: true });
      }
      continue;
    }
    if (data.active === true) {
      revokeUids.push(doc.id);
      batch.update(doc.ref, { active: false });
      batch.update(db.collection('users').doc(doc.id), {
        role: 'patient',
        clinicId: null,
      });
    }
  }

  await batch.commit();

  await Promise.all(
    revokeUids.map((uid) => admin.auth().revokeRefreshTokens(uid).catch(() => undefined)),
  );

  const addonSnap = await db.collection('addons').doc(clinicId).collection('items').get();
  const addonBatch = db.batch();
  for (const d of addonSnap.docs) {
    addonBatch.update(d.ref, { active: false });
  }
  await addonBatch.commit();

  await clinicRef.update({
    'seats.used': 1,
    addons: [],
    extraStorage: false,
  });
}
