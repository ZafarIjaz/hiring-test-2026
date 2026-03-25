import type Stripe from 'stripe';
import * as admin from 'firebase-admin';
import { getStripe } from '../stripeClient';

export async function getOrCreateStripeCustomerId(params: {
  db: admin.firestore.Firestore;
  clinicId: string;
  ownerEmail?: string;
  clinicName?: string;
}): Promise<string> {
  const { db, clinicId, ownerEmail, clinicName } = params;
  const subDoc = await db.collection('subscriptions').doc(clinicId).get();
  const existing = subDoc.data()?.stripeCustomerId as string | undefined;
  if (existing) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: ownerEmail,
    name: clinicName,
    metadata: { clinicId },
  });
  return customer.id;
}

export function subscriptionCustomerId(sub: Stripe.Subscription): string {
  return typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
}
