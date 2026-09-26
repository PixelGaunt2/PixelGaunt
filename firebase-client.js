/* =====================================================================================
   PIXELGAUNT — firebase-client.js
   -------------------------------------------------------------------------------------
   Backend-free version. Runs entirely in the browser on GitHub Pages (or any static
   host) — no Cloudflare Worker required. Firebase itself (Google's servers) is the
   only "backend" here, called directly from the client using your project's public
   web config (that config is not a secret — it's meant to ship in client code; Firebase
   security is enforced by firestore.rules, not by hiding this object).

   What this file does:
     1. Initializes Firebase Auth + Firestore.
     2. Wires the "Login with Google" button (#google-login-btn) on every page.
     3. On sign-in, creates/updates the user's Firestore doc (users/{uid}) with ONLY the
        fields firestore.rules allow the client to write: email, displayName, photoURL,
        lastLogin. Plan/role/quota fields are left alone here — they're server-only
        fields; without a backend Worker they simply don't exist yet, and the dashboard
        shows the honest FREE-plan defaults instead of inventing numbers.
     4. Exposes window.pgFB.auth / window.pgFB.db so account.js and dashboard.js keep
        working unchanged, and dispatches the same 'pg-auth' CustomEvent they listen for.

   SETUP (one-time): paste your Firebase project's web config below. Find it at
   https://console.firebase.google.com → your project → ⚙ Project settings →
   General tab → "Your apps" → the web app (</>) → SDK setup and configuration.
   ===================================================================================== */
(function () {
  'use strict';

  // ---- 1. PASTE YOUR FIREBASE WEB CONFIG HERE ------------------------------------------
  const firebaseConfig = {
    apiKey: 'PASTE_YOUR_API_KEY',
    authDomain: 'pixelgaunt-e5235.firebaseapp.com',
    projectId: 'pixelgaunt-e5235',
    storageBucket: 'pixelgaunt-e5235.appspot.com',
    messagingSenderId: 'PASTE_YOUR_SENDER_ID',
    appId: 'PASTE_YOUR_APP_ID'
  };
  // ---------------------------------------------------------------------------------------

  if (typeof firebase === 'undefined') {
    console.error('firebase-client.js: the Firebase SDK <script> tags must load before this file.');
    return;
  }
  if (firebaseConfig.apiKey.indexOf('PASTE_YOUR') === 0) {
    console.warn('firebase-client.js: firebaseConfig is still a placeholder — fill in your real values (see comment at the top of this file).');
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // Expose in the same shape account.js / dashboard.js already expect.
  window.pgFB = { auth, db };

  function toggleDashboardLink(signedIn) {
    const link = document.getElementById('dashboard-nav-link');
    if (link) link.classList.toggle('pg-hidden', !signedIn);
  }

  // Idempotent: safe on every login. Only touches the four fields the client is
  // allowed to write per firestore.rules — never plan/role/quota/suspended.
  async function upsertUserDoc(user) {
    try {
      const ref = db.collection('users').doc(user.uid);
      const snap = await ref.get();
      const data = {
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        lastLogin: new Date().toISOString()
      };
      if (!snap.exists) {
        await ref.set(Object.assign({ uid: user.uid }, data));
      } else {
        await ref.set(data, { merge: true });
      }
    } catch (e) {
      // Never block sign-in on this — worst case the dashboard just shows defaults.
      console.warn('firebase-client.js: could not write user doc:', e.message);
    }
  }

  auth.onAuthStateChanged((user) => {
    toggleDashboardLink(!!user);
    if (user) upsertUserDoc(user);
    window.dispatchEvent(new CustomEvent('pg-auth', { detail: { user } }));
  });

  function wireGoogleLogin() {
    const btn = document.getElementById('google-login-btn');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
        const modal = document.getElementById('login-modal');
        if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        if (location.hash === '#login') history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {
        console.error('Google sign-in failed:', e);
        window.alert('Sign-in failed: ' + (e.message || 'please try again.'));
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireGoogleLogin);
  } else {
    wireGoogleLogin();
  }
})();
