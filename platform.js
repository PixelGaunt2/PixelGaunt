/* =====================================================================================
   PIXELGAUNT PLATFORM MODULES  -  Publish (game check + publishing), Tournaments, Creator Lab
   -------------------------------------------------------------------------------------
   Loaded on demand by script.js only when one of those homepage sections is about to be
   seen. Vanilla JS, no libraries. Uses the Firebase handles exposed by firebase-auth.js
   (window.pgFB) and the helpers exposed by script.js (window.PGCore).

   NOTHING SECRET LIVES IN THIS FILE. Game submissions go to the manual-review service
   (pg-review-worker.js, deployed separately) - Google Drive credentials stay there.
   Firestore security rules for the collections used here: see firestore.rules.
   ===================================================================================== */
(function () {
    'use strict';
    const Core = window.PGCore;
    if (!Core) { console.error('platform.js needs script.js (PGCore) to be loaded first.'); return; }
    const { esc } = Core;

    /* ------------------------------ PUBLIC CONFIG (no secrets) ------------------------------ */
    const CONFIG = {
        // Base URL of your deployed pg-review-worker.js, no trailing slash (e.g. https://pg-review.yourname.workers.dev).
        // While this is empty, submitting a game shows "not connected yet" - it never pretends to succeed.
        reviewEndpoint: 'https://pg-review.pixelgaunt.workers.dev',
        maxUploadBytes: 40 * 1024 * 1024,      // raw upload
        maxUnpackedBytes: 60 * 1024 * 1024,    // zip-bomb guard
        maxBundleBytes: 6 * 1024 * 1024,       // gzip bundle stored in Firestore (Spark plan)
        maxFiles: 600,
        chunkBytes: 900000,                    // Firestore document limit is 1 MiB
        smokeTestMs: 3500,
        cdnAllow: ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
        fontHosts: ['fonts.googleapis.com', 'fonts.gstatic.com'],
        // First-party games can report scores to a server for score-attack events (used by the Publish form).
        // Once a game does, list it here: { 16: 'score' } (key = game id in script.js).
        firstPartyTournament: {},
        // Creator Lab: flip a value to true only when a real service is connected server-side.
        fulfilment: { digital: false, print2d: false, print3d: false, merch: false, payments: false }
    };

    /* --------------------------- ACCOUNT PLAN LIMITS (Publish / Creator Studio) ---------------------------
       No real payment gateway is connected yet (see subscription.html), so every account is 'free' until
       one is wired up server-side. window.pgUserPlan is set by firebase-auth.js from the user's Firestore
       profile (users/{uid}.plan) after each login. */
    const PLAN_LIMITS = {
        free: { maxGames: 1, maxBytes: 5 * 1024 * 1024, period: null, label: 'Free' },
        subscriber: { maxGames: 1, maxBytes: 10 * 1024 * 1024, period: 'month', label: 'Subscriber' }
    };
    // Also enforced by the review service (pg-review-worker.js), which is the real gate:
    const LIMITS_INFO = { userMonthly: 1, siteDaily: 3, reviewDays: 7 };
    function planLimits() { return PLAN_LIMITS[window.pgUserPlan] || PLAN_LIMITS.free; }
    function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }

    /* ------------------------------------- small utils ------------------------------------- */
    const $ = (sel, root) => (root || document).querySelector(sel);
    const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
    const fb = () => Core.whenFirebase();
    const getUser = () => (window.pgFB && window.pgFB.auth.currentUser) || null;
    const onAuth = cb => window.addEventListener('pg-auth', cb);
    let toastTimer;
    function toast(msg) {
        let t = $('.pg-toast');
        if (!t) { t = document.createElement('div'); t.className = 'pg-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
        t.textContent = msg;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.remove(), 4200);
    }
    function needLogin(why) {
        if (getUser()) return false;
        toast(why || 'Sign in to continue.');
        if (window.openModal) window.openModal('login-modal');
        return true;
    }
    const cleanName = u => String((u && u.displayName) || 'Player').replace(/[<>]/g, '').slice(0, 40) || 'Player';
    const utf8 = new TextDecoder('utf-8');
    const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', webm: 'video/webm', mp4: 'video/mp4', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain', xml: 'application/xml', wasm: 'application/wasm', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', obj: 'text/plain', mtl: 'text/plain', atlas: 'text/plain', tmx: 'application/xml', tsx: 'application/xml', map: 'application/json', md: 'text/plain', csv: 'text/plain' };
    const BLOCKED_EXT = ['exe', 'dll', 'bat', 'cmd', 'sh', 'apk', 'msi', 'jar', 'php', 'dmg', 'com', 'scr', 'vbs', 'ps1', 'app', 'deb', 'pkg'];
    const extOf = p => { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; };
    const dirOf = p => p.indexOf('/') < 0 ? '' : p.slice(0, p.lastIndexOf('/') + 1);
    function resolvePath(base, ref) {
        ref = String(ref).split('#')[0].split('?')[0];
        try { ref = decodeURIComponent(ref); } catch (e) { /* keep raw */ }
        const out = [];
        (ref.charAt(0) === '/' ? ref : base + ref).split('/').forEach(seg => {
            if (seg === '' || seg === '.') return;
            if (seg === '..') out.pop(); else out.push(seg);
        });
        return out.join('/');
    }
    const isRemote = u => /^(https?:)?\/\//i.test(u);
    const isInline = u => /^(data:|blob:|#|about:|javascript:|mailto:)/i.test(u);
    function b64(u8) {
        let s = ''; const step = 0x8000;
        for (let i = 0; i < u8.length; i += step) s += String.fromCharCode.apply(null, u8.subarray(i, i + step));
        return btoa(s);
    }
    async function gzip(text) {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    async function readCapped(stream, cap) {
        const reader = stream.getReader(); const chunks = []; let n = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            n += value.length;
            if (n > cap) { reader.cancel(); throw new Error('unpacked size exceeds the limit'); }
            chunks.push(value);
        }
        const out = new Uint8Array(n); let o = 0;
        chunks.forEach(c => { out.set(c, o); o += c.length; });
        return out;
    }

    /* Submission status as shown to creators (values are set by the review service, never by the browser) */
    function statusInfo(st) {
        if (st === 'approved' || st === 'published') return { label: 'Approved / Published', cls: 'ok' };
        if (st === 'rejected') return { label: 'Rejected', cls: 'bad' };
        if (st === 'pending_review' || st === 'pending') return { label: 'Under review · within 7 working days', cls: 'warn' };
        // Anything else is NOT pending review - never dress a failed/unfinished submission up as one.
        if (st === 'email_failed') return { label: 'Email Failed', cls: 'bad' };
        if (st === 'drive_failed') return { label: 'Drive Upload Failed', cls: 'bad' };
        if (st === 'submission_failed') return { label: 'Submission Failed', cls: 'bad' };
        if (st === 'sending') return { label: 'Submitting', cls: 'warn' };
        return { label: String(st || 'Unknown'), cls: 'bad' };
    }
    function newId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        const h = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
    }
    /* Minimal "stored" zip writer - used when the developer uploads a folder or a single .html, so the admin
       always gets one real .zip package to download and test. */
    const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    function buildZip(files) {
        const te = new TextEncoder(), parts = [], central = []; let off = 0;
        files.forEach((bytes, name) => {
            const nb = te.encode(name), crc = crc32(bytes);
            const lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
            lh.setUint32(14, crc, true); lh.setUint32(18, bytes.length, true); lh.setUint32(22, bytes.length, true); lh.setUint16(26, nb.length, true);
            parts.push(new Uint8Array(lh.buffer), nb, bytes);
            const ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
            ch.setUint32(16, crc, true); ch.setUint32(20, bytes.length, true); ch.setUint32(24, bytes.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
            central.push(new Uint8Array(ch.buffer), nb);
            off += 30 + nb.length + bytes.length;
        });
        const cdSize = central.reduce((a, q) => a + q.length, 0);
        const e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.size, true); e.setUint16(10, files.size, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
        return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
    }

    /* ------------------------------------ ZIP reader ------------------------------------
       Reads stored + deflate entries with the browser's DecompressionStream. No library.
       Guards: path traversal, entry count, total unpacked size (zip bombs), encryption. */
    async function readZip(buf) {
        if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack .zip files. Use a current Chrome, Edge, Firefox or Safari.');
        const v = new DataView(buf), u8 = new Uint8Array(buf);
        let eocd = -1;
        for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
            if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('That is not a valid .zip file.');
        const count = v.getUint16(eocd + 10, true), cdOff = v.getUint32(eocd + 16, true);
        if (count === 0xffff || cdOff === 0xffffffff) throw new Error('ZIP64 archives are not supported.');
        if (count > CONFIG.maxFiles + 200) throw new Error('The archive has too many entries (' + count + ').');
        const files = new Map(), problems = [];
        let p = cdOff, total = 0;
        for (let n = 0; n < count; n++) {
            if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The zip directory is corrupt.');
            const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
            const csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
            const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
            const lho = v.getUint32(p + 42, true);
            const rawName = utf8.decode(u8.subarray(p + 46, p + 46 + nlen));
            p += 46 + nlen + elen + clen;
            const name = rawName.replace(/\\/g, '/').replace(/^\.\//, '');
            if (name.endsWith('/')) continue;
            if (/(^|\/)(__MACOSX|\.git|node_modules)\//.test(name) || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(name)) continue;
            if (name.charAt(0) === '/' || /^[a-z]:/i.test(name) || name.split('/').indexOf('..') >= 0) { problems.push('Unsafe path in zip: ' + name); continue; }
            if (flags & 1) { problems.push('Encrypted entry not supported: ' + name); continue; }
            total += usize;
            if (total > CONFIG.maxUnpackedBytes) throw new Error('The archive unpacks to more than ' + fmtBytes(CONFIG.maxUnpackedBytes) + '.');
            const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
            const raw = u8.subarray(start, start + csize);
            let bytes;
            if (method === 0) bytes = raw.slice();
            else if (method === 8) {
                try { bytes = await readCapped(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')), Math.min(usize + 1024, CONFIG.maxUnpackedBytes)); }
                catch (e) { problems.push('Could not unpack ' + name + ' (' + e.message + ')'); continue; }
            } else { problems.push('Unsupported compression in ' + name); continue; }
            files.set(name, bytes);
        }
        return { files, problems };
    }

    /* Turns whatever the developer gave us (zip / html / folder / dropped items) into Map(path -> Uint8Array). */
    async function collectFiles(input) {
        let files = new Map(), problems = [];
        const add = (path, bytes) => files.set(path.replace(/\\/g, '/').replace(/^\.\//, ''), bytes);
        let raw = 0;
        for (const f of input) {
            raw += f.size;
            if (raw > CONFIG.maxUploadBytes) throw new Error('The upload is larger than ' + fmtBytes(CONFIG.maxUploadBytes) + '.');
        }
        if (input.length === 1 && /\.zip$/i.test(input[0].name)) {
            const z = await readZip(await input[0].arrayBuffer());
            files = z.files; problems = z.problems;
        } else {
            for (const f of input) add(f.pgPath || f.webkitRelativePath || f.name, new Uint8Array(await f.arrayBuffer()));
        }
        // Remove a single wrapping folder (my-game/index.html -> index.html)
        const paths = [...files.keys()];
        if (paths.length && !paths.some(x => x.indexOf('/') < 0)) {
            const top = paths[0].split('/')[0];
            if (paths.every(x => x.split('/')[0] === top)) {
                const m = new Map(); files.forEach((b, k) => m.set(k.slice(top.length + 1), b)); files = m;
            }
        }
        return { files, problems };
    }
    // Drag & drop of folders (webkitGetAsEntry)
    async function filesFromDrop(dt) {
        const out = [];
        const walk = async (entry, path) => {
            if (entry.isFile) {
                const f = await new Promise((res, rej) => entry.file(res, rej));
                f.pgPath = path + entry.name; out.push(f);
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                for (;;) {
                    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
                    if (!batch.length) break;
                    for (const e of batch) await walk(e, path + entry.name + '/');
                }
            }
        };
        const items = dt.items ? [...dt.items] : [];
        if (items.length && items[0].webkitGetAsEntry) {
            for (const it of items) { const e = it.webkitGetAsEntry(); if (e) await walk(e, ''); }
            if (out.length) return out;
        }
        return [...dt.files];
    }

    /* ======================================================================================
       LOCAL GAME CHECK  (runs in the browser for quick feedback. The review service repeats the
       zip / size / executable-file checks on the server, because browser checks can be bypassed.
       This is basic upload validation, NOT a malware scan.)
       ====================================================================================== */
    async function runLocalCheck(files, problems, log) {
        const checks = [];
        const push = (level, text, detail) => checks.push({ level, text, detail });
        problems.forEach(p => push('warn', p));

        const names = [...files.keys()];
        const htmlFiles = names.filter(n => /\.html?$/i.test(n));
        let entry = htmlFiles.find(n => /(^|\/)index\.html?$/i.test(n)) || (htmlFiles.length === 1 ? htmlFiles[0] : null);
        if (!entry && htmlFiles.length > 1) entry = htmlFiles.sort((a, b) => a.split('/').length - b.split('/').length)[0];
        if (!entry) { push('fail', 'No HTML entry point found', 'Include an index.html (or a single .html file) at the top level.'); return { checks, entry: null, sizeTotal: [...files.values()].reduce((n, b) => n + b.length, 0) }; }
        push('pass', 'HTML entry point detected', entry);

        const sizeTotal = [...files.values()].reduce((n, b) => n + b.length, 0);
        if (sizeTotal > CONFIG.maxUnpackedBytes) push('fail', 'Unpacked size is too large', fmtBytes(sizeTotal));

        // Dangerous file types
        const blocked = names.filter(n => BLOCKED_EXT.includes(extOf(n)));
        if (blocked.length) push('fail', 'Disallowed executable file(s) present', blocked.slice(0, 6).join(', '));
        else push('pass', 'No executable/installer files found');

        const html = utf8.decode(files.get(entry));
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const parserErr = doc.querySelector('parsererror');
        if (parserErr) push('warn', 'HTML did not parse cleanly', 'The file may still run, but check the markup.');

        // JS presence + syntax
        const inlineScripts = [...doc.querySelectorAll('script')].filter(s => !s.src && s.textContent.trim());
        const srcScripts = [...doc.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
        let jsOk = true, jsCount = inlineScripts.length;
        inlineScripts.forEach((s, i) => {
            try { new Function(s.textContent); } catch (e) {
                if (!/^\s*(import|export)\b/m.test(s.textContent)) { jsOk = false; push('fail', 'JavaScript syntax error in an inline <script> #' + (i + 1), e.message); }
            }
        });
        const base = dirOf(entry);
        for (const src of srcScripts) {
            if (isInline(src)) continue;
            if (isRemote(src)) {
                let host = ''; try { host = new URL(src).host; } catch (e) {}
                if (!CONFIG.cdnAllow.includes(host)) push('warn', 'External script host not on the allow-list', src);
                continue;
            }
            jsCount++;
            const p = resolvePath(base, src);
            if (!files.has(p)) push('fail', 'Missing script file', src);
        }
        if (jsCount) { if (jsOk && !checks.some(c => c.level === 'fail' && /script/i.test(c.text))) push('pass', 'JavaScript detected (' + jsCount + ' file(s)/blocks)'); }
        else push('warn', 'No JavaScript found', 'Static pages can still publish, but most browser games use JS.');

        // CSS
        const cssLinks = [...doc.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href'));
        let cssMissing = 0;
        cssLinks.forEach(href => {
            if (isInline(href) || isRemote(href)) return;
            if (!files.has(resolvePath(base, href))) { cssMissing++; push('fail', 'Missing stylesheet', href); }
        });
        if (cssLinks.length && !cssMissing) push('pass', 'CSS detected and files present (' + cssLinks.length + ')');
        else if (!cssLinks.length && !doc.querySelector('style')) push('info', 'No separate CSS found', 'Fine if styling is inline or the game does not need it.');

        // Assets (img/audio/video/source) + basic CSS url() check
        const assetRefs = [];
        doc.querySelectorAll('img[src], source[src], audio[src], video[src]').forEach(el => assetRefs.push(el.getAttribute('src')));
        doc.querySelectorAll('[style]').forEach(el => { const m = /url\((['"]?)([^'")]+)\1\)/i.exec(el.getAttribute('style') || ''); if (m) assetRefs.push(m[2]); });
        (doc.querySelector('style') ? [doc.querySelector('style').textContent] : []).forEach(css => {
            (css.match(/url\((['"]?)([^'")]+)\1\)/gi) || []).forEach(m => assetRefs.push(m.replace(/^url\((['"]?)/i, '').replace(/(['"]?)\)$/, '')));
        });
        let missingAssets = [];
        assetRefs.forEach(ref => { if (!ref || isInline(ref) || isRemote(ref)) return; const p = resolvePath(base, ref); if (!files.has(p)) missingAssets.push(ref); });
        if (assetRefs.length) {
            if (missingAssets.length) push('fail', 'Missing ' + missingAssets.length + ' referenced asset(s)', missingAssets.slice(0, 6).join(', '));
            else push('pass', 'Assets detected and present (' + assetRefs.length + ' reference(s))');
        } else push('info', 'No image/audio/video tags referenced from HTML', 'Assets loaded only from JS are not checked here - the sandbox test below still catches a broken one.');

        const audioCount = names.filter(n => /\.(mp3|ogg|wav|m4a|aac|opus)$/i.test(n)).length;
        push('info', audioCount ? ('Audio files found: ' + audioCount) : 'No audio files found');

        // Unresolved local paths anywhere in HTML/CSS/JS text (catches JS-side references too)
        const textFiles = names.filter(n => /\.(html?|css|js|mjs|json)$/i.test(n));
        const pathRe = /(?:src|href)\s*=\s*["']([^"'#][^"']*)["']|url\((['"]?)([^"')]+)\2\)|\bfetch\(\s*["']([^"']+)["']/gi;
        let brokenLocal = new Set();
        textFiles.forEach(n => {
            const t = /\.(html?)$/i.test(n) ? html && n === entry ? '' : utf8.decode(files.get(n)) : utf8.decode(files.get(n));
            let m; const localBase = dirOf(n);
            while ((m = pathRe.exec(t))) {
                const ref = m[1] || m[3] || m[4];
                if (!ref || isInline(ref) || isRemote(ref) || ref.length > 300) continue;
                const p = resolvePath(localBase, ref);
                if (/\.(html?|css|js|mjs|json|png|jpe?g|gif|webp|svg|mp3|ogg|wav|m4a|glb|gltf|woff2?|ttf|otf|json)$/i.test(p) && !files.has(p) && !missingAssets.includes(ref)) brokenLocal.add(n + ' -> ' + ref);
            }
        });
        if (brokenLocal.size) push('warn', 'Possible broken path(s) inside code', [...brokenLocal].slice(0, 6).join('; '));

        // Malicious-pattern scan (heuristic, not a real antivirus - stated as such in the report)
        const suspicious = [];
        const scanText = (label, t) => {
            if (/\beval\s*\(\s*atob\s*\(/i.test(t)) suspicious.push(label + ': eval(atob(...)) obfuscation');
            if (/document\.write\(\s*unescape\(/i.test(t)) suspicious.push(label + ': document.write(unescape(...))');
            if (/fetch\(|XMLHttpRequest|WebSocket/i.test(t)) {
                const hosts = new Set();
                (t.match(/https?:\/\/[a-z0-9.-]+/gi) || []).forEach(u => { try { hosts.add(new URL(u).host); } catch (e) {} });
                hosts.forEach(h => { if (!CONFIG.cdnAllow.includes(h)) suspicious.push(label + ': network call to ' + h); });
            }
            if (/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(t)) suspicious.push(label + ': reads/writes browser storage (blocked by the sandbox regardless)');
            if (/window\.(top|parent)\b/i.test(t)) suspicious.push(label + ': references window.top/parent (blocked by the sandbox)');
        };
        textFiles.forEach(n => { if (/\.(html?|js|mjs)$/i.test(n)) scanText(n, utf8.decode(files.get(n))); });
        if (suspicious.length) push('warn', 'Patterns worth a manual look (' + suspicious.length + ')', suspicious.slice(0, 6).join(' | '));
        else push('pass', 'No obviously malicious code patterns found');

        // Looks like a browser game at all?
        const looksLikeGame = jsCount > 0 || /<canvas/i.test(html) || /webgl|phaser|pixi|three\.js|kaboom|kaplay/i.test(html);
        push(looksLikeGame ? 'pass' : 'warn', looksLikeGame ? 'Looks like a browser game' : 'This does not look like an interactive game', looksLikeGame ? '' : 'No canvas, JS or known game framework detected.');

        const fails = checks.filter(c => c.level === 'fail').length;
        const warns = checks.filter(c => c.level === 'warn').length;
        return { checks, entry, sizeTotal, verdict: fails ? 'bad' : warns ? 'warn' : 'ok', fails, warns };
    }

    /* Sandbox smoke test: actually loads the game in a hidden, fully-locked-down iframe and
       watches for a JS error or a hang. Same sandbox flags real play will use, plus network is
       cut entirely here (no connect-src) since this step only checks that the page runs. */
    function smokeTest(html) {
        return new Promise(resolve => {
            const frame = document.createElement('iframe');
            frame.setAttribute('sandbox', 'allow-scripts');
            frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
            const csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-src 'none'";
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const meta = doc.createElement('meta'); meta.setAttribute('http-equiv', 'Content-Security-Policy'); meta.setAttribute('content', csp);
            doc.head.insertBefore(meta, doc.head.firstChild);
            const errors = [];
            const onMsg = e => { if (e.source === frame.contentWindow && e.data && e.data.__pgSmoke) { errors.push(...e.data.errors); finish(); } };
            let done = false;
            function finish() {
                if (done) return; done = true;
                window.removeEventListener('message', onMsg);
                clearTimeout(timer); frame.remove();
                resolve(errors);
            }
            window.addEventListener('message', onMsg);
            const tap = "<script>(function(){var e=[];window.onerror=function(m){e.push(String(m));};window.addEventListener('unhandledrejection',function(ev){e.push('Unhandled promise rejection: '+ev.reason);});setTimeout(function(){try{parent.postMessage({__pgSmoke:true,errors:e},'*');}catch(x){}},1600);})();<\/script>";
            doc.head.insertBefore(new DOMParser().parseFromString(tap, 'text/html').head.firstChild, doc.head.firstChild);
            frame.setAttribute('srcdoc', '<!DOCTYPE html>' + doc.documentElement.outerHTML);
            const timer = setTimeout(finish, CONFIG.smokeTestMs);
            document.body.appendChild(frame);
        });
    }

    /* ======================================================================================
       PUBLISH MODULE
       ====================================================================================== */
    let pubState = null; // { files, entry, html, result }

    function renderChecklist(root, res) {
        const items = res.checks.map(c => `<li class="${c.level}"><span class="g">${c.level === 'pass' ? '✓' : c.level === 'fail' ? '✗' : c.level === 'warn' ? '⚠' : 'i'}</span><span>${esc(c.text)}${c.detail ? '<small>' + esc(c.detail) + '</small>' : ''}</span></li>`).join('');
        root.innerHTML = `<ul class="pg-checks">${items}</ul>`;
    }

    function verdictBanner(res) {
        if (res.verdict === 'bad') return { cls: 'bad', title: 'Not ready to submit', sub: (res.fails || 0) + ' check(s) failed. Fix these and check again.' };
        if (res.verdict === 'warn') return { cls: 'warn', title: 'Ready to submit, with warnings', sub: res.warns + ' warning(s) - you can still submit. A person reviews every game before it is published.' };
        return { cls: 'ok', title: 'READY TO SUBMIT', sub: 'Basic file checks passed. Next step: manual review.' };
    }

    async function runCheck(root, files, problems) {
        const bar = $('.pg-progress i', root); const list = $('.pg-checklist', root); const verdictBox = $('.pg-verdict-box', root); const publishBtn = $('.pg-publish-btn', root);
        publishBtn.disabled = true; verdictBox.innerHTML = '';
        const setProgress = pct => { if (bar) bar.style.width = pct + '%'; };
        setProgress(15);
        const res = await runLocalCheck(files, problems);
        setProgress(55);
        let smokeErrors = [];
        if (res.entry) {
            try { smokeErrors = await smokeTest(utf8.decode(files.get(res.entry))); } catch (e) { /* ignore - local checks stand */ }
        }
        if (smokeErrors.length) { res.checks.push({ level: 'fail', text: 'The game threw an error when it ran in the sandbox', detail: smokeErrors.slice(0, 3).join(' | ') }); res.verdict = 'bad'; res.fails = (res.fails || 0) + 1; }
        else if (res.entry) res.checks.push({ level: 'pass', text: 'Loaded and ran in the sandbox test with no errors' });
        setProgress(100);
        renderChecklist(list, res);
        const v = verdictBanner(res);
        verdictBox.innerHTML = `<div class="pg-verdict ${v.cls}">${esc(v.title)}<small>${esc(v.sub)}</small></div>`;
        publishBtn.disabled = v.cls === 'bad';
        // submissionId is created once per selected upload, so a retry after a network error re-uses it (no duplicates)
        pubState = { files, entry: res.entry, verdict: v.cls, sizeTotal: res.sizeTotal, submissionId: newId(), sourceZip: null };
        return res;
    }

    async function submitGame(root, meta) {
        if (!pubState || !pubState.entry) return;
        if (needLogin('Sign in to submit your game.')) return;
        const btn = $('.pg-publish-btn', root);
        const box = $('.pg-verdict-box', root);
        if (!CONFIG.reviewEndpoint) {
            // Real cause, not a transient state: the review service (pg-review-worker.js) has not been deployed/linked yet.
            console.error('Submit blocked: CONFIG.reviewEndpoint is empty in platform.js. Deploy pg-review-worker.js and set reviewEndpoint to its URL (see REVIEW_SETUP.md, steps 3-4).');
            toast('Submission service is not configured on this site yet (review service URL missing). This is a site setup issue, not a problem with your game - your files were not sent.');
            return;
        }
        const { allowed, limits, used } = await usageInfo();
        if (!allowed) { toast(`You've used ${used} of ${limits.maxGames} games on the ${limits.label} plan. Upgrade to submit more.`); return; }
        if (pubState.submitting) return;   // double-click guard: one send at a time
        pubState.submitting = true;
        btn.disabled = true; const oldLabel = btn.textContent; btn.textContent = 'Sending...';
        try {
            const user = getUser();
            const id = pubState.submissionId;
            // MVP bundle (unchanged): the entry HTML only, so assets must be inlined as data: URLs. The FULL package
            // goes to the admin via Google Drive so it can be tested properly before anything goes live.
            const html = utf8.decode(pubState.files.get(pubState.entry));
            const gz = await gzip(html);
            if (gz.length > CONFIG.maxBundleBytes) throw new Error('This game packages to more than ' + fmtBytes(CONFIG.maxBundleBytes) + ' after compression. Inline assets as data: URLs and stay under the limit.');
            const pkgBlob = pubState.sourceZip || buildZip(pubState.files);

            // 1) The review service re-validates the package, enforces the plan from the database, uploads the complete
            //    package to Google Drive, emails the review inbox, and answers with the real result of EACH step.
            //    Only when both succeeded is the submission pending_review. Re-sending the same id retries only what failed.
            const form = new FormData();
            form.append('submissionId', id);
            form.append('title', meta.title);
            form.append('description', meta.description || '');
            form.append('packageName', (pubState.sourceZip && pubState.sourceZip.name) || 'game.zip');
            form.append('package', pkgBlob, 'game.zip');
            let res;
            try {
                res = await fetch(CONFIG.reviewEndpoint.replace(/\/+$/, '') + '/submit', { method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken() }, body: form });
            } catch (netErr) { throw new Error('Could not reach the submission service. Check your connection and press Submit again - nothing will be duplicated.'); }
            let data = {}; try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
            // The ONLY success condition: the review service says both Drive and the email were delivered.
            const delivered = res.ok && data.ok === true && data.status === 'pending_review';
            if (!delivered) {
                const details = Array.isArray(data.details) && data.details.length ? data.details : null;
                if (details) { box.innerHTML = `<div class="pg-verdict bad">Basic validation failed<small>${details.map(esc).join('<br>')}</small></div>`; }
                else if (data.drive || data.email) {
                    // Per-step result straight from the backend (Drive and email are tracked separately).
                    const line = (name, r, okText) => `<li class="${r && r.ok ? 'pass' : 'fail'}"><span class="g">${r && r.ok ? '✓' : '✗'}</span><span>${esc(name)}: ${esc(r && r.ok ? okText : ((r && r.error) || 'failed'))}</span></li>`;
                    const title = data.status === 'email_failed' ? 'Email failed - your game is in Google Drive, but the review email was not sent'
                        : data.status === 'drive_failed' ? 'Drive upload failed - the review email was sent, but your game is not in Google Drive'
                        : 'Submission could not be completed. Please try again.';
                    box.innerHTML = `<div class="pg-verdict bad">${esc(title)}<small>Status: ${esc(statusInfo(data.status).label)}. Press Submit again to retry only the failed step - nothing is duplicated.</small></div>` +
                        `<ul class="pg-checks" style="margin-top:10px;">${line('Google Drive upload', data.drive, 'stored')}${line('Email to ' + ((data.email && data.email.to) || 'pixelgaunt@gmail.com'), data.email, 'sent')}</ul>`;
                }
                const e = new Error(data.error || ('Submission failed (HTTP ' + res.status + ').'));
                e.shown = !!(details || data.drive || data.email);
                throw e;
            }

            // 2) Write the playable bundle under the SAME id. Its status is forced to pending_review by firestore.rules,
            //    and the rules only allow it when the service has already recorded this submission for this user.
            const { db, fs } = await fb();
            const gameRef = fs.doc(db, 'community_games', id);
            const chunkBytes = [];
            for (let i = 0; i < gz.length; i += CONFIG.chunkBytes) chunkBytes.push(gz.subarray(i, i + CONFIG.chunkBytes));
            if (!(await fs.getDoc(gameRef)).exists()) {
                await fs.setDoc(gameRef, {
                    title: meta.title, genre: meta.genre, description: meta.description || '',
                    controls: meta.controls || '', orientation: meta.orientation || 'landscape',
                    thumb: meta.thumbDataUrl || '', ownerUid: user.uid, ownerName: cleanName(user),
                    status: 'pending_review', chunkCount: chunkBytes.length,
                    tournament: meta.tournamentServer ? { reporting: 'score', server: meta.tournamentServer } : null,
                    createdAt: fs.serverTimestamp(), checkVerdict: pubState.verdict
                });
            }
            await Promise.all(chunkBytes.map(async (b, i) => {
                const cref = fs.doc(db, 'community_games', id, 'chunks', String(i));
                if (!(await fs.getDoc(cref)).exists()) await fs.setDoc(cref, { i, b: fs.Bytes.fromUint8Array(b) });
            }));

            Core.invalidateCommunity();
            // Thank-you screen, then straight to the creator's dashboard (My Games), where the game shows as under review.
            const DASH = 'creator-studio.html#games';
            root.innerHTML = `<div class="pg-verdict ok" role="status">Thanks for your game submission!<small>Submission successfully sent for manual review. Google Drive: stored. Email to ${esc((data.email && data.email.to) || 'pixelgaunt@gmail.com')}: sent.</small></div>` +
                `<p style="margin-top:12px;"><b>${esc(meta.title)}</b> <span class="pg-pill warn">Under review</span></p>` +
                `<p class="pg-note" style="margin-top:6px;">Our team reviews every game by hand. You'll hear from us <b>within ${LIMITS_INFO.reviewDays} working days</b>. Submission ID ${esc(id)}.</p>` +
                `<p class="pg-note" style="margin-top:10px;">Taking you to your dashboard in <b id="pg-redirect-count">5</b> s... <a class="pg-link" href="${DASH}">Go now</a></p>`;
            let left = 5;
            const tick = setInterval(() => {
                left--; const c = document.getElementById('pg-redirect-count'); if (c) c.textContent = String(Math.max(left, 0));
                if (left <= 0) { clearInterval(tick); window.location.href = DASH; }
            }, 1000);
        } catch (err) {
            console.error('Submit failed:', err);
            // Turn raw Firestore/network codes into something understandable; the technical error stays in the console.
            let msg = err && err.message ? err.message : 'Submission failed.';
            if (err && err.code === 'permission-denied') msg = 'Your game WAS delivered for review (Google Drive + email), but the playable preview copy could not be saved: database permission denied - the latest firestore.rules are not published yet. Press Submit again after that; nothing will be duplicated.';
            else if (err && err.code === 'unavailable') msg = 'The database is temporarily unreachable. Press Submit again - nothing will be duplicated.';
            else if (err && err.code === 'unauthenticated') msg = 'Authentication required. Sign in again and press Submit.';
            if (!err || !err.shown) toast(msg); else toast('Submission not completed - see the details above.');
            if (pubState) pubState.submitting = false;   // allow a retry (same submission id, so nothing is duplicated)
            btn.disabled = false; btn.textContent = oldLabel;
        }
    }

    // How many games the signed-in user has already used against their plan's allowance.
    // Free = total games ever published/pending. Subscriber = games created this calendar month.
    async function usageInfo() {
        const limits = planLimits();
        const user = getUser();
        if (!user) return { limits, used: 0, allowed: true };
        try {
            const { db, fs } = await fb();
            const snap = await fs.getDocs(fs.query(fs.collection(db, 'community_games'), fs.where('ownerUid', '==', user.uid)));
            let used = snap.docs.length;
            if (limits.period === 'month') {
                const start = monthStart();
                used = snap.docs.filter(d => { const c = d.data().createdAt; return c && c.toDate && c.toDate() >= start; }).length;
            }
            return { limits, used, allowed: used < limits.maxGames };
        } catch (err) {
            console.warn('Usage check unavailable:', err);
            return { limits, used: 0, allowed: true };
        }
    }

    async function renderPlanBanner(root) {
        const box = $('#pg-plan-banner', root); if (!box) return;
        const user = getUser();
        if (!user) { box.innerHTML = '<p class="pg-note">Sign in to see your plan, usage and upload limit.</p>'; return; }
        const { limits, used } = await usageInfo();
        const periodLabel = limits.period === 'month' ? ' this month' : ' total';
        box.innerHTML = `<p class="pg-note"><b>${esc(limits.label)} plan</b> · ${used} / ${limits.maxGames} games${periodLabel} · up to ${fmtBytes(limits.maxBytes)} per game · <a class="pg-link" href="subscription.html" style="font-size:0.82rem;">${limits.label === 'Free' ? 'Upgrade' : 'Manage plan'}</a></p>` +
            `<p class="pg-note" id="pg-quota-line" style="margin-top:4px;">Limits: ${LIMITS_INFO.userMonthly} game per account per month · PixelGaunt accepts ${LIMITS_INFO.siteDaily} games per day.</p>`;
        // Live count of today's website-wide submissions (read-only, from the review service).
        try {
            const headers = {}; try { headers.Authorization = 'Bearer ' + await user.getIdToken(); } catch (e) { /* anonymous */ }
            const q = await (await fetch(CONFIG.reviewEndpoint.replace(/\/+$/, '') + '/quota', { headers })).json();
            const line = $('#pg-quota-line', root);
            if (line && typeof q.siteDailyUsed === 'number') {
                const left = Math.max(q.siteDailyMax - q.siteDailyUsed, 0);
                line.innerHTML = `Limits: ${q.userMonthlyMax} game per account per month` + (q.userMonthlyUsed ? ` <b>(used - next from ${esc(q.nextMonth || 'next month')})</b>` : '') +
                    ` · Today: <b>${left} of ${q.siteDailyMax}</b> website submission slot${q.siteDailyMax === 1 ? '' : 's'} left` + (left ? '' : ' - please try again tomorrow');
            }
        } catch (e) { /* review service unreachable: keep the static line */ }
    }

    function mountPublish(root) {
        root.classList.add('pg-panel-active');
        const limits = planLimits();
        CONFIG.maxUploadBytes = limits.maxBytes;
        root.innerHTML = `
            <div class="pg-plan-banner" id="pg-plan-banner" style="margin-bottom:14px;"></div>
            <div class="pg-drop" id="pg-drop" tabindex="0" role="button" aria-label="Choose game files or a zip">
                <i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>
                <b>Drop your game here</b>
                <span>A .zip, a folder, or a single .html file · up to ${fmtBytes(CONFIG.maxUploadBytes)}</span>
                <input type="file" id="pg-file-input" accept=".zip,.html,.htm" multiple webkitdirectory style="display:none;">
                <input type="file" id="pg-file-input-single" accept=".zip,.html,.htm" style="display:none;">
            </div>
            <p class="pg-note">Every submitted game is tested by a person before it is published. Everything runs in an isolated sandbox and cannot read PixelGaunt logins, storage, or other games. Assets must be embedded as <code>data:</code> URLs for this first version — external files referenced by path will show as missing.</p>
            <div class="pg-progress"><i></i></div>
            <div class="pg-checklist"></div>
            <div class="pg-verdict-box"></div>
            <div class="pg-panel pg-cut pg-hidden" id="pg-meta-panel" style="margin-top:16px; padding: 18px;">
                <h3>Game details</h3>
                <div class="pg-grid2" style="margin-top:10px;">
                    <div class="pg-field"><label for="pg-title">Title</label><input id="pg-title" maxlength="60" placeholder="My Game"></div>
                    <div class="pg-field"><label for="pg-genre">Genre</label><select id="pg-genre"><option>Arcade</option><option>Puzzle</option><option>Action</option><option>Adventure</option><option>Racing</option><option>Card</option></select></div>
                    <div class="pg-field"><label for="pg-orientation">Orientation</label><select id="pg-orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></div>
                    <div class="pg-field"><label for="pg-controls">Controls</label><input id="pg-controls" maxlength="80" placeholder="Arrow keys, Space to jump"></div>
                </div>
                <div class="pg-field" style="margin-top:12px;"><label for="pg-desc">Short description</label><textarea id="pg-desc" maxlength="240" placeholder="What is your game about?"></textarea></div>
                <label class="pg-check-inline" style="margin-top:12px;"><input type="checkbox" id="pg-tournament-check"><span>This game reports scores to a server I control, so it can host a tournament. <a href="#" class="pg-link" id="pg-tournament-help" style="font-size:0.82rem;">How does that work?</a></span></label>
                <div class="pg-field pg-hidden" id="pg-server-field" style="margin-top:8px;"><label for="pg-server">Score-reporting host (domain only)</label><input id="pg-server" placeholder="scores.mygame.com"></div>
                <label class="pg-check-inline" style="margin-top:12px;"><input type="checkbox" id="pg-terms-check"><span>This is my own work (or I have the rights to publish it), and it follows the <a href="#" onclick="event.preventDefault(); openPageModal && openPageModal('Terms of Service','pg-terms')" class="pg-link" style="font-size:0.82rem;">PixelGaunt content rules</a>.</span></label>
                <button type="button" class="pg-btn primary pg-publish-btn" style="margin-top:16px;" disabled>Submit for review</button>
            </div>
            <div id="pg-my-games"></div>
        `;
        const drop = $('#pg-drop', root);
        const openPicker = () => $('#pg-file-input-single', root).click();
        drop.addEventListener('click', openPicker);
        drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
        ['dragover', 'dragenter'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', async e => { const fl = await filesFromDrop(e.dataTransfer); if (fl.length) handleUpload(root, fl); });
        $('#pg-file-input-single', root).addEventListener('change', e => { if (e.target.files.length) handleUpload(root, [...e.target.files]); e.target.value = ''; });
        $('#pg-tournament-check', root).addEventListener('change', e => $('#pg-server-field', root).classList.toggle('pg-hidden', !e.target.checked));
        $('#pg-tournament-help', root).addEventListener('click', e => { e.preventDefault(); toast('Your game posts match results to your own server; PixelGaunt links to it from the tournament page. See the Tournaments section below for the full flow.'); });
        const syncPublishEnabled = () => {
            const btn = $('.pg-publish-btn', root);
            if (!pubState || pubState.verdict === 'bad') { btn.disabled = true; return; }
            btn.disabled = !($('#pg-title', root).value.trim() && $('#pg-terms-check', root).checked);
        };
        root.addEventListener('input', syncPublishEnabled);
        root.addEventListener('change', syncPublishEnabled);
        $('.pg-publish-btn', root).addEventListener('click', async () => {
            const server = $('#pg-tournament-check', root).checked ? $('#pg-server', root).value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : '';
            await submitGame(root, {
                title: $('#pg-title', root).value.trim().slice(0, 60) || 'Untitled', genre: $('#pg-genre', root).value,
                description: $('#pg-desc', root).value.trim(), controls: $('#pg-controls', root).value.trim(),
                orientation: $('#pg-orientation', root).value, thumbDataUrl: pubState.thumbDataUrl, tournamentServer: server
            });
        });
        loadMyGames(root);
        renderPlanBanner(root);
        onAuth(() => { const limits = planLimits(); CONFIG.maxUploadBytes = limits.maxBytes; renderPlanBanner(root); });
        window.addEventListener('pg-plan', () => { const limits = planLimits(); CONFIG.maxUploadBytes = limits.maxBytes; renderPlanBanner(root); });
    }

    async function handleUpload(root, fileList) {
        const drop = $('#pg-drop', root); const oldHtml = drop.innerHTML;
        if (getUser()) {
            const { allowed, limits, used } = await usageInfo();
            if (!allowed) {
                toast(`You've used ${used} of ${limits.maxGames} games on the ${limits.label} plan. Upgrade to submit more.`);
                return;
            }
        }
        drop.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><b>Reading your files...</b>';
        $('#pg-meta-panel', root).classList.add('pg-hidden');
        try {
            const { files, problems } = await collectFiles(fileList);
            drop.innerHTML = `<i class="fas fa-gamepad" aria-hidden="true"></i><b>${esc(files.size)} file(s) loaded</b><span>Click to choose a different upload</span>`;
            const res = await runCheck(root, files, problems);
            if (pubState && fileList.length === 1 && /\.zip$/i.test(fileList[0].name)) pubState.sourceZip = fileList[0];
            if (res.entry) {
                // Auto-generate a small thumbnail candidate from the game's own <canvas> after the smoke test's
                // paint settles, but never block on it - a missing thumb just falls back to the initial letter.
                pubState.thumbDataUrl = '';
                $('#pg-meta-panel', root).classList.remove('pg-hidden');
                loadMyGames(root);
            }
        } catch (err) {
            console.error(err);
            drop.innerHTML = oldHtml;
            toast(err.message || 'Could not read that upload.');
        }
    }

    async function loadMyGames(root) {
        const box = $('#pg-my-games', root); if (!box) return;
        const user = getUser();
        if (!user) { box.innerHTML = ''; return; }
        try {
            const { db, fs } = await fb();
            const snap = await fs.getDocs(fs.query(fs.collection(db, 'community_games'), fs.where('ownerUid', '==', user.uid)));
            const items = snap.docs.map(d => d.data());
            // Submissions that did not finish delivery have no playable copy, so show them from the review record itself.
            try {
                const have = new Set(snap.docs.map(d => d.id));
                const subs = await fs.getDocs(fs.query(fs.collection(db, 'submissions'), fs.where('user_id', '==', user.uid)));
                subs.docs.forEach(d => { const r = d.data(); if (!have.has(d.id) && r.status !== 'pending_review') items.push({ title: r.game_name, status: r.status, rejectionReason: r.rejection_reason }); });
            } catch (e) { /* older rules without the submissions read rule: list the games only */ }
            if (!items.length) { box.innerHTML = ''; return; }
            const rows = items.map(g => { const si = statusInfo(g.status); return `<li><span>${esc(g.title)}${g.status === 'rejected' && g.rejectionReason ? '<small style="display:block;color:#fca5a5;">Reason: ' + esc(g.rejectionReason) + '</small>' : ''}</span><span class="pg-pill ${si.cls}">${esc(si.label)}</span></li>`; }).join('');
            box.innerHTML = `<div class="pg-shelf-head" style="margin:26px 0 8px;"><div><h2 class="pixel-font" style="font-size:1.1rem;">Your submitted games</h2></div></div><ul class="pg-mine">${rows}</ul>`;
        } catch (err) { console.warn('My games unavailable:', err); }
    }

    function resetPublish() { pubState = null; const root = $('#launch-root'); if (root) mountPublish(root); }

    /* ======================================================================================
       TOURNAMENTS MODULE  -  single-elimination brackets
       Data lives in the existing Firestore `tournaments` collection. New-style documents carry
       format: 'single-elim' plus a flat `bracket` array of matches (Firestore has no nested arrays);
       older leaderboard-style documents (no `format`) still open in the legacy view below.
       Only the tournament's owner can start it, edit participants or enter results - the UI hides
       those controls for everyone else AND firestore.rules refuses the writes.
       ====================================================================================== */
    let tourneyTab = 'browse';
    let cur = null;            // the tournament currently open: { id, t, sel }
    let authHooked = false;

    /* ---- bracket engine: pure functions, no DOM and no Firebase ---- */
    const Bracket = (() => {
        const nextPow2 = n => { let s = 2; while (s < n) s *= 2; return s; };
        // Standard seeding so the top seeds meet last and BYEs always go to the top seeds: 8 -> 1,8,4,5,2,7,3,6
        function seedOrder(size) { let o = [1]; while (o.length < size) { const L = o.length * 2; o = o.flatMap(s => [s, L + 1 - s]); } return o; }
        const at = (ms, r, i) => ms.find(m => m.round === r && m.index === i) || null;
        const rounds = ms => ms.reduce((a, m) => Math.max(a, m.round), 0);
        const nextOf = (ms, m) => (m.round >= rounds(ms) ? null : at(ms, m.round + 1, m.index >> 1));
        const slotOf = m => (m.index % 2 === 0 ? 'p1' : 'p2');
        // A player advances into the next round's match: top feeder -> p1, bottom feeder -> p2.
        function feed(ms, m) { const nx = nextOf(ms, m); if (nx) nx[slotOf(m)] = m.winner; }

        // players: [{ id, name }] in seed order. Missing seeds (players < bracket size) become BYEs.
        function build(players) {
            const n = players.length, size = nextPow2(n), total = Math.log2(size), ms = [];
            for (let r = 1; r <= total; r++) for (let i = 0; i < size / Math.pow(2, r); i++) ms.push({ id: 'r' + r + 'm' + (i + 1), round: r, index: i, p1: null, p2: null, s1: null, s2: null, winner: null, bye: false });
            const order = seedOrder(size);
            for (let i = 0; i < size / 2; i++) {
                const m = at(ms, 1, i), a = order[i * 2], b = order[i * 2 + 1];
                m.p1 = a <= n ? players[a - 1].id : null; m.p2 = b <= n ? players[b - 1].id : null;
                if (!m.p1 || !m.p2) { m.bye = true; m.winner = m.p1 || m.p2; feed(ms, m); }
            }
            return ms;
        }
        // winnerSlot: 'p1' | 'p2'. Scores are optional (walkover). Returns an error string or null.
        function setResult(ms, id, winnerSlot, s1, s2) {
            const m = ms.find(x => x.id === id);
            if (!m || m.bye) return 'This match cannot be scored.';
            if (!m.p1 || !m.p2) return 'Both players must be known before a result can be entered.';
            if (winnerSlot !== 'p1' && winnerSlot !== 'p2') return 'Pick a winner.';
            const w = m[winnerSlot], nx = nextOf(ms, m);
            if (m.winner && m.winner !== w && nx && nx.winner) return 'The next match already has a result. Reset it first, then change this one.';
            m.s1 = s1; m.s2 = s2; m.winner = w; feed(ms, m);
            return null;
        }
        // Clears a result and, if later matches were decided from it, clears those too.
        function clearMatch(ms, m) {
            const nx = nextOf(ms, m);
            if (m.winner && nx) { if (nx.winner) clearMatch(ms, nx); nx[slotOf(m)] = null; }
            m.winner = null; m.s1 = null; m.s2 = null;
        }
        function resetMatch(ms, id) {
            const m = ms.find(x => x.id === id);
            if (!m || m.bye || !m.winner) return 'Nothing to reset.';
            clearMatch(ms, m); return null;
        }
        function downstreamCount(ms, m) { let c = 0, x = nextOf(ms, m); while (x && x.winner) { c++; x = nextOf(ms, x); } return c; }
        function roundName(r, total) { const left = Math.pow(2, total - r); return left === 1 ? 'Final' : left === 2 ? 'Semifinals' : left === 4 ? 'Quarterfinals' : 'Round ' + r; }
        function status(m) { return m.bye ? 'bye' : m.winner ? 'done' : (m.p1 && m.p2) ? 'ready' : 'waiting'; }
        function champion(ms) { const f = at(ms, rounds(ms), 0); return f && f.winner ? f : null; }
        return { nextPow2, seedOrder, build, setResult, resetMatch, downstreamCount, roundName, status, champion, at, rounds, nextOf };
    })();

    /* ---- small helpers ---- */
    const pid = p => p.id || p.uid;
    const guestId = () => 'g' + Math.random().toString(36).slice(2, 9);
    const fmtWhen = ts => (ts && ts.toMillis ? new Date(ts.toMillis()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'To be announced');
    const isOwner = () => { const u = getUser(); return !!(u && cur && u.uid === cur.t.ownerUid); };
    function tStatus(t, now) {
        if (!t.format) { const k = tournamentStatusOf(t, now); return { key: k, label: k === 'done' ? 'Finished' : k === 'live' ? 'Live' : 'Upcoming' }; }
        if (t.status === 'complete') return { key: 'done', label: 'Completed' };
        if (t.status === 'live') return { key: 'live', label: 'In progress' };
        return t.registration === 'closed' ? { key: 'warn', label: 'Registration closed' } : { key: 'upcoming', label: 'Registration open' };
    }
    function tournamentStatusOf(t, now) {
        const s = t.startAt && t.startAt.toMillis ? t.startAt.toMillis() : null, e = t.endAt && t.endAt.toMillis ? t.endAt.toMillis() : null;
        if (e && now > e) return 'done'; if (s && now < s) return 'upcoming'; return 'live';
    }
    async function allGamesForPicker() {
        const list = Core.games.map(g => ({ id: String(g.id), title: g.title }));
        try { if (Core.loadCommunityGames) await Core.loadCommunityGames(); } catch (e) { /* community games are optional here */ }
        (window.communityGames || []).forEach(g => list.push({ id: String(g.id), title: g.title }));
        return list;
    }
    // One place for every write: runs inside a transaction against the freshest copy of the document.
    async function mutateTournament(id, fn) {
        const { db, fs } = await fb();
        const ref = fs.doc(db, 'tournaments', id);
        let merged;
        await fs.runTransaction(db, async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new Error('This tournament no longer exists.');
            const data = snap.data();
            const patch = fn(data);
            tx.update(ref, patch);
            merged = { ...data, ...patch };
        });
        return merged;
    }
    const ownerOnly = data => { const u = getUser(); if (!u || u.uid !== data.ownerUid) throw new Error('Only the tournament organizer can do that.'); };

    /* ---- mount: Browse / Create tabs ---- */
    async function mountTournaments(root) {
        root.innerHTML = `
            <div class="pg-tabs" role="tablist">
                <button class="pg-tab" data-tab="browse" role="tab" aria-selected="true">Tournaments</button>
                <button class="pg-tab" data-tab="create" role="tab" aria-selected="false">Create</button>
            </div>
            <div id="pg-tourney-body"></div>
        `;
        root.querySelectorAll('.pg-tab').forEach(btn => btn.addEventListener('click', () => { cur = null; tourneyTab = btn.dataset.tab; renderTourneyTabs(root); renderTourneyBody(root); }));
        if (!authHooked) { authHooked = true; onAuth(() => { if (cur) renderTournament(root); }); }
        const wanted = new URLSearchParams(location.search).get('t');
        if (wanted) openTournament(root, wanted); else renderTourneyBody(root);
    }
    function renderTourneyTabs(root) { root.querySelectorAll('.pg-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tourneyTab ? 'true' : 'false')); }

    async function renderTourneyBody(root) {
        const body = $('#pg-tourney-body', root);
        if (tourneyTab === 'create') { renderCreateForm(root, body); return; }
        body.innerHTML = '<p class="pg-muted">Loading tournaments...</p>';
        try {
            const { db, fs } = await fb();
            const snap = await fs.getDocs(fs.query(fs.collection(db, 'tournaments'), fs.orderBy('createdAt', 'desc'), fs.limit(30)));
            const now = Date.now();
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!list.length) { body.innerHTML = '<div class="pg-empty">No tournaments yet. Create the first one from the Create tab.</div>'; return; }
            body.innerHTML = `<div class="pg-tlist">${list.map(t => tournamentCard(t, now)).join('')}</div>`;
            body.querySelectorAll('[data-tid]').forEach(card => {
                const open = () => openTournament(root, card.dataset.tid);
                card.addEventListener('click', e => { if (e.target.closest('button')) return; open(); });
                card.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('button')) open(); });
            });
            body.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); joinTournament(btn.dataset.join).then(ok => { if (ok) renderTourneyBody(root); }); }));
        } catch (err) { console.error(err); body.innerHTML = '<div class="pg-empty">Tournaments are unavailable right now.</div>'; }
    }

    function tournamentCard(t, now) {
        const st = tStatus(t, now), players = (t.players || []).length;
        const closed = t.format ? (t.status !== 'registration' || t.registration === 'closed') : st.key === 'done';
        const full = players >= t.limit;
        return `<div class="pg-tcard" data-tid="${esc(t.id)}" tabindex="0" role="button">
            <div class="pg-row"><span class="pg-pill ${st.key}">${esc(st.label)}</span>${t.format ? '<span class="pg-pill">Single elimination</span>' : ''}</div>
            <h4>${esc(t.name)}</h4>
            <dl><dt>Game</dt><dd>${esc(t.gameTitle || 'Unknown')}</dd><dt>Players</dt><dd>${players} / ${esc(t.limit)}</dd>${t.startAt ? '<dt>Starts</dt><dd>' + esc(fmtWhen(t.startAt)) + '</dd>' : ''}</dl>
            <div class="pg-row"><button type="button" class="pg-btn sm primary" data-join="${esc(t.id)}" ${closed || full ? 'disabled' : ''}>${full ? 'Full' : closed ? 'Closed' : 'Join'}</button><span class="pg-muted" style="font-size:0.82rem;">${t.format ? 'View bracket' : 'View leaderboard'} →</span></div>
        </div>`;
    }

    /* ---- create ---- */
    async function renderCreateForm(root, body) {
        body.innerHTML = `
            <div class="pg-panel pg-cut" style="max-width:720px;">
                <h3>Create a tournament</h3>
                <p class="pg-muted" style="margin-top:6px;">A single-elimination bracket. Players register, you start it, then enter each result - winners move to the next round automatically.</p>
                <div class="pg-grid2" style="margin-top:14px;">
                    <div class="pg-field"><label for="pgt-name">Tournament name</label><input id="pgt-name" maxlength="60" placeholder="Weekend Cup"></div>
                    <div class="pg-field"><label for="pgt-game">Game</label><select id="pgt-game"><option value="">Loading games...</option></select></div>
                    <div class="pg-field"><label for="pgt-limit">Maximum players</label><select id="pgt-limit"><option>4</option><option selected>8</option><option>16</option><option>32</option></select></div>
                    <div class="pg-field"><label for="pgt-start">Start date</label><input id="pgt-start" type="datetime-local"></div>
                    <div class="pg-field"><label for="pgt-reg">Registration</label><select id="pgt-reg"><option value="open" selected>Open</option><option value="closed">Closed</option></select></div>
                    <div class="pg-field" style="grid-column:1/-1;"><label for="pgt-desc">Description</label><textarea id="pgt-desc" maxlength="300" placeholder="Rules, format, prizes..."></textarea></div>
                </div>
                <div id="pgt-create-msg" class="pg-note"></div>
                <button type="button" class="pg-btn primary" id="pgt-create-btn" style="margin-top:14px;">Create tournament</button>
            </div>`;
        const sel = $('#pgt-game', body), msg = $('#pgt-create-msg', body);
        const games = await allGamesForPicker();
        sel.innerHTML = '<option value="">Select game</option>' + games.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('');
        $('#pgt-create-btn', body).addEventListener('click', async () => {
            if (needLogin('Sign in to create a tournament.')) return;
            const name = $('#pgt-name', body).value.trim();
            if (!name) { msg.textContent = 'Give your tournament a name.'; return; }
            if (!sel.value) { msg.textContent = 'Choose the game this tournament is played on.'; return; }
            const start = $('#pgt-start', body).value;
            try {
                const { db, fs } = await fb();
                const user = getUser();
                const ref = await fs.addDoc(fs.collection(db, 'tournaments'), {
                    name, format: 'single-elim', gameId: sel.value, gameTitle: sel.selectedOptions[0].textContent,
                    description: $('#pgt-desc', body).value.trim().slice(0, 300),
                    limit: parseInt($('#pgt-limit', body).value, 10) || 8,
                    registration: $('#pgt-reg', body).value, status: 'registration',
                    startAt: start ? fs.Timestamp.fromDate(new Date(start)) : null, endAt: null,
                    ownerUid: user.uid, ownerName: cleanName(user), players: [], bracket: [], createdAt: fs.serverTimestamp()
                });
                toast('Tournament created.');
                tourneyTab = 'browse'; renderTourneyTabs(root); openTournament(root, ref.id);
            } catch (err) { console.error(err); msg.textContent = 'Could not create the tournament: ' + err.message; }
        });
    }

    /* ---- join (used by the list and the detail page) ---- */
    async function joinTournament(id) {
        if (needLogin('Sign in to join a tournament.')) return false;
        const user = getUser();
        try {
            const merged = await mutateTournament(id, data => {
                const players = data.players || [];
                if (players.some(p => p.uid === user.uid)) throw new Error('You are already registered.');
                if (data.format && (data.status !== 'registration' || data.registration === 'closed')) throw new Error('Registration is closed for this tournament.');
                if (players.length >= data.limit) throw new Error('This tournament is full.');
                const entry = { id: user.uid, uid: user.uid, name: cleanName(user) };
                if (!data.format) entry.score = 0;
                return { players: [...players, entry] };
            });
            if (cur && cur.id === id) cur.t = merged;
            toast('You are in!');
            return true;
        } catch (err) { toast(err.message || 'Could not join.'); return false; }
    }

    /* ---- detail page ---- */
    async function openTournament(root, id) {
        const body = $('#pg-tourney-body', root);
        body.innerHTML = '<p class="pg-muted">Loading...</p>';
        try {
            const { db, fs } = await fb();
            const snap = await fs.getDoc(fs.doc(db, 'tournaments', id));
            if (!snap.exists()) { cur = null; body.innerHTML = '<div class="pg-empty">Tournament not found.</div>'; return; }
            const t = snap.data();
            if (!t.format) { cur = null; renderLegacyTournament(root, id, t); return; }
            cur = { id, t, sel: null };
            renderTournament(root);
        } catch (err) { console.error(err); body.innerHTML = '<div class="pg-empty">Could not load this tournament.</div>'; }
    }

    // Runs an owner/player action, then re-renders from the saved result.
    async function act(root, fn, okMsg) {
        try { cur.t = await fn(); if (okMsg) toast(okMsg); }
        catch (err) { console.error(err); toast(err.message || 'That did not work.'); }
        renderTournament(root);
    }

    function renderTournament(root) {
        if (!cur) return;
        const body = $('#pg-tourney-body', root); if (!body) return;
        const { id, t } = cur, owner = isOwner(), user = getUser(), now = Date.now();
        const st = tStatus(t, now), players = t.players || [], ms = t.bracket || [];
        const registering = t.status === 'registration';
        const mine = user && players.some(p => p.uid === user.uid);
        const full = players.length >= t.limit;
        const champ = Bracket.champion(ms);
        const nameOf = pidv => { const p = players.find(x => pid(x) === pidv); return p ? p.name : null; };
        const scrollLeft = ($('.br-scroll', body) || {}).scrollLeft || 0;

        // Before the tournament starts, show what the bracket WILL look like from the players registered so far.
        const previewing = registering;
        const shown = previewing ? (players.length >= 2 ? Bracket.build(players.map(p => ({ id: pid(p), name: p.name }))) : []) : ms;

        const playerRows = players.map((p, i) => `<li><span class="br-seed">${i + 1}</span><span class="br-pname">${esc(p.name)}${p.uid && user && p.uid === user.uid ? ' <em>(you)</em>' : ''}</span>${owner && registering ? `<button type="button" class="pg-btn sm danger" data-act="remove" data-pid="${esc(pid(p))}" aria-label="Remove ${esc(p.name)}">Remove</button>` : ''}</li>`).join('') || '<li class="pg-muted">No players registered yet.</li>';

        body.innerHTML = `
            <button type="button" class="pg-link" data-act="back" style="margin-bottom:14px;">← Back to tournaments</button>
            <div class="pg-panel pg-cut br-head">
                <div class="pg-row"><span class="pg-pill ${st.key}">${esc(st.label)}</span><span class="pg-pill">Single elimination</span></div>
                <h3 class="br-title">${esc(t.name)}</h3>
                <dl class="br-facts">
                    <div><dt>Game</dt><dd>${esc(t.gameTitle || 'Unknown')}</dd></div>
                    <div><dt>Status</dt><dd>${esc(st.label)}</dd></div>
                    <div><dt>Players</dt><dd>${players.length} / ${esc(t.limit)}</dd></div>
                    <div><dt>Start date</dt><dd>${esc(fmtWhen(t.startAt))}</dd></div>
                    <div><dt>Organizer</dt><dd>${esc(t.ownerName || 'Unknown')}</dd></div>
                </dl>
                ${t.description ? `<p class="br-desc">${esc(t.description)}</p>` : ''}
            </div>

            ${champ ? `<div class="br-champion" role="status"><i class="fas fa-trophy" aria-hidden="true"></i><small>Tournament champion</small><strong>${esc(nameOf(champ.winner) || 'Unknown')}</strong><span>${esc(t.gameTitle || '')} &middot; ${esc(t.name)}${champ.s1 != null && champ.s2 != null ? ' &middot; Final score ' + esc(champ.s1) + ' - ' + esc(champ.s2) : ''}</span></div>` : ''}

            <div class="pg-tdetail br-panels">
                <div class="pg-panel pg-cut">
                    <h3>Players</h3>
                    <p class="br-count"><b>${players.length} / ${esc(t.limit)}</b> registered</p>
                    <ol class="br-players">${playerRows}</ol>
                    <div class="pg-row" style="margin-top:14px;">
                        <button type="button" class="pg-btn primary" data-act="join" ${!registering || t.registration === 'closed' || full || mine ? 'disabled' : ''}>${mine ? 'You are registered' : full ? 'Tournament full' : !registering || t.registration === 'closed' ? 'Registration closed' : 'Join tournament'}</button>
                        <button type="button" class="pg-btn sm" data-act="refresh">Refresh</button>
                    </div>
                </div>
                ${owner ? `<div class="pg-panel pg-cut">
                    <h3>Organizer controls</h3>
                    ${registering ? `
                        <div class="pg-field" style="margin-top:10px;"><label for="br-add-name">Add a participant</label><div class="pg-row"><input id="br-add-name" maxlength="40" placeholder="Player name" style="flex:1;min-width:0;"><button type="button" class="pg-btn sm" data-act="add">Add</button></div></div>
                        <div class="pg-row" style="margin-top:12px;">
                            <button type="button" class="pg-btn sm" data-act="toggle-reg">${t.registration === 'closed' ? 'Open registration' : 'Close registration'}</button>
                            <button type="button" class="pg-btn sm" data-act="shuffle" ${players.length < 2 ? 'disabled' : ''}>Shuffle seeds</button>
                        </div>
                        <button type="button" class="pg-btn primary" data-act="start" style="margin-top:14px;" ${players.length < 2 ? 'disabled' : ''}>Start tournament</button>
                        <p class="pg-note">Seeds follow the order in the list. Any empty spots up to the next power of two become BYEs - those players advance automatically.</p>
                    ` : `<p class="pg-note" style="margin-top:8px;">Click a match in the bracket to enter its result. Winners move on automatically.</p>`}
                    <button type="button" class="pg-btn sm danger" data-act="delete" style="margin-top:14px;">Delete tournament</button>
                </div>` : ''}
            </div>

            <div class="pg-panel pg-cut br-wrap">
                <div class="pg-row" style="justify-content:space-between;"><h3>Bracket</h3>${previewing ? '<span class="pg-pill warn">Preview</span>' : ''}</div>
                ${previewing ? '<p class="pg-note" style="margin-top:6px;">This preview is built from the players registered so far. The real bracket is locked in when the organizer starts the tournament.</p>' : ''}
                ${shown.length ? `<p class="br-hint">Swipe sideways to follow the bracket &rarr;</p><div class="br-scroll">${bracketHTML(shown, nameOf, cur.sel, !!champ, t)}</div>` : '<div class="pg-empty">The bracket appears once at least 2 players have registered.</div>'}
            </div>

            <div class="pg-panel pg-cut br-wrap" id="br-detail">${matchDetailHTML(shown, nameOf, owner && !registering, t)}</div>`;

        const sc = $('.br-scroll', body); if (sc) sc.scrollLeft = scrollLeft;
        bindTournament(root, body, shown);
    }

    function bracketHTML(ms, nameOf, selId, hasChamp, t) {
        const total = Bracket.rounds(ms), seq = {};
        ms.slice().sort((a, b) => a.round - b.round || a.index - b.index).forEach((m, i) => { seq[m.id] = i + 1; });
        const cols = [];
        for (let r = 1; r <= total; r++) {
            const slots = ms.filter(m => m.round === r).sort((a, b) => a.index - b.index).map(m => {
                const stt = Bracket.status(m);
                const row = (slot, sk) => {
                    const pidv = m[slot], nm = pidv ? nameOf(pidv) : null, won = m.winner && m.winner === pidv;
                    const label = nm || (stt === 'bye' ? 'BYE' : 'TBD');
                    const score = m[sk] != null ? m[sk] : (won && stt === 'done' ? '\u2713' : '');
                    return `<div class="br-p${won ? ' win' : ''}${m.winner && !won ? ' lose' : ''}${!nm ? ' empty' : ''}"><span class="br-n">${esc(label)}</span><span class="br-s">${esc(score)}</span></div>`;
                };
                const pos = r < total ? (m.index % 2 === 0 ? ' br-top' : ' br-bot') : ' br-final';
                return `<div class="br-slot${r > 1 ? ' br-in' : ''}${pos}"><div class="br-match st-${stt}${selId === m.id ? ' sel' : ''}" data-match="${esc(m.id)}" tabindex="0" role="button" aria-label="Match ${seq[m.id]}, ${Bracket.roundName(r, total)}"><div class="br-mh"><span>M${seq[m.id]}</span><span>${stt === 'bye' ? 'Bye' : stt === 'done' ? 'Completed' : stt === 'ready' ? 'Ready' : 'Waiting'}</span></div>${row('p1', 's1')}${row('p2', 's2')}</div></div>`;
            }).join('');
            cols.push(`<div class="br-round"><div class="br-rtitle">${esc(Bracket.roundName(r, total))}</div><div class="br-col">${slots}</div></div>`);
        }
        const f = Bracket.champion(ms);
        cols.push(`<div class="br-round br-champ-col"><div class="br-rtitle">Champion</div><div class="br-col"><div class="br-slot br-in"><div class="br-cbox${f ? ' has' : ''}"><i class="fas fa-trophy" aria-hidden="true"></i><span>${f ? esc(nameOf(f.winner) || '') : 'TBD'}</span></div></div></div></div>`);
        return `<div class="br-cols">${cols.join('')}</div>`;
    }

    function matchDetailHTML(ms, nameOf, canEdit, t) {
        const m = cur && cur.sel ? ms.find(x => x.id === cur.sel) : null;
        if (!m) return '<h3>Match details</h3><p class="pg-muted" style="margin-top:8px;">Select a match in the bracket to see its players, score and status.</p>';
        const total = Bracket.rounds(ms), stt = Bracket.status(m);
        const n1 = m.p1 ? nameOf(m.p1) : null, n2 = m.p2 ? nameOf(m.p2) : null;
        const label = { bye: 'Bye', done: 'Completed', ready: 'Ready to play', waiting: 'Waiting for earlier matches' }[stt];
        let controls = '';
        if (canEdit && stt !== 'bye' && stt !== 'waiting') {
            controls = `<div class="br-form">
                <div class="pg-grid2">
                    <div class="pg-field"><label for="br-s1">${esc(n1)} score</label><input id="br-s1" type="number" min="0" max="9999" inputmode="numeric" value="${m.s1 != null ? esc(m.s1) : ''}"></div>
                    <div class="pg-field"><label for="br-s2">${esc(n2)} score</label><input id="br-s2" type="number" min="0" max="9999" inputmode="numeric" value="${m.s2 != null ? esc(m.s2) : ''}"></div>
                </div>
                <div class="pg-row" style="margin-top:12px;">
                    <button type="button" class="pg-btn primary" data-act="save-result" data-match="${esc(m.id)}">Save result &amp; advance winner</button>
                    ${m.winner ? `<button type="button" class="pg-btn danger" data-act="reset-match" data-match="${esc(m.id)}">Reset match</button>` : ''}
                </div>
                <div class="pg-row" style="margin-top:10px;">
                    <button type="button" class="pg-btn sm" data-act="walkover" data-slot="p1" data-match="${esc(m.id)}">${esc(n1)} advances (no score)</button>
                    <button type="button" class="pg-btn sm" data-act="walkover" data-slot="p2" data-match="${esc(m.id)}">${esc(n2)} advances (no score)</button>
                </div>
                <p class="pg-note">The higher score wins. Ties are not allowed in a knockout - use the walkover buttons if a match is decided without a score.</p></div>`;
        }
        const line = (nm, sc, won) => `<li class="${won ? 'win' : ''}"><span>${esc(nm || (stt === 'bye' ? 'BYE' : 'TBD'))}${won ? ' <i class="fas fa-crown" aria-hidden="true" title="Winner"></i>' : ''}</span><b>${sc != null ? esc(sc) : '-'}</b></li>`;
        return `<h3>Match details</h3>
            <div class="pg-row" style="margin:8px 0;"><span class="pg-pill">${esc(Bracket.roundName(m.round, total))}</span><span class="pg-pill ${stt === 'done' ? 'ok' : stt === 'ready' ? 'upcoming' : ''}">${esc(label)}</span></div>
            <ul class="br-mlist">${line(n1, m.s1, m.winner && m.winner === m.p1)}${line(n2, m.s2, m.winner && m.winner === m.p2)}</ul>
            <p class="br-winner">${m.winner ? 'Winner: <b>' + esc(nameOf(m.winner) || '') + '</b>' : stt === 'bye' ? 'Advances automatically.' : 'No winner yet.'}</p>
            ${controls}`;
    }

    function bindTournament(root, body, shown) {
        const pickMatch = el => { cur.sel = el.dataset.match; renderTournament(root); const d = $('#br-detail', root); if (d && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
        body.querySelectorAll('[data-match]').forEach(el => {
            if (el.classList.contains('br-match')) {
                el.addEventListener('click', () => pickMatch(el));
                el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickMatch(el); } });
            }
        });
        body.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
            const a = btn.dataset.act, id = cur.id;
            if (a === 'back') { cur = null; if (history.replaceState && location.search.includes('t=')) history.replaceState(null, '', location.pathname); renderTourneyBody(root); return; }
            if (a === 'refresh') { openTournament(root, id); return; }
            if (a === 'join') { joinTournament(id).then(() => renderTournament(root)); return; }
            if (!isOwner()) { toast('Only the tournament organizer can do that.'); return; }
            if (a === 'remove') { act(root, () => mutateTournament(id, d => { ownerOnly(d); if (d.status !== 'registration') throw new Error('Players cannot be removed after the tournament starts.'); return { players: (d.players || []).filter(p => pid(p) !== btn.dataset.pid) }; })); return; }
            if (a === 'add') {
                const name = ($('#br-add-name', body).value || '').replace(/[<>]/g, '').trim().slice(0, 40);
                if (!name) { toast('Type a player name first.'); return; }
                act(root, () => mutateTournament(id, d => {
                    ownerOnly(d); const ps = d.players || [];
                    if (d.status !== 'registration') throw new Error('Participants cannot be added after the tournament starts.');
                    if (ps.length >= d.limit) throw new Error('This tournament is full.');
                    if (ps.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already registered.');
                    return { players: [...ps, { id: guestId(), name }] };
                })); return;
            }
            if (a === 'toggle-reg') { act(root, () => mutateTournament(id, d => { ownerOnly(d); return { registration: d.registration === 'closed' ? 'open' : 'closed' }; })); return; }
            if (a === 'shuffle') { act(root, () => mutateTournament(id, d => { ownerOnly(d); const ps = (d.players || []).slice(); for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; } return { players: ps }; }), 'Seeds shuffled.'); return; }
            if (a === 'start') {
                const n = (cur.t.players || []).length, size = Bracket.nextPow2(n);
                if (!confirm('Start with ' + n + ' players?' + (size > n ? ' ' + (size - n) + ' BYE(s) will be created and those players advance automatically.' : '') + ' Registration closes and the bracket is locked.')) return;
                cur.sel = null;
                act(root, () => mutateTournament(id, d => {
                    ownerOnly(d); const ps = d.players || [];
                    if (d.status !== 'registration') throw new Error('This tournament has already started.');
                    if (ps.length < 2) throw new Error('At least 2 players are needed to start.');
                    return { bracket: Bracket.build(ps.map(p => ({ id: pid(p), name: p.name }))), status: 'live', registration: 'closed' };
                }), 'Tournament started.'); return;
            }
            if (a === 'delete') { if (!confirm('Delete this tournament for everyone? This cannot be undone.')) return; fb().then(({ db, fs }) => fs.deleteDoc(fs.doc(db, 'tournaments', id))).then(() => { cur = null; renderTourneyBody(root); toast('Tournament deleted.'); }).catch(err => toast(err.message || 'Could not delete.')); return; }
            const matchId = btn.dataset.match;
            const write = (edit, okMsg) => act(root, () => mutateTournament(id, d => {
                ownerOnly(d);
                if (d.status === 'registration') throw new Error('Start the tournament before entering results.');
                const ms = JSON.parse(JSON.stringify(d.bracket || []));
                const err = edit(ms); if (err) throw new Error(err);
                return { bracket: ms, status: Bracket.champion(ms) ? 'complete' : 'live' };
            }), okMsg);
            if (a === 'save-result') {
                const r1 = $('#br-s1', body).value, r2 = $('#br-s2', body).value;
                if (r1 === '' || r2 === '') { toast('Enter both scores, or use a walkover button.'); return; }
                const s1 = Math.max(0, parseInt(r1, 10)), s2 = Math.max(0, parseInt(r2, 10));
                if (isNaN(s1) || isNaN(s2)) { toast('Scores must be numbers.'); return; }
                if (s1 === s2) { toast('A knockout match cannot end in a tie.'); return; }
                write(ms => Bracket.setResult(ms, matchId, s1 > s2 ? 'p1' : 'p2', s1, s2), 'Result saved - winner advanced.'); return;
            }
            if (a === 'walkover') { write(ms => Bracket.setResult(ms, matchId, btn.dataset.slot, null, null), 'Winner advanced.'); return; }
            if (a === 'reset-match') {
                const m = (cur.t.bracket || []).find(x => x.id === matchId);
                const more = m ? Bracket.downstreamCount(cur.t.bracket, m) : 0;
                if (!confirm('Reset this match?' + (more ? ' ' + more + ' later match result(s) that depend on it will also be cleared.' : ''))) return;
                write(ms => Bracket.resetMatch(ms, matchId), 'Match reset.');
            }
        }));
    }

    /* ---- older leaderboard-style tournaments (created before brackets existed) ---- */
    function renderLegacyTournament(root, id, t) {
        const body = $('#pg-tourney-body', root); const now = Date.now();
        const rows = (t.players || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0))
            .map((p, i) => `<tr class="${getUser() && p.uid === getUser().uid ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.score || 0)}</td></tr>`).join('') || '<tr><td colspan="3" class="pg-muted">No players yet.</td></tr>';
        const st = tStatus(t, now);
        body.innerHTML = `
            <button type="button" class="pg-link" id="pg-back-t" style="margin-bottom:14px;">← Back to tournaments</button>
            <div class="pg-tdetail">
                <div class="pg-panel pg-cut">
                    <div class="pg-row"><span class="pg-pill ${st.key}">${esc(st.label)}</span></div>
                    <h3 style="margin-top:8px;">${esc(t.name)}</h3>
                    <dl style="margin-top:10px; display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:0.88rem;">
                        <dt class="pg-muted">Game</dt><dd>${esc(t.gameTitle || 'Unknown')}</dd>
                        <dt class="pg-muted">Players</dt><dd>${(t.players || []).length} / ${esc(t.limit)}</dd>
                        ${t.prize ? '<dt class="pg-muted">Prize</dt><dd>' + esc(t.prize) + '</dd>' : ''}
                        ${t.startAt ? '<dt class="pg-muted">Start</dt><dd>' + esc(fmtWhen(t.startAt)) + '</dd>' : ''}
                    </dl>
                    <button type="button" class="pg-btn primary" id="pg-join-detail" style="margin-top:16px;" ${st.key === 'done' ? 'disabled' : ''}>Join tournament</button>
                </div>
                <div class="pg-panel pg-cut">
                    <h3>Leaderboard</h3>
                    <div class="pg-tablewrap" style="margin-top:10px;"><table class="pg-table"><thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div>
                    <p class="pg-note">Scores update from the game's own reporting server once a match ends.</p>
                </div>
            </div>`;
        $('#pg-back-t', body).addEventListener('click', () => renderTourneyBody(root));
        $('#pg-join-detail', body).addEventListener('click', () => joinTournament(id).then(() => openTournament(root, id)));
    }

    /* ======================================================================================
       CREATOR LAB MODULE  (2D/3D assets -> digital download / print / merch)
       No checkout - this saves a request PixelGaunt (or a connected print/merch partner) later
       fulfils. CONFIG.fulfilment flags say which paths are actually wired up right now.
       ====================================================================================== */
    function mountCreator(root) {
        root.innerHTML = `
            <div class="pg-tool">
                <div class="pg-panel pg-cut">
                    <h3>1. Add your asset</h3>
                    <p class="pg-muted">2D art (PNG/JPG/SVG, up to 8&nbsp;MB) or a 3D model (GLB/GLTF/OBJ, up to 25&nbsp;MB).</p>
                    <div class="pg-drop" id="pg-c-drop" tabindex="0" role="button" style="margin-top:12px;">
                        <i class="fas fa-file-arrow-up" aria-hidden="true"></i><b>Drop an image or model</b><span>or click to choose a file</span>
                        <input type="file" id="pg-c-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.glb,.gltf,.obj" style="display:none;">
                    </div>
                    <div class="pg-preview" id="pg-c-preview" style="margin-top:14px;"><span class="pg-muted" style="font-size:0.85rem;">No asset yet</span></div>
                    <ul class="pg-status-list" id="pg-c-status"></ul>
                </div>
                <div class="pg-panel pg-cut">
                    <h3>2. Choose what to make</h3>
                    <div class="pg-field" style="margin-top:10px;"><label for="pg-c-format">Output</label>
                        <select id="pg-c-format">
                            <option value="digital">Digital download</option>
                            <option value="print2d">2D print (poster / sticker / art print)</option>
                            <option value="print3d">3D print (figurine / collectible)</option>
                            <option value="merch">Merchandise (apparel / gifts)</option>
                        </select>
                    </div>
                    <div class="pg-field" style="margin-top:10px;"><label for="pg-c-notes">Notes for the request (optional)</label><textarea id="pg-c-notes" maxlength="240" placeholder="Size, material, quantity, anything specific..."></textarea></div>
                    <div id="pg-c-fulfil" class="pg-note"></div>
                    <button type="button" class="pg-btn primary" id="pg-c-save" style="margin-top:14px;" disabled>Save request</button>
                    <div id="pg-c-result"></div>
                    <div id="pg-c-mine"></div>
                </div>
            </div>`;
        let asset = null; // { name, kind: '2d'|'3d', dataUrl, bytes }
        const drop = $('#pg-c-drop', root), fileInput = $('#pg-c-file', root), preview = $('#pg-c-preview', root), status = $('#pg-c-status', root), saveBtn = $('#pg-c-save', root);
        const openPicker = () => fileInput.click();
        drop.addEventListener('click', openPicker);
        drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
        ['dragover', 'dragenter'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) loadAsset(e.dataTransfer.files[0]); });
        fileInput.addEventListener('change', e => { if (e.target.files.length) loadAsset(e.target.files[0]); e.target.value = ''; });

        function loadAsset(file) {
            const is3d = /\.(glb|gltf|obj)$/i.test(file.name);
            const cap = is3d ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
            const checks = [];
            checks.push({ ok: true, text: 'File type: ' + (is3d ? '3D model' : 'Image') });
            checks.push({ ok: file.size <= cap, text: 'Size ' + fmtBytes(file.size) + ' (limit ' + fmtBytes(cap) + ')' });
            status.innerHTML = checks.map(c => `<li><span>${esc(c.text)}</span><span class="pg-pill ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'OK' : 'Too large'}</span></li>`).join('');
            if (checks.some(c => !c.ok)) { asset = null; saveBtn.disabled = true; return; }
            const reader = new FileReader();
            reader.onload = () => {
                asset = { name: file.name, kind: is3d ? '3d' : '2d', dataUrl: reader.result, bytes: file.size };
                preview.innerHTML = is3d
                    ? `<div style="text-align:center;"><i class="fas fa-cube" aria-hidden="true" style="font-size:2.6rem;color:var(--neon-cyan);"></i><div class="pg-muted" style="margin-top:8px;font-size:0.85rem;">${esc(file.name)}<br>Preview renders after the request is saved.</div></div>`
                    : `<img src="${reader.result}" alt="${esc(file.name)}">`;
                syncFulfil();
                saveBtn.disabled = false;
            };
            if (is3d) { reader.onload = () => { asset = { name: file.name, kind: '3d', dataUrl: '', bytes: file.size }; preview.innerHTML = `<div style="text-align:center;"><i class="fas fa-cube" aria-hidden="true" style="font-size:2.6rem;color:var(--neon-cyan);"></i><div class="pg-muted" style="margin-top:8px;font-size:0.85rem;">${esc(file.name)}</div></div>`; syncFulfil(); saveBtn.disabled = false; }; reader.readAsArrayBuffer(file); }
            else reader.readAsDataURL(file);
        }
        function syncFulfil() {
            const fmt = $('#pg-c-format', root).value;
            const key = fmt === 'digital' ? 'digital' : fmt;
            const wired = CONFIG.fulfilment[key];
            $('#pg-c-fulfil', root).textContent = wired ? 'This output is fulfilled automatically once you save the request.' : 'This output is not yet connected to a fulfilment service — your request is saved and PixelGaunt follows up by email.';
        }
        $('#pg-c-format', root).addEventListener('change', syncFulfil);
        syncFulfil();

        $('#pg-c-save', root).addEventListener('click', async () => {
            if (!asset) return;
            if (needLogin('Sign in to save a creator request.')) return;
            saveBtn.disabled = true; const label = saveBtn.textContent; saveBtn.textContent = 'Saving...';
            try {
                const { db, fs } = await fb();
                const user = getUser();
                await fs.addDoc(fs.collection(db, 'creator_requests'), {
                    ownerUid: user.uid, ownerName: cleanName(user), assetName: asset.name, kind: asset.kind,
                    format: $('#pg-c-format', root).value, notes: $('#pg-c-notes', root).value.trim().slice(0, 240),
                    preview: asset.kind === '2d' ? asset.dataUrl.slice(0, 300000) : '', status: 'saved', createdAt: fs.serverTimestamp()
                });
                $('#pg-c-result', root).innerHTML = '<div class="pg-verdict ok" style="margin-top:14px;">Request saved<small>No payment was taken — this is not a checkout yet. We will follow up by email once fulfilment is connected.</small></div>';
                loadMyRequests(root);
            } catch (err) { console.error(err); toast('Could not save the request: ' + err.message); }
            saveBtn.disabled = false; saveBtn.textContent = label;
        });
        loadMyRequests(root);
    }

    async function loadMyRequests(root) {
        const box = $('#pg-c-mine', root); if (!box) return;
        const user = getUser();
        if (!user) { box.innerHTML = ''; return; }
        try {
            const { db, fs } = await fb();
            const snap = await fs.getDocs(fs.query(fs.collection(db, 'creator_requests'), fs.where('ownerUid', '==', user.uid)));
            if (!snap.docs.length) { box.innerHTML = ''; return; }
            const rows = snap.docs.map(d => { const r = d.data(); return `<li><span>${esc(r.assetName)} · ${esc(r.format)}</span><span class="pg-pill">${esc(r.status)}</span></li>`; }).join('');
            box.innerHTML = `<div class="pg-shelf-head" style="margin:22px 0 8px;"><div><h2 class="pixel-font" style="font-size:1.05rem;">Your requests</h2></div></div><ul class="pg-mine">${rows}</ul>`;
        } catch (err) { console.warn('Requests unavailable:', err); }
    }

    /* ======================================================================================
       INIT
       ====================================================================================== */
    function mountAll() {
        const launch = $('#launch-root'); if (launch) mountPublish(launch);
        const tourneys = $('#tournaments-root'); if (tourneys) mountTournaments(tourneys);
        const creator = $('#creator-root'); if (creator) mountCreator(creator);
        onAuth(() => {
            const l = $('#launch-root'); if (l && $('#pg-my-games', l)) loadMyGames(l);
            const c = $('#creator-root'); if (c && $('#pg-c-mine', c)) loadMyRequests(c);
        });
    }
    mountAll();

    // Shared with Creator Studio (creator-studio.html) so game deletion goes through one
    // place instead of a second copy of this logic. Firestore rules still have final say -
    // this just removes the listing doc and its gzip chunk docs for a game the caller owns.
    async function deleteMyGame(gameId, chunkCount) {
        const { db, fs } = await fb();
        const n = Math.max(0, Number(chunkCount) || 0);
        await Promise.all(Array.from({ length: n }, (_, i) => fs.deleteDoc(fs.doc(db, 'community_games', gameId, 'chunks', String(i)))));
        await fs.deleteDoc(fs.doc(db, 'community_games', gameId));
        Core.invalidateCommunity();
    }

    window.PG = { CONFIG, statusInfo, resetPublish, mountAll, planLimits, usageInfo, deleteMyGame, Bracket };
})();
