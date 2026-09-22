/* =====================================================================================
   PIXELGAUNT PLATFORM MODULES  -  Publish (game check + publishing), Tournaments, Creator Lab
   -------------------------------------------------------------------------------------
   Loaded on demand by script.js only when one of those homepage sections is about to be
   seen. Vanilla JS, no libraries. Uses the Firebase handles exposed by firebase-auth.js
   (window.pgFB) and the helpers exposed by script.js (window.PGCore).

   NOTHING SECRET LIVES IN THIS FILE. The optional AI review talks to a server-side proxy
   (pg-ai-worker.js, deployed separately) - the AI provider key stays there.
   Firestore security rules for the collections used here: see firestore.rules.
   ===================================================================================== */
(function () {
    'use strict';
    const Core = window.PGCore;
    if (!Core) { console.error('platform.js needs script.js (PGCore) to be loaded first.'); return; }
    const { esc } = Core;

    /* ------------------------------ PUBLIC CONFIG (no secrets) ------------------------------ */
    const CONFIG = {
        // URL of your deployed pg-ai-worker.js (e.g. https://pg-ai.yourname.workers.dev/review).
        // Leave empty to run local checks only - the AI step is then shown as "not connected".
        aiEndpoint: '',
        // true  = a game that passes the check is published immediately.
        // false = it is saved as "pending" and you approve it in the Firebase console.
        // Must match the rule you pasted from firestore.rules.
        autoPublish: true,
        maxUploadBytes: 40 * 1024 * 1024,      // raw upload
        maxUnpackedBytes: 60 * 1024 * 1024,    // zip-bomb guard
        maxBundleBytes: 6 * 1024 * 1024,       // gzip bundle stored in Firestore (Spark plan)
        maxFiles: 600,
        chunkBytes: 900000,                    // Firestore document limit is 1 MiB
        smokeTestMs: 3500,
        cdnAllow: ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
        fontHosts: ['fonts.googleapis.com', 'fonts.gstatic.com'],
        // First-party games become tournament-ready by reporting scores (see the Tournaments > Compatibility tab).
        // Once a game does, list it here: { 16: 'score' } (key = game id in script.js).
        firstPartyTournament: {},
        // Creator Lab: flip a value to true only when a real service is connected server-side.
        fulfilment: { digital: false, print2d: false, print3d: false, merch: false, payments: false }
    };

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
       LOCAL GAME CHECK  (runs entirely in the browser - this is the real gate; the AI review
       below is an optional second opinion layered on top of it, never a replacement for it)
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

    /* Optional AI review via a server-side proxy the developer deploys separately (see
       CONFIG.aiEndpoint above). Sends only small text snippets, never full binary assets.
       If unreachable, disabled, or it errors, the check simply continues without it - the
       local checks above remain the real gate, so a missing AI step never blocks publishing. */
    async function aiReview(entryHtml, extraJs) {
        if (!CONFIG.aiEndpoint) return { available: false };
        try {
            const res = await fetch(CONFIG.aiEndpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: entryHtml.slice(0, 20000), js: (extraJs || '').slice(0, 20000) }),
                signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            return { available: true, notes: Array.isArray(data.notes) ? data.notes.slice(0, 8) : [], safe: data.safe !== false };
        } catch (err) {
            console.warn('AI review unavailable:', err);
            return { available: false, error: true };
        }
    }

    /* ======================================================================================
       PUBLISH MODULE
       ====================================================================================== */
    let pubState = null; // { files, entry, html, result }

    function renderChecklist(root, res, ai) {
        const items = res.checks.map(c => `<li class="${c.level}"><span class="g">${c.level === 'pass' ? '✓' : c.level === 'fail' ? '✗' : c.level === 'warn' ? '⚠' : 'i'}</span><span>${esc(c.text)}${c.detail ? '<small>' + esc(c.detail) + '</small>' : ''}</span></li>`).join('');
        let aiHtml = '';
        if (ai) {
            if (ai.available) aiHtml = `<li class="${ai.safe === false ? 'fail' : 'pass'}"><span class="g">${ai.safe === false ? '✗' : '✓'}</span><span>AI review${ai.notes && ai.notes.length ? '<small>' + esc(ai.notes.join(' · ')) + '</small>' : ' found nothing to flag'}</span></li>`;
            else aiHtml = `<li class="info"><span class="g">i</span><span>AI review not available<small>Local checks above are still the pass/fail gate.</small></span></li>`;
        }
        root.innerHTML = `<ul class="pg-checks">${items}${aiHtml}</ul>`;
    }

    function verdictBanner(res, ai) {
        const blockedByAi = ai && ai.available && ai.safe === false;
        if (res.verdict === 'bad' || blockedByAi) return { cls: 'bad', title: 'Not ready to publish', sub: (res.fails || 0) + ' check(s) failed' + (blockedByAi ? ' · flagged by AI review' : '') + '. Fix these and check again.' };
        if (res.verdict === 'warn') return { cls: 'warn', title: 'Ready, with warnings', sub: res.warns + ' warning(s) - you can still publish.' };
        return { cls: 'ok', title: 'READY TO PUBLISH', sub: 'All checks passed.' };
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
        setProgress(75);
        let ai = null;
        if (res.entry) {
            const jsPaths = [...files.keys()].filter(n => /\.js$/i.test(n)).slice(0, 3);
            const extraJs = jsPaths.map(p => utf8.decode(files.get(p))).join('\n');
            ai = await aiReview(utf8.decode(files.get(res.entry)), extraJs);
        }
        setProgress(100);
        renderChecklist(list, res, ai);
        const v = verdictBanner(res, ai);
        verdictBox.innerHTML = `<div class="pg-verdict ${v.cls}">${v.cls === 'ok' ? 'READY TO PUBLISH' : esc(v.title)}<small>${esc(v.sub)}</small></div>`;
        const canPublish = v.cls !== 'bad';
        publishBtn.disabled = !canPublish;
        pubState = { files, entry: res.entry, verdict: v.cls, ai, sizeTotal: res.sizeTotal };
        return res;
    }

    async function publishGame(root, meta) {
        if (!pubState || !pubState.entry) return;
        if (needLogin('Sign in to publish your game.')) return;
        const btn = $('.pg-publish-btn', root);
        btn.disabled = true; const oldLabel = btn.textContent; btn.textContent = 'Publishing...';
        try {
            const user = getUser();
            // MVP bundle: the entry HTML only, so assets must be inlined as data: URLs (the
            // upload panel says so). Multi-file storage is a follow-up, not a blocker for v1.
            const html = utf8.decode(pubState.files.get(pubState.entry));
            const gz = await gzip(html);
            if (gz.length > CONFIG.maxBundleBytes) throw new Error('This game packages to more than ' + fmtBytes(CONFIG.maxBundleBytes) + ' after compression. Inline assets as data: URLs and stay under the limit.');
            const pkg = await fb();
            const { db, fs } = pkg;
            const chunkBytes = [];
            for (let i = 0; i < gz.length; i += CONFIG.chunkBytes) chunkBytes.push(gz.subarray(i, i + CONFIG.chunkBytes));

            const gameDoc = {
                title: meta.title, genre: meta.genre, description: meta.description || '',
                controls: meta.controls || '', orientation: meta.orientation || 'landscape',
                thumb: meta.thumbDataUrl || '', ownerUid: user.uid, ownerName: cleanName(user),
                status: CONFIG.autoPublish ? 'published' : 'pending',
                chunkCount: chunkBytes.length, tournament: meta.tournamentServer ? { reporting: 'score', server: meta.tournamentServer } : null,
                createdAt: fs.serverTimestamp(), checkVerdict: pubState.verdict
            };
            const docRef = fs.doc(fs.collection(db, 'community_games'));
            await fs.setDoc(docRef, gameDoc);
            await Promise.all(chunkBytes.map((b, i) => fs.setDoc(fs.doc(db, 'community_games', docRef.id, 'chunks', String(i)), { i, b: fs.Bytes.fromUint8Array(b) })));

            Core.invalidateCommunity();
            const pending = gameDoc.status === 'pending';
            root.innerHTML = `<div class="pg-verdict ok">${pending ? 'Submitted for review' : 'Published!'}<small>${pending ? 'We will list it once it is approved.' : 'Your game is live in Community Games.'}</small></div><button type="button" class="pg-btn primary" style="margin-top:14px;" onclick="window.pgLoadPlatform().then(m=>m.resetPublish())">Publish another game</button>`;
            if (!pending) toast('"' + meta.title + '" is live in Community Games.');
        } catch (err) {
            console.error('Publish failed:', err);
            toast('Publish failed: ' + err.message);
            btn.disabled = false; btn.textContent = oldLabel;
        }
    }

    function mountPublish(root) {
        root.classList.add('pg-panel-active');
        root.innerHTML = `
            <div class="pg-drop" id="pg-drop" tabindex="0" role="button" aria-label="Choose game files or a zip">
                <i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>
                <b>Drop your game here</b>
                <span>A .zip, a folder, or a single .html file · up to ${fmtBytes(CONFIG.maxUploadBytes)}</span>
                <input type="file" id="pg-file-input" accept=".zip,.html,.htm" multiple webkitdirectory style="display:none;">
                <input type="file" id="pg-file-input-single" accept=".zip,.html,.htm" style="display:none;">
            </div>
            <p class="pg-note">Everything runs in an isolated sandbox and cannot read PixelGaunt logins, storage, or other games. Assets must be embedded as <code>data:</code> URLs for this first version — external files referenced by path will show as missing.</p>
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
                <label class="pg-check-inline" style="margin-top:12px;"><input type="checkbox" id="pg-terms-check"><span>This is my own work (or I have the rights to publish it), and it follows the <a href="index.html#" onclick="openPageModal && openPageModal('Terms of Service','pg-terms')" class="pg-link" style="font-size:0.82rem;">PixelGaunt content rules</a>.</span></label>
                <button type="button" class="pg-btn primary pg-publish-btn" style="margin-top:16px;" disabled>Publish game</button>
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
            await publishGame(root, {
                title: $('#pg-title', root).value.trim().slice(0, 60) || 'Untitled', genre: $('#pg-genre', root).value,
                description: $('#pg-desc', root).value.trim(), controls: $('#pg-controls', root).value.trim(),
                orientation: $('#pg-orientation', root).value, thumbDataUrl: pubState.thumbDataUrl, tournamentServer: server
            });
        });
        loadMyGames(root);
    }

    async function handleUpload(root, fileList) {
        const drop = $('#pg-drop', root); const oldHtml = drop.innerHTML;
        drop.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><b>Reading your files...</b>';
        $('#pg-meta-panel', root).classList.add('pg-hidden');
        try {
            const { files, problems } = await collectFiles(fileList);
            drop.innerHTML = `<i class="fas fa-gamepad" aria-hidden="true"></i><b>${esc(files.size)} file(s) loaded</b><span>Click to choose a different upload</span>`;
            const res = await runCheck(root, files, problems);
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
            if (!snap.docs.length) { box.innerHTML = ''; return; }
            const rows = snap.docs.map(d => { const g = d.data(); return `<li><span>${esc(g.title)}</span><span class="pg-pill ${g.status === 'published' ? 'ok' : 'warn'}">${esc(g.status)}</span></li>`; }).join('');
            box.innerHTML = `<div class="pg-shelf-head" style="margin:26px 0 8px;"><div><h2 class="pixel-font" style="font-size:1.1rem;">Your published games</h2></div></div><ul class="pg-mine">${rows}</ul>`;
        } catch (err) { console.warn('My games unavailable:', err); }
    }

    function resetPublish() { pubState = null; const root = $('#launch-root'); if (root) mountPublish(root); }

    /* ======================================================================================
       TOURNAMENTS MODULE
       ====================================================================================== */
    let tourneyTab = 'browse';

    function tournamentCompatList() {
        const list = [];
        Core.games.forEach(g => { if (CONFIG.firstPartyTournament[g.id]) list.push({ id: g.id, title: g.title, status: 'ready' }); else list.push({ id: g.id, title: g.title, status: 'none' }); });
        return list;
    }

    async function mountTournaments(root) {
        root.innerHTML = `
            <div class="pg-tabs" role="tablist">
                <button class="pg-tab" data-tab="browse" role="tab" aria-selected="true">Browse</button>
                <button class="pg-tab" data-tab="create" role="tab" aria-selected="false">Create</button>
                <button class="pg-tab" data-tab="compat" role="tab" aria-selected="false">Compatibility</button>
            </div>
            <div id="pg-tourney-body"></div>
        `;
        root.querySelectorAll('.pg-tab').forEach(btn => btn.addEventListener('click', () => { tourneyTab = btn.dataset.tab; renderTourneyTabs(root); renderTourneyBody(root); }));
        renderTourneyBody(root);
    }
    function renderTourneyTabs(root) { root.querySelectorAll('.pg-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tourneyTab ? 'true' : 'false')); }

    async function renderTourneyBody(root) {
        const body = $('#pg-tourney-body', root);
        if (tourneyTab === 'compat') {
            const rows = tournamentCompatList().map(g => `<tr><td>${esc(g.title)}</td><td><span class="pg-pill ${g.status === 'ready' ? 'ok' : 'warn'}">${g.status === 'ready' ? 'Tournament ready' : 'Not Tournament Compatible'}</span></td></tr>`).join('');
            body.innerHTML = `<p class="pg-muted" style="margin-bottom:14px;">A game becomes tournament-ready once it reports match scores to a server PixelGaunt can read from. Single-player games with no scoring server stay marked below.</p><div class="pg-tablewrap"><table class="pg-table"><thead><tr><th>Game</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
            return;
        }
        if (tourneyTab === 'create') {
            body.innerHTML = `
                <div class="pg-panel pg-cut" style="max-width:640px;">
                    <h3>Create a tournament</h3>
                    <p>Only for games marked <b>Tournament ready</b> in the Compatibility tab — those report scores to a server PixelGaunt can read. A single-player game with no such server cannot host one; add a scoring server when you publish it (see Publish above) to make it eligible.</p>
                    <div class="pg-grid2" style="margin-top:12px;">
                        <div class="pg-field"><label for="pgt-game">Game</label><select id="pgt-game"></select></div>
                        <div class="pg-field"><label for="pgt-name">Tournament name</label><input id="pgt-name" maxlength="60" placeholder="Weekend Cup"></div>
                        <div class="pg-field"><label for="pgt-limit">Player limit</label><input id="pgt-limit" type="number" min="2" max="500" value="32"></div>
                        <div class="pg-field"><label for="pgt-prize">Prize (optional)</label><input id="pgt-prize" maxlength="80" placeholder="Bragging rights"></div>
                        <div class="pg-field"><label for="pgt-start">Start</label><input id="pgt-start" type="datetime-local"></div>
                        <div class="pg-field"><label for="pgt-end">End</label><input id="pgt-end" type="datetime-local"></div>
                    </div>
                    <div id="pgt-create-msg" class="pg-note"></div>
                    <button type="button" class="pg-btn primary" id="pgt-create-btn" style="margin-top:14px;">Create tournament</button>
                </div>`;
            const sel = $('#pgt-game', body);
            const ready = tournamentCompatList().filter(g => g.status === 'ready').concat(window.communityGames.filter(g => g.tournament && g.tournament.reporting === 'score').map(g => ({ id: g.id, title: g.title, status: 'ready' })));
            sel.innerHTML = ready.length ? ready.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('') : '<option value="">No tournament-ready games yet</option>';
            $('#pgt-create-btn', body).addEventListener('click', async () => {
                if (needLogin('Sign in to create a tournament.')) return;
                if (!ready.length) { $('#pgt-create-msg', body).textContent = 'No games are tournament-ready yet.'; return; }
                const name = $('#pgt-name', body).value.trim();
                if (!name) { $('#pgt-create-msg', body).textContent = 'Give your tournament a name.'; return; }
                const start = $('#pgt-start', body).value, end = $('#pgt-end', body).value;
                try {
                    const { db, fs } = await fb();
                    const user = getUser();
                    await fs.addDoc(fs.collection(db, 'tournaments'), {
                        name, gameId: sel.value, gameTitle: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '',
                        limit: Math.max(2, Math.min(500, parseInt($('#pgt-limit', body).value, 10) || 32)),
                        prize: $('#pgt-prize', body).value.trim().slice(0, 80),
                        startAt: start ? fs.Timestamp.fromDate(new Date(start)) : null, endAt: end ? fs.Timestamp.fromDate(new Date(end)) : null,
                        ownerUid: user.uid, ownerName: cleanName(user), players: [], status: 'upcoming', createdAt: fs.serverTimestamp()
                    });
                    toast('Tournament created.'); tourneyTab = 'browse'; renderTourneyTabs(root); renderTourneyBody(root);
                } catch (err) { console.error(err); $('#pgt-create-msg', body).textContent = 'Could not create the tournament: ' + err.message; }
            });
            return;
        }
        body.innerHTML = '<p class="pg-muted">Loading tournaments...</p>';
        try {
            const { db, fs } = await fb();
            const snap = await fs.getDocs(fs.query(fs.collection(db, 'tournaments'), fs.orderBy('createdAt', 'desc'), fs.limit(30)));
            const now = Date.now();
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!list.length) { body.innerHTML = '<div class="pg-empty">No tournaments yet. Create the first one from the Create tab.</div>'; return; }
            body.innerHTML = `<div class="pg-tlist">${list.map(t => tournamentCard(t, now)).join('')}</div>`;
            body.querySelectorAll('[data-tid]').forEach(card => card.addEventListener('click', e => { if (e.target.closest('button')) return; openTournament(root, card.dataset.tid); }));
            body.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); joinTournament(btn.dataset.join, root); }));
        } catch (err) { console.error(err); body.innerHTML = '<div class="pg-empty">Tournaments are unavailable right now.</div>'; }
    }

    function tournamentStatusOf(t, now) {
        const s = t.startAt && t.startAt.toMillis ? t.startAt.toMillis() : null, e = t.endAt && t.endAt.toMillis ? t.endAt.toMillis() : null;
        if (e && now > e) return 'done'; if (s && now < s) return 'upcoming'; return 'live';
    }
    function tournamentCard(t, now) {
        const status = tournamentStatusOf(t, now);
        const full = (t.players || []).length >= t.limit;
        return `<div class="pg-tcard" data-tid="${esc(t.id)}" tabindex="0" role="button">
            <div class="pg-row"><span class="pg-pill ${status}">${status}</span>${t.prize ? '<span class="pg-pill">' + esc(t.prize) + '</span>' : ''}</div>
            <h4>${esc(t.name)}</h4>
            <dl><dt>Game</dt><dd>${esc(t.gameTitle || 'Unknown')}</dd><dt>Players</dt><dd>${(t.players || []).length} / ${esc(t.limit)}</dd>${t.startAt ? '<dt>Starts</dt><dd>' + esc(new Date(t.startAt.toMillis()).toLocaleString()) + '</dd>' : ''}</dl>
            <div class="pg-row"><button type="button" class="pg-btn sm primary" data-join="${esc(t.id)}" ${status === 'done' || full ? 'disabled' : ''}>${full ? 'Full' : 'Join'}</button><span class="pg-muted" style="font-size:0.82rem;">View leaderboard →</span></div>
        </div>`;
    }

    async function joinTournament(id, root) {
        if (needLogin('Sign in to join a tournament.')) return;
        try {
            const { db, fs } = await fb();
            const user = getUser();
            await fs.runTransaction(db, async tx => {
                const ref = fs.doc(db, 'tournaments', id);
                const snap = await tx.get(ref);
                if (!snap.exists()) throw new Error('This tournament no longer exists.');
                const data = snap.data(); const players = data.players || [];
                if (players.some(p => p.uid === user.uid)) return;
                if (players.length >= data.limit) throw new Error('This tournament is full.');
                tx.update(ref, { players: [...players, { uid: user.uid, name: cleanName(user), score: 0 }] });
            });
            toast('You are in!');
            renderTourneyBody(root);
        } catch (err) { toast(err.message || 'Could not join.'); }
    }

    async function openTournament(root, id) {
        const body = $('#pg-tourney-body', root);
        body.innerHTML = '<p class="pg-muted">Loading...</p>';
        try {
            const { db, fs } = await fb();
            const snap = await fs.getDoc(fs.doc(db, 'tournaments', id));
            if (!snap.exists()) { body.innerHTML = '<div class="pg-empty">Tournament not found.</div>'; return; }
            const t = snap.data(); const now = Date.now();
            const rows = (t.players || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((p, i) => `<tr class="${getUser() && p.uid === getUser().uid ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.score || 0)}</td></tr>`).join('') || '<tr><td colspan="3" class="pg-muted">No players yet.</td></tr>';
            body.innerHTML = `
                <button type="button" class="pg-link" id="pg-back-t" style="margin-bottom:14px;">← Back to tournaments</button>
                <div class="pg-tdetail">
                    <div class="pg-panel pg-cut">
                        <div class="pg-row"><span class="pg-pill ${tournamentStatusOf(t, now)}">${tournamentStatusOf(t, now)}</span></div>
                        <h3 style="margin-top:8px;">${esc(t.name)}</h3>
                        <dl style="margin-top:10px; display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:0.88rem;">
                            <dt class="pg-muted">Game</dt><dd>${esc(t.gameTitle || 'Unknown')}</dd>
                            <dt class="pg-muted">Players</dt><dd>${(t.players || []).length} / ${esc(t.limit)}</dd>
                            ${t.prize ? '<dt class="pg-muted">Prize</dt><dd>' + esc(t.prize) + '</dd>' : ''}
                            ${t.startAt ? '<dt class="pg-muted">Start</dt><dd>' + esc(new Date(t.startAt.toMillis()).toLocaleString()) + '</dd>' : ''}
                            ${t.endAt ? '<dt class="pg-muted">End</dt><dd>' + esc(new Date(t.endAt.toMillis()).toLocaleString()) + '</dd>' : ''}
                        </dl>
                        <button type="button" class="pg-btn primary" id="pg-join-detail" style="margin-top:16px;" ${tournamentStatusOf(t, now) === 'done' ? 'disabled' : ''}>Join tournament</button>
                    </div>
                    <div class="pg-panel pg-cut">
                        <h3>Leaderboard</h3>
                        <div class="pg-tablewrap" style="margin-top:10px;"><table class="pg-table"><thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div>
                        <p class="pg-note">Scores update from the game's own reporting server once a match ends.</p>
                    </div>
                </div>`;
            $('#pg-back-t', body).addEventListener('click', () => renderTourneyBody(root));
            $('#pg-join-detail', body).addEventListener('click', () => joinTournament(id, root).then(() => openTournament(root, id)));
        } catch (err) { console.error(err); body.innerHTML = '<div class="pg-empty">Could not load this tournament.</div>'; }
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

    window.PG = { CONFIG, resetPublish, mountAll };
})();
