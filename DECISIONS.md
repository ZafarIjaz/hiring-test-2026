# Hiring test — design decisions

Author: **zafar** · Last updated: **2026-03-26** (today’s working session)

This file records trade-offs and intent for the clinic billing / staff flows described in `README.md`. The README asks for reasoning, not perfect answers.

---

## 1. Plan upgrade (Scenario 1)

**Decision:** Treat **Stripe webhooks** as the source of truth for subscription state in Firestore (`checkout.session.completed`, `customer.subscription.updated`), not the client after Checkout redirect.

**Why:** Prevents trusting a compromised or stale app: the client only opens Checkout; plan, `stripeSubscriptionId`, and seat caps are written when Stripe confirms payment. Proration stays on Stripe’s side.

---

## 2. Downgrade with seat conflict (Scenario 2)

**Decision:** **Block** the downgrade in the callable when `active seat members > target plan seat limit`. Return `{ strategy: 'blocked', conflictingSeats }` so the UI can ask the owner to remove or deactivate staff first.

**Why:** Queuing until period end is friendlier UX but needs extra fields (`downgradePending`), scheduled jobs, and rules for a “pending downgrade” state. Blocking keeps the data model and Stripe subscription aligned with fewer moving parts. Firestore rules should still enforce seat caps on any client-writable seat paths (see open work below).

**Rejected for now:** Queue-at-period-end without a scheduler and clear `pendingDowngrade` schema.

---

## 3. Add-ons and discounts (Scenario 3)

**Decision:** Validate every code **server-side** in Cloud Functions: load the Firestore discount doc, enforce expiry and `appliesToBase` / `appliesToAddons`, reject `WELCOME20`-style “base only” codes on add-on checkout.

**Why:** The client must never decide eligibility. For Stripe, base plan checkout uses a **coupon** on the Checkout Session. Add-on lines use a **subscription item** plus a **negative `invoice_item`** on the subscription for the first-period discount amount (Stripe does not expose a clean per-item percentage coupon in all API shapes; this keeps accounting explicit).

---

## 4. Payment failure and grace period (Scenario 4)

**Decision:** On `invoice.payment_failed`, set `subscription.status = 'grace_period'` and `gracePeriodEnd = now + 7 days` (`GRACE_PERIOD_DAYS = 7`), aligned with Stripe’s retry window.

**Why:** Owners keep access briefly while fixing the card; **no new staff** should be allowed while status is not `active` (enforce in rules + invite callable). Long-term revert to Free when Stripe cancels the subscription is handled in `customer.subscription.deleted` (deactivate non-owner seats, reset plan).

**Caveat:** Exact “day 8” behaviour depends on Stripe sending subscription deleted / final invoices; a cron to sweep past `gracePeriodEnd` is optional hardening.

---

## 5. Expired discount codes (Scenario 5)

**Decision:** **New** checkouts / add-on purchases: reject codes where `validUntil < now` or `usedCount >= usageLimit` in the callable.

**Existing subscribers:** Stripe-created **coupons** on an active subscription are left to Stripe’s billing until changed or the subscription ends. We do **not** strip historical Stripe discounts from this codebase automatically; stripping on next invoice would be a separate webhook/policy choice.

**UI:** `DiscountTag` + `isDiscountValid` already surface expiry; clinic `activeDiscounts` can still list historical codes for transparency.

---

## 6. Session invalidation when staff is removed (Scenario 6)

**Decision:** **`admin.auth().revokeRefreshTokens(uid)`** after a Firestore transaction that clears `clinicId`, sets role to `patient`, and marks the seat `active: false`.

**Why:** Revocation forces refresh-token invalidation; ID tokens live up to ~1 hour, so **Firestore rules** should also deny privileged reads/writes unless the user’s seat doc is `active: true` (defence in depth). Custom claims are powerful but add sync complexity on every role change.

---

## 7. Staff invitation

**Decision:** Callable creates the Firebase Auth user with a random password, writes `users` + `seats/.../members` in a transaction (respecting `seats.used < seats.max` and subscription `active`/`trialing`), then returns **`generatePasswordResetLink(email)`** for the owner to pass to the invitee.

**Why:** No email provider in the test harness; the reset link is a practical hand-off for local / demo use.

---

## 8. Functions layout (maintainability)

**Decision:** Split **constants**, **Stripe singleton**, **small `lib/` helpers** (authz, discount query, seating counts), **one file per HTTPS callable**, and **one handler file per webhook event type**.

**Why:** Keeps each unit reviewable and testable; matches how a production team would evolve billing without a single 300+ line file.

---

## Open / follow-up (not fully wired in the app yet)

- Remaining client-side TODOs are mostly in `app/(app)/appointments.tsx` and `src/types/appointment.ts` (attachments + staff name resolution polish).
- For production hardening, add a scheduled cleanup task for clinics that pass `gracePeriodEnd` without a matching Stripe terminal event.

---

## Summary table

| Area              | Choice |
|-------------------|--------|
| Plan state        | Webhook-driven Firestore writes |
| Downgrade conflict| Block until seats fit target plan |
| Discounts         | Server validation; coupon (base) + invoice line (addon) |
| Payment failed    | 7-day grace; invite/addons gated on `active` |
| Expired codes     | Reject new use; Stripe handles existing coupon lifecycle |
| Removed staff     | Transaction + `revokeRefreshTokens`; rules should check `active` |
| Invites           | Auth user + transaction + password reset link |
