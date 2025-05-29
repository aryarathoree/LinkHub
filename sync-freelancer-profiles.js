// sync-freelancer-profiles.js
// Usage: node sync-freelancer-profiles.js
// This script copies all documents from 'freelancer_profiles' to 'profiles' in Firestore.
// Make sure you have set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account key.

import { db } from './firebase-config.js';
import { collection, getDocs, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

async function syncProfiles() {
    try {
        const sourceCol = collection(db, 'freelancer_profiles');
        const destCol = collection(db, 'profiles');
        
        const snapshot = await getDocs(sourceCol);
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            await setDoc(doc(destCol, doc.id), data);
        }
        
        console.log('Profile sync completed successfully');
    } catch (error) {
        console.error('Error syncing profiles:', error);
    }
}

syncProfiles(); 