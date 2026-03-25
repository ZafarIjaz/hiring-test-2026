import * as admin from 'firebase-admin';

export async function countActiveSeatMembers(
  db: admin.firestore.Firestore,
  clinicId: string,
): Promise<number> {
  const membersSnap = await db.collection('seats').doc(clinicId).collection('members').get();
  return membersSnap.docs.filter((d) => d.data().active === true).length;
}
