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

    const TABS = [['overview', 'Overview'], ['chat', 'Live chat'], ['games', 'Game reviews'], ['payments', 'Payments'], ['donations', 'Donations'], ['fees', 'Entry fees'], ['merch', 'Merch orders'], ['tournaments', 'Tournaments & paid matches'], ['bugs', 'Bug reports'], ['users', 'Users'], ['community', 'Community games'], ['earnings', 'Earnings'], ['diag', 'Login problems']];
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
            set('chat', o.chats); set('games', o.games); set('payments', o.payments); set('donations', o.donations); set('merch', o.merch); set('bugs', o.bugs); set('diag', o.loginProblems);
            return o;
        } catch (e) { return null; }
    }

    const VIEWS = {
        async overview(b) {
            const o = await badges() || {};
            const card = (k, n, label, hint) => `<button class="ad-card" data-go="${k}"><b>${n || 0}</b><span>${label}</span><small>${hint}</small></button>`;
            b.innerHTML = `<div class="ad-cards">${card('chat', o.chats, 'Chats waiting for an answer', 'Questions from visitors')}${card('games', o.games, 'Games waiting for review', (o.updates || 0) + ' of them are updates')}${card('payments', o.payments, 'Payments to check', 'Confirm = subscription starts')}${card('donations', o.donations, 'Donations to check', 'Confirm = shown in Live feed')}${card('merch', o.merch, 'New merch orders', 'T-shirts and 3D prints')}${card('bugs', o.bugs, 'Open bug reports', 'From players')}${card('diag', o.loginProblems, 'Login problems (7 days)', 'Unexpected sign-outs')}</div>
                <p class="pg-muted" style="margin-top:14px;">Everything you do here takes effect immediately. Users only ever see their own data.</p>`;
            b.querySelectorAll('[data-go]').forEach(x => x.onclick = () => root.querySelector(`.ad-tab[data-tab="${x.dataset.go}"]`).click());
        },
        async chat(b) {
            const d = await api('chats'); let open = filters.chatOpen || '';
            const ago = t => { const s = Math.max(1, Math.round((Date.now() - Date.parse(t)) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString(); };
            b.innerHTML = `<p class="pg-muted">Visitors ask from the chat bubble on every page. Your answer appears in their chat window (and as a red badge on the bubble). New questions are also emailed to you.</p>
                <div class="ad-chat"><div class="ad-chat-list">${d.items.length ? d.items.map(t => `<button class="ad-chat-t${t.id === open ? ' on' : ''}" data-t="${esc(t.id)}"><b>${esc(t.name || 'Guest')}${t.guest ? ' <small>(guest)</small>' : ''}</b>${Number(t.unreadAdmin) > 0 ? `<span class="ad-chat-n">${Number(t.unreadAdmin)}</span>` : (t.status === 'answered' ? '<span class="ad-chat-ok">answered</span>' : '')}<small>${t.lastFrom === 'admin' ? 'You: ' : ''}${esc(t.lastText || '')}</small><small class="pg-muted">${esc(t.email || '')} · ${ago(t.updatedAt)}</small></button>`).join('') : '<p class="pg-muted">No conversations yet.</p>'}</div>
                <div class="ad-chat-view" id="ad-chat-view"><p class="pg-muted">Choose a conversation.</p></div></div>`;
            async function show(id) {
                filters.chatOpen = open = id;
                b.querySelectorAll('.ad-chat-t').forEach(x => x.classList.toggle('on', x.dataset.t === id));
                const v = document.getElementById('ad-chat-view'); if (!v) return;
                try {
                    const c = await api('chat?id=' + encodeURIComponent(id)); const t = c.thread;
                    const n = b.querySelector(`.ad-chat-t[data-t="${CSS.escape(id)}"] .ad-chat-n`); if (n) n.remove();
                    v.innerHTML = `<div class="ad-chat-head"><b>${esc(t.name || 'Guest')}</b> <small>${t.email ? `<a href="mailto:${esc(t.email)}">${esc(t.email)}</a>` : 'no email'}${t.uid ? ' · user ' + esc(t.uid) : ' · guest'}${t.page ? ' · from ' + esc(t.page) : ''}</small><button class="pg-btn sm danger" id="ad-chat-del">Delete</button></div>
                        <div class="ad-chat-msgs" id="ad-chat-msgs">${c.messages.map(m => `<div class="ad-msg ${m.from === 'admin' ? 'me' : ''}"><p>${esc(m.text)}</p><small>${m.from === 'admin' ? 'PixelGaunt' : esc(t.name || 'Guest')} · ${day(m.at)}</small></div>`).join('')}</div>
                        <form class="ad-chat-form" id="ad-chat-form"><textarea id="ad-chat-text" rows="3" maxlength="2000" placeholder="Write your answer..." required></textarea><button class="pg-btn primary" type="submit"><i class="fas fa-paper-plane"></i> Send answer</button></form>`;
                    const box = document.getElementById('ad-chat-msgs'); box.scrollTop = box.scrollHeight;
                    document.getElementById('ad-chat-form').onsubmit = async e => { e.preventDefault(); const ta = document.getElementById('ad-chat-text'); const txt = ta.value.trim(); if (!txt) return;
                        const btn = e.target.querySelector('button'); btn.disabled = true;
                        try { await api('chat-reply', { id, text: txt }); ta.value = ''; note('Answer sent - the visitor sees it in their chat window.'); render(); } catch (er) { note(er.message, true); btn.disabled = false; } };
                    document.getElementById('ad-chat-text').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) document.getElementById('ad-chat-form').requestSubmit(); };
                    document.getElementById('ad-chat-del').onclick = () => { if (confirm('Delete this whole conversation?')) { filters.chatOpen = ''; act(() => api('chat-delete', { id }), 'Conversation deleted.', render); } };
                    badges();
                } catch (e) { v.innerHTML = `<p class="ad-note bad">${esc(e.message)}</p>`; }
            }
            b.querySelectorAll('.ad-chat-t').forEach(x => x.onclick = () => show(x.dataset.t));
            if (open && d.items.some(t => t.id === open)) show(open);
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
        async fees(b) {
            const st = filters.fees || 'pending';
            const d = await api('fees?status=' + st);
            b.innerHTML = `<p class="pg-muted">Paid tournament entry fees. Check the money arrived, then Confirm: the player is added to the tournament automatically.</p>` +
                statusFilter([['pending', 'Waiting for confirmation'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected']], st) + table(['Tournament', 'Player', 'Fee', 'Sent to / transaction', 'Date', ''],
                d.items.map(x => `<tr><td>${esc(x.tournamentName)}</td><td>${esc(x.name)}<br><small>${esc(x.email)}</small></td><td><b>PKR ${esc(Number(x.fee).toLocaleString())}</b></td><td>${esc(x.method)}<br><small>${esc(x.txnId || '-')}</small></td><td>${day(x.createdAt)}</td>
                    <td class="ad-actions"><button class="pg-btn" data-fimg="${esc(x.ref)}">Screenshot</button>${st === 'pending' ? `<button class="pg-btn primary" data-fok="${esc(x.ref)}">Confirm</button><button class="pg-btn danger" data-fno="${esc(x.ref)}">Reject</button>` : ''}</td></tr>`));
            wireFilter('fees');
            b.querySelectorAll('[data-fimg]').forEach(x => x.onclick = async () => { try { const r = await api('fee-image?ref=' + encodeURIComponent(x.dataset.fimg)); openModal(r.image ? `<img src="${esc(r.image)}" alt="Entry fee screenshot" style="max-width:100%;">` : '<p>No screenshot.</p>'); } catch (e) { note(e.message, true); } });
            b.querySelectorAll('[data-fok]').forEach(x => x.onclick = () => { if (confirm('Fee received? Confirm - the player joins the tournament.')) act(() => api('fee', { ref: x.dataset.fok, decision: 'confirm' }), 'Confirmed - the player is in the tournament.', render); });
            b.querySelectorAll('[data-fno]').forEach(x => x.onclick = () => { const r = prompt('Reason (optional):'); if (r !== null) act(() => api('fee', { ref: x.dataset.fno, decision: 'reject', reason: r }), 'Rejected.', render); });
        },
        async donations(b) {
            const st = filters.donations || 'pending';
            const d = await api('donations?status=' + st);
            b.innerHTML = `<p class="pg-muted">Confirmed so far: <b>PKR ${Number(d.totalConfirmedPKR || 0).toLocaleString()}</b> from ${d.confirmedCount || 0} donation(s). Check the money arrived before confirming; confirmed donations show in "Live on PixelGaunt" (name only, never the amount).</p>` +
                statusFilter([['pending', 'Waiting for confirmation'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected']], st) + table(['Reference', 'From', 'Amount', 'Sent to', 'Transaction / message', 'Date', ''],
                d.items.map(x => `<tr><td>${esc(x.ref)}</td><td>${esc(x.name)}<br><small>${esc(x.email)}</small></td><td><b>PKR ${esc(Number(x.amount).toLocaleString())}</b></td><td>${esc(x.method)}</td><td>${esc(x.txnId || '-')}<br><small>${esc(x.message || '')}</small></td><td>${day(x.createdAt)}</td>
                    <td class="ad-actions"><button class="pg-btn" data-dimg="${esc(x.ref)}">Screenshot</button>${st === 'pending' ? `<button class="pg-btn primary" data-dok="${esc(x.ref)}">Confirm</button><button class="pg-btn danger" data-dno="${esc(x.ref)}">Reject</button>` : ''}</td></tr>`));
            wireFilter('donations');
            b.querySelectorAll('[data-dimg]').forEach(x => x.onclick = async () => { try { const r = await api('donation-image?ref=' + encodeURIComponent(x.dataset.dimg)); openModal(r.image ? `<img src="${esc(r.image)}" alt="Donation screenshot" style="max-width:100%;">` : '<p>No screenshot.</p>'); } catch (e) { note(e.message, true); } });
            b.querySelectorAll('[data-dok]').forEach(x => x.onclick = () => { if (confirm('Money received? Confirm this donation.')) act(() => api('donation', { ref: x.dataset.dok, decision: 'confirm' }), 'Confirmed - thank-you shown in the Live feed.', render); });
            b.querySelectorAll('[data-dno]').forEach(x => x.onclick = () => { const r = prompt('Reason (optional):'); if (r !== null) act(() => api('donation', { ref: x.dataset.dno, decision: 'reject', reason: r }), 'Donation rejected.', render); });
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
            let gameOpts = ((window.PGCore && window.PGCore.games) || []).map(g => ({ id: String(g.id), title: g.title }));
            try { const cg = await api('games'); cg.items.filter(g => g.status === 'published').forEach(g => gameOpts.push({ id: 'c_' + g.id, title: g.title + ' (community)' })); } catch (e) { }
            b.innerHTML = `<div class="ad-item"><div class="ad-item-head"><b>Create a tournament</b><small>Paid matches: players pay the entry fee to your accounts and send proof; you confirm it in "Entry fees" and they are added.</small></div>
                <div class="ad-form">
                    <label>Name<input id="at-name" maxlength="60" placeholder="e.g. Driller Cup #1"></label>
                    <label>Game<select id="at-game">${gameOpts.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select></label>
                    <label>Entry<select id="at-entry"><option value="free">Free tournament</option><option value="paid" selected>Paid match (entry fee)</option></select></label>
                    <label id="at-fee-wrap">Entry fee (PKR)<input id="at-fee" type="number" min="50" step="10" value="200"></label>
                    <label>Prize<input id="at-prize" maxlength="120" placeholder="e.g. Winner gets PKR 2,000"></label>
                    <label>Players<select id="at-limit"><option>4</option><option selected>8</option><option>16</option><option>32</option></select></label>
                    <label>Starts (optional)<input id="at-start" type="datetime-local"></label>
                    <label class="ad-wide">Rules / description<input id="at-desc" maxlength="300" placeholder="Format, rules, how the winner is decided"></label>
                </div>
                <p class="pg-muted" style="font-size:.85rem;">Real-money entry fees with cash prizes can count as gambling - keep it a game of skill, publish clear rules and prizes, and refund fees if a match does not happen.</p>
                <div class="ad-actions"><button class="pg-btn primary" id="at-create">Create tournament</button></div></div>` +
                table(['Tournament', 'Entry', 'Prize', 'Game', 'Players', 'Status', 'Created', ''], d.items.map(t => `<tr><td>${esc(t.name)}<br><small>by ${esc(t.ownerName || t.ownerUid)}</small></td><td>${t.entryFee > 0 ? `<span class="pg-pill warn">PAID · PKR ${esc(t.entryFee.toLocaleString())}</span>` : '<span class="pg-pill ok">FREE</span>'}</td><td>${esc(t.prize || '-')}</td><td>${esc(t.gameTitle || '-')}</td><td>${esc(t.players)} / ${esc(t.limit)}</td><td>${esc(t.status || '-')}</td><td>${day(t.createdAt)}</td><td class="ad-actions"><a class="pg-btn" href="tournaments.html" target="_blank">View</a><button class="pg-btn danger" data-del="${esc(t.id)}">Delete</button></td></tr>`));
            const entry = document.getElementById('at-entry'); entry.onchange = () => { document.getElementById('at-fee-wrap').hidden = entry.value !== 'paid'; };
            document.getElementById('at-create').onclick = () => {
                const sel = document.getElementById('at-game'), start = document.getElementById('at-start').value;
                act(() => api('tournament-create', { name: document.getElementById('at-name').value.trim(), gameId: sel.value, gameTitle: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace(/ \(community\)$/, '') : '',
                    entryFee: entry.value === 'paid' ? Number(document.getElementById('at-fee').value) : 0, prize: document.getElementById('at-prize').value.trim(), limit: Number(document.getElementById('at-limit').value),
                    startAt: start ? new Date(start).toISOString() : '', description: document.getElementById('at-desc').value.trim() }), 'Tournament created - it is live on the Tournaments page.', render);
            };
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
                <td class="ad-actions">${g.status === 'published' ? `<a class="pg-btn" href="games.html?play=c-${encodeURIComponent(g.id)}" target="_blank">Open</a><button class="pg-btn danger" data-hide="${esc(g.id)}">Hide</button>` : g.status === 'hidden' ? `<button class="pg-btn" data-show="${esc(g.id)}">Put back</button>` : ''}<label class="pg-btn" style="cursor:pointer;">Set cover<input type="file" accept="image/png,image/jpeg,image/webp" data-cover="${esc(g.id)}" hidden></label><button class="pg-btn" data-comments="${esc(g.id)}">Comments</button></td></tr>`));
            b.querySelectorAll('[data-cover]').forEach(inp => inp.onchange = async () => {
                const f = inp.files[0]; if (!f) return;
                const url = await new Promise(res => { const im = new Image(), u = URL.createObjectURL(f); im.onload = () => { const k = Math.min(1, 640 / im.width, 360 / im.height), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); let q = .85, d = c.toDataURL('image/jpeg', q); while (d.length > 380000 && q > .4) { q -= .1; d = c.toDataURL('image/jpeg', q); } res(d); }; im.src = u; });
                act(() => api('game', { id: inp.dataset.cover, action: 'cover', thumb: url }), 'Cover image saved - it shows on the Games page.', render);
            });
            b.querySelectorAll('[data-comments]').forEach(x => x.onclick = async () => {
                try { const r = await api('comments?game=' + encodeURIComponent(x.dataset.comments));
                    openModal('<h3>Comments</h3>' + (r.items.length ? r.items.map(c => `<div class="ad-item"><b>${esc(c.name)}</b> <small>${day(c.at)}</small><p>${esc(c.text)}</p><button class="pg-btn danger" data-cdel="${esc(c.id)}">Delete</button></div>`).join('') : '<p class="pg-muted">No comments.</p>'));
                    document.querySelectorAll('[data-cdel]').forEach(btn => btn.onclick = () => act(() => api('comment-delete', { id: btn.dataset.cdel }), 'Comment deleted.', () => { btn.closest('.ad-item').remove(); }));
                } catch (e) { note(e.message, true); } });
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
                `<p><button class="pg-btn primary" id="ad-save-all">Save all (as pending)</button></p>` +
                table(['Developer', 'Payout details', 'Games', 'Plays', 'Share', 'Revenue of their games (USD)', 'Developer 90%', 'Saved', ''], d.developers.map(r => {
                    const e = entered[r.uid]; const share = d.sitePlays ? r.plays / d.sitePlays : 0;
                    const po = r.payout; const poTxt = po ? `${esc(po.method)}${po.bankName ? ' · ' + esc(po.bankName) : ''}<br><small>${esc(po.accountTitle)} · ${esc(po.accountNumber || '')}${po.iban ? '<br>' + esc(po.iban) : ''}</small>` : '<small class="pg-muted">not added yet</small>';
                    return `<tr data-uid="${esc(r.uid)}" data-share="${share}"><td>${esc(r.name)}<br><small>${esc(r.uid)}</small></td><td>${poTxt}</td><td>${esc(r.games.join(', '))}</td><td>${r.plays}</td><td>${(share * 100).toFixed(1)}%</td>
                        <td><input type="number" min="0" step="0.01" class="ad-rev" value="${e ? esc(e.revenue_usd) : ''}"></td><td class="ad-dev">${e ? '$' + (Number(e.revenue_usd) * 0.9).toFixed(2) : '-'}</td><td>${e ? esc(e.status) : '-'}</td>
                        <td class="ad-actions"><button class="pg-btn" data-save="pending">Save</button><button class="pg-btn primary" data-save="paid">Mark paid</button></td></tr>`;
                }));
            document.getElementById('ad-month').onchange = e => { filters.month = e.target.value; render(); };
            document.getElementById('ad-total').oninput = e => { const tot = Number(e.target.value) || 0; b.querySelectorAll('tr[data-uid]').forEach(tr => { const v = Math.round(tot * Number(tr.dataset.share) * 100) / 100; tr.querySelector('.ad-rev').value = v.toFixed(2); tr.querySelector('.ad-dev').textContent = '$' + (v * 0.9).toFixed(2); }); };
            const all = document.getElementById('ad-save-all'); if (all) all.onclick = () => act(async () => { for (const tr of b.querySelectorAll('tr[data-uid]')) await api('earnings', { uid: tr.dataset.uid, month, revenue_usd: Number(tr.querySelector('.ad-rev').value) || 0, status: 'pending' }); }, 'All developers saved - they see it in Earnings & Plays.', render);
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
        setInterval(() => { if (document.hidden) return; badges();
            const ta = document.getElementById('ad-chat-text');
            if (current === 'chat' && !(ta && ta.value.trim())) VIEWS.chat(body()).catch(() => {}); }, 20000);
    }
    window.addEventListener('pg-auth', e => start(e.detail && e.detail.user));
    if (user()) start(user());
})();
