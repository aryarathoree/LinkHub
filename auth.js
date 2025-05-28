// Remove imports and use global firebase object
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// DOM Elements
const signinForm = document.getElementById('signin-form');
const signupForm = document.getElementById('signup-form');
const tabBtns = document.querySelectorAll('.tab-btn');
const errorMessage = document.getElementById('error-message');

// Tab switching
if (tabBtns.length > 0) {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons and forms
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
            
            // Add active class to clicked button and corresponding form
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-form`).classList.add('active');
            
            // Clear error message
            if (errorMessage) {
                errorMessage.textContent = '';
            }
        });
    });
}

// Sign In with Email/Password
if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signin-email').value;
        const password = document.getElementById('signin-password').value;

        try {
            await auth.signInWithEmailAndPassword(email, password);
            // Redirect to select page after successful sign in
            window.location.href = 'select.html';
        } catch (error) {
            showError(error.message);
        }
    });
}

// Sign Up with Email/Password
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            // Update user profile with name
            await userCredential.user.updateProfile({
                displayName: name
            });
            // Redirect to select page after successful sign up
            window.location.href = 'select.html';
        } catch (error) {
            showError(error.message);
        }
    });
}

// Google Sign In
const googleSigninBtn = document.getElementById('google-signin');
const googleSignupBtn = document.getElementById('google-signup');

if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', signInWithGoogle);
}
if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', signInWithGoogle);
}

async function signInWithGoogle() {
    try {
        // Try popup first
        try {
            await auth.signInWithPopup(provider);
            window.location.href = 'select.html';
        } catch (popupError) {
            // If popup is blocked, fall back to redirect
            if (popupError.code === 'auth/popup-blocked') {
                await auth.signInWithRedirect(provider);
                // The redirect will happen automatically
            } else {
                throw popupError;
            }
        }
    } catch (error) {
        showError(error.message);
    }
}

// Handle redirect result with proper error handling
auth.getRedirectResult().then((result) => {
    if (result && result.user) {
        window.location.href = 'select.html';
    }
}).catch((error) => {
    console.error('Redirect result error:', error);
    showError(error.message);
});

// Error handling
function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.animation = 'none';
        errorMessage.offsetHeight; // Trigger reflow
        errorMessage.style.animation = 'glow 2s ease-in-out infinite alternate';
    } else {
        // If error message element doesn't exist, show cyber popup instead
        const popup = document.createElement('div');
        popup.className = 'cyber-popup';
        popup.innerHTML = `
            <div class="cyber-popup-content">${message}</div>
            <div class="cyber-popup-buttons">
                <button class="cyber-popup-button">OK</button>
            </div>
        `;

        document.body.appendChild(popup);

        const button = popup.querySelector('.cyber-popup-button');
        button.addEventListener('click', () => {
            popup.remove();
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (document.body.contains(popup)) {
                popup.remove();
            }
        }, 5000);
    }
}

// Check authentication state
auth.onAuthStateChanged((user) => {
    try {
        // Only redirect if we're on the auth page and user exists
        if (user && window.location.pathname.includes('auth.html')) {
            window.location.href = 'select.html';
        }
    } catch (error) {
        console.error('Auth state change error:', error);
        // Don't show error to user as this is a background check
    }
}); 