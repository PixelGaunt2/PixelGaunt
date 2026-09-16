        window.isLoggedIn = false;
        
        const games = [
            { id: 1, studio: 'Pixel Gaunt', title: 'Beggar Catcher', genre: 'Arcade', controls: 'Mouse / Touch. Click to play.', howToPlay: 'Click to catch and play.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Beggar Catcher.png', url: 'beggar-catcher.html', bgm: 'Beggar Catcher.mp3', orientation: 'landscape' },
            { id: 2, studio: 'Pixel Gaunt', title: 'Bricks KnockOut', genre: 'Arcade', controls: 'Mouse / Touch. Drag to aim.', howToPlay: 'Drag to launch and break the bricks.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Bricks KnockOut.png', url: 'bricks-knockout.html', bgm: 'Bricks KnockOut.mp3', orientation: 'landscape' },
            { id: 3, studio: 'Pixel Gaunt', title: 'Deck of Doom', genre: 'Card', controls: 'Mouse / Touch. Drag cards to play.', howToPlay: 'Drag cards to build your deck and survive.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Deck of Doom.png', url: 'deck-of-doom.html', bgm: 'Deck of Doom.mp3', orientation: 'landscape' },
            { id: 4, studio: 'Pixel Gaunt', title: 'Face Merge', genre: 'Puzzle', controls: 'Mouse / Touch. Drag to merge.', howToPlay: 'Drag matching tiles to merge and clear the board.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Face Merge.png', url: 'face-merge.html', bgm: 'Face Merge.mp3', orientation: 'landscape' },
            { id: 5, studio: 'Pixel Gaunt', title: 'Horse Turn', genre: 'Racing', controls: 'Touch / Swipe. Swipe to steer.', howToPlay: 'Swipe to turn and race ahead.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Horse Turn.png', url: 'horse-turn.html', bgm: 'Horse Turn.mp3', orientation: 'landscape' },
            { id: 6, studio: 'Pixel Gaunt', title: 'Iron Tide Rising', genre: 'Action', controls: 'Keyboard / Touch.', howToPlay: 'Survive the rising tide and fight back.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Iron Tide Rising.png', url: 'iron-tide-rising.html', bgm: 'Iron Tide Rising.mp3', orientation: 'landscape' },
            { id: 7, studio: 'Pixel Gaunt', title: 'Mimi Merge', genre: 'Puzzle', controls: 'Mouse / Touch. Drag to merge.', howToPlay: 'Drag matching pieces together to merge them.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Mimi Merge.png', url: 'mimi-merge.html', bgm: 'Mimi Merge.mp3', orientation: 'landscape' },
            { id: 8, studio: 'Pixel Gaunt', title: 'Panda The Ocean Hunter', genre: 'Adventure', controls: 'Mouse / Touch.', howToPlay: 'Guide Panda through the ocean depths.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Panda The Ocean Hunter.png', url: 'panda-the-ocean-hunter.html', bgm: 'Panda The Ocean Hunter.mp3', orientation: 'landscape' },
            { id: 9, studio: 'Pixel Gaunt', title: 'Pizza Chaos', genre: 'Arcade', controls: 'Mouse / Touch.', howToPlay: 'Keep up with the chaos and serve every order.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Pizza Chaos.png', url: 'pizza-chaos.html', bgm: 'Pizza Chaos.mp3', orientation: 'landscape' },
            { id: 10, studio: 'Pixel Gaunt', title: 'ReBounce', genre: 'Arcade', controls: 'Mouse / Touch. Drag to aim.', howToPlay: 'Drag and release to bounce your way through.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'ReBounce.png', url: 'rebounce.html', bgm: 'ReBounce.mp3', orientation: 'landscape' },
            { id: 11, studio: 'Pixel Gaunt', title: 'Ring Sort', genre: 'Puzzle', controls: 'Mouse / Touch. Drag rings to sort.', howToPlay: 'Drag rings between pegs to sort them by color.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Ring Sort.png', url: 'ring-sort.html', bgm: 'Ring Sort.mp3', orientation: 'landscape' },
            { id: 12, studio: 'Pixel Gaunt', title: 'Serpent Relic', genre: 'Arcade', controls: 'Keyboard / Touch.', howToPlay: 'Guide the serpent to collect relics and survive.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Serpent Relic.png', url: 'serpent-relic.html', bgm: 'Serpent Relic.mp3', orientation: 'landscape' },
            { id: 13, studio: 'Pixel Gaunt', title: 'SnakeScape', genre: 'Arcade', controls: 'Keyboard / Touch.', howToPlay: 'Classic snake action — grow long, avoid the walls.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'SnakeScape.png', url: 'snakescape.html', bgm: 'SnakeScape.mp3', orientation: 'landscape' },
            { id: 14, studio: 'Pixel Gaunt', title: 'Stick Man Velocity', genre: 'Action', controls: 'Mouse / Touch. Tap to play.', howToPlay: 'Tap to keep Stick Man moving at full velocity.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Stick Man Velocity.png', url: 'stick-man-velocity.html', bgm: 'Stick Man Velocity.mp3', orientation: 'landscape' },
            { id: 15, studio: 'Pixel Gaunt', title: 'Tetris Reimagine', genre: 'Puzzle', controls: 'Keyboard / Touch.', howToPlay: 'Clear lines across 100 levels of reimagined Tetris.', rating: '', releaseDate: '', platform: 'Web Browser (Desktop & Mobile Responsive)', technology: 'HTML5 Web Technologies.', aiPrompt: ``, image: 'Tetris Reimagine.png', url: 'tetris-reimagine.html', bgm: 'Tetris Reimagine.mp3', orientation: 'landscape' },
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

            const game = games.find(g => g.id === gameId);
            if (game) game.playCount = playCounts[gameId];

            window.updateFeaturedPanels();
            window.renderGames(currentDisplayedList);
        }

        // ===== POPULARITY-BASED FEATURED PANEL (STATIC - NO AUTO ROTATION) =====
        // "Top Plays" (hero panel) always shows the single most-played game that has
        // reached the minimum play threshold. It only changes when play counts change.

        window.renderHeroSlide = function(game) {
            const heroPanel = document.getElementById('hero-panel-bg');
            if (!game) {
                // No game has reached the Top Plays threshold yet - hide the panel entirely
                // rather than showing an arbitrary/placeholder game.
                if (heroPanel) heroPanel.style.display = 'none';
                return;
            }
            if (heroPanel) heroPanel.style.display = '';
            const heroBg = document.getElementById('hero-panel-bg');
            if (heroBg) {
                heroBg.style.backgroundImage = `linear-gradient(135deg, rgba(8, 8, 15, 0.95), rgba(99, 102, 241, 0.315)), url('${encodeURI(game.image)}')`;
                document.getElementById('hero-title-text').innerText = game.title.toUpperCase();
                document.getElementById('hero-desc-text').innerText = game.howToPlay;

                let ratingMatch = game.rating.match(/\((.*?)\)/);
                document.getElementById('hero-rating-text').innerText = ratingMatch ? ratingMatch[1] + " Rating" : "4.8/5 Rating";
                document.getElementById('hero-play-btn').setAttribute('onclick', `launchViewport(${game.id})`);
            }
        }

        // Rebuilds the ranked list from current play counts and redraws the featured panel.
        // Call this after any play count change (or on page load) - it never runs on a timer.
        window.updateFeaturedPanels = function() {
            if (!games || games.length === 0) return;

            const ranked = window.getRankedGames();
            const topPlay = ranked.find(g => (g.playCount || 0) >= TOP_PLAYS_THRESHOLD) || null;

            window.renderHeroSlide(topPlay);
        }

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
            if (gameIframe) gameIframe.src = '';
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

            if(pageId === 'tournament-page') {
                window.generateAutoBracket();
            }
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
                gameGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 40px; font-size:0.9rem;">No entries found fitting active matrix fields.</p>';
                return;
            }

            // Same games, same order as what's already on screen -> nothing to do.
            const gridKey = rankedList.map(g => g.id).join(',');
            if (gridKey === lastRenderedGridKey) return;
            lastRenderedGridKey = gridKey;

            gameGrid.innerHTML = '';
            rankedList.forEach(game => {
                const card = document.createElement('div');
                card.className = 'game-card';
                card.id = 'game-' + game.id;
                card.onclick = () => {
                    if (window.SHOWCASE_MODE) {
                        // Homepage is a showcase only — never launch a game directly from here.
                        window.location.href = 'games.html#game-' + game.id;
                    } else {
                        window.launchViewport(game.id);
                    }
                };
                const safeImg = encodeURI(game.image);
                const safePreview = encodeURI(game.preview || game.image.replace('.png', '.gif'));
                card.innerHTML = `
                    <div class="card-thumb">
                        <img class="card-thumb-img" src="${safeImg}" alt="${game.title}" loading="lazy" decoding="async" width="400" height="300">
                        <div class="gif-overlay" data-gif="${safePreview}"></div>
                        <div class="play-overlay"><div class="play-btn-circle"></div></div>
                    </div>
                    <div class="card-info">
                        <div class="card-genre">${game.genre}</div>
                        <div class="card-title">${game.title}</div>
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

                gameGrid.appendChild(card);
            });
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

            const game = games.find(g => g.id === gameId);
            if (!game) return;

            const gameplayPage = document.getElementById('gameplay-page');
            const alreadyRunning = activeGameId === gameId && gameplayPage && gameplayPage.style.display === 'block';

            // This exact game is already open and running - do NOT touch the iframe again.
            // Reassigning iframe.src (even to the same URL) forces a real reload, which is
            // exactly the "game restarts by itself" symptom this guards against.
            if (alreadyRunning) {
                if (historyMode === 'push') {
                    history.pushState({ page: 'game', id: gameId }, game.title, `?play=${encodeURIComponent(game.title.toLowerCase().replace(/ /g, '-'))}`);
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
            gameIframe.src = encodeURI(game.url);

            document.getElementById('current-game-title').innerText = game.title;
            const setIfPresent = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = value; };
            setIfPresent('current-game-studio', game.studio);
            setIfPresent('current-game-releasedate', game.releaseDate);
            setIfPresent('current-game-platform', game.platform);
            setIfPresent('current-game-technology', game.technology);
            setIfPresent('current-game-rating', game.rating);
            setIfPresent('current-game-howtoplay', game.howToPlay);
            setIfPresent('current-game-controls', game.controls);

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
                history.pushState({ page: 'game', id: gameId }, game.title, `?play=${encodeURIComponent(game.title.toLowerCase().replace(/ /g, '-'))}`);
            } else if (historyMode === 'replace') {
                history.replaceState({ page: 'game', id: gameId }, game.title, `?play=${encodeURIComponent(game.title.toLowerCase().replace(/ /g, '-'))}`);
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

        /* 5-PLAYER AUTOMATIC BRACKET SIMULATION JS LOGIC */
        window.registerSelectedTournament = function(tourneyTitle) {
            alert(`Registration query received for "${tourneyTitle}"! 5 Players Bracket system will automatically seed your match.`);
        }

        window.generateAutoBracket = function() {
            const coinVal = parseInt(document.getElementById('bracket-coin-select').value) || 100;
            const totalPool = coinVal * 5;
            document.getElementById('pool-coins-val').innerText = `${totalPool} Coins`;

            const players = ["CyberPro_99", "PixelNinja", "ViperStrike", "ShadowRider", "GhostGamer"];
            
            // Random shuffle helper
            const shuffled = [...players].sort(() => 0.5 - Math.random());
            
            // Round 1 (Play-In Match): Player 4 vs Player 5
            const p4 = shuffled[3];
            const p5 = shuffled[4];
            const round1Winner = Math.random() > 0.5 ? p4 : p5;
            const round1Loser = round1Winner === p4 ? p5 : p4;

            // Round 2 (Semi Finals)
            // Semi 1: Player 1 vs Player 2
            const p1 = shuffled[0];
            const p2 = shuffled[1];
            const semi1Winner = Math.random() > 0.5 ? p1 : p2;
            const semi1Loser = semi1Winner === p1 ? p2 : p1;

            // Semi 2: Player 3 vs Round1Winner
            const p3 = shuffled[2];
            const semi2Winner = Math.random() > 0.5 ? p3 : round1Winner;
            const semi2Loser = semi2Winner === p3 ? round1Winner : p3;

            // Round 3 (Grand Finals)
            const finalChampion = Math.random() > 0.5 ? semi1Winner : semi2Winner;
            const finalRunnerUp = finalChampion === semi1Winner ? semi2Winner : semi1Winner;

            const bracketWrapper = document.getElementById('bracket-chart-wrapper');
            bracketWrapper.innerHTML = `
                <!-- Round 1: Play-In Match -->
                <div class="bracket-round-col">
                    <div class="bracket-round-title">ROUND 1 (PLAY-IN)</div>
                    <div class="bracket-match-node">
                        <div style="font-size: 0.72rem; color: var(--neon-cyan);">Match #1 (Haar gya to Out)</div>
                        <div class="bracket-player-row ${round1Winner === p4 ? 'winner' : 'eliminated'}">
                            <span>${p4}</span> <span>${round1Winner === p4 ? 'ADVANCED' : 'OUT'}</span>
                        </div>
                        <div class="bracket-player-row ${round1Winner === p5 ? 'winner' : 'eliminated'}">
                            <span>${p5}</span> <span>${round1Winner === p5 ? 'ADVANCED' : 'OUT'}</span>
                        </div>
                    </div>
                </div>

                <!-- Round 2: Semi-Finals -->
                <div class="bracket-round-col">
                    <div class="bracket-round-title">SEMI-FINALS (TOP 4)</div>
                    <div class="bracket-match-node">
                        <div style="font-size: 0.72rem; color: var(--neon-cyan);">Semi Final 1</div>
                        <div class="bracket-player-row ${semi1Winner === p1 ? 'winner' : 'eliminated'}">
                            <span>${p1}</span> <span>${semi1Winner === p1 ? 'WIN' : 'OUT'}</span>
                        </div>
                        <div class="bracket-player-row ${semi1Winner === p2 ? 'winner' : 'eliminated'}">
                            <span>${p2}</span> <span>${semi1Winner === p2 ? 'WIN' : 'OUT'}</span>
                        </div>
                    </div>
                    <div class="bracket-match-node">
                        <div style="font-size: 0.72rem; color: var(--neon-cyan);">Semi Final 2</div>
                        <div class="bracket-player-row ${semi2Winner === p3 ? 'winner' : 'eliminated'}">
                            <span>${p3}</span> <span>${semi2Winner === p3 ? 'WIN' : 'OUT'}</span>
                        </div>
                        <div class="bracket-player-row ${semi2Winner === round1Winner ? 'winner' : 'eliminated'}">
                            <span>${round1Winner}</span> <span>${semi2Winner === round1Winner ? 'WIN' : 'OUT'}</span>
                        </div>
                    </div>
                </div>

                <!-- Round 3: Grand Final -->
                <div class="bracket-round-col">
                    <div class="bracket-round-title" style="color:#fbbf24; border-color:#fbbf24; background:rgba(251, 191, 36, 0.1);">GRAND FINALS</div>
                    <div class="bracket-match-node" style="border-color:#fbbf24; box-shadow:0 0 15px rgba(251, 191, 36, 0.2);">
                        <div style="font-size: 0.72rem; color: #fbbf24;">Title Match for ${totalPool} Coins</div>
                        <div class="bracket-player-row ${finalChampion === semi1Winner ? 'winner' : 'eliminated'}">
                            <span>${semi1Winner}</span> <span>${finalChampion === semi1Winner ? 'CHAMPION' : 'OUT'}</span>
                        </div>
                        <div class="bracket-player-row ${finalChampion === semi2Winner ? 'winner' : 'eliminated'}">
                            <span>${semi2Winner}</span> <span>${finalChampion === semi2Winner ? 'CHAMPION' : 'OUT'}</span>
                        </div>
                    </div>
                </div>

                <!-- Champion Card -->
                <div class="bracket-round-col" style="align-items:center;">
                    <div class="bracket-round-title" style="background:var(--neon-cyan); color:#000; font-weight:bold; width:100%;">ULTIMATE WINNER</div>
                    <div style="background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(99, 102, 241, 0.14)); border:2px solid #fbbf24; padding:20px; border-radius:12px; text-align:center; width:100%;">
                        <div style="font-size:2rem; margin-bottom:5px;">🏆</div>
                        <div style="font-size:1.1rem; color:#fff; font-weight:bold; margin-bottom:5px;">${finalChampion}</div>
                        <div class="bracket-coin-badge" style="font-size:0.9rem; padding:6px 12px;">Won ${totalPool} Coins!</div>
                    </div>
                </div>
            `;
        }

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

        window.onload = () => {
            window.renderGames(games);
            window.updateFeaturedPanels();
            
            const urlParams = new URLSearchParams(window.location.search);
            const playQuery = urlParams.get('play');
            const pageQuery = urlParams.get('page');

            // This page has no game viewport (e.g. the showcase homepage) - a play
            // link landing here should open the real game library, not fail silently.
            if (playQuery && !document.getElementById('game-canvas')) {
                window.location.replace('games.html' + window.location.search);
                return;
            }
            
            if (playQuery) {
                const game = games.find(g => g.title.toLowerCase().replace(/ /g, '-') === playQuery);
                // 'replace' - the URL already reflects this game, so attach the correct
                // history state without pushing a second, redundant back-entry.
                if (game) window.launchViewport(game.id, 'replace');
                else window.goHome();
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

            // Hide the loader once the critical content has actually been painted, rather
            // than after a fixed guess-timeout. Two rAFs = wait for the next real frame.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const loader = document.getElementById('loader');
                if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 300); }
            }));
        };
        
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
