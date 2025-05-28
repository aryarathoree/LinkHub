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
let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    
    // Enable offline persistence
    db.enablePersistence()
        .catch((err) => {
            if (err.code === 'failed-precondition') {
                console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
            } else if (err.code === 'unimplemented') {
                console.log('The current browser does not support persistence.');
            }
        });
} catch (error) {
    console.error("Firebase initialization error:", error);
}

// Check authentication state and load profile if exists
firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const profileDoc = await db.collection('freelancer_profiles').doc(user.uid).get();
        if (profileDoc.exists) {
            // Update page title and button text
            document.querySelector('.title').textContent = 'Edit Your Profile';
            document.querySelector('.submit-btn').textContent = 'Update Profile';
            
            // Load existing profile data
            const data = profileDoc.data();
            loadProfileData(data);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
});

// Load profile data into form
function loadProfileData(data) {
    // Basic Information
    document.getElementById('name').value = data.basicInfo.name;
    document.getElementById('profession').value = data.basicInfo.profession;
    document.getElementById('description').value = data.basicInfo.description;
    if (data.basicInfo.github) document.getElementById('github').value = data.basicInfo.github;
    if (data.basicInfo.linkedin) document.getElementById('linkedin').value = data.basicInfo.linkedin;

    // Skills
    const skillsList = document.getElementById('skills-list');
    skillsList.innerHTML = ''; // Clear existing skills
    data.skills.forEach(skill => {
        addSkillTag(skill);
    });

    // Education
    const educationList = document.getElementById('education-list');
    educationList.innerHTML = ''; // Clear existing entries
    data.education.forEach(edu => {
        const entry = createEducationEntry();
        entry.querySelector('[name="degree[]"]').value = edu.degree;
        entry.querySelector('[name="institution[]"]').value = edu.institution;
        entry.querySelector('[name="year[]"]').value = edu.year;
        educationList.appendChild(entry);
    });

    // Technical Skills
    const techSkillsList = document.getElementById('tech-skills-list');
    techSkillsList.innerHTML = ''; // Clear existing entries
    data.technicalSkills.forEach(skill => {
        const entry = createTechSkillEntry();
        entry.querySelector('[name="tech-skill[]"]').value = skill.skill;
        entry.querySelector('[name="proficiency[]"]').value = skill.proficiency;
        techSkillsList.appendChild(entry);
    });

    // Achievements
    const achievementsList = document.getElementById('achievements-list');
    achievementsList.innerHTML = ''; // Clear existing entries
    data.achievements.forEach(achievement => {
        const entry = createAchievementEntry();
        entry.querySelector('[name="achievement[]"]').value = achievement;
        achievementsList.appendChild(entry);
    });

    // Projects
    const projectsList = document.getElementById('projects-list');
    projectsList.innerHTML = ''; // Clear existing entries
    data.projects.forEach(project => {
        const entry = createProjectEntry();
        entry.querySelector('[name="project-name[]"]').value = project.name;
        entry.querySelector('[name="project-link[]"]').value = project.link;
        entry.querySelector('[name="project-description[]"]').value = project.description;
        projectsList.appendChild(entry);
    });
}

// Logout functionality
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await firebase.auth().signOut();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Skills Management
const skillsList = document.getElementById('skills-list');
const skillInput = document.querySelector('.skill-input');
const addSkillBtn = document.querySelector('.add-skill-btn');

// Add skill
addSkillBtn.addEventListener('click', () => {
    const skill = skillInput.value.trim();
    if (skill) {
        addSkillTag(skill);
        skillInput.value = '';
    }
});

// Add skill on Enter key
skillInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const skill = skillInput.value.trim();
        if (skill) {
            addSkillTag(skill);
            skillInput.value = '';
        }
    }
});

function addSkillTag(skill) {
    const skillTag = document.createElement('div');
    skillTag.className = 'skill-tag';
    skillTag.innerHTML = `
        ${skill}
        <button type="button" class="remove-skill">&times;</button>
    `;
    
    skillTag.querySelector('.remove-skill').addEventListener('click', () => {
        skillTag.remove();
    });
    
    skillsList.appendChild(skillTag);
}

// Dynamic Form Fields
const addEntryButtons = document.querySelectorAll('.add-entry-btn');

addEntryButtons.forEach(button => {
    button.addEventListener('click', () => {
        const section = button.dataset.section;
        const container = document.getElementById(`${section}-list`);
        
        let newEntry;
        switch(section) {
            case 'education':
                newEntry = createEducationEntry();
                break;
            case 'tech-skills':
                newEntry = createTechSkillEntry();
                break;
            case 'achievements':
                newEntry = createAchievementEntry();
                break;
            case 'projects':
                newEntry = createProjectEntry();
                break;
        }
        
        if (newEntry) {
            container.appendChild(newEntry);
        }
    });
});

function createEducationEntry() {
    const entry = document.createElement('div');
    entry.className = 'education-entry';
    entry.innerHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label>Degree</label>
                <input type="text" name="degree[]" required>
            </div>
            <div class="form-group">
                <label>Institution</label>
                <input type="text" name="institution[]" required>
            </div>
            <div class="form-group">
                <label>Year</label>
                <input type="text" name="year[]" required>
            </div>
            <div class="form-group">
                <button type="button" class="remove-entry-btn">Remove</button>
            </div>
        </div>
    `;
    
    entry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        entry.remove();
    });
    
    return entry;
}

function createTechSkillEntry() {
    const entry = document.createElement('div');
    entry.className = 'tech-skill-entry';
    entry.innerHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label>Skill</label>
                <input type="text" name="tech-skill[]" required>
            </div>
            <div class="form-group">
                <label>Proficiency</label>
                <select name="proficiency[]" required>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                </select>
            </div>
            <div class="form-group">
                <button type="button" class="remove-entry-btn">Remove</button>
            </div>
        </div>
    `;
    
    entry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        entry.remove();
    });
    
    return entry;
}

function createAchievementEntry() {
    const entry = document.createElement('div');
    entry.className = 'achievement-entry';
    entry.innerHTML = `
        <div class="form-group full-width">
            <label>Achievement</label>
            <textarea name="achievement[]" rows="2" required></textarea>
            <button type="button" class="remove-entry-btn">Remove</button>
        </div>
    `;
    
    entry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        entry.remove();
    });
    
    return entry;
}

function createProjectEntry() {
    const entry = document.createElement('div');
    entry.className = 'project-entry';
    entry.innerHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label>Project Name</label>
                <input type="text" name="project-name[]" required>
            </div>
            <div class="form-group">
                <label>Project Link</label>
                <input type="url" name="project-link[]" required>
            </div>
            <div class="form-group full-width">
                <label>Description</label>
                <textarea name="project-description[]" rows="2" required></textarea>
            </div>
            <div class="form-group">
                <button type="button" class="remove-entry-btn">Remove</button>
            </div>
        </div>
    `;
    
    entry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        entry.remove();
    });
    
    return entry;
}

// Handle form submission
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = firebase.auth().currentUser;
    if (!user) {
        alert('Please sign in to create a profile');
        window.location.href = 'index.html';
        return;
    }

    try {
        // Collect form data
        const github = document.getElementById('github').value;
        const linkedin = document.getElementById('linkedin').value;
        const formData = {
            basicInfo: {
                name: document.getElementById('name').value,
                profession: document.getElementById('profession').value,
                description: document.getElementById('description').value,
                github: github,
                linkedin: linkedin
            },
            github: github, // sync at root
            linkedin: linkedin, // sync at root
            skills: Array.from(document.querySelectorAll('.skill-tag')).map(tag => 
                tag.textContent.trim().replace('×', '').trim()
            ),
            education: Array.from(document.querySelectorAll('.education-entry')).map(entry => ({
                degree: entry.querySelector('[name="degree[]"]').value,
                institution: entry.querySelector('[name="institution[]"]').value,
                year: entry.querySelector('[name="year[]"]').value
            })),
            technicalSkills: Array.from(document.querySelectorAll('.tech-skill-entry')).map(entry => ({
                skill: entry.querySelector('[name="tech-skill[]"]').value,
                proficiency: entry.querySelector('[name="proficiency[]"]').value
            })),
            achievements: Array.from(document.querySelectorAll('.achievement-entry')).map(entry =>
                entry.querySelector('[name="achievement[]"]').value
            ),
            projects: Array.from(document.querySelectorAll('.project-entry')).map(entry => ({
                name: entry.querySelector('[name="project-name[]"]').value,
                link: entry.querySelector('[name="project-link[]"]').value,
                description: entry.querySelector('[name="project-description[]"]').value
            })),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Save to Firestore
        await db.collection('freelancer_profiles').doc(user.uid).set(formData, { merge: true });
        // Also save to profiles for display sync
        await db.collection('profiles').doc(user.uid).set(formData, { merge: true });

        // Show success notification
        const notification = document.getElementById('success-notification');
        notification.style.display = 'flex';
        
        // Redirect after a delay
        setTimeout(() => {
            window.location.href = 'fl-main.html';
        }, 2000);
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error saving profile. Please try again.');
    }
}); 