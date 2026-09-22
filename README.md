# PIXELGAUNT backend worker — phase 1 (foundation)

This is a small Cloudflare Worker that is the one trusted place allowed to
set a user's **plan, role, subscription status, and quota counters**. The
browser can read that data but can never write it — the updated
`firestore.rules` in this delivery lock those fields to server-only writes.

No npm dependencies. No Firebase Admin SDK (it can't run in a Worker) — auth
tokens are verified and Firestore is read/written by hand using Web Crypto
and plain `fetch`, which is why the code looks a little more manual than a
typical Node backend.

## What this phase does NOT do yet

- No Stripe integration — `/init-user` sets everyone to plan `FREE`. Real
  Pro subscriptions (checkout + webhook) are phase 2.
- No quota *enforcement* on uploads yet — `platform.js` isn't wired to this
  worker yet. That's also phase 2, once there's a real plan to enforce.
- The admin dashboard UI doesn't exist yet — only the backend endpoints
  (`/admin/*`) it will call.

## 1. Create a service account for Firestore access

This worker needs to act as a trusted server, the way the Firebase Admin
SDK would. That identity is a **Google Cloud service account**, not your
personal Firebase login.

1. Open the [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts) for your Firebase project (`pixelgaunt-e5235`).
2. **Create Service Account** → name it something like `pixelgaunt-backend`.
3. Grant it the role **Cloud Datastore User** (`roles/datastore.user`) — this
   is enough to read/write Firestore, and nothing more. Don't grant it
   Editor/Owner.
4. Open the new service account → **Keys** → **Add Key** → **Create new key** → JSON.
   A `.json` file downloads. **Never commit this file to GitHub.**

## 2. Install Wrangler and log in

```bash
npm install -g wrangler
wrangler login
```

## 3. Set the secrets

From inside this `pixelgaunt-backend` folder:

```bash
# Paste the ENTIRE contents of the service account JSON file as one line
wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON

# A random string only you know — used once to create the first admin.
# Generate one with: openssl rand -hex 24
wrangler secret put BOOTSTRAP_ADMIN_KEY
```

`FIREBASE_PROJECT_ID` and `ALLOWED_ORIGIN` are already set as plain
(non-secret) `[vars]` in `wrangler.toml` — edit `ALLOWED_ORIGIN` there if
you test from somewhere other than `https://pixelgaunt.com` (e.g. a local
server or a `*.github.io` preview URL).

## 4. Deploy

```bash
wrangler deploy
```

This prints a URL like `https://pixelgaunt-backend.<your-subdomain>.workers.dev`.
You'll need it in step 6.

## 5. Deploy the updated Firestore rules

The `firestore.rules` in this delivery adds a `users/{uid}` section (your
existing rules didn't have one — see the note in the summary). Deploy it
with the Firebase CLI, or paste it into **Firebase Console → Firestore
Database → Rules**:

```bash
firebase deploy --only firestore:rules
```

## 6. Wire up the frontend

Copy `account.js` (in this delivery) into your site's repo root, next to
`firebase-auth.js`. Open it and set:

```js
const BACKEND_URL = 'https://pixelgaunt-backend.<your-subdomain>.workers.dev';
```

`index.html` and `games.html` have already been updated to load it after
`firebase-auth.js`. It automatically calls `/init-user` the moment someone
signs in, and exposes `window.PGBackend.me()` for any future dashboard code
to read plan/quota/role status from.

## 7. Create your admin account

1. Sign in to the live site once with the Google account you want as admin.
2. Open the browser console on the site and run `firebase.auth().currentUser.uid`
   — or simpler, open **Firebase Console → Firestore → users** and copy the
   document ID of your user.
3. Run:

```bash
curl -X POST https://pixelgaunt-backend.<your-subdomain>.workers.dev/admin/bootstrap \
  -H "X-Bootstrap-Key: <the BOOTSTRAP_ADMIN_KEY you set>" \
  -H "Content-Type: application/json" \
  -d '{"uid":"<your uid>"}'
```

This only works once — it refuses if an admin already exists. After this,
promote/demote anyone else via `POST /admin/set-role` (requires an admin's
ID token), not the bootstrap route.

Consider rotating `BOOTSTRAP_ADMIN_KEY` (`wrangler secret put BOOTSTRAP_ADMIN_KEY`
again with a new value) once you've bootstrapped your admin, so the original
key is no longer useful even if it leaked somewhere.

## Testing locally

```bash
wrangler dev
```

Point `BACKEND_URL` in `account.js` at the printed `http://localhost:8787`
URL, and set `ALLOWED_ORIGIN` in `wrangler.toml` to wherever you're serving
the site from locally (e.g. `http://localhost:5500`) while testing.

## Creator Dashboard (new: `dashboard.html` + `dashboard.js`)

A signed-in-only dashboard page. It renders real data from exactly one source -
`window.PGBackend.me()` (the `/me` endpoint above) - for account/plan/quota/storage.
Games, plays, earnings, tournament results and asset sales are shown as real `0` /
"No data yet", because the systems that would generate that data (upload pipeline,
analytics events, earnings ledger, tournament engine, asset marketplace) don't exist
yet - nothing on this page is randomised or invented. My Games, Upload Game, Earnings,
Tournaments, My Assets, Asset Sales and Settings show an explicit "not built yet"
placeholder instead of a broken or misleading UI.

`/me` was extended to also return `email` and `createdAt` (both already stored, just
not previously returned) for the Profile panel - **redeploy the worker** (`wrangler
deploy`) for that change to take effect.

This page makes a few assumptions about files that weren't in this delivery
(`firebase-auth.js`, `script.js`, `style.css`) since it only extends what was
provided. Worth verifying against your actual copies of those files:
- `window.pgFB.auth` is a real Firebase Auth instance exposing `.currentUser` and
  `.signOut()` (matches how `account.js` already uses `.getIdToken()` on it).
- `window` dispatches a `pg-auth` CustomEvent with `detail.user` on sign-in/out
  (`account.js` already relies on this).
- A `#google-login-btn` element anywhere on the page is enough to trigger Google
  sign-in - i.e. that handler is bound globally in `firebase-auth.js`, not only
  inside the `#login-modal` markup in `index.html`. If it's actually bound only
  inside that modal, swap the button on `dashboard.html`'s signed-out screen for
  a direct call into whatever function `index.html`'s modal button calls.
- `style.css` defines `.pg-hidden`, `.plan-card`, `.plan-features`, `.feature-item`,
  `.action-btn`, `.opt-btn`, `.nav-btn`, `.subscription-grid`, `.pixel-font` and the
  `--neon-cyan` / `--neon-purple` / `--text-muted` variables - all reused as-is,
  none redefined, so the dashboard should match the rest of the site automatically.

`index.html` and `games.html` each got one added (initially hidden) "Dashboard" nav
link, and `account.js` got a few lines to reveal it once someone's actually signed
in - nothing else on either page was touched.

## Login / dashboard reliability fixes (this delivery)

Addressing the "auto-connected/suspended account" and "stuck on Loading your dashboard"
reports from the original brief:

- **No hardcoded account, anywhere.** I searched every file in this delivery for a
  hardcoded email, UID, mock user, or auth bypass — there isn't one. `pixelgaunt@gmail.com`
  only ever appears as the support contact address, including in the dashboard's suspended
  banner ("Your account is currently suspended. Contact pixelgaunt@gmail.com..."). If a
  test account showed as suspended, that's `users/{uid}.suspended: true` in Firestore for
  *that* account — real state, not a bug — check that doc directly.
- **The dashboard can no longer hang forever.** Previously, `/me` had no timeout: if the
  fetch (or the Firebase `getIdToken()` call before it) stalled, `loadAndRender()` never
  resolved and the page stayed on "Loading your dashboard..." indefinitely. Every backend
  call in `account.js` (`/me`, `/init-user`, `/payments/*`, `/admin/*`) now aborts and fails
  with a clear message after 12 seconds — it can never hang past that.
- **A real error screen with Retry**, not just a stuck spinner. `#dash-error` now shows the
  *actual* reason (timeout, not signed in, 401, backend not configured, etc. — via the new
  `PGBackend.meError()`) and a **Retry** button that re-runs the load, instead of requiring a
  full page refresh.
- **Sign Out can't hang either.** It now redirects to `index.html` on a 4-second safety
  timer regardless of whether Firebase's `signOut()` call itself resolves, so a stalled
  network can't strand someone on a signed-in-looking page after they've clicked Sign Out.

**What I could NOT verify or fix in this phase:** the actual Google-sign-in button/flow,
session persistence config, and any login-modal logic all live in `firebase-auth.js` and
`script.js` — neither is in this delivery, so I can't confirm what triggers sign-in on
`index.html`/`games.html` or audit it for the described bug there. If the auto-connect
behavior is happening *before* the dashboard (e.g. on the homepage itself), send me those
two files plus `style.css` and I'll audit them directly.

## Endpoints reference

| Method | Path                        | Auth                 | Purpose                                   |
|--------|-----------------------------|-----------------------|--------------------------------------------|
| POST   | `/init-user`                | signed-in user        | Create account record with safe defaults   |
| GET    | `/me`                       | signed-in user        | Safe plan/quota/role status                |
| GET    | `/payment-methods`          | signed-in user        | Manual-payment instructions per method (or "Not yet configured") |
| POST   | `/payments/submit`          | signed-in user        | Submit a manual-payment reference for review, status `PENDING` |
| GET    | `/payments/mine`            | signed-in user        | Your own past submissions and their status |
| GET    | `/admin/payments`           | admin's ID token       | List submissions, optionally `?status=PENDING` |
| POST   | `/admin/payments/decision`  | admin's ID token       | `{id, decision: APPROVED\|REJECTED, note?}` — approving flips the account to PRO for 30 days |
| POST   | `/admin/bootstrap`          | `X-Bootstrap-Key`     | One-time: create the first admin           |
| POST   | `/admin/set-role`           | admin's ID token       | Promote/demote a user                      |
| GET    | `/admin/users`              | admin's ID token       | Basic user listing                         |

## Manual Payment (Pakistan) — how it works

1. A signed-in creator opens **Dashboard → Subscription → Upgrade to Creator Pro**, which reveals
   the manual-payment methods (Easypaisa, Meezan Bank, Bank Alfalah, NayaPay, SadaPay) and a form.
   Each method's instructions come from `PAYMENT_INFO_<METHOD>` secrets (see `wrangler.toml`) —
   until you set them, the dashboard honestly shows "Not yet configured" instead of a fake number.
2. They send the payment themselves (outside this system — there's no payment gateway here) and
   submit the transaction reference, amount, date, and optionally a proof link and notes. This
   calls `POST /payments/submit`, which creates a `payments/{id}` Firestore doc with `status:
   PENDING`. **Nothing about their plan changes at this point.**
3. An admin (someone whose `users/{uid}.role == 'admin'`, set via `/admin/bootstrap` or
   `/admin/set-role`) opens the new **Admin: Payments** dashboard tab — only visible to admins —
   and reviews pending submissions against their own bank/wallet records.
4. Approving calls `POST /admin/payments/decision` with `{id, decision: 'APPROVED'}`. Only then
   does the Worker set `plan: 'PRO'`, `subscriptionStatus: 'active'`, a 30-day billing period, and
   reset the period's usage counters — all server-side, via the service account. Rejecting records
   a `REJECTED` status and an optional note; the creator sees both on their Subscription tab.
5. A submission can only be decided once (`PENDING`/`UNDER_REVIEW` → `APPROVED`/`REJECTED`) — the
   Worker refuses to re-decide an already-decided one, so a double-click can't double-extend a plan.

`firestore.rules` denies the client **all** direct read/write access to the `payments` collection
— every access goes through the Worker (service account), the same trust model already used for
`users/{uid}`'s plan/role/quota fields. This is deliberately modular: swapping in Stripe later
means adding a webhook route that also calls the same "approve" logic — the dashboard, rules, and
data model here don't need to change.

**Known limitation in this phase:** the "proof" field is a pasted link (e.g. to a Drive/Photos
screenshot), not a direct file upload — this delivery doesn't include `firebase-auth.js`, so I
can't confirm Firebase Storage is initialized on the client to wire a real upload button yet.
