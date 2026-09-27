/* STARTUP SPLASH SEQUENCE
   ------------------------------------------------------------------------
   Runs automatically on every fresh load of Girl_The_Driller.html, before
   the (already-live, unchanged) Main Menu becomes usable:

       PIXEL GAUNT logo animation   -> loops forever, waits for player input
       GIRL: THE DRILLER logo anim. -> loops forever, waits for player input
       #startup-splash overlay hides -> existing #main-menu is revealed

   Design notes:
   - #startup-splash and #main-menu are both already in the DOM/CSS at page
     load (see Girl_The_Driller.html / css/styles.css). This script only
     ever toggles the splash overlay's visibility, swaps one <img> src, and
     updates the (purely informational) hint line - it never touches
     #main-menu, gameState, save data, or any gameplay system, so "existing
     Main Menu functionality" is 100% unchanged.
   - Each stage's animation frames loop continuously and indefinitely - the
     stage never times out or auto-advances. The ONLY way to leave a stage
     is a left/any-button mouse click or the ENTER key, read fresh for that
     stage only (see waitForContinue below).
   - Input is only ever listened for one stage at a time. The instant a
     stage's input fires, BOTH of that stage's listeners are torn down
     before the next stage's listeners are attached (with a short cooldown
     in between - see ADVANCE_COOLDOWN_MS), so a single click/Enter can
     only ever advance ONE stage, never fall through and skip both.
   - Frame preloading means neither animation has to wait on image loads
     once its stage starts, so there's no stall/black-frame risk there;
     the sequence otherwise only ever waits on the player, by design.
   - Sequencing starts on the 'gtd-startup-reveal' event (fired the instant
     the page's fonts-loading gate lets <body> actually become visible -
     see the inline <head> script), so Stage 1 is never sitting there
     invisible before the player can even see/act on it.
*/
/* ------------------------------------------------------------------------
   STARTUP FLOW STAGE MACHINE (added with the New Game sequencing fix)
   ------------------------------------------------------------------------
   The splash sequence is the FIRST thing that runs on every page load, so it
   is also the natural owner of the one authoritative answer to "where in the
   startup sequence are we right now?". js/game.js and js/game-tutorial.js
   both read this (never write it) to guarantee nothing - story scenes most of
   all - can ever start before the player has actually reached, and acted on,
   the Main Menu.

       BOOT -> SPLASH_PIXEL_GAUNT -> SPLASH_GIRL_THE_DRILLER -> MAIN_MENU

   Nothing past MAIN_MENU lives here: what happens after the player presses a
   Main Menu button is game.js's business (see beginNewGameFlow there). This
   object only ever reports the boot stages and whether the splash overlay is
   still on screen.
   ------------------------------------------------------------------------ */
window.GTDStartupFlow = (function () {
    'use strict';

    var STAGES = {
        BOOT: 'BOOT',
        SPLASH_PIXEL_GAUNT: 'SPLASH_PIXEL_GAUNT',
        SPLASH_GIRL_THE_DRILLER: 'SPLASH_GIRL_THE_DRILLER',
        MAIN_MENU: 'MAIN_MENU'
    };

    var stage = STAGES.BOOT;

    return {
        STAGES: STAGES,
        getStage: function () { return stage; },
        // Internal: only js/startup-splash.js's own sequence calls this.
        _setStage: function (next) { stage = next; },
        // True until the player has clicked/Entered past BOTH logo stages. Everything
        // downstream (story, tutorial, gameplay) is hard-gated on this being false.
        isSplashActive: function () { return stage !== STAGES.MAIN_MENU; },
        // Reads the same #startup-splash element the sequence below manages - display:none
        // is the only thing hideSplash() ever sets on it (its CSS default is display:flex).
        // Used as an independent, DOM-level second opinion so a stage variable that somehow
        // got out of sync can never let something draw on top of a visible splash.
        isSplashVisible: function () {
            var el = document.getElementById('startup-splash');
            if (!el) return false; // markup missing - never block the game on something that isn't there
            return el.style.display !== 'none';
        },
        // True only once the Main Menu is genuinely revealed AND the overlay is gone.
        isReadyForMainMenu: function () {
            return stage === STAGES.MAIN_MENU && !this.isSplashVisible();
        }
    };
})();

(function () {
    'use strict';

    // How long each looping animation holds on-screen per full loop before repeating (ms).
    // Matches the previous single-playthrough pacing of each animation (kept for continuity
    // of "feel"), just looped forever instead of playing once and stopping.
    var PIXEL_GAUNT_LOOP_MS = 3000;
    var GIRL_DRILLER_LOOP_MS = 3000;

    // Tiny gap between tearing down one stage's input listeners and arming the next stage's.
    // Purely a safety margin against a single physical click/keypress being interpretable as
    // two logical "advance" events (e.g. re-dispatch edge cases) - guarantees one input can
    // only ever advance exactly one stage.
    var ADVANCE_COOLDOWN_MS = 250;

    var PIXEL_GAUNT_FRAME_SRCS = [
        'pixelgaunt-frame-0.png',
        'pixelgaunt-frame-1.png',
        'pixelgaunt-frame-2.png',
        'pixelgaunt-frame-3.png',
        'pixelgaunt-frame-4.png',
        'pixelgaunt-frame-5.png',
        'pixelgaunt-frame-6.png',
        'pixelgaunt-frame-7.png',
        'pixelgaunt-frame-8.png'
    ];

    var GIRL_DRILLER_FRAME_SRCS = [
        'girlthedriller-frame-0.png',
        'girlthedriller-frame-1.png',
        'girlthedriller-frame-2.png',
        'girlthedriller-frame-3.png',
        'girlthedriller-frame-4.png',
        'girlthedriller-frame-5.png',
        'girlthedriller-frame-6.png'
    ];

    var splashEl = document.getElementById('startup-splash');
    var frameImgEl = document.getElementById('startup-splash-frame');
    var hintEl = document.getElementById('startup-splash-hint');

    // Defensive: if the markup is ever missing, never block the game behind a dead overlay -
    // and, just as importantly, never strand the stage machine at BOOT, which would leave the
    // Main Menu's New Game button permanently refusing to start (see beginNewGameFlow in
    // js/game.js). With no splash to show, the Main Menu simply IS the first live screen.
    if (!splashEl || !frameImgEl) {
        window.GTDStartupFlow._setStage(window.GTDStartupFlow.STAGES.MAIN_MENU);
        try { document.dispatchEvent(new Event('gtd-main-menu-ready')); } catch (e) {}
        return;
    }

    function preload(srcs) {
        return srcs.map(function (src) {
            var im = new Image();
            im.src = src;
            return im;
        });
    }

    var pixelGauntFrames = preload(PIXEL_GAUNT_FRAME_SRCS);
    var girlDrillerFrames = preload(GIRL_DRILLER_FRAME_SRCS);

    var finished = false;
    function hideSplash() {
        if (finished) return;
        finished = true;
        splashEl.style.display = 'none';
        splashEl.setAttribute('aria-hidden', 'true');
        // STAGE 3: the Main Menu (already in the DOM underneath, untouched) is now the live
        // screen. Publishing this is what unlocks the New Game flow in js/game.js - until it
        // happens, beginNewGameFlow() refuses to run and no story scene can ever begin.
        window.GTDStartupFlow._setStage(window.GTDStartupFlow.STAGES.MAIN_MENU);
        try { document.dispatchEvent(new Event('gtd-main-menu-ready')); } catch (e) {}
    }

    // Starts looping through `frames` forever (evenly spaced across one loopMs cycle,
    // wrapping back to frame 0 - existing frame order/playback preserved, just repeated).
    // Returns a stop() function that halts the loop; callers MUST call it before moving on
    // to the next stage so the two animations never overlap.
    function playLoop(frames, loopMs) {
        if (!frames || !frames.length) return function stop() {};

        var frameCount = frames.length;
        var frameDurMs = loopMs / frameCount;
        var index = 0;
        frameImgEl.src = frames[0].src;

        var timer = setInterval(function () {
            index = (index + 1) % frameCount;
            frameImgEl.src = frames[index].src;
        }, frameDurMs);

        return function stop() {
            clearInterval(timer);
        };
    }

    // Waits for exactly one "advance" input - left-click/any mouse button click, or the
    // ENTER key - then fires onAdvance exactly once. Listeners are removed the instant one
    // fires, so a single input can never be double-counted or leak into the next stage.
    function waitForContinue(onAdvance) {
        var fired = false;

        function advance() {
            if (fired) return;
            fired = true;
            splashEl.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
            onAdvance();
        }

        // mousedown (not click) so ANY mouse button - left, middle, right - advances, per spec.
        function onMouseDown() {
            advance();
        }

        function onKeyDown(e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                advance();
            }
        }

        splashEl.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
    }

    var started = false;
    function runSequence() {
        if (started) return; // guard against double-start (reveal event + fallback timer)
        started = true;

        // STEP 1: PIXEL GAUNT - loops until the player clicks/presses ENTER.
        window.GTDStartupFlow._setStage(window.GTDStartupFlow.STAGES.SPLASH_PIXEL_GAUNT);
        if (hintEl) hintEl.textContent = 'Click / Enter to continue';
        var stopPixelGaunt = playLoop(pixelGauntFrames, PIXEL_GAUNT_LOOP_MS);

        waitForContinue(function () {
            stopPixelGaunt();

            // Short cooldown before Stage 2's listeners go live: guarantees the input that
            // just advanced Stage 1 can never also register as Stage 2's advance input.
            setTimeout(function () {
                // STEP 2: GIRL: THE DRILLER - loops until the player clicks/presses ENTER.
                window.GTDStartupFlow._setStage(window.GTDStartupFlow.STAGES.SPLASH_GIRL_THE_DRILLER);
                if (hintEl) hintEl.textContent = 'Click / Enter to continue';
                var stopGirlDriller = playLoop(girlDrillerFrames, GIRL_DRILLER_LOOP_MS);

                waitForContinue(function () {
                    stopGirlDriller();
                    // STEP 3: reveal the existing Main Menu underneath.
                    hideSplash();
                });
            }, ADVANCE_COOLDOWN_MS);
        });
    }

    if (document.documentElement.classList.contains('fonts-ready')) {
        // Page was already revealed by the time this script ran - start immediately.
        runSequence();
    } else {
        document.addEventListener('gtd-startup-reveal', runSequence, { once: true });
        // Extra safety: the inline <head> reveal() script has its own 1.5s hard timeout, so this
        // event always fires - but guard against it firing before this listener is attached
        // (or any other edge case) with a final fallback that only starts the (still
        // input-driven, non-timed-out) sequence - it never itself skips or hides the splash.
        setTimeout(function () {
            if (!started) runSequence();
        }, 2000);
    }
})();
