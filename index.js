/* =====================================================================================
   PIXELGAUNT BACKEND WORKER  -  phase 1: trusted server foundation
   -------------------------------------------------------------------------------------
   This is the one place in the whole system that is allowed to set a user's plan,
   role, subscription status, or quota counters. The Firestore rules deployed
   alongside this deny the browser client from ever writing those fields directly -
   only a request authenticated as the service account configured below (i.e. this
   Worker) can touch them.

   Endpoints (all CORS-enabled for ALLOWED_ORIGIN):
     POST /init-user        (signed-in user)  create the user's account record on first
                                               login, with safe defaults. No-op if it
                                               already has a plan (never resets a Pro
                                               user back to Free, never demotes an admin).
     GET  /me                (signed-in user)  safe subscription/quota status for the
                                               dashboard - never trust a client-side copy.
     POST /admin/bootstrap   (bootstrap key)   one-time: promote the very first admin.
                                               Refuses if any admin already exists.
     POST /admin/set-role    (admin only)      promote/demote a user by uid.
     GET  /admin/users       (admin only)      basic user listing for the admin dashboard.

   Nothing here talks to Stripe yet - that's phase 2, and will add a webhook route
   plus real values for subscriptionStatus/billingPeriodEnd instead of the FREE
   defaults set below.
   ===================================================================================== */

import { verifyFirebaseIdToken } from './firebaseAuth.js';
import { getDoc, patchDoc, createDoc, listCollection, queryEquals } from './firestore.js';
import { json, corsHeaders } from './util.js';

function computeLimits(plan) {
  return plan === 'PRO'
    ? { maxGamesPerPeriod: 10, maxGameSizeMB: 100 }
    : { maxGamesPerPeriod: 1, maxGameSizeMB: 5 };
}

/* =====================================================================================
   MANUAL PAYMENT (Pakistan) - phase 1
   -------------------------------------------------------------------------------------
   A creator submits proof of a manual bank/wallet transfer; an admin reviews it and,
   only on approval, this Worker (never the client) upgrades the account to PRO. The
   real account numbers/IBANs/phone numbers for each method are NOT hard-coded here -
   they're read from env vars set with `wrangler secret put PAYMENT_INFO_<METHOD>`
   (see README). Until an admin configures one, its instructions read "Not yet
   configured" instead of inventing a fake number.
   ===================================================================================== */
const PAYMENT_METHODS = ['EASYPAISA', 'MEEZAN_BANK', 'BANK_ALFALAH', 'NAYAPAY', 'SADAPAY'];
const PAYMENT_METHOD_LABELS = {
  EASYPAISA: 'Easypaisa',
  MEEZAN_BANK: 'Meezan Bank',
  BANK_ALFALAH: 'Bank Alfalah',
  NAYAPAY: 'NayaPay',
  SADAPAY: 'SadaPay'
};
const PAYMENT_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

function paymentMethodsConfig(env) {
  return PAYMENT_METHODS.map((id) => ({
    id,
    label: PAYMENT_METHOD_LABELS[id],
    instructions: env[`PAYMENT_INFO_${id}`] || 'Not yet configured — check back soon or contact pixelgaunt@gmail.com.'
  }));
}

function isNonEmptyString(v, maxLen) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= maxLen;
}

async function requireUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = /^Bearer (.+)$/.exec(auth);
  if (!m) throw { status: 401, message: 'Missing bearer token' };
  try {
    return await verifyFirebaseIdToken(m[1], env.FIREBASE_PROJECT_ID);
  } catch (e) {
    throw { status: 401, message: 'Invalid or expired token: ' + e.message };
  }
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  const doc = await getDoc(env, `users/${user.uid}`);
  if (!doc || doc.role !== 'admin') throw { status: 403, message: 'Admin only' };
  if (doc.suspended) throw { status: 403, message: 'Account suspended' };
  return user;
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
      // ---- POST /init-user ------------------------------------------------------------
      if (url.pathname === '/init-user' && request.method === 'POST') {
        const user = await requireUser(request, env);
        const existing = await getDoc(env, `users/${user.uid}`);
        if (!existing || existing.plan === undefined) {
          await patchDoc(env, `users/${user.uid}`, {
            role: (existing && existing.role) || 'user',
            plan: 'FREE',
            subscriptionStatus: 'none',
            billingPeriodStart: new Date().toISOString(),
            billingPeriodEnd: null,
            gamesUploadedThisPeriod: 0,
            storageUsedThisPeriod: 0,
            suspended: (existing && existing.suspended) || false,
            createdAt: (existing && existing.createdAt) || new Date().toISOString(),
            email: user.email || (existing && existing.email) || null
          });
        }
        return json({ ok: true }, 200, origin);
      }

      // ---- GET /me ----------------------------------------------------------------------
      if (url.pathname === '/me' && request.method === 'GET') {
        const user = await requireUser(request, env);
        const doc = await getDoc(env, `users/${user.uid}`);
        if (!doc) return json({ error: 'No account record yet; call /init-user first.' }, 404, origin);
        const plan = doc.plan || 'FREE';
        return json(
          {
            uid: user.uid,
            email: doc.email || user.email || null,
            createdAt: doc.createdAt || null,
            role: doc.role || 'user',
            plan,
            subscriptionStatus: doc.subscriptionStatus || 'none',
            billingPeriodStart: doc.billingPeriodStart || null,
            billingPeriodEnd: doc.billingPeriodEnd || null,
            gamesUploadedThisPeriod: doc.gamesUploadedThisPeriod || 0,
            storageUsedThisPeriod: doc.storageUsedThisPeriod || 0,
            suspended: !!doc.suspended,
            limits: computeLimits(plan)
          },
          200,
          origin
        );
      }

      // ---- GET /payment-methods -----------------------------------------------------------
      // Signed-in only (it's only ever shown inside the dashboard today), but reveals no
      // secrets - just per-method instructions, or "Not yet configured".
      if (url.pathname === '/payment-methods' && request.method === 'GET') {
        await requireUser(request, env);
        return json({ methods: paymentMethodsConfig(env) }, 200, origin);
      }

      // ---- POST /payments/submit -----------------------------------------------------------
      // Creates a PENDING manual-payment submission. uid/email/status/targetPlan/createdAt
      // are all set server-side - never trusted from the request body. Does NOT touch the
      // user's plan; only an admin approval does that (see /admin/payments/decision).
      if (url.pathname === '/payments/submit' && request.method === 'POST') {
        const user = await requireUser(request, env);
        const body = await request.json().catch(() => ({}));

        if (!PAYMENT_METHODS.includes(body.method)) {
          return json({ error: 'method must be one of: ' + PAYMENT_METHODS.join(', ') }, 400, origin);
        }
        if (!isNonEmptyString(body.transactionRef, 100)) {
          return json({ error: 'transactionRef (transaction ID/reference) is required, max 100 chars' }, 400, origin);
        }
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
          return json({ error: 'amount must be a positive number' }, 400, origin);
        }
        if (!isNonEmptyString(body.paymentDate, 40)) {
          return json({ error: 'paymentDate is required' }, 400, origin);
        }
        if (body.proofUrl && !isNonEmptyString(body.proofUrl, 500)) {
          return json({ error: 'proofUrl is too long' }, 400, origin);
        }
        if (body.notes && !isNonEmptyString(body.notes, 500)) {
          return json({ error: 'notes must be 500 characters or fewer' }, 400, origin);
        }

        const doc = await createDoc(env, 'payments', {
          uid: user.uid,
          email: user.email || null,
          method: body.method,
          transactionRef: body.transactionRef.trim(),
          amount,
          currency: 'PKR',
          paymentDate: body.paymentDate.trim(),
          proofUrl: body.proofUrl ? body.proofUrl.trim() : null,
          notes: body.notes ? body.notes.trim() : null,
          targetPlan: 'PRO',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          reviewedAt: null,
          reviewedBy: null,
          reviewNote: null
        });
        return json({ ok: true, id: doc.id }, 200, origin);
      }

      // ---- GET /payments/mine --------------------------------------------------------------
      if (url.pathname === '/payments/mine' && request.method === 'GET') {
        const user = await requireUser(request, env);
        const mine = await queryEquals(env, 'payments', 'uid', user.uid, 50);
        mine.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return json({ payments: mine }, 200, origin);
      }

      // ---- GET /admin/payments -------------------------------------------------------------
      if (url.pathname === '/admin/payments' && request.method === 'GET') {
        await requireAdmin(request, env);
        const statusFilter = url.searchParams.get('status');
        let rows;
        if (statusFilter) {
          if (!PAYMENT_STATUSES.includes(statusFilter)) {
            return json({ error: 'status must be one of: ' + PAYMENT_STATUSES.join(', ') }, 400, origin);
          }
          rows = await queryEquals(env, 'payments', 'status', statusFilter, 100);
        } else {
          rows = await listCollection(env, 'payments', 100);
        }
        rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return json({ payments: rows }, 200, origin);
      }

      // ---- POST /admin/payments/decision ----------------------------------------------------
      // The ONLY place a submission's status can change, and the ONLY place a manual
      // payment can turn into a PRO upgrade. Refuses to re-decide an already-decided
      // submission, so double-clicking Approve can't double-extend a billing period.
      if (url.pathname === '/admin/payments/decision' && request.method === 'POST') {
        const admin = await requireAdmin(request, env);
        const body = await request.json().catch(() => ({}));
        if (!isNonEmptyString(body.id, 200)) {
          return json({ error: 'id is required' }, 400, origin);
        }
        if (!['APPROVED', 'REJECTED'].includes(body.decision)) {
          return json({ error: 'decision must be APPROVED or REJECTED' }, 400, origin);
        }
        const note = body.note && isNonEmptyString(body.note, 500) ? body.note.trim() : null;

        const payment = await getDoc(env, `payments/${body.id}`);
        if (!payment) return json({ error: 'Payment submission not found' }, 404, origin);
        if (payment.status !== 'PENDING' && payment.status !== 'UNDER_REVIEW') {
          return json({ error: `Already decided (status: ${payment.status})` }, 409, origin);
        }

        await patchDoc(env, `payments/${body.id}`, {
          status: body.decision,
          reviewedAt: new Date().toISOString(),
          reviewedBy: admin.uid,
          reviewNote: note
        });

        if (body.decision === 'APPROVED') {
          const now = new Date();
          const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await patchDoc(env, `users/${payment.uid}`, {
            plan: 'PRO',
            subscriptionStatus: 'active',
            billingPeriodStart: now.toISOString(),
            billingPeriodEnd: periodEnd.toISOString(),
            gamesUploadedThisPeriod: 0,
            storageUsedThisPeriod: 0
          });
        }

        return json({ ok: true }, 200, origin);
      }

      // ---- POST /admin/bootstrap ---------------------------------------------------------
      // Guarded by a secret only the site owner has (set via `wrangler secret put`), and
      // refuses outright once any admin already exists - so even a leaked key later can't
      // be used to add a second, unauthorized admin.
      if (url.pathname === '/admin/bootstrap' && request.method === 'POST') {
        const key = request.headers.get('X-Bootstrap-Key') || '';
        if (!env.BOOTSTRAP_ADMIN_KEY || key !== env.BOOTSTRAP_ADMIN_KEY) {
          return json({ error: 'Forbidden' }, 403, origin);
        }
        const admins = await queryEquals(env, 'users', 'role', 'admin', 1);
        if (admins.length > 0) {
          return json({ error: 'An admin already exists. Use /admin/set-role instead.' }, 409, origin);
        }
        const body = await request.json().catch(() => ({}));
        if (!body.uid) return json({ error: 'uid required' }, 400, origin);
        const existing = await getDoc(env, `users/${body.uid}`);
        if (!existing) {
          return json({ error: 'No user record for that uid yet - sign in on the site at least once first.' }, 404, origin);
        }
        await patchDoc(env, `users/${body.uid}`, { role: 'admin' });
        return json({ ok: true }, 200, origin);
      }

      // ---- POST /admin/set-role -----------------------------------------------------------
      if (url.pathname === '/admin/set-role' && request.method === 'POST') {
        await requireAdmin(request, env);
        const body = await request.json().catch(() => ({}));
        if (!body.uid || !['user', 'admin'].includes(body.role)) {
          return json({ error: 'uid and role ("user" or "admin") are required' }, 400, origin);
        }
        await patchDoc(env, `users/${body.uid}`, { role: body.role });
        return json({ ok: true }, 200, origin);
      }

      // ---- GET /admin/users ----------------------------------------------------------------
      if (url.pathname === '/admin/users' && request.method === 'GET') {
        await requireAdmin(request, env);
        const users = await listCollection(env, 'users', 100);
        return json(
          {
            users: users.map((u) => ({
              uid: u.id,
              email: u.email,
              plan: u.plan,
              role: u.role,
              subscriptionStatus: u.subscriptionStatus,
              suspended: !!u.suspended,
              gamesUploadedThisPeriod: u.gamesUploadedThisPeriod,
              storageUsedThisPeriod: u.storageUsedThisPeriod
            }))
          },
          200,
          origin
        );
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (err) {
      const status = (err && err.status) || 500;
      const message = (err && err.message) || 'Internal error';
      if (status === 500) console.error(err);
      return json({ error: message }, status, origin);
    }
  }
};
