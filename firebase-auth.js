        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
        import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, increment, collection, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, Bytes, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
        import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

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
        const analytics = getAnalytics(app);
        
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
        // `awaitingContinue` only controls UI sequencing. Identity always comes from Firebase
        // (auth.currentUser); the sessionStorage flag exists solely so the Continue step also
        // appears after a signInWithRedirect round-trip (which reloads the page).
        // ---------------------------------------------------------------------------------
        const AWAIT_KEY = "pgAwaitContinue";
        let awaitingContinue = false;
        // The flag stores a timestamp and only counts for AWAIT_MAX_MS. A stale flag (tab closed or page
        // reloaded mid-login) must never leave a valid Firebase session hidden behind the Continue step.
        const AWAIT_MAX_MS = 3 * 60 * 1000;
        try {
            const raw = sessionStorage.getItem(AWAIT_KEY);
            const t = raw === "1" ? 0 : Number(raw);          // "1" = old-format flag, treated as already expired
            awaitingContinue = !!t && (Date.now() - t) < AWAIT_MAX_MS;
            if (!awaitingContinue && raw) sessionStorage.removeItem(AWAIT_KEY);
        } catch (e) { /* storage unavailable */ }
        function setAwaiting(v) {
            awaitingContinue = v;
            try { if (v) sessionStorage.setItem(AWAIT_KEY, String(Date.now())); else sessionStorage.removeItem(AWAIT_KEY); } catch (e) { /* ignore */ }
        }

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
                    return "Your browser blocked the sign-in popup. Please allow popups and try again.";
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

        // If we came back from a redirect-based sign-in, finish it here.
        getRedirectResult(auth)
            .then((result) => {
                if (result && result.user) {
                    saveUserProfile(result.user);
                    if (awaitingContinue) showContinueStep(result.user);
                } else if (awaitingContinue && !auth.currentUser) {
                    // Flag was set but no sign-in came back (cancelled / stale flag).
                    setAwaiting(false);
                    reportLoginError({ code: "auth/redirect-cancelled-by-user" });
                }
            })
            .catch((error) => {
                console.error("Redirect login error:", error);
                setAwaiting(false);
                reportLoginError(error);
            });

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
                    // Popups are unreliable on mobile / in-app browsers - fall back to redirect.
                    if (
                        error && (
                            error.code === "auth/popup-blocked" ||
                            error.code === "auth/operation-not-supported-in-this-environment"
                        )
                    ) {
                        try {
                            await signInWithRedirect(auth, googleProvider);   // keeps awaitingContinue flag across the reload
                            return;
                        } catch (redirectError) {
                            console.error("Redirect login error:", redirectError);
                            setAwaiting(false);
                            reportLoginError(redirectError);
                            return;
                        }
                    }
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

        window.logoutUser = async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Logout Error:", error);
            }
        };

        // Creator Studio needs the account's plan (free / subscriber) to show the right
        // limits and to gate the nav link. Fetched once per login, alongside - never instead
        // of - saveUserProfile, so a Firestore hiccup here still leaves the user validly logged in.
        window.pgUserPlan = null;
        async function loadUserPlan(user) {
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                const data = snap.exists() ? snap.data() : {};
                window.pgUserPlan = (data.plan === 'subscriber') ? 'subscriber' : 'free';
            } catch (error) {
                console.warn("Could not read plan, defaulting to free:", error);
                window.pgUserPlan = 'free';
            }
            window.dispatchEvent(new CustomEvent('pg-plan', { detail: { plan: window.pgUserPlan } }));
        }

        const creatorStudioNavLink = document.getElementById('nav-creator-studio-link');

        // The "logged in / logged out" UI. Called directly for normal auth changes (already
        // signed in on page load, logout) and, for a fresh login, only after Continue.
        function applyAuthState(user) {
            window.dispatchEvent(new CustomEvent('pg-auth', { detail: { user: user || null } }));
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
                            game: gameTitle,
                            report: bugDetails,
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
