/* ============================================================
   GIRL: THE DRILLER — NEW GAME TUTORIAL / SPOTLIGHT SYSTEM (JS)
   ------------------------------------------------------------
   PURE ADDITION. This file does not modify, redefine, or remove
   any existing function, variable, or behavior from js/game.js.
   It only:
     1) Reads a few existing state variables (gameState, storyState,
        controllerMode, playerShip, camera, gameScale, canvas) that
        js/game.js declares at its own top level - safe to read
        here because this file must be loaded BEFORE js/game.js in
        the HTML, and every read below only ever happens later, at
        runtime, inside functions that are called well after
        js/game.js has fully finished executing (on a button click,
        a poll tick, or from the one-line hooks added into js/game.js
        itself at its two genuine "New Game" call sites).
     2) Temporarily sets the existing `gameState` variable to
        "PAUSED" while the tutorial is on screen (byte-for-byte the
        same mechanism the game's own Pause Menu already uses to
        freeze gameplay - see pauseGame() in js/game.js), and sets
        it back to "PLAYING" when the tutorial ends. No gameplay
        function is touched.
     3) Adds its own DOM elements (#gtd-tutorial-root and children)
        and its own capture-phase input listeners, all scoped so
        they never fire except while the tutorial is actively shown.

   Exposes two global entry points: `maybeStartNewGameTutorial`, which
   js/game.js calls at its real "New Game" start points, and
   `resetNewGameTutorialState`, which js/game.js calls at the start of
   both New Game and Reset Progress so onboarding replays in full on
   every fresh session instead of only the very first one. Everything
   else in this file is a local implementation detail.

   ------------------------------------------------------------
   SEQUENCING (updated with the startup-sequence fix): the tour no
   longer races the story intro, and no longer polls its way into
   existence from the New Game button. js/game.js owns an explicit
   New Game stage machine (NONE -> STORY -> TUTORIAL -> GAMEPLAY,
   see the NEW_GAME_STAGE block there) and calls
   maybeStartNewGameTutorial() exactly once, from the STORY -> TUTORIAL
   transition - which is only reached when the story sequence has
   completely finished (played out, or skipped with its queue
   emptied). So by the time anything below runs, the splash screens
   are long gone, the Main Menu has been left, and the story overlay
   has closed.

   The arming loop and its guards are kept as defence in depth rather
   than as the mechanism: this file's root is a full-viewport,
   z-index 99999, click-catching element, so it must never be built
   on top of a splash screen, the Main Menu or a story scene under
   any circumstances. Two related invariants are also preserved:
   the "seen" flag is still never written until the tour has actually
   begun, and every path that ends WITHOUT showing the tour still
   reports back to js/game.js (see notifyFlowTutorialFinished below)
   so the flow always reaches its GAMEPLAY stage and later milestone
   story scenes can queue normally.
   ============================================================ */

const GTD_TUTORIAL_SEEN_KEY = 'girlTheDrillerTutorialSeen_v1';

/**
 * Called by js/game.js right after a brand-new game session begins.
 * Arms the onboarding tutorial to start the first time gameplay begins on this
 * browser/device, and again every time the player performs a New Game or Reset
 * Progress (see resetNewGameTutorialState() below, which those two destructive
 * actions call to clear the "seen" flag before this function runs again) -
 * exactly like a modern game's first-run onboarding, replayed for every fresh
 * session. If the game's own story intro is currently playing (or about to
 * play), the tour waits for it to finish first instead of racing it.
 */
function maybeStartNewGameTutorial() {
    // STARTUP-SEQUENCE FIX: every path out of this function that does NOT end up showing the
    // tour must still hand the New Game flow forward to its GAMEPLAY stage. Otherwise the flow
    // would sit at TUTORIAL forever and milestone story scenes (which are gated on reaching
    // GAMEPLAY) could never queue again for the rest of the session.
    function handBackToGameplay() {
        try {
            if (typeof window.gtdNewGameFlowTutorialFinished === 'function') {
                window.gtdNewGameFlowTutorialFinished();
            }
        } catch (e) {}
    }
    try {
        if (localStorage.getItem(GTD_TUTORIAL_SEEN_KEY) === '1') { handBackToGameplay(); return; }
    } catch (e) { /* localStorage unavailable - fail safe by just not showing it */ handBackToGameplay(); return; }
    try { GTDTutorial.armForFirstPlaying(); } catch (e) { handBackToGameplay(); /* never break the game */ }
}

/**
 * Called by js/game.js at the START of both destructive reset actions (New
 * Game and Reset Progress), before the old save is deleted / the page
 * reloads. Clears the persisted "already shown" flag so the very next
 * maybeStartNewGameTutorial() call - whenever the player next actually
 * starts playing, whether that's immediately (New Game with an existing
 * save auto-drops into a fresh PLAYING session) or after they click PLAY NOW
 * again (Reset Progress returns to the main menu first) - treats it as a
 * completely fresh player session and shows every step again from the
 * beginning. Also disarms/tears down any tutorial instance that might still
 * be active in memory, so a reset triggered mid-tutorial can never leave a
 * stale instance behind (defensive only - both real call sites reload the
 * page immediately after this, which already wipes all in-memory JS state).
 */
function resetNewGameTutorialState() {
    try { localStorage.removeItem(GTD_TUTORIAL_SEEN_KEY); } catch (e) { /* never break reset */ }
    try { GTDTutorial.hardReset(); } catch (e) { /* never break reset */ }
}

const GTDTutorial = (function () {

    let active = false;
    let phase = 'intro'; // 'intro' -> 'steps' -> 'done', used only to route Enter/Escape correctly
    let eventActive = false, eventQueue = [], eventSteps = [], eventIndex = -1;
    let eventSavedGameState = null;
    let currentStep = -1;
    let introIndex = 0;
    let root = null, spotlightEl = null, panelEl = null, skipEl = null;
    let welcomeEl = null, doneEl = null;
    let resizeHandler = null;
    let savedGameState = null;
    let armTimer = null, armAttempts = 0;
    // WATCHDOG (hang fix): while the tour is active, keeps checking that a story scene
    // hasn't started underneath it. In normal play this should never fire - gameState stays
    // 'PAUSED' for the whole tour, and storyCheckMilestones() only ever queues a new scene
    // while gameState === 'PLAYING' - but it's cheap, defensive insurance against the
    // tutorial's full-screen click-catching root ever being left on top of (and silently
    // eating every click meant for) an active story overlay. See start()'s storyState guard
    // above for the matching "never even open on top of a story scene" half of this fix.
    let storyWatchdogTimer = null;

    function isMobileLayout() { return window.innerWidth <= 760; }

    // STARTUP-SEQUENCE FIX: New Game no longer deletes the save and reloads the page. That old
    // reload path restarted js/startup-splash.js from the top while game.js's `gtdPendingNewGame`
    // block auto-resumed a session on the same page load - which is how the tour (and the story
    // overlay) could end up on screen while #startup-splash, z-index 200, was still covering
    // everything. Both the reload and that auto-resume block are gone, so this check is now
    // defence in depth rather than the thing holding the tour back. It reads the shared stage
    // machine published by js/startup-splash.js, falling back to the #startup-splash element's
    // own inline display (display:none is the only thing hideSplash() ever sets on it - its CSS
    // default is display:flex). This file never touches that element or the splash sequence
    // itself, only observes whether it is still showing.
    function isStartupSplashVisible() {
        // Prefer the shared stage machine published by js/startup-splash.js (it knows the
        // difference between "still on a logo screen" and "Main Menu is live"), falling back to
        // reading the overlay element directly if that file ever fails to load.
        if (window.GTDStartupFlow) {
            return window.GTDStartupFlow.isSplashActive() || window.GTDStartupFlow.isSplashVisible();
        }
        var el = document.getElementById('startup-splash');
        if (!el) return false; // markup missing/removed - never block the tour on something that doesn't exist
        return el.style.display !== 'none';
    }

    // ------------------------------------------------------------
    // ARMING — wait until real gameplay (not the story-image intro,
    // not a menu/pause state, and not still sitting behind the
    // PIXEL GAUNT / GIRL: THE DRILLER startup splash) is actually
    // on screen before starting.
    // ------------------------------------------------------------
    // STARTUP-SEQUENCE FIX: this is now only ever reached AFTER js/game.js's New Game flow has
    // confirmed the story sequence finished completely (see advanceNewGameFlowToTutorial there),
    // so in practice the very first tick below already satisfies every condition. The conditions
    // are kept - and the splash check strengthened to read the shared GTDStartupFlow stage
    // machine rather than only the overlay's inline display - as defence in depth: the tour's
    // root is a full-viewport, z-index 99999, click-catching element, so it must never be built
    // on top of a splash screen, the Main Menu, or a story scene under any circumstances.
    function armForFirstPlaying() {
        if (armTimer || active) return;
        armAttempts = 0;
        armTimer = setInterval(() => {
            armAttempts++;
            if (typeof gameState === 'undefined') { disarm(); bailToGameplay(); return; }
            const storyBusy = (typeof storyState !== 'undefined' && storyState && storyState.active);
            if (gameState === 'PLAYING' && !storyBusy && !isStartupSplashVisible()) {
                disarm();
                start();
                return;
            }
            // Player left the "about to play" flow entirely (e.g. backed out to the main
            // menu before the story intro even finished) - stop waiting. The next genuine
            // New Game start point will call maybeStartNewGameTutorial() again anyway.
            if (gameState !== 'PLAYING' && gameState !== 'STORY') { disarm(); bailToGameplay(); return; }
            // Safety cap (~10 minutes) so a stuck edge case can never poll forever.
            if (armAttempts > 2000) { disarm(); bailToGameplay(); }
        }, 300);
    }

    // Used only by the give-up branches above: releases js/game.js's New Game flow from its
    // TUTORIAL stage so the session can still reach GAMEPLAY (and milestone story scenes can
    // queue again) even if the tour itself never got to run.
    function bailToGameplay() {
        notifyFlowTutorialFinished();
    }

    function disarm() {
        if (armTimer) clearInterval(armTimer);
        armTimer = null;
    }

    // ------------------------------------------------------------
    // SHORT TEXT-ONLY INTRODUCTION (no story images of any kind).
    // A few short in-character lines from the Girl herself, setting
    // up the premise, before handing off straight into the real
    // gameplay spotlight tour.
    // ------------------------------------------------------------
    const INTRO_LINES = [
        { speaker: 'The Driller', text: "Hey — glad you're here. I'm the Driller." },
        { speaker: 'The Driller', text: "I fly into deep-space mining zones, drill through asteroids, and grab whatever minerals and Antique Power Up they drop." },
        { speaker: 'The Driller', text: "That haul turns into Cash, and Cash unlocks new Power-Ups and Overdrive abilities back at the Skill Tree." },
        { speaker: 'The Driller', text: "Let me walk you through the cockpit before you head out there." }
    ];

    // ------------------------------------------------------------
    // STEP DEFINITIONS — REAL GAMEPLAY SPOTLIGHT TOUR
    // Each step targets either a real DOM element already in the
    // game (via `selector`/`selectors`) or the virtual "Girl/player
    // ship" point on the canvas (`target: 'player'`). `body` is
    // plain HTML built fresh at start() time so it can reflect the
    // player's actual current control scheme, key bindings, etc.
    // Steps whose DOM target isn't present/visible right now are
    // automatically skipped - see run().
    //
    // Order follows the requested tour exactly: Girl/player first,
    // then top-center Score/Cash/Zone/Distance, then the left-side
    // Minerals -> Overdrives -> Level stack, then the right-side
    // Active Systems ("Girl UI") -> Pause Menu -> Overdrive standby
    // state -> Antique Power Up. Two bonus steps (Dash, Minimap) are
    // appended afterward for the players who have them, since they
    // exist on the real HUD too - the requested 9 stops stay in
    // their exact requested order either way.
    //
    // Note on real layout vs. the requested one: this game's actual
    // HUD only has ONE Overdrives panel (left side) and no separate
    // "Girl/player UI" box distinct from the Active Systems panel
    // (right side) - so those two requested stops point at the real
    // existing elements that actually carry that information, rather
    // than inventing a second copy of a panel that doesn't exist.
    // ------------------------------------------------------------
    function buildSteps() {
        const steps = [];

        // 1) GIRL / PLAYER — FIRST
        steps.push({
            target: 'player',
            title: 'This Is You — The Driller',
            body: `<p>You're piloting a lone mining ship, drilling into asteroid fields to collect minerals, Antique Power Up, and Cash.</p>
                   <p>Your ship always stays centered on screen — the world scrolls around you as you fly.</p>
                   ${buildMovementBody()}
                   <p>Get close to an asteroid and your Drill automatically chews through it — you never have to aim or fire it manually.</p>`
        });

        // 2) TOP-CENTER GAMEPLAY UI — Score / Cash / Zone / Distance
        steps.push({
            selectors: ['#score-hud', '#money-hud', '#zone-hud', '#distance-hud'],
            title: 'Score, Cash, Zone & Distance',
            body: `<p><strong>Score</strong> is a running combat/progress score, separate from your spendable Cash.</p>
                   <p><strong>Cash</strong> ($) is what you spend in the Skill Tree on Power-Ups and upgrades — every mineral you collect adds to it automatically.</p>
                   <p><strong>Zone</strong> shows your current Mining Zone and how deep you've traveled — going deeper (and earning more Cash) unlocks tougher zones.</p>
                   <p><strong>Distance</strong> tracks how far you've flown this run.</p>`
        });

        // 3) MINERALS — LEFT SIDE
        steps.push({
            selector: '#hud',
            title: 'Minerals',
            body: `<p>Destroying asteroids drops <strong>Iron</strong>, <strong>Bronze</strong>, <strong>Gold</strong>, <strong>Diamond</strong>, and <strong>Uranium</strong> — fly close to a drop to collect it automatically.</p>
                   <p>Each mineral has its own worth and its own yield per destroy — some are common and quick to gather, others are rarer finds.</p>
                   <p>Everything you gather here feeds straight into your Cash total up top.</p>`
        });

        // 4) OVERDRIVES — BELOW MINERALS
        steps.push({
            selector: '#overdrives-container',
            title: 'Overdrives',
            body: `<p>Every Power-Up you unlock from the Skill Tree gets its own <strong>Overdrive</strong> box here — a temporary supercharged burst of that ability.</p>
                   <p><strong>How it works:</strong> a box reads <strong>WAIT</strong> while it recharges and switches to <strong>READY</strong> once it can be used.</p>
                   <p><strong>How to use it:</strong> click/tap a READY box, or press its shortcut key.</p>
                   <p><span class="gtd-tut-key">CONTROL</span> Each unlocked Overdrive shows its own shortcut key in the top-left corner of its box.</p>`
        });

        // 5) LEVEL UI — BELOW OVERDRIVES
        steps.push({
            selector: '#level-hud',
            title: 'Ship Level & Energy',
            body: `<p><strong>Ship Level / XP</strong> (top bar here) rises automatically as you play and affects your overall progression.</p>
                   <p><strong>Energy</strong> (bottom bar) drains while you move and slowly refills when you stop — you can only fly while you still have Energy left, so don't stray too far without a break.</p>`
        });

        // 6) GIRL / PLAYER UI — Active Systems panel
        steps.push({
            selector: '#tool-status-hud',
            title: 'Active Systems',
            body: `<p>This panel lists every Power-Up currently equipped on your Girl, and its live status.</p>
                   <p><strong>Auto-Drill</strong> is active from the very start — always on, no unlock needed.</p>
                   <p>As you unlock more Power-Ups from the Skill Tree (Girl Suit, Missiles, Plasma Laser, Attack Drone, and more), each one appears here automatically.</p>`
        });

        // 7) PAUSE MENU
        steps.push({
            selector: '#pause-btn',
            title: 'Pause Menu',
            body: `<p>Click/tap Pause${isMobileLayout() ? '' : ' (or press <span class="gtd-tut-key">Escape</span>)'} any time to open the Skill Tree, travel to a different Mining Zone, adjust Settings, or return to the Main Menu.</p>
                   <p>The game auto-saves for you — there's no manual Save button to remember.</p>`
        });

        // 8) OVERDRIVES STANDBY — same real panel, focused on the ready-state behavior
        steps.push({
            selector: '#overdrives-container',
            title: 'Overdrive Standby',
            body: `<p>This is the same Overdrive panel from a moment ago — here's how standby works.</p>
                   <p>Once a box's bar finishes filling and it flips to <strong>READY</strong>, it's on standby, waiting for you to trigger it.</p>
                   <p>If several are READY at the same moment, a selection screen pops up so you can choose which one to fire — the rest stay charged and ready for later.</p>`
        });

        // 9) ANTIQUE POWER UP (rendered on the same #special-items-hud panel)
        steps.push({
            selector: '#special-items-hud',
            title: 'Antique Power Up',
            body: `<p><strong>Antique Power Up</strong> is separate from ordinary mineral drops — rare glowing collectibles that occasionally spawn out in the zone.</p>
                   <p>Fly into one to collect it; it's added to your tally here automatically. There are 2 different Antique Power Up types to find over the course of the game.</p>`
        });

        // Bonus stops for HUD elements this game also has, if present/visible right now.
        const dashEl = document.getElementById('dash-hud');
        if (dashEl) {
            steps.push({
                selector: '#dash-hud',
                title: 'Dash',
                body: `<p>A quick burst of speed you can trigger on demand. Tap this or press <span class="gtd-tut-key">SPACE</span> to dash once it's ready.</p>
                       <p>It needs to recharge after each use, shown by the bar underneath.</p>`
            });
        }
        const minimapEl = document.getElementById('minimap-container');
        if (minimapEl) {
            steps.push({
                selector: '#minimap-container',
                title: 'Minimap',
                body: `<p>A small overview of what's nearby, so you can spot minerals and points of interest without losing track of your ship.</p>`
            });
        }

        return steps;
    }

    function buildMovementBody() {
        // controllerMode is declared with let/const at the top level of js/game.js, which -
        // since this file is loaded before js/game.js and this function only ever RUNS later,
        // after js/game.js has finished executing - is safely readable here as a plain
        // shared-scope identifier, exactly like any other code inside game.js itself. No
        // game.js code is modified to expose it.
        let mode = 'keyboard';
        try { if (typeof controllerMode !== 'undefined') mode = controllerMode; } catch (e) {}

        if (mode === 'mouse') {
            return `<p>Your controller is set to <strong>Mouse</strong>: press and hold the left mouse button anywhere and your ship thrusts toward that point.</p>
                    <p>You can change this any time from Settings.</p>`;
        }
        if (mode === 'touch') {
            return `<p>Your controller is set to <strong>Touch</strong>: touch and hold (or drag) anywhere on the screen and your ship flies toward that point.</p>
                    <p>You can change this any time from Settings.</p>`;
        }
        if (mode === 'gamepad') {
            return `<p>Your controller is set to <strong>Gamepad</strong>: use the left stick (or D-pad) to fly.</p>
                    <p>You can change this any time from Settings.</p>`;
        }
        return `<p>Move with <span class="gtd-tut-key">↑ ↓ ← →</span> or <span class="gtd-tut-key">W A S D</span>.</p>
                <p>Movement steadily drains your Energy meter, so keep an eye on it while flying.</p>
                <p>You can switch to mouse/touch/gamepad controls any time from Settings.</p>`;
    }

    // ------------------------------------------------------------
    // DOM SETUP
    // ------------------------------------------------------------
    function buildDom() {
        root = document.createElement('div');
        root.id = 'gtd-tutorial-root';

        spotlightEl = document.createElement('div');
        spotlightEl.id = 'gtd-tut-spotlight';
        root.appendChild(spotlightEl);

        panelEl = document.createElement('div');
        panelEl.id = 'gtd-tut-panel';
        root.appendChild(panelEl);

        skipEl = document.createElement('button');
        skipEl.type = 'button';
        skipEl.id = 'gtd-tut-skip';
        skipEl.textContent = 'SKIP TUTORIAL';
        // Use an explicit pointer handler as well as click. Some gameplay listeners use
        // capture-phase mouse/pointer handlers, so the tutorial's CLOSE control must consume
        // its own pointer press before anything underneath can see it.
        skipEl.addEventListener('pointerdown', (e) => {
            if (!active && !eventActive) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);
        skipEl.addEventListener('pointerup', (e) => {
            if (!active && !eventActive) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            skip();
        }, true);
        skipEl.addEventListener('click', (e) => {
            if (!active && !eventActive) return;
            e.preventDefault();
            e.stopPropagation();
            skip();
        }, true);
        root.appendChild(skipEl);

        welcomeEl = document.createElement('div');
        welcomeEl.id = 'gtd-tut-welcome';
        root.appendChild(welcomeEl);

        doneEl = document.createElement('div');
        doneEl.id = 'gtd-tut-done';
        doneEl.innerHTML = `
            <div class="gtd-tut-card">
                <h2>You're Ready!</h2>
                <p>That's everything you need to start mining. Good luck out there, Driller.</p>
                <div class="gtd-tut-row">
                    <button type="button" class="gtd-tut-btn gtd-tut-btn-next" id="gtd-tut-done-close">LET'S GO</button>
                </div>
            </div>`;
        root.appendChild(doneEl);

        document.body.appendChild(root);

        doneEl.querySelector('#gtd-tut-done-close').addEventListener('click', closeDoneOverlay);

        // Absorb any click/pointer press that lands on the dark backdrop itself (not on the
        // panel/buttons, which sit on top and handle their own clicks) so it can never reach
        // the canvas or any HUD button underneath.
        root.addEventListener('mousedown', swallowIfBackdrop, true);
        root.addEventListener('pointerdown', swallowIfBackdrop, true);
        root.addEventListener('touchstart', swallowIfBackdrop, { capture: true, passive: false });
        root.addEventListener('click', swallowIfBackdrop, true);
        root.addEventListener('contextmenu', swallowIfBackdrop, true);
    }

    function swallowIfBackdrop(e) {
        if (!active) return;

        // The gameplay project has several capture-phase pointer/click handlers.  The
        // tutorial buttons must be handled BEFORE those handlers can consume the event.
        // In particular, the INTRODUCTION's CONTINUE/START TOUR button used to reach its
        // own click listener only after a gameplay capture listener had already interfered.
        // Handle the introduction button here at the tutorial-root capture boundary.
        const target = e.target && e.target.closest ? e.target.closest('#gtd-tut-welcome-start') : null;
        if (target && welcomeEl && welcomeEl.classList.contains('gtd-tut-visible')) {
            if (e.type === 'click') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                introAdvance();
            } else {
                // Consume the pointer/mouse event so nothing underneath the tutorial can
                // receive the same press. The actual state change happens once on click.
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
            return;
        }

        // Let the other real interactive tutorial controls behave normally.
        if (e.target.closest('.gtd-tut-btn, #gtd-tut-skip')) return;
        e.preventDefault();
        e.stopPropagation();
    }

    // Capture-phase key blocker: fires before ANY of js/game.js's own window keydown/keyup
    // listeners (capture always runs before bubble for the same event), so movement keys,
    // number-key Overdrive shortcuts, Escape, etc. never reach the game while the tutorial is
    // up - without needing to touch a single line of js/game.js's input code.
    function keyBlocker(e) {
        if (!active) return;
        if (e.type === 'keydown') {
            if (e.key === 'Enter') {
                if (phase === 'intro') introAdvance();
                else if (phase === 'steps') advance();
                else if (phase === 'done') closeDoneOverlay();
            } else if (e.key === 'Escape') {
                if (phase === 'event' && eventActive) finishContextGuide();
                else if (phase === 'done') closeDoneOverlay(); else skip();
            }
        }
        e.stopImmediatePropagation();
        e.preventDefault();
    }

    // Defensive hard reset for New Game / Reset Progress (see resetNewGameTutorialState()
    // above): stops any pending "waiting for PLAYING" poll and, if a tour instance somehow
    // happens to be on screen at that exact moment, tears it down immediately via the same
    // path SKIP TUTORIAL uses. Both real call sites reload the page right after this runs,
    // which already wipes all in-memory JS state on its own - this just guarantees there's
    // never a stray armed timer or leftover DOM root in the brief window before that reload.
    function hardReset() {
        disarm();
        if (active) skip();
    }

    // ------------------------------------------------------------
    // LIFECYCLE
    // ------------------------------------------------------------
    function start() {
        if (active) return;
        // STRUCTURAL GUARD (hang fix): never build/show the tutorial's full-viewport,
        // z-index:99999, pointer-events:auto root while a story scene is on screen. That
        // root sits far above the story overlay's own z-index:500, so if it ever exists at
        // the same time as an active story scene, EVERY click meant for the story's Next/
        // Skip/Auto buttons or click-layer gets silently swallowed by this element instead -
        // the dialogue keeps typing but never advances again, which is exactly what reads as
        // "the game hung" the moment a story image/dialogue is on screen. gameState !==
        // 'PLAYING' during an intro/milestone scene already blocks this in the normal case
        // (see the check just below), but this checks storyState directly too so a future
        // change to gameState's gating can never reopen the race.
        if (typeof storyState !== 'undefined' && storyState && storyState.active) return;
        if (typeof gameState !== 'undefined') {
            if (gameState !== 'PLAYING') return; // safety - only ever launched during real gameplay
            savedGameState = gameState;
            gameState = 'PAUSED'; // exact same freeze mechanism the built-in Pause Menu uses
        }
        // Only now that the tour is genuinely about to be shown do we mark it "seen" - an
        // onboarding flow that should never quietly burn its only chance without the player
        // actually seeing it (see BUGFIX note at the top of this file). This flag is cleared by
        // resetNewGameTutorialState() on every New Game / Reset Progress, so "seen" only means
        // "already shown during the current playthrough", not "shown once ever".
        try { localStorage.setItem(GTD_TUTORIAL_SEEN_KEY, '1'); } catch (e) {}

        // NOTE: the real Pause button is deliberately NOT hidden here (a previous version set
        // display:none on it for the whole tour). That hid it from view AND from
        // getBoundingClientRect(), which made isVisible() report it as "not on screen" - so
        // Step 7 (Pause Menu), whose selector is '#pause-btn', could never find its target and
        // advance() silently auto-skipped it every single time (confirmed live: the tour jumped
        // straight from "STEP 6 OF 11" to "STEP 8 OF 11", never showing the Pause Menu step at
        // all). Hiding it was also unnecessary: #gtd-tutorial-root is a full-viewport,
        // pointer-events:auto, z-index:99999 div, so it already wins every hit-test over the
        // real Pause button underneath and swallowIfBackdrop() blocks the click regardless -
        // the button stays visually present (and spotlight-able) but not actually clickable.

        if (!root) buildDom();
        active = true;
        if (root) root.classList.add('gtd-tutorial-active');
        phase = 'intro';
        currentStep = -1;
        introIndex = 0;

        window.addEventListener('keydown', keyBlocker, true);
        window.addEventListener('keyup', keyBlocker, true);
        resizeHandler = () => {
            if (active && phase === 'steps' && currentStep >= 0) positionForStep(getSteps()[currentStep]);
            else if (eventActive && eventIndex >= 0) { const r = getEventRect(eventSteps[eventIndex]); if (r) { spotlightEl.style.left=r.left+'px'; spotlightEl.style.top=r.top+'px'; spotlightEl.style.width=r.width+'px'; spotlightEl.style.height=r.height+'px'; positionPanel(r); } }
        };
        window.addEventListener('resize', resizeHandler);

        // See the storyWatchdogTimer declaration above for why this exists.
        storyWatchdogTimer = setInterval(() => {
            if (typeof storyState !== 'undefined' && storyState && storyState.active) {
                skip();
            }
        }, 250);

        renderIntroLine();
        requestAnimationFrame(() => {
            welcomeEl.classList.add('gtd-tut-visible');
        });
    }

    let cachedSteps = null;
    function getSteps() {
        if (!cachedSteps) cachedSteps = buildSteps();
        return cachedSteps;
    }

    // ------------------------------------------------------------
    // SHORT TEXT INTRO — one line at a time, then hands off to the tour.
    // ------------------------------------------------------------
    function introDotsHtml() {
        let html = '';
        for (let i = 0; i < INTRO_LINES.length; i++) html += `<span class="gtd-tut-dot${i <= introIndex ? ' gtd-tut-dot-done' : ''}"></span>`;
        return html;
    }

    function renderIntroLine() {
        const line = INTRO_LINES[introIndex];
        const isLast = introIndex === INTRO_LINES.length - 1;
        welcomeEl.innerHTML = `
            <div class="gtd-tut-card">
                <div class="gtd-tut-eyebrow">${line.speaker}</div>
                <h2>Girl: The Driller</h2>
                <p>${line.text}</p>
                <div class="gtd-tut-dots" style="justify-content:center; margin-bottom: calc(var(--ui-scale, 1) * 18px);">${introDotsHtml()}</div>
                <div class="gtd-tut-row">
                    <button type="button" class="gtd-tut-btn gtd-tut-btn-next" id="gtd-tut-welcome-start">${isLast ? 'START TOUR' : 'CONTINUE'}</button>
                    <button type="button" class="gtd-tut-btn" id="gtd-tut-welcome-skip">SKIP</button>
                </div>
            </div>`;
        const introBtn = welcomeEl.querySelector('#gtd-tut-welcome-start');
        if (introBtn) {
            introBtn.type = 'button';
            introBtn.style.pointerEvents = 'auto';
            introBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Root-level capture handling normally advances this button. This direct
                // listener remains as a safe fallback if the event reaches the target.
                if (welcomeEl && welcomeEl.classList.contains('gtd-tut-visible')) introAdvance();
            });
        }
        const introSkipBtn = welcomeEl.querySelector('#gtd-tut-welcome-skip');
        if (introSkipBtn) {
            introSkipBtn.type = 'button';
            introSkipBtn.style.pointerEvents = 'auto';
            introSkipBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                skip();
            });
        }
    }

    function introAdvance() {
        if (introIndex >= INTRO_LINES.length - 1) { beginSteps(); return; }
        introIndex++;
        renderIntroLine();
    }

    function beginSteps() {
        phase = 'steps';
        welcomeEl.classList.remove('gtd-tut-visible');
        skipEl.classList.add('gtd-tut-visible');
        currentStep = -1;
        advance();
    }

    function advance() {
        currentStep++;
        const steps = getSteps();
        if (currentStep >= steps.length) { finish(); return; }
        const step = steps[currentStep];
        if (step.target !== 'player' && findTargets(step).length === 0) {
            // Target genuinely isn't present/visible right now (e.g. a Power-Up row the game
            // itself has hidden because it isn't unlocked yet) - skip straight to the next one
            // rather than spotlighting nothing.
            advance();
            return;
        }
        renderStep(step, steps.length);
    }

    // SKIP TUTORIAL: dismiss everything immediately and hand control straight back, with no
    // intermediate "you're ready" card - the player explicitly asked to stop.
    function skip() {
        if (eventActive && phase === 'event') { finishContextGuide(); return; }
        active = false;
        cleanupZoom();
        closeDoneOverlay();
    }

    // STARTUP-SEQUENCE FIX: tells js/game.js's New Game flow that the tutorial stage is over,
    // which is what promotes it to the GAMEPLAY stage (the point from which milestone story
    // scenes are allowed to queue again). Called from closeDoneOverlay() below, which every
    // exit path - finishing the tour, pressing SKIP TUTORIAL, or hardReset() - funnels through.
    // Called through window because game.js's top-level `let`/`function` bindings are not
    // reachable by name from this separate script file at definition time.
    function notifyFlowTutorialFinished() {
        try {
            if (typeof window.gtdNewGameFlowTutorialFinished === 'function') {
                window.gtdNewGameFlowTutorialFinished();
            }
        } catch (e) { /* never break the handoff back to gameplay */ }
    }

    // Reached the end of the step list normally: show the short "You're Ready" completion
    // card, whose own button (closeDoneOverlay) is what actually tears the tutorial down.
    // `active` stays true (input still blocked) until that button is actually clicked.
    function finish() {
        phase = 'done';
        cleanupZoom();
        if (root) {
            welcomeEl.classList.remove('gtd-tut-visible');
            spotlightEl.classList.remove('gtd-tut-visible', 'gtd-tut-pulse', 'gtd-tut-circle');
            panelEl.classList.remove('gtd-tut-visible');
            skipEl.classList.remove('gtd-tut-visible');
            doneEl.classList.add('gtd-tut-visible');
        }
    }

    function closeDoneOverlay() {
        active = false;
        if (storyWatchdogTimer) { clearInterval(storyWatchdogTimer); storyWatchdogTimer = null; }
        if (doneEl) doneEl.classList.remove('gtd-tut-visible');
        if (root) root.classList.remove('gtd-tutorial-active');
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
        window.removeEventListener('keydown', keyBlocker, true);
        window.removeEventListener('keyup', keyBlocker, true);
        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        // Don't stomp gameState back to 'PLAYING' if a story scene has (anomalously) taken
        // over while the tour was active - the watchdog above already tore this tutorial's
        // own blocking root down the instant it noticed, and the story system owns gameState
        // (it's already 'STORY') for as long as its own overlay is on screen. Restoring
        // 'PLAYING' here would resume real gameplay input/rendering underneath that overlay
        // instead of leaving it to the story system to hand gameState back on its own terms.
        const storyOwnsState = (typeof storyState !== 'undefined' && storyState && storyState.active);
        if (typeof gameState !== 'undefined' && !storyOwnsState) gameState = savedGameState || 'PLAYING';
        const pb = document.getElementById('pause-btn');
        if (pb && typeof gameState !== 'undefined' && gameState === 'PLAYING') pb.style.display = 'block';
        // STAGE 3 -> 4: the tutorial is completely gone and real gameplay now owns the screen.
        notifyFlowTutorialFinished();
    }

    // ------------------------------------------------------------
    // TARGETING & POSITIONING
    // ------------------------------------------------------------
    // Returns every currently visible real DOM element for this step (supports both a single
    // `selector` and a `selectors` array for steps that spotlight a whole cluster of HUD
    // elements together, e.g. Score/Cash/Zone/Distance). Never returns anything for a step
    // whose target genuinely isn't on screen right now.
    function findTargets(step) {
        const raw = step.selectors ? step.selectors : (step.selector ? [step.selector] : []);
        const out = [];
        raw.forEach(entry => {
            entry.split(',').map(s => s.trim()).forEach(sel => {
                const el = document.querySelector(sel);
                if (el && isVisible(el) && out.indexOf(el) === -1) out.push(el);
            });
        });
        return out;
    }

    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function getPlayerScreenRect() {
        // Per js/game.js's own camera math (camera.x = playerShip.x - (viewportW/gameScale)/2,
        // and the same for Y), the ship is always drawn exactly at the horizontal/vertical
        // center of the canvas - so the canvas's own on-screen center IS the ship's on-screen
        // position, with no need to touch playerShip/camera internals at all.
        const canvasEl = document.getElementById('gameCanvas');
        const r = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const radius = Math.max(46, Math.min(r.width, r.height) * 0.07);
        return { left: cx - radius, top: cy - radius, width: radius * 2, height: radius * 2, cx, cy, radius };
    }

    // Bounding box that encloses every element in `els`, so a multi-element step (e.g. the
    // stacked top-center Score/Cash/Zone/Distance boxes) can be spotlighted as one cohesive
    // area rather than one element at a time.
    function unionRect(els) {
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        els.forEach(el => {
            const rc = el.getBoundingClientRect();
            l = Math.min(l, rc.left); t = Math.min(t, rc.top);
            r = Math.max(r, rc.left + rc.width); b = Math.max(b, rc.top + rc.height);
        });
        return { left: l, top: t, width: r - l, height: b - t };
    }

    function cleanupZoom() {
        document.querySelectorAll('.gtd-tut-zoomed').forEach(el => el.classList.remove('gtd-tut-zoomed'));
    }

    // BUGFIX (verified live): #gtd-tut-skip sits fixed at top:16px/right:16px (bottom-right on
    // mobile), which is the SAME corner the real #pause-btn lives in (top:15px/right:15px in
    // css/styles.css). On the Pause Menu step this put the tutorial's own always-on-top (z-index
    // 100000) Skip button directly over the real Pause button's whole spotlighted rect - the
    // player only ever saw "SKIP TUTORIAL" glowing inside the highlight ring, never the actual
    // Pause button underneath it, even though the ring's coordinates were the real element's.
    // Fixed generally (not just for that one step): before showing each step, check whether the
    // Skip button's current on-screen box overlaps the step's spotlight rect, and if so slide it
    // to the nearest corner that's actually clear this step, instead of leaving it parked on top
    // of the real element the player is supposed to be looking at.
    function resetSkipPosition() {
        // IMPORTANT: '#gtd-tut-skip' gets its default corner (top+right, or bottom+right on
        // mobile) from the STYLESHEET (css/tutorial.css), not inline. Clearing an inline style
        // property to '' only removes an inline override - it does NOT remove the stylesheet's
        // own `right: 16px` rule underneath. So resetting with '' while a later step sets
        // `style.left` would leave BOTH `left` and `right` active on a fixed-position element at
        // once, which stretches it to fill the gap between them instead of sizing to its content
        // (this was caught live: the Skip button's box went from a normal ~124x38 button to a
        // ~1368px-wide bar). Explicitly setting every side to 'auto' fully overrides the
        // stylesheet rule instead of merely clearing an inline one, so only the sides this
        // function explicitly sets afterward ever take effect.
        skipEl.style.left = 'auto'; skipEl.style.right = 'auto';
        skipEl.style.top = 'auto'; skipEl.style.bottom = 'auto';
    }

    // BUGFIX (verified live): #gtd-tut-skip sits fixed at top:16px/right:16px (bottom-right on
    // mobile), which is the SAME corner the real #pause-btn lives in (top:15px/right:15px in
    // css/styles.css). On the Pause Menu step this put the tutorial's own always-on-top (z-index
    // 100000) Skip button directly over the real Pause button's whole spotlighted rect - the
    // player only ever saw "SKIP TUTORIAL" glowing inside the highlight ring, never the actual
    // Pause button underneath it, even though the ring's coordinates were the real element's.
    // Fixed generally (not just for that one step): before showing each step, check whether the
    // Skip button's default on-screen box overlaps the step's spotlight rect, and if so slide it
    // to the nearest corner that's actually clear this step, instead of leaving it parked on top
    // of the real element the player is supposed to be looking at.
    function avoidSkipOverlap(rect) {
        if (!skipEl) return;
        // Restore the stylesheet default corner first so the overlap test below reflects where
        // the button would normally sit, not wherever a previous step may have moved it to.
        skipEl.style.left = ''; skipEl.style.right = ''; skipEl.style.top = ''; skipEl.style.bottom = '';
        if (!rect) return;
        requestAnimationFrame(() => {
            const targetRect = { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
            function overlaps(r) { return !(r.right < targetRect.left || r.left > targetRect.right || r.bottom < targetRect.top || r.top > targetRect.bottom); }
            const sr = skipEl.getBoundingClientRect();
            if (!overlaps(sr)) return; // default corner is already clear of this step's target
            const margin = 16;
            const sw = sr.width, sh = sr.height;

            // The tutorial's close/skip control must never sit on top of the real Pause HUD.
            // When both gameplay HUD buttons are visible, use the actual measured gap between
            // Skill and Pause as the preferred location. This keeps the control visually between
            // the two real HUDs instead of making it look like an extra button attached to Pause.
            const pauseTarget = document.getElementById('pause-btn');
            const skillTarget = document.getElementById('skilltree-hud-btn');
            if (pauseTarget && skillTarget) {
                const pr = pauseTarget.getBoundingClientRect();
                const kr = skillTarget.getBoundingClientRect();
                const pcs = getComputedStyle(pauseTarget);
                const kcs = getComputedStyle(skillTarget);
                if (pr.width > 2 && pr.height > 2 && kr.width > 2 && kr.height > 2 &&
                    pcs.display !== 'none' && kcs.display !== 'none' &&
                    pcs.visibility !== 'hidden' && kcs.visibility !== 'hidden') {
                    const leftEdge = Math.min(kr.right, pr.right);
                    const rightEdge = Math.max(kr.left, pr.left);
                    const gap = rightEdge - leftEdge;
                    const centerX = (leftEdge + rightEdge) / 2;
                    if (gap >= sw + 4) {
                        resetSkipPosition();
                        skipEl.style.left = Math.round(centerX - sw / 2) + 'px';
                        skipEl.style.top = Math.round(Math.max(8, Math.min(pr.top + (pr.height - sh) / 2, window.innerHeight - sh - 8))) + 'px';
                        return;
                    }
                }
            }

            const mobile = isMobileLayout();
            // Try the other 3 corners only when the real Skill/Pause gap cannot fit the control.
            // Never leave it over the Pause HUD.
            const candidates = mobile
                ? [{ left: margin, bottom: margin }, { left: margin, top: margin }, { right: margin, top: margin }]
                : [{ left: margin, top: margin }, { left: margin, bottom: margin }, { right: margin, bottom: margin }];
            for (const c of candidates) {
                const left = c.left !== undefined ? c.left : (window.innerWidth - c.right - sw);
                const top = c.top !== undefined ? c.top : (window.innerHeight - c.bottom - sh);
                const r = { left: left, top: top, right: left + sw, bottom: top + sh };
                if (!overlaps(r)) {
                    resetSkipPosition();
                    if (c.left !== undefined) skipEl.style.left = c.left + 'px'; else skipEl.style.right = c.right + 'px';
                    if (c.top !== undefined) skipEl.style.top = c.top + 'px'; else skipEl.style.bottom = c.bottom + 'px';
                    return;
                }
            }
            // Every corner collides (very small/unusual viewport) - dock it just below the
            // target rect, still guaranteed clear of it and still fully on screen.
            resetSkipPosition();
            skipEl.style.right = margin + 'px';
            skipEl.style.top = Math.min(window.innerHeight - sh - margin, targetRect.bottom + margin) + 'px';
        });
    }

    // Computes the current spotlight rect for a non-player step and applies the zoom class to
    // every real element involved. Shared by renderStep (first paint) and positionForStep
    // (window resize) so the two can never disagree about where things are.
    function computeGroupRect(step) {
        const els = findTargets(step);
        if (els.length === 0) return null;
        els.forEach(el => el.classList.add('gtd-tut-zoomed'));
        const pad = 10;
        const u = unionRect(els);
        return { left: u.left - pad, top: u.top - pad, width: u.width + pad * 2, height: u.height + pad * 2 };
    }

    function renderStep(step, total) {
        cleanupZoom();
        spotlightEl.classList.remove('gtd-tut-pulse', 'gtd-tut-visible');

        let rect;
        if (step.target === 'player') {
            const pr = getPlayerScreenRect();
            spotlightEl.classList.add('gtd-tut-circle');
            spotlightEl.style.left = pr.left + 'px';
            spotlightEl.style.top = pr.top + 'px';
            spotlightEl.style.width = pr.width + 'px';
            spotlightEl.style.height = pr.height + 'px';
            rect = pr;
        } else {
            spotlightEl.classList.remove('gtd-tut-circle');
            rect = computeGroupRect(step);
            spotlightEl.style.left = rect.left + 'px';
            spotlightEl.style.top = rect.top + 'px';
            spotlightEl.style.width = rect.width + 'px';
            spotlightEl.style.height = rect.height + 'px';
        }
        requestAnimationFrame(() => spotlightEl.classList.add('gtd-tut-visible', 'gtd-tut-pulse'));
        avoidSkipOverlap(rect);

        panelEl.innerHTML = `
            <div class="gtd-tut-eyebrow">STEP ${currentStep + 1} OF ${total}</div>
            <div class="gtd-tut-title">${step.title}</div>
            <div class="gtd-tut-body">${step.body}</div>
            <div class="gtd-tut-footer">
                <div>
                    <div class="gtd-tut-progress">${currentStep + 1} / ${total}</div>
                    <div class="gtd-tut-dots">${dotsHtml(total)}</div>
                </div>
                <button type="button" class="gtd-tut-btn gtd-tut-btn-next" id="gtd-tut-next-btn">${currentStep + 1 >= total ? 'FINISH' : 'NEXT'}</button>
            </div>`;
        panelEl.querySelector('#gtd-tut-next-btn').addEventListener('click', advance);

        positionPanel(rect);
        requestAnimationFrame(() => panelEl.classList.add('gtd-tut-visible'));
    }

    function dotsHtml(total) {
        let html = '';
        for (let i = 0; i < total; i++) html += `<span class="gtd-tut-dot${i <= currentStep ? ' gtd-tut-dot-done' : ''}"></span>`;
        return html;
    }

    function positionForStep(step) {
        // Used only on window resize to keep an already-visible step's boxes aligned.
        if (!step) return;
        if (step.target === 'player') {
            const pr = getPlayerScreenRect();
            spotlightEl.style.left = pr.left + 'px';
            spotlightEl.style.top = pr.top + 'px';
            spotlightEl.style.width = pr.width + 'px';
            spotlightEl.style.height = pr.height + 'px';
            positionPanel(pr);
            avoidSkipOverlap(pr);
        } else {
            const rect = computeGroupRect(step);
            if (!rect) return;
            spotlightEl.style.left = rect.left + 'px';
            spotlightEl.style.top = rect.top + 'px';
            spotlightEl.style.width = rect.width + 'px';
            spotlightEl.style.height = rect.height + 'px';
            positionPanel(rect);
            avoidSkipOverlap(rect);
        }
    }

    // Places the info panel just outside the highlighted rect, flipping to whichever side
    // (and clamping within the viewport) keeps it fully on-screen and never covering the
    // highlighted element itself - works the same way on mobile, just with tighter margins.
    function positionPanel(rect) {
        const margin = 16;
        // Panel isn't in the DOM's flow yet with final content sized - measure after paint.
        panelEl.style.left = '-9999px';
        panelEl.style.top = '-9999px';
        requestAnimationFrame(() => {
            const pw = panelEl.offsetWidth || 320;
            const ph = panelEl.offsetHeight || 160;
            const vw = window.innerWidth, vh = window.innerHeight;

            const spaceBelow = vh - (rect.top + rect.height);
            const spaceAbove = rect.top;
            const spaceRight = vw - (rect.left + rect.width);
            const spaceLeft = rect.left;

            let left, top;
            if (spaceBelow >= ph + margin || (spaceBelow >= spaceAbove && spaceBelow > 100)) {
                top = rect.top + rect.height + margin;
                left = rect.left + rect.width / 2 - pw / 2;
            } else if (spaceAbove >= ph + margin) {
                top = rect.top - ph - margin;
                left = rect.left + rect.width / 2 - pw / 2;
            } else if (spaceRight >= pw + margin) {
                left = rect.left + rect.width + margin;
                top = rect.top + rect.height / 2 - ph / 2;
            } else if (spaceLeft >= pw + margin) {
                left = rect.left - pw - margin;
                top = rect.top + rect.height / 2 - ph / 2;
            } else {
                // Nowhere clean around the target (small screen, big element) - dock to the
                // bottom of the viewport, still never overlapping the target's own box.
                left = vw / 2 - pw / 2;
                top = vh - ph - margin;
            }

            left = Math.max(margin, Math.min(left, vw - pw - margin));
            top = Math.max(margin, Math.min(top, vh - ph - margin));

            panelEl.style.left = left + 'px';
            panelEl.style.top = top + 'px';
        });
    }


    // ============================================================
    // CONTEXTUAL FIRST-TIME GAMEPLAY GUIDES
    // ------------------------------------------------------------
    // These are short, one-time spotlight tours that appear exactly at the first real gameplay
    // moment an ability/collectible is encountered. They reuse the same full-screen darkening,
    // spotlight and information card as the opening tour, but do NOT use the long tutorial flow.
    // The game freezes for the few seconds the guide is visible, then resumes exactly where it
    // left off. Progress is stored in gameStats so each guide is shown only once per fresh game.
    // ============================================================
    function contextSeen(id) {
        try {
            if (typeof gameStats === 'undefined') return false;
            if (!gameStats.contextGuides) gameStats.contextGuides = {};
            return !!gameStats.contextGuides[id];
        } catch (e) { return false; }
    }
    function markContextSeen(id) {
        try {
            if (typeof gameStats !== 'undefined') {
                if (!gameStats.contextGuides) gameStats.contextGuides = {};
                gameStats.contextGuides[id] = true;
                if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
            }
        } catch (e) {}
    }

    function contextGuide(id, config) {
        if (!id || !config || contextSeen(id)) return;
        // Never interrupt the opening tutorial/story/pause/menu. The trigger can simply be
        // discarded because the real gameplay event will happen again if it has not occurred.
        if (active || eventActive) { eventQueue.push({ id, config }); return; }
        if (typeof gameState !== 'undefined' && gameState !== 'PLAYING' && gameState !== 'EXTRA_SURVIVAL') return;
        markContextSeen(id);
        eventQueue.push({ id, config });
        runNextContextGuide();
    }

    function runNextContextGuide() {
        if (eventActive || active || !eventQueue.length) return;
        const item = eventQueue.shift();
        if (!item) return;
        eventActive = true;
        if (root) root.classList.add('gtd-tutorial-active');
        eventSavedGameState = (typeof gameState !== 'undefined') ? gameState : 'PLAYING';
        eventSteps = item.config.steps || [item.config];
        eventIndex = -1;
        if (!root) buildDom();
        phase = 'event';
        if (typeof gameState !== 'undefined') gameState = 'PAUSED';
        skipEl.textContent = 'CLOSE';
        skipEl.style.pointerEvents = 'auto';
        skipEl.classList.add('gtd-tut-visible');
        welcomeEl.classList.remove('gtd-tut-visible');
        doneEl.classList.remove('gtd-tut-visible');
        advanceContextGuide();
    }

    function getEventRect(step) {
        if (step.point && typeof step.point.x === 'number' && typeof step.point.y === 'number') {
            const canvasEl = document.getElementById('gameCanvas');
            const cr = canvasEl ? canvasEl.getBoundingClientRect() : {left:0, top:0, width:window.innerWidth, height:window.innerHeight};
            let vw = (typeof viewportW !== 'undefined' && viewportW) ? viewportW : cr.width;
            let vh = (typeof viewportH !== 'undefined' && viewportH) ? viewportH : cr.height;
            let gs = (typeof gameScale !== 'undefined' && gameScale) ? gameScale : 1;
            let camX = (typeof camera !== 'undefined' && camera) ? camera.x : 0;
            let camY = (typeof camera !== 'undefined' && camera) ? camera.y : 0;
            let sx = cr.left + ((step.point.x - camX) * gs) * (cr.width / vw);
            let sy = cr.top + ((step.point.y - camY) * gs) * (cr.height / vh);
            const r = Math.max(34, Math.min(80, step.radius || 52));
            return { left: sx-r, top: sy-r, width:r*2, height:r*2 };
        }
        if (step.target === 'player') return getPlayerScreenRect();
        const els = findTargets(step);
        return els.length ? unionRect(els) : null;
    }

    function positionContextCloseButton() {
        if (!skipEl) return;
        const pauseTarget = document.getElementById('pause-btn');
        const skillTarget = document.getElementById('skilltree-hud-btn');
        if (!pauseTarget || !skillTarget) return;
        const pr = pauseTarget.getBoundingClientRect();
        const kr = skillTarget.getBoundingClientRect();
        const pcs = getComputedStyle(pauseTarget);
        const kcs = getComputedStyle(skillTarget);
        if (pcs.display === 'none' || pcs.visibility === 'hidden' ||
            kcs.display === 'none' || kcs.visibility === 'hidden' ||
            pr.width <= 2 || kr.width <= 2) return;

        // Explicitly override the stylesheet corner placement. The CLOSE control belongs
        // between the real Skill and Pause HUDs whenever that gap can contain it.
        skipEl.style.left = 'auto';
        skipEl.style.right = 'auto';
        skipEl.style.top = 'auto';
        skipEl.style.bottom = 'auto';
        const sr = skipEl.getBoundingClientRect();
        const leftEdge = Math.min(kr.right, pr.right);
        const rightEdge = Math.max(kr.left, pr.left);
        const gap = rightEdge - leftEdge;
        if (gap >= sr.width + 4) {
            skipEl.style.left = Math.round(leftEdge + (gap - sr.width) / 2) + 'px';
            skipEl.style.top = Math.round(Math.max(6, Math.min(
                pr.top + (pr.height - sr.height) / 2,
                window.innerHeight - sr.height - 6
            ))) + 'px';
        } else {
            // If the two HUDs are too close together, put CLOSE immediately below the
            // combined HUD row rather than over either button.
            const rowRight = Math.max(pr.right, kr.right);
            const rowBottom = Math.max(pr.bottom, kr.bottom);
            skipEl.style.left = Math.round(Math.max(6, Math.min(
                rowRight - sr.width, window.innerWidth - sr.width - 6
            ))) + 'px';
            skipEl.style.top = Math.round(Math.min(
                rowBottom + 8, window.innerHeight - sr.height - 6
            )) + 'px';
        }
    }

    function renderContextGuideStep(step, total) {
        if (!root) buildDom();
        const rect = getEventRect(step);
        if (!rect) { finishContextGuide(); return; }
        spotlightEl.classList.remove('gtd-tut-circle', 'gtd-tut-pulse');
        if (step.point || step.target === 'player') spotlightEl.classList.add('gtd-tut-circle');
        spotlightEl.style.left = rect.left + 'px';
        spotlightEl.style.top = rect.top + 'px';
        spotlightEl.style.width = rect.width + 'px';
        spotlightEl.style.height = rect.height + 'px';
        spotlightEl.classList.add('gtd-tut-visible', 'gtd-tut-pulse');
        panelEl.innerHTML = `
            <div class="gtd-tut-eyebrow">FIRST TIME GUIDE</div>
            <h2>${step.title || 'New Discovery'}</h2>
            <div class="gtd-tut-body">${step.body || ''}</div>
            <div class="gtd-tut-footer">
                <div><div class="gtd-tut-progress">${eventIndex + 1} / ${total}</div><div class="gtd-tut-dots">${dotsHtml(total)}</div></div>
                <button type="button" class="gtd-tut-btn gtd-tut-btn-next" id="gtd-context-next">${eventIndex + 1 >= total ? 'CONTINUE' : 'NEXT'}</button>
            </div>`;
        const nextBtn = panelEl.querySelector('#gtd-context-next');
        if (nextBtn) {
            // Consume the pointer press at the actual tutorial button so the game's canvas/HUD
            // listeners can never steal the Continue/Next action.
            nextBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
            nextBtn.addEventListener('pointerup', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                advanceContextGuide();
            }, true);
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                advanceContextGuide();
            }, true);
        }
        panelEl.classList.add('gtd-tut-visible');
        positionPanel(rect);
        positionContextCloseButton();
    }

    function advanceContextGuide() {
        if (!eventActive) return;
        eventIndex++;
        if (eventIndex >= eventSteps.length) { finishContextGuide(); return; }
        renderContextGuideStep(eventSteps[eventIndex], eventSteps.length);
    }

    function finishContextGuide() {
        eventActive = false;
        eventSteps = []; eventIndex = -1;
        if (root && !active) root.classList.remove('gtd-tutorial-active');
        if (spotlightEl) spotlightEl.classList.remove('gtd-tut-visible', 'gtd-tut-pulse', 'gtd-tut-circle');
        if (panelEl) panelEl.classList.remove('gtd-tut-visible');
        if (skipEl) skipEl.classList.remove('gtd-tut-visible');
        if (typeof gameState !== 'undefined') gameState = eventSavedGameState || 'PLAYING';
        eventSavedGameState = null;
        if (eventQueue.length) setTimeout(runNextContextGuide, 40);
    }

    window.gtdContextGuide = contextGuide;
    window.gtdContextGuideActive = () => eventActive;

    // ------------------------------------------------------------
    // FIRST-ENCOUNTER HUD GUIDES
    // ------------------------------------------------------------
    // The opening tour contains these HUDs, but the live gameplay HUDs also need their own
    // contextual introduction. These guides are attached to the REAL existing HUD elements;
    // there is no second button/HUD system. They trigger on the first actual hover over the
    // feature (or first Space press for Dash) during gameplay, then persist through gameStats.
    function installFirstEncounterHudGuides() {
        if (window.__gtdFirstEncounterHudGuidesInstalled) return;
        window.__gtdFirstEncounterHudGuidesInstalled = true;

        const guideDefs = [
            ['skill', '#skilltree-hud-btn', 'Skill Tree',
                `<p>This is your <strong>Skill Tree</strong>. Open it to unlock and upgrade the Power-Ups already available in the game.</p><p>Use your existing Cash/resources to buy upgrades, then return to gameplay to use the systems you unlock.</p>`],
            ['pause', '#pause-btn', 'Pause Menu',
                `<p>This is the <strong>Pause</strong> control. Use it to stop the current run and open the existing pause options.</p><p>Your game uses its existing automatic save/progress system, so you do not need a separate manual Save button.</p>`],
            ['ship-level', '#level-hud', 'Ship Level & Energy',
                `<p>This HUD shows your <strong>Ship Level</strong> and current <strong>XP</strong> progress.</p><p>The lower bar shows <strong>Energy</strong>. Keep an eye on it while flying because movement uses Energy and it recovers when you stop.</p>`],
            ['dash', '#dash-hud', 'Dash',
                `<p><strong>Dash</strong> gives Girl a quick burst of speed.</p><p>Press <span class="gtd-tut-key">SPACE</span> when it is ready. The bar shows its recharge state.</p>`],
            ['map', '#minimap-container', 'Map / Minimap',
                `<p>This is your <strong>Map / Minimap</strong>. It gives you a quick overview of nearby gameplay objects and helps you keep your bearings while moving through the mining zone.</p>`]
        ];

        function visible(el) {
            if (!el) return false;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.01) return false;
            const r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight;
        }

        function gameplayReady() {
            try {
                return typeof gameState !== 'undefined' && (gameState === 'PLAYING' || gameState === 'EXTRA_SURVIVAL') &&
                    !(typeof storyState !== 'undefined' && storyState && storyState.active) &&
                    !active && !eventActive;
            } catch (e) { return false; }
        }

        function hit(rect, x, y) {
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        }

        document.addEventListener('mousemove', (e) => {
            if (!gameplayReady()) return;
            for (const [id, selector, title, body] of guideDefs) {
                if (contextSeen(id)) continue;
                const el = document.querySelector(selector);
                if (!visible(el)) continue;
                const r = el.getBoundingClientRect();
                if (hit(r, e.clientX, e.clientY)) {
                    contextGuide(id, { selector, title, body });
                    break;
                }
            }
        }, true);

        // Dash is intentionally display-only in the DOM; Space is the real control.
        document.addEventListener('keydown', (e) => {
            if (e.code !== 'Space' || e.repeat || !gameplayReady() || contextSeen('dash')) return;
            const el = document.getElementById('dash-hud');
            if (!visible(el)) return;
            contextGuide('dash', {
                selector: '#dash-hud', title: 'Dash',
                body: `<p><strong>Dash</strong> gives Girl a quick burst of speed.</p><p>Press <span class="gtd-tut-key">SPACE</span> when it is ready. The bar shows its recharge state.</p>`
            });
            // The first Space press is used to introduce Dash rather than silently firing it.
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);

        // Hard safety: the tutorial root itself must never be a full-screen invisible hitbox
        // after a guide closes. The CSS class is also toggled by the guide lifecycle above.
        const repairGhostTargets = () => {
            const rootEl = document.getElementById('gtd-tutorial-root');
            if (rootEl && !active && !eventActive) rootEl.classList.remove('gtd-tutorial-active');
            ['gtd-tut-panel', 'gtd-tut-skip', 'gtd-tut-welcome', 'gtd-tut-done'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const cs = getComputedStyle(el);
                if (Number(cs.opacity) <= 0.01 && !el.classList.contains('gtd-tut-visible')) el.style.pointerEvents = 'none';
            });
        };
        setInterval(repairGhostTargets, 350);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installFirstEncounterHudGuides, { once: true });
    else installFirstEncounterHudGuides();

    return { armForFirstPlaying: armForFirstPlaying, start: start, hardReset: hardReset };
})();
