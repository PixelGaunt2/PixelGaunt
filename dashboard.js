/* =====================================================================================
   PIXELGAUNT CREATOR DASHBOARD  -  dashboard.js (phase: dashboard UI shell)
   -------------------------------------------------------------------------------------
   This page is signed-in only. It renders real data from exactly one trusted source:
   window.PGBackend.me() (see account.js -> pixelgaunt-backend Worker's GET /me).

   Everything this file cannot honestly back with real data - plays, unique players,
   earnings, tournament results, asset sales, per-game performance - is NOT invented.
   Those systems (upload pipeline, analytics events, earnings ledger, tournament
   engine, asset marketplace) don't exist yet, so every creator's real number for them
   right now genuinely is zero / "no data yet". This file shows exactly that, and the
   sections that have no backend at all yet (My Games, Upload Game, Earnings,
   Tournaments, My Assets, Asset Sales, Settings) are shown as an honest "not built
   yet" placeholder rather than a dead end that looks broken.

   Depends on globals set up by firebase-auth.js + account.js, loaded before this file:
     window.pgFB.auth        - Firebase Auth instance (getIdToken, currentUser, signOut)
     window.PGBackend.me()   - -> {uid,email,createdAt,role,plan,subscriptionStatus,
                                    billingPeriodStart,billingPeriodEnd,
                                    gamesUploadedThisPeriod,storageUsedThisPeriod,
                                    suspended,limits:{maxGamesPerPeriod,maxGameSizeMB}}
     'pg-auth' window event  - dispatched by firebase-auth.js on sign-in/out
   ===================================================================================== */
(function () {
  'use strict';

  const PANELS = [
    'overview', 'mygames', 'upload', 'analytics', 'earnings',
    'tournaments', 'assets', 'assetsales', 'subscription', 'profile', 'settings',
    'adminpayments'
  ];

  const PAYMENT_METHOD_LABELS = {
    EASYPAISA: 'Easypaisa', MEEZAN_BANK: 'Meezan Bank', BANK_ALFALAH: 'Bank Alfalah',
    NAYAPAY: 'NayaPay', SADAPAY: 'SadaPay'
  };

  const NOT_BUILT_YET = {
    mygames: {
      title: 'My Games',
      body: "The upload &amp; game-management pipeline isn't built yet. Once it ships, every game you publish will show up here with its status, version history and controls."
    },
    upload: {
      title: 'Upload Game',
      body: 'Game upload, validation and sandboxed publishing is a separate, not-yet-built phase. Nothing you do on this page can publish a game today.'
    },
    earnings: {
      title: 'Earnings',
      body: "There's no revenue or payout system wired up yet, so there is nothing to report - not even a placeholder chart. This will track gross revenue, platform share, your share, pending and paid amounts once ad revenue and payouts are integrated."
    },
    tournaments: {
      title: 'Tournaments',
      body: 'A basic tournament join system exists on the homepage today, but bracket generation, match reporting and a creator-facing tournament manager here are not built yet.'
    },
    assets: {
      title: 'My Assets',
      body: 'The 2D/3D asset marketplace has a request form in Creator Lab today, but asset listing, pricing and file delivery from this dashboard are not built yet.'
    },
    assetsales: {
      title: 'Asset Sales',
      body: 'Depends on the asset marketplace above - not built yet, so there is no sales data to show.'
    },
    settings: {
      title: 'Settings',
      body: 'Account settings beyond what you can already change in your profile (display name, photo) are not built yet.'
    }
  };

  let cachedMe = null;
  let currentUser = null;
  let analyticsRange = '30d';

  // ---- tiny DOM helpers -----------------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $all = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function fmtBytes(mb) {
    if (mb == null) return '0 MB';
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return (Math.round(mb * 10) / 10) + ' MB';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  function planLabel(plan) {
    return plan === 'PRO' ? 'PIXELGAUNT CREATOR PRO' : 'Free Creator';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---- top-level render states -----------------------------------------------------------
  function showSignedOut() {
    $('#dash-loading').classList.add('pg-hidden');
    $('#dash-signedout').classList.remove('pg-hidden');
    $('#dash-app').classList.add('pg-hidden');
    $('#dash-signout-btn').classList.add('pg-hidden');
  }

  function showLoading() {
    $('#dash-loading').classList.remove('pg-hidden');
    $('#dash-signedout').classList.add('pg-hidden');
    $('#dash-app').classList.add('pg-hidden');
  }

  function showApp() {
    $('#dash-loading').classList.add('pg-hidden');
    $('#dash-signedout').classList.add('pg-hidden');
    $('#dash-app').classList.remove('pg-hidden');
    $('#dash-signout-btn').classList.remove('pg-hidden');
  }

  function showUnreachable(message) {
    $('#dash-loading').classList.add('pg-hidden');
    $('#dash-signedout').classList.add('pg-hidden');
    $('#dash-app').classList.add('pg-hidden');
    $('#dash-signout-btn').classList.add('pg-hidden');
    const el = $('#dash-error');
    el.classList.remove('pg-hidden');
    el.querySelector('p').textContent = message;
  }

  function wireRetry() {
    const btn = $('#dash-retry-btn');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      if (currentUser) {
        loadAndRender().catch((e) => {
          console.error('Dashboard render failed', e);
          showUnreachable('Something went wrong loading your dashboard. Try refreshing.');
        });
      } else {
        window.location.reload();
      }
    });
  }

  // ---- overview panel ---------------------------------------------------------------------
  function renderOverview(me) {
    $('#dash-plan-badge').textContent = planLabel(me.plan);
    $('#dash-plan-badge').className = 'dash-plan-badge ' + (me.plan === 'PRO' ? 'is-pro' : 'is-free');
    $('#dash-user-email').textContent = me.email || currentUser.email || 'Signed in';

    if (me.suspended) {
      $('#dash-suspended-banner').classList.remove('pg-hidden');
    } else {
      $('#dash-suspended-banner').classList.add('pg-hidden');
    }

    // Real zero-state stat cards. Nothing here is randomised or estimated - these
    // systems don't produce data yet, so 0 / "No data yet" is the accurate number.
    const stats = [
      ['Total Games', 0, 'No games uploaded yet'],
      ['Published Games', 0, 'No data yet'],
      ['Draft Games', 0, 'No data yet'],
      ['Total Plays', 0, 'No data yet'],
      ['Unique Players', 0, 'No data yet'],
      ['Total Earnings', '$0.00', 'No data yet'],
      ['This Month', '$0.00', 'No data yet'],
      ['Pending Payout', '$0.00', 'No data yet'],
      ['Tournament Entries', 0, 'No data yet'],
      ['Tournament Wins', 0, 'No data yet'],
      ['Asset Sales', 0, 'No data yet']
    ];
    const grid = $('#dash-stat-grid');
    grid.innerHTML = stats.map(([label, value, sub]) => `
      <div class="dash-stat-card">
        <span class="dash-stat-label">${label}</span>
        <span class="dash-stat-value">${value}</span>
        <span class="dash-stat-sub">${sub}</span>
      </div>
    `).join('');

    // Upload limits - the one part of "Overview" backed by real, live account data.
    const limits = me.limits || { maxGamesPerPeriod: 1, maxGameSizeMB: 5 };
    const gamesUsed = me.gamesUploadedThisPeriod || 0;
    const gamesPct = Math.min(100, Math.round((gamesUsed / limits.maxGamesPerPeriod) * 100));
    $('#dash-games-used').textContent = `${gamesUsed} / ${limits.maxGamesPerPeriod} used`;
    $('#dash-games-bar-fill').style.width = gamesPct + '%';
    $('#dash-max-size').textContent = fmtBytes(limits.maxGameSizeMB) + ' max per game';

    const storageUsed = me.storageUsedThisPeriod || 0;
    // No standalone "total storage cap" field exists yet - the honest ceiling for this
    // bar is games-allowed x max-size-per-game, derived from real limits, not invented.
    const storageCeiling = limits.maxGamesPerPeriod * limits.maxGameSizeMB;
    const storagePct = storageCeiling > 0 ? Math.min(100, Math.round((storageUsed / storageCeiling) * 100)) : 0;
    $('#dash-storage-used').textContent = `${fmtBytes(storageUsed)} used this period`;
    $('#dash-storage-bar-fill').style.width = storagePct + '%';
    $('#dash-storage-ceiling').textContent = `of up to ${fmtBytes(storageCeiling)} possible this period`;
  }

  // ---- analytics panel (shell: real range control + real chart renderer, zero data) -------
  function drawEmptyChart(svgEl) {
    svgEl.innerHTML = `
      <line x1="40" y1="10" x2="40" y2="170" stroke="var(--text-muted)" stroke-opacity="0.35"/>
      <line x1="40" y1="170" x2="680" y2="170" stroke="var(--text-muted)" stroke-opacity="0.35"/>
      <text x="360" y="95" text-anchor="middle" fill="var(--text-muted)" font-family="Inter, sans-serif" font-size="14">
        No data yet
      </text>
      <text x="360" y="118" text-anchor="middle" fill="var(--text-muted)" font-family="Inter, sans-serif" font-size="12" opacity="0.75">
        Plays and earnings will chart here once tracking is live
      </text>
    `;
  }

  function renderAnalytics() {
    drawEmptyChart($('#dash-plays-chart'));
    drawEmptyChart($('#dash-earnings-chart'));
    $all('.dash-range-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.range === analyticsRange);
    });
  }

  // ---- subscription panel ------------------------------------------------------------------
  function renderSubscription(me) {
    $('#dash-sub-current-plan').textContent = planLabel(me.plan);
    $('#dash-sub-status').textContent = me.subscriptionStatus || 'none';
    $('#dash-sub-period-end').textContent = me.billingPeriodEnd ? fmtDate(me.billingPeriodEnd) : '—';

    $('#dash-plan-card-free').classList.toggle('is-current', me.plan !== 'PRO');
    $('#dash-plan-card-pro').classList.toggle('is-current', me.plan === 'PRO');

    const upgradeBtn = $('#dash-upgrade-btn');
    if (me.plan === 'PRO') {
      upgradeBtn.textContent = 'Current Plan';
      upgradeBtn.disabled = true;
    } else {
      upgradeBtn.textContent = 'Upgrade to Creator Pro';
      upgradeBtn.disabled = false;
    }
  }

  // ---- manual payment (Pakistan) -----------------------------------------------------------
  let paymentMethodsLoaded = false;

  async function loadPaymentMethods() {
    if (paymentMethodsLoaded) return;
    const el = $('#dash-payment-methods-list');
    try {
      const res = await window.PGBackend.call('/payment-methods', { method: 'GET' });
      if (!res || !res.methods) {
        el.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">Could not load payment methods right now.</p>';
        return;
      }
      el.innerHTML = res.methods.map((m) => `
        <div class="dash-pay-method-card">
          <strong>${esc(m.label)}</strong>
          <p>${esc(m.instructions)}</p>
        </div>
      `).join('');
      paymentMethodsLoaded = true;
    } catch (e) {
      el.innerHTML = `<p style="color:var(--text-muted); font-size:0.82rem;">Could not load payment methods: ${esc(e.message)}</p>`;
    }
  }

  async function loadMySubmissions() {
    const el = $('#dash-payment-submissions');
    try {
      const res = await window.PGBackend.call('/payments/mine', { method: 'GET' });
      if (!res) {
        el.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">Could not load your submissions right now.</p>';
        return;
      }
      const rows = res.payments || [];
      if (rows.length === 0) {
        el.innerHTML = '<p style="color: var(--text-muted); font-size:0.85rem;">No submissions yet.</p>';
        return;
      }
      el.innerHTML = rows.map((p) => `
        <div class="dash-pay-submission-card">
          <div class="row1">
            <span>${esc(PAYMENT_METHOD_LABELS[p.method] || p.method)} · ${esc(p.currency || 'PKR')} ${esc(p.amount)}</span>
            <span class="dash-pay-status-pill dash-pay-status-${esc(p.status)}">${esc(p.status).replace('_', ' ')}</span>
          </div>
          <div>Ref: ${esc(p.transactionRef)} · Submitted ${fmtDate(p.createdAt)}</div>
          ${p.reviewNote ? `<div style="margin-top:4px;">Admin note: ${esc(p.reviewNote)}</div>` : ''}
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = `<p style="color:var(--text-muted); font-size:0.82rem;">Could not load your submissions: ${esc(e.message)}</p>`;
    }
  }

  function wirePaymentForm() {
    const form = $('#dash-payment-form');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#dash-pay-submit-btn');
      const msg = $('#dash-pay-form-msg');
      const body = {
        method: $('#dash-pay-method').value,
        transactionRef: $('#dash-pay-ref').value.trim(),
        amount: Number($('#dash-pay-amount').value),
        paymentDate: $('#dash-pay-date').value,
        proofUrl: $('#dash-pay-proof').value.trim() || undefined,
        notes: $('#dash-pay-notes').value.trim() || undefined
      };
      btn.disabled = true;
      msg.style.color = 'var(--text-muted)';
      msg.textContent = 'Submitting…';
      try {
        const res = await window.PGBackend.call('/payments/submit', { method: 'POST', body: JSON.stringify(body) });
        if (!res || !res.ok) throw new Error('Backend unreachable — nothing was submitted.');
        msg.style.color = '#4ade80';
        msg.textContent = 'Submitted — an admin will review it shortly.';
        form.reset();
        await loadMySubmissions();
      } catch (err) {
        msg.style.color = '#f87171';
        msg.textContent = err.message || 'Could not submit. Try again.';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---- profile panel ------------------------------------------------------------------------
  function renderProfile(me) {
    $('#dash-profile-email').textContent = me.email || currentUser.email || '—';
    $('#dash-profile-uid').textContent = me.uid || currentUser.uid || '—';
    $('#dash-profile-role').textContent = me.role || 'user';
    $('#dash-profile-since').textContent = fmtDate(me.createdAt);
  }

  // ---- "not built yet" placeholder panels ----------------------------------------------------
  function renderPlaceholders() {
    Object.keys(NOT_BUILT_YET).forEach((key) => {
      const info = NOT_BUILT_YET[key];
      const el = $(`#panel-${key} .dash-placeholder-body`);
      if (el) el.innerHTML = info.body;
    });
  }

  // ---- nav / panel switching -------------------------------------------------------------
  function selectPanel(name) {
    if (PANELS.indexOf(name) === -1) name = 'overview';
    PANELS.forEach((p) => {
      const panel = $(`#panel-${p}`);
      if (panel) panel.classList.toggle('pg-hidden', p !== name);
      const navBtn = $(`.dash-nav-item[data-panel="${p}"]`);
      if (navBtn) navBtn.classList.toggle('active', p === name);
    });
    if (name === 'analytics') renderAnalytics();
    if (name === 'adminpayments') loadAdminPayments();
    window.location.hash = name;
  }

  function wireNav() {
    $all('.dash-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => selectPanel(btn.dataset.panel));
    });
    $all('.dash-range-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        analyticsRange = btn.dataset.range;
        renderAnalytics();
      });
    });
    const initial = (window.location.hash || '').replace('#', '');
    selectPanel(initial || 'overview');
  }

  function wireSignOut() {
    const btn = $('#dash-signout-btn');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      // Sign-out must always reach the logged-out page, even if Firebase's signOut()
      // itself hangs (bad network, etc.) - so the redirect fires on a short timeout
      // regardless of whether signOut() resolved first.
      const redirect = () => { window.location.href = 'index.html'; };
      const safetyTimer = setTimeout(redirect, 4000);
      try {
        if (window.pgFB && window.pgFB.auth && window.pgFB.auth.signOut) {
          await window.pgFB.auth.signOut();
        }
      } catch (e) {
        console.warn('Dashboard: sign-out failed', e);
      } finally {
        clearTimeout(safetyTimer);
        redirect();
      }
    });
  }

  function wireUpgradeButton() {
    const btn = $('#dash-upgrade-btn');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const note = $('#dash-upgrade-note');
      note.textContent = 'Automated card checkout isn\u2019t connected yet. For now, PIXELGAUNT CREATOR PRO ($1.99/mo) is activated after a manual payment review — see below.';
      note.classList.remove('pg-hidden');
      $('#dash-manual-payment').classList.remove('pg-hidden');
      loadPaymentMethods();
      loadMySubmissions();
      wirePaymentForm();
    });
  }

  // ---- admin: payment review -----------------------------------------------------------------
  let adminPayStatusFilter = 'PENDING';

  async function loadAdminPayments() {
    const el = $('#dash-admin-payments-list');
    el.innerHTML = '<p style="color: var(--text-muted); font-size:0.85rem;">Loading…</p>';
    try {
      const qs = adminPayStatusFilter ? `?status=${adminPayStatusFilter}` : '';
      const res = await window.PGBackend.call('/admin/payments' + qs, { method: 'GET' });
      if (!res) {
        el.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">Could not load right now.</p>';
        return;
      }
      const rows = res.payments || [];
      if (rows.length === 0) {
        el.innerHTML = '<p style="color: var(--text-muted); font-size:0.85rem;">Nothing here.</p>';
        return;
      }
      el.innerHTML = rows.map((p) => `
        <div class="dash-admin-pay-card" data-id="${esc(p.id)}">
          <div class="row1">
            <span>${esc(p.email || p.uid)}</span>
            <span class="dash-pay-status-pill dash-pay-status-${esc(p.status)}">${esc(p.status).replace('_', ' ')}</span>
          </div>
          <div>${esc(PAYMENT_METHOD_LABELS[p.method] || p.method)} · ${esc(p.currency || 'PKR')} ${esc(p.amount)} · Ref: ${esc(p.transactionRef)}</div>
          <div>Paid ${esc(p.paymentDate)} · Submitted ${fmtDate(p.createdAt)}</div>
          ${p.proofUrl ? `<div><a href="${esc(p.proofUrl)}" target="_blank" rel="noopener" style="color: var(--neon-cyan);">Proof link</a></div>` : ''}
          ${p.notes ? `<div>Notes: ${esc(p.notes)}</div>` : ''}
          ${(p.status === 'PENDING' || p.status === 'UNDER_REVIEW') ? `
            <div class="admin-pay-actions">
              <button class="approve" data-decision="APPROVED">Approve → activate Pro</button>
              <button class="reject" data-decision="REJECTED">Reject</button>
            </div>
          ` : ''}
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = `<p style="color:var(--text-muted); font-size:0.82rem;">Could not load: ${esc(e.message)}</p>`;
    }
  }

  function wireAdminPayments() {
    $all('.admin-pay-filter').forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        adminPayStatusFilter = btn.dataset.status;
        $all('.admin-pay-filter').forEach((b) => b.classList.toggle('active', b === btn));
        loadAdminPayments();
      });
    });

    const list = $('#dash-admin-payments-list');
    if (list && !list.dataset.wired) {
      list.dataset.wired = '1';
      list.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-decision]');
        if (!btn) return;
        const card = btn.closest('.dash-admin-pay-card');
        const id = card.dataset.id;
        const decision = btn.dataset.decision;
        if (decision === 'REJECTED' && !window.confirm('Reject this payment submission?')) return;
        card.querySelectorAll('button').forEach((b) => (b.disabled = true));
        try {
          const res = await window.PGBackend.call('/admin/payments/decision', {
            method: 'POST',
            body: JSON.stringify({ id, decision })
          });
          if (!res || !res.ok) throw new Error('Backend unreachable — decision was not saved.');
          loadAdminPayments();
        } catch (err) {
          window.alert(err.message || 'Could not save decision.');
          card.querySelectorAll('button').forEach((b) => (b.disabled = false));
        }
      });
    }
  }

  // ---- boot ---------------------------------------------------------------------------------
  async function loadAndRender() {
    showLoading();
    wireRetry();
    const me = await (window.PGBackend && window.PGBackend.me({ fresh: true }));
    if (!me) {
      const reason = window.PGBackend && window.PGBackend.meError && window.PGBackend.meError();
      showUnreachable(reason || 'Could not load your account. This dashboard needs the backend URL configured in account.js and a working sign-in.');
      return;
    }
    cachedMe = me;
    renderOverview(me);
    renderSubscription(me);
    renderProfile(me);
    renderPlaceholders();
    wireNav();
    wireSignOut();
    wireUpgradeButton();

    // Admin-only nav item. Purely cosmetic gating - the real enforcement is
    // requireAdmin() in the Worker on every /admin/* endpoint, same as
    // toggleDashboardLink() in account.js is cosmetic and not a security boundary.
    const adminLink = $('#dash-nav-adminpayments');
    if (adminLink) {
      adminLink.classList.toggle('pg-hidden', me.role !== 'admin');
      if (me.role === 'admin') wireAdminPayments();
    }

    showApp();
  }

  function onAuthChange(user) {
    currentUser = user;
    if (user) {
      loadAndRender().catch((e) => {
        console.error('Dashboard render failed', e);
        showUnreachable('Something went wrong loading your dashboard. Try refreshing.');
      });
    } else {
      showSignedOut();
    }
  }

  window.addEventListener('pg-auth', (e) => {
    onAuthChange(e.detail && e.detail.user ? e.detail.user : null);
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Covers the case where sign-in already happened (and 'pg-auth' already fired)
    // before this script attached its listener.
    const already = window.pgFB && window.pgFB.auth && window.pgFB.auth.currentUser;
    if (already) onAuthChange(already);
  });
})();
