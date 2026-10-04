/* PixelGaunt - Custom Merch Studio (print on demand)
   T-shirts and 3D relief prints from the customer's own picture or an AI picture.
   - AI pictures: review service /merch/generate (Cloudflare Workers AI) - login required, daily limits.
   - T-shirt: live mockup in the chosen colour; the print-ready design can be downloaded.
   - 3D print: the picture becomes a 3D relief tile ("lithophane": darker = thicker, glows when held to light);
     a real binary STL file can be downloaded for any 3D printer.
   - Order: sent to the review service /merch/order, which emails PixelGaunt with the design attached. */
(function () {
    'use strict';
    const root = document.getElementById('merch-studio');
    if (!root) return;
    const $ = s => root.querySelector(s);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const endpoint = () => window.PG_REVIEW_ENDPOINT || 'https://pg-review.pixelgaunt.workers.dev';
    const user = () => window.pgFB && window.pgFB.auth.currentUser;
    const COLORS = { White: '#f8fafc', Black: '#111827', Navy: '#1e3a8a', Red: '#b91c1c', Grey: '#9ca3af', Green: '#166534' };
    const st = { product: 'tshirt', color: 'White', img: null, source: '', prompt: '', ref: null };

    root.innerHTML = `
      <div class="mg-steps">
        <div class="mg-card">
          <h3>1. Choose your product</h3>
          <div class="mg-choice" role="radiogroup" aria-label="Product">
            <button type="button" class="mg-opt" data-product="tshirt" aria-pressed="true"><i class="fas fa-shirt"></i> T-shirt</button>
            <button type="button" class="mg-opt" data-product="3d" aria-pressed="false"><i class="fas fa-cube"></i> 3D print</button>
          </div>
          <h3 style="margin-top:18px;">2. Your design</h3>
          <div class="mg-choice">
            <label class="mg-opt mg-upload"><i class="fas fa-upload"></i> Upload an image<input type="file" id="mg-file" accept="image/png,image/jpeg,image/webp" hidden></label>
          </div>
          <div class="mg-ai">
            <label for="mg-prompt">...or create one with AI (describe it):</label>
            <textarea id="mg-prompt" maxlength="300" rows="2" placeholder="e.g. a pixel-art dragon breathing blue fire, retro game style"></textarea>
            <button type="button" class="pg-btn" id="mg-gen"><i class="fas fa-wand-magic-sparkles"></i> Create with AI</button>
            <small class="pg-muted">Login needed. Up to 10 AI images per day. Family-friendly only.</small>
          </div>
          <p class="mg-msg" id="mg-msg" role="status"></p>
          <p class="mg-rules">Please use your own art or AI art you are allowed to use - no copyrighted characters, logos or brands, nothing offensive. Every design is checked by our team before printing.</p>
        </div>
        <div class="mg-card mg-preview-card">
          <h3>3. Preview</h3>
          <div id="mg-tshirt-opts">
            <div class="mg-swatches" id="mg-swatches" aria-label="T-shirt colour"></div>
          </div>
          <div id="mg-3d-opts" hidden>
            <label class="mg-inline">Tile size <select id="mg-tile"><option value="100">10 x 10 cm</option><option value="150">15 x 15 cm</option></select></label>
            <label class="mg-inline"><input type="checkbox" id="mg-invert"> Invert (light parts raised)</label>
          </div>
          <canvas id="mg-canvas" width="600" height="600" aria-label="Product preview"></canvas>
          <div class="mg-row">
            <button type="button" class="pg-btn" id="mg-dl-design" disabled><i class="fas fa-download"></i> Download design</button>
            <button type="button" class="pg-btn" id="mg-dl-stl" hidden disabled><i class="fas fa-cube"></i> Download 3D file (STL)</button>
          </div>
        </div>
      </div>
      <div class="mg-card" id="mg-order-card">
        <h3>4. Order</h3>
        <div class="mg-grid">
          <label id="mg-size-wrap">Size <select id="mg-size"><option>S</option><option selected>M</option><option>L</option><option>XL</option><option>XXL</option></select></label>
          <label>Quantity <input type="number" id="mg-qty" min="1" max="20" value="1"></label>
          <label>Full name <input id="mg-name" maxlength="80" autocomplete="name"></label>
          <label>Phone <input id="mg-phone" maxlength="30" inputmode="tel" autocomplete="tel"></label>
          <label>City <input id="mg-city" maxlength="60" autocomplete="address-level2"></label>
          <label class="mg-wide">Delivery address <input id="mg-address" maxlength="300" autocomplete="street-address"></label>
          <label class="mg-wide">Note (optional) <input id="mg-note" maxlength="300"></label>
        </div>
        <p class="pg-muted" style="font-size:0.88rem;">We reply by email (pixelgaunt@gmail.com) with the price, delivery time and payment details. Nothing is printed or charged before you confirm.</p>
        <div class="mg-row"><span class="mg-msg" id="mg-order-msg" role="status"></span><button type="button" class="pg-btn primary" id="mg-send" disabled>Send order</button></div>
      </div>
      <div class="mg-card" id="mg-my" hidden><h3>Your merch orders</h3><div id="mg-my-list"></div></div>`;

    const canvas = $('#mg-canvas'), ctx = canvas.getContext('2d');
    const msg = (t, bad) => { const m = $('#mg-msg'); m.textContent = t || ''; m.classList.toggle('bad', !!bad); };

    // ---------- product / colour ----------
    root.querySelectorAll('[data-product]').forEach(b => b.addEventListener('click', () => {
        st.product = b.dataset.product;
        root.querySelectorAll('[data-product]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        $('#mg-tshirt-opts').hidden = st.product !== 'tshirt'; $('#mg-3d-opts').hidden = st.product !== '3d';
        $('#mg-dl-stl').hidden = st.product !== '3d'; $('#mg-size-wrap').hidden = st.product !== 'tshirt';
        draw();
    }));
    $('#mg-swatches').innerHTML = Object.keys(COLORS).map(c => `<button type="button" class="mg-swatch" data-color="${c}" title="${c}" aria-label="${c}" aria-pressed="${c === st.color}" style="background:${COLORS[c]}"></button>`).join('');
    root.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
        st.color = b.dataset.color; root.querySelectorAll('[data-color]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw();
    }));
    $('#mg-tile').addEventListener('change', draw); $('#mg-invert').addEventListener('change', draw);

    // ---------- design sources ----------
    function setImage(src, source, prompt) {
        const im = new Image();
        im.onload = () => { st.img = im; st.source = source; st.prompt = prompt || ''; st.ref = null; ['#mg-dl-design', '#mg-dl-stl', '#mg-send'].forEach(id => $(id).disabled = false); draw(); };
        im.onerror = () => msg('That image could not be opened. Please try another file.', true);
        im.src = src;
    }
    $('#mg-file').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return msg('Please choose a PNG, JPG or WEBP image.', true);
        if (f.size > 10 * 1024 * 1024) return msg('That image is larger than 10 MB. Please choose a smaller one.', true);
        const r = new FileReader(); r.onload = () => { setImage(r.result, 'upload'); msg('Image ready. Check the preview.'); }; r.readAsDataURL(f);
    });
    $('#mg-gen').addEventListener('click', async () => {
        const p = $('#mg-prompt').value.trim();
        if (!user()) { msg('Please log in to create AI images.', true); if (window.openModal) window.openModal('login-modal'); return; }
        if (p.length < 3) return msg('Describe the picture you want first.', true);
        const b = $('#mg-gen'); b.disabled = true; msg('Creating your image... this takes a few seconds.');
        try {
            const res = await fetch(endpoint() + '/merch/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user().getIdToken() }, body: JSON.stringify({ prompt: p }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || !d.ok) throw new Error(d.error || ('The AI image could not be created (HTTP ' + res.status + ').'));
            setImage(d.image, 'ai', p); msg('AI image ready (' + d.left + ' left today). Check the preview.');
        } catch (e) { msg(e.message || 'The AI image could not be created.', true); }
        finally { b.disabled = false; }
    });

    // ---------- preview drawing ----------
    function shirtPath(c, x, y, w, h) {
        c.beginPath();
        c.moveTo(x + w * 0.36, y); c.quadraticCurveTo(x + w * 0.5, y + h * 0.08, x + w * 0.64, y);
        c.lineTo(x + w * 0.86, y + h * 0.06); c.lineTo(x + w, y + h * 0.26); c.lineTo(x + w * 0.85, y + h * 0.34); c.lineTo(x + w * 0.8, y + h * 0.27);
        c.lineTo(x + w * 0.8, y + h); c.lineTo(x + w * 0.2, y + h); c.lineTo(x + w * 0.2, y + h * 0.27); c.lineTo(x + w * 0.15, y + h * 0.34);
        c.lineTo(x, y + h * 0.26); c.lineTo(x + w * 0.14, y + h * 0.06); c.closePath();
    }
    function fit(im, maxW, maxH) { const k = Math.min(maxW / im.width, maxH / im.height); return [im.width * k, im.height * k]; }
    function draw() {
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#e2e8f0'); bg.addColorStop(1, '#cbd5e1');   // light studio backdrop: dark shirts stay visible
        ctx.fillStyle = st.product === 'tshirt' ? bg : '#0b1020'; ctx.fillRect(0, 0, W, H);
        if (st.product === 'tshirt') {
            shirtPath(ctx, 40, 50, W - 80, H - 90); ctx.fillStyle = COLORS[st.color]; ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.stroke();
            if (st.img) { const [w, h] = fit(st.img, W * 0.42, H * 0.42); ctx.drawImage(st.img, (W - w) / 2, 50 + H * 0.17, w, h); }
            else { ctx.fillStyle = 'rgba(100,116,139,0.6)'; ctx.font = '20px Arial'; ctx.textAlign = 'center'; ctx.fillText('Your design here', W / 2, H * 0.42); }
        } else {
            if (!st.img) { ctx.fillStyle = '#64748b'; ctx.font = '20px Arial'; ctx.textAlign = 'center'; ctx.fillText('Upload or create an image', W / 2, H / 2); return; }
            const N = 160, hm = heightMap(N), pad = 60, cell = (W - pad * 2) / N;
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {   // simple shaded relief
                const v = hm[j * N + i], dx = (hm[j * N + Math.min(i + 1, N - 1)] - v), shade = Math.max(0, Math.min(255, 150 + v * 80 - dx * 600));
                ctx.fillStyle = `rgb(${shade},${shade},${Math.min(255, shade + 10)})`; ctx.fillRect(pad + i * cell, pad + j * cell, cell + 0.6, cell + 0.6);
            }
            ctx.fillStyle = '#94a3b8'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
            ctx.fillText('3D relief tile - ' + ($('#mg-tile').value / 10) + ' x ' + ($('#mg-tile').value / 10) + ' cm', W / 2, H - 22);
        }
    }
    // Brightness map 0..1 of the square-cropped picture (1 = raised).
    function heightMap(N) {
        const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
        const s = Math.min(st.img.width, st.img.height);
        x.drawImage(st.img, (st.img.width - s) / 2, (st.img.height - s) / 2, s, s, 0, 0, N, N);
        const d = x.getImageData(0, 0, N, N).data, out = new Float32Array(N * N), inv = $('#mg-invert').checked;
        for (let k = 0; k < N * N; k++) { const a = d[k * 4 + 3] / 255, lum = (0.2126 * d[k * 4] + 0.7152 * d[k * 4 + 1] + 0.0722 * d[k * 4 + 2]) / 255 * a + (1 - a); out[k] = inv ? lum : 1 - lum; }
        return out;
    }

    // ---------- exports ----------
    function designBlob(maxSide) {
        const k = Math.min(1, maxSide / Math.max(st.img.width, st.img.height));
        const c = document.createElement('canvas'); c.width = Math.round(st.img.width * k); c.height = Math.round(st.img.height * k);
        c.getContext('2d').drawImage(st.img, 0, 0, c.width, c.height);
        return new Promise(res => c.toBlob(b => { if (b && b.size <= 6 * 1024 * 1024) res(b); else c.toBlob(res, 'image/jpeg', 0.9); }, 'image/png'));
    }
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
    $('#mg-dl-design').addEventListener('click', async () => { if (st.img) download(await designBlob(3000), 'pixelgaunt-design.png'); });
    // Binary STL of a closed relief tile: top = height map, flat bottom, four walls. Units: millimetres.
    function buildStl(sizeMm) {
        const N = 120, hm = heightMap(N), base = 0.8, relief = 2.4, step = sizeMm / (N - 1);
        const z = (i, j) => base + hm[j * N + i] * relief, X = i => i * step, Y = j => (N - 1 - j) * step;
        const tris = [];
        const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
        for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
            quad([X(i), Y(j), z(i, j)], [X(i), Y(j + 1), z(i, j + 1)], [X(i + 1), Y(j + 1), z(i + 1, j + 1)], [X(i + 1), Y(j), z(i + 1, j)]);   // top
            quad([X(i), Y(j), 0], [X(i + 1), Y(j), 0], [X(i + 1), Y(j + 1), 0], [X(i), Y(j + 1), 0]);                                     // bottom
        }
        for (let k = 0; k < N - 1; k++) {   // walls
            quad([X(k), Y(0), 0], [X(k), Y(0), z(k, 0)], [X(k + 1), Y(0), z(k + 1, 0)], [X(k + 1), Y(0), 0]);
            quad([X(k + 1), Y(N - 1), 0], [X(k + 1), Y(N - 1), z(k + 1, N - 1)], [X(k), Y(N - 1), z(k, N - 1)], [X(k), Y(N - 1), 0]);
            quad([X(0), Y(k + 1), 0], [X(0), Y(k + 1), z(0, k + 1)], [X(0), Y(k), z(0, k)], [X(0), Y(k), 0]);
            quad([X(N - 1), Y(k), 0], [X(N - 1), Y(k), z(N - 1, k)], [X(N - 1), Y(k + 1), z(N - 1, k + 1)], [X(N - 1), Y(k + 1), 0]);
        }
        const buf = new ArrayBuffer(84 + tris.length * 50), dv = new DataView(buf);
        const head = 'PixelGaunt 3D relief tile'; for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
        dv.setUint32(80, tris.length, true);
        let o = 84;
        for (const [a, b, c] of tris) {
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(q => q / l);
            for (const q of [n, a, b, c]) { dv.setFloat32(o, q[0], true); dv.setFloat32(o + 4, q[1], true); dv.setFloat32(o + 8, q[2], true); o += 12; }
            dv.setUint16(o, 0, true); o += 2;
        }
        return new Blob([buf], { type: 'model/stl' });
    }
    window.pgBuildStl = buildStl;   // also used by the tests
    $('#mg-dl-stl').addEventListener('click', () => { if (st.img) download(buildStl(Number($('#mg-tile').value)), 'pixelgaunt-relief-tile.stl'); });

    // ---------- order ----------
    function newRef() {
        const d = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
        const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = ''; crypto.getRandomValues(new Uint8Array(6)).forEach(x => r += a[x % a.length]);
        return 'MG-' + d + '-' + r;
    }
    $('#mg-send').addEventListener('click', async () => {
        const om = $('#mg-order-msg'); om.classList.remove('bad');
        if (!user()) { om.textContent = 'Please log in to order.'; if (window.openModal) window.openModal('login-modal'); return; }
        if (!st.img) { om.textContent = 'Add a design first.'; return; }
        const v = id => $(id).value.trim();
        if (!v('#mg-name') || !v('#mg-phone') || !v('#mg-city') || !v('#mg-address')) { om.textContent = 'Please fill in your name, phone, city and address.'; om.classList.add('bad'); return; }
        const b = $('#mg-send'); b.disabled = true; om.textContent = 'Sending your order...';
        try {
            st.ref = st.ref || newRef();
            const fd = new FormData();
            Object.entries({ ref: st.ref, product: st.product, color: st.product === 'tshirt' ? st.color : '', size: st.product === 'tshirt' ? v('#mg-size') : '', qty: v('#mg-qty'),
                tileSize: st.product === '3d' ? ($('#mg-tile').value / 10) + ' x ' + ($('#mg-tile').value / 10) + ' cm' + ($('#mg-invert').checked ? ' (inverted)' : '') : '',
                source: st.source, prompt: st.prompt, shipName: v('#mg-name'), shipPhone: v('#mg-phone'), shipCity: v('#mg-city'), shipAddress: v('#mg-address'), note: v('#mg-note') }).forEach(([k, x]) => fd.append(k, x));
            fd.append('design', await designBlob(3000), st.ref + '.png');
            const res = await fetch(endpoint() + '/merch/order', { method: 'POST', headers: { Authorization: 'Bearer ' + await user().getIdToken() }, body: fd });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || !d.ok) throw new Error(d.error || ('The order could not be sent (HTTP ' + res.status + ').'));
            om.textContent = 'Thank you! Order ' + d.ref + ' was sent. We will email you the price and payment details.';
            st.ref = null; loadMine();
        } catch (e) { om.textContent = e.message || 'The order could not be sent.'; om.classList.add('bad'); }
        finally { b.disabled = false; }
    });
    async function loadMine() {
        const u = user(), box = $('#mg-my'); if (!u) { box.hidden = true; return; }
        try {
            const d = await (await fetch(endpoint() + '/merch/orders', { headers: { Authorization: 'Bearer ' + await u.getIdToken() } })).json();
            if (!d.orders || !d.orders.length) { box.hidden = true; return; }
            const label = { new: 'Received - we will email you', confirmed: 'Confirmed', printed: 'Printed', shipped: 'Shipped', cancelled: 'Cancelled' };
            $('#mg-my-list').innerHTML = d.orders.map(o => `<div class="mg-order"><b>${esc(o.ref)}</b> · ${o.product === 'tshirt' ? 'T-shirt ' + esc(o.color) + ' ' + esc(o.size) : '3D print ' + esc(o.tileSize)} · qty ${esc(o.qty)} <span class="pg-pill ${o.status === 'cancelled' ? 'bad' : o.status === 'new' ? 'warn' : 'ok'}">${esc(label[o.status] || o.status)}</span></div>`).join('');
            box.hidden = false;
        } catch (e) { box.hidden = true; }
    }
    window.addEventListener('pg-auth', loadMine);
    draw();
})();
