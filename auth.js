import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Initialize Google Auth Provider
const provider = new GoogleAuthProvider();

// DOM Elements
const signinForm = document.getElementById('signin-form');
const signupForm = document.getElementById('signup-form');
const tabBtns = document.querySelectorAll('.tab-btn');
const errorMessage = document.getElementById('error-message');

// Add transition handling
const transitionOverlay = document.querySelector('.transition-overlay');

async function showTransition() {
    return new Promise((resolve) => {
        transitionOverlay.classList.add('active');
        setTimeout(resolve, 5000); // Wait for full animation sequence
    });
}

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
        const email = document.getElementById('signin-email').value.trim();
        const password = document.getElementById('signin-password').value;

        // Clear previous error
        if (errorMessage) {
            errorMessage.textContent = '';
        }

        // Debug logging
        console.log('Attempting sign in with:', { email });

        // Validate email
        if (!email || !email.includes('@')) {
            showError('Please enter a valid email address');
            return;
        }

        // Validate password
        if (!password || password.length < 6) {
            showError('Password must be at least 6 characters long');
            return;
        }

        try {
            // Check if auth is properly initialized
            if (!auth) {
                throw new Error('Authentication service not initialized');
            }

            console.log('Auth service initialized, attempting sign in...');
            
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log('Sign in successful:', userCredential.user.email);
            
            if (userCredential.user) {
                await showTransition();
                window.location.href = 'select.html';
            }
        } catch (error) {
            console.error('Sign in error details:', {
                code: error.code,
                message: error.message,
                fullError: error
            });
            
            let errorMessage = 'An error occurred during sign in';
            let showSignUpOption = false;
            
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address format';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'This account has been disabled';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email.';
                    showSignUpOption = true;
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password. Please try again.';
                    break;
                case 'auth/invalid-credential':
                    errorMessage = 'Invalid email or password.';
                    showSignUpOption = true;
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many failed attempts. Please try again later or reset your password.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Network error. Please check your internet connection and try again.';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = 'Email/password sign in is not enabled. Please contact support.';
                    break;
                default:
                    errorMessage = `Unable to sign in: ${error.message}`;
            }

            // Show error message
            showError(errorMessage);

            // If account doesn't exist, show option to sign up
            if (showSignUpOption) {
                const signUpOption = document.createElement('div');
                signUpOption.className = 'sign-up-option';
                signUpOption.innerHTML = `
                    <p>Don't have an account?</p>
                    <button class="sign-up-btn">Sign Up</button>
                `;
                
                if (errorMessage) {
                    errorMessage.parentNode.insertBefore(signUpOption, errorMessage.nextSibling);
                }

                // Add click handler for sign up button
                const signUpBtn = signUpOption.querySelector('.sign-up-btn');
                signUpBtn.addEventListener('click', () => {
                    // Switch to sign up tab
                    const signUpTab = document.querySelector('[data-tab="signup"]');
                    if (signUpTab) {
                        signUpTab.click();
                    }
                    // Pre-fill email
                    const signUpEmail = document.getElementById('signup-email');
                    if (signUpEmail) {
                        signUpEmail.value = email;
                    }
                });
            }
        }
    });
}

// Sign Up with Email/Password
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;

        // Debug logging
        console.log('Attempting sign up with:', { email, name });

        // Clear previous error
        if (errorMessage) {
            errorMessage.textContent = '';
        }

        // Validate inputs
        if (!name) {
            showError('Please enter your name');
            return;
        }

        if (!email || !email.includes('@')) {
            showError('Please enter a valid email address');
            return;
        }

        if (!password || password.length < 6) {
            showError('Password must be at least 6 characters long');
            return;
        }

        try {
            // Check if auth is properly initialized
            if (!auth) {
                throw new Error('Authentication service not initialized');
            }

            console.log('Auth service initialized, attempting sign up...');
            
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log('Sign up successful:', userCredential.user.email);
            
            // Update user profile with name
            await updateProfile(userCredential.user, {
                displayName: name
            });
            console.log('Profile updated with name:', name);
            
            if (userCredential.user) {
                await showTransition();
                window.location.href = 'select.html';
            }
        } catch (error) {
            console.error('Sign up error details:', {
                code: error.code,
                message: error.message,
                fullError: error
            });
            
            let errorMessage = 'An error occurred during sign up';
            
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'An account with this email already exists. Please sign in instead.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address format';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = 'Email/password accounts are not enabled. Please contact support.';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak. Please use a stronger password.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Network error. Please check your internet connection and try again.';
                    break;
                default:
                    errorMessage = `Unable to create account: ${error.message}`;
            }
            showError(errorMessage);
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
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
            await showTransition();
            window.location.href = 'select.html';
        }
        return result;
    } catch (error) {
        console.error('Google sign in error:', error);
        
        // Handle unauthorized domain error specifically
        if (error.code === 'auth/unauthorized-domain') {
            showError('Authentication Error: Please contact support to enable sign-in for this domain.');
            
            // Create a more detailed error message for development
            const detailedError = document.createElement('div');
            detailedError.className = 'error-details';
            detailedError.innerHTML = `
                <p>Development Note:</p>
                <p>To fix this error:</p>
                <ol>
                    <li>Go to Firebase Console</li>
                    <li>Select Authentication → Settings</li>
                    <li>Add '127.0.0.1' and 'localhost' to Authorized Domains</li>
                </ol>
            `;
            
            if (errorMessage) {
                errorMessage.appendChild(detailedError);
            }
        } else {
            showError('Failed to sign in with Google. Please try again.');
        }
        return null;
    }
}

// Handle redirect result with proper error handling
getRedirectResult(auth).then(async (result) => {
    if (result && result.user) {
        await showTransition();
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
    if (user) {
        console.log('User is signed in:', user.email);
        // Update UI for signed-in user
        const userEmail = document.getElementById('user-email');
        const authStatus = document.getElementById('auth-status');
        if (userEmail) userEmail.textContent = user.email;
        if (authStatus) authStatus.textContent = 'Signed In';
    } else {
        console.log('No user is signed in');
        // Update UI for signed-out user
        const userEmail = document.getElementById('user-email');
        const authStatus = document.getElementById('auth-status');
        if (userEmail) userEmail.textContent = 'Not signed in';
        if (authStatus) authStatus.textContent = 'Signed Out';
        // Only redirect to index if we're not already on the auth page
        if (!window.location.pathname.includes('auth.html')) {
            window.location.href = 'index.html';
        }
    }
});

// Sign out function
export function signOut() {
    auth.signOut().then(() => {
        console.log('User signed out');
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error('Error signing out:', error);
    });
} 