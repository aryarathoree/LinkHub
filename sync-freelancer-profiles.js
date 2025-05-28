// sync-freelancer-profiles.js
// Usage: node sync-freelancer-profiles.js
// This script copies all documents from 'freelancer_profiles' to 'profiles' in Firestore.
// Make sure you have set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account key.

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
    });
}

const db = admin.firestore();

async function syncFreelancerProfiles() {
    const sourceCol = db.collection('freelancer_profiles');
    const destCol = db.collection('profiles');
    const snapshot = await sourceCol.get();
    console.log(`Found ${snapshot.size} freelancer_profiles to sync...`);
    let count = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        await destCol.doc(doc.id).set(data, { merge: false });
        count++;
        console.log(`Synced profile for UID: ${doc.id}`);
    }
    console.log(`Sync complete. ${count} profiles copied to 'profiles'.`);
}

syncFreelancerProfiles().catch(err => {
    console.error('Error syncing profiles:', err);
    process.exit(1);
}); 