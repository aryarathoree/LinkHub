import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// Check authentication state
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // Redirect to index if not authenticated
        window.location.href = 'index.html';
    }
});

// Handle logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Add click handlers for navigation
document.addEventListener('DOMContentLoaded', () => {
    // Handle hire link
    const hireLink = document.getElementById('hire-link');
    if (hireLink) {
        hireLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (auth.currentUser) {
                console.log('User is logged in, navigating to hire.html');
                window.location.href = 'hire.html';
            } else {
                console.log('No user logged in, redirecting to index');
                alert('Please log in to access hiring features');
                window.location.href = 'index.html';
            }
        });
    }

    // Handle community link
    const communityLink = document.getElementById('community-link');
    if (communityLink) {
        communityLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (auth.currentUser) {
                console.log('User is logged in, navigating to com.html');
                window.location.href = 'com.html';
            } else {
                console.log('No user logged in, redirecting to index');
                alert('Please log in to access the community');
                window.location.href = 'index.html';
            }
        });
    }

    // Handle events link
    const eventsLink = document.querySelector('a[href="events.html"]');
    if (eventsLink) {
        eventsLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (auth.currentUser) {
                window.location.href = 'events.html';
            } else {
                alert('Please log in to access events');
                window.location.href = 'index.html';
            }
        });
    }

    // Handle freelancer link
    const freelancerLink = document.querySelector('a[href="fl-main.html"]');
    if (freelancerLink) {
        freelancerLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (auth.currentUser) {
                window.location.href = 'fl-main.html';
            } else {
                alert('Please log in to access freelancer features');
                window.location.href = 'index.html';
            }
        });
    }
}); 