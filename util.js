/* Small, dependency-free helpers shared by the worker.
   Everything here uses only Web APIs available in the Workers runtime
   (atob/btoa, TextEncoder/TextDecoder) - no npm packages required. */

export function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const raw = atob(b64 + pad);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function bytesToB64url(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function strToB64url(str) {
  return bytesToB64url(new TextEncoder().encode(str));
}

export function b64urlToStr(b64url) {
  return new TextDecoder().decode(b64urlToBytes(b64url));
}

function stdB64ToBytes(b64) {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// Converts a PEM-encoded key (the format inside a Firebase/GCP service
// account JSON's `private_key` field) into the raw DER ArrayBuffer that
// crypto.subtle.importKey expects.
export function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  return stdB64ToBytes(b64).buffer;
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bootstrap-Key',
    'Access-Control-Max-Age': '86400'
  };
}

export function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}
