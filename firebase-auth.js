        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
        import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, increment, collection, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, Bytes, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        const firebaseConfig = {
            apiKey: "AIzaSyBN_MStg8ff8XW_IUceq9bMDDYb-zYqw6A",
            authDomain: "pixelgaunt-e5235.firebaseapp.com",
            projectId: "pixelgaunt-e5235",
            storageBucket: "pixelgaunt-e5235.firebasestorage.app",
            messagingSenderId: "261213234973",
            appId: "1:261213234973:web:e65879886c82be3aabe3f4",
            measurementId: "G-CV52RVWHGY"
        };

        const app = initializeApp(firebaseConfig);
        // Analytics is loaded on its own and may fail. It used to be a static import: privacy/ad blockers commonly block
        // firebase-analytics.js, and a failed static import kills THIS WHOLE MODULE - no auth listener, no pgFB - so every
        // page rendered as logged out even though the Firebase session was still saved in the browser.
        import("https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js")
            .then(m => m.isSupported().then(ok => { if (ok) m.getAnalytics(app); }))
            .catch(e => console.warn("Analytics unavailable (blocked or offline) - login is not affected:", e && e.message));
        
        const auth = getAuth(app);
        const db = getFirestore(app);
        const googleProvider = new GoogleAuthProvider();

        // Shared handles for script.js (community games) and the lazy-loaded platform.js
        // (publishing, tournaments, creator lab). Nothing secret lives here - Firebase web config
        // is public by design and is protected by Firestore security rules + authorised domains.
        window.pgFB = {
            auth, db,
            fs: { doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, Bytes, runTransaction, increment }
        };
        document.dispatchEvent(new Event('pg-firebase-ready'));

        const mainLoginBtn = document.getElementById("main-login-btn");
        const googleLoginBtn = document.getElementById("google-login-btn"); 
        const loginModal = document.getElementById("login-modal");

        // Always show Google's account chooser (so a user can pick a *different* Gmail account)
        // and ask Google to show its own "Continue / Cancel" confirmation page after the account
        // is chosen. Without "consent", Google silently skips that page for returning users.
        googleProvider.setCustomParameters({ prompt: "select_account consent" });

        // ---------------------------------------------------------------------------------
        // LOGIN FLOW:  Login -> Google account selection -> CONTINUE step -> Creator Studio
        //
        // Firebase reports "signed in" (onAuthStateChanged) the instant the Google account is
        // selected. Previously that callback simply closed the modal, so the user saw nothing
        // between account selection and being logged in. Now, while `awaitingContinue` is true,
        // the callback shows the Continue step instead and holds back the "logged in" UI events
        // (pg-auth / plan load / nav change / redirect) until Continue is pressed.
        //
        // `awaitingContinue` only controls UI sequencing on the page where the login was started.
        // Identity always comes from Firebase (auth.currentUser), which persists the session in
        // IndexedDB (browserLocal persistence - the getAuth() default).
        //
        // SESSION FIX: this flag used to be stored in sessionStorage and re-read on every page load, so for
        // 3 minutes after signing in, any refresh or navigation (before pressing Continue) rendered the site
        // as LOGGED OUT - no pg-auth event, "Login" in the nav, Creator Studio's sign-in guard - although the
        // Firebase session was valid. It is now in-memory only: a page load with a saved session is always
        // shown as logged in.
        // ---------------------------------------------------------------------------------
        let awaitingContinue = false;
        try { sessionStorage.removeItem("pgAwaitContinue"); } catch (e) { /* clear flags left by the old code */ }
        function setAwaiting(v) { awaitingContinue = v; }

        const loginStep = loginModal ? loginModal.querySelector(".modal-step") : null;
        let loginMsgEl = null, continueStepEl = null, contAvatar = null, contName = null, contEmail = null, contMsg = null, contBtn = null, switchBtn = null;

        // Built here (not copied into every HTML page) so all seven pages share one login modal.
        // Reuses the existing modal, title and button styles.
        if (loginModal && loginStep) {
            loginMsgEl = document.createElement("p");
            loginMsgEl.id = "pg-login-msg";
            loginMsgEl.setAttribute("role", "alert");
            loginMsgEl.style.cssText = "display:none; margin-top:16px; font-size:0.85rem; line-height:1.5; color:#fca5a5; text-align:center;";
            loginStep.appendChild(loginMsgEl);

            continueStepEl = document.createElement("div");
            continueStepEl.id = "pg-continue-step";
            continueStepEl.className = "modal-step";
            continueStepEl.style.cssText = "display:none; text-align:center;";
            continueStepEl.innerHTML =
                '<h3 class="modal-title pixel-font">Pixel <span style="color:var(--neon-purple);">Gaunt</span></h3>' +
                '<p style="color:#94a3b8; font-size:0.9rem; margin:-8px 0 18px;">Google account selected</p>' +
                '<img id="pg-continue-avatar" alt="" style="width:64px; height:64px; border-radius:50%; margin:0 auto 12px; display:none; border:2px solid var(--neon-cyan);">' +
                '<div id="pg-continue-name" style="color:#fff; font-weight:700; font-size:1rem; overflow-wrap:anywhere;"></div>' +
                '<div id="pg-continue-email" style="color:#e2e8f0; font-size:0.9rem; margin:4px 0 22px; overflow-wrap:anywhere;"></div>' +
                '<button type="button" class="nav-btn primary pg-btn" id="pg-continue-btn" style="width:100%; justify-content:center;">Continue</button>' +
                '<button type="button" id="pg-switch-btn" style="margin-top:14px; background:none; border:none; color:#94a3b8; font-size:0.85rem; text-decoration:underline; cursor:pointer;">Use a different Google account</button>' +
                '<p id="pg-continue-msg" role="alert" style="display:none; margin-top:14px; font-size:0.85rem; line-height:1.5; color:#fca5a5;"></p>';
            loginStep.parentNode.appendChild(continueStepEl);

            contAvatar = continueStepEl.querySelector("#pg-continue-avatar");
            contName = continueStepEl.querySelector("#pg-continue-name");
            contEmail = continueStepEl.querySelector("#pg-continue-email");
            contMsg = continueStepEl.querySelector("#pg-continue-msg");
            contBtn = continueStepEl.querySelector("#pg-continue-btn");
            switchBtn = continueStepEl.querySelector("#pg-switch-btn");
        }

        function showLoginMsg(text) {
            if (!loginMsgEl) { if (text) alert(text); return; }   // no modal on this page: last-resort fallback
            loginMsgEl.textContent = text || "";
            loginMsgEl.style.display = text ? "block" : "none";
        }
        function showContinueMsg(text) {
            if (!contMsg) return;
            contMsg.textContent = text || "";
            contMsg.style.display = text ? "block" : "none";
        }
        function showLoginStep() {
            if (continueStepEl) continueStepEl.style.display = "none";
            if (loginStep) loginStep.style.display = "";
            if (contBtn) contBtn.disabled = false;
            showContinueMsg("");
        }
        function showContinueStep(user) {
            if (!continueStepEl || !loginStep) {
                // Page without the modal markup: nothing to show, so don't leave the user stuck.
                finishLogin(false);
                return;
            }
            loginStep.style.display = "none";
            continueStepEl.style.display = "";
            contName.textContent = user.displayName || "";
            contEmail.textContent = user.email || "";
            if (user.photoURL) { contAvatar.src = user.photoURL; contAvatar.style.display = "block"; } else { contAvatar.style.display = "none"; }
            contBtn.disabled = false;
            showContinueMsg("");
            if (typeof window.openModal === "function") window.openModal("login-modal");
        }

        // Closing the modal (X / clicking outside) while the Continue step is showing means the
        // user chose not to continue: sign them out so nothing is half-logged-in.
        const originalCloseModals = window.closeModals;
        window.closeModals = function () {
            // Closing the modal (X / click outside) is NOT a logout. The Google sign-in is already valid, so keep the
            // session and complete the login UI. Only the explicit "Use a different Google account" button signs out.
            if (awaitingContinue && continueStepEl && continueStepEl.style.display !== "none" && auth.currentUser) {
                setAwaiting(false);
                applyAuthState(auth.currentUser);   // re-enters closeModals with the flag cleared, so no loop
                return;
            }
            showLoginMsg("");
            if (typeof originalCloseModals === "function") originalCloseModals.apply(this, arguments);
            setTimeout(() => { if (!awaitingContinue) showLoginStep(); }, 350);
        };
        async function cancelPendingLogin() {
            setAwaiting(false);
            try { localStorage.setItem('pgExplicitLogout', '1'); } catch (e) {}   // the user chose this - not a problem to report
            try { await signOut(auth); } catch (error) { console.error("Logout Error:", error); }
        }

        // Saving the user profile is a SEPARATE concern from signing in.
        // If Firestore rules reject the write, the user is still validly logged in,
        // so this must never be allowed to surface as a "login failed" error.
        async function saveUserProfile(user) {
            try {
                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    lastLogin: new Date()
                }, { merge: true });
            } catch (error) {
                console.warn("Signed in OK, but could not save the user profile to Firestore:", error);
            }
        }

        function describeAuthError(error) {
            switch (error && error.code) {
                case "auth/unauthorized-domain":
                    return "This domain is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.";
                case "auth/operation-not-allowed":
                    return "Google sign-in is not enabled for this Firebase project.";
                case "auth/popup-blocked":
                    return "Your browser blocked the Google sign-in window. Allow popups for pixelgaunt.com, then tap \"Login with Google\" again.";
                case "auth/operation-not-supported-in-this-environment":
                    return "Google sign-in cannot open inside this app's built-in browser. Open pixelgaunt.com in Chrome or Safari and log in there.";
                case "auth/popup-closed-by-user":
                case "auth/user-cancelled":
                case "auth/redirect-cancelled-by-user":
                    return "Sign-in cancelled. Click \"Login with Google\" to try again.";
                case "auth/cancelled-popup-request":
                    return null; // a second click superseded the first popup; nothing to report
                case "auth/network-request-failed":
                    return "Network error reaching Firebase. Check your connection and try again.";
                case "auth/user-disabled":
                    return "This Google account has been disabled.";
                default:
                    return "Google authentication failed: " + ((error && error.message) || "Unknown error");
            }
        }

        // Shows an error inside the login modal (opening it if needed) so the user always sees what happened.
        function reportLoginError(error) {
            const msg = describeAuthError(error);
            if (!msg) return;
            showLoginStep();
            showLoginMsg(msg);
            if (typeof window.openModal === "function") window.openModal("login-modal");
        }

        // NOTE: there is deliberately no signInWithRedirect fallback any more. authDomain is
        // pixelgaunt-e5235.firebaseapp.com while the site runs on pixelgaunt.com; current Chrome, Safari and
        // Firefox partition third-party storage, so a redirect sign-in returned to pixelgaunt.com with NO user
        // (Google account chosen, then "logged out"). signInWithPopup is not affected by this.

        if (googleLoginBtn) {
            googleLoginBtn.addEventListener("click", async () => {
                showLoginMsg("");
                setAwaiting(true);            // must be set BEFORE Firebase fires onAuthStateChanged
                googleLoginBtn.disabled = true;
                try {
                    const result = await signInWithPopup(auth, googleProvider);
                    await saveUserProfile(result.user);
                    showContinueStep(result.user);
                } catch (error) {
                    console.error("Popup login error:", error);
                    setAwaiting(false);
                    reportLoginError(error);
                } finally {
                    googleLoginBtn.disabled = false;
                }
            });
        } else {
            console.warn("google-login-btn not found in the DOM - login button is not wired up.");
        }

        // CONTINUE: verify the Firebase user, then complete login and open Creator Studio.
        if (contBtn) {
            contBtn.addEventListener("click", async () => {
                const user = auth.currentUser;
                if (!user) {
                    setAwaiting(false);
                    showLoginStep();
                    showLoginMsg("Your sign-in session ended. Please log in again.");
                    return;
                }
                contBtn.disabled = true;
                showContinueMsg("");
                try {
                    await user.getIdToken();   // confirms Firebase still accepts this session
                } catch (error) {
                    console.error("Could not verify Firebase user:", error);
                    contBtn.disabled = false;
                    showContinueMsg(describeAuthError(error) || "Could not verify your sign-in. Please try again.");
                    return;
                }
                finishLogin(true);
            });
        }
        if (switchBtn) {
            switchBtn.addEventListener("click", async () => {
                await cancelPendingLogin();
                showLoginStep();
                showLoginMsg("Signed out. Choose the Google account you want to use.");
            });
        }

        function finishLogin(openStudio) {
            setAwaiting(false);
            const user = auth.currentUser;
            applyAuthState(user);           // closes the modal, updates nav, fires pg-auth, loads plan
            if (openStudio && user && document.body.dataset.pgPage !== "creator-studio") {
                window.location.href = "creator-studio.html";
            }
        }

        // Logout only happens on an explicit, confirmed request. The nav button shows the avatar + "Logout",
        // and a single accidental tap on it used to end the session immediately.
        window.logoutUser = async () => {
            if (!window.confirm("Log out of PixelGaunt?")) return;
            try {
                try { localStorage.setItem('pgExplicitLogout', '1'); localStorage.removeItem('pgSession'); } catch (e) {}
                await signOut(auth);
            } catch (error) {
                console.error("Logout Error:", error);
            }
        };

        // Creator Studio needs the account's plan (free / subscriber) to show the right
        // limits and to gate the nav link. Fetched once per login, alongside - never instead
        // of - saveUserProfile, so a Firestore hiccup here still leaves the user validly logged in.
        // Profile changes from Creator Studio > Account (name / picture). The review service stores the picture and
        // returns its address; the account itself is updated here so the header, comments and feed use it.
        window.pgUpdateProfile = async (fields) => {
            const u = auth.currentUser; if (!u) throw new Error('Please log in.');
            const upd = {}; if (fields.name) upd.displayName = fields.name; if (fields.photoURL) upd.photoURL = fields.photoURL;
            await updateProfile(u, upd); await u.getIdToken(true);
            applyAuthState(u);
            return u;
        };
        window.pgUserPlan = null;
        // users/<uid>.plan: 'free' | 'subscriber_monthly' (10 games/month) | 'subscriber_yearly' (12/month); old 'subscriber' = monthly.
        function normalizePlan(p) { return p === 'subscriber_yearly' ? 'subscriber_yearly' : (p === 'subscriber_monthly' || p === 'subscriber') ? 'subscriber_monthly' : 'free'; }
        // Called when the review service has just started a subscription you approved (script.js).
        window.pgReloadPlan = () => { const u = auth.currentUser; if (u) loadUserPlan(u); };
        async function loadUserPlan(user) {
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                const data = snap.exists() ? snap.data() : {};
                const ends = data.plan_expires && data.plan_expires.toDate ? data.plan_expires.toDate() : null;
                window.pgPlanExpires = ends ? ends.toISOString() : null;
                window.pgUserPlan = ends && ends < new Date() ? 'free' : normalizePlan(data.plan);   // subscription ended
            } catch (error) {
                // Database rules not published yet / offline: ask the review service, which reads it with server access.
                try {
                    const q = await (await fetch((window.PG_REVIEW_ENDPOINT || '') + '/quota', { headers: { Authorization: 'Bearer ' + await user.getIdToken() } })).json();
                    window.pgUserPlan = normalizePlan(q.planKey); window.pgPlanExpires = q.planExpires || null;
                } catch (e2) {
                    console.warn("Could not read plan, defaulting to free:", error);
                    window.pgUserPlan = 'free';
                }
            }
            window.dispatchEvent(new CustomEvent('pg-plan', { detail: { plan: window.pgUserPlan } }));
        }

        const creatorStudioNavLink = document.getElementById('nav-creator-studio-link');

        // The "logged in / logged out" UI. Called directly for normal auth changes (already
        // signed in on page load, logout) and, for a fresh login, only after Continue.
        // ---- LOGIN DIAGNOSTICS: if a session ends without the user pressing Logout, record why (admin dashboard > Login problems)
        function sessionMark(user) {
            try {
                if (user) { const s = JSON.parse(localStorage.getItem('pgSession') || 'null'); if (!s || s.uid !== user.uid) localStorage.setItem('pgSession', JSON.stringify({ uid: user.uid, at: Date.now(), host: location.hostname })); localStorage.removeItem('pgExplicitLogout'); return; }
                const s = JSON.parse(localStorage.getItem('pgSession') || 'null'), explicit = localStorage.getItem('pgExplicitLogout') === '1';
                localStorage.removeItem('pgSession');
                if (!s || explicit) return;
                const problem = (() => { try { const p = JSON.parse(localStorage.getItem('pgAuthProblem') || 'null'); return p ? p.code + ' ' + (p.msg || '') : ''; } catch (e) { return ''; } })();
                const report = { kind: 'unexpected_logout', host: location.hostname + (s.host && s.host !== location.hostname ? ' (logged in on ' + s.host + ')' : ''), afterMin: Math.round((Date.now() - s.at) / 60000),
                    problem: problem || 'no error recorded (browser storage cleared, private window, or a different browser/device)', ua: navigator.userAgent.slice(0, 200), standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches), uidHint: s.uid.slice(0, 6) };
                if (window.PG_REVIEW_ENDPOINT && navigator.sendBeacon) navigator.sendBeacon(window.PG_REVIEW_ENDPOINT + '/diag', new Blob([JSON.stringify(report)], { type: 'text/plain' }));
                if (window.pgWelcome) window.pgWelcome('You were signed out without pressing Logout. We recorded the reason so it can be fixed - please log in again.');
            } catch (e) { /* storage blocked */ }
        }
        // Check the login can be renewed every 25 minutes while the page is open (Firebase renews it every hour).
        setInterval(() => { const u = auth.currentUser; if (u && !document.hidden) { try { sessionStorage.removeItem('pgTokenCheck'); } catch (e) {} applyTokenCheck(u); } }, 25 * 60e3);
        // Show the Admin link to administrators only (the review service decides; admins/<uid> in Firestore).
        function adminLink(user) {
            const old = document.getElementById('nav-admin-link'); if (!user) { if (old) old.remove(); return; }
            if (!window.PG_REVIEW_ENDPOINT) return;
            user.getIdToken().then(t => fetch(window.PG_REVIEW_ENDPOINT + '/admin/me', { headers: { Authorization: 'Bearer ' + t } })).then(r => r.ok ? r.json() : null).then(d => {
                if (!d || !d.admin || document.getElementById('nav-admin-link')) return;
                const ref = document.getElementById('nav-creator-studio-link'); if (!ref || !ref.parentNode) return;
                const a = document.createElement('a'); a.id = 'nav-admin-link'; a.href = 'admin.html'; a.textContent = 'Admin'; a.style.color = '#fbbf24';
                ref.parentNode.insertBefore(a, ref.nextSibling);
            }).catch(() => {});
        }

        function applyTokenCheck(user) {
            if (user) {
                try {
                    if (sessionStorage.getItem('pgTokenCheck') !== user.uid) {
                        const done = () => { try { sessionStorage.setItem('pgTokenCheck', user.uid); } catch (e) {} };   // only once it really finished
                        user.getIdToken(true).then(() => { done(); try { localStorage.removeItem('pgAuthProblem'); } catch (e) {} }).catch(err => {
                            const code = String((err && err.code) || err), net = /network-request-failed/.test(code);
                            if (net) return;   // offline, or the page changed mid-check: try again on the next page
                            done();
                            console.error('[PixelGaunt login check] Login renewal failed:', code, err && err.message);
                            try { localStorage.setItem('pgAuthProblem', JSON.stringify({ code, msg: String(err && err.message || '').slice(0, 300), at: new Date().toISOString() })); } catch (e) {}
                            if (/blocked|api-key|apikey|referer|referrer|securetoken/i.test(code + ' ' + (err && err.message)) && window.pgWelcome) {
                                window.pgWelcome('Login problem on this website: Google refused to renew your login (' + code + '). Please tell pixelgaunt@gmail.com.');
                            }
                        });
                    }
                } catch (e) { /* storage blocked */ }
            }

        }

        function applyAuthState(user) {
            window.dispatchEvent(new CustomEvent('pg-auth', { detail: { user: user || null } }));
            sessionMark(user); adminLink(user);
            // LOGIN SELF-CHECK (once per visit): renew the login token now, the way Firebase does every hour.
            // If Google refuses (most often: the Firebase API key is restricted without "Token Service API"),
            // Firebase would silently log the user out later - so say exactly why, instead of a mystery logout.
            if (user) applyTokenCheck(user);
            if (user && window.pgWelcome) {
                try {
                    if (sessionStorage.getItem('pgWelcomedUser') !== user.uid) {
                        // Marked as shown after 2.5 s: if the page changes sooner (e.g. the jump to Creator Studio right
                        // after logging in), the welcome is shown again on the next page instead of being lost.
                        setTimeout(() => { try { sessionStorage.setItem('pgWelcomedUser', user.uid); } catch (e) {} }, 2500);
                        const first = (user.displayName || '').split(' ')[0] || 'player';
                        const isNew = user.metadata && user.metadata.creationTime && user.metadata.creationTime === user.metadata.lastSignInTime;
                        window.pgWelcome(isNew ? `Welcome to PixelGaunt, ${first}! 🎉 Your account is ready.` : `Welcome back, ${first}! 👋`);
                    }
                } catch (e) { /* storage blocked */ }
            }
            if (user && window.PG_REVIEW_ENDPOINT && window.pgDeviceId) {
                try {
                    if (sessionStorage.getItem('pgSeen') !== user.uid) {
                        user.getIdToken().then(t => fetch(window.PG_REVIEW_ENDPOINT + '/seen', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ deviceId: window.pgDeviceId(), isNew: !!(user.metadata && user.metadata.creationTime && user.metadata.creationTime === user.metadata.lastSignInTime) }) }))
                            .then(r => { if (r && r.ok) sessionStorage.setItem('pgSeen', user.uid); }).catch(() => {});
                    }
                } catch (e) { /* storage blocked */ }
            }
            if (user) {
                window.isLoggedIn = true; 
                if(typeof window.updatePromptVisibility === 'function') window.updatePromptVisibility(); 
                if(typeof window.closeModals === 'function') window.closeModals(); 
                loadUserPlan(user);

                if (mainLoginBtn) {
                    mainLoginBtn.innerHTML = `<img src="${user.photoURL || 'https://via.placeholder.com/30'}" style="width:20px; height:20px; border-radius:50%; margin-right:8px; vertical-align:middle;"> Logout`;
                    mainLoginBtn.onclick = window.logoutUser;
                }
                if (creatorStudioNavLink) creatorStudioNavLink.style.display = '';
            } else {
                window.isLoggedIn = false;
                window.pgUserPlan = null;
                if(typeof window.updatePromptVisibility === 'function') window.updatePromptVisibility(); 
                if (mainLoginBtn) {
                    mainLoginBtn.innerHTML = "Login";
                    mainLoginBtn.onclick = () => window.openModal('login-modal');
                }
                if (creatorStudioNavLink) creatorStudioNavLink.style.display = 'none';
                // Logged-out visitors never get a lingering Creator Studio page - send them home
                // if they land there directly (e.g. a stale tab, a shared link) so no private
                // creator data can be exposed through the UI.
                if (document.body.dataset.pgPage === 'creator-studio') {
                    window.location.href = 'index.html';
                }
            }
        }

        onAuthStateChanged(auth, (user) => {
            if (user && awaitingContinue) {
                // Fresh sign-in in progress: show the Continue step and WAIT. No pg-auth event,
                // no "logged in" UI and no redirect until the user presses Continue.
                showContinueStep(user);
                return;
            }
            applyAuthState(user);
        });

        const likeBtn = document.getElementById('like-btn');
        if(likeBtn) {
            likeBtn.addEventListener('click', async () => {
                if (!window.isLoggedIn) return window.openModal('login-modal');
                const gameTitle = document.getElementById('current-game-title').innerText;
                try {
                    await setDoc(doc(db, "games", gameTitle), { likes: increment(1) }, { merge: true });
                    alert(`Thanks for liking ${gameTitle}! ❤️`);
                } catch (error) {
                    console.error("Error adding like: ", error);
                    alert("Database connection error. Check your Firebase rules.");
                }
            });
        }

        const bugBtn = document.getElementById('bug-btn');
        if(bugBtn) {
            bugBtn.addEventListener('click', async () => {
                if (!window.isLoggedIn) return window.openModal('login-modal');
                const bugDetails = prompt("Describe the bug you found in this game:");
                if (bugDetails && bugDetails.trim() !== "") {
                    const gameTitle = document.getElementById('current-game-title').innerText;
                    try {
                        await addDoc(collection(db, "bug_reports"), {
                            game: String(gameTitle).slice(0, 120),
                            report: bugDetails.trim().slice(0, 1000),
                            uid: auth.currentUser.uid,
                            area: 'game',
                            status: "open",
                            date: new Date()
                        });
                        alert("Bug reported successfully! Our team will check it. 🐛");
                    } catch (error) {
                        console.error("Error reporting bug: ", error);
                        alert("Database connection error. Check your Firebase rules.");
                    }
                }
            });
        }
