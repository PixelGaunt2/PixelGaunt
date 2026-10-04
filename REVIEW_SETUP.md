# PixelGaunt manual review - setup

**Delivery (both REQUIRED, tracked separately):**
1. **Google Drive** of `alyhayder922@gmail.com` receives the complete game package (`game.zip`, every file and folder exactly as
   uploaded) plus `submission-info.json`, in `PixelGaunt Game Submissions/Pending/<game>_<developer>_<date>_<id>/`.
2. **Email** to `pixelgaunt@gmail.com` with all submission details and the Drive download link.

The ZIP is no longer attached to the email: Gmail refuses incoming mail whose attachments (including files inside a .zip)
contain `.js` and other script files. Resend accepted those messages, Gmail then rejected them, and the site still showed success.

A submission becomes `pending_review` only when Drive AND email both succeeded. Otherwise it is `drive_failed`, `email_failed`
or `submission_failed`, the developer sees which step failed, and pressing Submit again retries only the failed step.

## 1. Firebase
1. Firestore -> Rules: paste the `firestore.rules` from this project and **Publish**. (The site writes playable copies as
   `pending_review`; older rules reject that, and had no `users` rule, so profiles/plans were never saved.)
2. Firestore -> create document `admins/<YOUR Firebase UID>` (any field). Your UID is in Authentication -> Users.
3. Project settings -> Service accounts -> Generate new private key. Keep the JSON for the Worker (`FIREBASE_SA_JSON`).
4. Authentication -> Settings -> Authorized domains: `pixelgaunt.com` and `www.pixelgaunt.com` must be listed.
5. Only if you restricted the Browser API key (Google Cloud -> APIs & Services -> Credentials): its API list must include
   **Identity Toolkit API** and **Token Service API**. If Token Service API is missing, Firebase silently ends every session
   about an hour after login (the SDK clears the user on any non-network token error).

## 2. Google Drive (REQUIRED) - account alyhayder922@gmail.com
1. console.cloud.google.com -> the Firebase project -> APIs & Services -> Library -> enable **Google Drive API**.
2. OAuth consent screen: External, add `alyhayder922@gmail.com` as test user, then **Publish app (In production)**.
   While it says "Testing", Google expires the refresh token after 7 days and Drive uploads start failing.
3. Credentials -> Create credentials -> OAuth client ID -> **Web application**, authorised redirect URI
   `https://developers.google.com/oauthplayground`. Copy Client ID and Client secret.
4. https://developers.google.com/oauthplayground -> gear icon -> "Use your own OAuth credentials" (paste ID/secret) ->
   scope `https://www.googleapis.com/auth/drive.file` -> Authorize APIs -> **sign in as alyhayder922@gmail.com** ->
   "Exchange authorization code for tokens" -> copy the **Refresh token**.
   The Worker checks which account the token belongs to on every submission and fails loudly if it is not
   alyhayder922@gmail.com (files would otherwise land in a different Drive).

## 3. Email (REQUIRED) - Resend
1. Resend (https://resend.com) only lets the test sender `onboarding@resend.dev` send to the email address that owns the Resend
   account. So either create the Resend account **as pixelgaunt@gmail.com**, or verify a domain you own (e.g. pixelgaunt.com) in
   Resend and set `REVIEW_EMAIL_FROM` to an address on it.
2. API Keys -> Create API key. "Sending access" works. "Full access" additionally lets the Worker read back the delivery
   status for a few seconds and report a bounce instead of "accepted".

## 4. Worker settings (Cloudflare -> pg-review -> Settings -> Variables and Secrets), then redeploy `pg-review-worker.js`

| Name | Type | Value |
|---|---|---|
| FIREBASE_PROJECT_ID | Text | pixelgaunt-e5235 |
| ALLOWED_ORIGINS | Text | https://pixelgaunt.com,https://www.pixelgaunt.com |
| FIREBASE_SA_JSON | Secret | whole service-account JSON from 1.3 |
| GOOGLE_OAUTH_CLIENT_ID | Secret | from 2.3 |
| GOOGLE_OAUTH_CLIENT_SECRET | Secret | from 2.3 |
| GOOGLE_OAUTH_REFRESH_TOKEN | Secret | from 2.4 (issued by alyhayder922@gmail.com) |
| RESEND_API_KEY | Secret | from 3.2 |
| DRIVE_EXPECTED_ACCOUNT | Text (optional) | alyhayder922@gmail.com (this is the default) |
| REVIEW_EMAIL_TO / REVIEW_EMAIL_FROM | Text (optional) | defaults: pixelgaunt@gmail.com / `PixelGaunt Review <onboarding@resend.dev>` |

Open `https://pg-review.pixelgaunt.workers.dev/health` - every value must say true (values are never shown).
`platform.js` already points at `https://pg-review.pixelgaunt.workers.dev`; change `reviewEndpoint` only if your Worker URL differs.

## 5. Verify
1. Submit a small test game from a normal account. The page must say **Submission successfully sent for manual review.**
2. Drive of alyhayder922@gmail.com: `PixelGaunt Game Submissions/Pending/...` holds `game.zip` + `submission-info.json`.
3. pixelgaunt@gmail.com receives "[PixelGaunt Review] <title> - <developer>" with the Drive link (check Spam the first time).
4. If anything failed, the page names the failed step and the provider's reason; Firestore `submissions/<id>` holds
   `status`, `drive_state`/`drive_error`, `email_state`/`email_error`.

Approve / reject: the Worker exposes `POST /admin/approve` and `POST /admin/reject` (admin Firebase token required). Approval moves
the Drive folder to `Approved` and sets the game to `published`, which is what the Games page lists. This ZIP does not contain an
admin screen that calls these endpoints.

## 6. Plans and limits (enforced by the Worker - cannot be bypassed from the browser)
| `users/<uid>.plan` | Games | Max size | Price |
|---|---|---|---|
| `free` (or empty) | 1 game in total | 5 MB | - |
| `subscriber_monthly` | 10 games per month | 10 MB | $1.99 (PKR 549.97) / month |
| `subscriber_yearly` | 12 games per month = 144 per year | 10 MB | $10.99 (PKR 3,037.26) / year |

Also: 1 game per account per day, and PixelGaunt accepts 3 games per day in total (Pakistan time).
A submission that is not delivered (Drive/email failed) does not use up any limit.
Change them in `pg-review-worker.js` (`PLANS`, `USER_DAILY_MAX`, `SITE_DAILY_MAX`); the texts in `platform.js`, `creator-studio.html` and `subscription.html`.

## 7. Approving / rejecting a game (Firebase console)
Every review email shows a **Submission ID**. Firebase -> Firestore Database -> `submissions` -> that ID:
- **Approve:** set `status` to `approved`. The game is published in **Community games** on the Games page with the creator's name
  ("by <name>"), the creator sees "Published", and the Drive folder moves to `Approved`.
- **Reject:** set `status` to `rejected` and `rejection_reason` to your reason. The creator sees "Rejected" and the reason.

You only change that one document. The Worker carries the decision out the next time anyone opens the Games page (at most
30 seconds apart), and every 5 minutes if you add the Cron Trigger: Cloudflare -> pg-review -> Settings -> Triggers ->
Cron Triggers -> Add -> `*/5 * * * *`. If something prevents it, the reason is written to `decision_error` on the submission.

## 8. Payments (no gateway)
Receipts are emailed to **pixelgaunt@gmail.com** with the payment screenshot attached (Worker variable `PAYMENT_EMAIL_TO`
changes it) and saved in Firestore `payments/<receipt no.>`. Buyers must be logged in to pay and to see their receipts.

Fill in your accounts in `subscription.html` -> block **PIXELGAUNT PAYMENT SETTINGS - EDIT THESE VALUES** (account title,
number, IBAN for Meezan / Alfalah, Easypaisa, NayaPay, SadaPay). Empty accounts are hidden. `whatsapp` can stay empty; when you
add the number (digits with country code, e.g. 923001234567) a "Send receipt on WhatsApp" button appears too.

While no account numbers are filled in, buyers see: "Our official payment accounts are being set up. Please message us
on email (pixelgaunt@gmail.com) or WhatsApp to pay." They can still continue, attach their payment screenshot with a message
(transaction ID optional) and submit; you receive it by email.

To approve a payment (the email tells you the exact receipt number):
1. Check the money arrived.
2. Firebase -> Firestore -> `payments` -> `<receipt no.>` -> set `status` to `confirmed` (or `rejected` to decline).
3. That's all. The subscription the buyer chose starts automatically (when anyone next opens a page, or within 5 minutes
   with the Cron Trigger): `users/<uid>.plan` = `subscriber_monthly` (1 month) or `subscriber_yearly` (1 year), with
   `plan_expires`. Renewing the same plan early adds the time on top. After `plan_expires` the account is Free again.
   The buyer sees "Approved - active until <date>".

## 9. Checking that the Worker and Drive really work
- `https://pg-review.pixelgaunt.workers.dev/health` must show `"version": "2026-10-04c"`. If it does not, Cloudflare is still
  running an OLD copy of the Worker: paste the new `pg-review-worker.js` and press Deploy.
- `https://pg-review.pixelgaunt.workers.dev/health?check=drive` runs a live Google Drive test and tells you exactly what to fix
  (missing settings, expired token, wrong Google account, Drive API disabled). It must end with `"ok": true`.

## 10. Revenue share (90% developer / 10% PixelGaunt Studios) and plays
- **Developer Agreement:** `developer-agreement.html` (linked in every footer and on the Publish checkbox). Creators must accept
  it to submit; the accepted version is saved on each submission (`agreement_version`). If you change the agreement, change the
  version in three places: `AGREEMENT_VERSION` in `pg-review-worker.js` and `platform.js`, and the date at the top of the page.
- **Plays are counted by the Worker** for published community games only (`game_stats/<game id>`: `plays`, `players`,
  `m_YYYY_MM` = plays that month, `excluded_own`; `site_stats/plays` = all counted plays per month). NOT counted: the
  developer's own account, any device they used while logged in, their IP address (seen in the last 30 days), and repeats
  (same device within 30 min, same network within 5 min). Only salted hashes of devices / IPs are stored.
- **No ads for a developer on their own game:** `games.html` holds ad requests until it knows who is playing, and keeps them off
  for the game's owner (AdSense `pauseAdRequests`). Everyone else gets ads as normal (at most 5 seconds later).
- **Paying developers, each month:**
  1. In AdSense, note the revenue Google paid for the month.
  2. Each game's part = that revenue x (game's `m_YYYY_MM` / `site_stats/plays` `m_YYYY_MM`). Add up a developer's games.
  3. Firestore -> collection `earnings` -> Add document (any ID) with fields: `uid` (string, the developer's user ID),
     `month` (string, e.g. `2026-10`), `revenue_usd` (number, their games' part), `status` (string `pending`, later `paid`),
     optional `note`. Their dashboard (Creator Studio -> Earnings & Plays) shows it with their 90% and PixelGaunt's 10%.
  4. Pay their 90%, then set `status` to `paid`.
