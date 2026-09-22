/* =====================================================================================
   PIXELGAUNT ACCOUNT/BACKEND BRIDGE  -  phase 1
   -------------------------------------------------------------------------------------
   Talks to the pixelgaunt-backend Worker (see /pixelgaunt-backend in this delivery).
   That worker - not this file, not Firestore rules alone - is the source of truth for
   plan, role, subscription status and quota usage. This file just calls it.

   Loaded on every page after firebase-auth.js. Deliberately tiny: it does one thing on
   login (make sure the account record exists) and exposes one read function
   (window.PGBackend.me) for the creator dashboard (a later phase) to call.
   ===================================================================================== */
(function () {
    'use strict';

    // Set this after `wrangler deploy` (see pixelgaunt-backend/README.md).
    const BACKEND_URL = ''; // e.g. 'https://pixelgaunt-backend.your-subdomain.workers.dev'

    // No request (token fetch or backend call) is allowed to hang forever - that's exactly
    // how "Loading your dashboard..." used to get stuck permanently. Anything past this
    // either resolves or fails with a clear error within REQUEST_TIMEOUT_MS.
    const REQUEST_TIMEOUT_MS = 12000;

    let cachedStatus = null;
    let lastMeError = null;

    function withTimeout(promise, ms, label) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error((label || 'Request') + ' timed out. Check your connection and try again.'));
            }, ms);
            Promise.resolve(promise).then(
                (v) => { clearTimeout(timer); resolve(v); },
                (e) => { clearTimeout(timer); reject(e); }
            );
        });
    }

    async function getIdToken() {
        const user = window.pgFB && window.pgFB.auth && window.pgFB.auth.currentUser;
        if (!user) return null;
        return withTimeout(user.getIdToken(), REQUEST_TIMEOUT_MS, 'Sign-in check');
    }

    async function callBackend(path, options) {
        if (!BACKEND_URL) {
            throw new Error('Backend URL is not configured yet (see account.js / README).');
        }
        const token = await getIdToken();
        if (!token) {
            throw new Error('Not signed in.');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(BACKEND_URL + path, Object.assign({
                signal: controller.signal,
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
            }, options || {}));
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('Request timed out. Check your connection and try again.');
            throw new Error('Could not reach the backend. Check your connection and try again.');
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || ('Backend request failed (' + res.status + ')'));
        }
        return res.json();
    }

    // Idempotent: safe to call on every login. Never resets an existing plan/role.
    async function initUser() {
        try {
            await callBackend('/init-user', { method: 'POST' });
        } catch (e) {
            console.warn('PGBackend: could not initialise account record:', e.message);
        }
    }

    // Returns { plan, role, subscriptionStatus, limits, gamesUploadedThisPeriod, ... }
    // or null if signed out / backend unreachable. Cached per page load; pass
    // {fresh:true} to force a re-fetch (e.g. right after an upload).
    async function me(opts) {
        if (cachedStatus && !(opts && opts.fresh)) return cachedStatus;
        try {
            cachedStatus = await callBackend('/me', { method: 'GET' });
            lastMeError = null;
            return cachedStatus;
        } catch (e) {
            console.warn('PGBackend: could not load account status:', e.message);
            lastMeError = e.message;
            return null;
        }
    }

    // The reason the last me() call returned null (timeout, 401, network, etc.), so the
    // dashboard's error screen can show something more useful than a generic message.
    function meError() {
        return lastMeError;
    }

    // Generic authenticated call for any endpoint beyond /me (e.g. the dashboard's manual
    // payment flow: /payment-methods, /payments/submit, /payments/mine, /admin/payments*).
    // Same auth/error handling as initUser()/me() above, just not cached - callers own that.
    async function call(path, options) {
        return callBackend(path, options);
    }

    window.PGBackend = { me, call, meError };

    // Purely cosmetic: reveal the "Dashboard" nav link once someone is actually
    // signed in. Safe no-op on any page that doesn't have that element, and this
    // never gates access to the dashboard itself - dashboard.js does its own
    // sign-in check, this just avoids showing the link to a signed-out visitor.
    function toggleDashboardLink(signedIn) {
        const link = document.getElementById('dashboard-nav-link');
        if (link) link.classList.toggle('pg-hidden', !signedIn);
    }

    window.addEventListener('pg-auth', (e) => {
        cachedStatus = null;
        const signedIn = !!(e.detail && e.detail.user);
        toggleDashboardLink(signedIn);
        if (signedIn) initUser();
    });
})();
