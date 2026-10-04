/* PixelGaunt - Admin dashboard (admin.html)
   Only for accounts that have a document admins/<uid> in Firestore. All data goes through the review service
   (pg-review-worker.js /admin/...), which checks that on every request. */
(function () {
    'use strict';
    const root = document.getElementById('admin-root'); if (!root) return;
    const API = () => window.PG_REVIEW_ENDPOINT || 'https://pg-review.pixelgaunt.workers.dev';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const day = t => t ? new Date(t).toLocaleString() : '-';
    const user = () => window.pgFB && window.pgFB.auth.currentUser;
    async function api(path, body) {
        const u = user(); if (!u) throw new Error('Please log in.');
        const res = await fetch(API() + '/admin/' + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ Authorization: 'Bearer ' + await u.getIdToken() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error || ('Request failed (HTTP ' + res.status + ')')), { status: res.status });
        return d;
    }
    function note(msg, bad) { const n = document.getElementById('ad-note'); if (!n) return; n.textContent = msg; n.className = 'ad-note ' + (bad ? 'bad' : 'ok'); clearTimeout(note.t); note.t = setTimeout(() => { n.textContent = ''; }, 6000); }
    const act = async (fn, okMsg, reload) => { try { await fn(); note(okMsg); if (reload) reload(); } catch (e) { note(e.message, true); } };

    const TABS = [['overview', 'Overview'], ['games', 'Game reviews'], ['payments', 'Payments'], ['merch', 'Merch orders'], ['tournaments', 'Tournaments'], ['bugs', 'Bug reports'], ['users', 'Users'], ['community', 'Community games'], ['earnings', 'Earnings'], ['diag', 'Login problems']];
    let current = 'overview';

    function shell() {
        root.innerHTML = `<div class="ad-tabs" role="tablist">${TABS.map(([k, l]) => `<button class="ad-tab" data-tab="${k}" role="tab" aria-selected="${k === current}">${l}<span class="ad-badge" id="ad-b-${k}"></span></button>`).join('')}</div>
            <p class="ad-note" id="ad-note" role="status"></p><div id="ad-body"><p class="pg-muted">Loading...</p></div>
            <div class="ad-modal" id="ad-modal" hidden><div class="ad-modal-box"><button class="ad-x" aria-label="Close">&times;</button><div id="ad-modal-body"></div></div></div>`;
        root.querySelectorAll('.ad-tab').forEach(b => b.onclick = () => { current = b.dataset.tab; root.querySelectorAll('.ad-tab').forEach(x => x.setAttribute('aria-selected', String(x === b))); render(); });
        const m = document.getElementById('ad-modal'); m.querySelector('.ad-x').onclick = closeModal; m.onclick = e => { if (e.target === m) closeModal(); };
    }
    function openModal(html) { document.getElementById('ad-modal-body').innerHTML = html; document.getElementById('ad-modal').hidden = false; }
    function closeModal() { const f = document.querySelector('#ad-modal iframe'); if (f) f.remove(); document.getElementById('ad-modal').hidden = true; }
    const body = () => document.getElementById('ad-body');
    const table = (heads, rows) => rows.length ? `<div class="ad-wrap"><table class="ad-table"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<p class="pg-muted">Nothing here right now.</p>';
    const statusFilter = (opts, cur) => `<label class="ad-filter">Show <select id="ad-status">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const filters = {};

    async function render() {
        const b = body(); b.innerHTML = '<p class="pg-muted">Loading...</p>';
        try { await VIEWS[current](b); } catch (e) { b.innerHTML = `<p class="ad-note bad">${esc(e.message)}</p>`; }
    }
    async function badges() {
        try {
            const o = await api('overview');
            const set = (k, n) => { const el = document.getElementById('ad-b-' + k); if (el) el.textContent = n ? n : ''; };
            set('games', o.games); set('payments', o.payments); set('merch', o.merch); set('bugs', o.bugs); set('diag', o.loginProblems);
            return o;
        } catch (e) { return null; }
    }

    const VIEWS = {
        async overview(b) {
            const o = await badges() || {};
            const card = (k, n, label, hint) => `<button class="ad-card" data-go="${k}"><b>${n || 0}</b><span>${label}</span><small>${hint}</small></button>`;
            b.innerHTML = `<div class="ad-cards">${card('games', o.games, 'Games waiting for review', (o.updates || 0) + ' of them are updates')}${card('payments', o.payments, 'Payments to check', 'Confirm = subscription starts')}${card('merch', o.merch, 'New merch orders', 'T-shirts and 3D prints')}${card('bugs', o.bugs, 'Open bug reports', 'From players')}${card('diag', o.loginProblems, 'Login problems (7 days)', 'Unexpected sign-outs')}</div>
                <p class="pg-muted" style="margin-top:14px;">Everything you do here takes effect immediately. Users only ever see their own data.</p>`;
            b.querySelectorAll('[data-go]').forEach(x => x.onclick = () => root.querySelector(`.ad-tab[data-tab="${x.dataset.go}"]`).click());
        },
        async games(b) {
            const st = filters.games || 'pending_review';
            const d = await api('submissions?status=' + st);
            b.innerHTML = statusFilter([['pending_review', 'Waiting for review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['email_failed', 'Email failed'], ['drive_failed', 'Drive failed']], st) +
                (d.items.length ? d.items.map(s => `<div class="ad-item"><div class="ad-item-head"><b>${esc(s.game_name)}</b>${s.pending_version ? '<span class="pg-pill warn">UPDATE</span>' : ''}<small>by ${esc(s.developer_name)} (${esc(s.developer_email)}) · ${day(s.update_submitted_at || s.submitted_at)} · ${esc(s.subscription_type || '')}</small></div>
                    <p>${esc(s.description || 'No description.')}</p>
                    <small class="pg-muted">ID ${esc(s.id)} · ${(Number(s.file_size || 0) / 1048576).toFixed(2)} MB · ${esc(s.file_count)} files · entry ${esc(s.entry_file)}${s.validation_warnings && s.validation_warnings.length ? ' · warnings: ' + esc([].concat(s.validation_warnings).join(' | ')) : ''}${s.decision_error ? ' · <b style="color:#f87171">' + esc(s.decision_error) + '</b>' : ''}${s.rejection_reason ? ' · reason: ' + esc(s.rejection_reason) : ''}</small>
                    <div class="ad-actions"><button class="pg-btn" data-play="${esc(s.id)}"><i class="fas fa-play"></i> Play here</button>${s.drive_play_link ? `<a class="pg-btn" href="${esc(s.drive_play_link)}" target="_blank" rel="noopener">play.html (Drive)</a>` : ''}${s.drive_link ? `<a class="pg-btn" href="${esc(s.drive_link)}" target="_blank" rel="noopener">game.zip (Drive)</a>` : ''}
                    ${st === 'pending_review' ? `<button class="pg-btn primary" data-ok="${esc(s.id)}">Approve</button><button class="pg-btn danger" data-no="${esc(s.id)}">Reject</button>` : ''}</div></div>`).join('') : '<p class="pg-muted">Nothing here right now.</p>');
            wireFilter('games');
            b.querySelectorAll('[data-play]').forEach(x => x.onclick = () => playGame(x.dataset.play));
            b.querySelectorAll('[data-ok]').forEach(x => x.onclick = () => { if (confirm('Approve and publish this game?')) act(() => api('decide', { id: x.dataset.ok, decision: 'approve' }), 'Approved - it is live on the Games page.', render); });
            b.querySelectorAll('[data-no]').forEach(x => x.onclick = () => { const r = prompt('Reason for the developer (they will see it):'); if (r && r.trim().length >= 3) act(() => api('decide', { id: x.dataset.no, decision: 'reject', reason: r.trim() }), 'Rejected - the developer sees your reason.', render); });
        },
        async payments(b) {
            const st = filters.payments || 'pending_verification';
            const d = await api('payments?status=' + st);
            b.innerHTML = statusFilter([['pending_verification', 'Waiting for approval'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected']], st) + table(['Receipt', 'User', 'Plan / amount', 'Paid with', 'Transaction / message', 'Date', ''],
                d.items.map(p => `<tr><td>${esc(p.ref)}</td><td>${esc(p.name)}<br><small>${esc(p.email)}</small></td><td>${p.cycle === 'yearly' ? 'Yearly' : 'Monthly'}<br><small>${esc(p.amount)}</small></td><td>${esc(p.method)}<br><small>${esc(p.senderName)} ${esc(p.senderAccount || '')}</small></td><td>${esc(p.txnId || '-')}<br><small>${esc(p.message || '')}</small></td><td>${day(p.createdAt)}${p.plan_expires ? '<br><small>active until ' + new Date(p.plan_expires).toLocaleDateString() + '</small>' : ''}</td>
                    <td class="ad-actions"><button class="pg-btn" data-img="${esc(p.ref)}">Screenshot</button>${st === 'pending_verification' ? `<button class="pg-btn primary" data-ok="${esc(p.ref)}">Confirm</button><button class="pg-btn danger" data-no="${esc(p.ref)}">Reject</button>` : ''}</td></tr>`));
            wireFilter('payments');
            b.querySelectorAll('[data-img]').forEach(x => x.onclick = async () => { try { const r = await api('payment-image?ref=' + encodeURIComponent(x.dataset.img)); openModal(r.image ? `<img src="${esc(r.image)}" alt="Payment screenshot" style="max-width:100%;">` : '<p>No screenshot.</p>'); } catch (e) { note(e.message, true); } });
            b.querySelectorAll('[data-ok]').forEach(x => x.onclick = () => { if (confirm('Money received? Confirm - the subscription starts now.')) act(() => api('payment', { ref: x.dataset.ok, decision: 'confirm' }), 'Confirmed - subscription is active.', render); });
            b.querySelectorAll('[data-no]').forEach(x => x.onclick = () => { const r = prompt('Reason (optional):') ; if (r !== null) act(() => api('payment', { ref: x.dataset.no, decision: 'reject', reason: r }), 'Payment rejected.', render); });
        },
        async merch(b) {
            const st = filters.merch || 'new';
            const d = await api('merch?status=' + st);
            b.innerHTML = statusFilter([['new', 'New'], ['confirmed', 'Confirmed'], ['printed', 'Printed'], ['shipped', 'Shipped'], ['cancelled', 'Cancelled'], ['all', 'All']], st) + table(['Order', 'Product', 'Design', 'Customer / delivery', 'Date', 'Status'],
                d.items.map(o => `<tr><td>${esc(o.ref)}</td><td>${o.product === 'tshirt' ? `T-shirt ${esc(o.color)} ${esc(o.size)}` : `3D print ${esc(o.tileSize)}`}<br><small>qty ${esc(o.qty)} · ${o.source === 'ai' ? 'AI: ' + esc(o.prompt) : 'upload'}</small></td>
                    <td>${o.drive_design_id ? `<img class="ad-thumb" data-design="${esc(o.ref)}" alt="design">` : '<small class="pg-muted">in the order email</small>'}</td>
                    <td>${esc(o.name)}<br><small>${esc(o.phone)} · ${esc(o.address)}, ${esc(o.city)}${o.note ? '<br>Note: ' + esc(o.note) : ''}<br>${esc(o.email)}</small></td><td>${day(o.createdAt)}</td>
                    <td><select data-ref="${esc(o.ref)}">${['new', 'confirmed', 'printed', 'shipped', 'cancelled'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`));
            wireFilter('merch');
            b.querySelectorAll('select[data-ref]').forEach(s => s.onchange = () => act(() => api('merch', { ref: s.dataset.ref, status: s.value }), 'Order status saved - the customer sees it.'));
            b.querySelectorAll('img[data-design]').forEach(async img => {
                try { const res = await fetch(API() + '/admin/merch-design?ref=' + encodeURIComponent(img.dataset.design), { headers: { Authorization: 'Bearer ' + await user().getIdToken() } }); if (res.ok) { img.src = URL.createObjectURL(await res.blob()); img.onclick = () => openModal(`<img src="${img.src}" style="max-width:100%;" alt="design">`); } } catch (e) { }
            });
        },
        async tournaments(b) {
            const d = await api('tournaments');
            b.innerHTML = table(['Tournament', 'Organizer', 'Players', 'Status', 'Created', ''], d.items.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.ownerName || t.ownerUid)}</td><td>${esc(t.players)} / ${esc(t.limit)}</td><td>${esc(t.status || '-')}</td><td>${day(t.createdAt)}</td><td><a class="pg-btn" href="tournaments.html" target="_blank">View</a><button class="pg-btn danger" data-del="${esc(t.id)}">Delete</button></td></tr>`));
            b.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { if (confirm('Delete this tournament for everyone?')) act(() => api('tournament-delete', { id: x.dataset.del }), 'Tournament deleted.', render); });
        },
        async bugs(b) {
            const st = filters.bugs || 'open';
            const d = await api('bugs?status=' + st);
            b.innerHTML = statusFilter([['open', 'Open'], ['resolved', 'Resolved']], st) + table(['Where', 'Game', 'Report', 'Date', ''], d.items.map(r => `<tr><td>${esc(r.area || '-')}</td><td>${esc(r.game || '-')}</td><td>${esc(r.report)}</td><td>${day(r.date)}</td><td class="ad-actions">${st === 'open' ? `<button class="pg-btn" data-done="${esc(r.id)}">Resolved</button>` : ''}<button class="pg-btn danger" data-del="${esc(r.id)}">Delete</button></td></tr>`));
            wireFilter('bugs');
            b.querySelectorAll('[data-done]').forEach(x => x.onclick = () => act(() => api('bug', { id: x.dataset.done, action: 'resolve' }), 'Marked as resolved.', render));
            b.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { if (confirm('Delete this report?')) act(() => api('bug', { id: x.dataset.del, action: 'delete' }), 'Deleted.', render); });
        },
        async users(b) {
            const s = filters.userSearch || '';
            const d = await api('users?search=' + encodeURIComponent(s));
            b.innerHTML = `<label class="ad-filter">Search <input id="ad-usearch" value="${esc(s)}" placeholder="name, email or user id"></label>` + table(['User', 'Plan', 'Last login', 'Blocked', 'Change plan', ''],
                d.items.map(u => `<tr><td>${esc(u.displayName || '-')}<br><small>${esc(u.email || '')}<br>${esc(u.id)}</small></td><td>${esc(u.plan || 'free')}${u.plan_expires ? '<br><small>until ' + new Date(u.plan_expires).toLocaleDateString() + '</small>' : ''}</td><td>${day(u.lastLogin)}</td><td>${u.blocked ? '<span class="pg-pill bad">Blocked</span><br><small>' + esc(u.blocked_reason || '') + '</small>' : '-'}</td>
                    <td><select data-plan="${esc(u.id)}"><option value="">-</option><option value="free">Free</option><option value="subscriber_monthly">Monthly (1 month)</option><option value="subscriber_yearly">Yearly (1 year)</option></select></td>
                    <td>${u.blocked ? `<button class="pg-btn" data-unblock="${esc(u.id)}">Unblock</button>` : `<button class="pg-btn danger" data-block="${esc(u.id)}">Block</button>`}</td></tr>`));
            const inp = document.getElementById('ad-usearch'); inp.onkeydown = e => { if (e.key === 'Enter') { filters.userSearch = inp.value.trim(); render(); } };
            b.querySelectorAll('select[data-plan]').forEach(sel => sel.onchange = () => { if (sel.value && confirm('Set this plan now?')) act(() => api('user', { uid: sel.dataset.plan, plan: sel.value }), 'Plan changed.', render); });
            b.querySelectorAll('[data-block]').forEach(x => x.onclick = () => { const r = prompt('Block this user? They can no longer upload games, pay, order merch, create tournaments or report bugs.\nReason (they will see it):'); if (r !== null) act(() => api('user', { uid: x.dataset.block, blocked: true, reason: r }), 'User blocked.', render); });
            b.querySelectorAll('[data-unblock]').forEach(x => x.onclick = () => act(() => api('user', { uid: x.dataset.unblock, blocked: false }), 'User unblocked.', render));
        },
        async community(b) {
            const d = await api('games');
            b.innerHTML = table(['Game', 'Developer', 'Status', 'Plays', 'Published', ''], d.items.map(g => `<tr><td>${esc(g.title)}</td><td>${esc(g.ownerName)}</td><td>${esc(g.status)}</td><td>${esc(g.plays)}</td><td>${day(g.reviewedAt || g.createdAt)}</td>
                <td class="ad-actions">${g.status === 'published' ? `<a class="pg-btn" href="games.html?play=c-${encodeURIComponent(g.id)}" target="_blank">Open</a><button class="pg-btn danger" data-hide="${esc(g.id)}">Hide</button>` : g.status === 'hidden' ? `<button class="pg-btn" data-show="${esc(g.id)}">Put back</button>` : ''}</td></tr>`));
            b.querySelectorAll('[data-hide]').forEach(x => x.onclick = () => { const r = prompt('Hide this game from the Games page? Reason:'); if (r !== null) act(() => api('game', { id: x.dataset.hide, action: 'hide', reason: r }), 'Game hidden.', render); });
            b.querySelectorAll('[data-show]').forEach(x => x.onclick = () => act(() => api('game', { id: x.dataset.show, action: 'publish' }), 'Game is back on the Games page.', render));
        },
        async earnings(b) {
            const month = filters.month || new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 7);
            const d = await api('earnings?month=' + month);
            const entered = Object.fromEntries(d.entered.map(e => [e.uid, e]));
            b.innerHTML = `<div class="ad-row"><label class="ad-filter">Month <input type="month" id="ad-month" value="${esc(month)}"></label>
                <label class="ad-filter">AdSense revenue Google paid for this month (USD) <input type="number" id="ad-total" min="0" step="0.01" placeholder="e.g. 120.50"></label></div>
                <p class="pg-muted">Counted plays on the site this month: <b>${d.sitePlays}</b>. Each developer's games get their share of the revenue by plays; they receive 90%, PixelGaunt keeps 10%.</p>` +
                table(['Developer', 'Games', 'Plays', 'Share', 'Revenue of their games (USD)', 'Developer 90%', 'Saved', ''], d.developers.map(r => {
                    const e = entered[r.uid]; const share = d.sitePlays ? r.plays / d.sitePlays : 0;
                    return `<tr data-uid="${esc(r.uid)}" data-share="${share}"><td>${esc(r.name)}<br><small>${esc(r.uid)}</small></td><td>${esc(r.games.join(', '))}</td><td>${r.plays}</td><td>${(share * 100).toFixed(1)}%</td>
                        <td><input type="number" min="0" step="0.01" class="ad-rev" value="${e ? esc(e.revenue_usd) : ''}"></td><td class="ad-dev">${e ? '$' + (Number(e.revenue_usd) * 0.9).toFixed(2) : '-'}</td><td>${e ? esc(e.status) : '-'}</td>
                        <td class="ad-actions"><button class="pg-btn" data-save="pending">Save</button><button class="pg-btn primary" data-save="paid">Mark paid</button></td></tr>`;
                }));
            document.getElementById('ad-month').onchange = e => { filters.month = e.target.value; render(); };
            document.getElementById('ad-total').oninput = e => { const tot = Number(e.target.value) || 0; b.querySelectorAll('tr[data-uid]').forEach(tr => { const v = Math.round(tot * Number(tr.dataset.share) * 100) / 100; tr.querySelector('.ad-rev').value = v.toFixed(2); tr.querySelector('.ad-dev').textContent = '$' + (v * 0.9).toFixed(2); }); };
            b.querySelectorAll('[data-save]').forEach(x => x.onclick = () => { const tr = x.closest('tr'); act(() => api('earnings', { uid: tr.dataset.uid, month, revenue_usd: Number(tr.querySelector('.ad-rev').value) || 0, status: x.dataset.save }), 'Saved - the developer sees it in Earnings & Plays.', render); });
        },
        async diag(b) {
            const d = await api('diag');
            b.innerHTML = `<p class="pg-muted">Every time someone is signed out WITHOUT pressing Logout, their browser reports it here with the reason it found.</p>` +
                table(['When', 'Minutes after login', 'Reason found', 'Address', 'Browser'], d.items.map(r => `<tr><td>${day(r.at)}</td><td>${esc(r.afterMin)}</td><td>${esc(r.problem)}</td><td>${esc(r.host)}${r.standalone ? ' (installed app)' : ''}</td><td><small>${esc(r.ua)}</small></td></tr>`));
        }
    };
    function wireFilter(key) { const s = document.getElementById('ad-status'); if (s) s.onchange = () => { filters[key] = s.value; render(); }; }

    async function playGame(id) {
        openModal('<p>Loading the playable copy...</p>');
        try {
            const d = await api('play?id=' + encodeURIComponent(id));
            const f = document.createElement('iframe'); f.className = 'ad-game';
            f.setAttribute('sandbox', window.PG_SANDBOX || 'allow-scripts allow-pointer-lock');
            f.setAttribute('srcdoc', window.pgHarden ? window.pgHarden(d.html, {}) : d.html);
            const bdy = document.getElementById('ad-modal-body'); bdy.innerHTML = '<p class="pg-muted">This is exactly what players will get.</p>'; bdy.appendChild(f);
        } catch (e) { document.getElementById('ad-modal-body').innerHTML = '<p class="ad-note bad">' + esc(e.message) + '</p>'; }
    }

    async function start(u) {
        if (!u) { root.innerHTML = '<div class="ad-gate"><h3>Administrators only</h3><p>Please log in with your admin account.</p><button class="pg-btn primary" onclick="openModal(\'login-modal\')">Log in</button></div>'; return; }
        try { await api('me'); }
        catch (e) {
            root.innerHTML = e.status === 403 ? `<div class="ad-gate"><h3>This account is not an administrator</h3><p>To make it one: Firebase console &rarr; Firestore Database &rarr; collection <b>admins</b> &rarr; Add document with Document ID:</p><code class="ad-uid">${esc(u.uid)}</code><p class="pg-muted">(add any field, e.g. role = owner), then reload this page.</p></div>`
                : `<div class="ad-gate"><h3>Could not reach the review service</h3><p>${esc(e.message)}</p></div>`;
            return;
        }
        shell(); render(); badges();
    }
    window.addEventListener('pg-auth', e => start(e.detail && e.detail.user));
    if (user()) start(user());
})();
