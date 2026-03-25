import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { assertClinicOwner, requireAuth } from '../lib/authz';

export const removeStaffMember = functions.https.onCall(async (data, context) => {
  requireAuth(context);

  const { clinicId, targetUserId } = data as { clinicId: string; targetUserId: string };
  const db = admin.firestore();

  await assertClinicOwner(
    db,
    context.auth.uid,
    clinicId,
    'Only the clinic owner can remove staff',
  );

  if (targetUserId === context.auth.uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot remove yourself');
  }

  const seatRef = db.collection('seats').doc(clinicId).collection('members').doc(targetUserId);
  const seatSnap = await seatRef.get();
  if (!seatSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Seat record not found');
  }
  const seat = seatSnap.data()!;
  if (seat.role === 'owner') {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot remove the clinic owner');
  }

  await db.runTransaction(async (tx) => {
    const clinicRef = db.collection('clinics').doc(clinicId);
    const clinicSnap = await tx.get(clinicRef);
    const used = clinicSnap.data()?.seats?.used ?? 0;
    const nextUsed = Math.max(0, used - 1);

    tx.update(seatRef, { active: false });
    tx.update(db.collection('users').doc(targetUserId), {
      role: 'patient',
      clinicId: null,
    });
    tx.update(clinicRef, { 'seats.used': nextUsed });
  });

  await admin.auth().revokeRefreshTokens(targetUserId);
  return { ok: true };
});
