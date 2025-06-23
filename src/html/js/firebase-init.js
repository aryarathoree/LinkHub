// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB8UrXNtQzOC1CnoDDFFbPcURGOuXVbEIs",
    authDomain: "linkhub-172cf.firebaseapp.com",
    projectId: "linkhub-172cf",
    storageBucket: "linkhub-172cf.firebasestorage.app",
    messagingSenderId: "827745021850",
    appId: "1:827745021850:web:776587c4acd95a79a15423",
    measurementId: "G-G3X5HTZNPR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Configure Firestore settings
db.settings({
    cacheSizeBytes: 104857600, // 100 MB
    merge: true,
    experimentalForceLongPolling: true
});

// Enable persistence
const enablePersistence = async () => {
    try {
        await db.clearPersistence();
        await db.enablePersistence({
            synchronizeTabs: true
        });
        console.log('Firestore persistence enabled successfully');
    } catch (err) {
        if (err.code === 'failed-precondition') {
            console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code === 'unimplemented') {
            console.warn('The current browser does not support persistence.');
        } else {
            console.error('Error enabling persistence:', err);
        }
    }
};

// Initialize persistence
enablePersistence();

// Export Firebase services
export { app, analytics, auth, db, storage }; 