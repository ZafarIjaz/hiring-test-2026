import * as functions from 'firebase-functions';
import { PAYABLE_SUBSCRIPTION_STATUSES } from '../constants';

export function assertAddonEligibleSubscription(
  data: FirebaseFirestore.DocumentData | undefined,
): asserts data is FirebaseFirestore.DocumentData & { stripeSubscriptionId: string } {
  const ok =
    !!data?.stripeSubscriptionId &&
    (PAYABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(data.status));
  if (!ok) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Active paid subscription required for add-ons',
    );
  }
}
