// ONE ADDRESS: www.pixelgaunt.com and pixelgaunt.com are separate websites to the browser, each with its own login.
// Moving between them looks like "I was logged out". Always use pixelgaunt.com.
if (location.hostname === 'www.pixelgaunt.com') location.replace('https://pixelgaunt.com' + location.pathname + location.search + location.hash);
// The address as it was when the page opened (before any tidying of the address bar) - e.g. publish.html?update=<id>.
window.pgStartSearch = location.search;
// Review service (pg-review-worker.js on Cloudflare). Used by platform.js, firebase-auth.js and subscription.html.
window.PG_REVIEW_ENDPOINT = 'https://pg-review.pixelgaunt.workers.dev';
// A random id for this browser (not personal data). Lets the review service recognise a developer's own device,
// so their own plays of their own games are not counted for revenue (Google AdSense invalid-traffic rules).
window.pgDeviceId = function () {
    try { let id = localStorage.getItem('pgDeviceId'); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))).toLowerCase(); localStorage.setItem('pgDeviceId', id); } return id; }
    catch (e) { return window.__pgDevId || (window.__pgDevId = (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).toLowerCase()); }
};
/* ADS AND YOUR OWN GAME: a developer must not see (or click) ads on pages where they play their own game - their revenue
   share comes from those ads. games.html holds ad requests (adsbygoogle.pauseAdRequests = 1, set in its <head>) until
   we know who is playing; they are released for everyone except the owner of the community game being played. */
// Small friendly banner (welcome messages).
window.pgWelcome = function (text) {
    try {
        const el = document.createElement('div'); el.className = 'pg-welcome'; el.setAttribute('role', 'status'); el.textContent = text;
        document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 4500);
    } catch (e) { /* page not ready */ }
};
// First visit ever on this browser: welcome the new visitor.
(function () {
    const show = () => { try { if (!localStorage.getItem('pgVisited')) { localStorage.setItem('pgVisited', '1'); setTimeout(() => window.pgWelcome('Welcome to PixelGaunt! 🎮 Play free browser games or publish your own.'), 1200); } } catch (e) {} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
// ---- Saved colour theme: applied as early as possible on every page (default: neon) ----
(function () {
    const apply = () => { let t = 'neon'; try { t = localStorage.getItem('pgTheme') || 'neon'; } catch (e) {} if (window.setGlobalTheme) window.setGlobalTheme(t); else document.body.classList.add('theme-' + t); };
    if (document.body) { try { document.body.classList.add('theme-' + (localStorage.getItem('pgTheme') || 'neon')); } catch (e) { document.body.classList.add('theme-neon'); } }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else setTimeout(apply, 0);
})();

// ---- DONATE window (header button on every page). Accounts come from pg-config.js and are shown ONLY to
//      logged-in users. A donor can send proof (amount + screenshot); PixelGaunt confirms it in the admin
//      dashboard, and confirmed donations appear in "Live on PixelGaunt" on the home page.
window.pgOpenDonate = function () {
    const cfg = window.PG_CONFIG || {}, list = (cfg.accounts || []).filter(a => String(a.number || a.iban || '').trim());
    const esc2 = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const user = window.pgFB && window.pgFB.auth.currentUser;
    let m = document.getElementById('pg-donate-modal');
    if (!m) {
        m = document.createElement('div'); m.id = 'pg-donate-modal'; m.className = 'pg-donate-overlay'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'pg-donate-title');
        m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
        document.addEventListener('keydown', e => { const x = document.getElementById('pg-donate-modal'); if (e.key === 'Escape' && x) x.remove(); });
        document.body.appendChild(m);
    }
    const head = `<button type="button" class="pg-donate-x" data-close aria-label="Close">&times;</button>
        <h3 id="pg-donate-title"><i class="fas fa-heart" aria-hidden="true"></i> Support PixelGaunt</h3>
        <p class="pg-don-sub">PixelGaunt is built by one developer. If you enjoy the games, you can send a donation of any amount to one of our official accounts. Thank you!</p>`;
    if (!user) {
        m.innerHTML = `<div class="pg-donate-box">${head}<div class="pg-don-gate"><p>Please log in to see our account details.</p>
            <button type="button" class="cy-btn cy-btn-primary" id="pg-don-login">Log in</button></div></div>`;
        m.querySelector('#pg-don-login').onclick = () => { m.remove(); if (window.openModal) window.openModal('login-modal'); };
        return;
    }
    const row = (label, v) => v ? `<div class="pg-don-row"><span>${label}: <b>${esc2(v)}</b></span><button type="button" class="pg-don-copy" data-copy="${esc2(v)}">Copy</button></div>` : '';
    m.innerHTML = `<div class="pg-donate-box">${head}
        ${list.length ? list.map(a => `<div class="pg-don-acc">${a.icon ? `<img src="${esc2(a.icon)}" alt="">` : '<span></span>'}<b>${esc2(a.name)}</b>${row('Account title', a.title)}${row(/bank/i.test(a.name) ? 'Account no.' : 'Number', a.number)}${row('IBAN', a.iban)}</div>`).join('')
            : `<div class="pg-don-acc"><span></span><span>Our official accounts are being set up. To donate now, email <a href="mailto:${esc2(cfg.contactEmail || 'pixelgaunt@gmail.com')}?subject=Donation">${esc2(cfg.contactEmail || 'pixelgaunt@gmail.com')}</a>.</span></div>`}
        <p class="pg-don-note">Only send money to the accounts shown here.</p>
        ${list.length ? `<form class="pg-don-form" id="pg-don-form" novalidate>
            <h4>Sent a donation? Let us know</h4>
            <label>Amount (PKR)<input type="number" id="pg-don-amount" min="1" step="1" inputmode="numeric" required></label>
            <label>Sent to<select id="pg-don-method">${list.map(a => `<option>${esc2(a.name)}</option>`).join('')}</select></label>
            <label>Transaction ID (if you have one)<input id="pg-don-txn" maxlength="60"></label>
            <label>Message (optional)<input id="pg-don-text" maxlength="300"></label>
            <label>Screenshot of the payment<input type="file" id="pg-don-shot" accept="image/*" required></label>
            <p class="pg-don-msg" id="pg-don-msg" role="status"></p>
            <button type="submit" class="cy-btn cy-btn-primary">Send donation details</button>
            <div class="pg-don-mine" id="pg-don-mine"></div>
        </form>` : ''}</div>`;
    m.querySelectorAll('.pg-don-copy').forEach(b => b.onclick = () => {
        (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); }).catch(() => prompt('Copy this:', b.dataset.copy));
    });
    const ep = window.PG_REVIEW_ENDPOINT;
    const mine = async () => {
        const box = m.querySelector('#pg-don-mine'); if (!box || !ep) return;
        try { const d = await (await fetch(ep + '/donations', { headers: { Authorization: 'Bearer ' + await user.getIdToken() } })).json();
            if (d.donations && d.donations.length) box.innerHTML = 'Your donations: ' + d.donations.slice(0, 5).map(x => `PKR ${esc2(x.amount)} - ${x.status === 'confirmed' ? 'received, thank you!' : x.status === 'rejected' ? 'not found - contact us' : 'waiting for confirmation'}`).join(' · ');
        } catch (e) { /* offline */ }
    };
    mine();
    const form = m.querySelector('#pg-don-form');
    if (form) form.onsubmit = async e => {
        e.preventDefault();
        const msg = m.querySelector('#pg-don-msg'), btn = form.querySelector('button[type=submit]'); msg.classList.remove('bad');
        const amount = Number(m.querySelector('#pg-don-amount').value), file = m.querySelector('#pg-don-shot').files[0];
        if (!(amount >= 1)) { msg.textContent = 'Enter the amount you sent.'; msg.classList.add('bad'); return; }
        if (!file) { msg.textContent = 'Add the screenshot of your payment.'; msg.classList.add('bad'); return; }
        btn.disabled = true; msg.textContent = 'Sending...';
        try {
            const img = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { const k = Math.min(1, 1100 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => res(b), 'image/jpeg', 0.75); }; im.onerror = () => rej(new Error('That file is not an image.')); im.src = u; });
            const d8 = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ''); let r6 = ''; const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; crypto.getRandomValues(new Uint8Array(6)).forEach(x => r6 += A[x % A.length]);
            form.dataset.ref = form.dataset.ref || ('DN-' + d8 + '-' + r6);
            const fd = new FormData(); fd.append('ref', form.dataset.ref); fd.append('amount', String(Math.round(amount))); fd.append('method', m.querySelector('#pg-don-method').value);
            fd.append('txnId', m.querySelector('#pg-don-txn').value.trim()); fd.append('message', m.querySelector('#pg-don-text').value.trim()); fd.append('receipt', img, 'receipt.jpg');
            const res = await fetch(ep + '/donation', { method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken() }, body: fd });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || !d.ok) throw new Error(d.error || ('Could not send (HTTP ' + res.status + ').'));
            msg.textContent = 'Thank you! We received your donation details and will confirm them soon.'; form.reset(); delete form.dataset.ref; mine();
        } catch (err) { msg.textContent = err.message || 'Could not send. Please try again.'; msg.classList.add('bad'); }
        finally { btn.disabled = false; }
    };
    const x = m.querySelector('.pg-donate-x'); if (x) x.focus();
};

// ---- "Ways to pay" icons, bottom centre of every page ----
(function () {
    const add = () => {
        const f = document.querySelector('footer'); if (!f || document.getElementById('pg-paystrip')) return;
        const d = document.createElement('div'); d.id = 'pg-paystrip'; d.className = 'pg-paystrip'; d.setAttribute('aria-label', 'Ways to pay');
        const items = [['bank', 'Bank transfer'], ['visa', 'Visa'], ['mastercard', 'Mastercard'], ['easypaisa', 'Easypaisa'], ['jazzcash', 'JazzCash'], ['sadapay', 'SadaPay'], ['nayapay', 'NayaPay']];
        d.innerHTML = '<span class="pg-pay-label">Ways to pay</span>' + items.map(([k, n]) => `<span class="pg-pay-ico" title="${n}"><img src="pay-${k}.png" alt="${n}" loading="lazy" width="40" height="26"></span>`).join('');
        f.appendChild(d);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();

// ---- HOME HERO: our debut release + 4 projects in development, rotating every 5 s ----
// Hovering a game name or picture opens all 5 as animated cards (tap the picture on phones).
(function pgHeroRotator() { const run = () => {
    const hero = document.getElementById('hero-presentation-section'); if (!hero) return;
    const text = hero.querySelector('.cy-hero-text'), art = hero.querySelector('.cy-hero-art'); if (!text || !art) return;
    const SOON = [
        { words: ['NEON', 'ROGUE', 'PROTOCOL'], genre: 'Top-down cyber shooter', img: 'project-neon-rogue-protocol.png', desc: 'Hack your way through a neon megacity as a rogue android - every district rewrites its rules after midnight.' },
        { words: ['THE', 'HOLLOW', 'TIDE'], genre: 'Underwater adventure', img: 'project-the-hollow-tide.png', desc: 'Dive into a drowned kingdom, light the ancient lanterns and outrun the creatures that live in the dark currents.' },
        { words: ['SHADOW', 'OF', 'EMBERFALL'], genre: 'Dark fantasy action RPG', img: 'project-shadow-of-emberfall.png', desc: 'A cursed knight, a dying fire and a kingdom of ash. Forge relics from embers and break the endless night.' },
        { words: ['SKY', 'FORGE', 'RUSH'], genre: 'Airship racing & building', img: 'project-sky-forge-rush.png', desc: 'Build your own airship from scrap, then race it through floating islands, storms and sky pirates.' }
    ];
    const first = { words: ['GIRL', 'THE', 'DRILLER'], genre: 'Physics action platformer', desc: text.querySelector('.cy-desc') ? text.querySelector('.cy-desc').textContent : '', img: 'Girl%20The%20Driller.png', real: true };
    const slides = [first].concat(SOON);
    const originalText = text.innerHTML;
    let cur = 0, timer = null, paused = false, deckOpen = false, hideT = null;
    const esc4 = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const title = s => `<h1 class="cy-title${s.real ? '' : ' cy-title-sm'}"><span>${s.words[0]}</span><span class="cy-outline">${s.words[1]}</span><span class="cy-accent">${s.words[2]}</span></h1>`;
    // the "?" picture used for every project still in development
    // Optional pictures for the in-development projects (shown blurred behind the "?"). Upload them next to index.html
    // with exactly the file names above; if a picture is missing, the plain "?" background is used instead.
    SOON.forEach(p => { const im = new Image(); im.onload = () => { p.ok = true; if (slides[cur] === p) show(cur, false); }; im.src = p.img; });
    art.insertAdjacentHTML('beforeend', '<div class="cy-qmark" aria-hidden="true"><i class="cy-qbg"></i><span>?</span><small>IMAGE CLASSIFIED</small></div>');
    const qbg = art.querySelector('.cy-qbg');
    const dots = document.createElement('div'); dots.className = 'cy-dots'; dots.setAttribute('role', 'tablist'); dots.setAttribute('aria-label', 'Our games');
    dots.innerHTML = slides.map((s, k) => `<button type="button" role="tab" aria-label="${esc4(s.words.join(' '))}" data-k="${k}"></button>`).join('');
    hero.appendChild(dots);
    const deck = document.createElement('div'); deck.className = 'cy-deck'; deck.setAttribute('aria-label', 'All our games');
    deck.innerHTML = `<div class="cy-deck-head"><span>// ALL PIXELGAUNT PROJECTS</span><button type="button" class="cy-deck-x" aria-label="Close">&times;</button></div><div class="cy-deck-grid">` + slides.map((s, k) => `<button type="button" class="cy-card${s.real ? ' is-real' : ''}" data-k="${k}" style="--d:${k * 70}ms">
            <span class="cy-card-img">${s.real ? `<img src="${s.img}" alt="" loading="lazy">` : `<img class="cy-blur" src="${s.img}" alt="" loading="lazy" onerror="this.remove()"><b>?</b>`}</span>
            <span class="cy-card-st ${s.real ? 'live' : ''}">${s.real ? 'Demo out now' : 'In development'}</span>
            <strong>${esc4(s.words.join(' '))}</strong><small>${esc4(s.genre)}</small></button>`).join('') + '</div>';
    hero.appendChild(deck);

    function show(k, anim) {
        cur = (k + slides.length) % slides.length; const s = slides[cur];
        if (s.real) text.innerHTML = originalText;
        else text.innerHTML = `<span class="cy-tag">// IN DEVELOPMENT</span>${title(s)}<p class="cy-desc">${esc4(s.desc)}</p>
            <div class="cy-ctas"><button type="button" class="cy-btn cy-btn-primary cy-btn-soon" aria-disabled="true"><i class="fas fa-play" aria-hidden="true"></i> Play demo · soon</button><a class="cy-btn cy-btn-ghost" href="https://discord.gg/DfHFVNMBQF" target="_blank" rel="noopener"><i class="fa-brands fa-discord" aria-hidden="true"></i> Follow development</a></div>
            <p class="cy-status">STATUS › In development · ${esc4(s.genre)}</p>`;
        art.classList.toggle('is-unknown', !s.real);
        if (qbg) qbg.style.backgroundImage = (!s.real && s.ok) ? `url('${s.img}')` : 'none';
        if (anim !== false) { text.classList.remove('cy-swap'); art.classList.remove('cy-swap'); void text.offsetWidth; text.classList.add('cy-swap'); art.classList.add('cy-swap'); }
        dots.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === cur)));
        deck.querySelectorAll('.cy-card').forEach((c, i) => c.classList.toggle('on', i === cur));
        const soon = text.querySelector('.cy-btn-soon');
        if (soon) soon.onclick = () => { const st = text.querySelector('.cy-status'); if (st) st.textContent = 'STATUS › The playable demo is coming soon - follow us to play it first!'; };
        wireHover();
    }
    function next() { if (!paused && !deckOpen && !document.hidden) show(cur + 1); }
    function restart() { clearInterval(timer); timer = setInterval(next, 5000); }
    let openedAt = 0;
    function openDeck() { clearTimeout(hideT); if (deckOpen) return; deckOpen = true; openedAt = Date.now(); hero.classList.add('deck-open'); }
    function closeDeck(now) { clearTimeout(hideT); const go = () => { deckOpen = false; hero.classList.remove('deck-open'); }; if (now) go(); else hideT = setTimeout(go, 450); }
    function wireHover() {
        const t = text.querySelector('.cy-title');
        if (t) { t.onmouseenter = openDeck; }
    }
    art.addEventListener('mouseenter', openDeck);
    art.addEventListener('click', e => { if (e.target.closest('a')) return; if (deckOpen && Date.now() - openedAt > 500) closeDeck(true); else openDeck(); });   // a tap also fires mouseenter first
    deck.addEventListener('mouseenter', openDeck);
    hero.addEventListener('mouseleave', () => closeDeck());
    text.addEventListener('mouseenter', () => { paused = true; }); text.addEventListener('mouseleave', () => { paused = false; });
    deck.querySelector('.cy-deck-x').onclick = () => closeDeck(true);
    deck.querySelectorAll('.cy-card').forEach(c => c.onclick = () => { show(Number(c.dataset.k)); closeDeck(true); restart(); });
    dots.querySelectorAll('button').forEach(b => b.onclick = () => { show(Number(b.dataset.k)); restart(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && deckOpen) closeDeck(true); });
    show(0, false); restart();
    }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();

// ---- LIVE CHAT (every page except the admin dashboard) ----
// Visitors ask a question; PixelGaunt answers from Admin -> Live chat. Signed-in people chat as themselves,
// guests get a private random key in this browser. All storage is on the review service (never in the page).
(function pgLiveChat() {
    if (/admin\.html$/i.test(location.pathname)) return;
    const KEY = 'pgChatKey', HAS = 'pgChatHas', GNAME = 'pgChatName', GMAIL = 'pgChatEmail';
    const e3 = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
    const ep = () => window.PG_REVIEW_ENDPOINT;
    const user = () => window.pgFB && window.pgFB.auth && window.pgFB.auth.currentUser;
    function guestKey() { let k = ls.get(KEY); if (!/^[A-Za-z0-9_-]{24,64}$/.test(k)) { const a = new Uint8Array(24); crypto.getRandomValues(a); k = Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 40); ls.set(KEY, k); } return k; }
    async function call(path, body) {
        const u = user(), h = { 'Content-Type': 'application/json' };
        if (u) h.Authorization = 'Bearer ' + await u.getIdToken(); else body.guestKey = guestKey();
        const res = await fetch(ep() + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.ok === false) throw new Error(d.error || 'Could not reach the chat right now. Try again.');
        return d;
    }
    let btn, panel, list, open = false, pollT = null, msgs = [], sending = false;
    const ago = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + (Date.now() - d > 864e5 ? ' · ' + d.toLocaleDateString() : ''); };
    function draw() {
        if (!list) return;
        const hello = `<div class="pg-cmsg them"><p>Hi! 👋 Ask us anything about our games, publishing, the developer subscription, tournaments or payments. We answer here as soon as we can.</p><small>PixelGaunt team</small></div>`;
        list.innerHTML = hello + msgs.map(m => `<div class="pg-cmsg ${m.from === 'admin' ? 'them' : 'me'}"><p>${e3(m.text)}</p><small>${m.from === 'admin' ? 'PixelGaunt' : 'You'} · ${ago(m.at)}</small></div>`).join('')
            + (msgs.length && msgs[msgs.length - 1].from === 'user' ? '<p class="pg-chat-wait">Message received - we will reply here soon. You can close this window; a red dot shows when we answer.</p>' : '')
            + (!msgs.length ? `<div class="pg-chat-chips">${['How do I publish my game?', 'How does the developer subscription work?', 'I have a payment question', 'How do tournaments work?'].map(q => `<button type="button" class="pg-chat-chip">${q}</button>`).join('')}</div>` : '');
        list.querySelectorAll('.pg-chat-chip').forEach(c => c.onclick = () => { const ta = panel.querySelector('#pg-chat-text'); ta.value = c.textContent; ta.focus(); });
        list.scrollTop = list.scrollHeight;
        const guest = !user(), g = panel.querySelector('.pg-chat-guest');
        if (g) g.hidden = !guest || !!(ls.get(GNAME) && msgs.length);
    }
    function badge(n) { const b = btn && btn.querySelector('.pg-chat-dot'); if (b) { b.textContent = n > 0 ? n : ''; b.hidden = !(n > 0); } }
    async function load(peek) {
        if (!ep()) return;
        if (!user() && !ls.get(HAS)) { if (!peek) draw(); return; }   // a guest who never wrote has no conversation yet
        try {
            const d = await call('/chat/history', peek ? { peek: true } : {});
            if (peek) { badge(d.unread || 0); return; }
            msgs = d.messages || []; if (msgs.length) ls.set(HAS, '1'); badge(0); draw();
        } catch (e) { if (!peek && list && !msgs.length) draw(); }
    }
    async function send(ev) {
        ev.preventDefault(); if (sending) return;
        const ta = panel.querySelector('#pg-chat-text'), st = panel.querySelector('.pg-chat-status'), text = ta.value.trim();
        if (!text) return;
        const body = { text, page: location.pathname.split('/').pop() || 'index.html' };
        if (!user()) {
            const n = panel.querySelector('#pg-chat-name').value.trim() || ls.get(GNAME), m = panel.querySelector('#pg-chat-email').value.trim() || ls.get(GMAIL);
            if (n.length < 2) { st.textContent = 'Please write your name first (or log in).'; panel.querySelector('#pg-chat-name').focus(); return; }
            body.name = n; body.email = m; ls.set(GNAME, n); if (m) ls.set(GMAIL, m);
        }
        sending = true; st.textContent = 'Sending...'; panel.querySelector('.pg-chat-send').disabled = true;
        try { const d = await call('/chat/send', body); msgs = d.messages || msgs; ls.set(HAS, '1'); ta.value = ''; st.textContent = ''; draw(); }
        catch (e) { st.textContent = e.message; }
        finally { sending = false; panel.querySelector('.pg-chat-send').disabled = false; }
    }
    function toggle(force) {
        open = force != null ? force : !open;
        panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('on', open);
        clearInterval(pollT);
        if (open) { const g = panel.querySelector('.pg-chat-guest'); if (g) { panel.querySelector('#pg-chat-name').value = ls.get(GNAME); panel.querySelector('#pg-chat-email').value = ls.get(GMAIL); }
            draw(); load(false); pollT = setInterval(() => { if (!document.hidden) load(false); }, 8000); setTimeout(() => panel.querySelector('#pg-chat-text').focus(), 50); }
        else pollT = setInterval(() => { if (!document.hidden) load(true); }, 60000);
    }
    function boot() {
        if (document.getElementById('pg-chat-btn')) return;
        btn = document.createElement('button'); btn.type = 'button'; btn.id = 'pg-chat-btn'; btn.className = 'pg-chat-btn'; btn.setAttribute('aria-label', 'Live chat - ask us a question'); btn.title = 'Live chat - ask us a question'; btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<i class="fas fa-comments" aria-hidden="true"></i><span class="pg-chat-lbl">Chat</span><span class="pg-chat-dot" hidden></span>';
        panel = document.createElement('section'); panel.className = 'pg-chat'; panel.id = 'pg-chat'; panel.hidden = true; panel.setAttribute('aria-label', 'Live chat');
        panel.innerHTML = `<header class="pg-chat-head"><span class="pg-chat-av"><i class="fas fa-headset" aria-hidden="true"></i></span><div><b>Live chat</b><small><span class="pg-live-dot" aria-hidden="true"></span> PixelGaunt team · we reply here</small></div><button type="button" class="pg-chat-x" aria-label="Close chat">&times;</button></header>
            <div class="pg-chat-list" id="pg-chat-list" aria-live="polite"></div>
            <form class="pg-chat-form"><div class="pg-chat-guest"><input id="pg-chat-name" maxlength="60" placeholder="Your name" autocomplete="name"><input id="pg-chat-email" type="email" maxlength="120" placeholder="Email (optional, for a reply by email)" autocomplete="email"><small>Or <a href="#" class="pg-chat-login">log in</a> to keep your chat on every device.</small></div>
            <div class="pg-chat-row"><textarea id="pg-chat-text" rows="2" maxlength="1000" placeholder="Type your question..." aria-label="Your message"></textarea><button type="submit" class="pg-chat-send" aria-label="Send"><i class="fas fa-paper-plane" aria-hidden="true"></i></button></div><p class="pg-chat-status" role="status"></p></form>`;
        document.body.appendChild(panel); document.body.appendChild(btn);
        list = panel.querySelector('#pg-chat-list');
        btn.onclick = () => toggle();
        panel.querySelector('.pg-chat-x').onclick = () => toggle(false);
        panel.querySelector('form').onsubmit = send;
        panel.querySelector('#pg-chat-text').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); panel.querySelector('form').requestSubmit(); } };
        panel.querySelector('.pg-chat-login').onclick = e => { e.preventDefault(); toggle(false); if (window.openModal) window.openModal('login-modal'); };
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });
        window.addEventListener('pg-auth', () => { msgs = []; if (open) { draw(); load(false); } else load(true); });
        window.pgOpenChat = () => toggle(true);
        pollT = setInterval(() => { if (!document.hidden) load(true); }, 60000);
        setTimeout(() => load(true), 4000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

// ---- FLOATING LIVE NOTIFICATIONS (every page) ----
// One small card every 12 s (each shown 10 s): live activity, our social channels, subscription offers / renewal reminders,
// open tournaments (free or paid) and merch news. Pauses while a game is playing or the tab is hidden; can be turned off.
(function pgFloatNotes() {
    const OFF = 'pgNotesOff', EVERY = 12000, SHOW = 10000;   // each note stays 10 s, the next one follows 2 s later
    const SOCIALS = [
        ['fa-youtube', 'YouTube', 'Subscribe to our YouTube channel', 'https://www.youtube.com/channel/UCmCPkHm7yRadCKcv_ugE4uQ', '#ff0000'],
        ['fa-facebook-f', 'Facebook', 'Follow our Facebook page', 'https://www.facebook.com/profile.php?id=61583034586770', '#1877f2'],
        ['fa-reddit-alien', 'Reddit', 'Follow us on Reddit', 'https://www.reddit.com/user/Real_Network860/', '#ff4500'],
        ['fa-discord', 'Discord', 'Join our Discord server', 'https://discord.gg/DfHFVNMBQF', '#5865f2'],
        ['fa-tiktok', 'TikTok', 'Follow us on TikTok', 'https://www.tiktok.com/@pixelgaunt', '#ff0050'],
        ['fa-whatsapp', 'WhatsApp Channel', 'Follow our WhatsApp channel', 'https://whatsapp.com/channel/0029VbBo20lLo4hmsAJODc2u', '#25d366'],
        ['fa-whatsapp', 'WhatsApp Group', 'Join our WhatsApp group', 'https://chat.whatsapp.com/EZ68rQjkqgv8Vc5hzjK8yc', '#25d366']
    ];
    const e2 = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let queue = [], i = 0, si = 0, timer = null, el = null, hideT = null, hovering = false, feed = [], tours = [];
    const off = () => { try { return localStorage.getItem(OFF) === '1'; } catch (e) { return false; } };
    const playing = () => { const f = document.getElementById('game-canvas'); const gp = document.getElementById('gameplay-page'); return !!(f && f.getAttribute('src') && gp && gp.style.display !== 'none'); };
    function feedLine(e) {
        const w = e2(e.who), g = e2(e.game);
        return { new_user: ['👋', `<b>${w}</b> just joined PixelGaunt`], online: ['🟢', `<b>${w}</b> is online`], playing: ['🎮', `<b>${w}</b> is playing <b>${g}</b>`],
            subscribed: ['⭐', `<b>${w}</b> just subscribed`], uploaded: ['🚀', `<b>${w}</b> uploaded a new game`], merch: ['👕', `<b>${w}</b> ordered a custom ${g || 'merch item'}`],
            donated: ['💖', `<b>${w}</b> donated - thank you!`], joined_paid: ['🏆', `<b>${w}</b> joined the paid tournament <b>${g}</b>`] }[e.type];
    }
    // Promotions shared with the "Live on PixelGaunt" box on the home page (window.pgPromoNotes).
    const DEV_PROMOS = [
        { ico: '🚀', html: 'Game developer? <b>Publish your games on PixelGaunt</b> - 10 games a month for just $1.99', href: 'subscription.html' },
        { ico: '💰', html: 'Developers keep <b>90% of the ad revenue</b> their games earn - start the developer plan', href: 'subscription.html' },
        { ico: '⭐', html: 'New here? The <b>developer plan</b> is $1.99 / month or $10.99 / year - publish, update and earn', href: 'subscription.html' }
    ];
    let pi = 0;
    function promos(forList) {
        const u = window.pgFB && window.pgFB.auth && window.pgFB.auth.currentUser, free = !u || !window.pgUserPlan || window.pgUserPlan === 'free';
        const out = [];
        if (free) { out.push(DEV_PROMOS[pi % DEV_PROMOS.length]); out.push(DEV_PROMOS[(pi + 1) % DEV_PROMOS.length]); }
        tours.slice(0, 2).forEach(t => out.push({ ico: '🏆', html: `Tournament <b>${e2(t.name)}</b> - ${Number(t.entryFee) > 0 ? 'PKR ' + e2(Number(t.entryFee).toLocaleString()) + ' entry' : 'FREE entry'}${t.prize ? ' · prize ' + e2(t.prize) : ''} - join now`, href: 'tournaments.html' }));
        if (!tours.length) out.push({ ico: '🏆', html: '<b>Tournaments</b> - create a free one with friends or join a paid match', href: 'tournaments.html' });
        out.push({ ico: '👕', html: '<b>Merch Studio coming soon</b> - custom T-shirts &amp; 3D prints, also made with AI', href: 'merch.html' });
        out.push({ ico: '💬', html: 'Questions? <b>Live chat</b> with the PixelGaunt team - we answer here', chat: true });
        if (forList) { const sc = SOCIALS[si++ % SOCIALS.length]; out.push({ social: sc }); }
        pi++;
        return out;
    }
    window.pgPromoNotes = () => promos(true);
    window.pgSocialNote = sc => `<a href="${sc[3]}" target="_blank" rel="noopener"><i class="fa-brands ${sc[0]}" style="color:${sc[4]}" aria-hidden="true"></i> <b>${e2(sc[1])}</b> - ${e2(sc[2])}</a>`;
    function build() {
        const q = [], u = window.pgFB && window.pgFB.auth && window.pgFB.auth.currentUser;
        const end = window.pgPlanExpires ? Date.parse(window.pgPlanExpires) : 0, days = end ? Math.ceil((end - Date.now()) / 864e5) : -1;
        if (u && window.pgUserPlan && window.pgUserPlan !== 'free' && days >= 0 && days <= 3) q.push({ ico: '⏳', html: `Your subscription ends ${days === 0 ? 'today' : 'in ' + days + ' day' + (days === 1 ? '' : 's')} - <b>renew now</b>`, href: 'subscription.html', urgent: true });
        const pr = promos(false);
        if (!u || !window.pgUserPlan || window.pgUserPlan === 'free') q.push(pr.shift());   // new / free users see the developer plan first
        feed.slice(0, 6).forEach((ev, k) => { const l = feedLine(ev); if (l) q.push({ ico: l[0], html: l[1], href: 'index.html#live-activity' }); if (k % 2 === 1 && pr.length) q.push(pr.shift()); });
        pr.forEach(n => q.push(n));
        // mix: one social channel after every two other notes
        const out = []; q.forEach((n, k) => { out.push(n); if (k % 2 === 1) { const sc = SOCIALS[si++ % SOCIALS.length]; out.push({ social: sc }); } });
        if (out.length < 3) SOCIALS.forEach(sc => out.push({ social: sc }));
        return out;
    }
    function render(n) {
        if (!el) { el = document.createElement('div'); el.className = 'pg-float'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el);
            el.addEventListener('mouseenter', () => { hovering = true; }); el.addEventListener('mouseleave', () => { hovering = false; }); }
        const body = n.social ? `<a class="pg-float-main" href="${n.social[3]}" target="_blank" rel="noopener"><span class="pg-float-ico pg-float-brand" style="background:${n.social[4]}"><i class="fa-brands ${n.social[0]}" aria-hidden="true"></i></span><span><b>${n.social[1]}</b><br>${n.social[2]}</span></a>`
            : `<a class="pg-float-main" href="${n.chat ? '#' : n.href}"${n.chat ? ' data-chat="1"' : ''}><span class="pg-float-ico">${n.ico}</span><span>${n.html}</span></a>`;
        el.className = 'pg-float' + (n.urgent ? ' urgent' : '');
        el.innerHTML = body + `<button type="button" class="pg-float-x" aria-label="Close">&times;</button><button type="button" class="pg-float-off">Turn off</button>`;
        el.querySelector('.pg-float-x').onclick = () => el.classList.remove('show');
        const ch = el.querySelector('[data-chat]'); if (ch) ch.onclick = ev => { ev.preventDefault(); el.classList.remove('show'); if (window.pgOpenChat) window.pgOpenChat(); };
        el.querySelector('.pg-float-off').onclick = () => { try { localStorage.setItem(OFF, '1'); } catch (e) {} el.classList.remove('show'); stop(); bell(); };
        requestAnimationFrame(() => el.classList.add('show'));
        clearTimeout(hideT); const hide = () => { if (hovering) { hideT = setTimeout(hide, 1500); return; } el.classList.remove('show'); }; hideT = setTimeout(hide, SHOW);
    }
    // One note at a time: show it for SHOW ms, then the next one EVERY ms after the previous started.
    function tick() {
        timer = null;
        if (off()) return;
        if (document.hidden || playing() || document.querySelector('.modal-overlay.active, #pg-donate-modal')) { timer = setTimeout(tick, 2000); return; }   // paused: check again soon
        if (!queue.length || i >= queue.length) { queue = build(); i = 0; }
        if (queue.length) render(queue[i++]);
        timer = setTimeout(tick, EVERY);
    }
    function stop() { clearTimeout(timer); timer = null; }
    function start() { if (timer || off()) return; timer = setTimeout(tick, 3000); }
    function bell() {   // small button to switch the notifications back on
        if (document.getElementById('pg-float-bell')) return;
        const b = document.createElement('button'); b.id = 'pg-float-bell'; b.type = 'button'; b.className = 'pg-float-bell'; b.title = 'Turn live notifications on'; b.setAttribute('aria-label', 'Turn live notifications on');
        b.innerHTML = '<i class="fas fa-bell" aria-hidden="true"></i>';
        b.onclick = () => { try { localStorage.removeItem(OFF); } catch (e) {} b.remove(); start(); };
        document.body.appendChild(b);
    }
    async function loadData() {
        try { if (window.PG_REVIEW_ENDPOINT) { const d = await (await fetch(window.PG_REVIEW_ENDPOINT + '/activity')).json(); feed = d.items || []; } } catch (e) {}
        try {
            if (window.pgFB && window.pgFB.fs) { const { db, fs } = window.pgFB;
                const snap = await fs.getDocs(fs.query(fs.collection(db, 'tournaments'), fs.orderBy('createdAt', 'desc'), fs.limit(10)));
                tours = snap.docs.map(d => d.data()).filter(t => (t.status === 'registration' || !t.format) && t.registration !== 'closed'); }
        } catch (e) {}
        queue = [];
    }
    const boot = () => { if (off()) { bell(); return; } loadData(); setInterval(loadData, 60000); start(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    window.addEventListener('pg-auth', () => { queue = []; }); window.addEventListener('pg-plan', () => { queue = []; });
})();

window.pgAdsDecided = false;
window.pgReleaseAds = function () {
    if (window.pgAdsDecided) return; window.pgAdsDecided = true;
    try { (window.adsbygoogle = window.adsbygoogle || []).pauseAdRequests = 0; } catch (e) { /* ad blocker */ }
};
window.pgBlockAdsForOwner = function () {
    window.pgAdsDecided = true; window.pgOwnGameNoAds = true;
    document.body.classList.add('pg-owner-no-ads');
};
        window.isLoggedIn = false;
        
        const games = [
            { id: 1, studio: 'Pixel Gaunt', title: 'Beggar Catcher', genre: 'Arcade', controls: 'Mouse / Touch. Click to play.', howToPlay: 'Click to catch and play.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Beggar Catcher.png', url: 'beggar-catcher.html', bgm: 'Beggar Catcher.mp3', orientation: 'landscape' },
            { id: 2, studio: 'Pixel Gaunt', title: 'Bricks KnockOut', genre: 'Arcade', controls: 'Mouse / Touch. Drag to aim.', howToPlay: 'Drag to launch and break the bricks.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Bricks KnockOut.png', url: 'bricks-knockout.html', bgm: 'Bricks KnockOut.mp3', orientation: 'portrait' },
            { id: 3, studio: 'Pixel Gaunt', title: 'Deck of Doom', genre: 'Card', controls: 'Mouse / Touch. Drag cards to play.', howToPlay: 'Drag cards to build your deck and survive.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Deck of Doom.png', url: 'deck-of-doom.html', bgm: 'Deck of Doom.mp3', orientation: 'portrait' },
            { id: 4, studio: 'Pixel Gaunt', title: 'Face Merge', genre: 'Puzzle', controls: 'Mouse / Touch. Drag to merge.', howToPlay: 'Drag matching tiles to merge and clear the board.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Face Merge.png', url: 'face-merge.html', bgm: 'Face Merge.mp3', orientation: 'portrait' },
            { id: 5, studio: 'Pixel Gaunt', title: 'Horse Turn', genre: 'Racing', controls: 'Touch / Swipe. Swipe to steer.', howToPlay: 'Swipe to turn and race ahead.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Horse Turn.png', url: 'horse-turn.html', bgm: 'Horse Turn.mp3', orientation: 'portrait' },
            { id: 6, studio: 'Pixel Gaunt', title: 'Iron Tide Rising', genre: 'Action', controls: 'Keyboard / Touch.', howToPlay: 'Survive the rising tide and fight back.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Iron Tide Rising.png', url: 'iron-tide-rising.html', bgm: 'Iron Tide Rising.mp3', orientation: 'landscape' },
            { id: 7, studio: 'Pixel Gaunt', title: 'Mimi Merge', genre: 'Puzzle', controls: 'Mouse / Touch. Drag to merge.', howToPlay: 'Drag matching pieces together to merge them.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Mimi Merge.png', url: 'mimi-merge.html', bgm: 'Mimi Merge.mp3', orientation: 'portrait' },
            { id: 8, studio: 'Pixel Gaunt', title: 'Panda The Ocean Hunter', genre: 'Adventure', controls: 'Mouse / Touch.', howToPlay: 'Guide Panda through the ocean depths.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Panda The Ocean Hunter.png', url: 'panda-the-ocean-hunter.html', bgm: 'Panda The Ocean Hunter.mp3', orientation: 'landscape' },
            { id: 9, studio: 'Pixel Gaunt', title: 'Pizza Chaos', genre: 'Arcade', controls: 'Mouse / Touch.', howToPlay: 'Keep up with the chaos and serve every order.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Pizza Chaos.png', url: 'pizza-chaos.html', bgm: 'Pizza Chaos.mp3', orientation: 'landscape' },
            { id: 10, studio: 'Pixel Gaunt', title: 'ReBounce', genre: 'Arcade', controls: 'Mouse / Touch. Drag to aim.', howToPlay: 'Drag and release to bounce your way through.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'ReBounce.png', url: 'rebounce.html', bgm: 'ReBounce.mp3', orientation: 'landscape' },
            { id: 11, studio: 'Pixel Gaunt', title: 'Ring Sort', genre: 'Puzzle', controls: 'Mouse / Touch. Drag rings to sort.', howToPlay: 'Drag rings between pegs to sort them by color.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Ring Sort.png', url: 'ring-sort.html', bgm: 'Ring Sort.mp3', orientation: 'landscape' },
            { id: 12, studio: 'Pixel Gaunt', title: 'Serpent Relic', genre: 'Arcade', controls: 'Keyboard / Touch.', howToPlay: 'Guide the serpent to collect relics and survive.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Serpent Relic.png', url: 'serpent-relic.html', bgm: 'Serpent Relic.mp3', orientation: 'landscape' },
            { id: 13, studio: 'Pixel Gaunt', title: 'SnakeScape', genre: 'Arcade', controls: 'Keyboard / Touch.', howToPlay: 'Classic snake action — grow long, avoid the walls.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'SnakeScape.png', url: 'snakescape.html', bgm: 'SnakeScape.mp3', orientation: 'portrait' },
            { id: 14, studio: 'Pixel Gaunt', title: 'Stick Man Velocity', genre: 'Action', controls: 'Mouse / Touch. Tap to play.', howToPlay: 'Tap to keep Stick Man moving at full velocity.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Stick Man Velocity.png', url: 'stick-man-velocity.html', bgm: 'Stick Man Velocity.mp3', orientation: 'landscape' },
            { id: 15, studio: 'Pixel Gaunt', title: 'Tetris Reimagine', genre: 'Puzzle', controls: 'Keyboard / Touch.', howToPlay: 'Clear lines across 100 levels of reimagined Tetris.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Tetris Reimagine.png', url: 'tetris-reimagine.html', bgm: 'Tetris Reimagine.mp3', orientation: 'portrait' },
            { id: 16, studio: 'Pixel Gaunt', title: 'Girl The Driller', genre: 'Adventure', controls: 'Mouse / Touch.', howToPlay: 'Click to Go & Eat Mouse.', rating: '⭐⭐⭐⭐⭐ (4.9/5)', releaseDate: 'August 20, 2026', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: `Create a highly polished commercial-quality physics action game.`, image: 'Girl The Driller.png', preview: 'Girl The Driller.gif', url: 'girl-the-driller.html', bgm: 'Girl The Driller.mp3', orientation: 'landscape' },
            { id: 17, studio: 'Pixel Gaunt', title: 'Girl The Driller 2.5D', genre: 'Adventure', controls: 'Mouse / Touch.', howToPlay: 'Click to Go & Eat Mouse.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Girl The Driller.png', preview: 'Girl The Driller.gif', url: 'girl-the-driller25d.html', bgm: 'Girl The Driller.mp3', orientation: 'landscape' }
        ];

        /* ================= POPULARITY / PLAY-COUNT RANKING SYSTEM ================= */
        const PLAY_COUNT_STORAGE_KEY = 'pixelGauntPlayCounts';

        function loadPlayCounts() {
            try {
                const raw = localStorage.getItem(PLAY_COUNT_STORAGE_KEY);
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        }

        function savePlayCounts(counts) {
            try {
                localStorage.setItem(PLAY_COUNT_STORAGE_KEY, JSON.stringify(counts));
            } catch (e) {
                /* storage unavailable - ranking will just reset each session */
            }
        }

        let playCounts = loadPlayCounts();

        // Seed each game object with its persisted play count
        games.forEach(g => { g.playCount = playCounts[g.id] || 0; });

        /* ================= PLATFORM HELPERS ================= */
        // Escape anything that did not come from this file (community game titles, names, ...)
        window.pgEsc = function(v) {
            return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        };
        const esc = window.pgEsc;

        // Games published through PixelGaunt Publish. Loaded lazily from Firestore (see below).
        window.communityGames = [];
        function findGame(id) {
            return games.find(g => g.id === id) || window.communityGames.find(g => g.id === id);
        }
        function playParam(game) {
            return game.community ? 'c-' + game.docId : game.title.toLowerCase().replace(/ /g, '-');
        }

        // Keeps track of the currently displayed grid list (All Games or a filtered/searched subset)
        // so we can re-render it in the correct order after a ranking update without losing the active filter.
        let currentDisplayedList = games;

        /* ===== GAME LAUNCH STATE GUARD ===== */
        // activeGameId: the game currently open in the viewport (null when none is open).
        // isLaunchingGame: short debounce lock so a rapid double-click/duplicate trigger
        // can't fire launchViewport twice in a row and force a second iframe load.
        let activeGameId = null;
        let isLaunchingGame = false;

        // A game must reach this many total plays before it can appear in the "Top Plays" hero section.
        // Set to 0 since there's only a single game now - it should always be featured.
        const TOP_PLAYS_THRESHOLD = 0;

        // Returns a NEW array of games sorted purely by play count (highest first, real data only).
        // Ties are broken by a fixed, stable order (game id) - never by time or randomness - so the
        // order only ever changes when an actual play count changes.
        window.getRankedGames = function(list) {
            const source = list || games;
            return [...source].sort((a, b) => {
                const diff = (b.playCount || 0) - (a.playCount || 0);
                if (diff !== 0) return diff;
                return a.id - b.id;
            });
        }

        // Call this whenever a game is played to bump its popularity and refresh the UI.
        // Community games: report the play to the review service, which counts it (or not - see pg-review-worker.js).
        function reportCommunityPlay(game) {
            if (!game || !game.community || !window.PG_REVIEW_ENDPOINT) return;
            // A "simple" request (text/plain, token in the body): no CORS pre-check, so it also survives leaving the page.
            const send = (token) => fetch(window.PG_REVIEW_ENDPOINT + '/play', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ gameId: game.docId, deviceId: window.pgDeviceId(), token: token || undefined }) }).catch(() => {});
            const u = window.pgFB && window.pgFB.auth.currentUser;
            if (u) u.getIdToken().then(send, () => send(null)); else send(null);
        }

        window.registerGamePlay = function(gameId) {
            playCounts[gameId] = (playCounts[gameId] || 0) + 1;
            savePlayCounts(playCounts);

            const game = findGame(gameId);
            if (game) game.playCount = playCounts[gameId];
            reportCommunityPlay(game);

            window.updateFeaturedPanels();
            window.renderGames(currentDisplayedList);
            trackDailyPlay(gameId);
        }

        /* ================= DAILY PLAY COUNTER (shared, for the Featured rail) =================
           One tiny Firestore doc per game per UTC day: daily_plays/<yyyy-mm-dd>/games/<gameId>.
           A single best-effort increment() on play - never blocks or slows launching a game. */
        function todayKey() { return new Date().toISOString().slice(0, 10); }
        function trackDailyPlay(gameId) {
            Core_whenFirebase().then(fb => {
                const { db, fs } = fb;
                const ref = fs.doc(db, 'daily_plays', todayKey(), 'games', String(gameId));
                return fs.setDoc(ref, { count: fs.increment(1) }, { merge: true });
            }).catch(err => console.warn('Daily play count not recorded:', err));
        }
        // whenFirebase() is defined later in this file (platform helpers block) - this thin
        // wrapper lets trackDailyPlay be declared up here next to registerGamePlay.
        function Core_whenFirebase() { return window.pgWhenFirebase ? window.pgWhenFirebase() : Promise.reject(new Error('Firebase not ready')); }

        // ===== POPULARITY-BASED FEATURED PANEL (STATIC - NO AUTO ROTATION) =====
        // "Top Plays" (hero panel) always shows the single most-played game that has
        // reached the minimum play threshold. It only changes when play counts change.

        // ===== FEATURED HERO — PERMANENTLY FIXED TO GIRL: THE DRILLER =====
        // The homepage hero used to be dynamically rebuilt from whichever game had the most
        // plays (see git history), which meant the title/background/art/play-button could
        // silently swap to a different game as people played things. That behaviour has been
        // removed entirely: the hero's title, description, artwork, background, and rating
        // are now defined once, directly in index.html, and nothing in this file is allowed
        // to touch them again. This function is intentionally inert - kept only so any
        // remaining call sites don't error - and must not be reworked to re-introduce rotation.
        window.renderHeroSlide = function() { /* intentionally disabled - hero is static */ }

        // getRankedGames() itself is still used (see renderGames) to sort the GAMES GRID by
        // popularity - that is unrelated to the hero and is kept working as before.
        window.updateFeaturedPanels = function() { /* intentionally disabled - hero is static */ }

        // 5 colour themes (dots in the header of every page). Remembered on this device; other body classes are kept.
        window.setGlobalTheme = function(themeName, element) {
            const THEMES = ['neon', 'cyan', 'toxic', 'inferno', 'gold'];
            if (!THEMES.includes(themeName)) themeName = 'neon';
            THEMES.forEach(t => document.body.classList.remove('theme-' + t));
            ['blue', 'purple', 'emerald', 'cyber'].forEach(t => document.body.classList.remove('theme-' + t));   // old themes
            document.body.classList.add('theme-' + themeName);
            document.querySelectorAll('.theme-dot').forEach(dot => { const on = dot.dataset.theme === themeName; dot.classList.toggle('active', on); dot.setAttribute('aria-pressed', String(on)); });
            try { localStorage.setItem('pgTheme', themeName); } catch (e) { /* storage blocked */ }
        }

        window.hideAllPages = function() {
            document.querySelectorAll('main').forEach(m => {
                if(m.id !== 'gameplay-page' && m.id !== 'store-page' && m.id !== 'tournament-page' && m.id !== 'subscribe-page' && m.id !== 'homepage-page') return;
                m.style.display = 'none';
            });
            const heroSectionEl1 = document.getElementById('hero-presentation-section');
            if (heroSectionEl1) heroSectionEl1.style.display = 'none';
            
            const gameIframe = document.getElementById('game-canvas');
            const portalBgm = document.getElementById('portal-bgm');
            if (gameIframe) { gameIframe.removeAttribute('srcdoc'); gameIframe.removeAttribute('sandbox'); gameIframe.src = ''; }
            const communityMeta = document.getElementById('community-meta');
            if (communityMeta) communityMeta.classList.add('pg-hidden');
            const socialBox = document.getElementById('pg-social'); if (socialBox) socialBox.classList.add('pg-hidden');
            if (portalBgm) portalBgm.pause();

            exitElementFullscreen();
            unlockGameOrientation();

            activeGameId = null;
        }

        window.openPage = function(pageId) {
            window.hideAllPages();
            
            if(pageId === 'homepage-page') {
                const heroSectionEl2 = document.getElementById('hero-presentation-section');
                if (heroSectionEl2) heroSectionEl2.style.display = 'grid';
                history.pushState({ page: 'home' }, "Home", window.location.pathname);
            } else {
                let urlParam = pageId.replace('-page', '');
                history.pushState({ page: pageId }, pageId, `?page=${urlParam}`);
            }
            
            const page = document.getElementById(pageId);
            if(page) page.style.display = 'block';
            window.scrollTo(0, 0);
        }

        // Tracks the ids/order of the last thing actually painted into #game-grid, so a
        // play-count bump that doesn't change anyone's rank doesn't force a full DOM rebuild.
        let lastRenderedGridKey = null;

        window.renderGames = function(gameList) {
            currentDisplayedList = gameList;
            const rankedList = window.getRankedGames(gameList);

            const gameGrid = document.getElementById('game-grid');
            if (!gameGrid) return;

            if (rankedList.length === 0) {
                lastRenderedGridKey = 'empty';
                gameGrid.innerHTML = '<div class="pg-empty">No games match. Try another category or clear the search.</div>';
                return;
            }

            // Same games, same order as what's already on screen -> nothing to do.
            const gridKey = rankedList.map(g => g.id).join(',');
            if (gridKey === lastRenderedGridKey) return;
            lastRenderedGridKey = gridKey;

            gameGrid.innerHTML = '';
            rankedList.forEach(game => gameGrid.appendChild(createGameCard(game)));
        }

        // Builds one game card. First-party cards keep their original markup (hover GIF preview,
        // stars); community cards show a badge + author and never load anything but their own thumb.
        function createGameCard(game) {
            const card = document.createElement('div');
            card.className = 'game-card';
            card.id = (game.community ? 'cgame-' + game.docId : 'game-' + game.id);
            card.onclick = () => {
                if (window.SHOWCASE_MODE) {
                    // Homepage is a showcase only - never launch a game directly from here.
                    window.location.href = 'games.html#' + card.id;
                } else {
                    window.launchViewport(game.id);
                }
            };

            if (game.community) {
                const thumb = game.thumb
                    ? `<img class="card-thumb-img" src="${esc(game.thumb)}" alt="${esc(game.title)}" width="320" height="240" decoding="async">`
                    : `<div class="pg-thumb-fallback" aria-hidden="true">${esc((game.title || '?').charAt(0).toUpperCase())}</div>`;
                const tourney = (game.tournament && game.tournament.reporting === 'score') ? '<span class="pg-badge t">Tournament ready</span>' : '';
                card.innerHTML = `
                    <div class="card-thumb">
                        ${thumb}
                        <span class="pg-badge">Community</span>${tourney}
                        <div class="play-overlay"><div class="play-btn-circle"></div></div>
                    </div>
                    <div class="card-info">
                        <div class="card-genre">${esc(game.genre)}</div>
                        <div class="card-title">${esc(game.title)}</div>
                        <div class="card-premium-meta"><span class="pg-muted" style="font-size:0.78rem;">by ${esc(game.studio)}</span></div>
                    </div>`;
                return card;
            }

            const safeImg = encodeURI(game.image);
            const safePreview = encodeURI(game.preview || game.image.replace('.png', '.gif'));
            card.innerHTML = `
                <div class="card-thumb">
                    <img class="card-thumb-img" src="${esc(safeImg)}" alt="${esc(game.title)}" loading="lazy" decoding="async" width="400" height="300">
                    <div class="gif-overlay" data-gif="${esc(safePreview)}"></div>
                    <div class="play-overlay"><div class="play-btn-circle"></div></div>
                </div>
                <div class="card-info">
                    <div class="card-genre">${esc(game.genre)}</div>
                    <div class="card-title">${esc(game.title)}</div>
                    <div class="card-premium-meta">
                        <div class="card-stars-layer">★★★★★</div>
                    </div>
                </div>
            `;

            // The preview GIF is never fetched on render - only on genuine hover/touch
            // intent, and only once per card (result is cached by the browser after that).
            const gifLayer = card.querySelector('.gif-overlay');
            let gifRequested = false;
            const loadGifOnce = () => {
                if (gifRequested) return;
                gifRequested = true;
                gifLayer.style.backgroundImage = `url('${gifLayer.dataset.gif}')`;
            };
            card.addEventListener('mouseenter', loadGifOnce, { once: true });
            card.addEventListener('touchstart', loadGifOnce, { once: true, passive: true });
            return card;
        }

        /* ================= MOBILE / TABLET AUTO FULLSCREEN + ORIENTATION ================= */

        // Splits touch devices into 'mobile' (phones) vs 'tablet' by viewport size, and anything
        // without touch is treated as 'desktop'. This drives which fullscreen UI/behavior applies:
        // desktop and tablet get automatic fullscreen + the manual Fullscreen button, while phones
        // additionally get a forced landscape lock and the small transparent exit-fullscreen button.
        function getDeviceCategory() {
            const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
            if (!hasTouch) return 'desktop';
            const smallestSide = Math.min(window.innerWidth, window.innerHeight);
            return smallestSide < 768 ? 'mobile' : 'tablet';
        }

        // Cross-browser read of whichever element is currently fullscreen, if any.
        function getFullscreenElement() {
            return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;
        }

        function requestElementFullscreen(el) {
            if (!el) return Promise.resolve();
            const request = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (request) {
                try {
                    const result = request.call(el);
                    return result && result.catch ? result : Promise.resolve();
                } catch (e) {
                    return Promise.reject(e);
                }
            }
            return Promise.resolve();
        }

        function exitElementFullscreen() {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exit && (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement)) {
                try { exit.call(document); } catch (e) { /* ignore */ }
            }
        }

        function lockGameOrientation(orientation) {
            const target = orientation === 'portrait' ? 'portrait' : 'landscape';
            try {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock(target).catch(() => { /* lock not permitted on this browser/device */ });
                } else if (screen.lockOrientation) {
                    screen.lockOrientation(target);
                } else if (screen.msLockOrientation) {
                    screen.msLockOrientation(target);
                }
            } catch (e) { /* Screen Orientation API unavailable - ignore silently */ }
        }

        function unlockGameOrientation() {
            try {
                if (screen.orientation && screen.orientation.unlock) {
                    screen.orientation.unlock();
                } else if (screen.unlockOrientation) {
                    screen.unlockOrientation();
                }
            } catch (e) { /* ignore */ }
        }

        // Shows/hides the persistent Fullscreen button for the current device: visible on
        // desktop and tablet (below the game), hidden on phones (which use the small
        // transparent exit-fullscreen overlay instead while fullscreen is active).
        function updateFullscreenControlsForDevice(category) {
            const desktopControls = document.getElementById('game-fullscreen-controls');
            if (desktopControls) { desktopControls.style.display = 'flex'; desktopControls.classList.toggle('is-mobile', category === 'mobile'); }   // phones get Fullscreen + Share too
        }

        // Keeps the Fullscreen button label/icon and the mobile exit-fullscreen overlay in sync
        // with the browser's actual fullscreen state - the single source of truth for this UI.
        function onFullscreenChange() {
            const isFullscreen = !!getFullscreenElement();

            const icon = document.getElementById('fullscreen-btn-icon');
            const label = document.getElementById('fullscreen-btn-label');
            if (icon && label) {
                icon.className = isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
                label.textContent = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
            }

            // Never leave the device stuck in a locked orientation once fullscreen is exited;
            // re-apply the game's orientation if the player re-enters fullscreen mid-game.
            if (getDeviceCategory() === 'mobile') {
                const activeGame = activeGameId != null ? findGame(activeGameId) : null;
                if (!isFullscreen) unlockGameOrientation();
                else if (activeGame) lockGameOrientation(activeGame.orientation || 'landscape');
            }

            const mobileExitBtn = document.getElementById('mobile-exit-fullscreen-btn');
            if (mobileExitBtn) {
                const showOnMobile = isFullscreen && getDeviceCategory() === 'mobile';
                mobileExitBtn.classList.toggle('visible', showOnMobile);
            }
        }
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
            document.addEventListener(evt, onFullscreenChange);
        });

        // Automatically fullscreens the game viewport on launch for every device type. Phones
        // additionally get a forced landscape lock so the game fills the horizontal screen.
        // If the browser blocks automatic fullscreen (security/permissions policy), this fails
        // gracefully - the game still opens normally, and the manual Fullscreen button (or the
        // mobile exit-fullscreen overlay once fullscreen is entered) still lets the player
        // control fullscreen themselves.
        window.applyFullscreenForGame = function(game) {
            const container = document.getElementById('game-container-element');
            const category = getDeviceCategory();
            updateFullscreenControlsForDevice(category);

            // The lock is async (after fullscreen resolves), so re-check the game is still open -
            // otherwise a quick Back tap could leave the lock applied to the library page.
            const lockIfStillPlaying = () => {
                if (category === 'mobile' && activeGameId === game.id) lockGameOrientation(game.orientation || 'landscape');
            };
            requestElementFullscreen(container).then(lockIfStillPlaying).catch(lockIfStillPlaying);
        }

        // historyMode controls how the URL/history entry is written:
        //   'push'    - a genuine new launch (card click, hero/spotlight button) - default.
        //   'replace' - restoring state from the URL on initial page load (no new back-entry).
        //   'none'    - triggered by the browser's own back/forward (popstate already updated history).
        window.launchViewport = function(gameId, historyMode) {
            historyMode = historyMode || 'push';

            const game = findGame(gameId);
            if (!game) return;
            const me = window.pgFB && window.pgFB.auth.currentUser;
            if (game.community && me && game.ownerUid === me.uid && !window.pgOwnGameNoAds) {
                if (!window.pgAdsDecided && window.adsbygoogle && window.adsbygoogle.pauseAdRequests === 1) window.pgBlockAdsForOwner();   // ads still held: keep them off
                else { window.location.href = 'games.html?play=' + playParam(game); return; }   // ads already shown: reopen the page without ads
            }

            const gameplayPage = document.getElementById('gameplay-page');
            const alreadyRunning = activeGameId === gameId && gameplayPage && gameplayPage.style.display === 'block';

            // This exact game is already open and running - do NOT touch the iframe again.
            // Reassigning iframe.src (even to the same URL) forces a real reload, which is
            // exactly the "game restarts by itself" symptom this guards against.
            if (alreadyRunning) {
                if (historyMode === 'push') {
                    history.pushState({ page: 'game', id: gameId }, game.title, `?play=${playParam(game)}`);
                }
                return;
            }

            // Debounce lock: blocks a second launch (e.g. a rapid double-click on a card,
            // or two triggers arriving back-to-back) from sneaking in before the guard
            // above has anything to compare against.
            if (isLaunchingGame) return;
            isLaunchingGame = true;
            setTimeout(() => { isLaunchingGame = false; }, 400);

            activeGameId = gameId;

            window.hideAllPages();
            // hideAllPages() just reset activeGameId to null - restore it now that we're
            // actually committed to opening this game.
            activeGameId = gameId;

            gameplayPage.style.display = 'block';
            window.scrollTo(0, 0);

            // Start the game loading as the very first thing we do, before any of the
            // (comparatively unimportant) text/detail panel updates below.
            const gameIframe = document.getElementById('game-canvas');
            if (game.community) { window.pgLoadCommunityIntoFrame(game, gameIframe, gameId); }
            else { gameIframe.src = encodeURI(game.url); }

            // Apply this game's intended orientation to the container. This controls the
            // container's aspect ratio only - it never touches the iframe's own internal
            // coordinates/canvas, so game input stays correct.
            const containerEl = document.getElementById('game-container-element');
            if (containerEl) {
                const orientation = game.orientation === 'portrait' ? 'portrait' : 'landscape';
                containerEl.classList.remove('orientation-landscape', 'orientation-portrait');
                containerEl.classList.add('orientation-' + orientation);
            }

            document.getElementById('current-game-title').innerText = game.title;
            const setIfPresent = (id, value) => { const el = document.getElementById(id); if (el) { if (game.community) el.textContent = value; else el.innerHTML = value; } };
            setIfPresent('current-game-studio', game.studio);
            setIfPresent('current-game-releasedate', game.releaseDate);
            setIfPresent('current-game-platform', game.platform);
            setIfPresent('current-game-technology', game.technology);
            setIfPresent('current-game-rating', game.rating);
            setIfPresent('current-game-howtoplay', game.howToPlay);
            setIfPresent('current-game-controls', game.controls);

            window.pgShowCommunityMeta(game);

            const aiBox = document.getElementById('current-game-aiprompt');
            const aiContainer = document.getElementById('ai-prompt-container');
            if (aiBox) {
                aiBox.dataset.promptText = game.aiPrompt || '';
            }

            if (aiContainer) {
                if (game.aiPrompt && game.aiPrompt !== '') {
                    aiContainer.style.display = 'block';
                    window.updatePromptVisibility();
                } else {
                    aiContainer.style.display = 'none';
                }
            }

            if (historyMode === 'push') {
                history.pushState({ page: 'game', id: gameId }, game.title, `?play=${playParam(game)}`);
            } else if (historyMode === 'replace') {
                history.replaceState({ page: 'game', id: gameId }, game.title, `?play=${playParam(game)}`);
            }
            // historyMode === 'none': popstate already updated the URL/history for us.

            const portalBgm = document.getElementById('portal-bgm');
            if(game.bgm) {
                portalBgm.src = encodeURI(game.bgm);
                portalBgm.play().catch(e => console.log('Autoplay handled.', e));
            }

            window.applyFullscreenForGame(game);

            // Play-count tracking / Top Plays / Top Categories / grid re-render are pure
            // bookkeeping - defer them so they can never delay the game becoming visible.
            setTimeout(() => window.registerGamePlay(gameId), 0);
        }

        window.goHome = function() {
            window.openPage('homepage-page');
        }

        window.updatePromptVisibility = function() {
            const aiBox = document.getElementById('current-game-aiprompt');
            const hiddenMsg = document.getElementById('ai-prompt-hidden-msg');
            if (!aiBox || !hiddenMsg) return;
            if(window.isLoggedIn) {
                aiBox.innerText = aiBox.dataset.promptText;
                aiBox.style.display = 'block';
                hiddenMsg.style.display = 'none';
            } else {
                aiBox.style.display = 'none';
                hiddenMsg.style.display = 'block';
            }
        }

        window.openModal = function(modalId) { 
            const m = document.getElementById(modalId);
            if(m) {
                m.style.display = 'flex';
                setTimeout(() => m.classList.add('active'), 10);
            }
        }
        
        window.closeModals = function() { 
            document.querySelectorAll('.modal-overlay').forEach(m => {
                m.classList.remove('active');
                setTimeout(() => m.style.display = 'none', 300);
            });
        }

        window.toggleMute = function() {
            const bgm = document.getElementById('portal-bgm');
            const muteBtn = document.getElementById('mute-btn');
            bgm.muted = !bgm.muted;
            muteBtn.innerHTML = bgm.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
        }

        // Manual toggle used by both the desktop/tablet Fullscreen button and the mobile
        // exit-fullscreen overlay. Uses the vendor-fallback helpers so it works consistently
        // across browsers; the actual button/overlay UI updates itself via onFullscreenChange.
        window.toggleFullscreen = function() {
            const container = document.getElementById('game-container-element');
            if (!getFullscreenElement()) {
                requestElementFullscreen(container);
            } else {
                exitElementFullscreen();
            }
        }

        // Share the game that is playing right now (window mode): native share sheet on phones, copy the link elsewhere.
        window.pgShareGame = async function() {
            const game = activeGameId != null ? findGame(activeGameId) : null;
            const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'games.html' + (game ? '?play=' + playParam(game) : '');
            const name = game ? game.title : 'PixelGaunt', msg = document.getElementById('game-share-msg');
            const say = t => { if (msg) { msg.textContent = t; clearTimeout(msg._t); msg._t = setTimeout(() => { msg.textContent = ''; }, 5000); } };
            try { if (navigator.share && window.isSecureContext) { await navigator.share({ title: name + ' on PixelGaunt', text: 'Play ' + name + ' free on PixelGaunt', url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
            try { await navigator.clipboard.writeText(url); say('Link copied - paste it anywhere to share.'); } catch (e) { prompt('Copy this link to share the game:', url); }
        };

        window.inviteFriends = function() {
            const shareData = { title: 'Pixel Gaunt', text: 'Check out this awesome game on Pixel Gaunt!', url: window.location.href };
            if (navigator.share && window.isSecureContext) {
                navigator.share(shareData).catch(err => console.error("Share failed:", err));
            } else {
                alert("Share link copied: " + window.location.href);
            }
        }

        window.openPageModal = function(title, contentId) {
            document.getElementById('pg-info-title').innerText = title;
            document.getElementById('pg-info-body').innerHTML = document.getElementById(contentId).innerHTML;
            document.getElementById('pg-info-modal').classList.add('active-modal');
        }

        window.closePageModal = function() {
            document.getElementById('pg-info-modal').classList.remove('active-modal');
        }

        /* ================= COMMUNITY GAMES (published through PixelGaunt Publish) ================= */
        // Every community game runs in a sandboxed iframe with NO allow-same-origin: the game gets an
        // opaque origin, so it cannot read pixelgaunt.com storage, cookies, Firebase sessions or this
        // page's DOM, and it cannot navigate the top window, open popups, submit forms or download files.
        window.PG_SANDBOX = 'allow-scripts allow-pointer-lock';

        function whenFirebase() {
            if (window.pgFB) return Promise.resolve(window.pgFB);
            return new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('Firebase did not load')), 15000);
                document.addEventListener('pg-firebase-ready', () => { clearTimeout(t); resolve(window.pgFB); }, { once: true });
            });
        }
        window.pgWhenFirebase = whenFirebase;

        function mapCommunityDoc(id, d) {
            return {
                id: 'c_' + id, docId: id, community: true,
                studio: d.ownerName || 'Community', title: d.title || 'Untitled', genre: d.genre || 'Arcade',
                controls: d.controls || '', howToPlay: d.description || '', rating: '', releaseDate: '',
                platform: 'Web Browser', technology: 'HTML5 Web Technologies.', aiPrompt: '',
                thumb: d.thumb || '', orientation: d.orientation === 'portrait' ? 'portrait' : 'landscape',
                tournament: d.tournament || null, chunkCount: d.chunkCount || 0, ownerUid: d.ownerUid || '', liveVersion: d.liveVersion || '',
                createdMs: (d.createdAt && d.createdAt.toMillis) ? d.createdAt.toMillis() : 0,
                playCount: playCounts['c_' + id] || 0
            };
        }

        let communityLoaded = false, communityFailed = false, communityPromise = null, communityHashDone = false;

        // Reads at most 24 published games (metadata + small thumbnail only) and caches them for the
        // session, so browsing costs almost no Firestore reads. Game files are fetched only on play.
        window.pgLoadCommunityGames = function(force) {
            pingReviewSync();
            if (communityPromise && !force) return communityPromise;
            communityPromise = (async () => {
                if (!force) {
                    try {
                        const cached = JSON.parse(sessionStorage.getItem('pgCommunityList') || 'null');
                        if (cached && Date.now() - cached.t < 300000) {
                            window.communityGames = cached.list;
                            communityLoaded = true; renderCommunity();
                            return window.communityGames;
                        }
                    } catch (e) { /* cache unusable - fall through to a real read */ }
                }
                const fb = await whenFirebase();
                const { collection, query, where, limit, getDocs } = fb.fs;
                const snap = await getDocs(query(collection(fb.db, 'community_games'), where('status', '==', 'published'), limit(24)));
                const list = snap.docs.map(d => mapCommunityDoc(d.id, d.data())).sort((a, b) => b.createdMs - a.createdMs);
                window.communityGames = list;
                communityLoaded = true;
                try { sessionStorage.setItem('pgCommunityList', JSON.stringify({ t: Date.now(), list })); } catch (e) { /* storage full/unavailable */ }
                renderCommunity();
                return list;
            })().catch(err => {
                console.warn('Community games unavailable:', err);
                communityLoaded = true; communityFailed = true;
                renderCommunity();
                return [];
            });
            return communityPromise;
        };

        // Lets the review service carry out approvals/rejections you made in the Firebase console (cheap, once per page).
        let syncPinged = false;
        function pingReviewSync() {
            if (syncPinged || !window.PG_REVIEW_ENDPOINT) return; syncPinged = true;
            try {
                fetch(window.PG_REVIEW_ENDPOINT + '/sync', { mode: 'cors' }).then(r => r.json()).then(r => {
                    if (r && r.changed > 0) { try { sessionStorage.removeItem('pgCommunityList'); } catch (e) {} if (document.getElementById('community-grid')) window.pgLoadCommunityGames(true); }   // a game was just published: show it now
                    if (r && r.plansChanged > 0 && window.pgReloadPlan) window.pgReloadPlan();   // a payment you approved: the subscription is now active
                }).catch(() => {});
            } catch (e) { /* offline */ }
        }

        // Every page: let the review service carry out what you approved in Firebase (games, payments). Throttled server-side.
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(pingReviewSync, 1500)); else setTimeout(pingReviewSync, 1500);

        // Community bug report box (games.html)
        (function wireBugBox() {
            const btn = document.getElementById('bug-send'); if (!btn) return;
            btn.addEventListener('click', async () => {
                const status = document.getElementById('bug-status'), text = document.getElementById('bug-text').value.trim(), game = document.getElementById('bug-game').value.trim();
                if (!window.isLoggedIn) { window.openModal('login-modal'); status.textContent = 'Please log in to send a report.'; return; }
                if (!text) { status.textContent = 'Please describe the problem.'; return; }
                btn.disabled = true; status.textContent = 'Sending...';
                try {
                    const fb = await whenFirebase();
                    await fb.fs.addDoc(fb.fs.collection(fb.db, 'bug_reports'), { game: game.slice(0, 120), report: text.slice(0, 1000), status: 'open', date: new Date(), uid: fb.auth.currentUser.uid, area: 'community', page: 'games' });
                    document.getElementById('bug-text').value = ''; document.getElementById('bug-game').value = '';
                    status.textContent = 'Thank you! Your report was sent to our team.';
                } catch (e) { console.error('Bug report failed:', e); status.textContent = 'Could not send. Please email pixelgaunt@gmail.com.'; }
                finally { btn.disabled = false; }
            });
        })();

        // ---- Live activity feed (home page) ----
        (function liveFeed() {
            const list = document.getElementById('live-list'); if (!list || !window.PG_REVIEW_ENDPOINT) return;
            const ago = t => { const s = Math.max(1, Math.round((Date.now() - Date.parse(t)) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };
            const line = e => { const w = esc(e.who), g = esc(e.game);
                return { new_user: `👋 <b>${w}</b> just joined PixelGaunt - welcome!`, online: `🟢 <b>${w}</b> is online`, playing: `🎮 <b>${w}</b> is playing <b>${g}</b>`,
                    left: `🚪 <b>${w}</b> left - see you soon`, subscribed: `⭐ <b>${w}</b> just subscribed`, uploaded: `🚀 <b>${w}</b> uploaded a new game for review`,
                    merch: `👕 <b>${w}</b> ordered a custom ${g || 'merch item'}`, donated: `💖 <b>${w}</b> donated to PixelGaunt - thank you!`, joined_paid: `🏆 <b>${w}</b> joined the paid tournament <b>${g}</b>` }[e.type] || ''; };
            const promoLi = n => n.social ? `<li class="pg-live-promo"><span>${window.pgSocialNote(n.social)}</span><small>follow</small></li>`
                : `<li class="pg-live-promo"><span><a href="${n.chat ? '#' : n.href}"${n.chat ? ' data-chat="1"' : ''}>${n.ico} ${n.html}</a></span><small>${n.chat ? 'chat' : 'promo'}</small></li>`;
            async function load() {
                try {
                    const d = await (await fetch(window.PG_REVIEW_ENDPOINT + '/activity')).json();
                    const items = (d.items || []).filter(line).slice(0, 14);
                    const pr = window.pgPromoNotes ? window.pgPromoNotes() : [], rows = [];
                    items.forEach((e, k) => { rows.push(`<li><span>${line(e)}</span><small>${ago(e.at)}</small></li>`); if (k % 2 === 1 && pr.length) rows.push(promoLi(pr.shift())); });
                    pr.slice(0, items.length ? 2 : 4).forEach(n => rows.push(promoLi(n)));
                    if (!items.length) rows.unshift('<li class="pg-muted">Quiet right now - be the first to play!</li>');
                    list.innerHTML = rows.join('');
                    list.querySelectorAll('[data-chat]').forEach(a => a.onclick = ev => { ev.preventDefault(); if (window.pgOpenChat) window.pgOpenChat(); });
                    document.getElementById('live-playing').textContent = d.playingNow ? '🎮 ' + d.playingNow + ' playing right now' : '';
                } catch (e) { list.innerHTML = '<li class="pg-muted">Live activity is not available right now.</li>' + (window.pgPromoNotes ? window.pgPromoNotes().slice(0, 4).map(promoLi).join('') : ''); list.querySelectorAll('[data-chat]').forEach(a => a.onclick = ev => { ev.preventDefault(); if (window.pgOpenChat) window.pgOpenChat(); }); }
            }
            load(); setInterval(() => { if (!document.hidden) load(); }, 45000);
        })();

        // ---- Presence heartbeat for the live feed: "still here" every 3 minutes while a page is open and visible.
        // "Left" is decided by the review service when the heartbeats stop (refresh / page changes don't count).
        (function heartbeat() {
            const ping = () => {
                const u = window.pgFB && window.pgFB.auth.currentUser;
                if (!u || document.hidden || !window.PG_REVIEW_ENDPOINT) return;
                u.getIdToken().then(t => fetch(window.PG_REVIEW_ENDPOINT + '/ping', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: t }) })).catch(() => {});
            };
            setInterval(ping, 3 * 60e3);
            window.addEventListener('pg-auth', () => setTimeout(ping, 2000));
            document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
        })();

        function renderCommunity() {
            const shelf = document.getElementById('community-shelf');
            const grid = document.getElementById('community-grid');
            if (!shelf || !grid) return;
            const isLibrary = !!document.getElementById('game-canvas');
            if (!communityLoaded) {
                if (isLibrary) grid.innerHTML = '<div class="pg-empty">Loading community games...</div>';
                return;
            }
            const q = searchQuery.trim().toLowerCase();
            const list = window.communityGames.filter(g =>
                (activeGenre === 'All' || g.genre === activeGenre) && (!q || (g.title + ' ' + g.genre + ' ' + g.studio).toLowerCase().includes(q)));
            if (!list.length) {
                if (!isLibrary) { shelf.classList.add('pg-hidden'); return; }
                shelf.classList.remove('pg-hidden');
                grid.innerHTML = communityFailed
                    ? '<div class="pg-empty">Community games are unavailable right now. Try again later.</div>'
                    : (window.communityGames.length
                        ? '<div class="pg-empty">No community games match.</div>'
                        : '<div class="pg-empty">No community games yet. <a href="publish.html">Publish the first one.</a></div>');
                return;
            }
            shelf.classList.remove('pg-hidden');
            grid.innerHTML = '';
            list.forEach(g => grid.appendChild(createGameCard(g)));

            // Arriving from a homepage click (games.html#cgame-<id>): scroll to the card, never auto-launch.
            if (!communityHashDone && window.location.hash.startsWith('#cgame-')) {
                communityHashDone = true;
                const card = document.getElementById(window.location.hash.slice(1));
                if (card) requestAnimationFrame(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('showcase-highlight');
                    setTimeout(() => card.classList.remove('showcase-highlight'), 2200);
                });
            }
        }

        const pgFrameDoc = msg => '<!DOCTYPE html><meta charset="utf-8"><body style="margin:0;background:#06080d;color:#cbd5e1;font:16px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box">' + esc(msg) + '</body>';

        // Game files are stored as gzip chunks (Firestore Spark plan; Cloud Storage needs the paid Blaze plan).
        const communityHtmlCache = new Map();
        window.pgFetchCommunityHtml = async function(game) {
            if (communityHtmlCache.has(game.docId)) return communityHtmlCache.get(game.docId);
            if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to unpack community games. Please update it.');
            const fb = await whenFirebase();
            const { collection, getDocs } = fb.fs;
            if (game.liveVersion) {   // self-contained play.html stored as text pieces (every image/sound/script inside)
                const vs = await getDocs(collection(fb.db, 'community_games', game.docId, 'versions', game.liveVersion, 'chunks'));
                const vp = vs.docs.map(d => d.data()).sort((a, b) => a.i - b.i);
                if (!vp.length || (game.chunkCount && vp.length !== game.chunkCount)) throw new Error('This game\'s files are incomplete.');
                const page = vp.map(p => p.s).join('');
                communityHtmlCache.set(game.docId, page);
                return page;
            }
            const snap = await getDocs(collection(fb.db, 'community_games', game.docId, 'chunks'));
            const parts = snap.docs.map(d => d.data()).sort((a, b) => a.i - b.i);
            if (!parts.length || (game.chunkCount && parts.length !== game.chunkCount)) throw new Error('This game\'s files are incomplete.');
            const bytes = parts.map(p => p.b.toUint8Array());
            const total = bytes.reduce((n, b) => n + b.length, 0);
            const all = new Uint8Array(total);
            let off = 0;
            bytes.forEach(b => { all.set(b, off); off += b.length; });
            const html = await new Response(new Blob([all]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
            communityHtmlCache.set(game.docId, html);
            return html;
        };

        // Adds the platform's Content-Security-Policy to a community game document. The player applies
        // it at play time (not only at publish time), so a tampered upload cannot skip it. Assets must be
        // bundled (data:/blob:); only a few well-known CDNs may serve scripts; the network is closed
        // except for the multiplayer host a developer explicitly declared.
        window.pgHarden = function(html, opts) {
            const host = opts && /^[a-z0-9.-]+(:\d+)?$/i.test(opts.connect || '') ? opts.connect : '';
            const csp = [
                "default-src 'none'",
                "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
                "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
                "img-src data: blob:", "media-src data: blob:",
                "font-src data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
                "connect-src data: blob:" + (host ? ' https://' + host + ' wss://' + host : ''),
                "worker-src blob:", "frame-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"
            ].join('; ');
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const meta = doc.createElement('meta');
            meta.setAttribute('http-equiv', 'Content-Security-Policy');
            meta.setAttribute('content', csp);
            doc.head.insertBefore(meta, doc.head.firstChild);
            return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
        };

        window.pgLoadCommunityIntoFrame = async function(game, frame, gameId) {
            frame.setAttribute('sandbox', window.PG_SANDBOX);
            frame.setAttribute('srcdoc', pgFrameDoc('Loading game...'));
            try {
                const html = await window.pgFetchCommunityHtml(game);
                if (activeGameId !== gameId) return; // player left while it was loading
                frame.setAttribute('srcdoc', window.pgHarden(html, { connect: game.tournament && game.tournament.server }));
            } catch (err) {
                console.warn('Community game failed to load:', err);
                if (activeGameId === gameId) frame.setAttribute('srcdoc', pgFrameDoc(err.message || 'This game could not be loaded.'));
            }
        };

        // ---- Likes / share / comments under a community game (handled by the review service) ----
        async function pgLoadSocial(game) {
            const box = document.getElementById('pg-social'); if (!box || !window.PG_REVIEW_ENDPOINT) return;
            box.classList.remove('pg-hidden');
            const ep = window.PG_REVIEW_ENDPOINT, id = game.docId, $s = x => document.getElementById(x);
            const auth = async () => { const u = window.pgFB && window.pgFB.auth.currentUser; return u ? { Authorization: 'Bearer ' + await u.getIdToken() } : {}; };
            const ago = t => { const s2 = Math.max(1, Math.round((Date.now() - Date.parse(t)) / 1000)); return s2 < 3600 ? Math.max(1, Math.round(s2 / 60)) + ' min ago' : s2 < 86400 ? Math.round(s2 / 3600) + ' h ago' : new Date(t).toLocaleDateString(); };
            async function refresh() {
                try {
                    const d = await (await fetch(ep + '/social?game=' + encodeURIComponent(id), { headers: await auth() })).json();
                    $s('pg-like-count').textContent = d.likes || 0;
                    $s('pg-like-btn').setAttribute('aria-pressed', String(!!d.liked)); $s('pg-like-label').textContent = d.liked ? 'Liked' : 'Like';
                    $s('pg-comments').innerHTML = (d.comments || []).length ? d.comments.map(c => `<li>${c.photo ? `<img src="${esc(c.photo)}" alt="" class="pg-c-av">` : '<span class="pg-c-av"></span>'}<div><b>${esc(c.name)}</b> <small>${ago(c.at)}</small><p>${esc(c.text)}</p></div></li>`).join('')
                        : '<li class="pg-muted">No comments yet - be the first.</li>';
                } catch (e) { $s('pg-comments').innerHTML = '<li class="pg-muted">Comments are not available right now.</li>'; }
            }
            $s('pg-like-btn').onclick = async () => {
                if (!window.isLoggedIn) return window.openModal('login-modal');
                try { const r = await fetch(ep + '/like', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, await auth()), body: JSON.stringify({ gameId: id }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); refresh(); }
                catch (e) { $s('pg-comment-msg').textContent = e.message || 'Could not like right now.'; }
            };
            $s('pg-share-btn').onclick = async () => {
                const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'games.html?play=c-' + encodeURIComponent(id), title = game.title + ' on PixelGaunt';
                try { if (navigator.share) { await navigator.share({ title, text: 'Play ' + game.title + ' free on PixelGaunt', url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
                try { await navigator.clipboard.writeText(url); $s('pg-comment-msg').textContent = 'Link copied - paste it anywhere to share.'; } catch (e) { prompt('Copy this link:', url); }
            };
            $s('pg-comment-form').onsubmit = async e => {
                e.preventDefault();
                if (!window.isLoggedIn) return window.openModal('login-modal');
                const t = $s('pg-comment-text').value.trim(); if (t.length < 2) return;
                const msg = $s('pg-comment-msg'); msg.textContent = 'Posting...';
                try { const r = await fetch(ep + '/comment', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, await auth()), body: JSON.stringify({ gameId: id, text: t }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error);
                    $s('pg-comment-text').value = ''; msg.textContent = ''; refresh(); }
                catch (err) { msg.textContent = err.message || 'Could not post.'; }
            };
            refresh();
        }

        window.pgShowCommunityMeta = function(game) {
            const meta = document.getElementById('community-meta');
            if (!meta) return;
            if (!game.community) { meta.classList.add('pg-hidden'); return; }
            document.getElementById('community-author').textContent = game.studio;
            meta.classList.remove('pg-hidden');
            pgLoadSocial(game);
            document.getElementById('report-community-btn').onclick = async () => {
                if (!window.isLoggedIn) return window.openModal('login-modal');
                const text = prompt('What is wrong with this game?');
                if (!text || !text.trim()) return;
                try {
                    const fb = await whenFirebase();
                    await fb.fs.addDoc(fb.fs.collection(fb.db, 'bug_reports'), { game: String(game.title).slice(0, 120), communityId: game.docId, report: text.trim().slice(0, 1000), status: 'open', date: new Date(), uid: fb.auth.currentUser.uid, area: 'game' });
                    alert('Thanks. Your report was sent.');
                } catch (err) {
                    console.error('Report failed:', err);
                    alert('Could not send the report. Please email pixelgaunt@gmail.com.');
                }
            };
        };

        // Release the held ads unless the logged-in person is the developer of the community game in the URL.
        function decideAds(playQuery) {
            if (!(window.adsbygoogle && window.adsbygoogle.pauseAdRequests === 1)) { window.pgAdsDecided = true; return; }   // page does not hold ads
            const ownId = playQuery && playQuery.indexOf('c-') === 0 ? playQuery.slice(2) : null;
            if (!ownId) { window.pgReleaseAds(); return; }
            const check = async (user) => {
                if (window.pgAdsDecided) return;
                if (!user) { window.pgReleaseAds(); return; }
                try {
                    let owner = null;
                    const list = await window.pgLoadCommunityGames();   // public list of published games (has ownerUid)
                    const g = (list || []).find(x => x.docId === ownId);
                    if (g) owner = g.ownerUid;
                    else { const fb = await whenFirebase(); const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'community_games', ownId)); if (snap.exists()) owner = snap.data().ownerUid; }
                    if (owner && owner === user.uid) window.pgBlockAdsForOwner(); else window.pgReleaseAds();
                } catch (e) { window.pgReleaseAds(); }
            };
            if (window.pgFB && window.pgFB.auth.currentUser) check(window.pgFB.auth.currentUser);
            window.addEventListener('pg-auth', e => check(e.detail && e.detail.user));
            setTimeout(() => { if (!window.pgAdsDecided) window.pgReleaseAds(); }, 5000);   // never hold ads longer than 5 s
        }

        async function openCommunityById(docId) {
            try {
                const fb = await whenFirebase();
                const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'community_games', docId));
                if (!snap.exists() || snap.data().status !== 'published') throw new Error('not published');
                const game = mapCommunityDoc(snap.id, snap.data());
                if (!window.communityGames.some(g => g.id === game.id)) window.communityGames.push(game);
                window.launchViewport(game.id, 'replace');
            } catch (err) {
                console.warn('Community game not available:', err);
                alert('That community game is not available.');
                window.goHome();
            }
        }

        /* ================= FEATURED RAIL, CATEGORIES, SEARCH ================= */
        // "Trending" rail = a fixed, hand-picked list (in this order). The `label` only changes the
        // text on the rail tile; the game's own title in the library stays as it is.
        // To change the rail, edit this list (ids are the `id` values in the games array above).
        const TRENDING = [
            { id: 16, label: 'Girl The Driller (Demo 2D)' },
            { id: 17, label: 'Girl The Driller (Demo 2.5D)' },
            { id: 15 },   // Tetris Reimagine
            { id: 12 },   // Serpent Relic
            { id: 7 }     // Mimi Merge
        ];
        const GENRE_ICONS = { Arcade: 'fa-gamepad', Puzzle: 'fa-puzzle-piece', Racing: 'fa-flag-checkered', Action: 'fa-bolt', Adventure: 'fa-compass', Card: 'fa-clone' };
        let activeGenre = 'All';
        let searchQuery = '';

        function gameHref(g) { return 'games.html#' + (g.community ? 'cgame-' + g.docId : 'game-' + g.id); }

        function paintFeatured(list) {
            const rail = document.getElementById('featured-strip');
            if (!rail) return;
            rail.innerHTML = '';
            list.forEach(({ g, label }) => {
                const title = label || g.title;
                const a = document.createElement('a');
                a.className = 'pg-tile';
                a.href = gameHref(g);
                a.setAttribute('aria-label', title + ', ' + g.genre + ' game');
                const img = g.community ? (g.thumb ? encodeURI(g.thumb) : '') : encodeURI(g.image);
                a.innerHTML = (img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" width="310" height="194">` : `<div class="pg-thumb-fallback" aria-hidden="true">${esc((title || '?').charAt(0).toUpperCase())}</div>`)
                    + `<div class="pg-tile-info"><b>${esc(title)}</b><span>${esc(g.genre)}</span></div>`;
                rail.appendChild(a);
            });
        }

        function renderFeatured() {
            paintFeatured(TRENDING.map(t => ({ g: games.find(g => g.id === t.id), label: t.label })).filter(t => t.g));
        }

        function syncCategoryButtons() {
            document.querySelectorAll('#category-bar .pg-cat').forEach(b => b.setAttribute('aria-pressed', b.dataset.genre === activeGenre ? 'true' : 'false'));
        }

        function renderCategories() {
            const bar = document.getElementById('category-bar');
            if (!bar) return;
            const counts = {};
            games.forEach(g => { counts[g.genre] = (counts[g.genre] || 0) + 1; });
            const items = [['All', games.length]].concat(Object.keys(counts).sort().map(k => [k, counts[k]]));
            bar.innerHTML = '';
            items.forEach(([name, n]) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'pg-cat';
                b.dataset.genre = name;
                b.innerHTML = `<i class="fas ${GENRE_ICONS[name] || 'fa-star'}" aria-hidden="true"></i><span>${esc(name === 'All' ? 'All games' : name)}<small>${n} ${n === 1 ? 'game' : 'games'}</small></span>`;
                b.addEventListener('click', () => {
                    activeGenre = name;
                    syncCategoryButtons();
                    applyGameFilters();
                });
                bar.appendChild(b);
            });
            syncCategoryButtons();
        }

        function applyGameFilters() {
            const q = searchQuery.trim().toLowerCase();
            const list = games.filter(g => (activeGenre === 'All' || g.genre === activeGenre) && (!q || (g.title + ' ' + g.genre).toLowerCase().includes(q)));
            window.renderGames(list);
            renderCommunity();
        }

        function initSearch() {
            const input = document.getElementById('game-search');
            if (!input) return;
            let timer;
            input.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => { searchQuery = input.value; applyGameFilters(); }, 120);
            });
        }

        /* ================= LAZY PLATFORM MODULES (Publish, Tournaments, Creator Lab) ================= */
        // platform.js is only requested when one of those sections is about to scroll into view, so the
        // first paint of the homepage never pays for the validator, tournament or creator code.
        window.pgLoadPlatform = function() {
            if (!window._pgPlatformPromise) {
                window._pgPlatformPromise = new Promise((resolve, reject) => {
                    const tag = document.createElement('script');
                    tag.src = 'platform.js?v=20261012';   // version tag: browsers always load the newest file after an update
                    tag.async = true;
                    tag.onload = () => resolve(window.PG);
                    tag.onerror = () => { window._pgPlatformPromise = null; reject(new Error('platform.js failed to load')); };
                    document.head.appendChild(tag);
                });
            }
            return window._pgPlatformPromise;
        };

        function initLazyModules() {
            const roots = document.querySelectorAll('[data-pg-module]');
            if (!roots.length) return;
            const load = () => window.pgLoadPlatform().catch(() => {
                roots.forEach(r => {
                    const box = r.querySelector('[id$="-root"]');
                    if (box) box.innerHTML = '<div class="pg-empty">This section could not be loaded. Check your connection and <a href="#" class="pg-retry">try again</a>.</div>';
                });
                document.querySelectorAll('.pg-retry').forEach(a => a.addEventListener('click', e => { e.preventDefault(); load(); }));
            });
            if ('IntersectionObserver' in window) {
                const io = new IntersectionObserver(entries => {
                    if (entries.some(e => e.isIntersecting)) { io.disconnect(); load(); }
                }, { rootMargin: '700px 0px' });
                roots.forEach(r => io.observe(r));
            } else {
                load();
            }
        }

        // Handles older ?page=... links from when Publish/Tournaments/Creator Lab/Subscribe were
        // in-page sections on the homepage. They are now real pages - redirect straight there.
        const LEGACY_PAGES = { tournament: 'tournaments.html', store: 'merch.html', launch: 'publish.html', subscribe: 'subscription.html' };

        // Small surface for platform.js
        window.PGCore = {
            games, esc, whenFirebase,
            loadCommunityGames: window.pgLoadCommunityGames,
            fetchCommunityHtml: window.pgFetchCommunityHtml,
            harden: window.pgHarden,
            sandbox: window.PG_SANDBOX,
            frameDoc: pgFrameDoc,
            createGameCard, playCounts,
            invalidateCommunity: () => { try { sessionStorage.removeItem('pgCommunityList'); } catch (e) {} communityPromise = null; communityLoaded = false; }
        };

        window.addEventListener('popstate', function(event) {
            if (event.state && event.state.page === 'game') { window.launchViewport(event.state.id, 'none'); } 
            else if (event.state && event.state.page) { window.openPage(event.state.page); } 
            else { window.goHome(); }
        });

        // Lightweight mobile nav toggle (no framework, just a class flip)
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const mainNavLinks = document.getElementById('main-nav-links');
        if (mobileMenuToggle && mainNavLinks) {
            mobileMenuToggle.addEventListener('click', () => {
                const isOpen = mainNavLinks.classList.toggle('open');
                mobileMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
            mainNavLinks.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    mainNavLinks.classList.remove('open');
                    mobileMenuToggle.setAttribute('aria-expanded', 'false');
                });
            });
        }

        const pgInit = () => {
            window.renderGames(games);
            window.updateFeaturedPanels();
            renderFeatured();
            renderCategories();
            initSearch();
            initLazyModules();
            // Community shelf: read Firestore only once the Games section is about to be seen.
            const gamesSection = document.getElementById('games-section');
            if (gamesSection && document.getElementById('community-shelf')) {
                if ('IntersectionObserver' in window) {
                    const cio = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { cio.disconnect(); window.pgLoadCommunityGames(); } }, { rootMargin: '500px 0px' });
                    cio.observe(gamesSection);
                } else { window.pgLoadCommunityGames(); }
                renderCommunity();
            }
            
            const urlParams = new URLSearchParams(window.location.search);
            const playQuery = urlParams.get('play');
            decideAds(playQuery);
            const pageQuery = urlParams.get('page');

            // This page has no game viewport (e.g. the showcase homepage) - a play
            // link landing here should open the real game library, not fail silently.
            if (playQuery && !document.getElementById('game-canvas')) {
                window.location.replace('games.html' + window.location.search);
                return;
            }
            
            if (playQuery && playQuery.indexOf('c-') === 0) {
                window.goHome();
                openCommunityById(playQuery.slice(2));
            } else if (playQuery) {
                const game = games.find(g => g.title.toLowerCase().replace(/ /g, '-') === playQuery);
                // 'replace' - the URL already reflects this game, so attach the correct
                // history state without pushing a second, redundant back-entry.
                if (game) window.launchViewport(game.id, 'replace');
                else window.goHome();
            } else if (pageQuery && LEGACY_PAGES[pageQuery]) {
                 window.location.replace(LEGACY_PAGES[pageQuery]);
            } else if (pageQuery) {
                 const targetPage = pageQuery + '-page';
                 if(document.getElementById(targetPage)) window.openPage(targetPage);
                 else window.goHome();
            } else {
                window.goHome();
            }

            // Arriving here from a homepage showcase click (#game-16) - scroll to
            // that card and briefly highlight it. Never auto-launches the game.
            if (window.location.hash.startsWith('#game-')) {
                const targetCard = document.querySelector(window.location.hash);
                if (targetCard) {
                    requestAnimationFrame(() => {
                        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetCard.classList.add('showcase-highlight');
                        setTimeout(() => targetCard.classList.remove('showcase-highlight'), 2200);
                    });
                }
            }

            // Section links (index.html#launch-section ...): the games grid above has just been filled,
            // so jump again now that the page height is final.
            if (window.location.hash && !/^#c?game-/.test(window.location.hash)) {
                try { const sec = document.querySelector(window.location.hash); if (sec) requestAnimationFrame(() => sec.scrollIntoView()); } catch (e) { /* not a valid selector */ }
            }

            // Hide the loader once the critical content has actually been painted, rather
            // than after a fixed guess-timeout. Two rAFs = wait for the next real frame.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const loader = document.getElementById('loader');
                if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 300); }
            }));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pgInit); else pgInit();
        
        window.onclick = (e) => { 
            if (e.target.classList.contains('modal-overlay')) window.closeModals(); 
            if (e.target.id === 'pg-info-modal') window.closePageModal();
        }
        
        window.onscroll = () => { 
            const btn = document.getElementById('scrollToTopBtn');
            if(btn) btn.style.display = window.scrollY > 300 ? 'block' : 'none'; 

            const header = document.getElementById('main-header');
            if(window.scrollY > 50) { header.classList.add('scrolled'); } else { header.classList.remove('scrolled'); }

            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (winScroll / height) * 100;
            document.getElementById("scroll-progress").style.width = scrolled + "%";
        };
