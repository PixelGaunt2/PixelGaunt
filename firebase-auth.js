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
                case "auth/cancelled-popup-request":
                    return null; // user simply closed it; not an error worth alerting about
                case "auth/network-request-failed":
                    return "Network error reaching Firebase. Check your connection and try again.";
                default:
                    return "Login failed: " + ((error && error.message) || "Unknown error");
            }
        }

        // If we came back from a redirect-based sign-in, finish it here.
        getRedirectResult(auth)
            .then((result) => { if (result && result.user) saveUserProfile(result.user); })
            .catch((error) => {
                const msg = describeAuthError(error);
                console.error("Redirect login error:", error);
                if (msg) alert(msg);
            });

        if (googleLoginBtn) {
            googleLoginBtn.addEventListener("click", async () => {
                try {
                    const result = await signInWithPopup(auth, googleProvider);
                    await saveUserProfile(result.user);
                } catch (error) {
                    console.error("Popup login error:", error);
                    // Popups are unreliable on mobile / in-app browsers - fall back to redirect.
                    if (
                        error && (
                            error.code === "auth/popup-blocked" ||
                            error.code === "auth/operation-not-supported-in-this-environment" ||
                            error.code === "auth/cancelled-popup-request"
                        )
                    ) {
                        try {
                            await signInWithRedirect(auth, googleProvider);
                            return;
                        } catch (redirectError) {
                            console.error("Redirect login error:", redirectError);
                            const rmsg = describeAuthError(redirectError);
                            if (rmsg) alert(rmsg);
                            return;
                        }
                    }
                    const msg = describeAuthError(error);
                    if (msg) alert(msg);
                }
            });
        } else {
            console.warn("google-login-btn not found in the DOM - login button is not wired up.");
        }

        window.logoutUser = async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Logout Error:", error);
            }
        };

        onAuthStateChanged(auth, (user) => {
            window.dispatchEvent(new CustomEvent('pg-auth', { detail: { user: user || null } }));
            if (user) {
                window.isLoggedIn = true; 
                if(typeof window.updatePromptVisibility === 'function') window.updatePromptVisibility(); 
                if(typeof window.closeModals === 'function') window.closeModals(); 
                
                if (mainLoginBtn) {
                    mainLoginBtn.innerHTML = `<img src="${user.photoURL || 'https://via.placeholder.com/30'}" style="width:20px; height:20px; border-radius:50%; margin-right:8px; vertical-align:middle;"> Logout`;
                    mainLoginBtn.onclick = window.logoutUser;
                }
            } else {
                window.isLoggedIn = false;
                if(typeof window.updatePromptVisibility === 'function') window.updatePromptVisibility(); 
                if (mainLoginBtn) {
                    mainLoginBtn.innerHTML = "Login";
                    mainLoginBtn.onclick = () => window.openModal('login-modal');
                }
            }
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
