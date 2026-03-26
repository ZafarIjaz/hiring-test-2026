import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const revokeUserSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { clinicId, targetUserId } = data as {
    clinicId: string;
    targetUserId: string;
  };

  const db = admin.firestore();
  const ownerDoc = await db.collection('users').doc(context.auth.uid).get();
  const owner = ownerDoc.data();
  if (!owner || owner.role !== 'owner' || owner.clinicId !== clinicId) {
    throw new functions.https.HttpsError('permission-denied', 'Only clinic owners can revoke sessions');
  }

  const targetDoc = await db.collection('users').doc(targetUserId).get();
  const target = targetDoc.data();
  if (!target || target.clinicId !== clinicId) {
    throw new functions.https.HttpsError('failed-precondition', 'Target user is not in this clinic');
  }

  await admin.auth().revokeRefreshTokens(targetUserId);
  return { ok: true };
});
