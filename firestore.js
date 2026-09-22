/* Minimal Firestore REST client, authenticated as a Google Cloud service
   account instead of the Firebase Admin SDK (which is Node-only and can't
   run in a Worker). This is the "trusted server" side: requests made with
   a service account's OAuth token bypass Firestore Security Rules
   entirely, exactly like the Admin SDK would - which is why every write
   in here must be gated by our own checks (see index.js), not rules.

   No npm dependencies: the service-account JWT is signed by hand with
   Web Crypto. */

import { strToB64url, bytesToB64url, pemToArrayBuffer } from './util.js';

let cachedToken = null;
let cachedExpiry = 0;

function getServiceAccount(env) {
  try {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is missing or not valid JSON');
  }
}

async function importPrivateKey(pem) {
  const der = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedExpiry - 60 > now) return cachedToken;

  const sa = getServiceAccount(env);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${strToB64url(JSON.stringify(header))}.${strToB64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(sa.private_key);
  const sigBuf = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${bytesToB64url(new Uint8Array(sigBuf))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=' +
      encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
      '&assertion=' +
      jwt
  });
  if (!res.ok) throw new Error('Could not get a Google access token: ' + (await res.text()));
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExpiry = now + data.expires_in;
  return cachedToken;
}

function baseUrl(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

/* ---- Firestore's typed JSON <-> plain JS object ---- */

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFsFields(v) } };
  throw new Error('Unsupported value type for Firestore: ' + typeof v);
}

function toFsFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFsValue(v);
  return fields;
}

function fromFsValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fromFsFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  return null;
}

function fromFsFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromFsValue(v);
  return out;
}

/* ---- public API ---- */

export async function getDoc(env, path) {
  const token = await getAccessToken(env);
  const res = await fetch(`${baseUrl(env)}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return fromFsFields(data.fields);
}

// Partial update: only the given top-level keys are written; every other
// field already on the document (or not yet set) is left untouched.
// Also creates the document if it doesn't exist yet.
export async function patchDoc(env, path, partialObj) {
  const token = await getAccessToken(env);
  const mask = Object.keys(partialObj)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const res = await fetch(`${baseUrl(env)}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFsFields(partialObj) })
  });
  if (!res.ok) throw new Error(`Firestore patch failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function listCollection(env, collectionPath, pageSize = 50) {
  const token = await getAccessToken(env);
  const res = await fetch(`${baseUrl(env)}/${collectionPath}?pageSize=${pageSize}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Firestore list failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.documents || []).map((d) => ({
    id: d.name.split('/').pop(),
    ...fromFsFields(d.fields)
  }));
}

// Simple equality query, e.g. queryEquals(env, 'users', 'role', 'admin', 1)
export async function queryEquals(env, collectionId, field, value, limit = 1) {
  const token = await getAccessToken(env);
  const res = await fetch(`${baseUrl(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toFsValue(value) }
        },
        limit
      }
    })
  });
  if (!res.ok) throw new Error(`Firestore query failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  return rows
    .filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split('/').pop(), ...fromFsFields(r.document.fields) }));
}
