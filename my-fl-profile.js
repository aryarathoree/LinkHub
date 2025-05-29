import { auth, db } from './firebase-config.js';
import { 
    doc, 
    getDoc, 
    updateDoc 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { 
    onAuthStateChanged,
    signOut 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// Firebase configuration
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
firebase.initializeApp(firebaseConfig);

// Check authentication state
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // If user is not authenticated, redirect to index page
        window.location.href = 'index.html';
    } else {
        // Load user profile data
        loadProfileData(user.uid);
    }
});

// Logout functionality
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Load profile data from Firestore
async function loadProfileData(userId) {
    try {
        const docRef = doc(db, 'profiles', userId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            displayProfileData(data);
        } else {
            console.log('No profile data found');
            // Redirect to profile creation if no profile exists
            window.location.href = 'fl-profile.html';
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Display profile data in the UI
function displayProfileData(data) {
    // Basic Information
    document.getElementById('profile-name').textContent = data.basicInfo.name;
    document.getElementById('profile-profession').textContent = data.basicInfo.profession;
    document.getElementById('profile-description').textContent = data.basicInfo.description;

    // Social Links
    const githubLink = document.getElementById('profile-github');
    const linkedinLink = document.getElementById('profile-linkedin');
    const github = data.github || (data.basicInfo && data.basicInfo.github);
    const linkedin = data.linkedin || (data.basicInfo && data.basicInfo.linkedin);

    if (github) {
        githubLink.href = github;
        githubLink.textContent = 'GitHub';
        githubLink.target = '_blank';
        githubLink.style.pointerEvents = '';
        githubLink.style.opacity = '';
    } else {
        githubLink.textContent = 'Not provided';
        githubLink.href = '#';
        githubLink.removeAttribute('target');
        githubLink.style.pointerEvents = 'none';
        githubLink.style.opacity = '0.5';
    }
    if (linkedin) {
        linkedinLink.href = linkedin;
        linkedinLink.textContent = 'LinkedIn';
        linkedinLink.target = '_blank';
        linkedinLink.style.pointerEvents = '';
        linkedinLink.style.opacity = '';
    } else {
        linkedinLink.textContent = 'Not provided';
        linkedinLink.href = '#';
        linkedinLink.removeAttribute('target');
        linkedinLink.style.pointerEvents = 'none';
        linkedinLink.style.opacity = '0.5';
    }

    // Skills
    const skillsList = document.getElementById('profile-skills');
    data.skills.forEach(skill => {
        const skillTag = document.createElement('div');
        skillTag.className = 'skill-tag';
        skillTag.textContent = skill;
        skillsList.appendChild(skillTag);
    });

    // Education
    const educationList = document.getElementById('profile-education');
    data.education.forEach(edu => {
        const eduItem = document.createElement('div');
        eduItem.className = 'resume-item';
        eduItem.innerHTML = `
            <h4>${edu.degree}</h4>
            <p>${edu.institution} - ${edu.year}</p>
        `;
        educationList.appendChild(eduItem);
    });

    // Technical Skills
    const techSkillsList = document.getElementById('profile-tech-skills');
    data.technicalSkills.forEach(skill => {
        const skillItem = document.createElement('div');
        skillItem.className = 'resume-item';
        skillItem.innerHTML = `
            <h4>${skill.skill}</h4>
            <p>Proficiency: ${skill.proficiency}</p>
        `;
        techSkillsList.appendChild(skillItem);
    });

    // Achievements
    const achievementsList = document.getElementById('profile-achievements');
    data.achievements.forEach(achievement => {
        const achievementItem = document.createElement('div');
        achievementItem.className = 'resume-item';
        achievementItem.innerHTML = `
            <p>${achievement}</p>
        `;
        achievementsList.appendChild(achievementItem);
    });

    // Projects
    const projectsList = document.getElementById('profile-projects');
    data.projects.forEach(project => {
        const projectItem = document.createElement('div');
        projectItem.className = 'resume-item';
        projectItem.innerHTML = `
            <h4>${project.name}</h4>
            <p>${project.description}</p>
            <a href="${project.link}" class="project-link" target="_blank">View Project</a>
        `;
        projectsList.appendChild(projectItem);
    });
} 