/* ============================================================================
   GIRL: THE DRILLER - LIMITED THREE.JS 2.5D VISUAL LAYER  (Three.js r160)
   ----------------------------------------------------------------------------
   Renders ONLY: destroyable objects/asteroids, the Jet, the space background,
   minerals and coins. Everything else (Girl, HUD, menus, weapons, projectiles,
   power-ups, ...) stays on the existing 2D canvas / DOM.

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
    const gems = new THREE.InstancedMesh(gemGeo, gemMat, PICK_CAP);
    gems.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PICK_CAP * 3), 3);
    gems.frustumCulled = false; gems.count = 0; scene.add(gems);
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
        nGem = nCoin = nBgRock = 0;
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
