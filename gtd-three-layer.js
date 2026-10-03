/* ============================================================================
   GIRL: THE DRILLER - LIMITED THREE.JS 2.5D VISUAL LAYER  (Three.js r160)
   ----------------------------------------------------------------------------
   Renders ONLY: destroyable objects/asteroids, the Jet, the space background,
   minerals and coins, the Drill, the Pickaxe/Axe, the Mining Rocket / Jet Missiles, the
   Extra-Level Jet Fireballs, the Extra-Level Black Holes, the Dragon Skull / Flower collectables and the Girl (a 3D model).
   Everything else (Girl, HUD, menus, other weapons, projectiles, power-ups, ...)
   stays on the existing 2D canvas / DOM.

   The game stays the single source of truth: every frame the existing render
   code calls GTD3D.begin(), then GTD3D.asteroid()/pickup()/jet()/stars()/...
   with the object's EXISTING x/y/health/spin state, then GTD3D.end().
   Nothing in here moves, damages, collects or spawns anything.

   Coordinates: the game converts world -> screen CSS pixels with
   screenX = worldX * a + bx,  screenY = worldY * a + by
   (a = gameScale in Normal levels, the Extra-Level world scale there).
   The orthographic camera maps 1 unit = 1 CSS pixel of the viewport, which is
   the existing 1366x768 design space scaled by the existing gameScale, so the
   visual layer lines up with the unchanged 2D layer and gameplay coordinates.
   Z is visual depth only.
   If WebGL/Three.js is unavailable, GTD3D.active stays false and the game's
   original 2D drawing runs unchanged.
   ============================================================================ */
(function () {
    'use strict';
    const G = { active: false };
    window.GTD3D = G;
    if (typeof THREE === 'undefined') { console.warn('[GTD3D] Three.js not loaded - using the original 2D visuals.'); return; }

    // ---------------------------------------------------------------- setup
    let renderer, scene, camera, cv;
    let W = window.innerWidth, H = window.innerHeight, DPR = 1;
    try {
        cv = document.createElement('canvas');
        cv.id = 'threeCanvas';
        cv.style.cssText = 'position:absolute;top:0;left:0;z-index:0;pointer-events:none;image-rendering:auto;touch-action:none;';
        const coarse = (navigator.maxTouchPoints || 0) > 0;
        renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !coarse, alpha: false, powerPreference: 'high-performance' });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x050508, 1);
        const gc = document.getElementById('gameCanvas');
        if (gc && gc.parentNode) gc.parentNode.insertBefore(cv, gc); else document.body.appendChild(cv);
    } catch (e) {
        console.warn('[GTD3D] WebGL unavailable - using the original 2D visuals.', e);
        return;
    }
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(0, W, H, 0, 0.1, 1500);
    camera.position.set(0, 0, 600);

    const ambient = new THREE.AmbientLight(0x8fa0c8, 0.85);
    const hemi = new THREE.HemisphereLight(0xa9bcff, 0x1d1530, 0.9);
    const key = new THREE.DirectionalLight(0xfff0dc, 2.3); key.position.set(-400, 600, 700);
    const rim = new THREE.DirectionalLight(0x35e6ff, 0.9); rim.position.set(500, -200, -300);
    scene.add(ambient, hemi, key, rim);

    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.active = false; cv.style.display = 'none'; console.warn('[GTD3D] WebGL context lost - falling back to 2D visuals.'); });

    G.resize = function (w, h, dpr) {
        W = Math.max(1, w); H = Math.max(1, h); DPR = dpr || 1;
        renderer.setPixelRatio(DPR);
        renderer.setSize(W, H, false);
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        camera.left = 0; camera.right = W; camera.top = H; camera.bottom = 0;
        camera.updateProjectionMatrix();
        partUniforms.uPx.value = DPR;
        if (G.active) renderer.render(scene, camera); // keep a paused/frozen frame visible after a resize
    };

    // ---------------------------------------------------------- frame state
    let epoch = 0, T = { a: 1, bx: 0, by: 0 }, camX = 0, camY = 0, timeMs = 0, lastMs = 0, dt = 0.016, mode = 'normal', frameNo = 0;
    const toX = (wx) => wx * T.a + T.bx;
    const toY = (wy) => H - (wy * T.a + T.by);
    const clearCol = new THREE.Color(0x050508);

    // -------------------------------------------------------------- helpers
    function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

    // average colour of an existing art frame -> base rock colour (reuses existing assets)
    const colorCache = new WeakMap();
    let sampleCv = null, sampleCtx = null;
    function sampleImageColor(img, fallbackCss) {
        if (!img) return null;
        let c = colorCache.get(img);
        if (c) return c;
        if (!(img.complete && img.naturalWidth)) return null; // not loaded yet - retry next frame
        c = new THREE.Color(0x777777);
        try {
            if (!sampleCv) { sampleCv = document.createElement('canvas'); sampleCv.width = sampleCv.height = 12; sampleCtx = sampleCv.getContext('2d', { willReadFrequently: true }); }
            sampleCtx.clearRect(0, 0, 12, 12);
            sampleCtx.drawImage(img, 0, 0, 12, 12);
            const d = sampleCtx.getImageData(0, 0, 12, 12).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
            if (n) c.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
        } catch (e) { // file:// taint etc - fall back to a muted version of the mineral colour
            try { c.set(fallbackCss || '#777'); } catch (e2) { }
        }
        // keep rocks readable: clamp brightness, mute saturation slightly
        const hsl = {}; c.getHSL(hsl);
        c.setHSL(hsl.h, Math.min(0.7, hsl.s * 1.05), Math.max(0.26, Math.min(0.58, hsl.l * 1.1)));
        colorCache.set(img, c);
        return c;
    }

    // ------------------------------------------------ particles (shader points)
    const partUniforms = { uPx: { value: 1 } };
    const partVS = 'attribute float aSize;attribute float aAlpha;attribute vec3 aColor;varying float vA;varying vec3 vC;uniform float uPx;void main(){vA=aAlpha;vC=aColor;gl_PointSize=aSize*uPx;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
    const partFS = 'varying float vA;varying vec3 vC;void main(){float d=length(gl_PointCoord-vec2(0.5));if(d>0.5)discard;float f=smoothstep(0.5,0.05,d);gl_FragColor=vec4(vC,vA*f);}';
    function makePoints(N, additive, z) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(N * 3), sz = new Float32Array(N), al = new Float32Array(N), col = new Float32Array(N * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
        geo.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
        geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
        geo.setDrawRange(0, N);
        const mat = new THREE.ShaderMaterial({ uniforms: partUniforms, vertexShader: partVS, fragmentShader: partFS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
        const pts = new THREE.Points(geo, mat);
        pts.frustumCulled = false; pts.position.z = z || 0;
        scene.add(pts);
        return { pts, geo, pos, sz, al, col, N };
    }
    function flag(p) { p.geo.attributes.position.needsUpdate = true; p.geo.attributes.aSize.needsUpdate = true; p.geo.attributes.aAlpha.needsUpdate = true; p.geo.attributes.aColor.needsUpdate = true; }

    // simple ring-buffer particle emitter built on makePoints
    function makeEmitter(N, additive, z) {
        const P = makePoints(N, additive, z);
        const vx = new Float32Array(N), vy = new Float32Array(N), age = new Float32Array(N), life = new Float32Array(N), s0 = new Float32Array(N);
        for (let i = 0; i < N; i++) { life[i] = 0; age[i] = 1; }
        let head = 0;
        return {
            spawn(x, y, pvx, pvy, size, lifeS, r, g, b) {
                const i = head; head = (head + 1) % N;
                P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = 0;
                vx[i] = pvx; vy[i] = pvy; age[i] = 0; life[i] = lifeS; s0[i] = size;
                P.col[i * 3] = r; P.col[i * 3 + 1] = g; P.col[i * 3 + 2] = b;
            },
            update(dtS) {
                for (let i = 0; i < N; i++) {
                    if (age[i] >= life[i]) { P.al[i] = 0; P.sz[i] = 0; continue; }
                    age[i] += dtS;
                    const t = age[i] / life[i];
                    if (t >= 1) { P.al[i] = 0; P.sz[i] = 0; continue; }
                    P.pos[i * 3] += vx[i] * dtS; P.pos[i * 3 + 1] += vy[i] * dtS;
                    vx[i] *= 0.97; vy[i] *= 0.97;
                    P.al[i] = (1 - t) * 0.9; P.sz[i] = s0[i] * (1 - t * 0.6);
                }
                flag(P);
            }
        };
    }
    const dust = makeEmitter(160, false, 40);      // rock dust / mineral sparks (destruction)
    const exhaust = makeEmitter(120, true, 85);    // jet exhaust

    // ------------------------------------------------ asteroid geometry pool
    const VARIANTS = 10, DAMAGE_LEVELS = 3;
    const ROCK_GEOS = [];          // [variant][damage]
    const CRYSTAL_DIRS = [];       // [variant] -> array of {dir, r}
    function rockField(v, x, y, z) {
        const p1 = v * 1.7, p2 = v * 2.9 + 1, p3 = v * 0.6 + 2;
        return 1 + 0.17 * Math.sin(3.1 * x + p1) * Math.sin(2.3 * y + p2) + 0.11 * Math.sin(4.3 * z + p3 + x * 2.0) + 0.07 * Math.sin(7.0 * (x + y) + p1 * 2.0);
    }
    function buildRock(v, dmg) {
        const base = new THREE.IcosahedronGeometry(1, 2);
        const posAttr = base.attributes.position;
        const n = posAttr.count;
        const colors = new Float32Array(n * 3);
        // per-variant silhouette: squash/stretch
        const sx = 0.86 + hash(v + 1) * 0.3, sy = 0.86 + hash(v + 7) * 0.3, sz = 0.8 + hash(v + 13) * 0.25;
        // damage features (deterministic per variant so shapes stay stable)
        const craters = [], cracks = [];
        for (let k = 0; k < dmg * 2 + (dmg ? 1 : 0); k++) {
            const a = hash(v * 31 + k * 7 + 1) * Math.PI * 2, b = Math.acos(2 * hash(v * 17 + k * 11 + 3) - 1);
            craters.push({ x: Math.sin(b) * Math.cos(a), y: Math.sin(b) * Math.sin(a), z: Math.cos(b), ang: 0.32 + 0.22 * hash(v + k * 5), depth: 0.1 + 0.06 * dmg });
        }
        for (let k = 0; k < dmg; k++) {
            const a = hash(v * 53 + k * 19 + 5) * Math.PI * 2, b = Math.acos(2 * hash(v * 23 + k * 29 + 9) - 1);
            cracks.push({ x: Math.sin(b) * Math.cos(a), y: Math.sin(b) * Math.sin(a), z: Math.cos(b) });
        }
        const v3 = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
            v3.fromBufferAttribute(posAttr, i).normalize();
            let r = rockField(v, v3.x, v3.y, v3.z);
            let shade = 0.74 + 0.26 * Math.max(0, Math.min(1, (r - 0.72) / 0.5));
            for (const c of craters) {
                const d = Math.acos(Math.max(-1, Math.min(1, v3.x * c.x + v3.y * c.y + v3.z * c.z)));
                if (d < c.ang) { const f = 1 - d / c.ang; r -= c.depth * f * f * 1.6; shade *= 1 - 0.45 * f; }
            }
            for (const c of cracks) {
                const d = Math.abs(v3.x * c.x + v3.y * c.y + v3.z * c.z);
                if (d < 0.075) { const f = 1 - d / 0.075; r -= 0.09 * f; shade *= 1 - 0.6 * f; }
            }
            posAttr.setXYZ(i, v3.x * r * sx, v3.y * r * sy, v3.z * r * sz);
            colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
        }
        base.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        base.computeVertexNormals();
        base.computeBoundingSphere();
        return base;
    }
    for (let v = 0; v < VARIANTS; v++) {
        ROCK_GEOS[v] = [];
        for (let d = 0; d < DAMAGE_LEVELS; d++) ROCK_GEOS[v][d] = buildRock(v, d);
        const sx = 0.86 + hash(v + 1) * 0.3, sy = 0.86 + hash(v + 7) * 0.3, sz = 0.8 + hash(v + 13) * 0.25;
        const dirs = [];
        for (let k = 0; k < 8; k++) {
            const a = hash(v * 41 + k * 3 + 2) * Math.PI * 2, b = Math.acos(0.15 + 0.85 * hash(v * 37 + k * 5 + 4) * (k % 2 ? 1 : -1) * 0 + (hash(v * 37 + k * 5 + 4) * 1.7 - 0.85));
            const d = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)).normalize();
            const r = rockField(v, d.x, d.y, d.z);
            dirs.push({ dir: d, pos: new THREE.Vector3(d.x * r * sx, d.y * r * sy, d.z * r * sz).multiplyScalar(0.93) });
        }
        CRYSTAL_DIRS[v] = dirs;
    }
    const CRYSTAL_GEO = new THREE.ConeGeometry(0.17, 0.5, 5, 1); // pointing +Y, re-oriented per outcrop
    CRYSTAL_GEO.translate(0, 0.2, 0);
    const FRAG_GEO = new THREE.IcosahedronGeometry(1, 0);
    const UP = new THREE.Vector3(0, 1, 0);

    const astFree = [], astActive = new Map(), astIds = new WeakMap();
    let astIdCounter = 1;
    function newAstHolder() {
        const h = {};
        h.outer = new THREE.Group();
        h.inner = new THREE.Group();
        h.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.08 });
        h.crysMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.25, metalness: 0.35, emissive: 0x000000, emissiveIntensity: 0.6 });
        h.rock = new THREE.Mesh(ROCK_GEOS[0][0], h.rockMat);
        h.inner.add(h.rock);
        h.crystals = [];
        for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(CRYSTAL_GEO, h.crysMat); h.crystals.push(m); h.inner.add(m); }
        h.outer.add(h.inner);
        h.outer.visible = false;
        scene.add(h.outer);
        h.variant = -1; h.dmg = -1; h.transp = false; h.seen = 0; h.src = null;
        h.color = new THREE.Color(); h.mineral = new THREE.Color();
        h.lx = 0; h.ly = 0; h.lr = 0;
        return h;
    }
    function setHolderVariant(h, v) {
        h.variant = v; h.dmg = -1;
        const dirs = CRYSTAL_DIRS[v];
        for (let k = 0; k < 8; k++) {
            const m = h.crystals[k];
            m.position.copy(dirs[k].pos);
            m.quaternion.setFromUnitVectors(UP, dirs[k].dir);
            m.scale.setScalar(0.8 + 0.6 * hash(v * 9 + k));
        }
    }
    function setTransparent(h, on) {
        if (h.transp === on) return;
        h.transp = on;
        h.rockMat.transparent = on; h.crysMat.transparent = on;
        h.rockMat.needsUpdate = true; h.crysMat.needsUpdate = true;
    }

    // o: {x,y,rot,scale,size,alpha,flash,health(0..1),img,mineral(css),dead(src)}
    G.asteroid = function (src, o) {
        let h = astActive.get(src);
        if (!h) {
            h = astFree.pop() || newAstHolder();
            let id = astIds.get(src);
            if (!id) { id = astIdCounter++; astIds.set(src, id); }
            setHolderVariant(h, id % VARIANTS);
            // static per-object tilt => different silhouettes from the same shared geometry
            h.inner.rotation.set((hash(id * 3) - 0.5) * 1.3, (hash(id * 5) - 0.5) * 1.3, hash(id * 7) * 6.28);
            h.baseKnown = false;
            try { h.mineral.set(o.mineral || '#aaaaaa'); } catch (e) { h.mineral.set(0xaaaaaa); }
            h.crysMat.color.copy(h.mineral);
            h.crysMat.emissive.copy(h.mineral);
            h.outer.visible = true;
            astActive.set(src, h);
        }
        h.seen = epoch; h.src = src; h.dead = o.dead;
        if (!h.baseKnown) {
            const c = sampleImageColor(o.img, o.mineral);
            if (c) { h.color.copy(c); h.baseKnown = true; } else { h.color.set(0x777777); }
            h.rockMat.color.copy(h.color);
        }
        const hp = o.health;
        const dmg = hp > 0.7 ? 0 : (hp > 0.35 ? 1 : 2);
        if (dmg !== h.dmg) {
            h.dmg = dmg; h.rock.geometry = ROCK_GEOS[h.variant][dmg];
            const show = 2 + dmg * 3; // more exposed mineral as it breaks
            for (let k = 0; k < 8; k++) h.crystals[k].visible = k < show;
        }
        const alpha = o.alpha === undefined ? 1 : o.alpha;
        setTransparent(h, alpha < 0.995);
        h.rockMat.opacity = alpha; h.crysMat.opacity = alpha;
        const f = o.flash || 0;
        h.rockMat.emissive.setRGB(f, f, f);
        h.crysMat.emissiveIntensity = 0.55 + f * 1.2;
        const s = (o.size / 2) * T.a * (o.scale || 1) * 0.8;
        h.outer.position.set(toX(o.x), toY(o.y), 0);
        h.outer.scale.setScalar(s);
        h.outer.rotation.z = -o.rot;
        h.lx = h.outer.position.x; h.ly = h.outer.position.y; h.lr = s;
    };

    // ---------------------------------------------- destruction fragments
    const FRAGS = [];
    for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(FRAG_GEO, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, metalness: 0.1, transparent: true }));
        m.visible = false; m.frustumCulled = false; scene.add(m);
        FRAGS.push({ m, life: 0, age: 0, vx: 0, vy: 0, rx: 0, ry: 0, rz: 0, s0: 1 });
    }
    let fragHead = 0;
    function spawnDestruction(h) {
        const R = Math.max(6, h.lr);
        const count = Math.min(7, 4 + Math.floor(R / 30));
        for (let k = 0; k < count; k++) {
            const f = FRAGS[fragHead]; fragHead = (fragHead + 1) % FRAGS.length;
            const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 190;
            f.m.material.color.copy(h.color).multiplyScalar(0.8 + Math.random() * 0.4);
            f.m.material.opacity = 1;
            f.m.position.set(h.lx + Math.cos(a) * R * 0.3, h.ly + Math.sin(a) * R * 0.3, 10);
            f.s0 = R * (0.16 + Math.random() * 0.16);
            f.m.scale.setScalar(f.s0);
            f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp;
            f.rx = (Math.random() - 0.5) * 9; f.ry = (Math.random() - 0.5) * 9; f.rz = (Math.random() - 0.5) * 9;
            f.age = 0; f.life = 0.55 + Math.random() * 0.35;
            f.m.visible = true;
        }
        const nd = 12;
        for (let k = 0; k < nd; k++) {
            const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 120;
            dust.spawn(h.lx, h.ly, Math.cos(a) * sp, Math.sin(a) * sp, 5 + Math.random() * 7, 0.5 + Math.random() * 0.4, h.color.r * 1.1, h.color.g * 1.1, h.color.b * 1.1);
        }
        for (let k = 0; k < 6; k++) {
            const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
            dust.spawn(h.lx, h.ly, Math.cos(a) * sp, Math.sin(a) * sp, 3 + Math.random() * 3, 0.4 + Math.random() * 0.3, Math.min(1, h.mineral.r + 0.3), Math.min(1, h.mineral.g + 0.3), Math.min(1, h.mineral.b + 0.3));
        }
    }
    function updateFragments(dtS) {
        for (let i = 0; i < FRAGS.length; i++) {
            const f = FRAGS[i];
            if (!f.m.visible) continue;
            f.age += dtS;
            const t = f.age / f.life;
            if (t >= 1) { f.m.visible = false; continue; }
            f.m.position.x += f.vx * dtS; f.m.position.y += f.vy * dtS;
            f.vx *= 0.96; f.vy *= 0.96;
            f.m.rotation.x += f.rx * dtS; f.m.rotation.y += f.ry * dtS; f.m.rotation.z += f.rz * dtS;
            f.m.scale.setScalar(f.s0 * (1 - t * 0.5));
            f.m.material.opacity = 1 - t * t;
        }
    }

    // ------------------------------------------- minerals & coins (instanced)
    const PICK_CAP = 420;
    // mineral crystal: faceted elongated bipyramid
    const gemGeo = new THREE.LatheGeometry([new THREE.Vector2(0.001, -1.2), new THREE.Vector2(0.62, -0.35), new THREE.Vector2(0.62, 0.35), new THREE.Vector2(0.001, 1.2)], 6);
    gemGeo.computeVertexNormals();
    const gemMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.3, metalness: 0.15, emissive: 0xffffff, emissiveIntensity: 0.07 });
    // exposed read-only so the HUD mineral icons render the SAME gem the drops use (see the HUD icon module at the end of this file)
    G.gemShape = { geo: gemGeo, flatShading: true, roughness: 0.3, metalness: 0.15, emissiveIntensity: 0.07 };
    const gems = new THREE.InstancedMesh(gemGeo, gemMat, PICK_CAP);
    gems.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PICK_CAP * 3), 3);
    gems.frustumCulled = false; gems.count = 0; scene.add(gems);

    // ---- per-mineral 3D models: built from the 5 mineral-world-*.png drop sprites (Iron/Bronze/Gold/Diamond/Uranium).
    // One shared definition: the gameplay drops AND the Minerals HUD icons both use these exact models.
    const MIN_KINDS = ['iron', 'bronze', 'gold', 'diamond', 'uranium'];
    const MIN_COLOR_KIND = { '#8e8e93': 'iron', '#cd7f32': 'bronze', '#d4af37': 'gold', '#8fe9ff': 'diamond', '#39ff14': 'uranium' };
    const MIN_MODELS = (function () {
        const rnd = (x, y, z, k) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.3) * 43758.5453; return v - Math.floor(v); };
        const tri = new THREE.Triangle(), nrm = new THREE.Vector3(), cen = new THREE.Vector3();
        // piece: non-indexed geometry (already transformed). colorFn(centroid, normal, faceRnd) -> THREE.Color | null (null = skip face)
        function addPiece(out, geo, colorFn, push) {
            const g = geo.index ? geo.toNonIndexed() : geo;
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i += 3) {
                tri.a.fromBufferAttribute(p, i); tri.b.fromBufferAttribute(p, i + 1); tri.c.fromBufferAttribute(p, i + 2);
                tri.getNormal(nrm); tri.getMidpoint(cen);
                const col = colorFn(cen, nrm, rnd(cen.x, cen.y, cen.z, 3));
                if (!col) continue;
                const o = push ? nrm.clone().multiplyScalar(push) : null;
                [tri.a, tri.b, tri.c].forEach(v => {
                    out.pos.push(v.x + (o ? o.x : 0), v.y + (o ? o.y : 0), v.z + (o ? o.z : 0));
                    out.col.push(col.r, col.g, col.b);
                });
            }
        }
        function lump(radius, detail, sx, sy, sz, jit, seed) { // rounded, faceted boulder
            const g = new THREE.IcosahedronGeometry(radius, detail), pa = g.attributes.position, v = new THREE.Vector3();
            for (let i = 0; i < pa.count; i++) {
                v.fromBufferAttribute(pa, i);
                const k = 1 - jit + 2 * jit * rnd(v.x, v.y, v.z, seed);
                pa.setXYZ(i, v.x * sx * k, v.y * sy * k, v.z * sz * k);
            }
            return g;
        }
        const C = (hex) => new THREE.Color(hex);
        // facet shading: top faces catch light, downward faces sit darker, random facets break up the surface
        function rockCol(hex, crack) {
            const base = C(hex);
            return (c, n, r) => {
                const k = (0.82 + 0.32 * r) * (n.y > 0.5 ? 1.18 : (n.y < -0.3 ? 0.68 : 1)) * (crack && r > 0.86 ? 0.62 : 1);
                return base.clone().multiplyScalar(k);
            };
        }
        function finish(rock, acc, matRock, matAcc, radius) {
            const pos = rock.pos.concat(acc.pos), col = rock.col.concat(acc.col);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            geo.computeBoundingBox(); geo.computeBoundingSphere();
            const bb = geo.boundingBox, ctr = bb.getCenter(new THREE.Vector3());
            const k = radius / Math.max(0.0001, geo.boundingSphere.radius * 0.9);
            geo.translate(-ctr.x, -ctr.y, -ctr.z); geo.scale(k, k, k);
            geo.addGroup(0, rock.pos.length / 3, 0);
            if (acc.pos.length) geo.addGroup(rock.pos.length / 3, acc.pos.length / 3, 1);
            geo.computeVertexNormals(); // non-indexed -> flat facets
            return { geo, mats: [matRock, matAcc] };
        }
        const rockMat = (rough, met) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: rough, metalness: met });
        const accMat = (rough, met, em, ei) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: rough, metalness: met, emissive: em, emissiveIntensity: ei });
        const M = {};
        const nw = () => ({ pos: [], col: [] });
        // IRON: smooth grey cracked boulder
        { const r = nw(), a = nw();
          addPiece(r, lump(1, 1, 1.0, 0.86, 0.92, 0.1, 1), rockCol('#8e8e93', true));
          M.iron = finish(r, a, rockMat(0.62, 0.35), accMat(0.5, 0.3, 0x000000, 0), 1.15); }
        // BRONZE: brown boulder with raised copper-orange veins
        { const r = nw(), a = nw(), vein = (c) => Math.abs(c.y * 1.0 - c.x * 0.75 + 0.28 * Math.sin(c.z * 4.2)) < 0.17 || Math.abs(c.x * 0.9 + c.y * 0.55 - 0.45) < 0.11;
          const g = lump(1, 1, 0.98, 0.88, 0.92, 0.1, 2);
          const rc = rockCol('#a06a3e', false), ac = rockCol('#e07a2c', false);
          addPiece(r, g, (c, n, k) => vein(c) ? null : rc(c, n, k));
          addPiece(a, g, (c, n, k) => vein(c) ? ac(c, n, 0.5) : null, 0.05);
          M.bronze = finish(r, a, rockMat(0.7, 0.2), accMat(0.45, 0.45, 0x3a1500, 0.55), 1.15); }
        // GOLD: black angular shard with three gold nuggets
        { const r = nw(), a = nw();
          addPiece(r, lump(1, 0, 1.12, 1.0, 0.95, 0.16, 5), rockCol('#34353f', true));
          const nug = [[-0.62, 0.38, 0.55, 0.62], [0.6, -0.3, 0.66, 0.55], [0.1, 0.82, 0.5, 0.48]];
          nug.forEach((n, i) => { const t = new THREE.TetrahedronGeometry(n[3], 0); t.scale(1.15, 0.8, 0.9); t.rotateY(i * 1.9); t.rotateZ(i * 0.8 + 0.4); t.translate(n[0], n[1], n[2]); addPiece(a, t, rockCol('#f0bc2c', false)); });
          M.gold = finish(r, a, rockMat(0.5, 0.2), accMat(0.28, 0.65, 0x5a3a00, 0.7), 1.15); }
        // DIAMOND: clear octahedral crystal on grey stones
        { const r = nw(), a = nw();
          const stones = [[-0.5, -0.78, 0.1, 0.46], [0.48, -0.8, 0.08, 0.46], [0.0, -0.82, 0.48, 0.44], [0.04, -0.8, -0.46, 0.42]];
          stones.forEach((n, i) => { const g = lump(n[3], 0, 1.15, 0.72, 1.0, 0.14, 7 + i); g.translate(n[0], n[1], n[2]); addPiece(r, g, rockCol('#7f8189', false)); });
          const oc = new THREE.OctahedronGeometry(1.2, 0); oc.scale(1, 1.0, 1); oc.rotateY(Math.PI / 4); oc.translate(0, 0.22, 0);
          const dc = (c, n, k) => C('#d8f6ff').lerp(C('#8fe9ff'), (n.y < 0 ? 0.55 : 0.12) + 0.3 * k).multiplyScalar(n.y > 0.4 ? 1.12 : 0.92);
          addPiece(a, oc, dc);
          M.diamond = finish(r, a, rockMat(0.8, 0.1), accMat(0.12, 0.25, 0x2a5566, 0.6), 1.15); }
        // URANIUM: dark rock with glowing green veins
        { const r = nw(), a = nw(), vein = (c) => (Math.abs(c.x * 0.95 + 0.3 * Math.sin(c.y * 5)) < 0.17 && c.y > -0.35) || (Math.abs((c.x - 0.45) - (c.y - 0.1) * 0.9) < 0.12 && c.y < 0.35 && c.y > -0.5);
          const g = lump(1, 1, 1.0, 0.8, 0.95, 0.12, 11);
          const rc = rockCol('#3b4340', true), ac = rockCol('#5cff22', false);
          addPiece(r, g, (c, n, k) => vein(c) ? null : rc(c, n, k));
          addPiece(a, g, (c, n, k) => vein(c) ? ac(c, n, 0.6) : null, 0.05);
          M.uranium = finish(r, a, rockMat(0.75, 0.15), accMat(0.35, 0.1, 0x20b000, 1.1), 1.15); }
        return M;
    })();
    G.mineralModels = MIN_MODELS;
    const minMeshes = {}, nMin = {};
    MIN_KINDS.forEach(k => { const m = new THREE.InstancedMesh(MIN_MODELS[k].geo, MIN_MODELS[k].mats, PICK_CAP); m.frustumCulled = false; m.count = 0; scene.add(m); minMeshes[k] = m; nMin[k] = 0; });
    function mineralKindOf(colorCss, img) {
        if (img && img.src) { const m = /mineral-world-([a-z]+)\.png/i.exec(img.src); if (m && MIN_MODELS[m[1].toLowerCase()]) return m[1].toLowerCase(); }
        return colorCss ? (MIN_COLOR_KIND[String(colorCss).toLowerCase()] || null) : null;
    }
    // gem emissive uses the instance colour too (via onBeforeCompile-free trick: emissive white * color would not tint),
    // so tint emission by making the base colour bright and emissive low.
    // coin: gold rim + slightly smaller textured face (existing coin.png artwork)
    const rimGeo = new THREE.CylinderGeometry(1, 1, 0.22, 28); rimGeo.rotateX(Math.PI / 2);
    const faceGeo = new THREE.CylinderGeometry(0.84, 0.84, 0.3, 28); faceGeo.rotateX(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe0a21a, roughness: 0.35, metalness: 0.35, emissive: 0x5a3a00, emissiveIntensity: 0.6 });
    const faceEdgeMat = new THREE.MeshStandardMaterial({ color: 0xeab232, roughness: 0.35, metalness: 0.3, emissive: 0x4a3000, emissiveIntensity: 0.5 });
    const faceMatFront = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.4, metalness: 0.2, emissive: 0x4a3200, emissiveIntensity: 0.5 });
    const faceMatBack = faceMatFront.clone();
    const coinRims = new THREE.InstancedMesh(rimGeo, rimMat, PICK_CAP);
    const coinFaces = new THREE.InstancedMesh(faceGeo, [faceEdgeMat, faceMatFront, faceMatBack], PICK_CAP);
    coinRims.frustumCulled = coinFaces.frustumCulled = false; coinRims.count = coinFaces.count = 0;
    scene.add(coinRims, coinFaces);
    let coinTexImg = null;
    function ensureCoinTexture(img) {
        if (!img || img === coinTexImg || !(img.complete && img.naturalWidth)) return;
        coinTexImg = img;
        const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
        faceMatFront.map = tex; faceMatFront.emissiveMap = tex; faceMatFront.emissive.set(0xffffff); faceMatFront.emissiveIntensity = 0.55; faceMatFront.color.set(0xffffff); faceMatFront.needsUpdate = true;
        faceMatBack.map = tex; faceMatBack.emissiveMap = tex; faceMatBack.emissive.set(0xffffff); faceMatBack.emissiveIntensity = 0.55; faceMatBack.color.set(0xffffff); faceMatBack.needsUpdate = true;
    }
    let nGem = 0, nCoin = 0;
    // src is the game's own pickup object; o: {x,y,pop,rot,size,coin(bool),color,img}
    G.pickup = function (x, y, pop, rot, size, isCoin, colorCss, img, phase) {
        const sx = toX(x), sy = toY(y);
        const s = (size / 2) * T.a * pop;
        if (isCoin) {
            if (nCoin >= PICK_CAP) return;
            ensureCoinTexture(img);
            tmpE.set(0.3, rot, 0.0);
            tmpQ.setFromEuler(tmpE);
            tmpP.set(sx, sy, 110); tmpS.set(s, s, s * 1.0);
            tmpM.compose(tmpP, tmpQ, tmpS);
            coinRims.setMatrixAt(nCoin, tmpM); coinFaces.setMatrixAt(nCoin, tmpM);
            nCoin++;
        } else {
            const mk = mineralKindOf(colorCss, img);
            if (mk) { // the mineral's own model (same one the HUD icon shows)
                const mi = nMin[mk]; if (mi >= PICK_CAP) return;
                tmpE.set(0.35, rot, 0); tmpQ.setFromEuler(tmpE);
                tmpP.set(sx, sy, 105); tmpS.set(s * 0.85, s * 0.85, s * 0.85);
                tmpM.compose(tmpP, tmpQ, tmpS);
                minMeshes[mk].setMatrixAt(mi, tmpM); nMin[mk] = mi + 1;
                return;
            }
            if (nGem >= PICK_CAP) return;
            tmpE.set(0.35, rot, Math.sin(rot * 0.5) * 0.15);
            tmpQ.setFromEuler(tmpE);
            tmpP.set(sx, sy, 105); tmpS.set(s * 0.82, s * 0.82, s * 0.82);
            tmpM.compose(tmpP, tmpQ, tmpS);
            gems.setMatrixAt(nGem, tmpM);
            try { tmpC.set(colorCss || '#ffffff'); } catch (e) { tmpC.set(0xffffff); }
            tmpC.lerp(whiteC, 0.15);
            gems.setColorAt(nGem, tmpC);
            nGem++;
        }
    };
    const whiteC = new THREE.Color(0xffffff);

    // -------------------------------------------------- distant rocks (bg)
    const BG_ROCK_CAP = 90;
    const bgRockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
    const bgRocks = new THREE.InstancedMesh(ROCK_GEOS[3][0], bgRockMat, BG_ROCK_CAP);
    bgRocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BG_ROCK_CAP * 3), 3);
    bgRocks.frustumCulled = false; bgRocks.count = 0; scene.add(bgRocks);
    let nBgRock = 0;
    // sx,sy already in screen px (Y-down); size in px; alpha from the game's existing value
    function bgRock(sx, sy, size, alpha, spin, img, z, variantSeed) {
        if (nBgRock >= BG_ROCK_CAP) return;
        const base = sampleImageColor(img, '#666') || whiteC;
        tmpC.copy(base);
        const vis = Math.min(1, alpha * 2.6); // original art was drawn at 16-30% alpha - blend toward the sky colour instead
        tmpC.lerp(clearCol, 1 - vis);
        tmpE.set(hash(variantSeed) * 2, hash(variantSeed + 3) * 2, -spin);
        tmpQ.setFromEuler(tmpE);
        const r = size * 0.5 * T.a;
        tmpP.set(sx, H - sy, z); tmpS.set(r, r, r);
        tmpM.compose(tmpP, tmpQ, tmpS);
        bgRocks.setMatrixAt(nBgRock, tmpM);
        bgRocks.setColorAt(nBgRock, tmpC);
        nBgRock++;
    }
    // normal level: the game's own decorative background mineral (already wandered/wrapped by the game)
    G.bgRock = function (m, drawX, drawY) {
        bgRock(toX(drawX), drawY * T.a + T.by, m.size, m.alpha, m.spin, m.objDef && m.objDef.img, -220 + m.depth * 100, (m.size * 13) | 0);
    };

    // --------------------------------------------------- stars (game's own)
    const gameStars = makePoints(200, false, -480);
    const deepStars = makePoints(170, false, -500);
    const deepBase = [];
    for (let i = 0; i < 170; i++) deepBase.push({ x: hash(i * 1.3) * 2400, y: hash(i * 2.7 + 5) * 1400, d: 0.04 + hash(i * 3.1) * 0.12, s: 1 + hash(i * 4.9) * 1.6, ph: hash(i) * 6.28, tint: hash(i * 6.7) });
    let nGameStar = 0;
    G.stars = function (stars, cX, cY, spanX, spanY, vcX, vcY) {
        const n = Math.min(stars.length, gameStars.N);
        for (let i = 0; i < n; i++) {
            const st = stars[i];
            const dx = ((st.x - cX * st.depth) % spanX + spanX) % spanX + vcX - spanX / 2;
            const dy = ((st.y - cY * st.depth) % spanY + spanY) % spanY + vcY - spanY / 2;
            gameStars.pos[i * 3] = toX(dx); gameStars.pos[i * 3 + 1] = toY(dy); gameStars.pos[i * 3 + 2] = 0;
            gameStars.sz[i] = Math.max(1.5, st.size * T.a * 1.2);
            gameStars.al[i] = 0.75 + 0.25 * st.depth;
            gameStars.col[i * 3] = 1; gameStars.col[i * 3 + 1] = 1; gameStars.col[i * 3 + 2] = 1;
        }
        for (let i = n; i < gameStars.N; i++) { gameStars.sz[i] = 0; gameStars.al[i] = 0; }
        flag(gameStars); nGameStar = n;
    };
    G.esStars = function (list) {
        const n = Math.min(list.length, gameStars.N);
        for (let i = 0; i < n; i++) {
            const s = list[i];
            gameStars.pos[i * 3] = toX(s.x); gameStars.pos[i * 3 + 1] = toY(s.baseY + Math.sin(s.bobPhase) * s.bobAmp); gameStars.pos[i * 3 + 2] = 0;
            gameStars.sz[i] = Math.max(1.5, s.size * T.a * 1.2); gameStars.al[i] = 0.9;
            gameStars.col[i * 3] = gameStars.col[i * 3 + 1] = gameStars.col[i * 3 + 2] = 1;
        }
        for (let i = n; i < gameStars.N; i++) { gameStars.sz[i] = 0; gameStars.al[i] = 0; }
        flag(gameStars);
    };
    G.esRock = function (o, z) {
        bgRock(toX(o.x), (o.baseY + Math.sin(o.bobPhase) * o.bobAmp) * T.a + T.by, o.size, o.alpha, o.spin, o.objDef && o.objDef.img, z, (o.size * 17) | 0);
    };

    // nebula: soft additive colour clouds (one tiny generated gradient texture, shared)
    const nebCv = document.createElement('canvas'); nebCv.width = nebCv.height = 128;
    (function () { const c = nebCv.getContext('2d'); const g = c.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); })();
    const nebTex = new THREE.CanvasTexture(nebCv); nebTex.colorSpace = THREE.SRGBColorSpace;
    const NEB = [];
    for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: nebTex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        m.position.z = -420 + i * 4; m.frustumCulled = false; scene.add(m);
        NEB.push({ m, bx: hash(i * 5.1) * 2000, by: hash(i * 8.3) * 1100, d: 0.02 + i * 0.012, size: 700 + hash(i * 2.2) * 600 });
    }
    // floating debris: tiny low-poly shards on a mid parallax layer
    const DEBRIS_N = 46;
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x6b6f80, flatShading: true, roughness: 1, metalness: 0.1 });
    const debris = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), debrisMat, DEBRIS_N);
    debris.frustumCulled = false; scene.add(debris);
    const debrisBase = [];
    for (let i = 0; i < DEBRIS_N; i++) debrisBase.push({ x: hash(i * 1.9 + 1) * 2600, y: hash(i * 3.3 + 2) * 1600, d: 0.3 + hash(i * 5.3) * 0.25, s: 2 + hash(i * 7.7) * 4, rx: hash(i) * 3, ry: hash(i + 9) * 3, sp: (hash(i + 4) - 0.5) * 1.2, z: -60 - hash(i * 2.1) * 60 });

    function updateBackground() {
        // clear colour comes from the game's own palette cycle; nebula tints derive from it
        if (frameNo % 6 === 0) {
            for (let i = 0; i < NEB.length; i++) {
                tmpC.copy(clearCol);
                tmpC.offsetHSL(i % 2 ? -0.07 : 0.09, 0.35, 0.16 + i * 0.02);
                NEB[i].m.material.color.copy(tmpC);
            }
        }
        const drift = mode === 'es' ? timeMs * 0.004 : 0;
        const cx = mode === 'es' ? 0 : camX * T.a, cy = mode === 'es' ? 0 : camY * T.a;
        for (let i = 0; i < NEB.length; i++) {
            const n = NEB[i];
            const spanX = W + n.size, spanY = H + n.size;
            const px = (((n.bx - cx * n.d - drift * n.d * 6) % spanX) + spanX) % spanX - n.size / 2;
            const py = (((n.by - cy * n.d) % spanY) + spanY) % spanY - n.size / 2;
            n.m.position.x = px; n.m.position.y = H - py;
            n.m.scale.set(n.size, n.size * 0.8, 1);
        }
        // deep star layer (very slow parallax, gentle twinkle)
        const tS = timeMs * 0.001;
        const spX = W + 80, spY = H + 80;
        for (let i = 0; i < deepBase.length; i++) {
            const s = deepBase[i];
            const x = (((s.x - cx * s.d - drift * s.d * 40) % spX) + spX) % spX - 40;
            const y = (((s.y - cy * s.d) % spY) + spY) % spY - 40;
            deepStars.pos[i * 3] = x; deepStars.pos[i * 3 + 1] = H - y; deepStars.pos[i * 3 + 2] = 0;
            deepStars.sz[i] = s.s * 1.3;
            deepStars.al[i] = (0.25 + 0.25 * s.d * 5) * (0.75 + 0.25 * Math.sin(tS * 1.3 + s.ph));
            deepStars.col[i * 3] = 0.7 + 0.3 * s.tint; deepStars.col[i * 3 + 1] = 0.8; deepStars.col[i * 3 + 2] = 1.0 - 0.2 * s.tint;
        }
        flag(deepStars);
        // debris
        const spDX = W + 200, spDY = H + 200;
        for (let i = 0; i < DEBRIS_N; i++) {
            const d = debrisBase[i];
            const x = (((d.x - cx * d.d - drift * d.d * 70) % spDX) + spDX) % spDX - 100;
            const y = (((d.y - cy * d.d) % spDY) + spDY) % spDY - 100;
            tmpE.set(d.rx + tS * d.sp, d.ry + tS * d.sp * 0.7, tS * d.sp);
            tmpQ.setFromEuler(tmpE);
            tmpP.set(x, H - y, d.z); const sc = d.s * T.a; tmpS.set(sc, sc, sc);
            tmpM.compose(tmpP, tmpQ, tmpS);
            debris.setMatrixAt(i, tmpM);
        }
        debris.instanceMatrix.needsUpdate = true;
    }

    // -------------------------------------------------------------- the Jet
    const jetGroup = new THREE.Group(); jetGroup.visible = false; scene.add(jetGroup);
    const jetBank = new THREE.Group(); jetGroup.add(jetBank);
    const jetMats = [];
    function jm(m) { jetMats.push(m); return m; }
    const hullMat = jm(new THREE.MeshStandardMaterial({ color: 0x65748e, metalness: 0.3, roughness: 0.42 }));
    const wingMat = jm(new THREE.MeshStandardMaterial({ color: 0x46526a, metalness: 0.3, roughness: 0.5 }));
    const goldMat = jm(new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.45, roughness: 0.35, emissive: 0x4a3400, emissiveIntensity: 0.6 }));
    const glassMat = jm(new THREE.MeshStandardMaterial({ color: 0x22c8ff, metalness: 0.2, roughness: 0.05, emissive: 0x0a6f99, emissiveIntensity: 0.9 }));
    const cyanMat = jm(new THREE.MeshBasicMaterial({ color: 0x33ecff }));
    const flameMat = jm(new THREE.MeshBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    function shapeMesh(pts, depth, mat, bevel) {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
        sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
        g.translate(0, 0, -depth / 2);
        return new THREE.Mesh(g, mat);
    }
    (function buildJet() {
        // fuselage (nose points +X)
        jetBank.add(shapeMesh([[0.5, 0], [0.26, 0.055], [0.0, 0.095], [-0.28, 0.085], [-0.43, 0.06], [-0.43, -0.06], [-0.28, -0.085], [0.0, -0.095], [0.26, -0.055]], 0.1, hullMat, 0.012));
        // delta wings (mirrored)
        for (const sgn of [1, -1]) {
            jetBank.add(shapeMesh([[0.14, 0.07 * sgn], [-0.2, 0.47 * sgn], [-0.36, 0.47 * sgn], [-0.33, 0.1 * sgn]], 0.03, wingMat, 0.008));
            // tail planes
            jetBank.add(shapeMesh([[-0.3, 0.08 * sgn], [-0.42, 0.25 * sgn], [-0.47, 0.25 * sgn], [-0.43, 0.06 * sgn]], 0.022, wingMat, 0.006));
            // cyan wing-tip tech strip
            const strip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.014, 0.012), cyanMat);
            strip.position.set(-0.17, 0.4 * sgn, 0.03); strip.rotation.z = -0.68 * sgn * -1 * 1; jetBank.add(strip);
            // gold panel line on wing
            const gl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.006), goldMat);
            gl.position.set(-0.03, 0.22 * sgn, 0.032); gl.rotation.z = 0.75 * sgn; jetBank.add(gl);
            // canted vertical fin
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.11), wingMat);
            fin.position.set(-0.33, 0.065 * sgn, 0.08); fin.rotation.x = 0.4 * sgn; fin.rotation.z = 0.12 * sgn; jetBank.add(fin);
            // engine nacelle + nozzle ring + flame
            const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.14, 12), hullMat); eng.rotation.z = Math.PI / 2; eng.position.set(-0.41, 0.055 * sgn, 0); jetBank.add(eng);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.01, 6, 14), cyanMat); ring.rotation.y = Math.PI / 2; ring.position.set(-0.485, 0.055 * sgn, 0); jetBank.add(ring);
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 10), flameMat); flame.rotation.z = Math.PI / 2; flame.position.set(-0.6, 0.055 * sgn, 0); flame.userData.flame = true; jetBank.add(flame);
        }
        // cockpit canopy
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), glassMat); canopy.scale.set(0.15, 0.048, 0.05); canopy.position.set(0.14, 0, 0.06); jetBank.add(canopy);
        // gold spine + nose accent
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.008), goldMat); spine.position.set(-0.12, 0, 0.056); jetBank.add(spine);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 8), goldMat); nose.rotation.z = -Math.PI / 2; nose.position.set(0.48, 0, 0); jetBank.add(nose);
        // glowing engine core light
        const glow = new THREE.PointLight(0x33ecff, 0.0, 0); // intentionally off - only emissive materials are used (keeps light count low)
        jetBank.add(glow);
    })();
    let jetPrevY = null, jetTransp = false, jetVy = 0;
    G.jet = function (x, y, alpha, size) {
        jetGroup.visible = true; jetSeen = epoch;
        const sx = toX(x), sy = toY(y);
        if (jetPrevY !== null) { const dy = sy - jetPrevY; jetVy += (dy / Math.max(0.008, dt) - jetVy) * 0.25; } else jetVy = 0;
        jetPrevY = sy;
        const k = Math.max(-1, Math.min(1, jetVy / 400));
        jetBank.rotation.x = k * 0.7;   // bank into vertical movement (visual only)
        jetBank.rotation.z = k * 0.16;  // slight pitch
        const s = size * T.a * 1.04;
        jetGroup.position.set(sx, sy, 150);
        jetGroup.scale.set(s, s, s);
        const tr = alpha < 0.995;
        if (tr !== jetTransp) { jetTransp = tr; for (const m of jetMats) { if (m !== flameMat) { m.transparent = tr; m.needsUpdate = true; } } }
        for (const m of jetMats) if (m !== flameMat) m.opacity = alpha; else m.opacity = 0.85 * alpha;
        // engine flame flicker + exhaust particles
        const fl = 0.8 + Math.random() * 0.45;
        jetBank.children.forEach(c => { if (c.userData.flame) { c.scale.set(fl, 1, 1); } });
        const n = dt > 0.03 ? 3 : 2;
        for (let i = 0; i < n; i++) {
            const side = (i & 1) ? 1 : -1;
            exhaust.spawn(sx - s * 0.5, sy + side * s * 0.055 + (Math.random() - 0.5) * 3, -110 - Math.random() * 120, (Math.random() - 0.5) * 30, 5 + Math.random() * 5 * T.a, 0.35 + Math.random() * 0.25, 0.3, 0.9, 1.0);
        }
    };
    let jetSeen = 0;

    // ------------------------------------------------------------ the Drill
    // 2.5D version of the existing Drill (drill-frame-*.png): steel rear cowl, three glowing cyan
    // energy cells in a dark housing, teal collar, and a threaded conical bit, nose along +X exactly
    // like the sprite. Visual only - the game still owns position, angle, speed, damage, hits and
    // lifetime; it just hands them in via GTD3D.drill(). One pooled model per live Drill.
    // The bit's thread turns once per 20 game ticks = the sprite's original 5 frames x 4 ticks.
    const DRILL_TILT_X = 0.32, DRILL_TILT_Y = -0.26; // fixed visual tilt so the extrusion/depth reads (orthographic camera)
    const drillMats = {
        // low metalness on purpose: there is no environment map in this scene, so high-metal surfaces render near-black
        steel: new THREE.MeshStandardMaterial({ color: 0xc9dbe8, metalness: 0.22, roughness: 0.3, emissive: 0x1c2a36, emissiveIntensity: 0.55 }),
        steelDk: new THREE.MeshStandardMaterial({ color: 0x8aa0b4, metalness: 0.25, roughness: 0.4, emissive: 0x101c28, emissiveIntensity: 0.5 }),
        teal: new THREE.MeshStandardMaterial({ color: 0x45aebf, metalness: 0.25, roughness: 0.32, emissive: 0x0a4452, emissiveIntensity: 0.8 }),
        tealDk: new THREE.MeshStandardMaterial({ color: 0x1f6f82, metalness: 0.25, roughness: 0.4, emissive: 0x062a36, emissiveIntensity: 0.7 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x0a1626, metalness: 0.2, roughness: 0.6 }),
        bit: new THREE.MeshStandardMaterial({ color: 0xeef5fa, metalness: 0.25, roughness: 0.22, emissive: 0x24323e, emissiveIntensity: 0.5 }),
        core: new THREE.MeshStandardMaterial({ color: 0xa9bccb, metalness: 0.25, roughness: 0.35, emissive: 0x16222e, emissiveIntensity: 0.5 }),
        cell: new THREE.MeshBasicMaterial({ color: 0x6af2ff }),
        trim: new THREE.MeshBasicMaterial({ color: 0x33dcff }),
        shine: new THREE.MeshBasicMaterial({ color: 0xf2fbff })
    };
    const drillGeo = (function () {
        const bev = (pts, depth, b) => {
            const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
            sh.closePath();
            const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 8 });
            g.translate(0, 0, -depth / 2); return g;
        };
        // rear cowl silhouette (rounded tail, widest at the collar), mirrored top/bottom
        const half = [[-0.5, 0.075], [-0.485, 0.125], [-0.44, 0.165], [-0.36, 0.188], [-0.2, 0.196], [-0.06, 0.19]];
        const cowl = half.concat(half.slice().reverse().map(p => [p[0], -p[1]]));
        const g = {};
        g.cowl = bev(cowl, 0.2, 0.034);
        g.plateTail = bev([[-0.47, 0.06], [-0.34, 0.06], [-0.34, -0.06], [-0.47, -0.06]], 0.2, 0.01); // raised rear armour plate
        g.housing = new THREE.BoxGeometry(0.26, 0.33, 0.034);
        g.cell = new THREE.BoxGeometry(0.17, 0.056, 0.02);
        g.sep = new THREE.BoxGeometry(0.2, 0.014, 0.024);
        g.cellEnd = new THREE.BoxGeometry(0.022, 0.056, 0.022);
        g.rail = new THREE.BoxGeometry(0.3, 0.03, 0.02);
        g.shine = new THREE.BoxGeometry(0.17, 0.012, 0.006);
        g.bolt = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8);
        g.collar = new THREE.CylinderGeometry(0.208, 0.208, 0.125, 24); g.collar.rotateZ(Math.PI / 2);
        g.ring = new THREE.TorusGeometry(0.21, 0.0065, 6, 32); g.ring.rotateY(Math.PI / 2);
        g.slit = new THREE.BoxGeometry(0.02, 0.05, 0.012);
        g.strip = new THREE.BoxGeometry(0.12, 0.012, 0.012);
        g.core = new THREE.CylinderGeometry(0.014, 0.15, 0.47, 24); g.core.rotateZ(-Math.PI / 2); g.core.translate(0.235, 0, 0); // tip toward +X
        // helical thread following the cone surface
        const pts = [], turns = 5, N = 120;
        for (let i = 0; i <= N; i++) { const t = i / N, r = 0.152 * (1 - t) + 0.012, a = turns * Math.PI * 2 * t; pts.push(new THREE.Vector3(0.46 * t, r * Math.cos(a), r * Math.sin(a))); }
        g.thread = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.024, 8, false);
        g.tip = new THREE.ConeGeometry(0.016, 0.07, 8); g.tip.rotateZ(-Math.PI / 2); g.tip.translate(0.465, 0, 0);
        return g;
    })();
    const drillPool = [];
    function buildDrill() {
        const m = drillMats, g = drillGeo;
        const root = new THREE.Group(), aim = new THREE.Group(), model = new THREE.Group();
        root.rotation.set(DRILL_TILT_X, DRILL_TILT_Y, 0, 'XYZ');
        root.add(aim); aim.add(model);
        const add = (geo, mat, x, y, z) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); model.add(mesh); return mesh; };
        add(g.cowl, m.steel, 0, 0, 0);
        add(g.plateTail, m.steelDk, 0, 0, 0.012);
        // cowl front face sits at z = 0.134 (half depth + bevel); every detail layer below stands proud of it
        // teal edge rails top/bottom + bright highlight, like the sprite's banded cowl
        add(g.rail, m.tealDk, -0.2, 0.158, 0.145); add(g.rail, m.tealDk, -0.2, -0.158, 0.145);
        add(g.shine, m.shine, -0.4, 0.118, 0.141); add(g.shine, m.shine, -0.4, -0.118, 0.141);
        // cell housing: three separate glowing cells, dark gaps and steel separators, bolts at the corners
        add(g.housing, m.dark, -0.155, 0, 0.15);
        for (const cy of [0.095, 0, -0.095]) { add(g.cell, m.cell, -0.155, cy, 0.168); add(g.cellEnd, m.steelDk, -0.255, cy, 0.166); add(g.cellEnd, m.steelDk, -0.055, cy, 0.166); }
        for (const sy of [0.0475, -0.0475]) add(g.sep, m.steelDk, -0.155, sy, 0.164);
        for (const bx of [-0.27, -0.04]) for (const by of [0.14, -0.14]) { const b = add(g.bolt, m.steelDk, bx, by, 0.166); b.rotation.x = Math.PI / 2; }
        add(g.strip, m.trim, -0.4, 0, 0.142);
        add(g.collar, m.teal, -0.035, 0, 0);
        add(g.ring, m.trim, -0.095, 0, 0); add(g.ring, m.trim, 0.025, 0, 0);
        for (const sy of [0.1, 0, -0.1]) add(g.slit, m.trim, -0.035, sy, 0.212);
        const bit = new THREE.Group(); bit.position.x = 0.03; model.add(bit);
        const addb = (geo, mat) => bit.add(new THREE.Mesh(geo, mat));
        addb(g.core, m.core); addb(g.thread, m.bit); addb(g.tip, m.bit);
        root.visible = false; root.userData.bit = bit; root.userData.aim = aim;
        scene.add(root);
        return root;
    }
    for (let i = 0; i < 4; i++) drillPool.push(buildDrill()); // pre-built so the first Drill deploy does not hitch
    let drillUsed = 0;
    // x,y = the Drill's (jittered) world position, angle = its existing facing angle (radians, y-down world),
    // spinFrame = its existing spin counter (0..19), length = its existing on-screen nose-to-tail length (world px).
    // VISUAL SIZE of the three hand-held weapon assets (Drill, Pickaxe / Axe, Rocket / Missile): 0.87 = 13% smaller than they were. This is the ONE knob; it only scales the drawn
    // model about the point the game already positions it at (drill / rocket centre, the axe's pivot), so every game-owned value - positions, trajectory, hit tests, thrust-particle
    // anchors, swing timing, damage - is untouched. The Girl and everything else keep their size.
    const WEAPON_SCALE = 0.87;
    G.drill = function (x, y, angle, spinFrame, length) {
        if (!G.active) return;
        if (drillUsed >= drillPool.length) drillPool.push(buildDrill());
        const d = drillPool[drillUsed++];
        const s = (length || 34) * T.a * WEAPON_SCALE;
        // The game spawns the drill's blue/orange thrust flame at a FIXED distance behind its centre, so the drill is shrunk about its TAIL (the thrust end), not its centre: the
        // nozzle stays exactly where that flame expects it and only the nose pulls back. DRILL_TAIL = the model's tail extent behind its centre, in units of its length (measured).
        const DRILL_TAIL = 0.544, back = DRILL_TAIL * (1 - WEAPON_SCALE) * (length || 34) * T.a;   // world px to slide the shrunken model back along its own axis
        d.visible = true;
        d.position.set(toX(x) - Math.cos(angle) * back, toY(y) + Math.sin(angle) * back, 260);   // game angle is y-down; the scene is y-up
        d.scale.set(s, s, s);
        d.userData.aim.rotation.z = -angle; // 3D y is up, game y is down
        d.userData.bit.rotation.x = (spinFrame / 20) * Math.PI * 2;
    };


    // ------------------------------------------------------------ the Pickaxe / Axe
    // 2.5D version of the existing Pixel Axe (axe-frame-0..4.png): steel crescent blade with a glowing
    // cyan cutting edge, swept back spike, round hub with cyan indicator lights, and a navy grip with
    // steel collar, neck housing and butt cap. Same silhouette/colours/proportions as the sprite - the
    // model is authored in the sprite's own pixel units (hub at the origin, handle toward -X, blade toward -Y,
    // spike toward +Y). Visual only: the game still owns position, targeting, orbit, swing timing, hit
    // cooldown and damage; it hands them in via GTD3D.axe(). The 5 sprite poses (ready / wind-up / wind-up 2 /
    // impact / recovery) are reproduced as the same 5 discrete poses of one model (rotation about the hub).
    // One pooled model per live axe (1 normally, 2 during Axe Fury).
    const AXE_FRAME_POSE = [ // hub position inside the 96x96 sprite (y-down px) and the sprite's handle rotation (deg, clockwise vs frame 0)
        { hx: 60, hy: 30, rot: 0 }, { hx: 51.5, hy: 24.5, rot: -14 }, { hx: 52, hy: 22, rot: -20 },
        { hx: 60, hy: 59.5, rot: 89 }, { hx: 54.5, hy: 65, rot: 121 }
    ];
    const AXE_TILT_X = DRILL_TILT_X, AXE_TILT_Y = DRILL_TILT_Y; // same fixed visual tilt as the Drill so both read at the same angle
    const axeMats = {
        // low metalness on purpose (no environment map) - same convention as the Drill
        steel: new THREE.MeshStandardMaterial({ color: 0xa8b8c8, metalness: 0.22, roughness: 0.34, emissive: 0x141f2b, emissiveIntensity: 0.55 }),
        steelLt: new THREE.MeshStandardMaterial({ color: 0xd2dfea, metalness: 0.2, roughness: 0.28, emissive: 0x1c2a36, emissiveIntensity: 0.55 }),
        steelDk: new THREE.MeshStandardMaterial({ color: 0x6d8095, metalness: 0.25, roughness: 0.42, emissive: 0x0e1824, emissiveIntensity: 0.5 }),
        navy: new THREE.MeshStandardMaterial({ color: 0x2b466b, metalness: 0.2, roughness: 0.45, emissive: 0x0a1626, emissiveIntensity: 0.7 }),
        navyDk: new THREE.MeshStandardMaterial({ color: 0x182a45, metalness: 0.2, roughness: 0.55, emissive: 0x050b14, emissiveIntensity: 0.6 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x0a1626, metalness: 0.2, roughness: 0.6 }),
        edge: new THREE.MeshBasicMaterial({ color: 0x33e6ff }),
        edgeHot: new THREE.MeshBasicMaterial({ color: 0xcffbff }),
        glow: new THREE.MeshBasicMaterial({ color: 0x1fd6ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
        light: new THREE.MeshBasicMaterial({ color: 0x6af2ff })
    };
    const axeGeo = (function () {
        const g = {};
        const ext = (pts, depth, b) => {
            const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
            sh.closePath();
            const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
            geo.translate(0, 0, -depth / 2); return geo;
        };
        const cyl = (r0, r1, len, x) => { const c = new THREE.CylinderGeometry(r1, r0, len, 20); c.rotateZ(Math.PI / 2); c.translate(x, 0, 0); return c; }; // axis along X
        // crescent cutting edge, sampled along a smooth arc (upper tip -> lower tip), blade side = -Y
        const arc = new THREE.SplineCurve([[28, -9.5], [23.5, -17.5], [13, -23.2], [0, -25.5], [-13, -25], [-24, -23.5], [-33.5, -17]].map(p => new THREE.Vector2(p[0], p[1]))).getPoints(28);
        const N = arc.length - 1, inner = [], innerHot = [];
        for (let i = 0; i <= N; i++) {
            const a = arc[Math.max(0, i - 1)], c = arc[Math.min(N, i + 1)], p = arc[i];
            let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
            if (nx * -p.x + ny * -p.y < 0) { nx = -nx; ny = -ny; } // point toward the hub
            const w = 0.05 + 3.7 * Math.pow(Math.sin(Math.PI * i / N), 0.55), wh = 0.02 + 1.3 * Math.pow(Math.sin(Math.PI * i / N), 0.55);
            inner.push([p.x + nx * w, p.y + ny * w]); innerHot.push([p.x + nx * wh, p.y + ny * wh]);
        }
        const outerPts = arc.map(p => [p.x, p.y]);
        // head plate: crescent blade (outer arc) + swept spike + socket side
        const headPts = outerPts.concat([[-26, -11.5], [-18, -8], [-13, -2], [-11, 7], [-8.2, 14], [-5.5, 22], [-1.5, 31], [3.5, 22], [6, 15], [9, 7], [9.5, 1], [11.5, -6], [18.5, -8]]);
        g.head = ext(headPts, 7, 1.4);
        g.panel = ext([[-8, -5], [-3, -14.5], [7, -16], [13, -9.5], [8.5, 5], [0, 12], [-7, 9]], 9.4, 0.6); // raised armour panel
        g.edge = ext(outerPts.concat(inner.slice().reverse()), 10.6, 0.6);        // glowing cyan cutting edge, proud of both faces
        g.edgeHot = ext(outerPts.concat(innerHot.slice().reverse()), 12.4, 0.3);  // white-hot core along the edge
        g.glow = ext(outerPts.map((p, i) => [p[0] * 1.0, p[1] * 1.0 - 0.0]).concat(inner.map(p => [p[0] * 0.97, p[1] * 0.97]).reverse()), 6, 3.2); // soft halo
        g.shine = ext([[-1.2, 29], [-5, 21.5], [-7.4, 14.5], [-8.4, 13.4], [-4.6, 21]], 8.2, 0.4);
        g.shineR = ext([[-0.6, 29], [3.2, 21.5], [5.6, 15], [8.4, 7], [8.9, 4], [7.4, 6.6], [4.6, 14], [2.2, 21]], 8.2, 0.4);
        g.hub = new THREE.CylinderGeometry(9.2, 9.2, 11.4, 28); g.hub.rotateX(Math.PI / 2);
        g.hubRing = new THREE.TorusGeometry(6.6, 1.15, 8, 28);
        g.hubCore = new THREE.CylinderGeometry(4.6, 4.6, 12.6, 22); g.hubCore.rotateX(Math.PI / 2);
        g.bolt = new THREE.CylinderGeometry(1.1, 1.1, 1.4, 8); g.bolt.rotateX(Math.PI / 2);
        g.lamp = new THREE.BoxGeometry(3.6, 1.7, 1.2);
        g.cap = cyl(7.8, 7.8, 6.4, -64.8); g.capRim = new THREE.TorusGeometry(7.8, 0.9, 6, 20); g.capRim.rotateY(Math.PI / 2);
        g.grip = cyl(6.3, 6.3, 27, -49);
        g.gripRing = new THREE.TorusGeometry(6.4, 0.75, 6, 20); g.gripRing.rotateY(Math.PI / 2);
        g.collar = cyl(7.5, 7.5, 5.4, -33.2); g.collarRing = new THREE.TorusGeometry(7.5, 0.85, 6, 20); g.collarRing.rotateY(Math.PI / 2);
        g.neck = cyl(5.6, 5.6, 22, -19);
        g.housing = ext([[-28, -5.2], [-15, -6], [-11.5, -3.6], [-11.5, 3.6], [-15, 6], [-28, 5.2]], 3.0, 0.8); // ribbed socket plates beside the neck
        g.slit = new THREE.BoxGeometry(5.2, 1.3, 0.9);
        return g;
    })();
    const axePool = [];
    function buildAxe() {
        const m = axeMats, g = axeGeo;
        const root = new THREE.Group(), aim = new THREE.Group(), off = new THREE.Group(), pose = new THREE.Group(), model = new THREE.Group();
        root.rotation.set(AXE_TILT_X, AXE_TILT_Y, 0, 'XYZ');
        root.add(aim); aim.add(off); off.add(pose); pose.add(model);
        const add = (geo, mat, x, y, z, rz) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z || 0); if (rz) mesh.rotation.z = rz; model.add(mesh); return mesh; };
        // head
        add(g.glow, m.glow, 0, 0, 0);
        add(g.head, m.steel, 0, 0, 0);
        add(g.panel, m.steelDk, 0, 0, 0);
        add(g.shine, m.steelLt, 0, 0, 0); add(g.shineR, m.steelLt, 0, 0, 0);
        add(g.edge, m.edge, 0, 0, 0);
        add(g.edgeHot, m.edgeHot, 0, 0, 0);
        add(g.hub, m.steelDk, 0, 0, 0);
        const ring = add(g.hubRing, m.steelLt, 0, 0, 5.9);
        add(g.hubCore, m.steelDk, 0, 0, 0);
        const ring2 = add(g.hubRing, m.steelLt, 0, 0, -5.9);
        // bolts + cyan indicator lights (positions follow the sprite's lights, mapped into model space)
        for (const b of [[-7.5, 9.5], [9.5, 3.5], [-4, -13.5]]) add(g.bolt, m.steelDk, b[0], b[1], 5.6);
        for (const L of [[0.7, 14.8, 0.35], [-6.4, -7.8, -0.5], [-2.1, -10.6, -0.5], [-12.7, 0.2, 1.3]]) add(g.lamp, m.light, L[0], L[1], 5.5, L[2]);
        // grip, collar, neck housing, butt cap
        add(g.cap, m.steel, 0, 0, 0); add(g.capRim, m.steelLt, -62, 0, 0); add(g.capRim, m.steelLt, -67.6, 0, 0);
        add(g.grip, m.navy, 0, 0, 0);
        for (const x of [-60, -53, -46, -39]) add(g.gripRing, m.navyDk, x, 0, 0);
        add(g.collar, m.steelLt, 0, 0, 0); add(g.collarRing, m.steel, -36, 0, 0); add(g.collarRing, m.steel, -30.4, 0, 0);
        add(g.neck, m.steelDk, 0, 0, 0);
        add(g.housing, m.steel, 0, 0, 5.2); add(g.housing, m.steelDk, 0, 0, -5.2);
        for (const sx of [-25, -21, -17]) add(g.slit, m.light, sx, 0, 6.6);
        root.visible = false; root.userData = { aim, off, pose, model };
        scene.add(root);
        return root;
    }
    for (let i = 0; i < 3; i++) axePool.push(buildAxe()); // pre-built so the first Pickaxe deploy / Axe Fury does not hitch
    let axeUsed = 0;
    // x,y = the axe's world position (same anchor the sprite was translated to), rot = the sprite's canvas rotation
    // (radians, clockwise, y-down world: facing angle + PI/4 + swing), frame = the 0..4 sprite pose index, digging = whether the
    // sprite used the strike offset (-10,-40) or the idle/orbit offset (-25,-25) inside its 50x50 box.
    G.axe = function (x, y, rot, frame, digging) {
        if (!G.active) return;
        if (axeUsed >= axePool.length) axePool.push(buildAxe());
        const a = axePool[axeUsed++], u = a.userData;
        const f = AXE_FRAME_POSE[Math.max(0, Math.min(AXE_FRAME_POSE.length - 1, frame | 0))];
        const k = 50 / 96;                                   // sprite px -> world px (the sprite was drawn 50x50)
        a.visible = true;
        a.position.set(toX(x), toY(y), 300);
        u.aim.scale.set(T.a * WEAPON_SCALE, T.a * WEAPON_SCALE, T.a * WEAPON_SCALE);
        u.aim.rotation.z = -rot;                             // 3D y is up, game y is down
        u.off.position.set((digging ? -10 : -25) + 25, -((digging ? -40 : -25) + 25), 0); // sprite centre inside the draw box (y flipped)
        u.off.scale.set(k, k, k);
        u.pose.position.set(f.hx - 48, -(f.hy - 48), 0);     // hub inside the 96px sprite, relative to its centre
        u.pose.rotation.z = (45 - f.rot) * Math.PI / 180;    // model rest pose = frame 0, then the frame's own rotation about the hub
    };


    // ------------------------------------------------------- the Jet Fireball
    // 2.5D version of the existing Extra-Level jet-fire projectile (jet-fire-frame-0..4.png). Same design as the
    // sprite: a rounded arrow-head flame (nose toward +X) with two swept-back lobes, a navy outline, a coloured
    // outer flame, a mid flame, a cream body, a white-hot arrow core and a jagged tail of trailing flame strands.
    // The sprite's own colour cycle (indigo/blue -> cyan -> orange -> crimson, 5 frames x 5 ticks) is kept: the
    // game hands in its existing frameIndex/frameTimer and the layer colours are blended along that same cycle.
    // The model is authored in the sprite's own units (128 x 128 frame, centre at the origin, y up), so the on-screen
    // footprint is exactly the sprite's. Layers are stacked in depth (outline < outer < mid < body < core) with
    // bevelled extrusions, lit by the scene's existing key/rim lights plus a controlled emissive so the bolt stays
    // readable at speed. Visual only: the game still owns spawning, position, speed, range, collision and damage; it
    // just hands position + animation state in via GTD3D.jetFire() - one instance per live bolt.
    // Performance: each layer is ONE InstancedMesh (6 draw calls total however many bolts are alive); the tail
    // flicker is a tiny vertex-shader wave, so no per-bolt geometry or material is created at runtime.
    const FIRE_MAX = 96;                 // far above the ~30 bolts a full-rate 3-way volley keeps alive at once
    const FIRE_Z = 330;                  // in front of asteroids (0), the Jet (150), Drill (260) and Axe (300) - same stacking the 2D sprite had
    const fireUniforms = { uFlameT: { value: 0 } };
    // sprite colour cycle per frame (sampled from the five jet-fire PNGs): [outer, mid, body, core, streaks]
    const FIRE_PAL = [
        [0x241f94, 0x1368dc, 0xfadd67, 0xfdfcd5, 0x1fdee6],   // frame 0: indigo / deep blue, cyan streaks
        [0x0a4fc4, 0x1a8cf0, 0xfde285, 0xfdfcd5, 0x1fdee6],   // frame 1: blue, cyan streaks
        [0x0b75eb, 0x19c6ea, 0xfae59c, 0xfdfcd5, 0xf3a60f],   // frame 2: cyan rim, pale yellow, orange streaks
        [0xee7a08, 0xfca614, 0xfbd8bd, 0xfdfcd5, 0xfc980e],   // frame 3: orange / peach
        [0xb80036, 0xd10a40, 0xe0a030, 0xfdfcd5, 0xcd0035]    // frame 4: crimson / gold
    ].map(row => row.map(h => new THREE.Color(h)));
    const FIRE_NAVY = new THREE.Color(0x012961);
    // Layer contours traced from the original jet-fire-frame-2.png (the full arrow-head frame): silhouette, coloured flame
    // body (its dark notches are holes, so the navy outline layer shows through exactly where the sprite is shaded), inner
    // flame, cream wing body and white-hot arrow core. Each entry = [outer ring, [hole rings]], flat [x0,y0,x1,y1,...] in
    // sprite pixels relative to the 128x128 frame centre (y up). Smoothed at 4x so the extruded edges are clean, not stair-stepped.
    const FIRE_TRACE = {"outline":[[[54.9,-2.1,54.9,0.4,53.9,2.4,51.4,4.1,46.6,9.6,40.6,12.9,38.4,14.9,36.6,14.9,28.4,18.9,24.9,18.9,23.1,20.9,8.6,20.9,7.4,19.9,4.6,19.9,3.4,18.9,1.9,18.9,0.1,16.9,-11.1,16.9,-11.9,15.6,-10.6,13.4,-8.4,12.9,-7.4,11.1,-5.1,11.1,-4.6,10.6,-5.1,9.9,-13.4,10.9,-14.6,11.9,-24.1,11.9,-24.9,11.1,-24.9,9.6,-23.6,8.4,-21.1,7.6,-21.6,5.9,-39.4,5.9,-40.6,4.9,-44.1,4.9,-45.9,2.9,-50.1,2.9,-51.9,0.9,-55.4,0.9,-55.9,0.1,-53.1,-2.9,-48.9,-2.9,-47.1,-4.9,-42.6,-4.9,-39.4,-6.9,-19.9,-6.9,-19.6,-8.4,-21.6,-10.1,-24.6,-11.4,-24.4,-12.9,-22.6,-12.9,-21.4,-13.9,-13.6,-13.9,-10.4,-11.9,-6.9,-11.9,-6.6,-13.4,-9.9,-15.9,-9.6,-17.6,0.4,-17.9,1.6,-18.9,4.4,-18.9,5.6,-19.9,8.4,-19.9,9.6,-20.9,23.4,-20.9,24.6,-19.9,28.4,-19.9,29.6,-18.9,32.1,-18.9,33.4,-17.1,38.4,-15.9,40.6,-14.6,41.4,-13.1,43.6,-12.6,44.4,-11.1,47.6,-9.6,47.9,-8.6],[]]],"outer":[[[52.9,0.4,47.6,5.9,42.4,9.9,33.4,14.9,30.6,14.9,27.4,16.9,24.6,16.9,21.4,18.9,8.6,18.9,5.9,17.4,9.1,17.1,13.1,14.1,12.6,13.1,10.4,11.9,8.4,12.9,1.6,12.9,-2.6,14.9,-7.1,14.6,1.4,9.4,2.1,7.9,1.1,6.9,-7.4,6.9,-8.6,7.9,-11.4,7.9,-15.6,9.9,-19.9,9.9,-20.1,9.4,-18.4,8.1,-14.4,6.9,-13.4,4.4,-13.9,3.9,-38.4,3.9,-41.6,1.9,-43.4,1.9,-44.6,0.9,-48.4,0.9,-51.1,-0.6,-48.6,-0.9,-44.4,-2.9,-41.6,-2.9,-38.4,-4.9,-14.6,-4.9,-12.9,-6.6,-13.1,-8.6,-15.9,-10.1,-19.9,-11.1,-19.9,-11.9,-15.6,-11.9,-14.4,-10.9,-11.6,-10.9,-10.4,-9.9,-2.6,-9.9,-1.4,-8.9,1.1,-8.9,1.6,-10.1,0.6,-11.9,-6.1,-15.6,-0.6,-15.9,3.6,-13.9,7.4,-13.9,9.6,-11.9,12.4,-11.9,13.6,-13.1,13.4,-14.4,9.1,-17.1,7.1,-17.1,7.1,-17.9,8.6,-18.9,23.4,-18.9,24.6,-17.9,27.4,-17.9,28.6,-16.9,33.4,-15.9,39.4,-12.9,46.6,-7.9,50.9,-3.4],[]]],"mid":[[[50.4,0.1,40.9,8.4,31.9,13.4,29.1,13.4,25.9,15.4,23.1,15.4,19.9,17.4,12.4,17.4,14.6,15.6,14.4,11.9,11.9,10.4,8.1,10.4,6.9,11.4,2.1,11.4,3.6,9.9,3.6,6.4,2.6,5.4,-8.9,5.4,-10.1,6.4,-11.9,6.4,-12.4,2.4,-36.9,2.4,-40.1,0.4,-41.9,0.4,-43.9,-0.6,-42.9,-1.4,-40.1,-1.4,-36.9,-3.4,-13.1,-3.4,-11.4,-5.1,-11.4,-8.4,-4.1,-8.4,-2.9,-7.4,2.6,-7.4,3.1,-7.9,2.6,-12.4,5.9,-12.4,8.1,-10.4,13.9,-10.4,15.1,-11.6,15.1,-15.4,13.1,-17.4,21.9,-17.4,23.1,-16.4,25.9,-16.4,27.1,-15.4,31.9,-14.4,37.9,-11.4,45.1,-6.4,48.4,-3.1],[]]],"body":[[[47.9,0.4,44.6,3.9,37.4,8.9,35.6,8.9,27.4,12.9,24.6,12.9,23.4,13.9,19.9,13.9,20.1,11.6,23.1,8.4,22.1,6.9,15.6,6.9,14.4,7.9,7.6,8.9,4.4,10.9,2.9,10.9,3.1,8.6,4.6,6.9,4.1,5.9,-3.4,5.9,-4.6,6.9,-9.4,6.9,-11.4,7.9,-11.9,6.9,-8.6,4.4,-8.9,2.9,-32.1,2.9,-33.4,1.1,-36.1,-0.1,-36.4,-0.9,-34.4,-2.9,-29.9,-2.9,-26.4,-4.9,-8.9,-4.9,-7.9,-6.4,-10.6,-8.4,-10.4,-9.9,-8.6,-9.9,-7.4,-8.9,-4.6,-8.9,-3.4,-7.9,3.1,-7.9,4.1,-8.9,3.1,-10.6,3.6,-11.9,5.4,-11.9,11.6,-8.9,15.4,-8.9,16.6,-7.9,22.1,-7.9,23.1,-8.9,23.1,-10.4,21.1,-12.6,21.1,-14.1,27.4,-13.9,28.6,-12.9,30.4,-12.9,33.6,-10.9,35.4,-10.9,44.6,-4.9,47.9,-1.4],[[-31.1,0.1,-30.1,1.1,-24.6,1.1,-23.4,2.1,-16.6,2.1,-14.4,-2.6,-14.9,-3.1,-23.1,-3.1,-24.6,-2.1,-30.1,-1.1]]]],"core":[[[44.4,-0.1,41.6,2.9,37.4,5.9,34.6,5.9,27.6,8.9,27.1,7.6,28.6,5.9,28.1,4.9,24.6,4.9,23.4,3.9,21.6,3.9,20.4,2.9,17.6,2.9,16.4,1.9,4.6,1.9,3.4,0.9,-0.4,0.9,-1.6,-0.1,-4.1,-0.6,-1.4,-1.9,15.4,-1.9,16.6,-2.9,19.4,-2.9,23.6,-4.9,28.1,-4.9,29.1,-6.4,26.6,-9.6,28.4,-9.9,33.6,-6.9,35.4,-6.9,37.6,-4.9,39.6,-4.6,40.4,-3.1],[]]]};
    const fireGeo = (function () {
        const g = {};
        const ring = (f) => { const r = []; for (let i = 0; i < f.length; i += 2) r.push(new THREE.Vector2(f[i], f[i + 1])); return r; };
        // bt = bevel thickness (depth rounding), bs = bevel size (outward growth) - kept small so the thin rim bands survive
        const ext = (key, depth, bt, bs, seg) => {
            const shapes = FIRE_TRACE[key].map(e => { const sh = new THREE.Shape(ring(e[0])); e[1].forEach(h => sh.holes.push(new THREE.Path(ring(h)))); return sh; });
            const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: seg, curveSegments: 4 });
            geo.translate(0, 0, -depth / 2); geo.computeBoundingBox(); return geo;
        };
        g.outline = ext('outline', 3, 1.2, 0.6, 1);
        g.outer = ext('outer', 8, 2.0, 0.4, 3);
        g.mid = ext('mid', 12, 2.0, 0.35, 3);
        g.body = ext('body', 15, 2.4, 0.3, 3);
        g.core = ext('core', 19, 3.0, 0.3, 3);
        // extra trailing flame strands (the sprite's frames 0/1/3/4 streak and spark behind the head): thin tapered spikes, merged into one geometry
        const box = (pts, depth, b, z) => {
            const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
            const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.6, bevelSegments: 1, curveSegments: 3 });
            geo.translate(0, 0, -depth / 2 + z); return geo;
        };
        const strands = [[-14, 5.5, 1.5, -48, 9.2, 2.5], [-14, -5.5, 1.5, -47, -9.5, -2.5], [-22, 2.2, 1.2, -54, 4, -1.5], [-22, -2.2, 1.2, -53, -4.2, 1.5]];
        const parts = strands.map(a => { const xb = a[0], yb = a[1], w = a[2], xt = a[3], yt = a[4]; return box([[xb, yb + w], [(xb + xt) / 2, (yb + yt) / 2 + w * 0.6 + 0.6], [xt, yt], [(xb + xt) / 2, (yb + yt) / 2 - w * 0.6 - 0.6], [xb, yb - w]], 3, 0.8, a[5]); });
        let nPos = 0; parts.forEach(q => { nPos += q.attributes.position.count; });
        const P = new Float32Array(nPos * 3), N = new Float32Array(nPos * 3); let o = 0;
        parts.forEach(q => { P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; q.dispose(); });
        g.strands = new THREE.BufferGeometry();
        g.strands.setAttribute('position', new THREE.BufferAttribute(P, 3));
        g.strands.setAttribute('normal', new THREE.BufferAttribute(N, 3));
        return g;
    })();
    // lit material whose diffuse AND emissive follow the per-instance colour (so the bolt keeps its own colours but still
    // gets real light/shade across its bevels), with a small vertex wave that makes the tail and lobes lick like flame.
    function fireMat(diffuse, emissiveK, wave) {
        const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(diffuse, diffuse, diffuse), metalness: 0.05, roughness: 0.55, emissive: 0xffffff, emissiveIntensity: emissiveK });
        m.onBeforeCompile = (sh) => {
            sh.uniforms.uFlameT = fireUniforms.uFlameT;
            sh.vertexShader = 'uniform float uFlameT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                float fph = instanceMatrix[3].x * 0.021 + instanceMatrix[3].y * 0.043;
                float tailW = smoothstep(-6.0, -52.0, position.x);
                transformed.y += sin(position.x * 0.17 - uFlameT * 15.0 + fph) * ${wave.toFixed(2)} * tailW;
                transformed.z += sin(position.x * 0.13 - uFlameT * 11.0 + fph * 1.7) * ${(wave * 0.6).toFixed(2)} * tailW;
                transformed.y *= 1.0 + 0.07 * sin(uFlameT * 22.0 + fph) * smoothstep(-6.0, -24.0, position.x) * (1.0 - smoothstep(-30.0, -52.0, position.x));`);
            sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor;');
        };
        return m;
    }
    const fireLayers = [   // draw order is irrelevant (depth-tested); colourIdx: -1 = navy outline, else index into FIRE_PAL rows
        { key: 'outline', geo: fireGeo.outline, mat: fireMat(0.2, 0.45, 0.6), col: -1 },
        { key: 'outer', geo: fireGeo.outer, mat: fireMat(0.3, 0.85, 1.4), col: 0 },
        { key: 'mid', geo: fireGeo.mid, mat: fireMat(0.3, 0.9, 1.2), col: 1 },
        { key: 'body', geo: fireGeo.body, mat: fireMat(0.22, 0.7, 0.9), col: 2, heat: [0.5, 0.62, 1.0, 1.0, 0.82] },
        { key: 'core', geo: fireGeo.core, mat: fireMat(0.22, 0.88, 0.5), col: 3, heat: [0.5, 0.66, 1.0, 1.0, 0.86] },
        { key: 'strands', geo: fireGeo.strands, mat: fireMat(0.3, 0.85, 2.4), col: 4 }
    ].map(L => {
        const im = new THREE.InstancedMesh(L.geo, L.mat, FIRE_MAX);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FIRE_MAX * 3), 3);
        im.frustumCulled = false; im.count = 0; scene.add(im);
        L.im = im; if (L.heat) L.ax = L.geo.boundingBox.max.x; return L;   // heat scaling keeps the nose in place
    });
    let nFire = 0;
    const FIRE_TILT_X = 0.32, FIRE_TILT_Y = -0.26;   // same fixed visual tilt as the Drill / Axe, so the depth reads identically
    const fireA = new THREE.Color(), fireM = new THREE.Matrix4(), fireH = new THREE.Matrix4();
    // x,y = the bolt's world position (the centre of its 128px sprite box), frameIndex/frameTimer = its existing 0..4 sprite
    // frame and the 0..4 tick counter inside that frame, size = its existing on-screen box (world px).
    G.jetFire = function (x, y, frameIndex, frameTimer, size) {
        if (!G.active || nFire >= FIRE_MAX) return;
        const i = nFire++;
        const ph = (frameIndex || 0) + (frameTimer || 0) / 5;            // continuous position along the sprite's own 5-frame colour cycle
        const f0 = Math.floor(ph) % 5, f1 = (f0 + 1) % 5, fr = ph - Math.floor(ph);
        const sx = toX(x), sy = toY(y);
        const flick = timeMs * 0.001 + sx * 0.021 + sy * 0.043;           // per-bolt phase so a 3-bolt volley never flickers in lock-step
        const s = (size / 128) * T.a;
        tmpE.set(FIRE_TILT_X + 0.05 * Math.sin(flick * 9), FIRE_TILT_Y, 0, 'YXZ'); tmpQ.setFromEuler(tmpE);   // 'YXZ' (not 'XYZ'): the X tilt is applied first, so the nose axis stays exactly on the flight line - the tilt only adds depth, it never points the nose down
        tmpP.set(sx, sy, FIRE_Z);
        tmpS.set(s * (1 + 0.03 * Math.sin(flick * 13)), s * (1 + 0.05 * Math.sin(flick * 17 + 1)), s);
        tmpM.compose(tmpP, tmpQ, tmpS);
        for (let k = 0; k < fireLayers.length; k++) {
            const L = fireLayers[k];
            if (L.heat) {   // the sprite's cream body / white-hot core swell and shrink along its colour cycle (small on the blue frames, full on the pale/orange ones)
                const h = L.heat[f0] + (L.heat[f1] - L.heat[f0]) * fr, hx = 0.72 + 0.28 * h;
                fireH.makeTranslation(L.ax * (1 - hx), 0, 0); fireH.scale(tmpS.set(hx, h, 1));
                fireM.multiplyMatrices(tmpM, fireH); L.im.setMatrixAt(i, fireM);
            } else L.im.setMatrixAt(i, tmpM);
            if (L.col < 0) fireA.copy(FIRE_NAVY);
            else fireA.copy(FIRE_PAL[f0][L.col]).lerp(FIRE_PAL[f1][L.col], fr);
            L.im.setColorAt(i, fireA);
        }
    };


    // --------------------------------------------- the Mining Rocket / Jet Missile
    // 2.5D version of the existing rocket (rocket-frame-0..4.png + thrust-frame-0..4.png), used by BOTH the Normal-level
    // Mining Rocket power-up and the Extra-Level wing missiles - one model, hooked from the game's existing rocket draw
    // sites. Same design as the sprite: a navy-steel hull with an ogive nose cone, two side antenna pins, a glowing cyan
    // window, a slotted lower hull panel with cyan rails, two swept fins, a dark engine collar, the sprite's own cyan engine
    // flame and the separate teardrop thrust flame. The model is authored in the sprite's pixel units (nose-up art measured
    // row by row: hull radius per row, fin / window / slot outlines), nose toward +X. The hull is a solid of revolution with a
    // flattened depth so the front-face plates sit flush on it.
    // Visual only: the game still owns position, heading (it homes in on its target), speed, hit tests, damage, explosions and
    // life; it hands in position + the drawn size it already computes + its existing frame/thrust-frame indices via
    // GTD3D.rocket(). The depth tilt is applied in the missile's own frame about its short axis and long axis, so the nose
    // always stays exactly on the missile's real heading and the on-screen length/width match the sprite.
    // Performance: every part is ONE InstancedMesh (14 draw calls total however many rockets are in flight).
    const RK_MAX = 64;
    const RK_Z = 270;                                 // in front of asteroids (0) / Jet (150) / Drill (260), behind the Axe (300) and Jet Fireballs (330)
    const RK_H = [91, 92, 93, 94, 94];                // measured sprite bbox height per frame (nose tip -> flame end), sprite px
    const RK_BODY_END = 80;                           // sprite rows (from the nose tip) occupied by hull + collar; the rest of the bbox is the engine flame
    const RK_THRUST_BOX = [[53, 95], [45, 98], [38, 90], [38, 75], [43, 81]];   // ROCKET_THRUST_BBOXES w,h - the game sizes the thrust from these, so the 3D flame follows the same ratios
    const RK_THRUST_W = 0.62, RK_THRUST_OVERLAP = 0.05;   // ROCKET_THRUST_WIDTH_RATIO / the game's 5% tuck-under
    const RK_TILT_X = 0.1, RK_TILT_Y = -0.24;         // roll about the long axis / pitch about the short axis (nose toward the viewer)
    const RK_ZSQ = 0.6;                               // hull depth / width
    const rk = (function () {
        const X = sy => 3 - sy, Yp = sx => 45 - sx;   // sprite row -> distance along the nose axis (nose = +X), sprite column -> sideways offset
        const mat = (c, e, ei, rough) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: rough || 0.45, emissive: e, emissiveIntensity: ei });
        const M = {
            steel: mat(0x3d5f8c, 0x0b1930, 0.7), steelLt: mat(0x6f9bc4, 0x142840, 0.6), steelDk: mat(0x24395a, 0x07101e, 0.7),
            hi: mat(0x4a76a8, 0x0d1d36, 0.7), dark: mat(0x0a1424, 0x000000, 0.0, 0.6),
            glass: mat(0x1fc6d6, 0x0a8fa0, 1.0, 0.25),
            glassHi: new THREE.MeshBasicMaterial({ color: 0x83fdfb }), accent: new THREE.MeshBasicMaterial({ color: 0x33e6ff })
        };
        const lists = {}; Object.keys(M).forEach(k => { lists[k] = []; });
        const T4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
        const push = (key, geo, m) => lists[key].push([geo, m || new THREE.Matrix4()]);
        const lathe = (pts) => { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], X(p[1]))), 28); g.rotateZ(-Math.PI / 2); g.scale(1, 1, RK_ZSQ); return g; };
        const ext = (pts, depth, b, bseg) => {        // sprite-space polygon [[sx,sy],...] -> extruded plate in model space
            const sh = new THREE.Shape(); pts.forEach((p, i) => { if (i) sh.lineTo(X(p[1]), Yp(p[0])); else sh.moveTo(X(p[1]), Yp(p[0])); }); sh.closePath();
            const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: bseg || 1, curveSegments: 4 });
            g.translate(0, 0, -depth / 2); return g;
        };
        const boxAt = (key, sx0, sx1, sy0, sy1, th, z) => push(key, new THREE.BoxGeometry(sy1 - sy0, sx1 - sx0, th), T4(X((sy0 + sy1) / 2), Yp((sx0 + sx1) / 2), z));
        const cylX = (r, len) => { const g = new THREE.CylinderGeometry(r, r, len, 8); g.rotateZ(-Math.PI / 2); return g; };
        const ring = (r, tube, sy, key) => { const g = new THREE.TorusGeometry(r, tube, 6, 28); g.rotateY(Math.PI / 2); g.scale(1, 1, RK_ZSQ); push(key, g, T4(X(sy), 0, 0)); };
        // hull: nose cone (lighter), hull, engine collar (dark) - [radius, sprite row] measured from the sprite
        push('steelLt', lathe([[0.15, 3], [1.5, 4.6], [3, 6.8], [4.2, 9.4], [5.6, 12], [7, 14.6], [8.2, 16.6]]));
        push('steel', lathe([[8.2, 16.4], [9, 18.5], [9.6, 19.6], [13.6, 21.2], [13.9, 22.5], [13.2, 24.5], [12.7, 27.5], [13.3, 30], [13.9, 33], [14, 38], [13.7, 41], [12.9, 43.5], [12.2, 46], [12, 50], [12, 76.6]]));
        push('steelDk', lathe([[11.7, 76.4], [11.3, 77.4], [10.9, 79.5], [10.3, 81.5], [9.4, 83], [0.01, 83]]));
        // cyan seam rings
        ring(8.5, 0.5, 16.6, 'accent'); ring(12.3, 0.5, 50.6, 'accent'); ring(12.3, 0.5, 74.6, 'accent');
        // antenna pins (+ knobs) either side of the nose
        for (const sg of [1, -1]) {
            push('steelLt', cylX(0.7, 11), T4(X(16.5), sg * 12, 0));
            push('steelLt', new THREE.SphereGeometry(1.5, 8, 6), T4(X(22.2), sg * 12, 0));
        }
        // fins (left, right) + bright outer edge + tip pins
        for (const sg of [1, -1]) {
            const mx = (x) => sg > 0 ? x : 90 - x;
            push('steel', ext([[mx(33.4), 59.5], [mx(29.6), 61.8], [mx(28), 64], [mx(28), 76.8], [mx(33.4), 76.8]], 3.2, 0.6, 1));
            push('steelLt', ext([[mx(28), 64], [mx(29.4), 63.2], [mx(29.4), 76.8], [mx(28), 76.8]], 3.8, 0.3, 1));
            push('steelLt', cylX(0.6, 4.5), T4(X(58.2), Yp(mx(30.4)), 0));
        }
        // glowing window: dark housing, glass, light streaks, dark chevron (all stand proud of the hull front)
        const zw = 0.6 * 13.9;
        push('dark', ext([[37.5, 30], [53, 30], [54, 34], [54, 47], [51, 49.5], [39.5, 49.5], [36.5, 47], [36.5, 34]], 1.2, 0.3, 1), T4(0, 0, zw + 0.1));
        push('glass', ext([[39.3, 31.6], [51.7, 31.6], [52.6, 35], [52.6, 45.5], [50.5, 47.6], [40.5, 47.6], [38.4, 45.5], [38.4, 35]], 1, 0.3, 1), T4(0, 0, zw + 0.7));
        for (const sx of [41.5, 45.5, 49.5]) boxAt('glassHi', sx - 0.55, sx + 0.55, 33, 44, 0.5, zw + 1.5);
        push('dark', ext([[41, 46.6], [45.5, 43.8], [50, 46.6], [50, 48], [41, 48]], 0.5, 0.2, 1), T4(0, 0, zw + 1.5));
        // face markings on the upper hull + short cyan dashes on the cone
        const zu = 0.6 * 13.4;
        boxAt('accent', 39.5, 42, 23, 25, 0.5, zu + 0.2); boxAt('accent', 44, 47, 23, 24.2, 0.5, zu + 0.2); boxAt('accent', 48.5, 51, 23, 25, 0.5, zu + 0.2);
        // lower hull: raised armour panel, dark centre slot, cyan side rails
        const zl = 0.6 * 12;
        push('hi', ext([[38.5, 51.5], [52.5, 51.5], [53.5, 53], [53.5, 75.5], [36.5, 75.5], [36.5, 53]], 0.9, 0.3, 1), T4(0, 0, zl + 0.3));
        boxAt('dark', 43.3, 46.7, 55, 76, 0.9, zl + 0.7);
        boxAt('accent', 37.2, 38, 53, 74, 0.5, zl + 0.8); boxAt('accent', 52, 52.8, 53, 74, 0.5, zl + 0.8);
        // merge each material's parts into ONE geometry (shared by every rocket instance)
        const merged = {};
        for (const key of Object.keys(lists)) {
            const parts = lists[key].map(e => { const g = e[0].index ? e[0].toNonIndexed() : e[0].clone(); g.applyMatrix4(e[1]); return g; });
            let n = 0; parts.forEach(q => { n += q.attributes.position.count; });
            const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
            parts.forEach(q => { P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; q.dispose(); });
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
            merged[key] = g;
        }
        // flames: teardrop outlines, layered extrusions (outer -> pale core). Unit teardrop = attach end at 0, tip at -1 (X), half-width 0.5.
        const drop = (wk, lk, off) => {
            const prof = [[0, 0], [0.18, 0.015], [0.34, 0.06], [0.45, 0.15], [0.5, 0.28], [0.47, 0.42], [0.37, 0.58], [0.24, 0.74], [0.11, 0.88], [0.015, 1]];   // [halfwidth, distance back]
            const top = new THREE.SplineCurve(prof.map(p => new THREE.Vector2(p[1] * lk + off, p[0] * wk))).getPoints(24);
            const pts = top.map(v => new THREE.Vector2(-v.x, v.y)).concat(top.slice(1, -1).reverse().map(v => new THREE.Vector2(-v.x, -v.y)));
            return pts;
        };
        const dropGeo = (wk, lk, off, depth, b, bs) => {
            const sh = new THREE.Shape(drop(wk, lk, off)); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: bs === undefined ? b * 0.5 : bs, bevelSegments: 2, curveSegments: 4 });
            g.translate(0, 0, -depth / 2); return g;
        };
        const fmat = (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.4), metalness: 0.05, roughness: 0.55, emissive: c, emissiveIntensity: 0.95 });
        const flame = [   // the sprite's own cyan engine flame (attach at the collar, scaled along the nose axis per frame)
            { geo: dropGeo(17, 1, 0, 2.6, 0.9, 0.03), mat: fmat(0x1fdee6) }, { geo: dropGeo(9.5, 0.62, 0.02, 3.4, 0.9, 0.03), mat: fmat(0xa1f9fb) }
        ];   // (flame units are scaled by the instance matrix: X = length, Y/Z = width)
        const thrust = [   // the separate thrust teardrop: navy -> blue -> cyan -> pale core, thicker toward the core so every layer reads
            { geo: dropGeo(1, 1, 0, 0.16, 0.05), mat: fmat(0x00217d) }, { geo: dropGeo(0.78, 0.86, 0.03, 0.22, 0.05), mat: fmat(0x0671e6) },
            { geo: dropGeo(0.56, 0.72, 0.06, 0.28, 0.05), mat: fmat(0x03cafd) }, { geo: dropGeo(0.34, 0.54, 0.09, 0.34, 0.05), mat: fmat(0xa1f9fb) }
        ];
        return { M, merged, flame, thrust };
    })();
    const rkInst = [];
    (function () {
        const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, RK_MAX); im.frustumCulled = false; im.count = 0; scene.add(im); rkInst.push(im); return im; };
        rk.bodyIM = Object.keys(rk.merged).map(k => mk(rk.merged[k], rk.M[k]));
        rk.flameIM = rk.flame.map(f => mk(f.geo, f.mat));
        rk.thrustIM = rk.thrust.map(f => mk(f.geo, f.mat));
    })();
    let nRk = 0;
    const rkRoot = new THREE.Matrix4(), rkTilt = new THREE.Matrix4(), rkBase = new THREE.Matrix4(), rkLocal = new THREE.Matrix4(), rkOut = new THREE.Matrix4(), rkFl = new THREE.Matrix4(), rkEul = new THREE.Euler(), rkQ = new THREE.Quaternion(), rkV = new THREE.Vector3(), rkV2 = new THREE.Vector3(), rkS = new THREE.Vector3();
    // x,y = the rocket's world position (centre of its drawn box), angle = its existing heading (radians, y-down world: the direction it flies),
    // frameIdx = its existing 0..4 sprite frame, rw/rh = the drawn width/length (world px) the game already computed for that frame,
    // thrustIdx = its existing 0..4 thrust-flame frame.
    G.rocket = function (x, y, angle, frameIdx, rw, rh, thrustIdx) {
        if (!G.active || nRk >= RK_MAX || !(rh > 0)) return;
        const k = (((frameIdx | 0) % 5) + 5) % 5, tk = (((thrustIdx | 0) % 5) + 5) % 5, i = nRk++;
        rkQ.setFromAxisAngle(rkV.set(0, 0, 1), -angle);                       // 3D y is up, game y is down
        rkRoot.compose(rkV2.set(toX(x), toY(y), RK_Z), rkQ, rkS.set(T.a * WEAPON_SCALE, T.a * WEAPON_SCALE, T.a * WEAPON_SCALE));   // body, engine flame and thrust flame all scale together about the rocket's centre
        rkEul.set(RK_TILT_X, RK_TILT_Y, 0, 'YXZ');                            // pitch about the short axis after roll: the nose stays on the heading
        rkTilt.makeRotationFromEuler(rkEul).scale(rkS.set(1 / Math.cos(RK_TILT_Y), 1 / Math.cos(RK_TILT_X), 1));   // + undo the foreshortening so length/width match the sprite
        rkBase.multiplyMatrices(rkRoot, rkTilt);
        const sc = rh / RK_H[k];                                              // world px per sprite px for this frame (same scale the 2D draw used)
        rkLocal.makeTranslation(rh / 2, 0, 0).scale(rkS.set(sc, sc, sc));
        rkOut.multiplyMatrices(rkBase, rkLocal);
        for (const im of rk.bodyIM) im.setMatrixAt(i, rkOut);
        // engine flame: attaches at the collar, runs to the frame's own bbox end (unit flame scaled along the nose axis, in sprite units)
        rkLocal.makeTranslation(-RK_BODY_END, 0, 0).scale(rkS.set(RK_H[k] - RK_BODY_END, 1, 1));
        rkFl.multiplyMatrices(rkOut, rkLocal);
        for (const im of rk.flameIM) im.setMatrixAt(i, rkFl);
        // thrust flame: starts a little inside the bbox end (same 5% tuck as the sprite), sized from the game's drawn width and the frame's own aspect
        const tw = rw * RK_THRUST_W, th = tw * (RK_THRUST_BOX[tk][1] / RK_THRUST_BOX[tk][0]);
        rkLocal.makeTranslation(-(rh / 2 - rh * RK_THRUST_OVERLAP), 0, -1.2).scale(rkS.set(th, tw, tw));
        rkOut.multiplyMatrices(rkBase, rkLocal);
        for (const im of rk.thrustIM) im.setMatrixAt(i, rkOut);
    };


    // --------------------------------------------------------------- the Black Hole
    // 2.5D version of the existing Extra-Level Black Hole (blackhole-frame-0..4.png): the small drifting hazard Black Holes and
    // the giant boss, both drawn through the game's one esDrawBlackHoleSprite(). Same design as the sprite: a deep black core,
    // swirling spiral arms that trail clockwise as they go outward (violet / magenta / white-hot, with dark indigo gaps and
    // ragged outer wisps), and the sprite's own 5-frame brightness cycle (dim indigo -> violet/magenta -> white-hot -> dim).
    // The model is authored in the sprite's own pixel units (256 x 256 frame, centre at the origin; core radius 41-50, arms out
    // to ~100, measured from the PNGs): the core is a real funnel recessed into the disc, ringed by a thin bright photon ring,
    // and the disc is five stacked, bevelled spiral-arm layers at different depths. The disc spins about its own axis by the
    // game's existing spinAngle, so the existing rotation / frame stepping is reproduced exactly.
    // Visual only: the game still owns position, bob/creep movement, size, hit tests, hit-flash/shake, spawning and Power; it just
    // hands in x/y/radius/spinAngle/flash via GTD3D.blackHole(). No glow / bloom / blur: one faint dark vignette ring behind the disc
    // is the only soft element. Performance: each part is ONE InstancedMesh (9 draw calls total for any number of black holes).
    const BH_MAX = 24;
    const BH_TILT_X = 0.32, BH_TILT_Y = -0.26;       // same fixed visual tilt as the Drill / Axe / Rocket
    // sprite palette per frame (measured): [dark, low, mid, hi, top]
    const BH_PAL = [
        [0x080120, 0x140637, 0x290b63, 0x45088a, 0x9208ae],   // frame 0: dim indigo, magenta sparks
        [0x08011f, 0x14033a, 0x420590, 0x6902b5, 0xdb25e5],   // frame 1: violet, magenta streaks
        [0x040317, 0x28025a, 0x6d01c0, 0xe7c3f2, 0xfcfcfa],   // frame 2: bright violet, white streaks
        [0x040318, 0x1c0444, 0xf2ebf5, 0xfcfcfa, 0xfcfcfa],   // frame 3: white-hot
        [0x0d0029, 0x15043b, 0x2f0a6e, 0x3d0889, 0x7f06b1]    // frame 4: dim, wide open core
    ].map(row => row.map(h => new THREE.Color(h)));
    const BH_CORE_R = [47.9, 46.7, 43.1, 41.5, 50.3];     // the sprite's own dark-core radius per frame
    const BH_WHITE = new THREE.Color(0xffffff);
    const bh = (function () {
        const g = {};
        const K = 2.3, R0 = 48;                         // spiral: angle trails clockwise (on screen) by K rad per ln-radius, like the sprite
        const hh = (n) => hash(n * 3.7 + 11.3);
        const arm = (th0, r0, r1, w0, seed, steps) => {   // one tapered, ragged spiral arm as a closed polygon [[x,y],...]
            const L = [], Rr = [];
            for (let j = 0; j <= steps; j++) {
                const u = j / steps, r = r0 + (r1 - r0) * u, thc = th0 - K * Math.log(r / R0);
                const hw = w0 * Math.pow(1 - u, 0.75) * (0.72 + 0.5 * hh(seed * 31 + j)) + 0.004;
                L.push([r * Math.cos(thc + hw), r * Math.sin(thc + hw)]); Rr.push([r * Math.cos(thc - hw), r * Math.sin(thc - hw)]);
            }
            return L.concat(Rr.reverse());
        };
        const plate = (polys, depth, b, z) => {          // merge many extruded polygons into ONE geometry, centred at depth z
            const parts = polys.map(pts => {
                const sh = new THREE.Shape(); pts.forEach((q, i) => { if (i) sh.lineTo(q[0], q[1]); else sh.moveTo(q[0], q[1]); }); sh.closePath();
                const ge = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.5, bevelSegments: 1, curveSegments: 2 });
                ge.translate(0, 0, z - depth / 2); return ge;
            });
            let n = 0; parts.forEach(q => { n += q.attributes.position.count; });
            const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
            parts.forEach(q => { P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; q.dispose(); });
            const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(P, 3)); ge.setAttribute('normal', new THREE.BufferAttribute(N, 3)); return ge;
        };
        const ring = (n, r0, r1, w0, phase, seed) => { const a = []; for (let i = 0; i < n; i++) a.push(arm(phase + i * 2 * Math.PI / n + (hh(seed + i) - 0.5) * 0.25, r0 + hh(seed * 7 + i) * 3, r1 - hh(seed * 5 + i) * 10, w0 * (0.8 + 0.4 * hh(seed * 3 + i)), seed * 13 + i, 18)); return a; };
        // ragged outer wisps (short detached arcs), then the arm layers from back to front
        const wisps = []; for (let i = 0; i < 18; i++) { const r0 = 84 + hh(i * 2) * 10; wisps.push(arm(hh(i * 5 + 1) * Math.PI * 2, r0, r0 + 9 + hh(i * 3) * 9, 0.05 + hh(i) * 0.04, 90 + i, 6)); }
        g.wisps = plate(wisps, 2.5, 0.7, -10);
        { // dark indigo base disc: the sprite's gaps between arms are dark indigo, not empty space
          const out = [], inn = []; for (let i = 0; i < 96; i++) { const t = i / 96 * Math.PI * 2; const ro = 92 + 4 * Math.sin(5 * t + 1) + 3 * Math.sin(11 * t + 2) + 2 * Math.sin(17 * t); out.push([ro * Math.cos(t), ro * Math.sin(t)]); inn.push([48.5 * Math.cos(t), 48.5 * Math.sin(t)]); }
          const sh = new THREE.Shape(out.map(q => new THREE.Vector2(q[0], q[1]))); sh.holes.push(new THREE.Path(inn.reverse().map(q => new THREE.Vector2(q[0], q[1]))));
          g.base = new THREE.ExtrudeGeometry(sh, { depth: 4, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.8, bevelSegments: 1, curveSegments: 2 }); g.base.translate(0, 0, -9 - 2); }
        g.armA = plate(ring(8, 50, 104, 0.46, 0.0, 1), 5, 1.2, -5);
        g.armB = plate(ring(8, 50, 98, 0.3, Math.PI / 8, 2), 6, 1.2, 1);
        g.armC = plate(ring(10, 52, 92, 0.14, Math.PI / 12, 3), 6, 1.0, 7);
        g.armE = plate(ring(6, 54, 80, 0.04, Math.PI / 5, 4), 5, 0.8, 12);
        // the recessed core: a funnel from the rim down to a pure-black centre (vertex colours fade the wall to black), + a black cap
        const prof = [[46, 3], [43.5, -1], [39, -8], [32, -17], [24, -26], [15, -34], [7, -40], [0.01, -43]];
        g.funnel = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 40); g.funnel.rotateX(Math.PI / 2);
        { const pa = g.funnel.attributes.position, c = new Float32Array(pa.count * 3), top = new THREE.Color(0x150838), bot = new THREE.Color(0x000000), t = new THREE.Color();
          for (let i = 0; i < pa.count; i++) { t.copy(bot).lerp(top, THREE.MathUtils.clamp((pa.getZ(i) + 43) / 46, 0, 1) ** 1.6); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
          g.funnel.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
        g.photon = new THREE.TorusGeometry(46.8, 1.15, 8, 64); g.photon.translate(0, 0, 4);
        // faint dark vignette behind the disc (vertex alpha) - the only soft element
        g.halo = new THREE.RingGeometry(0, 126, 56, 6);
        { const pa = g.halo.attributes.position, c = new Float32Array(pa.count * 4);
          for (let i = 0; i < pa.count; i++) { const r = Math.hypot(pa.getX(i), pa.getY(i)); const a = 0.42 * (1 - THREE.MathUtils.smoothstep(r, 70, 126)); c[i * 4] = 0.02; c[i * 4 + 1] = 0.005; c[i * 4 + 2] = 0.06; c[i * 4 + 3] = a; }
          g.halo.setAttribute('color', new THREE.BufferAttribute(c, 4)); }
        return g;
    })();
    // lit material whose emissive follows the per-instance colour (so each black hole keeps its own frame colours but still gets real light/shade)
    function bhMat(diffuse, emissiveK, vc) {
        const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(diffuse, diffuse, diffuse), metalness: 0.0, roughness: 1.0, emissive: 0xffffff, emissiveIntensity: emissiveK, vertexColors: !!vc, side: vc ? THREE.DoubleSide : THREE.FrontSide });
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor;'); };
        return m;
    }
    // layer table: pal = index into BH_PAL rows (0 dark, 1 low, 2 mid, 3 hi, 4 top); spin = rotates with the disc
    const bhLayers = [
        { geo: bh.base, mat: bhMat(0.2, 0.8), pal: 0, spin: true },
        { geo: bh.wisps, mat: bhMat(0.3, 0.75), pal: 1, spin: true },
        { geo: bh.armA, mat: bhMat(0.3, 0.85), pal: 1, spin: true },
        { geo: bh.armB, mat: bhMat(0.3, 0.9), pal: 2, spin: true },
        { geo: bh.armC, mat: bhMat(0.3, 0.95), pal: 3, spin: true },
        { geo: bh.armE, mat: bhMat(0.3, 1.0), pal: 4, spin: true },
        { geo: bh.funnel, mat: bhMat(0.02, 0.85, true), pal: -2, core: true },
        { geo: bh.photon, mat: bhMat(0.3, 1.0), pal: 3, core: true }
    ];
    const bhHaloMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const bhInst = [];
    (function () {
        for (const L of bhLayers) {
            const im = new THREE.InstancedMesh(L.geo, L.mat, BH_MAX); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BH_MAX * 3), 3);
            im.frustumCulled = false; im.count = 0; scene.add(im); L.im = im; bhInst.push(im);
        }
        const hm = new THREE.InstancedMesh(bh.halo, bhHaloMat, BH_MAX); hm.frustumCulled = false; hm.count = 0; hm.renderOrder = -1; scene.add(hm); bhInst.push(hm); bh.haloIM = hm;
    })();
    let nBh = 0;
    const bhRoot = new THREE.Matrix4(), bhTilt = new THREE.Matrix4(), bhBase = new THREE.Matrix4(), bhLoc = new THREE.Matrix4(), bhOut = new THREE.Matrix4(), bhEul = new THREE.Euler(), bhQ = new THREE.Quaternion(), bhV = new THREE.Vector3(), bhS = new THREE.Vector3(), bhC = new THREE.Color();
    // x,y = centre (world px), radius = the game's black-hole radius (sprite drawn at radius*2.1), spinAngle = its existing rotation (rad, clockwise on screen),
    // frame = its existing 0..4 sprite frame, flash = 0..1 existing hit-flash, z = depth slot (small hazards sit behind the projectiles, the giant boss in front of everything)
    G.blackHole = function (x, y, radius, spinAngle, frame, flash, z) {
        if (!G.active || nBh >= BH_MAX || !(radius > 0)) return;
        const i = nBh++, f = (((frame | 0) % 5) + 5) % 5, fl = Math.max(0, Math.min(1, flash || 0));
        const sc = (radius * 2.1 / 256) * T.a;
        bhQ.setFromAxisAngle(bhV.set(0, 0, 1), 0);
        bhRoot.compose(bhV.set(toX(x), toY(y), z || 200), bhQ, bhS.set(1, 1, 1));
        bhEul.set(BH_TILT_X, BH_TILT_Y, 0, 'YXZ');
        bhTilt.makeRotationFromEuler(bhEul).scale(bhS.set(1 / Math.cos(BH_TILT_Y), 1 / Math.cos(BH_TILT_X), 1));   // undo foreshortening so the on-screen size matches the sprite
        bhBase.multiplyMatrices(bhRoot, bhTilt);
        for (const L of bhLayers) {
            if (L.spin) { bhLoc.makeRotationZ(-spinAngle).scale(bhS.set(sc, sc, sc)); }   // game y is down: clockwise sprite rotation = -z in the y-up scene
            else { const k = sc * BH_CORE_R[f] / 46; bhLoc.makeScale(k, k, sc); }          // core + photon ring follow the sprite's own per-frame core size
            bhOut.multiplyMatrices(bhBase, bhLoc); L.im.setMatrixAt(i, bhOut);
            if (L.pal === -2) bhC.set(0xffffff); else bhC.copy(BH_PAL[f][L.pal]);
            if (fl > 0 && !L.core) bhC.lerp(BH_WHITE, fl * 0.85);                           // existing white hit-flash, on the disc only (the core stays dark)
            L.im.setColorAt(i, bhC);
        }
        bhLoc.makeTranslation(0, 0, -52 * sc).scale(bhS.set(sc, sc, sc)); bhOut.multiplyMatrices(bhBase, bhLoc); bh.haloIM.setMatrixAt(i, bhOut);
    };


    // ------------------------------------------------------ the Dragon Skull collectable
    // 2.5D version of the existing Dragon Skull collectable (dragon-skull-spawn.png - the sprite the game drops into the world; typeIndex 0 of the
    // Antique collectables). Same design as the sprite: a front-facing bone skull with two big curved horns, forehead spikes and crest, side ear fins,
    // brow ridges, nostril slits, a fanged jaw, and glowing red-orange eyes in dark sockets. The layers are traced from the sprite's own pixels: the
    // ink outline, then bone in four tone levels (shadow / mid / light / bright) extruded to increasing depth so the lit areas stand proud like a
    // carved relief (forehead, brow ridges, snout, teeth) while the horns, ear fins and shadowed bone sit lower; the eye sockets are holes in the bone
    // layers with the glowing eyes recessed inside. The model is authored in the sprite's pixel units (128 x 128 frame, centre at the origin, y up).
    // Visual only: the game still owns spawning, position, its floating bob, collection range/sound/counters/score; it hands in position + the exact
    // scale/anchor it already uses to size the sprite via GTD3D.dragonSkull(). A slight idle sway about the vertical axis (phased per skull, same
    // index the game's bob uses) is what lets the depth read while the skull stays front-facing and recognisable.
    // Performance: each layer is ONE InstancedMesh (8 draw calls total for any number of skulls).
    const DS_MAX = 64;
    const DS_Z = 108;                                   // collectables sit with the minerals/coins, above asteroids, below weapons
    const DS_TRACE = {"outline":[[[-26.4,57.9,-28.4,56.9,-29.6,54.9,-31.9,53.6,-33.6,50.9,-35.9,49.6,-37.9,45.6,-39.9,44.4,-40.9,42.4,-40.9,40.6,-41.9,39.4,-41.9,26.6,-40.9,25.4,-39.9,20.6,-38.9,18.6,-36.9,17.4,-35.9,15.4,-33.6,14.1,-30.9,10.4,-28.4,8.4,-28.9,7.9,-31.4,7.9,-33.4,8.9,-34.6,10.9,-36.4,10.9,-38.6,12.9,-40.9,12.4,-40.9,9.6,-39.9,8.4,-39.9,6.6,-37.9,5.4,-35.9,1.4,-34.4,0.1,-31.6,-0.9,-30.1,-3.4,-31.6,-6.1,-35.4,-6.1,-35.9,-8.4,-34.4,-10.9,-29.4,-13.9,-27.6,-13.9,-25.9,-16.6,-25.9,-18.4,-23.9,-19.6,-23.9,-23.4,-25.9,-24.6,-25.9,-29.4,-23.4,-30.9,-21.9,-33.4,-20.6,-33.9,-19.9,-35.4,-16.9,-37.6,-16.9,-39.4,-14.9,-40.6,-13.9,-42.6,-13.9,-45.4,-11.9,-49.4,-9.9,-50.6,-8.9,-53.4,-7.4,-54.9,-5.6,-54.9,-3.4,-57.9,3.4,-57.9,5.6,-54.9,7.4,-54.9,8.9,-53.4,9.9,-50.6,11.9,-49.4,13.9,-45.4,13.9,-42.6,14.9,-40.6,16.9,-39.4,16.9,-37.6,20.6,-34.9,21.9,-32.6,23.4,-31.9,24.6,-29.9,25.9,-29.4,25.9,-24.6,23.9,-23.4,23.9,-19.6,25.9,-18.4,25.9,-16.6,27.6,-13.9,29.4,-13.9,34.4,-10.9,35.9,-8.4,35.4,-6.1,31.6,-6.1,30.1,-3.4,31.6,-0.9,34.4,0.1,36.9,2.6,36.9,3.4,38.9,4.6,39.9,6.6,39.9,8.4,40.9,9.6,40.9,12.4,38.6,12.9,36.4,10.9,34.6,10.9,33.4,8.9,31.4,7.9,28.9,7.9,28.4,8.6,31.9,11.4,33.6,14.1,35.9,15.4,37.9,19.4,39.9,20.6,39.9,22.4,41.9,26.6,41.9,39.4,39.9,42.6,39.9,44.4,37.9,45.6,36.9,48.4,30.9,54.4,29.9,56.4,27.6,56.9,26.4,57.9,24.6,57.9,24.1,57.4,24.1,54.6,26.1,52.4,27.1,50.4,27.1,48.6,28.1,47.4,28.1,36.6,27.1,35.4,27.1,33.6,26.1,31.6,24.6,30.9,20.4,25.9,18.6,25.9,17.9,26.6,17.9,33.4,16.9,35.4,15.6,35.9,14.6,37.4,13.1,35.4,13.1,32.6,11.1,31.4,10.1,29.4,10.1,27.6,8.4,25.9,4.6,25.9,2.4,27.9,1.6,27.9,0.4,29.9,-0.4,29.9,-1.6,27.9,-2.4,27.9,-4.6,25.9,-8.4,25.9,-10.1,27.6,-10.1,29.4,-11.1,31.4,-13.1,32.6,-13.1,35.4,-14.6,37.4,-15.6,35.9,-16.9,35.4,-17.9,33.4,-17.9,26.6,-18.6,25.9,-20.4,25.9,-21.1,27.4,-22.4,27.9,-23.1,29.4,-26.1,31.6,-27.1,33.6,-27.1,35.4,-28.1,36.6,-28.1,48.4,-24.1,54.6,-24.1,57.4],[]]],"base":[[[26.4,55.9,25.4,55.4,27.1,53.4,27.1,51.6,29.1,48.4,29.1,36.6,28.1,35.4,28.1,33.6,27.1,31.6,24.1,29.4,24.1,28.6,20.4,23.9,16.9,24.1,16.9,33.4,15.4,34.1,14.6,35.4,14.1,35.1,14.1,32.6,13.1,30.6,11.1,29.4,11.1,27.6,8.4,23.9,4.6,23.9,2.4,26.9,0.4,27.9,-2.4,26.9,-4.6,23.9,-8.4,23.9,-11.1,27.6,-11.1,29.4,-13.1,30.6,-14.1,32.6,-14.1,35.4,-14.6,35.9,-15.9,35.4,-16.9,33.4,-16.9,24.1,-20.4,23.9,-22.1,26.6,-27.1,31.6,-28.1,33.6,-28.1,35.4,-29.1,36.6,-29.1,48.4,-27.1,51.6,-27.1,53.4,-26.1,54.6,-26.4,55.6,-31.4,52.9,-31.9,51.6,-35.9,48.4,-36.9,45.6,-38.9,43.4,-40.9,39.4,-40.9,26.6,-39.9,25.4,-39.9,23.6,-37.9,22.4,-37.9,20.6,-34.9,15.6,-30.9,12.6,-29.9,10.6,-26.9,8.4,-25.9,6.4,-25.9,-1.1,-26.9,-1.9,-27.1,4.4,-28.6,6.9,-31.4,6.9,-34.6,8.9,-36.4,8.9,-38.6,11.9,-39.9,11.4,-39.9,9.6,-38.9,7.6,-36.9,5.4,-34.9,1.6,-31.6,0.1,-29.4,-1.9,-26.9,-2.1,-27.4,-4.1,-29.9,-5.6,-30.1,-8.1,-34.1,-8.1,-34.4,-8.6,-31.9,-10.6,-31.4,-11.9,-28.6,-12.9,-28.1,-11.4,-27.4,-11.1,-25.4,-13.9,-21.9,-13.9,-21.1,-14.4,-21.4,-15.1,-23.9,-15.6,-23.9,-18.4,-22.9,-19.6,-22.9,-24.4,-23.9,-25.6,-23.9,-28.4,-21.9,-31.6,-19.6,-32.9,-17.9,-35.6,-14.9,-37.6,-14.9,-39.4,-12.9,-42.6,-12.9,-44.4,-9.9,-47.6,-9.9,-49.4,-7.9,-53.4,-5.6,-53.9,-1.4,-56.9,1.4,-56.9,5.6,-53.9,7.9,-53.4,9.9,-49.4,9.9,-47.6,12.9,-45.4,12.9,-42.6,14.9,-39.4,14.9,-37.6,17.6,-35.9,18.9,-33.6,22.9,-30.4,23.9,-28.4,23.9,-26.6,22.9,-25.4,22.9,-19.6,23.9,-18.4,23.9,-15.6,21.4,-15.1,21.1,-14.4,21.9,-13.9,25.4,-13.9,27.4,-11.1,28.1,-11.4,28.6,-12.9,29.4,-12.9,30.6,-10.9,34.4,-8.6,34.1,-8.1,30.1,-8.1,29.9,-5.6,28.1,-4.9,27.1,-3.6,29.1,-2.4,30.4,-0.6,34.9,1.6,39.9,9.6,39.9,11.4,38.6,11.9,36.4,8.9,34.6,8.9,31.4,6.9,28.6,6.9,27.1,4.4,27.1,-1.1,26.6,-1.6,25.9,-1.1,25.9,6.4,28.4,10.1,30.9,11.6,32.4,14.1,34.9,15.6,37.9,20.6,37.9,22.4,39.9,23.6,39.9,25.4,40.9,26.6,40.9,39.4,38.9,43.4,36.9,45.6,35.9,48.4,34.4,49.9,33.6,49.9,30.4,53.9],[[-9.9,-39.9,-8.9,-40.1,-9.4,-42.6,-10.1,-42.1],[10.6,-38.4,11.1,-39.1,9.4,-41.6,8.9,-39.9,9.9,-39.6],[-10.6,-37.4,-9.9,-37.9,-10.1,-39.9,-11.1,-39.1],[-6.1,-38.1,-4.4,-36.4,-2.9,-38.6,-2.9,-40.4,-1.6,-40.9,-1.1,-38.6,0.4,-37.9,1.1,-38.6,1.1,-40.4,2.4,-40.9,3.1,-38.1,4.6,-37.4,6.1,-39.6,6.1,-44.1,5.4,-44.6,4.4,-43.6,3.6,-46.6,2.4,-45.1,1.6,-45.1,0.4,-47.1,-0.4,-47.1,-1.6,-45.1,-2.4,-45.1,-3.6,-46.6,-4.1,-46.1,-4.1,-43.9,-4.6,-43.6,-5.4,-44.6,-6.1,-44.1],[7.4,-33.1,9.1,-36.6,8.9,-39.9,5.9,-37.4,5.9,-34.6],[-7.9,-32.9,-6.1,-34.1,-5.9,-35.4,-7.9,-37.9,-7.9,-39.1,-8.9,-39.9,-9.1,-36.6,-8.1,-35.4],[5.6,-22.1,6.9,-23.4,5.1,-24.6,5.1,-26.4,4.1,-27.6,4.1,-29.1,3.4,-29.6,2.9,-29.1,2.9,-26.6,3.9,-25.4,3.9,-23.6],[-6.4,-21.1,-4.4,-22.9,-2.9,-25.6,-2.9,-29.1,-3.4,-29.6,-4.1,-29.1,-4.1,-26.6,-5.4,-24.4,-7.1,-23.4,-7.1,-21.6],[17.9,-18.1,18.1,-24.4,16.1,-26.6,15.1,-31.4,13.1,-32.6,13.1,-36.1,12.4,-36.6,11.9,-36.1,11.9,-28.9,12.9,-28.1,13.1,-30.1,13.9,-30.1,13.6,-28.1,14.9,-27.1,14.9,-25.6,13.9,-23.6,14.4,-23.1,15.6,-23.9,16.9,-23.4,16.9,-18.9],[-17.9,-18.1,-16.9,-18.9,-16.9,-23.1,-14.9,-24.6,-14.9,-27.1,-14.4,-27.6,-13.6,-26.4,-12.9,-26.9,-12.9,-27.9,-13.9,-28.4,-13.9,-30.1,-13.1,-30.1,-12.9,-28.1,-11.9,-28.9,-11.9,-36.1,-12.4,-36.6,-13.1,-36.1,-13.1,-32.6,-15.1,-31.4,-15.1,-29.6,-16.1,-28.4,-16.1,-25.9,-18.1,-24.4],[19.6,-14.9,21.1,-15.1,21.1,-16.4,20.4,-17.1,18.9,-16.9,18.9,-15.6],[-21.1,-15.1,-19.6,-14.9,-18.9,-15.6,-18.9,-16.9,-20.4,-17.1,-21.1,-16.4],[29.9,-7.9,28.9,-10.6,28.1,-10.9,27.9,-8.6,28.6,-7.9],[-29.9,-7.9,-28.6,-7.9,-27.9,-8.6,-28.1,-10.9,-28.9,-10.6],[4.4,-2.4,5.1,-2.9,4.9,-4.1,3.9,-3.4],[-4.4,-2.4,-3.9,-3.4,-4.9,-4.1,-5.1,-2.9],[22.9,5.6,22.1,3.6,23.1,2.4,23.1,-4.4,18.4,-9.1,12.6,-9.1,11.6,-7.6,10.4,-7.6,9.4,-6.1,7.4,-5.6,7.9,-4.9,9.4,-4.9,11.6,-1.9,13.6,-0.9,15.9,2.6,18.6,5.1,20.4,5.1,21.6,6.1],[-22.9,5.4,-22.1,6.1,-20.6,6.1,-18.6,5.1,-9.4,-4.9,-7.9,-4.9,-7.4,-5.6,-9.4,-6.1,-12.6,-9.1,-18.4,-9.1,-20.4,-8.1,-23.1,-4.4,-23.1,1.4,-22.1,2.6,-22.1,4.4],[12.1,20.1,13.1,19.4,12.6,18.4,11.9,18.9],[14.9,23.1,15.9,24.1,16.9,23.9,16.1,22.9],[-16.9,23.9,-15.9,24.1,-14.9,23.1,-16.1,22.9]]]],"mid":[[[23.4,-26.4,22.1,-27.6,22.1,-30.6,23.9,-28.4],[]],[[-23.4,-26.4,-23.9,-28.4,-22.1,-30.6,-22.1,-27.6],[]],[[21.4,-21.1,19.6,-21.9,18.1,-24.6,18.1,-26.4,16.1,-29.6,16.1,-31.4,13.1,-37.4,10.1,-41.6,10.1,-44.6,13.9,-40.4,14.9,-38.4,14.9,-35.6,17.9,-33.4,19.9,-24.6,21.9,-23.4],[]],[[30.4,-9.6,31.6,-10.6,34.4,-8.4,31.6,-8.1],[]],[[-34.4,-8.4,-31.6,-10.6,-29.6,-9.6,-32.6,-8.1],[]],[[39.9,10.4,38.6,10.9,36.4,8.9,34.6,8.9,32.6,7.9,31.4,5.9,29.6,5.9,28.1,4.4,28.1,1.6,29.4,1.1,31.1,2.1,31.6,0.9,32.6,0.4,32.9,1.9,31.4,1.9,31.4,3.1,32.6,4.1,35.4,3.4,35.9,5.4,38.9,7.6],[]],[[-39.9,10.4,-39.6,9.1,-34.4,3.4,-32.6,4.1,-31.4,2.1,-29.6,2.1,-28.6,1.4,-28.1,1.9,-28.1,4.4,-31.4,5.9,-34.6,8.9,-36.4,8.9,-38.6,10.9],[]],[[35.4,17.9,33.4,16.9,33.1,15.6,33.6,15.1,34.9,15.6],[]],[[-26.6,55.6,-28.4,54.9,-32.9,50.6,-34.6,46.9,-36.9,46.4,-36.1,44.6,-36.9,42.6,-37.6,41.9,-39.4,41.6,-37.4,40.6,-37.9,39.9,-39.1,39.9,-39.4,38.9,-37.9,36.4,-37.9,31.6,-36.9,30.4,-36.9,25.9,-34.9,25.1,-34.9,22.6,-33.9,20.6,-28.6,15.6,-28.1,15.9,-27.9,18.6,-26.9,18.6,-26.9,13.6,-25.4,12.1,-22.9,11.9,-23.4,9.9,-25.9,8.4,-24.6,5.6,-23.4,7.1,-20.6,7.1,-18.6,6.1,-14.9,1.4,-14.9,0.6,-12.4,-0.9,-9.4,-3.9,-6.6,-3.9,-6.1,-3.4,-4.9,0.9,-4.1,0.6,-2.9,-2.4,-5.4,-4.9,-5.9,-6.4,-7.9,-7.6,-7.9,-9.4,-5.9,-10.6,-5.9,-16.1,-6.4,-16.9,-7.1,-16.6,-7.1,-15.6,-9.1,-12.4,-9.1,-9.6,-10.4,-8.4,-11.6,-9.1,-18.4,-9.1,-21.1,-7.4,-21.1,-6.6,-23.1,-4.4,-23.1,2.1,-23.6,2.6,-24.9,1.4,-24.9,-1.4,-28.9,-5.6,-28.9,-7.4,-24.4,-12.9,-19.1,-12.9,-13.9,-17.6,-13.9,-23.4,-12.9,-24.6,-12.9,-27.6,-11.1,-26.4,-10.9,-24.4,-9.9,-24.4,-9.9,-30.9,-10.9,-31.9,-10.9,-36.4,-9.9,-37.6,-10.1,-40.1,-11.4,-40.1,-12.1,-39.4,-14.1,-34.6,-16.1,-32.4,-16.1,-30.6,-17.1,-29.4,-17.1,-26.6,-19.1,-23.4,-19.1,-21.6,-19.9,-20.6,-21.4,-20.9,-21.9,-23.4,-19.9,-24.6,-19.9,-27.4,-18.9,-28.6,-18.9,-30.4,-16.9,-34.4,-14.9,-36.6,-14.9,-38.4,-11.4,-44.6,-10.1,-43.4,-10.1,-40.1,-8.9,-40.1,-8.9,-44.9,-9.9,-45.6,-8.9,-47.6,-8.9,-51.4,-6.4,-52.9,-4.4,-52.4,-3.9,-54.4,-1.4,-55.9,1.4,-55.9,4.6,-54.4,3.9,-53.4,4.4,-52.1,6.4,-52.9,8.4,-51.9,9.9,-49.4,9.1,-47.6,9.9,-45.1,8.9,-44.9,8.9,-40.1,7.1,-40.6,7.1,-42.4,5.6,-44.9,4.6,-43.6,4.1,-43.9,4.1,-46.1,4.6,-46.6,6.1,-44.9,8.9,-45.1,3.4,-50.1,-3.1,-50.1,-3.9,-49.1,-1.4,-47.9,1.6,-48.4,1.9,-45.9,1.4,-45.6,0.4,-47.1,-0.4,-47.1,-1.6,-45.6,-4.1,-49.1,-8.9,-45.4,-8.6,-44.9,-6.1,-44.9,-5.1,-46.4,-4.1,-46.1,-4.4,-44.6,-5.6,-44.9,-7.1,-42.4,-7.1,-40.6,-9.1,-39.9,-9.1,-32.1,-7.6,-31.9,-0.9,-35.6,-1.1,-37.1,-3.4,-37.4,-2.4,-40.9,-1.1,-40.4,-0.9,-36.9,1.1,-37.1,1.1,-40.4,2.4,-40.9,2.9,-40.4,2.9,-37.6,1.1,-37.1,0.9,-35.9,1.6,-35.1,3.1,-35.9,3.9,-33.9,4.9,-33.9,7.6,-31.9,8.9,-31.9,9.1,-39.6,9.9,-39.1,11.9,-35.4,10.9,-33.4,10.9,-31.9,8.9,-31.6,8.9,-30.6,10.9,-29.4,9.9,-27.4,9.9,-24.4,10.9,-24.4,11.1,-26.4,12.9,-27.6,12.9,-24.6,13.9,-23.4,13.9,-17.6,15.1,-15.4,16.9,-14.6,18.6,-12.9,24.4,-12.9,28.9,-7.4,28.9,-5.6,25.9,-2.4,25.9,0.4,24.9,1.6,24.9,9.4,22.9,10.4,21.1,12.4,22.4,13.1,23.6,12.1,25.4,12.1,26.9,13.6,26.9,18.6,27.6,18.9,28.1,16.6,29.4,16.1,33.9,20.6,34.9,22.6,34.9,25.6,35.4,25.9,36.4,24.6,36.9,24.9,36.9,30.4,37.6,31.1,40.4,31.1,40.9,31.6,40.9,39.4,39.4,40.4,39.6,41.4,38.1,42.1,38.6,43.6,36.9,45.6,36.9,46.4,35.6,46.9,33.9,48.6,33.9,49.4,30.9,51.6,29.6,53.9,26.4,55.6,26.1,54.6,30.1,49.4,30.1,46.6,32.1,45.4,32.1,38.6,30.1,37.4,29.1,35.4,29.1,32.6,27.4,30.9,26.6,30.9,25.4,28.9,23.1,27.6,21.1,23.9,17.6,23.9,14.4,21.9,11.1,22.1,11.9,23.1,14.9,24.6,14.9,26.4,16.9,28.6,16.9,33.4,15.4,34.1,14.6,35.4,14.1,35.1,14.1,32.6,13.1,30.6,11.1,29.4,11.1,27.6,9.1,25.4,8.9,23.9,4.6,23.9,2.4,26.9,0.4,27.9,-2.4,26.9,-4.6,23.9,-8.9,23.9,-9.6,26.1,-12.1,28.6,-14.1,32.6,-14.1,35.1,-14.6,35.4,-15.4,34.1,-16.9,33.4,-16.9,31.6,-15.9,30.4,-15.9,27.6,-14.9,26.4,-15.4,24.4,-11.1,22.9,-11.9,21.9,-14.4,21.9,-17.6,23.9,-20.4,23.9,-21.1,25.4,-23.1,26.6,-23.6,27.9,-29.1,27.9,-29.6,28.4,-26.4,30.6,-27.6,32.6,-28.9,31.9,-30.9,32.4,-30.6,33.1,-29.1,33.6,-29.1,35.4,-32.1,38.6,-32.1,40.4,-33.1,41.6,-33.1,44.4,-30.1,46.6,-30.1,49.4,-27.1,52.6,-26.1,54.6],[[-2.9,-52.6,-1.6,-51.9,0.6,-53.6,-1.4,-54.1],[7.4,-20.9,8.1,-21.6,8.1,-25.4,5.4,-27.1,3.4,-30.1,2.6,-30.1,1.9,-28.6,2.9,-27.4,2.9,-25.6,3.9,-23.6,5.9,-21.4],[9.4,-20.4,10.1,-20.9,9.9,-23.9,8.9,-23.1,8.9,-20.9],[-7.9,-20.1,-4.9,-21.6,-3.9,-24.4,-1.9,-26.6,-1.9,-29.4,-3.4,-30.9,-4.1,-30.1,-4.1,-28.6,-8.1,-24.4],[-9.1,-20.1,-8.9,-23.1,-9.9,-23.9,-10.1,-20.9],[16.1,-11.9,16.6,-12.6,13.6,-14.1,13.1,-16.4,11.4,-18.1,10.6,-18.1,9.9,-17.4,9.9,-14.6,13.6,-11.9],[-16.1,-11.9,-13.6,-11.9,-9.9,-14.6,-9.9,-18.1,-10.6,-18.9,-11.9,-17.9,-13.1,-14.6,-16.6,-12.6],[4.4,0.6,5.1,0.1,4.9,-3.9,2.9,-2.4],[-5.6,3.6,-4.9,3.1,-5.1,1.1,-6.1,1.9],[22.4,7.1,24.1,4.4,24.1,2.6,23.1,1.4,23.1,-4.4,21.1,-6.6,21.1,-7.4,18.4,-9.1,12.6,-9.1,10.6,-8.1,8.6,-9.9,7.9,-9.1,7.9,-7.6,5.9,-6.4,5.1,-4.1,9.4,-3.9,13.9,0.4,16.1,4.4,18.4,5.1,19.6,7.1],[15.1,7.1,16.1,6.1,15.9,4.1,14.9,4.9],[10.9,10.9,12.1,10.6,13.1,9.1,11.6,8.9,10.9,9.6],[7.9,13.1,8.1,11.9,7.4,11.4,6.9,12.4],[-23.1,13.4,-22.4,13.9,-21.1,12.4,-22.9,11.9],[26.1,21.1,27.1,20.1,26.9,18.9,25.9,19.9],[23.9,21.9,25.1,22.1,26.1,21.1,24.9,20.9],[10.4,22.1,11.1,22.1,11.6,21.1,12.4,21.1,13.9,19.6,12.6,17.1,11.9,17.4,11.9,19.4,10.1,21.6],[9.1,23.9,9.9,23.6,10.1,21.9,9.1,22.4],[21.1,23.9,22.1,24.1,23.1,23.1,21.9,22.9],[-10.9,23.1,-10.1,24.1,-9.1,23.9,-9.9,22.9],[32.9,26.9,34.1,27.1,34.9,26.1,33.9,25.9],[37.4,41.9,38.1,41.6,37.6,40.4,36.9,40.9]]]],"light":[[[8.9,-46.1,7.6,-46.1,5.9,-49.1,4.6,-49.1,3.4,-50.1,-3.4,-50.1,-4.6,-49.1,-5.6,-49.6,-4.4,-50.9,-1.6,-50.9,-0.9,-52.4,0.4,-52.9,1.6,-50.9,4.4,-50.9,6.1,-48.9,8.4,-48.9,8.9,-48.4],[]],[[-8.9,-46.1,-8.9,-48.4,-7.6,-48.9,-7.1,-47.6],[]],[[-2.4,-38.1,-2.9,-40.4,-1.6,-40.9,-1.1,-38.6],[]],[[10.4,-33.1,9.1,-33.6,9.4,-39.4,10.9,-36.4,10.9,-33.6],[]],[[-9.6,-32.4,-10.9,-33.6,-10.9,-36.4,-9.4,-39.4,-9.1,-32.9],[]],[[8.6,-20.4,8.1,-20.4,8.1,-25.4,5.6,-26.9,4.4,-29.4,5.4,-30.6,9.6,-25.6,8.9,-24.4],[]],[[-8.6,-20.4,-8.9,-26.4,-7.6,-28.4,-5.9,-28.9,-5.9,-31.1,-4.4,-32.1,-3.9,-31.6,-4.1,-28.6,-8.1,-24.4,-8.1,-20.4],[]],[[-1.6,-2.4,-5.6,-6.4,-4.9,-7.6,-4.9,-9.4,-5.9,-10.6,-5.9,-17.4,-7.6,-19.9,-5.6,-19.9,-4.9,-20.6,-4.9,-22.4,-1.9,-25.6,-1.1,-27.4,0.4,-27.9,2.9,-25.4,5.4,-20.9,6.6,-19.9,7.6,-19.9,7.6,-19.4,4.9,-16.4,4.1,-14.6,4.9,-13.4,4.9,-4.6,1.6,-3.1,1.1,-5.4,-0.4,-6.1,-1.1,-5.4,-1.1,-2.9],[]],[[27.9,-5.6,26.6,-5.1,25.4,-6.1,24.1,-6.1,24.9,-2.6,23.6,-1.4,23.1,-1.9,23.1,-4.4,21.4,-6.1,20.6,-7.9,18.4,-9.1,13.6,-9.1,10.6,-10.9,9.1,-13.6,9.1,-18.1,9.9,-18.1,9.9,-14.6,11.6,-12.9,12.4,-12.9,13.6,-10.9,18.4,-10.9,19.6,-9.9,20.9,-9.9,21.1,-11.4,22.4,-11.9,22.9,-10.6,26.6,-6.9,27.9,-6.4],[[23.4,-6.1,24.1,-6.4,23.6,-7.9,22.9,-7.6]]],[[-23.6,-0.6,-24.9,-2.6,-24.9,-4.4,-23.9,-5.9,-27.1,-5.6,-27.6,-6.6,-26.9,-8.4,-24.6,-8.9,-22.4,-10.9,-20.9,-9.9,-19.4,-10.9,-13.6,-10.9,-12.9,-12.4,-9.9,-14.6,-9.9,-18.1,-9.4,-18.4,-9.1,-13.6,-10.6,-10.9,-13.6,-9.1,-18.4,-9.1,-20.4,-8.1,-23.1,-4.4,-23.1,-0.9],[[-23.9,-6.1,-22.9,-6.9,-23.1,-7.9,-24.1,-7.1]]],[[35.9,7.4,34.9,7.4,33.9,5.9,32.6,5.9,31.4,4.9,29.6,4.9,29.1,3.6,30.4,3.1,32.9,4.4,34.1,6.1,35.4,6.1],[]],[[-36.6,7.6,-34.9,5.4,-30.4,3.1,-29.1,3.6,-29.6,4.9,-31.4,4.9,-33.1,6.6,-35.6,7.9],[]],[[-32.6,26.4,-30.4,22.1,-28.6,22.1,-26.6,21.1,-24.4,23.1,-22.9,22.9,-25.6,18.6,-22.9,16.4,-22.4,15.1,-20.6,15.1,-19.1,13.4,-21.6,10.9,-23.1,10.4,-23.9,8.6,-21.6,9.1,-15.4,4.1,-13.9,4.1,-13.1,3.4,-13.9,2.4,-13.4,1.1,-11.4,0.1,-9.6,0.1,-8.4,-0.9,-6.1,-0.4,-6.1,0.4,-8.1,2.6,-8.1,4.4,-10.9,7.1,-11.4,8.6,-17.4,12.6,-17.9,13.6,-16.9,14.9,-15.1,15.1,-9.1,8.9,-8.9,7.6,-4.9,3.4,-4.9,1.6,-3.4,-0.6,-1.1,0.6,-1.1,2.4,-0.4,3.1,1.1,2.4,1.1,0.6,2.4,0.1,2.9,2.1,4.9,2.9,7.9,7.6,10.9,9.6,10.9,10.9,14.4,12.1,14.9,11.4,13.4,9.6,13.9,8.1,12.6,7.9,11.6,6.4,10.4,6.6,9.6,6.1,9.1,3.6,5.1,0.4,5.6,-0.9,8.4,-0.9,11.6,1.1,13.6,1.6,12.9,3.4,14.9,5.6,15.1,7.1,17.6,6.4,21.6,9.1,23.9,8.6,22.9,10.6,20.6,10.9,19.4,12.9,17.9,12.9,17.4,13.6,19.4,14.1,25.9,18.6,25.4,20.1,23.4,21.9,23.1,23.1,24.4,23.1,26.6,21.1,27.4,21.1,30.6,23.1,32.6,26.4,30.4,27.9,26.6,27.9,23.1,25.4,22.9,22.9,18.6,22.9,14.6,20.9,12.1,15.6,10.1,14.4,9.9,12.1,8.1,12.6,7.9,13.4,10.9,17.6,10.9,20.4,7.4,22.9,4.6,22.9,2.6,21.9,1.9,22.6,1.9,25.4,0.4,27.9,-0.9,27.4,-1.9,25.4,-1.9,22.6,-2.6,21.9,-4.6,22.9,-9.4,22.9,-10.6,20.9,-12.4,20.9,-13.4,19.4,-14.6,20.9,-16.4,20.9,-18.6,22.9,-22.9,22.9,-23.1,25.4,-26.6,27.9,-30.4,27.9],[[4.9,9.1,5.1,7.9,4.4,7.4,3.9,8.4],[7.9,12.9,8.1,10.6,6.4,8.9,5.1,8.9,5.4,10.1],[-14.6,16.6,-13.9,16.1,-14.4,15.1,-15.1,15.4]]],[[28.4,30.6,31.6,29.1,35.4,29.1,35.9,29.6,35.9,31.9,34.9,31.9,33.9,32.9,31.6,32.9],[]],[[-29.6,31.1,-31.6,32.9,-33.4,32.9,-34.6,31.9,-35.9,31.9,-35.9,30.6,-34.4,28.1,-32.4,29.1,-30.6,29.1,-29.4,30.4],[]],[[14.6,35.4,14.1,35.1,14.1,32.6,13.1,31.4,13.1,29.6,12.1,27.6,9.6,25.1,9.9,24.1,12.4,24.1,12.9,26.4,14.9,28.6,15.9,33.4],[]],[[-14.6,35.4,-15.9,31.6,-14.9,30.4,-14.9,28.6,-12.9,26.4,-12.9,24.6,-11.6,24.1,-11.1,25.4,-12.1,26.6,-12.1,28.4,-13.1,29.6,-13.1,31.4,-14.1,32.6,-14.1,35.1],[]],[[31.4,49.4,31.1,47.6,33.1,44.4,33.1,38.6,31.1,37.4,30.4,35.6,32.6,34.1,33.9,34.1,34.6,35.1,35.6,34.9,36.1,32.4,36.6,32.4,36.9,38.1,36.4,38.4,35.6,37.4,34.9,37.9,35.9,42.4,33.6,46.9],[]],[[-31.9,49.9,-33.9,46.4,-33.9,43.6,-35.4,42.6,-35.1,41.4,-36.9,38.4,-36.6,32.4,-34.6,34.9,-32.9,34.6,-31.1,35.6,-31.6,36.6,-32.6,36.4,-33.1,36.9,-33.1,44.4,-31.1,47.6,-31.1,49.1],[]],[[27.1,54.9,28.1,52.6,29.4,52.1,28.9,54.4],[]]],"top":[[[10.4,-34.1,9.1,-34.6,9.4,-39.4,10.9,-36.4],[]],[[-10.4,-33.1,-10.9,-33.6,-10.9,-36.4,-9.4,-39.4,-9.1,-33.6],[]],[[8.6,-20.6,8.1,-20.9,8.1,-25.1,6.1,-26.6,6.1,-27.9,8.9,-26.4],[]],[[-8.6,-20.6,-8.9,-26.1,-8.1,-26.6,-8.1,-20.9],[]],[[26.9,-5.6,25.9,-5.6,23.6,-7.9,22.9,-7.6,22.9,-6.1,21.6,-6.1,20.6,-7.9,18.4,-9.1,13.6,-9.1,10.1,-11.6,10.1,-13.6,11.1,-13.4,13.6,-10.9,18.4,-10.9,19.6,-9.9,20.9,-9.9,21.6,-10.9,22.4,-10.9,26.6,-6.9],[]],[[-25.9,-7.6,-25.4,-8.9,-24.6,-8.9,-22.4,-10.9,-21.6,-10.9,-20.9,-9.9,-17.6,-9.9,-16.4,-10.9,-13.1,-10.9,-12.9,-12.4,-10.1,-13.9,-10.6,-11.9,-12.9,-11.1,-13.6,-9.1,-18.4,-9.1,-20.6,-7.9,-22.4,-5.4,-23.1,-7.9,-24.6,-7.1],[]],[[-1.6,-4.4,-2.6,-5.1,-2.9,-7.4,-3.9,-8.6,-3.1,-10.4,-3.9,-12.4,-2.9,-13.6,-3.9,-15.6,-3.9,-18.1,-4.4,-18.6,-5.6,-18.4,-6.6,-19.4,-4.9,-20.6,-4.9,-22.4,-2.9,-23.6,-1.4,-27.1,0.4,-27.9,1.1,-26.4,2.9,-25.4,2.9,-24.1,4.6,-22.9,4.9,-20.6,6.6,-19.4,3.9,-17.4,4.6,-15.4,3.9,-14.4,3.9,-12.6,2.9,-11.4,3.9,-8.6,2.9,-7.4,2.6,-5.1,1.6,-4.4,1.1,-4.9,1.1,-14.4,3.1,-15.6,3.1,-18.4,4.1,-19.6,4.1,-21.4,2.6,-24.4,1.4,-25.1,-0.1,-24.4,-0.1,-6.6],[]],[[23.6,-1.6,23.1,-1.9,23.1,-5.6,24.9,-4.4],[]],[[8.6,10.9,7.1,9.4,7.1,8.6,4.1,6.4,3.1,4.4,3.9,2.6,4.9,2.9,7.4,7.1,9.6,9.1,9.9,10.4],[]],[[-18.4,10.1,-17.9,7.6,-15.4,6.1,-8.4,-0.9,-6.1,-0.4,-6.1,0.4,-7.4,0.9,-10.6,4.9,-13.1,6.4,-14.1,7.6,-14.1,9.4,-15.6,10.9,-17.4,10.9],[]],[[18.4,10.1,15.6,11.6,13.6,9.6,14.1,8.1,13.1,6.6,10.4,4.9,8.1,2.4,8.1,1.6,6.1,0.4,6.1,-0.4,8.4,-0.9,9.6,0.1,10.9,2.4,14.4,4.9,15.1,7.1,17.4,6.4,18.6,9.4],[]],[[10.6,14.9,10.1,12.6,11.6,11.4,13.6,13.4,11.9,14.9],[]],[[-11.6,17.6,-9.9,16.4,-7.9,12.4,-4.9,10.4,-4.1,7.9,-7.4,8.9,-7.9,7.6,-5.9,4.4,-3.6,3.1,-3.1,4.4,-4.1,5.6,-4.1,7.9,-2.6,8.1,-1.9,7.6,-0.4,5.1,0.4,5.1,1.4,6.6,2.6,6.6,5.9,10.6,5.9,12.4,8.9,14.6,10.9,18.4,8.6,18.9,7.4,20.9,4.6,20.9,4.1,20.4,4.1,17.6,2.1,16.4,1.9,13.4,0.9,13.4,0.9,16.4,-0.4,16.9,-1.1,12.9,-2.4,12.9,-3.1,13.6,-3.1,16.4,-4.1,17.6,-4.1,20.4,-4.6,20.9,-7.4,20.9,-8.6,18.9,-10.4,18.9],[[-0.9,13.1,1.1,12.9,1.1,10.6,0.4,9.9,-1.1,10.6]]],[[23.4,21.9,19.6,21.9,18.1,19.4,18.6,17.9,19.6,17.1,21.1,17.6,23.9,20.1],[]],[[-23.1,22.4,-23.9,21.4,-23.4,19.9,-21.4,18.1,-18.9,17.6,-18.1,19.4,-19.1,21.4,-21.6,22.9],[]],[[30.4,26.6,27.6,26.9,24.9,25.4,24.4,24.4,25.6,22.1,26.9,22.4],[]],[[-30.4,26.6,-26.4,22.1,-25.6,22.1,-24.1,23.6,-24.6,25.1,-27.6,26.9],[]],[[-0.4,27.9,-1.6,25.4,-0.9,24.4,-0.9,18.6,0.4,18.1,0.9,18.6,0.9,27.4],[]],[[33.4,32.9,31.6,32.9,29.6,30.4,32.4,29.4,33.9,31.6],[]],[[-32.4,32.9,-33.6,31.4,-32.9,29.6,-31.6,29.1,-29.6,30.6,-30.9,31.4,-31.6,32.9],[]],[[14.6,35.4,14.1,35.1,14.1,29.6,13.1,28.4,13.4,27.4,14.6,28.1,14.9,30.4,15.9,31.6],[]],[[-14.6,35.4,-14.9,28.6,-13.4,27.4,-13.1,28.4,-14.1,29.6,-14.1,35.1],[]],[[-34.4,40.9,-34.9,40.4,-34.9,35.6,-32.9,35.1,-32.4,35.6,-33.1,36.6,-33.1,40.4],[]],[[33.6,43.9,33.1,43.4,33.1,35.6,34.4,35.1,34.9,35.6,34.9,43.4],[]]],"sock":[[[21.9,-0.4,21.1,-0.4,21.1,-3.4,20.4,-4.1,19.1,-4.4,16.4,-7.1,12.4,-7.1,12.4,-7.9,19.9,-7.6,21.9,-5.4],[]],[[-21.9,-0.4,-21.9,-5.4,-20.4,-7.9,-12.4,-7.9,-12.4,-7.1,-16.4,-7.1,-21.1,-2.4,-21.1,-0.4],[]],[[17.9,0.6,15.1,-0.4,13.4,-2.1,12.6,-3.9,11.4,-3.4,12.4,-4.9,16.4,-4.9,17.9,-2.4],[]],[[-17.9,0.4,-17.9,-2.4,-16.4,-4.9,-11.4,-4.9,-11.4,-4.1,-13.4,-3.1,-16.1,0.6,-17.4,0.9],[]]],"eye":[[[17.9,0.6,15.4,-0.1,13.1,-2.4,12.9,-3.9,12.4,-4.1,11.6,-3.1,11.1,-3.6,12.4,-4.9,16.6,-4.9,16.9,-3.4,17.9,-2.6],[]],[[-17.6,0.9,-17.9,-2.6,-16.9,-3.4,-16.9,-4.6,-12.4,-4.9,-12.1,-4.4,-14.1,-2.6,-14.1,-1.4,-16.4,0.9],[]]],"core":[[[16.6,-0.1,15.4,-0.1,13.1,-2.4,13.4,-3.9,14.6,-3.9,15.4,-2.9,16.9,-2.6],[]],[[-16.6,-0.1,-16.9,-1.6,-15.4,-1.9,-14.6,-3.9,-13.4,-3.9,-14.1,-1.4,-15.4,-0.1],[]]]};
    const ds = (function () {
        const ring = (f) => { const r = []; for (let i = 0; i < f.length; i += 2) r.push(new THREE.Vector2(f[i], f[i + 1])); return r; };
        const ext = (key, depth, bt, bs, z0) => {
            const shapes = DS_TRACE[key].map(e => { const sh = new THREE.Shape(ring(e[0])); e[1].forEach(h => sh.holes.push(new THREE.Path(ring(h)))); return sh; });
            const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 1, curveSegments: 1 });   // 1 bevel segment: the skull is only ~17x22 px on screen
            g.translate(0, 0, z0 - depth / 2); return g;
        };
        const mat = (c, k, rough, d) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(d === undefined ? 0.4 : d), metalness: 0.0, roughness: rough || 0.9, emissive: c, emissiveIntensity: k });   // each layer glows faintly in its OWN colour (keeps the sprite's warm ivory), real light/shade comes on top
        // [geometry, material]: ink outline (deepest) -> bone tone levels, each thicker than the last -> recessed sockets + glowing eyes
        return [
            { geo: ext('outline', 4, 1.0, 0.6, 0), mat: mat(0x0a0a0a, 0, 0.9, 0.2) },
            { geo: ext('base', 7, 1.2, 0.35, 0.5), mat: mat(0x8a7c6c, 0.62) },
            { geo: ext('mid', 11, 1.4, 0.3, 1.5), mat: mat(0xb9ab94, 0.62) },
            { geo: ext('light', 15, 1.6, 0.3, 2.5), mat: mat(0xdfd6bd, 0.6) },
            { geo: ext('top', 19, 1.8, 0.3, 3.5), mat: mat(0xf0ead6, 0.58) },
            { geo: ext('sock', 3, 0.8, 0.2, -0.5), mat: mat(0x7a4634, 0.6) },
            { geo: ext('eye', 3, 1.0, 0.2, 0.6), mat: new THREE.MeshStandardMaterial({ color: 0x300500, roughness: 0.5, emissive: 0xf2300c, emissiveIntensity: 1.0 }) },
            { geo: ext('core', 3, 1.0, 0.15, 1.6), mat: new THREE.MeshStandardMaterial({ color: 0x402000, roughness: 0.5, emissive: 0xffa024, emissiveIntensity: 1.0 }) }
        ];
    })();
    const dsInst = ds.map(L => { const im = new THREE.InstancedMesh(L.geo, L.mat, DS_MAX); im.frustumCulled = false; im.count = 0; scene.add(im); return im; });
    let nDs = 0;
    const dsM = new THREE.Matrix4(), dsE = new THREE.Euler(), dsQ = new THREE.Quaternion(), dsP = new THREE.Vector3(), dsS = new THREE.Vector3(), dsO = new THREE.Matrix4();
    const DS_TILT_X = 0.16;                             // slight fixed forward tilt (top toward the viewer) so the brow / crest relief catches the key light
    // x,y = where the sprite's anchor point lands in the world (already including the game's float bob), scale = world px per sprite px (the game's own fit scale),
    // ox,oy = the sprite pixel that is anchored at x,y (the visible-bbox centre, or the image centre when the game could not measure it), phase = the game's per-item index.
    G.dragonSkull = function (x, y, scale, ox, oy, phase) {
        if (!G.active || nDs >= DS_MAX || !(scale > 0)) return;
        const sx0 = toX(x), sy0 = toY(y);
        if (sx0 < -70 || sx0 > W + 70 || sy0 < -70 || sy0 > H + 70) return;   // off-screen collectables are not drawn (the game still updates / collects them as before)
        const i = nDs++, ph = (phase || 0) + timeMs * 0.0016;
        dsE.set(DS_TILT_X, 0.3 * Math.sin(ph), 0.02 * Math.sin(ph * 0.7 + 1), 'YXZ'); dsQ.setFromEuler(dsE);
        const s = scale * T.a;
        dsM.compose(dsP.set(sx0, sy0, DS_Z), dsQ, dsS.set(s, s, s));
        dsM.multiply(dsO.makeTranslation(64 - ox, oy - 64, 0));
        for (const im of dsInst) im.setMatrixAt(i, dsM);
    };


    // ----------------------------------------------------------- the Flower collectable
    // 2.5D version of the existing Flower collectable (flower-spawn.png - the sprite the game drops into the world; typeIndex 1 of the Antique
    // collectables, drawn through the same loop as the Dragon Skull). Same design as the sprite: a purple moth orchid - dorsal petal, two large veined side
    // petals, two lower petals, a darker central lip with its gold column - on a green stem with spiral leaf tendrils and small gold curls.
    // The layers are traced from the sprite's own pixels: ink outline, the green stem, the purple petals in tone levels (shadowed base, lit petal
    // surface, brightest highlights - extruded to increasing depth so the petals read as curved and the dark veins stay recessed), the dark
    // central lip raised above them with the gold column on top, and the leaf highlights on the stem. The model is authored in the sprite's pixel units
    // (128 x 128 frame, centre at the origin, y up).
    // Visual only: the game still owns spawning, position, its floating bob, collection range/sound/counters/score; it hands in position + the exact
    // scale/anchor it already uses to size the sprite via GTD3D.flower(). A slight idle sway about the vertical axis (phased per flower, same index the
    // game's bob uses) lets the depth read while the flower stays front-facing and recognisable.
    // Performance: each layer is ONE InstancedMesh (8 draw calls total for any number of flowers).
    const FL_MAX = 64;
    const FL_Z = 108;                                   // same slot as the other collectables: above asteroids, below weapons
    const FL_TRACE = {"outline":[[[-1.4,53.9,-4.6,51.9,-9.9,46.4,-11.9,42.4,-11.9,40.6,-12.9,39.4,-12.9,35.6,-13.4,35.1,-14.6,35.9,-21.4,35.9,-31.4,30.9,-34.6,27.9,-36.6,26.9,-39.9,23.4,-40.9,21.4,-40.9,16.6,-39.9,15.4,-38.9,10.6,-35.9,4.6,-29.1,-2.4,-31.9,-5.6,-32.9,-7.6,-32.9,-9.4,-33.9,-10.6,-33.9,-12.4,-34.9,-13.6,-34.9,-18.4,-32.4,-20.9,-26.6,-20.9,-25.4,-19.9,-22.6,-19.9,-21.4,-18.9,-19.6,-18.9,-13.6,-15.9,-11.9,-14.1,-10.6,-13.9,-9.1,-15.4,-9.9,-16.6,-9.6,-17.9,-5.4,-21.9,-3.6,-21.9,-2.6,-21.1,-1.9,-21.6,-1.9,-34.4,-2.4,-34.9,-3.1,-34.4,-5.1,-30.4,-8.4,-27.1,-12.6,-24.1,-19.4,-24.1,-23.4,-26.1,-26.9,-29.6,-27.9,-31.6,-27.9,-36.4,-26.9,-38.4,-23.4,-41.9,-16.6,-41.9,-12.1,-37.4,-12.1,-34.6,-16.6,-30.1,-18.4,-30.1,-21.9,-33.6,-21.9,-35.4,-19.4,-37.9,-18.6,-37.9,-17.1,-36.4,-17.9,-34.4,-16.6,-33.9,-15.9,-34.6,-15.9,-37.4,-17.6,-39.1,-21.4,-39.1,-24.1,-36.4,-24.1,-32.6,-23.1,-30.6,-21.4,-28.9,-19.4,-27.9,-13.6,-27.9,-11.6,-28.9,-7.9,-32.6,-5.9,-36.6,-4.9,-41.4,-5.6,-41.9,-6.6,-41.1,-9.4,-41.1,-12.9,-44.6,-12.9,-46.4,-9.4,-49.9,-7.6,-49.9,-5.4,-48.1,-4.9,-48.6,-4.9,-53.4,-4.4,-53.9,3.4,-53.9,3.9,-53.4,3.9,-50.6,4.9,-49.4,4.9,-47.6,5.4,-47.1,8.6,-49.9,10.4,-49.9,13.9,-46.4,13.9,-44.6,10.4,-41.1,6.6,-41.1,6.1,-40.6,7.9,-36.6,11.6,-32.9,15.6,-30.9,17.4,-30.9,18.6,-29.9,23.4,-29.9,26.1,-31.6,27.1,-33.6,27.1,-37.4,25.4,-39.1,21.6,-39.1,20.9,-38.4,21.1,-37.1,23.9,-35.4,23.6,-34.1,22.4,-33.1,20.6,-33.1,17.1,-36.6,17.1,-39.4,21.6,-43.9,24.4,-43.9,26.4,-42.9,28.9,-40.6,30.9,-37.4,30.9,-31.6,29.9,-29.6,26.4,-26.1,22.4,-24.1,15.6,-24.1,9.6,-27.1,5.1,-31.4,3.4,-33.9,2.9,-33.4,2.9,-22.6,3.6,-21.9,5.4,-21.9,9.6,-17.9,9.9,-16.6,9.1,-15.4,10.6,-13.9,11.9,-14.1,13.6,-15.9,19.6,-18.9,21.4,-18.9,22.6,-19.9,25.4,-19.9,26.6,-20.9,32.4,-20.9,34.9,-18.4,34.9,-13.6,33.9,-12.4,32.9,-7.6,29.1,-2.4,35.9,4.6,38.9,10.6,38.9,12.4,40.9,16.6,40.9,21.4,38.9,24.6,31.4,30.9,21.4,35.9,14.6,35.9,13.4,35.1,12.9,35.6,12.9,39.4,11.9,40.6,11.9,42.4,9.9,46.4,3.4,52.9,1.4,53.9],[]]],"base":[[[-1.6,-0.4,-0.4,-1.9,0.9,-1.4,0.4,-0.1],[]],[[-38.9,23.4,-39.9,21.4,-39.9,16.6,-38.9,15.4,-37.9,10.6,-34.9,4.6,-28.4,-1.9,-24.4,-3.9,-18.9,-4.1,-19.6,-5.1,-25.4,-5.1,-28.4,-3.4,-29.6,-4.1,-29.9,-5.4,-31.9,-7.6,-31.9,-9.4,-33.9,-13.6,-33.9,-18.4,-32.4,-19.9,-26.6,-19.9,-25.4,-18.9,-22.6,-18.9,-21.4,-17.9,-19.6,-17.9,-12.6,-14.1,-11.9,-11.9,-9.4,-13.9,-7.4,-13.9,-7.1,-12.6,-4.9,-14.6,-3.9,-16.6,-4.6,-18.1,-6.4,-18.1,-7.1,-17.4,-6.1,-15.4,-6.4,-14.1,-8.9,-16.6,-8.6,-17.9,-5.4,-20.9,-3.6,-20.9,-0.4,-17.9,0.9,-18.1,3.6,-20.9,5.4,-20.9,8.6,-17.9,8.9,-16.6,6.4,-14.1,6.1,-15.4,7.1,-17.4,6.4,-18.1,4.6,-18.1,3.9,-16.6,4.9,-14.6,7.1,-12.6,7.4,-13.9,9.4,-13.9,11.6,-11.9,12.1,-12.1,12.4,-13.9,13.6,-14.9,19.6,-17.9,21.4,-17.9,22.6,-18.9,25.4,-18.9,26.6,-19.9,32.4,-19.9,33.9,-18.4,33.9,-13.6,32.9,-12.4,31.9,-7.6,29.1,-3.6,28.4,-3.4,25.4,-5.1,19.6,-5.1,18.9,-4.1,24.4,-3.9,28.4,-1.9,33.9,3.4,37.9,10.6,37.9,12.4,39.9,16.6,39.9,21.4,37.9,24.6,31.4,29.9,21.4,34.9,14.6,34.9,13.4,33.9,12.1,33.9,11.9,39.4,10.9,40.6,10.9,42.4,8.9,46.4,3.4,51.9,1.4,52.9,-1.4,52.9,-4.6,50.9,-7.9,47.6,-10.9,42.4,-10.9,40.6,-11.9,39.4,-12.1,33.9,-13.4,33.9,-14.6,34.9,-21.4,34.9,-31.4,29.9,-34.6,26.9,-36.6,25.9],[[2.4,-6.9,2.9,-7.9,2.1,-8.6,2.1,-11.4,1.4,-11.9,0.9,-11.4,0.9,-7.6],[-2.4,-6.9,-0.9,-7.6,-0.9,-11.4,-1.4,-11.9,-2.1,-11.4,-2.1,-8.6,-2.9,-7.9],[10.1,-5.9,12.4,-5.9,14.1,-7.6,14.1,-10.4,13.4,-11.1,12.9,-10.9,12.9,-7.4,10.6,-7.1,9.9,-6.4],[-10.1,-5.9,-9.9,-6.4,-10.6,-7.1,-12.9,-7.4,-12.9,-10.9,-13.4,-11.1,-14.1,-10.4,-14.1,-7.6,-12.4,-5.9],[6.9,-5.1,9.4,-4.9,10.1,-5.9,7.6,-6.1],[-10.1,-5.9,-9.4,-4.9,-6.9,-5.1,-7.6,-6.1],[17.1,-3.4,18.4,-2.9,19.1,-3.9,17.6,-4.1],[5.6,-2.9,7.1,-3.1,6.9,-5.1,5.6,-5.1,4.9,-4.4],[-7.1,-3.1,-5.6,-2.9,-4.9,-4.4,-5.6,-5.1,-6.9,-5.1],[-19.1,-3.9,-18.4,-2.9,-17.1,-3.4,-17.6,-4.1],[6.9,-2.9,7.6,-1.9,12.1,-2.1,11.4,-3.1],[-12.1,-2.1,-7.6,-1.9,-6.9,-2.9,-11.4,-3.1],[6.9,0.1,7.1,1.1,8.1,0.9,7.6,0.1],[-8.1,0.9,-7.1,1.1,-6.9,0.1,-7.6,0.1],[14.1,6.1,15.1,5.4,15.1,1.6,16.1,0.4,15.9,-1.1,13.9,-0.1],[-14.4,6.1,-13.9,5.9,-13.9,0.1,-14.9,-0.1,-15.1,5.4],[8.1,4.4,7.1,1.1,5.6,0.9,5.9,0.1,7.1,-0.1,6.4,-1.1,3.6,-1.1,0.4,-4.1,-0.9,-3.9,-3.6,-1.1,-6.4,-1.1,-7.1,-0.1,-5.9,0.1,-5.6,0.9,-7.1,1.1,-7.1,2.4,-7.9,3.4,-6.9,6.1,-5.9,5.4,-5.9,3.6,-5.4,3.4,-2.4,6.9,-0.6,2.1,0.6,1.4,1.9,3.6,1.9,7.4,2.4,7.9,3.1,7.4,3.1,5.6,4.1,4.4,5.4,4.1,6.6,6.1],[7.4,8.1,8.1,6.6,7.1,5.9,6.9,7.9],[-7.4,8.1,-6.9,7.9,-7.1,5.9,-8.1,6.6],[13.1,9.1,14.1,8.4,13.9,5.9,12.9,6.6],[-13.1,9.1,-12.9,6.6,-13.9,5.9,-14.1,8.4],[5.6,12.1,7.1,9.4,6.9,7.9,4.9,9.6,4.9,11.4],[-5.6,12.1,-4.9,11.4,-4.9,9.6,-6.9,7.9,-7.1,9.4],[10.9,12.4,12.1,11.4,12.1,9.6,10.9,10.6],[-10.9,12.4,-10.9,10.6,-12.1,9.6,-12.1,11.4],[6.9,13.4,7.6,14.1,9.4,14.1,10.1,13.1,7.1,12.9],[-10.1,13.4,-9.4,14.1,-7.6,14.1,-6.9,13.1,-9.9,12.9],[5.9,20.1,6.1,18.6,4.9,17.6,4.9,19.4],[6.9,29.1,7.1,20.6,6.1,19.9,5.9,28.4],[-6.9,29.1,-5.9,28.4,-5.9,20.6,-6.4,20.1,-7.1,20.6],[8.1,31.4,8.1,29.6,7.1,28.9,6.9,30.4],[-8.1,31.4,-6.9,30.4,-7.1,28.9,-8.1,29.6],[9.6,32.9,10.6,34.1,12.1,33.9,11.4,32.9],[-12.1,33.9,-10.6,34.1,-9.6,32.9,-11.4,32.9]]]],"petal":[[[31.9,-7.6,30.6,-6.6,31.1,-7.1,31.1,-9.4,32.1,-10.1,32.1,-15.4,31.1,-16.6,30.9,-18.1,22.1,-18.1,19.4,-16.1,18.4,-16.4,18.6,-17.1,19.6,-17.9,21.9,-17.9,22.6,-18.9,25.4,-18.9,26.6,-19.9,32.4,-19.9,33.9,-18.4,33.9,-13.6,32.9,-12.4,32.9,-10.6,31.9,-9.9],[]],[[-31.9,-7.6,-31.9,-9.9,-32.9,-10.6,-32.9,-12.4,-33.9,-13.6,-33.9,-18.4,-32.4,-19.9,-26.6,-19.9,-25.4,-18.9,-22.6,-18.9,-21.9,-17.9,-19.6,-17.9,-17.4,-16.6,-17.6,-16.1,-19.4,-16.1,-22.1,-18.1,-30.9,-18.1,-30.4,-16.4,-32.1,-15.4,-32.1,-10.1,-31.1,-9.4,-31.1,-7.1,-30.6,-6.6],[]],[[-39.9,21.4,-39.9,16.6,-38.9,15.4,-38.9,13.6,-36.9,10.4,-36.9,8.6,-32.9,2.4,-29.6,-0.9,-24.4,-3.9,-19.6,-3.9,-16.1,-0.4,-15.1,1.6,-15.1,3.4,-16.4,2.4,-17.1,2.6,-17.1,9.4,-18.1,10.1,-16.1,11.6,-16.1,12.4,-16.6,12.9,-19.4,12.9,-23.6,9.9,-28.4,8.9,-28.1,8.1,-23.1,8.1,-22.9,7.6,-23.6,6.9,-29.4,6.9,-32.9,10.4,-32.1,11.6,-32.1,13.4,-35.6,16.9,-37.4,16.9,-38.1,17.6,-38.1,19.4,-37.4,20.1,-33.4,18.1,-29.9,18.1,-29.4,17.1,-25.6,17.1,-24.4,16.1,-19.1,16.1,-18.4,17.1,-17.6,17.1,-17.1,16.6,-18.6,15.9,-18.4,15.1,-15.9,15.1,-15.4,14.1,-14.1,14.1,-11.9,12.4,-11.1,12.4,-10.1,14.1,-7.6,14.1,-6.4,13.1,-4.6,13.1,-3.1,15.1,-2.9,10.6,-0.4,8.1,0.9,8.4,2.9,10.6,3.1,15.1,4.1,14.4,4.1,12.6,5.9,12.1,6.6,10.4,7.1,12.1,9.6,12.4,9.6,12.9,7.4,12.9,6.9,11.9,6.1,11.9,6.1,12.6,7.6,14.1,9.4,14.1,10.4,12.9,12.1,12.1,14.1,14.1,15.4,14.1,15.9,15.1,18.4,15.1,18.6,15.9,17.1,16.6,17.6,17.1,18.4,17.1,19.1,16.1,24.4,16.1,25.6,17.1,29.4,17.1,29.9,18.1,33.4,18.1,37.4,20.1,38.1,19.4,38.1,17.6,36.4,15.9,34.6,15.9,32.1,13.4,32.1,11.6,32.9,10.4,29.4,6.9,23.6,6.9,22.9,7.6,23.1,8.1,27.4,8.1,27.4,8.9,24.6,9.9,23.4,11.9,20.6,11.9,19.4,12.9,16.6,12.9,16.1,12.4,16.6,11.1,18.6,10.1,20.4,10.1,23.1,8.4,22.9,7.9,20.6,7.9,18.6,8.9,18.1,8.4,18.1,1.6,17.4,1.1,16.1,2.4,15.1,2.4,16.1,-0.4,19.6,-3.9,24.4,-3.9,28.4,-1.9,32.9,2.4,36.9,8.6,37.9,13.4,39.9,16.6,39.9,21.4,36.6,25.9,34.6,26.9,31.4,29.9,21.4,34.9,14.6,34.9,9.1,31.6,7.1,28.4,7.1,20.6,5.1,16.6,2.9,14.9,1.4,15.9,-1.4,15.9,-2.9,14.9,-7.1,19.6,-7.1,28.4,-8.1,30.4,-10.6,32.9,-14.6,34.9,-21.4,34.9,-31.4,29.9,-34.6,26.9,-36.6,25.9],[[-17.9,9.9,-20.6,7.9,-23.1,8.1,-20.4,10.1],[12.1,14.6,13.9,15.1,14.1,14.1,12.6,13.9],[-14.1,14.9,-10.6,15.1,-10.1,14.1,-13.9,13.9],[13.9,15.1,14.6,16.1,15.9,15.6,15.6,14.9],[-15.9,15.6,-14.6,16.1,-13.9,15.1,-15.6,14.9],[20.4,17.4,20.6,18.1,24.1,17.9,23.1,16.9,20.9,16.9],[-24.1,17.9,-20.6,18.1,-20.4,17.4,-20.9,16.9,-23.1,16.9],[23.9,18.4,24.6,19.1,29.4,19.1,29.9,18.6,29.6,17.9,24.1,17.9],[13.9,18.1,14.6,19.1,16.1,18.9,15.4,17.9],[-16.1,18.9,-14.6,19.1,-14.1,18.4,-15.4,17.9],[-29.9,18.6,-29.4,19.1,-24.6,19.1,-23.9,18.1,-29.6,17.9],[15.9,19.1,16.6,20.1,18.1,19.9,17.4,18.9],[-18.1,19.9,-16.6,20.1,-15.9,19.1,-17.4,18.9],[17.9,20.1,18.6,21.1,20.1,20.9,19.4,19.9],[-20.1,20.9,-18.6,21.1,-17.9,20.1,-19.4,19.9],[19.9,21.1,20.6,22.1,22.1,21.9,21.4,20.9],[-22.1,21.9,-20.6,22.1,-19.9,21.1,-21.4,20.9],[21.9,22.1,22.6,23.1,24.1,22.9,23.4,21.9],[-24.1,22.9,-22.6,23.1,-21.9,22.1,-23.4,21.9],[15.1,23.4,15.1,21.6,14.1,20.9,13.9,22.4],[-15.1,23.4,-13.9,22.4,-14.1,20.9,-15.1,21.6],[23.9,23.1,24.6,24.1,29.1,23.9,28.4,22.9],[-28.9,23.6,-28.4,24.1,-24.6,24.1,-23.9,23.1,-28.4,22.9],[28.9,24.1,29.6,25.1,30.9,24.6,30.4,23.9],[26.1,25.4,26.6,26.1,27.9,25.6,27.4,24.9],[16.6,24.9,17.6,26.1,19.1,25.9,18.4,24.9],[-19.1,25.9,-17.6,26.1,-16.6,24.9,-18.4,24.9],[-27.9,25.6,-27.4,26.1,-25.6,26.1,-25.4,25.1,-27.4,24.9],[18.9,26.1,19.6,27.1,22.1,26.9,21.4,25.9],[-22.1,26.9,-19.6,27.1,-18.9,26.1,-21.4,25.9],[21.9,27.1,22.6,28.1,25.4,28.1,25.9,27.6,25.4,26.9],[-25.9,27.6,-25.4,28.1,-22.6,28.1,-21.9,27.1,-25.4,26.9]]],[[2.4,42.9,1.1,42.4,1.4,22.4,1.9,22.6,1.9,25.4,2.9,26.6,2.9,29.4,3.9,30.6,3.9,38.4,2.9,39.6,2.9,42.4],[]],[[-1.6,46.6,-1.9,43.6,-2.9,42.4,-2.9,39.6,-3.9,38.4,-3.9,30.6,-2.9,29.4,-2.9,26.6,-1.9,25.4,-1.9,22.6,-1.4,22.4,-1.1,46.4],[]],[[-11.9,39.4,-11.9,35.6,-11.4,35.4,-11.1,37.4,-10.1,38.6,-10.1,41.4,-8.4,43.1,-7.1,45.6,-2.4,50.1,-0.6,50.1,0.4,48.4,1.6,50.1,2.4,50.1,7.1,45.6,8.4,43.1,10.1,41.4,10.1,38.6,11.1,37.4,11.1,35.6,11.9,35.6,11.9,39.4,10.9,40.6,10.9,42.4,8.9,46.4,4.6,50.9,1.4,52.9,-1.4,52.9,-3.4,51.9,-7.9,47.6,-10.9,42.4,-10.9,40.6],[]]],"petalhi":[[[33.4,-13.4,33.1,-18.4,33.6,-18.6,33.9,-13.6],[]],[[-33.6,-13.4,-33.9,-18.4,-33.4,-18.6,-33.1,-13.6],[]],[[-0.4,13.9,-2.6,11.9,-2.9,10.6,-0.9,8.4,0.4,8.1,2.9,10.6,2.9,11.4,0.9,13.6],[]],[[24.4,19.6,24.6,19.1,29.4,19.1,29.4,19.9],[]],[[-29.6,19.6,-29.4,19.1,-24.4,19.4,-24.6,19.9],[]],[[33.9,22.4,33.1,22.6,30.4,21.4,33.4,21.1],[]],[[14.6,34.9,9.4,31.9,7.1,28.4,7.1,19.1,5.4,17.9,4.4,15.9,3.4,15.6,4.6,13.1,6.4,13.1,7.6,14.1,9.9,14.1,11.1,12.4,11.9,12.4,14.1,14.1,15.6,14.4,15.4,14.9,14.1,14.9,13.4,15.9,8.6,15.9,6.9,17.6,6.9,18.9,8.6,20.1,9.9,22.6,9.9,29.4,11.6,31.1,15.6,33.1,21.4,33.1,29.4,29.1,31.6,27.1,32.4,27.1,38.1,21.4,38.1,16.6,36.1,13.4,36.1,10.6,33.1,4.6,28.4,-0.1,24.4,-2.1,20.6,-2.1,16.1,2.4,15.1,2.4,16.1,-0.4,19.6,-3.9,24.4,-3.9,28.9,-1.6,33.6,3.1,33.9,4.4,35.6,6.1,36.9,8.6,36.9,10.4,37.9,11.6,37.9,13.4,39.9,16.6,39.9,21.4,37.9,24.6,31.4,29.9,21.4,34.9],[[10.1,14.1,10.9,15.1,13.6,15.1,14.1,14.6,13.6,13.9]]],[[-14.6,34.9,-21.4,34.9,-31.4,29.9,-34.6,26.9,-36.6,25.9,-39.9,21.4,-39.9,16.6,-38.9,15.4,-38.9,13.6,-36.9,10.4,-36.9,8.6,-35.6,6.1,-33.9,4.4,-33.6,3.1,-28.9,-1.6,-24.4,-3.9,-19.6,-3.9,-16.4,-0.9,-16.1,1.4,-17.1,1.4,-20.6,-2.1,-24.4,-2.1,-28.4,-0.1,-33.1,4.6,-33.4,5.9,-35.1,7.6,-35.1,9.4,-36.1,10.6,-36.1,12.4,-38.1,16.6,-38.1,21.4,-32.4,27.1,-31.6,27.1,-29.4,29.1,-21.4,33.1,-15.6,33.1,-11.6,31.1,-9.9,29.4,-9.9,22.6,-8.6,20.1,-6.9,18.9,-6.9,17.6,-5.9,16.9,-6.6,15.9,-12.4,15.9,-16.6,17.9,-19.4,17.9,-20.4,16.6,-19.9,17.1,-17.9,17.1,-17.4,16.4,-18.4,15.1,-16.1,15.1,-15.4,14.1,-14.1,14.1,-13.4,13.1,-11.6,12.6,-11.1,12.9,-11.9,12.9,-12.6,13.9,-13.9,13.9,-14.1,14.9,-10.6,15.1,-10.1,14.1,-7.6,14.1,-6.4,13.1,-4.6,13.1,-3.4,15.6,-5.9,16.9,-6.1,18.4,-7.1,19.1,-7.1,28.4,-9.4,31.9],[[-15.9,15.6,-14.6,16.1,-14.1,15.1,-15.6,14.9]]],[[-11.9,39.4,-11.9,35.6,-11.4,35.4,-11.1,37.4,-10.1,38.6,-10.1,41.4,-8.4,43.1,-8.1,45.4,-5.4,48.1,-5.1,49.6,-3.6,51.1,3.6,51.1,4.6,49.1,5.9,49.1,7.1,47.9,7.1,45.6,8.4,43.1,11.1,39.9,11.1,35.6,11.9,35.6,11.9,39.4,10.9,40.1,10.9,42.4,8.6,46.9,3.4,51.9,1.4,52.9,-1.4,52.9,-3.4,51.9,-8.6,46.9,-10.9,42.4,-10.9,40.6],[]]],"lip":[[[-5.9,-20.4,-5.4,-20.9,-3.6,-20.9,-2.4,-19.9,-2.4,-19.1,-5.4,-19.1],[]],[[7.6,-15.1,6.4,-15.6,8.1,-16.4,8.1,-17.6,6.4,-18.1,5.9,-19.1,3.6,-19.1,3.1,-19.6,3.6,-20.9,5.4,-20.9,6.4,-18.9,7.6,-18.9,8.9,-17.6,8.9,-16.4],[]],[[-6.6,-15.1,-8.6,-16.1,-8.6,-17.9,-7.1,-17.4,-6.4,-15.9],[]],[[-1.6,-0.4,-0.4,-1.9,0.9,-1.4,0.4,-0.1],[]],[[16.4,10.9,16.4,10.1,17.6,10.1,17.6,10.9],[]],[[-10.1,10.1,-11.9,8.4,-11.9,6.6,-13.9,5.4,-13.9,0.4,-11.6,-1.9,-7.6,-1.9,-6.9,-2.9,-11.6,-3.1,-15.6,0.6,-15.1,-0.9,-16.9,-2.6,-16.9,-14.6,-15.4,-13.9,-13.4,-14.6,-12.4,-12.6,-14.1,-10.6,-14.1,-7.4,-12.6,-5.9,-10.4,-5.9,-9.6,-4.9,-7.4,-4.9,-7.1,-3.1,-5.6,-2.9,-4.9,-3.4,-5.1,-4.9,-6.9,-5.1,-7.4,-6.1,-9.6,-6.1,-10.4,-7.1,-12.9,-7.4,-12.9,-10.6,-9.4,-13.9,-8.6,-13.9,-8.1,-12.6,-7.1,-12.1,-5.1,-14.1,-3.6,-17.6,-1.4,-15.9,-0.4,-13.9,0.4,-13.9,1.4,-15.9,3.6,-17.6,5.1,-14.1,7.1,-12.1,8.1,-12.6,8.6,-13.9,9.4,-13.9,12.9,-10.6,12.6,-7.1,10.4,-7.1,9.6,-6.1,7.4,-6.1,6.9,-5.1,4.9,-4.6,5.1,-3.1,6.9,-2.9,7.4,-4.9,9.6,-4.9,10.4,-5.9,12.6,-5.9,14.1,-7.4,14.1,-10.6,12.1,-12.4,12.4,-13.9,15.1,-15.6,16.4,-15.1,17.9,-15.6,17.9,-4.6,17.1,-3.9,17.6,-2.4,16.1,-1.9,13.9,0.1,13.9,4.4,12.1,6.1,11.9,8.4,10.1,10.1,9.4,11.9,7.6,11.9,7.1,11.4,7.1,8.4,8.1,7.6,8.1,6.6,7.1,5.9,6.9,7.6,4.9,9.6,4.9,11.4,3.9,12.6,3.6,14.6,3.1,14.4,3.1,10.6,2.4,9.9,1.4,10.6,2.1,9.6,0.4,7.9,-0.9,8.1,-2.1,9.9,-1.4,10.6,-2.1,9.9,-3.1,10.6,-3.1,14.4,-3.9,14.6,-3.9,12.6,-4.9,11.4,-4.9,9.6,-6.9,7.6,-6.9,6.4,-5.9,5.6,-5.9,3.6,-5.1,3.4,-3.1,5.6,-3.1,6.4,-2.1,6.9,-1.9,4.6,-0.6,2.1,0.6,1.4,1.9,3.6,1.9,7.4,2.9,7.9,3.1,5.6,4.1,4.4,5.4,4.1,6.6,6.1,8.1,4.4,7.1,1.1,5.4,0.4,6.6,0.1,7.1,1.1,8.4,1.9,8.9,1.6,6.4,-1.1,3.6,-1.1,0.4,-4.1,-0.9,-3.9,-3.6,-1.1,-6.4,-1.1,-8.9,1.4,-8.4,1.9,-6.6,0.1,-5.4,0.4,-7.1,1.1,-7.1,2.4,-7.9,3.1,-7.1,5.6,-8.1,6.4,-8.1,7.6,-7.1,8.4,-7.1,11.4,-7.6,11.9,-9.4,11.9],[[2.6,-6.9,2.1,-11.6,1.1,-11.9,0.9,-7.6,1.6,-6.9],[-2.6,-6.9,-1.6,-6.9,-0.9,-7.6,-1.1,-11.9,-2.1,-11.6],[14.1,-0.1,11.6,-3.1,6.9,-2.9,7.6,-1.9,11.6,-1.9,13.6,0.1]]],[[12.4,14.9,12.6,14.1,14.1,13.9,13.4,12.9,12.4,12.6,12.6,12.1,15.4,12.1,17.9,13.6,17.4,14.9,16.1,14.9,15.4,15.9,14.4,15.9,13.9,14.9],[[13.9,14.1,14.1,15.1,16.1,14.9,15.4,13.9]]],[[-16.9,14.6,-16.9,13.6,-15.9,12.4,-12.4,12.4,-14.1,13.6,-13.9,14.1,-12.6,14.1,-12.4,14.9,-13.9,14.9,-14.4,15.9,-15.6,15.9],[[-15.9,14.9,-14.1,15.1,-13.9,14.1,-15.4,13.9]]],[[-2.6,16.9,-2.4,16.1,2.6,16.4,2.4,16.9],[]]],"gold":[[[9.2,-44.9,8.4,-45.1,6.9,-46.8,7.1,-47.6,8.2,-48.9,8.8,-48.9,8.9,-48.4,8.1,-47.8,7.9,-46.4,8.6,-45.9,9.8,-45.9,9.9,-45.4],[]],[[6.4,-42.1,4.1,-44.4,4.1,-45.4,2.9,-46.9,3.1,-47.8,3.6,-47.9,4.9,-46.6,4.9,-44.6,6.2,-43.1,10.4,-42.9,12.1,-44.6,11.9,-46.8,10.1,-48.4,10.2,-48.9,10.8,-48.9,13.1,-46.2,12.9,-44.4,10.2,-41.9],[]],[[-11.9,-44.4,-12.1,-46.2,-10.9,-47.8,-9.2,-49.1,-7.8,-49.1,-6.1,-47.6,-6.1,-46.4,-7.4,-45.1,-8.8,-45.1,-8.8,-45.9,-7.6,-45.9,-6.9,-46.4,-6.9,-47.6,-7.4,-48.1,-9.4,-48.1,-11.1,-46.4,-11.1,-44.6,-9.4,-42.9,-6.2,-43.1,-4.9,-44.6,-4.9,-47.4,-3.9,-48.6,-3.9,-50.8,-3.1,-50.8,-3.1,-45.4,-6.4,-42.1,-9.2,-41.9],[]],[[2.2,-6.9,1.1,-7.4,0.9,-11.2,1.4,-11.9,2.1,-11.2,1.9,-8.6,2.9,-7.6],[]],[[-2.2,-6.9,-2.9,-7.6,-1.9,-8.6,-2.1,-11.2,-1.4,-11.9,-0.9,-11.2,-1.1,-7.4],[]],[[8.9,1.8,8.4,1.9,7.1,0.9,6.8,-0.1,4.8,0.1,4.2,-0.8,4.8,-1.1,6.6,-0.9,8.9,1.2],[]],[[-8.9,1.8,-8.9,1.2,-6.6,-0.9,-4.8,-1.1,-4.2,-0.8,-4.8,0.1,-6.8,-0.1,-7.1,0.9,-8.4,1.9],[]],[[-3.6,3.9,-3.9,3.6,-3.9,1.6,-2.9,0.6,-2.9,-0.6,-0.6,-2.9,0.6,-2.9,2.8,-0.8,2.9,0.6,3.9,1.6,3.9,3.6,2.4,3.9,1.1,2.6,1.1,1.4,0.2,1.1,-2.4,3.9],[[-1.9,-0.2,-1.2,0.2,0.4,0.1,1.1,-0.4,1.1,-1.6,-0.4,-2.1,-1.9,-0.8]]],[[-7.8,3.9,-7.9,3.2,-7.1,2.8,-6.9,1.4,-5.4,1.1,-5.2,1.8,-7.2,3.9],[]],[[7.9,4.8,7.1,4.8,7.1,3.6,5.2,1.8,5.4,1.1,6.9,1.4,6.9,2.6,8.1,3.8],[]]],"stem":[[[2.4,-48.4,2.1,-51.4,2.9,-51.6,3.6,-49.1],[]],[[28.6,-29.1,26.9,-27.4,22.4,-25.1,15.6,-25.1,9.1,-28.4,5.4,-32.1,5.1,-34.4,3.1,-36.6,3.1,-43.4,3.9,-43.6,3.9,-42.6,7.1,-36.1,11.1,-32.1,15.6,-29.9,17.4,-29.9,18.6,-28.9,23.4,-28.9,25.9,-30.1,28.1,-33.6,28.1,-37.4,25.4,-40.1,21.6,-40.1,20.1,-38.9,19.9,-36.6,21.4,-35.1,22.9,-35.6,22.9,-34.4,20.6,-34.1,18.1,-36.6,18.4,-39.9,21.6,-42.9,24.4,-42.9,26.9,-41.6,28.6,-39.9,29.9,-37.4,29.9,-31.6],[]],[[-23.9,-27.4,-25.6,-29.1,-26.9,-31.6,-26.9,-36.4,-25.6,-38.9,-23.4,-40.9,-16.6,-40.9,-13.1,-37.4,-13.4,-34.1,-16.6,-31.1,-18.9,-31.4,-20.9,-33.6,-20.9,-35.4,-19.6,-36.9,-18.1,-36.6,-18.1,-35.4,-19.1,-34.6,-19.1,-33.6,-18.4,-32.9,-16.6,-32.9,-14.9,-34.6,-14.9,-37.4,-17.6,-40.1,-21.4,-40.1,-24.9,-36.9,-25.1,-31.6,-21.9,-28.1,-19.4,-26.9,-13.6,-26.9,-11.1,-28.1,-7.1,-32.1,-4.9,-36.6,-4.9,-38.4,-3.9,-39.6,-3.9,-42.4,-2.9,-43.6,-2.9,-44.6,-1.9,-45.1,-1.9,-53.4,-1.4,-53.9,0.4,-53.9,0.9,-53.4,0.9,-46.6,1.9,-45.4,1.6,-20.1,0.4,-19.1,-0.9,-19.4,-0.9,-44.6,-1.6,-45.1,-2.1,-44.9,-2.1,-38.6,-3.1,-37.4,-3.1,-35.6,-5.4,-31.1,-9.1,-27.4,-13.6,-25.1,-19.4,-25.1],[]]],"leaf":[[[-22.6,-40.1,-22.6,-40.9,-18.4,-40.9,-18.4,-40.1],[]],[[-18.6,-31.1,-20.9,-33.4,-20.6,-35.9,-19.6,-36.9,-18.4,-36.9,-18.1,-35.4,-19.4,-35.1,-20.1,-34.4,-20.1,-33.4,-18.6,-31.9,-16.4,-31.9,-13.9,-34.4,-13.9,-37.6,-14.9,-38.4,-14.4,-38.9,-13.1,-37.6,-13.1,-34.4,-16.4,-31.1],[]],[[0.9,-29.4,0.1,-29.4,0.1,-34.4,-0.9,-35.4,-0.9,-48.6,0.9,-47.6],[]],[[6.1,-31.4,9.6,-30.9,12.6,-27.9,13.6,-27.9,14.6,-26.9,16.6,-26.9,17.6,-25.9,22.9,-25.9,22.9,-27.1,17.4,-27.1,16.4,-28.1,14.4,-28.1,13.6,-29.1,12.4,-29.1,9.6,-32.1,8.6,-32.1,7.4,-34.1,6.4,-33.4,7.1,-34.4,7.1,-35.6,7.9,-35.6,11.6,-31.9,12.9,-31.6,14.1,-30.1,16.6,-28.9,23.4,-28.9,25.4,-29.9,29.1,-33.6,29.1,-35.6,29.9,-35.6,29.6,-31.1,26.1,-28.9,25.9,-28.1,26.6,-27.1,25.6,-28.1,23.6,-28.1,22.9,-27.1,24.4,-26.9,24.6,-26.1,23.4,-26.1,22.6,-25.1,15.4,-25.1,14.4,-26.1,9.1,-28.4],[]],[[-26.9,-31.4,-26.9,-36.6,-26.1,-36.6,-26.1,-33.6,-25.1,-32.6,-25.1,-30.6,-23.4,-28.9,-22.1,-28.6,-19.6,-25.9,-13.4,-25.9,-12.6,-26.9,-11.4,-26.9,-9.6,-28.9,-8.4,-28.9,-5.9,-31.4,-5.9,-32.6,-4.9,-33.4,-4.9,-37.6,-3.9,-38.6,-3.9,-39.6,-3.1,-39.6,-3.1,-35.4,-5.1,-32.6,-5.1,-31.4,-9.4,-27.1,-10.6,-27.1,-13.4,-25.1,-19.6,-25.1,-20.4,-26.1,-21.6,-26.1,-22.6,-27.1,-23.9,-27.4],[]]]};
    const fl = (function () {
        const ring = (f) => { const r = []; for (let i = 0; i < f.length; i += 2) r.push(new THREE.Vector2(f[i], f[i + 1])); return r; };
        const ext = (key, depth, bt, bs, z0) => {
            const shapes = FL_TRACE[key].map(e => { const sh = new THREE.Shape(ring(e[0])); e[1].forEach(h => sh.holes.push(new THREE.Path(ring(h)))); return sh; });
            const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 1, curveSegments: 1 });
            g.translate(0, 0, z0 - depth / 2); return g;
        };
        const mat = (c, k, rough, d) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(d === undefined ? 0.4 : d), metalness: 0.0, roughness: rough || 0.9, emissive: c, emissiveIntensity: k });   // each layer glows faintly in its OWN colour (keeps the sprite's palette), real light/shade comes on top
        // ink outline (deepest) -> stem -> purple petal tone levels, each thicker than the last -> raised dark lip -> gold column / curls; leaf highlights on the stem
        return [
            { geo: ext('outline', 4, 1.0, 0.6, 0), mat: mat(0x0a0a10, 0, 0.9, 0.2) },
            { geo: ext('stem', 6, 1.0, 0.3, 0.5), mat: mat(0x4a5f3b, 0.62) },
            { geo: ext('leaf', 9, 1.2, 0.25, 1.5), mat: mat(0x7b9b58, 0.6) },
            { geo: ext('base', 7, 1.2, 0.3, 0.5), mat: mat(0x8a5499, 0.62) },
            { geo: ext('petal', 11, 1.5, 0.3, 1.5), mat: mat(0xc483da, 0.6) },
            { geo: ext('petalhi', 14, 1.7, 0.3, 2.5), mat: mat(0xe8b9f5, 0.56) },
            { geo: ext('lip', 17, 1.6, 0.25, 3.5), mat: mat(0x70358a, 0.6) },
            { geo: ext('gold', 19, 1.0, 0.08, 4.5), mat: mat(0xe3b060, 0.62) }
        ];
    })();
    const flInst = fl.map(L => { const im = new THREE.InstancedMesh(L.geo, L.mat, FL_MAX); im.frustumCulled = false; im.count = 0; scene.add(im); return im; });
    let nFl = 0;
    const flM = new THREE.Matrix4(), flE = new THREE.Euler(), flQ = new THREE.Quaternion(), flP = new THREE.Vector3(), flS = new THREE.Vector3(), flO = new THREE.Matrix4();
    // x,y = where the sprite's anchor point lands in the world (already including the game's float bob), scale = world px per sprite px (the game's own fit scale),
    // ox,oy = the sprite pixel that is anchored at x,y (the visible-bbox centre, or the image centre when the game could not measure it), phase = the game's per-item index.
    G.flower = function (x, y, scale, ox, oy, phase) {
        if (!G.active || nFl >= FL_MAX || !(scale > 0)) return;
        const sx0 = toX(x), sy0 = toY(y);
        if (sx0 < -70 || sx0 > W + 70 || sy0 < -70 || sy0 > H + 70) return;   // off-screen collectables are not drawn (the game still updates / collects them as before)
        const i = nFl++, ph = (phase || 0) + timeMs * 0.0016;
        flE.set(DS_TILT_X, 0.3 * Math.sin(ph), 0.02 * Math.sin(ph * 0.7 + 1), 'YXZ'); flQ.setFromEuler(flE);   // same gentle sway + tilt as the Dragon Skull so the two collectables move alike
        const s = scale * T.a;
        flM.compose(flP.set(sx0, sy0, FL_Z), flQ, flS.set(s, s, s));
        flM.multiply(flO.makeTranslation(64 - ox, oy - 64, 0));
        for (const im of flInst) im.setMatrixAt(i, flM);
    };


    // ------------------------------------------------------------------ the Girl
    // The playable Girl (Nova) as a 2.5D character built from code - no sprite textures. Same character as the game's art: glass helmet with ear pods, short navy hair with
    // bangs, big cyan eyes, white / silver suit with blue ring joints, chest plate with four blue panels, belly hoses, orange shoulder patches, backpack, gloved hands
    // (palm, four jointed fingers, thumb) and boots. 2.5D means a layered, front-facing figure with SHALLOW depth (the whole rig is flattened to ~40% depth, like the other 2.5D
    // assets) - never a turning 3D figure: the game keeps rotating her in the screen plane (aim / dash direction / Black-Hole spin) exactly as it rotated the sprite, plus a
    // mild fixed depth tilt like the Drill / Axe.
    // Animation is a smooth, continuous in-plane cycle (legs alternate lifting and scissoring, arms swing out and in, a gentle zero-g bob) instead of swinging in depth. Its SPEED
    // comes from the game's own animation clock - the game hands in cycles-per-second derived from her existing idle / moving / thrusting frame thresholds - but the phase is
    // integrated here per rendered frame, so it can never jump when the game's 9-frame clock wraps or when she switches between idle, moving and thrusting.
    // Visual only: the game still owns position, movement, hitbox, health, mining, attacks, dash, thrust particles and every other mechanic.
    // Performance: ~15 meshes (rigid parts merged with vertex colours: torso, head, 2 arms x 2, 2 legs x 2, + face, glass); the dash afterimages are pooled clones built at load.
    const GIRL_Z = 340;                                 // in front of the Drill (260), Rockets (270), Axe (300) - the 2D sprite was above all of them
    const GIRL_TILT_X = 0.2, GIRL_TILT_Y = -0.16;       // mild fixed tilt; she stays front-facing
    const GIRL_FLAT = 0.4;                              // depth of the whole rig relative to its width/height: shallow, layered, 2.5D
    const GIRL_H = 10.31, GIRL_CY = 5.115;              // model height and vertical centre (boots' soles .. helmet top), model units
    const GC = { white: 0xe6eef7, silver: 0xb9c7da, shade: 0x7388ad, blue: 0x3b92d4, cyan: 0x57d3f2, navy: 0x1d2252, navy2: 0x343a86, orange: 0xd9633a, dark: 0x232842 };
    const girlSolidMat = (function () {
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.36 });
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor;'); };
        return m;
    })();
    function girlFaceTexture() {                        // painted face: big cyan eyes, brows, blush, small nose and mouth (drawn at load into a canvas - no image file)
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const x = cv.getContext('2d');
        x.fillStyle = '#f1b296'; x.fillRect(0, 0, 1024, 512); const cx = 256, cy = 285;
        const gr = x.createRadialGradient(cx, cy - 20, 10, cx, cy, 170); gr.addColorStop(0, '#f8c4a8'); gr.addColorStop(1, '#e9a58a'); x.fillStyle = gr; x.fillRect(0, 0, 1024, 512);
        x.strokeStyle = '#241f48'; x.lineWidth = 7; x.lineCap = 'round';
        x.beginPath(); x.moveTo(cx - 95, cy - 70); x.quadraticCurveTo(cx - 65, cy - 86, cx - 30, cy - 72); x.stroke();
        x.beginPath(); x.moveTo(cx + 30, cy - 72); x.quadraticCurveTo(cx + 65, cy - 86, cx + 95, cy - 70); x.stroke();
        for (const sg of [-1, 1]) {
            const ex = cx + sg * 62, ey = cy - 8;
            x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, 36, 42, 0, 0, 7); x.fill();
            const ig = x.createRadialGradient(ex, ey + 4, 4, ex, ey + 4, 34); ig.addColorStop(0, '#bff3ff'); ig.addColorStop(0.5, '#4fb8e6'); ig.addColorStop(1, '#2a7fb8');
            x.fillStyle = ig; x.beginPath(); x.ellipse(ex, ey + 5, 29, 35, 0, 0, 7); x.fill();
            x.fillStyle = '#17294a'; x.beginPath(); x.ellipse(ex, ey + 6, 13, 17, 0, 0, 7); x.fill();
            x.fillStyle = '#fff'; x.beginPath(); x.arc(ex - 9, ey - 8, 8, 0, 7); x.fill(); x.beginPath(); x.arc(ex + 10, ey + 16, 4, 0, 7); x.fill();
            x.strokeStyle = '#241f48'; x.lineWidth = 6; x.beginPath(); x.ellipse(ex, ey, 37, 43, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
        }
        x.fillStyle = 'rgba(235,110,110,.35)'; x.beginPath(); x.ellipse(cx - 100, cy + 52, 24, 13, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(cx + 100, cy + 52, 24, 13, 0, 0, 7); x.fill();
        x.fillStyle = '#d58a74'; x.beginPath(); x.ellipse(cx, cy + 42, 7, 5, 0, 0, 7); x.fill();
        x.strokeStyle = '#b8605a'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx - 22, cy + 82); x.quadraticCurveTo(cx, cy + 90, cx + 22, cy + 82); x.stroke();
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    }
    const girlFaceMat = new THREE.MeshStandardMaterial({ map: girlFaceTexture(), roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.4 });
    girlFaceMat.emissiveMap = girlFaceMat.map;
    const girlGlassMat = new THREE.MeshStandardMaterial({ color: 0xaee4ff, transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const girlRig = (function () {
        const hexMat = {}; const hm = (c) => hexMat[c] || (hexMat[c] = new THREE.MeshBasicMaterial({ color: c }));   // colour holders only - baked into vertex colours below
        const P = (g, geo, c, x, y, z, o) => { const m = new THREE.Mesh(geo, hm(c)); m.position.set(x, y, z); if (o) { if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]); if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]); } g.add(m); return m; };
        const piv = (name, parent, x, y, z) => { const g = new THREE.Group(); g.name = name; g.userData.pivot = true; g.position.set(x, y, z); parent.add(g); return g; };
        const root = new THREE.Group(); root.name = 'rig';
        const TY = 4.55, HY = 7.55;
        // ---- torso (pivot at its centre)
        const torso = piv('torso', root, 0, TY, 0);
        P(torso, new THREE.CapsuleGeometry(1.45, 1.35, 5, 14), GC.white, 0, 0, 0, { s: [1.12, 1, 0.82] });
        P(torso, new THREE.CylinderGeometry(1.5, 1.3, 0.45, 18), GC.silver, 0, -1.35, 0, { s: [1.1, 1, 0.8] });
        P(torso, new THREE.BoxGeometry(1.6, 1.2, 0.14), GC.shade, 0, 0.35, 1.02);
        P(torso, new THREE.BoxGeometry(1.45, 1.05, 0.2), 0x8aa0c2, 0, 0.35, 1.12);
        for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { P(torso, new THREE.BoxGeometry(0.5, 0.3, 0.1), 0x46b4ee, -0.33 + i * 0.66, 0.6 - j * 0.45, 1.24); P(torso, new THREE.BoxGeometry(0.17, 0.06, 0.05), 0xbff0ff, -0.43 + i * 0.66, 0.7 - j * 0.45, 1.3); }
        for (const sg of [-1, 1]) P(torso, new THREE.TorusGeometry(0.5, 0.1, 5, 14), GC.silver, sg * 0.8, -0.75, 1.0, { r: [0, 0.4 * sg, 0] });   // belly hoses
        P(torso, new THREE.CapsuleGeometry(0.16, 0.9, 3, 8), GC.blue, 0, -0.35, 1.18, { r: [0, 0, Math.PI / 2] });
        P(torso, new THREE.TorusGeometry(2.05, 0.2, 6, 28), GC.cyan, 0, HY - 1.85 - TY, 0, { r: [Math.PI / 2, 0, 0] });    // helmet neck ring
        P(torso, new THREE.TorusGeometry(2.0, 0.14, 6, 28), GC.silver, 0, HY - 2.1 - TY, 0, { r: [Math.PI / 2, 0, 0] });
        P(torso, new THREE.BoxGeometry(2.3, 2.5, 0.95), GC.silver, 0, 0.2, -1.25);                                         // backpack
        P(torso, new THREE.BoxGeometry(2.0, 2.2, 0.2), GC.shade, 0, 0.2, -1.78);
        for (const [x, y, w, h] of [[-0.6, 0.75, 0.2, 1.2], [0.6, 0.75, 0.2, 1.2], [0, -0.55, 1.5, 0.16]]) P(torso, new THREE.BoxGeometry(w, h, 0.1), GC.cyan, x, y, -1.86);
        P(torso, new THREE.CylinderGeometry(0.28, 0.34, 0.5, 8), GC.blue, -0.7, -1.3, -1.4); P(torso, new THREE.CylinderGeometry(0.28, 0.34, 0.5, 8), GC.blue, 0.7, -1.3, -1.4);
        // ---- head (pivot at the head centre): painted face sphere, hair, ear pods, glass helmet
        const head = piv('head', root, 0, HY, 0);
        const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(1.95, 24, 16), girlFaceMat); faceMesh.scale.set(1, 1.04, 1); faceMesh.name = 'face'; faceMesh.userData.keep = true; head.add(faceMesh);
        const FRONT = Math.PI / 2, OPEN = 1.0;
        P(head, new THREE.SphereGeometry(2.14, 24, 14, FRONT + OPEN, Math.PI * 2 - 2 * OPEN, 0, Math.PI * 0.66), GC.navy, 0, 0.04, -0.1, { s: [1, 1.05, 1.02] });
        P(head, new THREE.SphereGeometry(2.13, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.27), GC.navy, 0, 0.06, -0.04, { s: [1, 1.05, 1.02] });
        for (const sg of [-1, 1]) {
            P(head, new THREE.CapsuleGeometry(0.5, 1.35, 3, 8), GC.navy, sg * 1.95, -0.95, -0.05, { r: [0, 0, sg * 0.08] });
            P(head, new THREE.CapsuleGeometry(0.2, 1.0, 3, 6), GC.navy2, sg * 1.55, -0.55, 0.95, { r: [0, 0, sg * 0.12] });
            P(head, new THREE.CylinderGeometry(0.5, 0.5, 0.45, 12), GC.silver, sg * 2.62, -0.2, 0, { r: [0, 0, Math.PI / 2] });
            P(head, new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), GC.cyan, sg * 2.78, -0.2, 0, { r: [0, 0, Math.PI / 2] });
        }
        for (let i = -3; i <= 3; i++) { const len = 0.55 + Math.abs(Math.sin(i * 2.1)) * 0.25; P(head, new THREE.CapsuleGeometry(0.27, len, 3, 8), i % 2 ? GC.navy2 : GC.navy, i * 0.5, 1.18 - Math.abs(i) * 0.1, 1.55 - Math.abs(i) * 0.17, { r: [0.35, 0, -i * 0.1] }); }
        const glass = new THREE.Mesh(new THREE.SphereGeometry(2.62, 24, 16), girlGlassMat); glass.scale.set(1, 1.03, 1); glass.position.y = 0.02; glass.name = 'glass'; glass.userData.keep = true; glass.renderOrder = 2; head.add(glass);
        // ---- arms: shoulder -> elbow; the gloved hand (palm, 4 jointed fingers, thumb) is part of the forearm
        function arm(sg) {
            const sh = piv(sg < 0 ? 'shL' : 'shR', root, sg * 1.95, TY + 0.95, 0); sh.rotation.z = sg * 0.3; sh.rotation.x = -0.12;
            P(sh, new THREE.SphereGeometry(0.78, 14, 10), GC.white, 0, 0, 0);
            P(sh, new THREE.BoxGeometry(0.46, 0.36, 0.14), GC.orange, 0, 0.3, 0.7, { r: [0.25, 0, 0] });
            P(sh, new THREE.CapsuleGeometry(0.5, 1.0, 3, 10), GC.white, 0, -1.05, 0);
            for (const y of [-0.7, -1.25]) P(sh, new THREE.TorusGeometry(0.53, 0.09, 5, 14), GC.blue, 0, y, 0, { r: [Math.PI / 2, 0, 0] });
            const fo = piv(sg < 0 ? 'elL' : 'elR', sh, 0, -1.95, 0); fo.rotation.z = -sg * 0.06; fo.rotation.x = -0.45;
            P(fo, new THREE.SphereGeometry(0.52, 12, 8), GC.silver, 0, 0, 0);
            P(fo, new THREE.CapsuleGeometry(0.45, 0.85, 3, 10), GC.white, 0, -0.75, 0);
            P(fo, new THREE.TorusGeometry(0.47, 0.09, 5, 14), GC.blue, 0, -0.4, 0, { r: [Math.PI / 2, 0, 0] });
            P(fo, new THREE.CylinderGeometry(0.52, 0.56, 0.3, 12), GC.silver, 0, -1.4, 0);
            P(fo, new THREE.TorusGeometry(0.54, 0.07, 5, 14), GC.cyan, 0, -1.26, 0, { r: [Math.PI / 2, 0, 0] });
            const hand = new THREE.Group(); hand.position.set(0, -1.78, 0.02); hand.rotation.x = 0.2; fo.add(hand);
            P(hand, new THREE.SphereGeometry(0.5, 12, 8), GC.white, 0, 0, 0, { s: [1.02, 0.92, 0.62] });
            P(hand, new THREE.BoxGeometry(0.62, 0.42, 0.1), GC.shade, 0, -0.04, -0.28);
            P(hand, new THREE.BoxGeometry(0.5, 0.1, 0.12), GC.blue, 0, -0.02, -0.33);
            const lens = [0.42, 0.5, 0.46, 0.36], xs = [-0.3, -0.1, 0.1, 0.3], spread = [0.16, 0.05, -0.05, -0.16];
            xs.forEach((fx, i) => {
                const L = lens[i] / 2, f = new THREE.Group(); f.position.set(fx, -0.42, 0); f.rotation.z = -spread[i] * sg; f.rotation.x = 0.18; hand.add(f);
                P(f, new THREE.CapsuleGeometry(0.115, L * 1.1, 2, 6), GC.white, 0, -L * 0.5, 0);
                const f2 = new THREE.Group(); f2.position.set(0, -L * 1.15, 0); f2.rotation.x = 0.38; f.add(f2);
                P(f2, new THREE.CapsuleGeometry(0.105, L, 2, 6), GC.white, 0, -L * 0.5, 0);
                const f3 = new THREE.Group(); f3.position.set(0, -L * 1.05, 0); f3.rotation.x = 0.45; f2.add(f3);
                P(f3, new THREE.CapsuleGeometry(0.095, L * 0.7, 2, 6), GC.silver, 0, -L * 0.38, 0);
            });
            const th = new THREE.Group(); th.position.set(-sg * 0.42, -0.12, 0.1); th.rotation.z = sg * 0.9; th.rotation.x = -0.25; hand.add(th);
            P(th, new THREE.CapsuleGeometry(0.14, 0.28, 2, 6), GC.white, 0, -0.22, 0);
            const th2 = new THREE.Group(); th2.position.set(0, -0.46, 0); th2.rotation.x = 0.35; th.add(th2);
            P(th2, new THREE.CapsuleGeometry(0.12, 0.22, 2, 6), GC.silver, 0, -0.14, 0);
        }
        arm(-1); arm(1);
        // ---- legs: hip -> knee; boot is part of the shin
        for (const sg of [-1, 1]) {
            const hip = piv(sg < 0 ? 'hipL' : 'hipR', root, sg * 0.72, 3.15, 0);
            P(hip, new THREE.CapsuleGeometry(0.62, 1.1, 3, 10), GC.white, 0, -0.6, 0);
            for (const y of [-0.35, -0.9]) P(hip, new THREE.TorusGeometry(0.64, 0.09, 5, 14), GC.blue, 0, y, 0, { r: [Math.PI / 2, 0, 0] });
            const knee = piv(sg < 0 ? 'knL' : 'knR', hip, 0, -1.45, 0.04);
            P(knee, new THREE.SphereGeometry(0.66, 12, 8), GC.silver, 0, 0, 0);
            P(knee, new THREE.CapsuleGeometry(0.56, 0.85, 3, 10), GC.white, 0, -0.75, -0.02);
            P(knee, new THREE.BoxGeometry(1.05, 0.5, 1.7), GC.silver, 0, -1.42, 0.24);
            P(knee, new THREE.BoxGeometry(1.1, 0.2, 1.75), GC.blue, 0, -1.64, 0.24);
            P(knee, new THREE.SphereGeometry(0.55, 10, 7), GC.white, 0, -1.28, 0.86, { s: [1, 0.7, 0.8] });
        }
        // ---- bake every rigid part (all its descendant meshes down to the next pivot) into ONE vertex-coloured mesh, at the rest pose
        root.updateMatrixWorld(true);
        const pivots = []; root.traverse(o => { if (o.userData.pivot) pivots.push(o); });
        for (const pv of pivots) {
            const inv = pv.matrixWorld.clone().invert(), list = [];
            // meshes can sit inside plain (non-pivot) sub-groups (fingers / hand): collect those too
            const collect = (o) => { for (const c of o.children) { if (c.userData.pivot || c.userData.keep) continue; if (c.isMesh) list.push(c); else collect(c); } };
            collect(pv);
            let n = 0; const parts = list.map(m => { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(inv.clone().multiply(m.matrixWorld)); n += g.attributes.position.count; return [g, m.material.color]; });
            const Pp = new Float32Array(n * 3), Nn = new Float32Array(n * 3), Cc = new Float32Array(n * 3); let o = 0;
            parts.forEach(([g, col]) => { const c = g.attributes.position.count; Pp.set(g.attributes.position.array, o * 3); Nn.set(g.attributes.normal.array, o * 3); for (let i = 0; i < c; i++) { Cc[(o + i) * 3] = col.r; Cc[(o + i) * 3 + 1] = col.g; Cc[(o + i) * 3 + 2] = col.b; } o += c; g.dispose(); });
            const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); bg.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
            for (const m of list) m.parent.remove(m);
            const baked = new THREE.Mesh(bg, girlSolidMat); baked.name = 'baked'; baked.frustumCulled = false; pv.add(baked);
        }
        root.traverse(o => { if (o.userData.pivot) { o.userData.rest = o.rotation.clone(); o.userData.restY = o.position.y; } if (o.isMesh) o.frustumCulled = false; });
        return root;
    })();
    const girlOuter = new THREE.Group(); girlOuter.matrixAutoUpdate = false; girlOuter.visible = false; girlRig.position.y = -GIRL_CY; girlRig.scale.set(1, 1, GIRL_FLAT); girlOuter.add(girlRig); scene.add(girlOuter);
    const GHOST_MAX = 6, girlGhostPool = [];
    function girlGhostRig(i) {
        if (girlGhostPool[i]) return girlGhostPool[i];
        const outer = new THREE.Group(); outer.matrixAutoUpdate = false; outer.visible = false; const rig = girlRig.clone(true); outer.add(rig);
        const mats = []; rig.traverse(o => { if (o.isMesh && (o.name === 'face' || o.name === 'glass')) o.visible = false; else if (o.isMesh) { const base = o.material === girlGlassMat ? 0.17 : 1; const m = o.material.clone(); m.transparent = true; m.depthWrite = false; o.material = m; mats.push([m, base]); } });
        scene.add(outer); return (girlGhostPool[i] = { outer, rig, mats, used: false });
    }
    for (let i = 0; i < GHOST_MAX; i++) girlGhostRig(i);   // built at load, not on the first dash: creating Three.js objects draws random numbers (for their ids) and must not happen mid-game
    const gM = new THREE.Matrix4(), gTilt = new THREE.Matrix4(), gSc = new THREE.Matrix4(), gRz = new THREE.Matrix4(), gT = new THREE.Matrix4(), gE = new THREE.Euler(), gV = new THREE.Vector3();
    function girlMatrix(out, x, y, z, angle, unit) {
        gE.set(GIRL_TILT_X, GIRL_TILT_Y, 0, 'YXZ'); gTilt.makeRotationFromEuler(gE);
        gSc.makeScale(1 / Math.cos(GIRL_TILT_Y), 1 / Math.cos(GIRL_TILT_X), 1);              // undo the tilt's foreshortening so her on-screen size is unchanged
        gRz.makeRotationZ(-angle).scale(gV.set(unit, unit, unit));                           // game y is down: clockwise sprite rotation = -z in the y-up scene
        gT.makeTranslation(toX(x), toY(y), z);
        out.copy(gT).multiply(gSc).multiply(gTilt).multiply(gRz); return out;
    }
    // pose the rig from a continuous cycle angle (radians) and activity (0 idle, 1 moving, 2 thrusting); everything moves IN THE SCREEN PLANE (2.5D), all smooth sin/cos of the angle
    function girlPose(rig, ang, A, t) {                                                       // A = swing amplitude, eased by the caller (0.32 idle .. 1.0 moving .. 1.2 thrusting)
        const g = (n) => rig.getObjectByName(n), m = Math.min(Math.max((A - 0.32) / 0.68, 0), 1);   // m: 0 = idle bob only .. 1 = full cycle bob
        const lift = (ph) => 0.5 + 0.5 * Math.sin(ph);                                       // 0..1 smooth: how raised a leg is
        const set = (n, rx, rz, dy) => { const o = g(n), r = o.userData.rest; o.rotation.set(r.x + (rx || 0), r.y, r.z + (rz || 0)); if (dy !== undefined) o.position.y = o.userData.restY + dy; };
        for (const sg of [-1, 1]) {
            const side = sg > 0 ? 'R' : 'L', ph = ang + (sg > 0 ? 0 : Math.PI), l = lift(ph), c = Math.cos(ph);
            set('hip' + side, 0, sg * (0.05 + 0.13 * l) * A, l * 0.5 * A);                    // leg raises and swings outward as it lifts, drops back as it lowers
            set('kn' + side, 0, -sg * 0.38 * l * A);                                          // knee folds the shin inward while the leg is raised
            set('sh' + side, 0, sg * 0.2 * c * A * -1);                                       // arms swing out and in, opposite the legs
            set('el' + side, 0, -sg * 0.12 * (0.5 - 0.5 * c) * A);
        }
        set('head', 0, Math.sin(ang) * 0.025 * A);
        rig.position.y = -GIRL_CY + Math.sin(t * 2.2) * 0.13 * (1 - m) + Math.sin(ang * 2) * 0.07 * A * m;   // gentle zero-g bob, blended smoothly between idle and moving
    }
    G.girlReady = true;
    G._girlRig = girlRig;                                                                     // exposed for inspection / tests only
    let girlAng = 0, girlHz = 0, girlAmp = 0.32, girlLastT = 0;
    // x,y = her world position (the point the sprite rotated about), angle = existing facing + capture spin (radians, y-down world), scale = the game's girlBaseScale,
    // hz = cycles per second of her step cycle (from the game's own idle / moving / thrusting frame thresholds), act = 0 idle / 1 moving / 2 thrusting.
    G.girl = function (x, y, angle, frame, scale, hz, act) {
        if (!G.active) return;
        const t = timeMs / 1000, dt = Math.min(Math.max(t - girlLastT, 0), 0.1); girlLastT = t;
        girlHz += ((hz || 0) - girlHz) * Math.min(1, dt * 5);                                 // ease the speed between states ...
        girlAmp += (((act | 0) === 0 ? 0.32 : (act | 0) === 1 ? 1.0 : 1.2) - girlAmp) * Math.min(1, dt * 5);   // ... and the swing size ...
        girlAng += Math.PI * 2 * girlHz * dt;                                                 // ... and integrate: the phase is continuous, so it can never jump
        girlPose(girlRig, girlAng, girlAmp, t);
        girlMatrix(girlOuter.matrix, x, y, GIRL_Z, angle, scale * 90 / GIRL_H * T.a); girlOuter.matrixWorldNeedsUpdate = true; girlOuter.visible = true;
    };
    // translucent dash afterimage: a pooled clone of the rig, posed at the cycle angle captured with the ghost; alpha = the game's own fade value, scale includes the game's shrink
    let ghostN = 0;
    G.girlGhost = function (x, y, angle, frame, scale, alpha, cycleAngle) {
        if (!G.active || ghostN >= GHOST_MAX) return;
        const gh = girlGhostRig(ghostN++); girlPose(gh.rig, cycleAngle || 0, 1.0, timeMs / 1000);
        for (const [m, base] of gh.mats) m.opacity = alpha * base;
        girlMatrix(gh.outer.matrix, x, y, GIRL_Z - 3, angle, scale * 90 / GIRL_H * T.a); gh.outer.matrixWorldNeedsUpdate = true; gh.outer.visible = true; gh.used = true;
    };
    function girlHideAll() { girlOuter.visible = false; ghostN = 0; for (const gh of girlGhostPool) if (gh) gh.outer.visible = false; }
    // ----------------------------------------------------------- frame API
    G.begin = function (cfg) {
        if (!G.active) return;
        epoch++; frameNo++;
        T.a = cfg.a; T.bx = cfg.bx; T.by = cfg.by;
        camX = cfg.camX || 0; camY = cfg.camY || 0; mode = cfg.mode || 'normal';
        timeMs = cfg.time || performance.now();
        dt = lastMs ? Math.min(0.05, Math.max(0.001, (timeMs - lastMs) / 1000)) : 0.016; lastMs = timeMs;
        try { clearCol.set(cfg.clear); } catch (e) { clearCol.set(0x050508); }
        renderer.setClearColor(clearCol, 1);
        nGem = nCoin = nBgRock = 0; MIN_KINDS.forEach(k => { nMin[k] = 0; });
        drillUsed = 0; axeUsed = 0; nFire = 0; nRk = 0; nBh = 0; nDs = 0; nFl = 0;
        girlHideAll();
    };

    G.end = function () {
        if (!G.active) return;
        // destroyed objects -> fragments; everything unseen this frame is recycled
        astActive.forEach((h, src) => {
            if (h.seen !== epoch) {
                let dead = false;
                try { dead = h.dead ? h.dead(src) : false; } catch (e) { }
                if (dead) spawnDestruction(h);
                h.outer.visible = false; h.src = null; h.dead = null;
                astActive.delete(src); astFree.push(h);
            }
        });
        if (jetSeen !== epoch) { jetGroup.visible = false; jetPrevY = null; }
        for (let i = drillUsed; i < drillPool.length; i++) drillPool[i].visible = false;
        for (let i = axeUsed; i < axePool.length; i++) axePool[i].visible = false;
        fireUniforms.uFlameT.value = (timeMs / 1000) % 600;
        for (const im of rkInst) { im.count = nRk; im.instanceMatrix.needsUpdate = true; }
        for (const im of dsInst) { im.count = nDs; im.instanceMatrix.needsUpdate = true; }
        for (const im of flInst) { im.count = nFl; im.instanceMatrix.needsUpdate = true; }
        for (const im of bhInst) { im.count = nBh; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
        for (const L of fireLayers) { L.im.count = nFire; L.im.instanceMatrix.needsUpdate = true; L.im.instanceColor.needsUpdate = true; }
        MIN_KINDS.forEach(k => { minMeshes[k].count = nMin[k]; minMeshes[k].instanceMatrix.needsUpdate = true; });
        gems.count = nGem; coinRims.count = nCoin; coinFaces.count = nCoin; bgRocks.count = nBgRock;
        gems.instanceMatrix.needsUpdate = true; if (gems.instanceColor) gems.instanceColor.needsUpdate = true;
        coinRims.instanceMatrix.needsUpdate = true; coinFaces.instanceMatrix.needsUpdate = true;
        bgRocks.instanceMatrix.needsUpdate = true; if (bgRocks.instanceColor) bgRocks.instanceColor.needsUpdate = true;
        updateBackground();
        updateFragments(dt);
        dust.update(dt); exhaust.update(dt);
        renderer.render(scene, camera);
    };

    // Set up a first-size + activate
    G.resize(W, H, 1);
    G.active = true;
    // cheap GPU warm-up so the first gameplay frame does not hitch on shader compile
    try { renderer.compile(scene, camera); } catch (e) { }
    G.stats = () => ({ asteroids: astActive.size, gems: nGem, coins: nCoin, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures });
})();

/* ============================================================================
   MINERAL HUD ICONS (Minerals panel, top-left)
   ----------------------------------------------------------------------------
   Five live 2.5D icons - Iron, Bronze, Gold, Diamond, Uranium - each rendering the
   SAME 3D model (GTD3D.mineralModels) that the matching mineral drop uses in
   gameplay, with the same light rig and tilt, slowly turning. Visual only: no
   values, drops, scoring or gameplay state are read or written.
   If the 3D layer / WebGL is unavailable the game drops the mineral-world-*.png
   sprites, so the icons fall back to those same sprites.
   ============================================================================ */
(function () {
    'use strict';
    const canvases = Array.prototype.slice.call(document.querySelectorAll('canvas.res-icon[data-mineral]'));
    if (!canvases.length) return;
    const SIZE = 72;
    canvases.forEach(c => { c.width = SIZE; c.height = SIZE; });
    const G = window.GTD3D;
    const urls = {};
    if (G) G.hudIconURL = function (kind) { return urls[kind] || null; };

    function spriteFallback() {
        canvases.forEach(c => {
            const kind = c.getAttribute('data-mineral');
            const img = new Image();
            img.onload = () => {
                const x = c.getContext('2d'); x.clearRect(0, 0, SIZE, SIZE);
                x.imageSmoothingEnabled = false;
                x.drawImage(img, 2, 2, SIZE - 4, SIZE - 4);
            };
            img.src = 'mineral-world-' + kind + '.png';
        });
    }

    if (typeof THREE === 'undefined' || !G || !G.active || !G.mineralModels) { spriteFallback(); return; }

    let r;
    try {
        const cv = document.createElement('canvas');
        r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        r.setPixelRatio(1); r.setSize(SIZE, SIZE, false);
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.setClearColor(0x000000, 0);
    } catch (e) { spriteFallback(); return; }

    const scene = new THREE.Scene();
    const HALF = 1.3; // models are normalised to the same size, so every icon fills the same share of its box
    const cam = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.1, 50);
    cam.position.set(0, 0, 10);
    // same rig as the gameplay scene
    scene.add(new THREE.AmbientLight(0x8fa0c8, 0.85), new THREE.HemisphereLight(0xa9bcff, 0x1d1530, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.3); key.position.set(-4, 6, 7);
    const rim = new THREE.DirectionalLight(0x35e6ff, 0.9); rim.position.set(5, -2, -3);
    scene.add(key, rim);

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), []);
    scene.add(mesh);

    function draw(c, i, t) {
        const m = G.mineralModels[c.getAttribute('data-mineral')];
        if (!m) return;
        mesh.geometry = m.geo; mesh.material = m.mats;
        mesh.rotation.set(0.35, 0.55 + Math.sin(t * 0.9 + i) * 0.7, 0); // gentle turn so the shape always reads
        r.render(scene, cam);
        const x = c.getContext('2d');
        x.clearRect(0, 0, SIZE, SIZE);
        x.drawImage(r.domElement, 0, 0, SIZE, SIZE);
    }
    canvases.forEach((c, i) => {
        draw(c, i, 0);
        try { urls[c.getAttribute('data-mineral')] = c.toDataURL('image/png'); } catch (e) { }
    });

    let last = 0;
    function loop(ms) {
        requestAnimationFrame(loop);
        if (document.hidden || ms - last < 33) return;
        if (!canvases[0].getClientRects().length) return; // Minerals panel hidden -> don't render
        last = ms;
        const t = ms / 1000;
        for (let i = 0; i < canvases.length; i++) draw(canvases[i], i, t);
    }
    requestAnimationFrame(loop);
    r.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); spriteFallback(); });
})();
