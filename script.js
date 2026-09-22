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
            { id: 12, studio: 'Pixel Gaunt', title: 'Serpent Relic', genre: 'Arcade', controls: 'Keyboard / Touch.', howToPlay: 'Guide the serpent to collect relics and survive.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Serpent Relic.png', url: 'serpent-relic.html', bgm: 'Serpent Relic.mp3', orientation: 'portrait' },
            { id: 13, studio: 'Pixel Gaunt', title: 'SnakeScape', genre: 'Arcade', controls: 'Keyboard / Touch.', howToPlay: 'Classic snake action — grow long, avoid the walls.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'SnakeScape.png', url: 'snakescape.html', bgm: 'SnakeScape.mp3', orientation: 'portrait' },
            { id: 14, studio: 'Pixel Gaunt', title: 'Stick Man Velocity', genre: 'Action', controls: 'Mouse / Touch. Tap to play.', howToPlay: 'Tap to keep Stick Man moving at full velocity.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Stick Man Velocity.png', url: 'stick-man-velocity.html', bgm: 'Stick Man Velocity.mp3', orientation: 'landscape' },
            { id: 15, studio: 'Pixel Gaunt', title: 'Tetris Reimagine', genre: 'Puzzle', controls: 'Keyboard / Touch.', howToPlay: 'Clear lines across 100 levels of reimagined Tetris.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Tetris Reimagine.png', url: 'tetris-reimagine.html', bgm: 'Tetris Reimagine.mp3', orientation: 'portrait' },
            { id: 16, studio: 'Pixel Gaunt', title: 'Girl The Driller', genre: 'Adventure', controls: 'Mouse / Touch.', howToPlay: 'Click to Go & Eat Mouse.', rating: '⭐⭐⭐⭐⭐ (4.9/5)', releaseDate: 'August 20, 2026', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: `Create a highly polished commercial-quality physics action game.`, image: 'Girl The Driller.png', preview: 'Girl The Driller.gif', url: 'girl-the-driller.html', bgm: 'Girl The Driller.mp3', orientation: 'landscape' }
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
            return game.community ? 'c-' + game.docId : playParam(game);
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
        window.registerGamePlay = function(gameId) {
            playCounts[gameId] = (playCounts[gameId] || 0) + 1;
            savePlayCounts(playCounts);

            const game = findGame(gameId);
            if (game) game.playCount = playCounts[gameId];

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

        window.setGlobalTheme = function(themeName, element) {
            document.body.className = '';
            document.body.classList.add('theme-' + themeName);
            document.querySelectorAll('.theme-dot').forEach(dot => dot.classList.remove('active'));
            if(element) element.classList.add('active');
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
            if (desktopControls) desktopControls.style.display = (category === 'mobile') ? 'none' : 'flex';
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

            requestElementFullscreen(container).then(() => {
                if (category === 'mobile') lockGameOrientation(game.orientation || 'landscape');
            }).catch(() => {
                // Some browsers require the fullscreen call to resolve before locking; still attempt the lock.
                if (category === 'mobile') lockGameOrientation(game.orientation || 'landscape');
            });
        }

        // historyMode controls how the URL/history entry is written:
        //   'push'    - a genuine new launch (card click, hero/spotlight button) - default.
        //   'replace' - restoring state from the URL on initial page load (no new back-entry).
        //   'none'    - triggered by the browser's own back/forward (popstate already updated history).
        window.launchViewport = function(gameId, historyMode) {
            historyMode = historyMode || 'push';

            const game = findGame(gameId);
            if (!game) return;

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
                tournament: d.tournament || null, chunkCount: d.chunkCount || 0, ownerUid: d.ownerUid || '',
                createdMs: (d.createdAt && d.createdAt.toMillis) ? d.createdAt.toMillis() : 0,
                playCount: playCounts['c_' + id] || 0
            };
        }

        let communityLoaded = false, communityFailed = false, communityPromise = null, communityHashDone = false;

        // Reads at most 24 published games (metadata + small thumbnail only) and caches them for the
        // session, so browsing costs almost no Firestore reads. Game files are fetched only on play.
        window.pgLoadCommunityGames = function(force) {
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
                        : '<div class="pg-empty">No community games yet. <a href="index.html#launch-section">Publish the first one.</a></div>');
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

        window.pgShowCommunityMeta = function(game) {
            const meta = document.getElementById('community-meta');
            if (!meta) return;
            if (!game.community) { meta.classList.add('pg-hidden'); return; }
            document.getElementById('community-author').textContent = game.studio;
            meta.classList.remove('pg-hidden');
            document.getElementById('report-community-btn').onclick = async () => {
                if (!window.isLoggedIn) return window.openModal('login-modal');
                const text = prompt('What is wrong with this game?');
                if (!text || !text.trim()) return;
                try {
                    const fb = await whenFirebase();
                    await fb.fs.addDoc(fb.fs.collection(fb.db, 'bug_reports'), { game: game.title, communityId: game.docId, report: text.trim().slice(0, 500), status: 'open', date: new Date() });
                    alert('Thanks. Your report was sent.');
                } catch (err) {
                    console.error('Report failed:', err);
                    alert('Could not send the report. Please email pixelgaunt@gmail.com.');
                }
            };
        };

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
        // Featured = the 3 games with the most plays across all visitors TODAY (UTC), read from
        // the shared Firestore daily counter. This curated trio is only the fallback shown before
        // that loads (or if it's ever unavailable) - not an editorial pick.
        // (The hero above the rail stays fixed on Girl The Driller regardless of any of this.)
        const FEATURED_FALLBACK_IDS = [16, 15, 12];
        const FEATURED_COUNT = 3;
        const GENRE_ICONS = { Arcade: 'fa-gamepad', Puzzle: 'fa-puzzle-piece', Racing: 'fa-flag-checkered', Action: 'fa-bolt', Adventure: 'fa-compass', Card: 'fa-clone' };
        let activeGenre = 'All';
        let searchQuery = '';

        function gameHref(g) { return 'games.html#' + (g.community ? 'cgame-' + g.docId : 'game-' + g.id); }

        function paintFeatured(list) {
            const rail = document.getElementById('featured-strip');
            if (!rail) return;
            rail.innerHTML = '';
            list.forEach(g => {
                const a = document.createElement('a');
                a.className = 'pg-tile';
                a.href = gameHref(g);
                a.setAttribute('aria-label', g.title + ', ' + g.genre + ' game');
                const img = g.community ? (g.thumb ? encodeURI(g.thumb) : '') : encodeURI(g.image);
                a.innerHTML = (img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" width="310" height="194">` : `<div class="pg-thumb-fallback" aria-hidden="true">${esc((g.title || '?').charAt(0).toUpperCase())}</div>`)
                    + `<div class="pg-tile-info"><b>${esc(g.title)}</b><span>${esc(g.genre)}</span></div>`;
                rail.appendChild(a);
            });
        }

        function renderFeatured() {
            // Paint the curated fallback immediately so the section is never empty, then try to
            // replace it with today's real top 3 once (or if) that loads.
            paintFeatured(FEATURED_FALLBACK_IDS.map(id => games.find(g => g.id === id)).filter(Boolean));
            Core_whenFirebase().then(async fb => {
                const { db, fs } = fb;
                const snap = await fs.getDocs(fs.query(fs.collection(db, 'daily_plays', todayKey(), 'games'), fs.orderBy('count', 'desc'), fs.limit(FEATURED_COUNT)));
                if (!snap.docs.length) return; // no plays recorded yet today - keep the fallback
                const top = snap.docs.map(d => {
                    const idStr = d.id;
                    return idStr.indexOf('c_') === 0 ? window.communityGames.find(g => g.id === idStr) : games.find(g => String(g.id) === idStr);
                }).filter(Boolean);
                if (top.length) paintFeatured(top);
            }).catch(err => console.warn('Daily featured ranking unavailable, showing fallback:', err));
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
                    // On the homepage the category row sits above the grid - bring the results into view.
                    if (document.getElementById('categories-section')) {
                        const target = document.getElementById('games-section');
                        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
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
                    tag.src = 'platform.js';
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

        // Handles the older ?page=tournament / ?page=store links: those fake pages are gone, the real sections replace them.
        const LEGACY_SECTIONS = { tournament: 'tournaments-section', store: 'creator-section' };

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
            } else if (pageQuery && LEGACY_SECTIONS[pageQuery]) {
                 window.goHome();
                 requestAnimationFrame(() => { const t = document.getElementById(LEGACY_SECTIONS[pageQuery]); if (t) t.scrollIntoView(); });
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
