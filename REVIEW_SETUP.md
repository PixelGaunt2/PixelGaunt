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
