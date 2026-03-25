import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { PAYABLE_SUBSCRIPTION_STATUSES } from './constants';
import { assertClinicOwner, requireAuth } from './lib/authz';
import { SeatExhaustedError } from './lib/errors';
import { randomTempPassword } from './lib/password';

export const inviteStaffMember = functions.https.onCall(async (data, context) => {
  requireAuth(context);

  const { clinicId, email, displayName } = data as {
    clinicId: string;
    email: string;
    displayName: string;
  };

  if (!email?.trim() || !displayName?.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'Email and display name are required');
  }

  const db = admin.firestore();
  await assertClinicOwner(
    db,
    context.auth.uid,
    clinicId,
    'Only clinic owners can invite staff',
  );

  const subSnap = await db.collection('subscriptions').doc(clinicId).get();
  const st = subSnap.data()?.status;
  if (!(PAYABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(st))) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Staff can only be invited while the subscription is active',
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  let uid: string;
  try {
    const cred = await admin.auth().createUser({
      email: normalizedEmail,
      password: randomTempPassword(),
      displayName: displayName.trim(),
    });
    uid = cred.uid;
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'That email is already registered');
    }
    throw new functions.https.HttpsError('internal', 'Could not create auth user');
  }

  const clinicRef = db.collection('clinics').doc(clinicId);
  const userRef = db.collection('users').doc(uid);
  const seatRef = db.collection('seats').doc(clinicId).collection('members').doc(uid);

  try {
    await db.runTransaction(async (tx) => {
      const clinicSnap = await tx.get(clinicRef);
      const clinic = clinicSnap.data();
      if (!clinic) throw new Error('NO_CLINIC');
      const used = typeof clinic.seats?.used === 'number' ? clinic.seats.used : 0;
      const max = typeof clinic.seats?.max === 'number' ? clinic.seats.max : 0;
      if (used >= max) {
        throw new SeatExhaustedError();
      }

      tx.update(clinicRef, { 'seats.used': used + 1 });
      tx.set(userRef, {
        displayName: displayName.trim(),
        email: normalizedEmail,
        role: 'staff',
        clinicId,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(seatRef, {
        role: 'staff',
        joinedAt: FieldValue.serverTimestamp(),
        active: true,
      });
    });
  } catch (e) {
    await admin.auth().deleteUser(uid).catch(() => undefined);
    if (e instanceof SeatExhaustedError) {
      throw new functions.https.HttpsError('resource-exhausted', 'No seats available for this clinic');
    }
    throw new functions.https.HttpsError('internal', 'Could not complete invitation');
  }

  const resetLink = await admin.auth().generatePasswordResetLink(normalizedEmail);
  return { resetLink };
});
