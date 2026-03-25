import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export function requireAuth(
  context: functions.https.CallableContext,
): asserts context is functions.https.CallableContext & { auth: NonNullable<functions.https.CallableContext['auth']> } {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
}

export async function assertClinicOwner(
  db: admin.firestore.Firestore,
  uid: string,
  clinicId: string,
  denyMessage: string,
): Promise<FirebaseFirestore.DocumentData> {
  const userDoc = await db.collection('users').doc(uid).get();
  const user = userDoc.data();
  if (!user || user.role !== 'owner' || user.clinicId !== clinicId) {
    throw new functions.https.HttpsError('permission-denied', denyMessage);
  }
  return user;
}
