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

    let cachedStatus = null;

    async function getIdToken() {
        const user = window.pgFB && window.pgFB.auth && window.pgFB.auth.currentUser;
        if (!user) return null;
        return user.getIdToken();
    }

    async function callBackend(path, options) {
        if (!BACKEND_URL) {
            console.warn('PGBackend: BACKEND_URL is not set yet in account.js.');
            return null;
        }
        const token = await getIdToken();
        if (!token) return null;
        const res = await fetch(BACKEND_URL + path, Object.assign({
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
        }, options || {}));
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
            return cachedStatus;
        } catch (e) {
            console.warn('PGBackend: could not load account status:', e.message);
            return null;
        }
    }

    window.PGBackend = { me };

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
