// Initialize Firestore
const db = firebase.firestore();

// DOM Elements
const profileForm = document.getElementById('profile-form');
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profileDate = document.getElementById('profile-date');
const logoutBtn = document.getElementById('logout-btn');

// Check if user is logged in
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        // Update profile info
        profileName.textContent = user.displayName || 'Not set';
        profileEmail.textContent = user.email;
        profileDate.textContent = new Date(user.metadata.creationTime).toLocaleDateString();

        // Load existing profile data
        const profileDoc = await db.collection('hirer_profiles').doc(user.uid).get();
        if (profileDoc.exists) {
            const profileData = profileDoc.data();
            document.getElementById('company-name').value = profileData.companyName || '';
            document.getElementById('company-description').value = profileData.companyDescription || '';
            document.getElementById('company-website').value = profileData.companyWebsite || '';
            document.getElementById('company-location').value = profileData.companyLocation || '';
            document.getElementById('company-industry').value = profileData.companyIndustry || 'technology';
        }
    } else {
        window.location.href = 'index.html';
    }
});

// Handle profile form submission
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = firebase.auth().currentUser;
    if (!user) return;

    const profileData = {
        companyName: document.getElementById('company-name').value,
        companyDescription: document.getElementById('company-description').value,
        companyWebsite: document.getElementById('company-website').value,
        companyLocation: document.getElementById('company-location').value,
        companyIndustry: document.getElementById('company-industry').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('hirer_profiles').doc(user.uid).set(profileData, { merge: true });
        alert('Profile updated successfully!');
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Error updating profile. Please try again.');
    }
});

// Handle logout
logoutBtn.addEventListener('click', async () => {
    try {
        await firebase.auth().signOut();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
}); 