# PixelGaunt manual review - setup

What you need to do, in order. Nothing below is done for you: the code is in place, but it cannot reach
your Google Drive or Firebase until you add these settings.

## 1. Firebase (2 minutes)
1. Firestore -> Rules: paste the new `firestore.rules` and Publish.
2. Firestore -> create document `admins/<YOUR Firebase UID>` (any field, e.g. note: "owner"). Your UID is in
   Authentication -> Users. Only documents created here make someone an admin; the browser cannot write to `admins`.
3. Project settings -> Service accounts -> Generate new private key. Keep the JSON file; it goes into the Worker (step 3).
4. Subscribers: set `users/<uid>.plan = "subscriber"` in the console (no payment gateway writes this yet).

## 2. Google Cloud (Drive)
1. console.cloud.google.com -> use the project linked to Firebase (or a new one) -> APIs & Services -> Library ->
   enable **Google Drive API**.
2. OAuth consent screen: choose External, fill the app name and your email, add yourself as a test user, then
   **Publish app (In production)**. While it says "Testing", Google expires the refresh token after 7 days.
3. Credentials -> Create credentials -> OAuth client ID -> type **Web application**. Add this authorised redirect URI:
   `https://developers.google.com/oauthplayground`
   Copy the Client ID and Client secret.
4. Get the refresh token with the PixelGaunt Google account (the Drive that should hold the games):
   open https://developers.google.com/oauthplayground -> gear icon -> tick "Use your own OAuth credentials" and paste
   the Client ID/secret -> in Step 1 enter the scope `https://www.googleapis.com/auth/drive.file` -> Authorize APIs,
   sign in with the PixelGaunt account -> Step 2 "Exchange authorization code for tokens" -> copy the **Refresh token**.

## 3. Deploy the Worker (free Cloudflare account)
1. `npm create cloudflare@latest pg-review -- --type=hello-world`, replace its worker file with `pg-review-worker.js`
   (from this project), then `npx wrangler deploy`.
2. Worker -> Settings -> Variables and Secrets:

| Name | Type | Value |
|---|---|---|
| FIREBASE_PROJECT_ID | Text | pixelgaunt-e5235 |
| ALLOWED_ORIGINS | Text | https://pixelgaunt.com,https://www.pixelgaunt.com |
| FIREBASE_SA_JSON | Secret | whole contents of the service-account JSON from 1.3 |
| GOOGLE_OAUTH_CLIENT_ID | Secret | from 2.3 |
| GOOGLE_OAUTH_CLIENT_SECRET | Secret | from 2.3 |
| GOOGLE_OAUTH_REFRESH_TOKEN | Secret | from 2.4 |

3. Open `https://<your-worker>.workers.dev/health` - every value should say true (it never shows the values).

## 4. Point the site at it
In `platform.js` set `reviewEndpoint: 'https://<your-worker>.workers.dev'` (no trailing slash), commit, push.
That URL is public by design; it holds no secret.

## 5. Verify
1. Sign in as yourself -> Creator Studio -> **Admin Review** tab appears -> **Check Drive connection**.
   Drive now has `PixelGaunt Game Submissions/Pending`, `Approved`, `Rejected`.
2. Submit a test game from a normal (non-admin) account. Creator Studio -> My Games shows **Pending Review**.
3. In Drive, `PixelGaunt Game Submissions/Pending/<Game>_<User>_<date>_<id>/` holds `game.zip` and `submission-info.json`.
4. Admin Review -> Download package -> Approve (moves to Approved, appears on the Games page) or Reject (reason required,
   shown to the developer, folder moves to Rejected).
