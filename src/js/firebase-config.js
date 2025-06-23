// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export the Firebase instances
export { app, auth, db, storage }; 