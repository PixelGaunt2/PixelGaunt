/* =====================================================================================
   PIXELGAUNT - manual game review service (Cloudflare Worker)
   -------------------------------------------------------------------------------------
   NOT part of the GitHub Pages site - it deploys separately (workers.dev). It replaces the
   old AI review worker. It is the ONLY place that holds Google credentials and the ONLY
   place that can change a submission's status. The browser never gets a Google token.

     Creator Studio / Publish page  -->  this Worker  -->  Google Drive   (game package)
                                                     -->  Firestore      (submission record, status)

   ENDPOINTS
     GET  /health                 which settings are present (true/false only, no values)
     POST /submit                 signed-in user: package + details. Re-validates the ZIP, enforces
                                  the plan (from Firestore, not the browser), stores it in
                                  PixelGaunt Game Submissions/Pending/<game folder>/ and records it
                                  as pending_review. Safe to retry with the same submissionId.
     GET  /admin/download?id=     admin only: streams the real stored package from Drive
     POST /admin/approve          admin only: Pending -> Approved, game goes live on the Games page
     POST /admin/reject           admin only: reason required, Pending -> Rejected
     POST /admin/drive-check      admin only: verifies the Drive connection + folder structure

   WHO IS AN ADMIN: a document at Firestore  admins/<your Firebase UID>  (create it by hand in the
   Firebase console). Nothing the browser sends can make someone an admin.

   SETTINGS (Worker -> Settings -> Variables and Secrets). Secrets = "Encrypt".
     FIREBASE_PROJECT_ID           variable   pixelgaunt-e5235
     ALLOWED_ORIGINS               variable   https://pixelgaunt.com,https://www.pixelgaunt.com
     FIREBASE_SA_JSON              SECRET     full JSON key of a Firebase service account (Firestore access)
     GOOGLE_OAUTH_CLIENT_ID        SECRET     OAuth client (Web application) from Google Cloud
     GOOGLE_OAUTH_CLIENT_SECRET    SECRET     ... its client secret
     GOOGLE_OAUTH_REFRESH_TOKEN    SECRET     refresh token issued by the REVIEW Drive account (scope: drive.file)
     DRIVE_EXPECTED_ACCOUNT        variable   alyhayder922@gmail.com (the token must belong to this account, else Drive fails loudly)
     RESEND_API_KEY                SECRET     Resend API key (email notification to the review inbox)
     REVIEW_EMAIL_TO / REVIEW_EMAIL_FROM  variables (optional)
   Full step-by-step: REVIEW_SETUP.md.

   DELIVERY (both are REQUIRED and tracked separately - neither is ever reported as done unless the provider confirmed it):
     1. Google Drive: the complete game package (game.zip, every file/folder as uploaded) + submission-info.json
     2. Email to the review inbox: all submission details + the Drive link. The ZIP is deliberately NOT attached:
        Gmail rejects incoming mail whose attachments (including files inside a .zip) contain .js and other script
        types - the provider accepts the message, then Gmail bounces it, which is how submissions "succeeded" before
        while nothing arrived.

   NOTE: this does inspect ZIP structure, file names, sizes and the entry HTML. That is basic upload
   validation, NOT a malware scan.
   ===================================================================================== */

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

const DRIVE_ROOT = 'PixelGaunt Game Submissions';
const MIME_FOLDER = 'application/vnd.google-apps.folder';
const HARD_MAX_BYTES = 10 * 1024 * 1024;          // no plan is allowed above this
const MAX_UNPACKED = 60 * 1024 * 1024;            // zip-bomb guard (same as the site)
const MAX_FILES = 800;
const MAX_BUNDLE_BYTES = 6 * 1024 * 1024;         // gzip bundle stored in Firestore (same as the site)
// Same list the in-browser check uses (platform.js BLOCKED_EXT) - keep the two in step.
const BLOCKED_EXT = ['exe', 'dll', 'bat', 'cmd', 'sh', 'apk', 'msi', 'jar', 'php', 'dmg', 'com', 'scr', 'vbs', 'ps1', 'app', 'deb', 'pkg'];
// users/<uid>.plan (set by you after confirming a payment): 'free' | 'subscriber_monthly' | 'subscriber_yearly'
// ('subscriber' from before = monthly). Yearly: 12 games every month = 144 per year.
const PLANS = {
    free:               { maxGames: 1,  maxBytes: 5 * 1024 * 1024,  period: null,    label: 'Free' },
    subscriber_monthly: { maxGames: 10, maxBytes: 10 * 1024 * 1024, period: 'month', label: 'Subscriber (monthly)' },
    subscriber_yearly:  { maxGames: 12, maxBytes: 10 * 1024 * 1024, period: 'month', label: 'Subscriber (yearly)' }
};
PLANS.subscriber = PLANS.subscriber_monthly;
// Prices are fixed here (not taken from the browser) for payment receipts.
const PRICES = { monthly: '$1.99 (PKR 549.97)', yearly: '$10.99 (PKR 3,037.26)' };

class HttpError extends Error {
    constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}

/* --------------------------------------- small helpers --------------------------------------- */
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const toB64u = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function sha256hex(u8) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', u8))].map(b => b.toString(16).padStart(2, '0')).join(''); }
function concat(parts) { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; }
const extOf = p => { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; };
const dirOf = p => p.indexOf('/') < 0 ? '' : p.slice(0, p.lastIndexOf('/') + 1);
const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const safeName = (s, max) => cleanText(s, 200).replace(/[^A-Za-z0-9 _.-]/g, '').trim().replace(/\s+/g, '-').slice(0, max) || 'x';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(req, env) {
    const allowed = String(env.ALLOWED_ORIGINS || 'https://pixelgaunt.com,https://www.pixelgaunt.com').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const h = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Expose-Headers': 'Content-Disposition', 'Access-Control-Max-Age': '600' };
    if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;   // CORS is browser hygiene only; real protection is the token check
    return h;
}
const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/* ------------------------------ Firebase ID token verification ------------------------------ */
let jwksCache = { t: 0, keys: [] };
async function getJwks(force) {
    if (!force && jwksCache.keys.length && Date.now() - jwksCache.t < 3600e3) return jwksCache.keys;
    const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    if (!res.ok) throw new HttpError(503, 'Could not reach Google to verify your sign-in. Try again.');
    jwksCache = { t: Date.now(), keys: (await res.json()).keys || [] };
    return jwksCache.keys;
}
async function verifyFirebaseToken(env, req) {
    const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
    if (!m) throw new HttpError(401, 'Sign in to continue.');
    const parts = m[1].split('.');
    if (parts.length !== 3) throw new HttpError(401, 'Your sign-in is invalid. Sign in again.');
    let header, claims;
    try { header = JSON.parse(dec.decode(fromB64u(parts[0]))); claims = JSON.parse(dec.decode(fromB64u(parts[1]))); }
    catch (e) { throw new HttpError(401, 'Your sign-in is invalid. Sign in again.'); }
    if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'Your sign-in is invalid. Sign in again.');
    let jwk = (await getJwks()).find(k => k.kid === header.kid);
    if (!jwk) jwk = (await getJwks(true)).find(k => k.kid === header.kid);
    if (!jwk) throw new HttpError(401, 'Your sign-in is invalid. Sign in again.');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
    const now = Math.floor(Date.now() / 1000), pid = env.FIREBASE_PROJECT_ID;
    if (!ok || claims.aud !== pid || claims.iss !== 'https://securetoken.google.com/' + pid || !(claims.exp > now) || !(claims.iat <= now + 60) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) {
        throw new HttpError(401, 'Your sign-in expired. Sign in again.');
    }
    return { uid: claims.sub, email: String(claims.email || ''), name: String(claims.name || '') };
}

/* ----------------------------- Google access tokens (server side) ----------------------------- */
let saTok = { v: '', exp: 0 }, drTok = { v: '', exp: 0 };
async function serviceAccountToken(env) {
    if (saTok.v && Date.now() < saTok.exp - 60e3) return saTok.v;
    let sa; try { sa = JSON.parse(env.FIREBASE_SA_JSON); } catch (e) { throw new HttpError(503, 'Review service is not configured (FIREBASE_SA_JSON).'); }
    if (!sa.client_email || !sa.private_key) throw new HttpError(503, 'Review service is not configured (FIREBASE_SA_JSON).');
    const iat = Math.floor(Date.now() / 1000);
    const head = toB64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const body = toB64u(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })));
    const der = fromB64(sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, ''));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = toB64u(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + body))));
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + sig }) });
    if (!res.ok) { console.error('service account token failed', res.status, await res.text()); throw new HttpError(503, 'Review service could not authenticate to Firestore. Check FIREBASE_SA_JSON.'); }
    const j = await res.json(); saTok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return saTok.v;
}
async function driveToken(env) {
    if (drTok.v && Date.now() < drTok.exp - 60e3) return drTok.v;
    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REFRESH_TOKEN) throw new HttpError(503, 'Google Drive is not connected yet (missing OAuth settings).');
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN }) });
    if (!res.ok) { console.error('drive token failed', res.status, await res.text()); throw new HttpError(503, 'Google Drive authorisation failed. The refresh token may have expired or been revoked - reconnect it.'); }
    const j = await res.json(); drTok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return drTok.v;
}

// Which Google account the Drive refresh token belongs to. Files land in THAT account's Drive, so a token issued by the
// wrong account means "uploaded fine, but not where you are looking". Checked once per Worker instance.
let driveAcct = { v: '', t: 0 };
const expectedDriveAccount = env => String(env.DRIVE_EXPECTED_ACCOUNT || 'alyhayder922@gmail.com').trim().toLowerCase();
async function driveAccount(env) {
    if (driveAcct.v && Date.now() - driveAcct.t < 3600e3) return driveAcct.v;
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + await driveToken(env) } });
    if (!res.ok) { console.error('drive about failed', res.status, await res.text()); throw new HttpError(502, 'Google Drive did not confirm which account it is connected to (HTTP ' + res.status + '). Check that the Google Drive API is enabled.'); }
    const j = await res.json();
    driveAcct = { v: String((j.user && j.user.emailAddress) || '').toLowerCase(), t: Date.now() };
    return driveAcct.v;
}
async function assertDriveAccount(env) {
    const got = await driveAccount(env), want = expectedDriveAccount(env);
    if (got !== want) throw new HttpError(503, `Google Drive is connected to ${got || 'an unknown account'}, not ${want}. Re-create GOOGLE_OAUTH_REFRESH_TOKEN while signed in as ${want}.`);
    return got;
}

/* ------------------------------------------ Firestore REST ------------------------------------------ */
const fsBase = env => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
function toFs(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (v instanceof Uint8Array) { let b = ''; for (let i = 0; i < v.length; i += 0x8000) b += String.fromCharCode.apply(null, v.subarray(i, i + 0x8000)); return { bytesValue: btoa(b) }; }
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
    const fields = {}; Object.keys(v).forEach(k => { fields[k] = toFs(v[k]); }); return { mapValue: { fields } };
}
function fromFs(f) {
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return Number(f.integerValue);
    if ('doubleValue' in f) return f.doubleValue;
    if ('booleanValue' in f) return f.booleanValue;
    if ('timestampValue' in f) return f.timestampValue;
    if ('bytesValue' in f) return f.bytesValue;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(fromFs);
    if ('mapValue' in f) { const o = {}; Object.entries(f.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromFs(x); }); return o; }
    return null;
}
const docToObj = d => { const o = {}; Object.entries(d.fields || {}).forEach(([k, x]) => { o[k] = fromFs(x); }); return o; };
async function fsFetch(env, method, url, body) {
    const res = await fetch(url, { method, headers: { Authorization: 'Bearer ' + await serviceAccountToken(env), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return res;
}
async function fsGet(env, path) {
    const res = await fsFetch(env, 'GET', `${fsBase(env)}/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) { console.error('firestore get', path, res.status, await res.text()); throw new HttpError(502, 'The database did not answer. Try again.'); }
    return docToObj(await res.json());
}
// true = created, false = it already existed (this is what makes retries safe)
async function fsCreate(env, collection, id, obj) {
    const fields = {}; Object.keys(obj).forEach(k => { fields[k] = toFs(obj[k]); });
    const res = await fsFetch(env, 'POST', `${fsBase(env)}/${collection}?documentId=${encodeURIComponent(id)}`, { fields });
    if (res.status === 409) return false;
    if (!res.ok) { console.error('firestore create', collection, res.status, await res.text()); throw new HttpError(502, 'The database did not accept the record. Try again.'); }
    return true;
}
async function fsPatch(env, path, obj) {   // updates ONLY the listed fields; fails if the document does not exist
    const keys = Object.keys(obj), fields = {}; keys.forEach(k => { fields[k] = toFs(obj[k]); });
    const q = keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true';
    const res = await fsFetch(env, 'PATCH', `${fsBase(env)}/${path}?${q}`, { fields });
    if (!res.ok) { console.error('firestore patch', path, res.status, await res.text()); throw new HttpError(502, 'The database did not accept the update. Try again.'); }
}
async function fsDelete(env, path) { await fsFetch(env, 'DELETE', `${fsBase(env)}/${path}`); }
async function fsQueryByField(env, collectionId, field, value) {
    const res = await fsFetch(env, 'POST', `${fsBase(env)}:runQuery`, { structuredQuery: { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }, limit: 500 } });
    if (!res.ok) { console.error('firestore query', collectionId, res.status, await res.text()); throw new HttpError(502, 'The database did not answer. Try again.'); }
    return (await res.json()).filter(r => r.document).map(r => ({ id: r.document.name.split('/').pop(), ...docToObj(r.document) }));
}

/* ------------------------------------------ Google Drive ------------------------------------------ */
async function driveFetch(env, url, init) {
    const res = await fetch(url, { ...init, headers: { ...(init && init.headers), Authorization: 'Bearer ' + await driveToken(env) } });
    if (!res.ok) {
        const text = await res.text(); console.error('drive', res.status, url.split('?')[0], text);
        const e = new HttpError(502, 'Google Drive rejected the request (HTTP ' + res.status + ').'); e.driveStatus = res.status; throw e;
    }
    return res;
}
const qEsc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function driveFindChild(env, parentId, name, folderOnly) {
    let q = `name='${qEsc(name)}' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : '') + (folderOnly ? ` and mimeType='${MIME_FOLDER}'` : '');
    const res = await driveFetch(env, 'https://www.googleapis.com/drive/v3/files?fields=files(id,name,size,webViewLink)&pageSize=5&q=' + encodeURIComponent(q));
    return ((await res.json()).files || [])[0] || null;
}
async function driveMakeFolder(env, name, parentId) {
    const res = await driveFetch(env, 'https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: MIME_FOLDER, parents: parentId ? [parentId] : undefined }) });
    return (await res.json()).id;
}
async function driveFolder(env, name, parentId) { const f = await driveFindChild(env, parentId, name, true); return f ? f.id : driveMakeFolder(env, name, parentId); }
async function driveUpload(env, { name, parentId, mime, bytes }) {
    const b = 'pgb' + crypto.randomUUID().replace(/-/g, '');
    const head = enc.encode(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`);
    const res = await driveFetch(env, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: concat([head, bytes, enc.encode(`\r\n--${b}--`)]) });
    return res.json();
}
async function driveMove(env, fileId, toParentId) {   // idempotent: does nothing if it is already there
    const cur = await (await driveFetch(env, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`)).json();
    const parents = cur.parents || [];
    if (parents.length === 1 && parents[0] === toParentId) return;
    const remove = parents.filter(p => p !== toParentId).join(',');
    await driveFetch(env, `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${toParentId}${remove ? '&removeParents=' + remove : ''}&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}
// PixelGaunt Game Submissions / { Pending, Approved, Rejected } - created once, IDs cached in Firestore system/drive
async function ensureFolders(env, fresh) {
    if (!fresh) { const c = await fsGet(env, 'system/drive'); if (c && c.pending_id && c.approved_id && c.rejected_id) return { root: c.root_id, Pending: c.pending_id, Approved: c.approved_id, Rejected: c.rejected_id }; }
    const root = await driveFolder(env, DRIVE_ROOT, null);
    const ids = { root, Pending: await driveFolder(env, 'Pending', root), Approved: await driveFolder(env, 'Approved', root), Rejected: await driveFolder(env, 'Rejected', root) };
    const rec = { root_id: root, pending_id: ids.Pending, approved_id: ids.Approved, rejected_id: ids.Rejected, updated_at: new Date() };
    if (!(await fsCreate(env, 'system', 'drive', rec))) { await fsDelete(env, 'system/drive'); await fsCreate(env, 'system', 'drive', rec); }
    return ids;
}

/* ------------------------------------ ZIP inspection (basic validation) ------------------------------------ */
async function inflate(u8, e, cap) {
    const start = e.lho + 30 + new DataView(u8.buffer, u8.byteOffset).getUint16(e.lho + 26, true) + new DataView(u8.buffer, u8.byteOffset).getUint16(e.lho + 28, true);
    const raw = u8.subarray(start, start + e.csize);
    if (e.method === 0) return raw.slice();
    const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > cap) { reader.cancel(); throw new Error('too large'); } chunks.push(value); }
    return concat(chunks);
}
function resolvePath(base, ref) {
    ref = String(ref).split('#')[0].split('?')[0];
    try { ref = decodeURIComponent(ref); } catch (e) { /* keep raw */ }
    const out = []; (ref.charAt(0) === '/' ? ref : base + ref).split('/').forEach(s => { if (s === '' || s === '.') return; if (s === '..') out.pop(); else out.push(s); });
    return out.join('/');
}
const isRemote = u => /^(https?:)?\/\//i.test(u);
const isInline = u => /^(data:|blob:|#|about:|javascript:|mailto:)/i.test(u);

// Returns { errors[], warnings[], entry, entryHtml, fileCount, names[] }. errors[] is empty when the package is acceptable.
async function inspectZip(buf) {
    const errors = [], warnings = [];
    const u8 = new Uint8Array(buf), v = new DataView(buf), len = buf.byteLength;
    const fail = () => ({ errors, warnings, entry: null, entryHtml: null, fileCount: 0, names: [] });
    if (len < 22) { errors.push('The package is not a readable .zip file.'); return fail(); }
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) { errors.push('The package is not a readable .zip file (no zip directory found). Re-create the zip and try again.'); return fail(); }
    const count = v.getUint16(eocd + 10, true), cdOff = v.getUint32(eocd + 16, true);
    if (count === 0xffff || cdOff === 0xffffffff) { errors.push('ZIP64 archives are not supported. Re-zip the game normally.'); return fail(); }
    if (count > MAX_FILES) { errors.push('The zip has too many files (' + count + ', limit ' + MAX_FILES + ').'); return fail(); }
    let p = cdOff, total = 0; const entries = [];
    for (let n = 0; n < count; n++) {
        if (p + 46 > len || v.getUint32(p, true) !== 0x02014b50) { errors.push('The zip directory is corrupt. Re-create the zip and try again.'); return fail(); }
        const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
        const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
        const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/').replace(/^\.\//, '');
        p += 46 + nlen + elen + clen;
        if (name.endsWith('/')) continue;
        if (/(^|\/)(__MACOSX|\.git|node_modules)\//.test(name) || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(name)) continue;   // same skips as the site
        if (name.charAt(0) === '/' || /^[a-z]:/i.test(name) || name.split('/').indexOf('..') >= 0) { errors.push('Unsafe file path inside the zip: ' + name.slice(0, 80)); continue; }
        if (flags & 1) { errors.push('Password-protected entry cannot be checked: ' + name.slice(0, 80)); continue; }
        if (method !== 0 && method !== 8) { errors.push('Unsupported compression for ' + name.slice(0, 80) + '. Re-zip with normal (deflate) compression.'); continue; }
        if (lho + 30 > len || v.getUint32(lho, true) !== 0x04034b50) { errors.push('Corrupt entry in the zip: ' + name.slice(0, 80)); continue; }
        const dataStart = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
        if (dataStart + csize > len) { errors.push('The zip is truncated or corrupt (' + name.slice(0, 80) + ').'); continue; }
        total += usize;
        entries.push({ name, method, csize, usize, lho });
    }
    if (total > MAX_UNPACKED) errors.push('The zip unpacks to more than ' + (MAX_UNPACKED / 1048576) + ' MB.');
    if (!entries.length) { errors.push('The zip contains no game files.'); return { ...fail(), errors }; }
    // Remove one wrapping folder, exactly as the site's own reader does
    const tops = new Set(entries.map(e => e.name.split('/')[0]));
    if (!entries.some(e => e.name.indexOf('/') < 0) && tops.size === 1) { const t = [...tops][0]; entries.forEach(e => { e.name = e.name.slice(t.length + 1); }); }
    const names = entries.map(e => e.name);
    const blocked = names.filter(n => BLOCKED_EXT.includes(extOf(n)));
    if (blocked.length) errors.push('Not allowed - executable/installer files in the package: ' + blocked.slice(0, 6).join(', ') + '. Remove them and submit again.');
    // Entry point - same selection rule as platform.js
    const html = names.filter(n => /\.html?$/i.test(n));
    let entry = html.find(n => /(^|\/)index\.html?$/i.test(n)) || (html.length === 1 ? html[0] : null);
    if (!entry && html.length > 1) entry = [...html].sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (!entry) { errors.push('No game HTML file found. Include an index.html at the top level of the zip.'); return { errors, warnings, entry: null, entryHtml: null, fileCount: names.length, names }; }
    let entryHtml = null;
    try { entryHtml = await inflate(u8, entries.find(e => e.name === entry), 10 * 1048576); }
    catch (e) { errors.push('The game HTML file (' + entry + ') could not be unpacked - the zip may be corrupt.'); }
    if (entryHtml) {   // referenced files (warnings only: the browser check already stops obvious misses)
        const text = dec.decode(entryHtml), set = new Set(names), base = dirOf(entry), missing = new Set();
        const re = /(?:src|href)\s*=\s*["']([^"'#][^"']*)["']|url\(\s*(['"]?)([^"')]+)\2\s*\)/gi; let m, guard = 0;
        while ((m = re.exec(text)) && guard++ < 2000) {
            const ref = m[1] || m[3]; if (!ref || ref.length > 300 || isInline(ref) || isRemote(ref)) continue;
            const path = resolvePath(base, ref);
            if (/\.(css|js|mjs|json|png|jpe?g|gif|webp|svg|mp3|ogg|wav|m4a|mp4|webm|glb|gltf|woff2?|ttf|otf|wasm)$/i.test(path) && !set.has(path)) missing.add(ref);
        }
        if (missing.size) warnings.push('Referenced file(s) not found in the package: ' + [...missing].slice(0, 10).join(', '));
    }
    return { errors, warnings, entry, entryHtml, fileCount: names.length, names };
}

/* ------------------------------------------ request handlers ------------------------------------------ */
async function planFor(env, uid) {
    const u = await fsGet(env, 'users/' + uid);
    if (u && u.plan_expires && Date.parse(u.plan_expires) < Date.now()) return PLANS.free;   // subscription ended
    return (u && PLANS[u.plan]) || PLANS.free;   // plan lives in Firestore, editable only by you/the server (see firestore.rules)
}
/* ------------------------------------------ submission limits ------------------------------------------
   Enforced here (not in the browser) with "slot" documents in the private `limits` collection. Creating a document that
   already exists fails atomically, so two people pressing Submit at the same second cannot both get the last slot.
     user_<uid>_<YYYY-MM>   one per account per calendar month (=> also max 1 per day)
     site_<YYYY-MM-DD>_<n>  n = 1..SITE_DAILY_MAX, for the whole website per day
   Days/months follow Pakistan time (UTC+5). A slot is released again if the submission is not delivered. */
const USER_DAILY_MAX = 1;         // games per account per day
const SITE_DAILY_MAX = 3;        // games per day for the whole website
const PK_OFFSET_MS = 5 * 3600e3;
const pkDay = (d = new Date()) => new Date(d.getTime() + PK_OFFSET_MS).toISOString().slice(0, 10);
const pkMonth = (d = new Date()) => pkDay(d).slice(0, 7);
function nextMonthLabel() {
    const [y, m] = pkMonth().split('-').map(Number);
    return new Date(Date.UTC(m === 12 ? y + 1 : y, m % 12, 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
const monthSlot = (uid, n) => `user_${uid}_${pkMonth()}` + (n > 1 ? '_' + n : '');   // n=1 keeps the name used before
async function claimSlot(env, slotId, sid, uid) {   // true = this submission holds it
    if (await fsCreate(env, 'limits', slotId, { submission_id: sid, user_id: uid, at: new Date() })) return true;
    const cur = await fsGet(env, 'limits/' + slotId);
    return !!(cur && cur.submission_id === sid);
}
async function slotHolder(env, slotId) {
    const h = await fsGet(env, 'limits/' + slotId);
    return h && h.submission_id ? await fsGet(env, 'submissions/' + h.submission_id) : null;
}
async function claimLimits(env, uid, sid, plan) {
    const held = [];
    const giveBack = async () => releaseLimits(env, held);
    // 1 per account per day
    const daySlot = `userday_${uid}_${pkDay()}`;
    if (!(await claimSlot(env, daySlot, sid, uid))) {
        const prev = await slotHolder(env, daySlot);
        if (prev && prev.status === 'pending_review') await backfillPreview(env, prev);
        throw new HttpError(429, `Each account can submit ${USER_DAILY_MAX} game per day${prev ? ` and you already submitted "${prev.game_name}" today` : ''}. Please submit your next game tomorrow.`,
            { limit: 'user_daily', alreadySubmitted: prev ? { submissionId: prev.submission_id, title: prev.game_name, status: prev.status } : undefined });
    }
    held.push(daySlot);
    // plan allowance per month (subscribers)
    if (plan.period === 'month') {
        let got = null;
        for (let n = 1; n <= plan.maxGames && !got; n++) if (await claimSlot(env, monthSlot(uid, n), sid, uid)) got = monthSlot(uid, n);
        if (!got) { await giveBack(); throw new HttpError(429, `You have submitted all ${plan.maxGames} games of your ${plan.label} plan this month. You can submit again from ${nextMonthLabel()}.`, { limit: 'user_monthly' }); }
        held.push(got);
    }
    // whole website per day
    const day = pkDay();
    for (let n = 1; n <= SITE_DAILY_MAX; n++) {
        const siteSlot = `site_${day}_${n}`;
        if (await claimSlot(env, siteSlot, sid, uid)) { held.push(siteSlot); return held; }
    }
    await giveBack();   // they did not get to submit, so give their own slots back
    throw new HttpError(429, `PixelGaunt accepts ${SITE_DAILY_MAX} game submissions per day and today's are all taken. Please try again tomorrow - your own allowance is unchanged.`, { limit: 'site_daily' });
}
async function releaseLimits(env, slots) {
    for (const s of slots || []) { try { await fsDelete(env, 'limits/' + s); } catch (e) { console.error('slot release failed', s, e && e.message); } }
}
async function siteUsedToday(env) {
    let used = 0; const day = pkDay();
    for (let n = 1; n <= SITE_DAILY_MAX; n++) if (await fsGet(env, `limits/site_${day}_${n}`)) used++;
    return used;
}
async function handleQuota(req, env, cors) {
    const out = { siteDailyMax: SITE_DAILY_MAX, siteDailyUsed: await siteUsedToday(env), userDailyMax: USER_DAILY_MAX, day: pkDay() };
    if (req.headers.get('Authorization')) {
        try {
            const u = await verifyFirebaseToken(env, req); const plan = await planFor(env, u.uid);
            out.plan = plan.label; out.planKey = Object.keys(PLANS).find(k => PLANS[k] === plan && k !== 'subscriber') || 'free';
            if (plan !== PLANS.free) { const ud = await fsGet(env, 'users/' + u.uid); out.planExpires = (ud && ud.plan_expires) || null; } out.userDailyUsed = (await fsGet(env, `limits/userday_${u.uid}_${pkDay()}`)) ? 1 : 0;
            if (plan.period === 'month') {
                let used = 0; for (let n = 1; n <= plan.maxGames; n++) if (await fsGet(env, 'limits/' + monthSlot(u.uid, n))) used++;
                Object.assign(out, { userMonthlyMax: plan.maxGames, userMonthlyUsed: used, nextMonth: nextMonthLabel() });
            }
        } catch (e) { /* anonymous view */ }
    }
    return json(out, 200, cors);
}

const COUNTED_STATUSES = ['pending_review', 'approved', 'rejected', 'published'];
// Statuses that mean "not fully delivered yet": a retry with the same submission id finishes ONLY the missing step(s).
const RETRYABLE_STATUSES = ['sending', 'drive_failed', 'email_failed', 'submission_failed'];
async function usedGames(env, uid, plan) {
    const [subs, games] = await Promise.all([fsQueryByField(env, 'submissions', 'user_id', uid), fsQueryByField(env, 'community_games', 'ownerUid', uid)]);
    const seen = new Map();
    subs.forEach(s => { if (COUNTED_STATUSES.includes(s.status)) seen.set(s.id, Date.parse(s.submitted_at) || 0); });   // failed / unfinished attempts do not use up the allowance
    games.forEach(g => { if (!seen.has(g.id)) seen.set(g.id, Date.parse(g.createdAt) || 0); });   // older games that pre-date review still count
    if (plan.period === 'month') { const d = new Date(); const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); return [...seen.values()].filter(t => t >= start).length; }
    return seen.size;
}

async function handleSubmit(req, env, cors) {
    const user = await verifyFirebaseToken(env, req);
    const cl = Number(req.headers.get('Content-Length') || 0);
    if (cl > HARD_MAX_BYTES + 512 * 1024) throw new HttpError(413, 'The upload is too large.');
    let form; try { form = await req.formData(); } catch (e) { throw new HttpError(400, 'The upload could not be read.'); }
    const id = String(form.get('submissionId') || '');
    if (!UUID_RE.test(id)) throw new HttpError(400, 'Missing or invalid submission id.');
    const title = cleanText(form.get('title'), 60), description = cleanText(form.get('description'), 240), version = cleanText(form.get('version'), 20);
    const fileName = safeName(form.get('packageName') || 'game.zip', 80);
    const listing = { genre: cleanText(form.get('genre'), 20), controls: cleanText(form.get('controls'), 200), orientation: cleanText(form.get('orientation'), 12),
        thumb: cleanThumb(form.get('thumb')), tournamentServer: cleanText(form.get('tournamentServer'), 120), checkVerdict: cleanText(form.get('checkVerdict'), 10) };
    const pkg = form.get('package');
    if (!title) throw new HttpError(400, 'A game title is required.');
    if (String(form.get('agreement') || '') !== AGREEMENT_VERSION) throw new HttpError(400, 'Please read and accept the PixelGaunt Developer Agreement (developer-agreement.html), then submit again. If you just accepted it, refresh the page first.');
    try { await rememberUser(env, req, user.uid, String(form.get('deviceId') || '')); } catch (e) { console.error('rememberUser at submit', e && e.message); }
    if (!pkg || typeof pkg === 'string' || !pkg.size) throw new HttpError(400, 'The game package is missing.');

    // Retry safety: same id + same owner = finish only what is still missing, never a second copy / second email.
    const existing = await fsGet(env, 'submissions/' + id);
    if (existing) {
        if (existing.user_id !== user.uid) throw new HttpError(403, 'This submission id belongs to someone else.');
        if (!RETRYABLE_STATUSES.includes(existing.status)) {
            const preview = await backfillPreview(env, existing);   // delivered earlier but not visible in the dashboard -> fix it now
            return json({ preview: { ok: !!preview.ok }, ok: existing.status === 'pending_review' || existing.status === 'approved' || existing.status === 'published', duplicate: true, submissionId: id, status: existing.status,
                drive: { ok: existing.drive_state === 'stored', link: existing.drive_link || '' }, email: { ok: !!existing.email_id, to: existing.email_to || reviewTo(env) } }, 200, cors);
        }
    }

    const plan = await planFor(env, user.uid);           // NOT taken from the browser
    if (pkg.size > Math.min(plan.maxBytes, HARD_MAX_BYTES)) throw new HttpError(413, `The package is ${(pkg.size / 1048576).toFixed(1)} MB. The ${plan.label} plan allows ${plan.maxBytes / 1048576} MB per game.`);
    if (!existing) {
        const used = await usedGames(env, user.uid, plan);
        if (used >= plan.maxGames) {
            // If one of their games is waiting for review, say so (and make sure it shows in their dashboard).
            const subs = (await fsQueryByField(env, 'submissions', 'user_id', user.uid)).filter(x => x.status === 'pending_review')
                .sort((a, b) => (Date.parse(b.submitted_at) || 0) - (Date.parse(a.submitted_at) || 0));
            if (subs[0]) {
                await backfillPreview(env, subs[0]);
                throw new HttpError(429, plan.period
                    ? `You have submitted all ${plan.maxGames} games of your ${plan.label} plan this month ("${subs[0].game_name}" is under review). You can submit again from ${nextMonthLabel()}.`
                    : `You have already submitted "${subs[0].game_name}" and it is under review (we reply within 7 working days). The Free plan includes 1 game - subscribe for 10 games a month.`,
                    { limit: plan.period ? 'user_monthly' : 'plan_total', alreadySubmitted: { submissionId: subs[0].submission_id || subs[0].id, title: subs[0].game_name, status: subs[0].status } });
            }
            throw new HttpError(403, `You have used ${used} of ${plan.maxGames} game submission(s) on the ${plan.label} plan${plan.period ? ' this ' + plan.period + '. You can submit your next game from ' + nextMonthLabel() : '. Subscribe for 10 games a month'}.`, { limit: plan.period ? 'user_monthly' : 'plan_total' });
        }
    }

    const buf = await pkg.arrayBuffer();
    const info = await inspectZip(buf);
    if (info.errors.length) throw new HttpError(422, 'Basic validation failed. Fix these and submit again.', { details: info.errors });

    // The playable bundle the site will show is derived from THIS package's entry HTML; its hash is recorded
    // so approval can prove the live game is the one that was reviewed.
    const entryText = dec.decode(info.entryHtml);
    const entryHash = await sha256hex(enc.encode(entryText));

    // 0) Monthly (per account) and daily (whole website) limits - claimed atomically, given back if not delivered.
    const slots = await claimLimits(env, user.uid, id, plan);
    try {

    // 1) Record the attempt as 'sending'. Not public, not counted against the plan, and firestore.rules refuse a playable
    //    game for anything that is not 'pending_review'.
    const submittedAt = existing && existing.submitted_at ? new Date(existing.submitted_at) : new Date();
    const record = { submission_id: id, game_id: id, user_id: user.uid, developer_name: user.name, developer_email: user.email, game_name: title, description, version, file_name: fileName, file_size: pkg.size, subscription_type: plan.label, status: 'sending', rejection_reason: '', submitted_at: submittedAt, reviewed_at: null, reviewed_by: '', entry_file: info.entry, entry_sha256: entryHash, file_count: info.fileCount, validation_warnings: info.warnings, drive_state: 'pending', email_state: 'pending', email_attempts: 0, agreement_version: AGREEMENT_VERSION, agreement_accepted_at: new Date() };
    if (!existing) {
        const created = await fsCreate(env, 'submissions', id, record);
        if (!created) {   // a parallel request won the race: let that one finish, do not upload/email twice
            const now = await fsGet(env, 'submissions/' + id);
            if (!now || now.user_id !== user.uid) throw new HttpError(409, 'Submission conflict. Try again.');
            return json({ ok: false, inProgress: true, submissionId: id, status: now.status, error: 'This submission is already being processed. Wait a moment, then check its status.' }, 409, cors);
        }
    } else {
        await fsPatch(env, 'submissions/' + id, { status: 'sending', entry_sha256: entryHash, file_size: pkg.size, file_count: info.fileCount, entry_file: info.entry });
    }
    const prev = existing || record;

    // 2) Google Drive (REQUIRED): the complete package, exactly as uploaded, in the review account's Drive.
    let drive;
    if (prev.drive_state === 'stored' && prev.drive_file_id) {
        drive = { ok: true, reused: true, fileId: prev.drive_file_id, folderId: prev.drive_folder_id, folderName: prev.drive_folder_name, link: prev.drive_link || '', account: prev.drive_account || '' };
    } else {
        drive = await storeInDrive(env, { id, title, description, version, user, plan, buf, fileName, info, submittedAt, pkgSize: pkg.size });
    }

    // 3) Email notification (REQUIRED) with the details + Drive link. Skipped only if an earlier attempt was already accepted.
    let email;
    if (prev.email_state === 'sent' && prev.email_id) {
        email = { ok: true, reused: true, id: prev.email_id, to: prev.email_to || reviewTo(env), lastEvent: prev.email_last_event || '' };
    } else {
        const attempt = (Number(prev.email_attempts) || 0) + 1;
        email = await sendReviewEmail(env, { id, attempt, title, description, version, user, plan, fileName, info, submittedAt, pkgSize: pkg.size, drive });
        email.attempt = attempt;
    }

    // 4) Final status comes ONLY from what the providers actually answered.
    const status = drive.ok && email.ok ? 'pending_review' : drive.ok ? 'email_failed' : email.ok ? 'drive_failed' : 'submission_failed';
    const patch = {
        status,
        drive_state: drive.ok ? 'stored' : (drive.notConfigured ? 'not_configured' : 'failed'), drive_error: drive.ok ? '' : drive.error,
        email_state: email.ok ? 'sent' : 'failed', email_error: email.ok ? '' : email.error, email_to: reviewTo(env),
        last_attempt_at: new Date()
    };
    if (drive.ok) Object.assign(patch, { drive_file_id: drive.fileId, drive_folder_id: drive.folderId, drive_folder_name: drive.folderName || '', drive_link: drive.link || '', drive_account: drive.account || '' });
    if (email.ok) Object.assign(patch, { email_id: email.id, email_sent_at: new Date(), email_last_event: email.lastEvent || '' });
    if (email.attempt) patch.email_attempts = email.attempt;
    await fsPatch(env, 'submissions/' + id, patch);

    const body = {
        ok: status === 'pending_review', submissionId: id, status,
        drive: { ok: drive.ok, error: drive.ok ? undefined : drive.error, link: drive.ok ? drive.link : undefined, account: drive.ok ? drive.account : undefined },
        email: { ok: email.ok, error: email.ok ? undefined : email.error, to: reviewTo(env), id: email.ok ? email.id : undefined, lastEvent: email.lastEvent || undefined },
        warnings: info.warnings, maxBundleBytes: MAX_BUNDLE_BYTES
    };
    if (!body.ok) body.error = status === 'submission_failed' ? 'Submission could not be completed. Please try again.'
        : status === 'email_failed' ? 'The game was uploaded to Google Drive, but the review email could not be sent: ' + email.error
        : 'The review email was sent, but the Google Drive upload failed: ' + drive.error;
    if (status === 'pending_review') {
        body.preview = await writePreviewCopy(env, { id, uid: user.uid, title, description, ownerName: user.name, entryText, createdAt: submittedAt, ...listing });
        if (!body.preview.ok) console.error('submission delivered but preview copy missing', id, body.preview.error);
    }
    if (status !== 'pending_review') await releaseLimits(env, slots);   // a failed/partial attempt does not use up a limit
    // 200 for partial success too: the body carries exactly which step failed. 502 when nothing was delivered.
    return json(body, status === 'submission_failed' ? 502 : 200, cors);
    } catch (e) { await releaseLimits(env, slots); throw e; }
}

// Uploads the package to Drive. Never throws: returns { ok, ... } or { ok:false, error } so the caller can report it.
async function storeInDrive(env, d) {
    if (!(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN)) {
        console.error('Drive not configured: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN missing');
        return { ok: false, notConfigured: true, error: 'Google Drive is not connected on the review service (OAuth settings missing).' };
    }
    try {
        const account = await assertDriveAccount(env);
        let folders = await ensureFolders(env, false);
        const store = async () => {
            const today = new Date().toISOString().slice(0, 10);
            const folderName = `${safeName(d.title, 40)}_${safeName(d.user.name || (d.user.email || '').split('@')[0] || 'user', 30)}_${today}_${d.id.slice(0, 8)}`;
            const folderId = await driveFolder(env, folderName, folders.Pending);           // find-or-create => retries reuse it
            let zip = await driveFindChild(env, folderId, 'game.zip', false);
            if (zip && Number(zip.size) !== d.pkgSize) zip = null;                           // a broken earlier upload is not reused
            if (!zip) zip = await driveUpload(env, { name: 'game.zip', parentId: folderId, mime: 'application/zip', bytes: new Uint8Array(d.buf) });
            if (!zip || !zip.id) throw new HttpError(502, 'Google Drive did not return a file id for the upload.');
            if (zip.size != null && Number(zip.size) !== d.pkgSize) throw new HttpError(502, `Google Drive stored ${zip.size} bytes, expected ${d.pkgSize}.`);
            const meta = { submission_id: d.id, game_id: d.id, game_name: d.title, user_id: d.user.uid, developer_name: d.user.name, developer_email: d.user.email, submitted_at: d.submittedAt.toISOString(), version: d.version, description: d.description, package_file_name: d.fileName, stored_as: 'game.zip', package_size_bytes: d.pkgSize, subscription_type: d.plan.label, drive_file_id: zip.id, drive_folder_id: folderId, entry_file: d.info.entry, file_count: d.info.fileCount, validation_warnings: d.info.warnings, note: 'Basic upload validation only - not a malware scan. Unzip game.zip and open ' + d.info.entry + ' to test.' };
            if (!(await driveFindChild(env, folderId, 'submission-info.json', false))) await driveUpload(env, { name: 'submission-info.json', parentId: folderId, mime: 'application/json', bytes: enc.encode(JSON.stringify(meta, null, 2)) });
            return { folderId, fileId: zip.id, folderName, link: zip.webViewLink || ('https://drive.google.com/file/d/' + zip.id + '/view') };
        };
        let ids;
        try { ids = await store(); }
        catch (e) { if (e.driveStatus === 404) { folders = await ensureFolders(env, true); ids = await store(); } else throw e; }
        return { ok: true, account, ...ids };
    } catch (e) {
        console.error('Drive upload failed:', e && e.message || e);
        return { ok: false, error: (e && e.message) || 'Google Drive upload failed.' };
    }
}

/* ------------------------------------ playable preview copy ------------------------------------
   community_games/<id> + chunks/<n> is what Creator Studio > My Games, the Publish page list and (after approval)
   the Games page read. It used to be written by the BROWSER after delivery, which Firestore rules refused (the
   page's existence check reads a document that does not exist yet = always "permission denied"), so a delivered
   game never appeared in the dashboard. The review service now writes it with its service account. */
const PREVIEW_CHUNK = 900000;   // Firestore documents max out at 1 MiB
const GENRES = ['Arcade', 'Puzzle', 'Action', 'Adventure', 'Card', 'Strategy', 'Racing', 'Sports', 'Casual', 'Shooter', 'Platformer', 'Simulation', 'RPG', 'Horror', 'Other'];
async function gzipBytes(text) {
    return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
async function writePreviewCopy(env, d) {   // never throws
    try {
        if (await fsGet(env, 'community_games/' + d.id)) return { ok: true, existed: true };
        const gz = await gzipBytes(d.entryText);
        if (gz.length > MAX_BUNDLE_BYTES) return { ok: false, error: 'The game is too large for the on-site preview (more than ' + (MAX_BUNDLE_BYTES / 1048576) + ' MB compressed).' };
        const n = Math.max(1, Math.ceil(gz.length / PREVIEW_CHUNK));
        for (let i = 0; i < n; i++) await fsCreate(env, 'community_games/' + d.id + '/chunks', String(i), { i, b: gz.subarray(i * PREVIEW_CHUNK, (i + 1) * PREVIEW_CHUNK) });
        await fsCreate(env, 'community_games', d.id, {   // written last, so a listed game always has all of its chunks
            title: d.title, genre: GENRES.includes(d.genre) ? d.genre : 'Other', description: d.description || '', controls: d.controls || '',
            orientation: d.orientation === 'portrait' ? 'portrait' : 'landscape', thumb: d.thumb || '', ownerUid: d.uid, ownerName: d.ownerName || '',
            status: 'pending_review', chunkCount: n, tournament: d.tournamentServer ? { reporting: 'score', server: d.tournamentServer } : null,
            createdAt: d.createdAt || new Date(), checkVerdict: d.checkVerdict || '', submissionId: d.id
        });
        return { ok: true };
    } catch (e) { console.error('preview copy failed', d.id, e && e.message); return { ok: false, error: (e && e.message) || 'The preview copy could not be saved.' }; }
}
// For a submission that was delivered before this existed: rebuild the preview copy from the package in Drive.
async function backfillPreview(env, sub) {
    if (!sub || !['pending_review', 'approved'].includes(sub.status) || !sub.drive_file_id) return { ok: false };
    if (await fsGet(env, 'community_games/' + sub.submission_id)) return { ok: true, existed: true };
    try {
        const res = await driveFetch(env, `https://www.googleapis.com/drive/v3/files/${sub.drive_file_id}?alt=media`);
        const info = await inspectZip(await res.arrayBuffer());
        if (!info.entryHtml) return { ok: false, error: 'Could not read the package from Drive.' };
        return await writePreviewCopy(env, { id: sub.submission_id, uid: sub.user_id, title: sub.game_name, description: sub.description, ownerName: sub.developer_name, entryText: dec.decode(info.entryHtml), createdAt: sub.submitted_at ? new Date(sub.submitted_at) : new Date(), checkVerdict: 'backfilled' });
    } catch (e) { console.error('preview backfill failed', e && e.message); return { ok: false, error: (e && e.message) || 'backfill failed' }; }
}
const cleanThumb = t => (typeof t === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(t) && t.length <= 400000) ? t : '';

/* ------------------------------------ review e-mail (Resend API) ------------------------------------ */
const reviewTo = env => String(env.REVIEW_EMAIL_TO || 'pixelgaunt@gmail.com').trim();
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Sends the notification. Never throws: returns { ok, id, lastEvent } or { ok:false, error } with the provider's own reason.
async function sendReviewEmail(env, d) {
    if (!env.RESEND_API_KEY) return { ok: false, error: 'Email is not configured on the review service (RESEND_API_KEY missing).' };
    const when = d.submittedAt.toISOString();
    const rows = [
        ['Game title', d.title], ['Developer', d.user.name || '(no name)'], ['Developer account email', d.user.email || '(none)'],
        ['Submission ID', d.id], ['Submitted (UTC)', when], ['Plan', d.plan.label], ['Package', d.fileName + ' (' + (d.pkgSize / 1048576).toFixed(2) + ' MB, ' + d.info.fileCount + ' files)'],
        ['Entry file', d.info.entry], ['Version', d.version || '-'], ['Description', d.description || '-'],
        ['Automatic warnings', d.info.warnings.length ? d.info.warnings.join(' | ') : 'none'],
        ['Google Drive', d.drive.ok ? 'Stored in ' + DRIVE_ROOT + '/Pending/' + (d.drive.folderName || '') + ' (' + (d.drive.account || 'review account') + ')' : 'UPLOAD FAILED - ' + d.drive.error]
    ];
    const dl = d.drive.ok ? d.drive.link : '';
    const text = 'MANUAL REVIEW SUBMISSION\n\n' + rows.map(r => r[0] + ': ' + r[1]).join('\n') +
        (dl ? '\n\nDownload the complete game package (game.zip): ' + dl : '\n\nThe Drive upload failed, so there is no package link yet. The developer was told and can press Submit again.') +
        '\n\nBasic upload validation only - this is NOT a malware scan; review it before approving.';
    const html = '<h2>Manual review submission</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
        rows.map(r => '<tr><td style="border:1px solid #ddd"><b>' + escHtml(r[0]) + '</b></td><td style="border:1px solid #ddd">' + escHtml(r[1]) + '</td></tr>').join('') + '</table>' +
        (dl ? '<p><a href="' + escHtml(dl) + '" style="font-size:16px"><b>Download the complete game package (game.zip) from Google Drive</b></a></p>'
            : '<p><b>The Drive upload failed</b>, so there is no package link yet. The developer was told and can press Submit again.</p>') +
        '<p>Basic upload validation only &mdash; this is <b>not</b> a malware scan; review it before approving.</p>';
    // No attachment on purpose (see the header of this file: Gmail bounces ZIPs that contain .js files).
    const body = { from: String(env.REVIEW_EMAIL_FROM || 'PixelGaunt Review <onboarding@resend.dev>'), to: [reviewTo(env)], subject: '[PixelGaunt Review] ' + d.title + ' - ' + (d.user.name || d.user.email || 'developer'), text, html };
    if (d.user.email) body.reply_to = d.user.email;
    let res, raw = '';
    try {
        res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'pg-review-' + d.id + '-' + d.attempt }, body: JSON.stringify(body) });
        raw = await res.text();
    } catch (e) { console.error('email network error', e && e.message || e); return { ok: false, error: 'Could not reach the email provider (Resend).' }; }
    let j = {}; try { j = JSON.parse(raw); } catch (e) { /* not JSON */ }
    if (!res.ok || !j.id) {
        console.error('email send failed', res.status, raw);
        return { ok: false, error: 'Resend rejected the email (HTTP ' + res.status + (j.message ? ': ' + String(j.message).slice(0, 200) : '') + ').' };
    }
    // Accepted. Where the API key allows it, follow the message for a few seconds so a bounce is reported instead of hidden.
    let lastEvent = 'accepted';
    for (let i = 0; i < 3; i++) {
        await sleep(2000);
        try {
            const st = await fetch('https://api.resend.com/emails/' + encodeURIComponent(j.id), { headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY } });
            if (!st.ok) break;   // sending-only keys cannot read status: "accepted" is the strongest confirmation available
            const e = await st.json(); lastEvent = String(e.last_event || lastEvent);
            if (lastEvent === 'bounced' || lastEvent === 'failed' || lastEvent === 'complained') {
                console.error('email not delivered', j.id, lastEvent);
                return { ok: false, id: j.id, lastEvent, error: 'The email to ' + reviewTo(env) + ' was ' + lastEvent + ' by the receiving server.' };
            }
            if (lastEvent === 'delivered') break;
        } catch (e) { break; }
    }
    return { ok: true, id: j.id, lastEvent };
}

async function requireAdmin(req, env) {
    const user = await verifyFirebaseToken(env, req);
    const a = await fsGet(env, 'admins/' + user.uid);
    if (!a) throw new HttpError(403, 'Administrator access required.');
    return user;
}
async function readJson(req) { try { return await req.json(); } catch (e) { throw new HttpError(400, 'Bad request.'); } }

async function loadForReview(env, id) {
    if (!UUID_RE.test(String(id || ''))) throw new HttpError(400, 'Missing or invalid submission id.');
    const sub = await fsGet(env, 'submissions/' + id);
    if (!sub) throw new HttpError(404, 'Submission not found.');
    return sub;
}

// Reads the game bundle the site would serve and checks it is byte-for-byte the entry HTML of the reviewed package.
async function verifyBundle(env, id, sub) {
    const game = await fsGet(env, 'community_games/' + id);
    if (!game) throw new HttpError(409, 'The playable game was never registered (the upload did not finish on the developer\'s side). They need to retry the submission.');
    if (game.ownerUid !== sub.user_id) throw new HttpError(409, 'Game owner does not match the submission.');
    const res = await fsFetch(env, 'GET', `${fsBase(env)}/community_games/${id}/chunks?pageSize=50`);
    if (!res.ok) throw new HttpError(502, 'The database did not answer. Try again.');
    const docs = ((await res.json()).documents || []).map(docToObj).sort((a, b) => a.i - b.i);
    if (!docs.length || docs.length !== game.chunkCount || docs.some((d, k) => d.i !== k)) throw new HttpError(409, 'The playable game files are incomplete. The developer needs to retry the submission.');
    const gz = concat(docs.map(d => fromB64(d.b)));
    let out;
    try {
        const r = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(); const parts = []; let n = 0;
        for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > 40 * 1048576) throw new Error('big'); parts.push(value); }
        out = concat(parts);
    } catch (e) { throw new HttpError(409, 'The playable game files are corrupt.'); }
    if ((await sha256hex(out)) !== sub.entry_sha256) throw new HttpError(409, 'The playable game does not match the package that was submitted. Reject it and ask the developer to resubmit.');
}

/* ---------------------------------- plays, revenue share, developer agreement ----------------------------------
   Ad revenue from pixelgaunt.com is shared: 90% to the game's developer, 10% to PixelGaunt Studios (DEV_SHARE).
   Plays are counted HERE, not in the browser, and only for published games. A play is NOT counted when it comes from
   the game's developer - same account, a device the developer has used while logged in, or the developer's network
   (IP address seen with their account in the last 30 days) - nor when the same device/network repeats it too quickly.
   This follows Google AdSense's invalid-traffic rules: earnings must not come from the developer's own activity.
   Only salted SHA-256 hashes of IP addresses and device ids are stored, never the raw values. */
const DEV_SHARE = 0.9;
const AGREEMENT_VERSION = '2026-10-04';
const OWNER_IP_DAYS = 30, DEVICE_REPEAT_MIN = 30, IP_REPEAT_MIN = 5;
const DEVICE_RE = /^[a-z0-9-]{16,64}$/;
const monthField = () => 'm_' + pkMonth().replace('-', '_');            // e.g. m_2026_10
const hashId = async (env, kind, v) => (await sha256hex(enc.encode(kind + ':' + v + ':' + (env.PLAY_SALT || 'pg-' + env.FIREBASE_PROJECT_ID)))).slice(0, 40);
const clientIp = req => req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || '';
async function fsUpsert(env, path, obj) {   // set the listed fields, creating the document if needed
    const keys = Object.keys(obj), fields = {}; keys.forEach(k => { fields[k] = toFs(obj[k]); });
    const q = keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    const res = await fsFetch(env, 'PATCH', `${fsBase(env)}/${path}?${q}`, { fields });
    if (!res.ok) { console.error('firestore upsert', path, res.status, await res.text()); throw new HttpError(502, 'The database did not accept the update.'); }
}
async function fsIncrement(env, path, incs) {   // atomic counters (creates the document if needed)
    const name = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
    const fieldTransforms = Object.keys(incs).map(k => ({ fieldPath: k, increment: { integerValue: String(incs[k]) } }));
    const res = await fsFetch(env, 'POST', `${fsBase(env)}:commit`, { writes: [{ transform: { document: name, fieldTransforms } }] });
    if (!res.ok) { console.error('firestore increment', path, res.status, await res.text()); throw new HttpError(502, 'The database did not accept the update.'); }
}
// Remember which devices / networks a logged-in person uses (to recognise a developer playing their own game).
async function rememberUser(env, req, uid, deviceId) {
    const now = new Date(), jobs = [];
    if (DEVICE_RE.test(String(deviceId || ''))) jobs.push(fsUpsert(env, 'seen/dev_' + await hashId(env, 'dev', deviceId), { ['u_' + uid]: now }));
    const ip = clientIp(req); if (ip) jobs.push(fsUpsert(env, 'seen/ip_' + await hashId(env, 'ip', ip), { ['u_' + uid]: now }));
    await Promise.all(jobs);
}
async function handleSeen(req, env, cors) {
    const user = await verifyFirebaseToken(env, req);
    const b = await readJson(req);
    await rememberUser(env, req, user.uid, b.deviceId);
    return json({ ok: true }, 200, cors);
}
async function handlePlay(req, env, cors) {
    const b = await readJson(req);
    const gameId = String(b.gameId || ''), deviceId = String(b.deviceId || '');
    if (!UUID_RE.test(gameId) || !DEVICE_RE.test(deviceId)) throw new HttpError(400, 'Bad play report.');
    let uid = null;
    const tok = req.headers.get('Authorization') || (typeof b.token === 'string' && b.token ? 'Bearer ' + b.token : '');
    if (tok) { try { uid = (await verifyFirebaseToken(env, new Request(req.url, { headers: { Authorization: tok } }))).uid; } catch (e) { /* counted as a guest */ } }
    if (uid) await rememberUser(env, req, uid, deviceId);
    const game = await fsGet(env, 'community_games/' + gameId);
    if (!game || game.status !== 'published') return json({ ok: true, counted: false, reason: 'not_published' }, 200, cors);
    const owner = game.ownerUid, devH = await hashId(env, 'dev', deviceId), ip = clientIp(req), ipH = ip ? await hashId(env, 'ip', ip) : '';
    let reason = null;
    if (uid && uid === owner) reason = 'own_account';
    if (!reason) { const d = await fsGet(env, 'seen/dev_' + devH); if (d && d['u_' + owner]) reason = 'own_device'; }
    if (!reason && ipH) { const n = await fsGet(env, 'seen/ip_' + ipH); const t = n && n['u_' + owner] ? Date.parse(n['u_' + owner]) : 0; if (t && Date.now() - t < OWNER_IP_DAYS * 864e5) reason = 'own_network'; }
    if (reason) { await fsIncrement(env, 'game_stats/' + gameId, { excluded_own: 1 }); return json({ ok: true, counted: false, reason }, 200, cors); }
    // too-fast repeats from the same device or network are not counted
    const now = Date.now();
    const dm = await fsGet(env, `play_marks/${gameId}_d_${devH}`);
    if (dm && now - Date.parse(dm.t) < DEVICE_REPEAT_MIN * 60e3) return json({ ok: true, counted: false, reason: 'repeat' }, 200, cors);
    if (ipH) { const im = await fsGet(env, `play_marks/${gameId}_i_${ipH}`); if (im && now - Date.parse(im.t) < IP_REPEAT_MIN * 60e3) return json({ ok: true, counted: false, reason: 'repeat' }, 200, cors); }
    await fsUpsert(env, `play_marks/${gameId}_d_${devH}`, { t: new Date() });
    if (ipH) await fsUpsert(env, `play_marks/${gameId}_i_${ipH}`, { t: new Date() });
    const mf = monthField(), isNew = await fsCreate(env, 'game_stats/' + gameId + '/players', devH, { first: new Date() });
    await fsIncrement(env, 'game_stats/' + gameId, Object.assign({ plays: 1, [mf]: 1 }, isNew ? { players: 1 } : {}));
    await fsIncrement(env, 'site_stats/plays', { [mf]: 1 });   // all counted plays on the site this month
    return json({ ok: true, counted: true }, 200, cors);
}
async function handleMyStats(req, env, cors) {
    const user = await verifyFirebaseToken(env, req);
    const mf = monthField();
    const games = await fsQueryByField(env, 'community_games', 'ownerUid', user.uid);
    const site = (await fsGet(env, 'site_stats/plays')) || {};
    const list = [];
    for (const g of games) {
        const st = (await fsGet(env, 'game_stats/' + g.id)) || {};
        list.push({ id: g.id, title: g.title, status: g.status, plays: Number(st.plays) || 0, players: Number(st.players) || 0, thisMonth: Number(st[mf]) || 0, excludedOwn: Number(st.excluded_own) || 0 });
    }
    const monthPlays = list.reduce((a, g) => a + g.thisMonth, 0), siteMonth = Number(site[mf]) || 0;
    const earnings = (await fsQueryByField(env, 'earnings', 'uid', user.uid)).map(e => {
        const rev = Number(e.revenue_usd) || 0;
        return { month: e.month || '', revenue: rev, devShare: Math.round(rev * DEV_SHARE * 100) / 100, pgShare: Math.round(rev * (1 - DEV_SHARE) * 100) / 100, status: e.status || 'pending', note: e.note || '' };
    }).sort((a, b) => String(b.month).localeCompare(String(a.month)));
    return json({ ok: true, devShare: DEV_SHARE, month: pkMonth(), games: list, monthPlays, siteMonthPlays: siteMonth, playShare: siteMonth ? monthPlays / siteMonth : 0, earnings, agreementVersion: AGREEMENT_VERSION }, 200, cors);
}

/* ---------------------------------- payment receipts (no gateway) ----------------------------------
   The buyer pays by bank / wallet, then saves a receipt (details + screenshot). It is stored in payments/<ref> and emailed
   to PAYMENT_EMAIL_TO (default pixelgaunt@gmail.com) with the screenshot attached. You confirm it by hand (REVIEW_SETUP.md). */
const paymentTo = env => String(env.PAYMENT_EMAIL_TO || 'pixelgaunt@gmail.com').trim();
const REF_RE = /^PG-\d{8}-[A-Z0-9]{6}$/;
const METHODS = ['Bank account', 'Debit card', 'Credit card', 'Easypaisa', 'JazzCash', 'NayaPay', 'SadaPay'];
async function sendPaymentEmail(env, p, imgB64, imgType) {
    if (!env.RESEND_API_KEY) return { ok: false, error: 'Email is not configured on the review service (RESEND_API_KEY missing).' };
    const rows = [['Receipt no.', p.ref], ['Plan', p.cycle === 'yearly' ? 'Subscriber - Yearly' : 'Subscriber - Monthly'], ['Amount', p.amount], ['Paid with', p.method], ['Paid to', p.paidTo || '-'],
        ['Sender name', p.senderName], ['Sender account / number', p.senderAccount || '-'], ['Transaction ID', p.txnId || '-'], ['Message from the buyer', p.message || '-'], ['PixelGaunt account', p.email + ' (' + p.name + ')'], ['User ID', p.uid], ['Date (UTC)', new Date().toISOString()]];
    const plan = p.cycle === 'yearly' ? 'subscriber_yearly' : 'subscriber_monthly';
    const how = `To approve: check the payment arrived, then in Firebase -> Firestore -> payments -> ${p.ref} set status = confirmed. The ${p.cycle === 'yearly' ? 'yearly' : 'monthly'} subscription then starts automatically (within a few minutes). To decline: set status = rejected.`;
    const body = {
        from: String(env.REVIEW_EMAIL_FROM || 'PixelGaunt Review <onboarding@resend.dev>'), to: [paymentTo(env)], reply_to: p.email || undefined,
        subject: '[PixelGaunt Payment] ' + p.ref + ' - ' + p.amount + ' - ' + (p.name || p.email),
        text: 'PAYMENT RECEIPT - please confirm\n\n' + rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\n\n' + how + '\n\nThe payment screenshot is attached.',
        html: '<h2>Payment receipt - please confirm</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
            rows.map(r => '<tr><td style="border:1px solid #ddd"><b>' + escHtml(r[0]) + '</b></td><td style="border:1px solid #ddd">' + escHtml(r[1]) + '</td></tr>').join('') + '</table><p>' + escHtml(how) + '</p><p>The payment screenshot is attached.</p>',
        attachments: [{ filename: p.ref + (imgType === 'image/png' ? '.png' : imgType === 'image/webp' ? '.webp' : '.jpg'), content: imgB64 }]
    };
    try {
        const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'pg-pay-' + p.ref + '-' + (p.attempt || 1) }, body: JSON.stringify(body) });
        const raw = await res.text(); let j = {}; try { j = JSON.parse(raw); } catch (e) {}
        if (!res.ok || !j.id) { console.error('payment email failed', res.status, raw); return { ok: false, error: 'Resend rejected the email (HTTP ' + res.status + (j.message ? ': ' + String(j.message).slice(0, 200) : '') + ').' }; }
        return { ok: true, id: j.id };
    } catch (e) { return { ok: false, error: 'Could not reach the email provider (Resend).' }; }
}
async function handlePayment(req, env, cors) {
    const user = await verifyFirebaseToken(env, req);
    let form; try { form = await req.formData(); } catch (e) { throw new HttpError(400, 'The receipt could not be read.'); }
    const ref = String(form.get('ref') || ''), cycle = String(form.get('cycle') || '');
    const method = cleanText(form.get('method'), 30), paidTo = cleanText(form.get('paidTo'), 80), senderName = cleanText(form.get('senderName'), 60);
    const senderAccount = cleanText(form.get('senderAccount'), 40), txnId = cleanText(form.get('txnId'), 60), img = form.get('receipt');
    const message = cleanText(form.get('message'), 600);
    if (!REF_RE.test(ref)) throw new HttpError(400, 'Invalid receipt number.');
    if (!PRICES[cycle]) throw new HttpError(400, 'Choose monthly or yearly.');
    if (!METHODS.includes(method)) throw new HttpError(400, 'Choose how you paid.');
    if (!senderName) throw new HttpError(400, 'Enter the sender name.');
    if (!txnId && !message) throw new HttpError(400, 'Enter the transaction ID, or write us a message about your payment.');
    if (!img || typeof img === 'string' || !/^image\/(jpeg|png|webp)$/.test(img.type) || img.size > 900000) throw new HttpError(400, 'Attach your payment screenshot (JPG/PNG, under 900 KB).');
    const u8 = new Uint8Array(await img.arrayBuffer()); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    let rec = await fsGet(env, 'payments/' + ref);
    if (rec && rec.uid !== user.uid) throw new HttpError(409, 'Receipt number conflict - please try again.');
    if (rec && rec.email_state === 'sent') return json({ ok: true, duplicate: true, ref, email: { ok: true, to: paymentTo(env) } }, 200, cors);
    if (!rec) {
        const today = pkDay(), mine = await fsQueryByField(env, 'payments', 'uid', user.uid);
        if (mine.filter(p => String(p.created_day) === today).length >= 5) throw new HttpError(429, 'You have sent 5 receipts today. Please wait for us to confirm them, or try again tomorrow.');
        rec = { ref, uid: user.uid, email: user.email || '', name: user.name || '', plan: cycle === 'yearly' ? 'subscriber_yearly' : 'subscriber_monthly', cycle, amount: PRICES[cycle], method, paidTo, senderName, senderAccount, txnId, message,
            receiptImage: 'data:' + img.type + ';base64,' + b64, status: 'pending_verification', createdAt: new Date(), created_day: today, email_state: 'pending', email_attempts: 0 };
        if (!(await fsCreate(env, 'payments', ref, rec))) throw new HttpError(409, 'Receipt number conflict - please try again.');
    }
    const attempt = (Number(rec.email_attempts) || 0) + 1;
    const mail = await sendPaymentEmail(env, { ...rec, attempt }, b64, img.type);
    await fsPatch(env, 'payments/' + ref, { email_state: mail.ok ? 'sent' : 'failed', email_error: mail.ok ? '' : mail.error, email_id: mail.id || '', email_attempts: attempt, email_to: paymentTo(env) });
    return json({ ok: mail.ok, saved: true, ref, amount: rec.amount, email: { ok: mail.ok, to: paymentTo(env), error: mail.ok ? undefined : mail.error },
        error: mail.ok ? undefined : 'Your receipt was saved, but it could not be emailed to PixelGaunt: ' + mail.error + ' Press Send again.' }, mail.ok ? 200 : 502, cors);
}
async function handleMyPayments(req, env, cors) {
    const user = await verifyFirebaseToken(env, req);
    const list = (await fsQueryByField(env, 'payments', 'uid', user.uid)).map(p => ({ ref: p.ref, cycle: p.cycle, amount: p.amount, method: p.method, txnId: p.txnId, status: p.status, createdAt: p.createdAt, emailed: p.email_state === 'sent', activeUntil: p.plan_expires || null }))
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    return json({ ok: true, payments: list }, 200, cors);
}

/* ---------------------------------- approve / reject ----------------------------------
   YOUR WAY TO DECIDE: Firebase console -> Firestore -> submissions -> <Submission ID from the email>:
     status = approved                                  -> published on the Games page (Community games, "by <creator>")
     status = rejected  (+ rejection_reason = "...")    -> creator sees "Rejected" and your reason
   syncDecisions() carries the decision out: builds the playable copy if missing, checks it is exactly the reviewed game,
   publishes/hides it, and moves the Drive folder to Approved / Rejected. It runs every few minutes (Cron Trigger), and
   whenever someone opens the Games page (GET /sync), so nothing else is needed. */
async function applyApproval(env, sub, by) {
    const id = sub.submission_id || sub.id;
    const pv = await backfillPreview(env, { ...sub, submission_id: id });
    if (!pv.ok) throw new HttpError(409, 'The playable copy could not be built from the Drive package' + (pv.error ? ': ' + pv.error : '.'));
    await verifyBundle(env, id, sub);
    const warn = [];
    if (sub.drive_folder_id) {
        try { const folders = await ensureFolders(env, false); await driveMove(env, sub.drive_folder_id, folders.Approved); }
        catch (e) { warn.push('Drive folder not moved: ' + (e && e.message)); }
    }
    const now = new Date(), game = await fsGet(env, 'community_games/' + id);
    await fsPatch(env, 'community_games/' + id, { status: 'published', rejectionReason: '', reviewedAt: now, ownerName: (game && game.ownerName) || sub.developer_name || 'Community' });
    await fsPatch(env, 'submissions/' + id, { status: 'approved', rejection_reason: '', reviewed_at: now, reviewed_by: by || sub.reviewed_by || 'firebase-console', synced_status: 'approved', decision_error: warn.join(' | ') });
    return { ok: true, warnings: warn };
}
async function applyRejection(env, sub, why, by) {
    const id = sub.submission_id || sub.id; const warn = [];
    if (sub.drive_folder_id) {
        try { const folders = await ensureFolders(env, false); await driveMove(env, sub.drive_folder_id, folders.Rejected); }
        catch (e) { warn.push('Drive folder not moved: ' + (e && e.message)); }
    }
    const now = new Date();
    if (await fsGet(env, 'community_games/' + id)) await fsPatch(env, 'community_games/' + id, { status: 'rejected', rejectionReason: why || '', reviewedAt: now });   // leaves the public list
    await fsPatch(env, 'submissions/' + id, { status: 'rejected', rejection_reason: why || '', reviewed_at: now, reviewed_by: by || sub.reviewed_by || 'firebase-console', synced_status: 'rejected', decision_error: warn.join(' | ') });
    return { ok: true, warnings: warn };
}
async function syncDecisions(env) {
    const out = { published: [], rejected: [], errors: [] };
    for (const sub of await fsQueryByField(env, 'submissions', 'status', 'approved')) {
        if (sub.synced_status === 'approved') continue;
        try { await applyApproval(env, sub); out.published.push(sub.game_name); }
        catch (e) { out.errors.push(sub.id + ': ' + (e && e.message)); try { await fsPatch(env, 'submissions/' + sub.id, { decision_error: String(e && e.message || e).slice(0, 300) }); } catch (x) {} }
    }
    for (const sub of await fsQueryByField(env, 'submissions', 'status', 'rejected')) {
        if (sub.synced_status === 'rejected') continue;
        try { await applyRejection(env, sub, sub.rejection_reason); out.rejected.push(sub.game_name); }
        catch (e) { out.errors.push(sub.id + ': ' + (e && e.message)); }
    }
    // Payments you set to 'confirmed' -> start the subscription the buyer paid for (monthly = 1 month, yearly = 1 year).
    for (const pay of await fsQueryByField(env, 'payments', 'status', 'confirmed')) {
        if (pay.synced_status === 'confirmed') continue;
        try { const r = await activateSubscription(env, pay); out.activated = (out.activated || 0) + 1; console.log('subscription started', pay.id, r.plan, r.until); }
        catch (e) { out.errors.push(pay.id + ': ' + (e && e.message)); }
    }
    // Someone set the GAME document to 'approved' instead: the Games page lists 'published', so normalise it.
    for (const g of await fsQueryByField(env, 'community_games', 'status', 'approved')) {
        try { await fsPatch(env, 'community_games/' + g.id, { status: 'published' }); out.published.push(g.title); } catch (e) { out.errors.push(g.id + ': ' + (e && e.message)); }
    }
    if (out.published.length || out.rejected.length || out.errors.length) console.log('syncDecisions', JSON.stringify(out));
    return out;
}
function addPeriod(from, cycle) { const d = new Date(from); if (cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1); return d; }
async function activateSubscription(env, pay) {
    const plan = pay.cycle === 'yearly' ? 'subscriber_yearly' : 'subscriber_monthly';
    const user = await fsGet(env, 'users/' + pay.uid);
    // Renewing the same plan before it ends adds the new period to the remaining time.
    const curEnd = user && user.plan === plan && user.plan_expires ? Date.parse(user.plan_expires) : 0;
    const start = new Date(Math.max(Date.now(), curEnd || 0));
    const until = addPeriod(start, pay.cycle);
    await fsUpsert(env, 'users/' + pay.uid, { plan, plan_expires: until, plan_started: new Date(), plan_payment_ref: pay.ref || pay.id });
    await fsPatch(env, 'payments/' + (pay.ref || pay.id), { synced_status: 'confirmed', activated_at: new Date(), plan_expires: until });
    return { plan, until };
}
let lastSync = 0;
async function handleSync(req, env, cors, ctx) {   // public + harmless: it only carries out decisions you already made
    const gap = env.SYNC_THROTTLE_MS != null ? Number(env.SYNC_THROTTLE_MS) : 30e3;
    if (Date.now() - lastSync < gap) return json({ ok: true, changed: 0, skipped: true }, 200, cors);
    lastSync = Date.now();
    const r = await syncDecisions(env).catch(e => { console.error('sync failed', e && e.message); return { published: [], rejected: [], errors: [String(e && e.message)] }; });
    return json({ ok: true, changed: r.published.length + r.rejected.length + (r.activated || 0), plansChanged: r.activated || 0 }, 200, cors);
}

async function handleApprove(req, env, cors) {
    const admin = await requireAdmin(req, env);
    const { submissionId } = await readJson(req);
    const sub = await loadForReview(env, submissionId);
    if (sub.status === 'approved' && sub.synced_status === 'approved') return json({ ok: true, status: 'approved', already: true }, 200, cors);
    if (!['pending_review', 'approved'].includes(sub.status)) throw new HttpError(409, `This submission is ${sub.status}, not pending review.`);
    const r = await applyApproval(env, { ...sub, submission_id: submissionId }, admin.uid);
    return json({ ok: true, status: 'approved', warnings: r.warnings }, 200, cors);
}
async function handleReject(req, env, cors) {
    const admin = await requireAdmin(req, env);
    const { submissionId, reason } = await readJson(req);
    const why = cleanText(reason, 500);
    if (why.length < 3) throw new HttpError(400, 'A rejection reason is required.');
    const sub = await loadForReview(env, submissionId);
    if (sub.status === 'rejected' && sub.synced_status === 'rejected') return json({ ok: true, status: 'rejected', already: true }, 200, cors);
    const r = await applyRejection(env, { ...sub, submission_id: submissionId }, why, admin.uid);
    return json({ ok: true, status: 'rejected', warnings: r.warnings }, 200, cors);
}
async function handleDownload(req, env, cors) {
    await requireAdmin(req, env);
    const sub = await loadForReview(env, new URL(req.url).searchParams.get('id'));
    if (!sub.drive_file_id) throw new HttpError(404, 'No Drive copy of this package (the Drive upload did not succeed). Ask the developer to press Submit again.');
    const res = await driveFetch(env, `https://www.googleapis.com/drive/v3/files/${sub.drive_file_id}?alt=media`);
    return new Response(res.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${safeName(sub.game_name, 50)}.zip"`, 'Cache-Control': 'no-store' } });
}
async function handleDriveCheck(req, env, cors) {
    await requireAdmin(req, env);
    const account = await assertDriveAccount(env);
    const f = await ensureFolders(env, true);
    return json({ ok: true, account, folders: [`${DRIVE_ROOT}/Pending`, `${DRIVE_ROOT}/Approved`, `${DRIVE_ROOT}/Rejected`], ids: Object.keys(f).length }, 200, cors);
}

export default {
    // Cron Trigger (Cloudflare -> Worker -> Settings -> Triggers -> Cron: */5 * * * *): carry out your decisions.
    async scheduled(event, env, ctx) { ctx.waitUntil(syncDecisions(env).catch(e => console.error('scheduled sync failed', e && e.message))); },
    async fetch(req, env, ctx) {
        const cors = corsHeaders(req, env), url = new URL(req.url);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        try {
            if (req.method === 'GET' && url.pathname === '/health' && url.searchParams.get('check') === 'drive') {
                // Live Drive test (no secrets shown): token works? which account? can it reach the review folders?
                const r = { configured: !!(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN) };
                if (!r.configured) return json({ ok: false, drive: r, fix: 'Add GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN as Worker secrets (REVIEW_SETUP.md section 2).' }, 200, cors);
                try { await driveToken(env); r.token = 'ok'; } catch (e) { r.token = 'failed: ' + (e && e.message); return json({ ok: false, drive: r, fix: 'The refresh token was refused by Google. If the OAuth consent screen is in "Testing", tokens expire after 7 days: set it to "In production" and create a new refresh token (REVIEW_SETUP.md section 2).' }, 200, cors); }
                try { const a = await driveAccount(env); const want = expectedDriveAccount(env); r.account = a.replace(/^(.{3}).*(@.*)$/, '$1***$2'); r.account_matches = a === want; }
                catch (e) { r.account = 'failed: ' + (e && e.message); return json({ ok: false, drive: r, fix: 'Enable the Google Drive API in Google Cloud for this project.' }, 200, cors); }
                if (!r.account_matches) return json({ ok: false, drive: r, fix: `The token belongs to a different Google account. Create GOOGLE_OAUTH_REFRESH_TOKEN again while signed in as ${expectedDriveAccount(env)}.` }, 200, cors);
                try { await ensureFolders(env, true); r.folders = 'ok'; } catch (e) { r.folders = 'failed: ' + (e && e.message); return json({ ok: false, drive: r }, 200, cors); }
                return json({ ok: true, drive: r, note: 'Drive works. Files go to "' + DRIVE_ROOT + '" in My Drive of the account above.' }, 200, cors);
            }
            if (req.method === 'GET' && url.pathname === '/health') {
                return json({ ok: true, version: '2026-10-04c', configured: { FIREBASE_PROJECT_ID: !!env.FIREBASE_PROJECT_ID, FIREBASE_SA_JSON: !!env.FIREBASE_SA_JSON, GOOGLE_OAUTH_CLIENT_ID: !!env.GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: !!env.GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN: !!env.GOOGLE_OAUTH_REFRESH_TOKEN, RESEND_API_KEY: !!env.RESEND_API_KEY }, review_email_to: reviewTo(env), drive_expected_account: expectedDriveAccount(env), payment_email_to: paymentTo(env), note: 'Drive (all three GOOGLE_OAUTH_* values) and RESEND_API_KEY are both required for submissions. Live Drive test: /health?check=drive' }, 200, cors);
            }
            if (!env.FIREBASE_PROJECT_ID) throw new HttpError(503, 'Review service is not configured (FIREBASE_PROJECT_ID).');
            if (req.method === 'GET' && url.pathname === '/quota') return await handleQuota(req, env, cors);
            if (req.method === 'GET' && url.pathname === '/sync') return await handleSync(req, env, cors, ctx);
            if (req.method === 'POST' && url.pathname === '/play') return await handlePlay(req, env, cors);
            if (req.method === 'POST' && url.pathname === '/seen') return await handleSeen(req, env, cors);
            if (req.method === 'GET' && url.pathname === '/my-stats') return await handleMyStats(req, env, cors);
            if (req.method === 'POST' && url.pathname === '/payment') return await handlePayment(req, env, cors);
            if (req.method === 'GET' && url.pathname === '/payments') return await handleMyPayments(req, env, cors);
            if (req.method === 'POST' && url.pathname === '/submit') return await handleSubmit(req, env, cors);
            if (req.method === 'POST' && url.pathname === '/admin/approve') return await handleApprove(req, env, cors);
            if (req.method === 'POST' && url.pathname === '/admin/reject') return await handleReject(req, env, cors);
            if (req.method === 'POST' && url.pathname === '/admin/drive-check') return await handleDriveCheck(req, env, cors);
            if (req.method === 'GET' && url.pathname === '/admin/download') return await handleDownload(req, env, cors);
            throw new HttpError(404, 'Not found.');
        } catch (err) {
            if (err instanceof HttpError) return json({ ok: false, error: err.message, ...err.extra }, err.status, cors);
            console.error('unhandled', err && err.stack || err);
            return json({ ok: false, error: 'Something went wrong on the server. Try again.' }, 500, cors);
        }
    }
};
