/* Verifies a Firebase Auth ID token the way Firebase's own Admin SDK does,
   by hand - because the Admin SDK is Node-only and can't run in a Worker.
   Algorithm follows Google's documented steps for manual verification:
   https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

   This never talks to any per-project secret - the signing keys are
   Google's own public keys for the whole Firebase Auth system, so this
   file has nothing sensitive in it. */

import { b64urlToBytes, b64urlToStr } from './util.js';

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Google rotates these keys periodically; a short in-isolate cache avoids
// re-fetching on every request without risking a long-lived stale key.
let cachedKeys = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function getGoogleJWKS() {
  const now = Date.now();
  if (cachedKeys && now - cachedAt < CACHE_MS) return cachedKeys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('Could not fetch Google signing keys');
  const data = await res.json();
  cachedKeys = data.keys;
  cachedAt = now;
  return cachedKeys;
}

async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * @param {string} idToken - the Firebase ID token from `user.getIdToken()`.
 * @param {string} projectId - your Firebase project ID (e.g. "pixelgaunt-e5235").
 * @returns {Promise<{uid: string, email: string|null, emailVerified: boolean, claims: object}>}
 */
export async function verifyFirebaseIdToken(idToken, projectId) {
  if (!idToken || typeof idToken !== 'string' || idToken.split('.').length !== 3) {
    throw new Error('Malformed token');
  }
  const [headerB64, payloadB64, sigB64] = idToken.split('.');
  const header = JSON.parse(b64urlToStr(headerB64));
  const payload = JSON.parse(b64urlToStr(payloadB64));

  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm');

  const keys = await getGoogleJWKS();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown signing key (token may be forged or keys just rotated)');

  const key = await importPublicKey(jwk);
  const signature = b64urlToBytes(sigB64);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, data);
  if (!valid) throw new Error('Invalid signature');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error('Token expired');
  if (payload.iat > now + 60) throw new Error('Token issued in the future');
  if (payload.aud !== projectId) throw new Error('Wrong audience (projectId mismatch)');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Wrong issuer');
  if (!payload.sub) throw new Error('Missing subject (uid)');

  return {
    uid: payload.sub,
    email: payload.email || null,
    emailVerified: !!payload.email_verified,
    claims: payload
  };
}
