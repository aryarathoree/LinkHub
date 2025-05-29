import { auth, db } from './firebase-config.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, addDoc, updateDoc, deleteDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// DOM Elements
const postWorkForm = document.getElementById('post-work-form');
const postedWorkList = document.getElementById('posted-work-list');
const profileBtn = document.getElementById('profile-btn');
const logoutBtn = document.getElementById('logout-btn');

// Modal Elements
const editWorkModal = document.getElementById('edit-work-modal');
const applicationsModal = document.getElementById('applications-modal');
const chatModal = document.getElementById('chat-modal');
const editWorkForm = document.getElementById('edit-work-form');
const applicationsList = document.getElementById('applications-list');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');

// Close buttons for modals
document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        if (editWorkModal) editWorkModal.style.display = 'none';
        if (applicationsModal) applicationsModal.style.display = 'none';
        if (chatModal) chatModal.style.display = 'none';
    });
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === editWorkModal && editWorkModal) editWorkModal.style.display = 'none';
    if (e.target === applicationsModal && applicationsModal) applicationsModal.style.display = 'none';
    if (e.target === chatModal && chatModal) chatModal.style.display = 'none';
});

// Check authentication state
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('User is signed in:', user.email);
        // Initialize the page for signed-in user
        initializePage(user);
    } else {
        console.log('No user is signed in');
        // Redirect to login page
        window.location.href = 'index.html';
    }
});

// Initialize the page
async function initializePage(user) {
    try {
        console.log('User is authenticated:', user.uid);
        
        try {
            // Check if profile exists
            const profileDoc = await getDoc(doc(db, 'hirer_profiles', user.uid));
            if (profileDoc.exists() && profileBtn) {
                profileBtn.textContent = 'Edit Profile';
            }
            
            // Load posted work
            if (postedWorkList) {
                await loadPostedWork(user.uid);
            }
        } catch (error) {
            console.error('Error checking profile:', error);
        }
    } catch (error) {
        console.error('Error initializing page:', error);
    }
}

// Handle work posting
if (postWorkForm) {
    postWorkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = auth.currentUser;
        if (!user) {
            alert('Please log in to post work');
            window.location.href = 'index.html';
            return;
        }

        // Check if hirer profile exists
        const profileDoc = await getDoc(doc(db, 'hirer_profiles', user.uid));
        if (!profileDoc.exists()) {
            alert('You must create your profile before posting a job.');
            window.location.href = 'hire-profile.html';
            return;
        }
        const profileData = profileDoc.data();

        const workData = {
            title: document.getElementById('work-title').value,
            description: document.getElementById('work-description').value,
            category: document.getElementById('work-category').value,
            budget: parseFloat(document.getElementById('work-budget').value),
            deadline: document.getElementById('work-deadline').value,
            postedBy: user.uid,
            postedByName: profileData.companyName || 'Anonymous',
            postedAt: serverTimestamp(),
            status: 'open',
            applications: 0,
            lastUpdated: serverTimestamp()
        };

        try {
            const docRef = await addDoc(collection(db, 'posted_work'), workData);
            console.log('Work posted successfully with ID:', docRef.id);
            postWorkForm.reset();
            await loadPostedWork(user.uid);
        } catch (error) {
            console.error('Error posting work:', error);
            alert('Error posting work. Please try again.');
        }
    });
}

// Handle work editing
if (editWorkForm) {
    editWorkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const workId = document.getElementById('edit-work-id').value;
        const workData = {
            title: document.getElementById('edit-work-title').value,
            description: document.getElementById('edit-work-description').value,
            category: document.getElementById('edit-work-category').value,
            budget: parseFloat(document.getElementById('edit-work-budget').value),
            deadline: document.getElementById('edit-work-deadline').value,
            updatedAt: serverTimestamp()
        };

        try {
            await updateDoc(doc(db, 'posted_work', workId), workData);
            editWorkModal.style.display = 'none';
            await loadPostedWork(auth.currentUser.uid);
        } catch (error) {
            console.error('Error updating work:', error);
            alert('Error updating work. Please try again.');
        }
    });
}

// Load posted work with real-time updates
async function loadPostedWork(userId) {
    try {
        // First try to get the data without real-time updates
        const q = query(
            collection(db, 'posted_work'),
            where('postedBy', '==', userId),
            orderBy('postedAt', 'desc')
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            postedWorkList.innerHTML = '<p class="no-work">No work posted yet.</p>';
            return;
        }

        // Display initial data
        postedWorkList.innerHTML = '';
        snapshot.forEach(doc => {
            const work = doc.data();
            const workCard = createWorkCard(doc.id, work);
            postedWorkList.appendChild(workCard);
        });

        // Then set up real-time listener
        try {
            const unsubscribe = onSnapshot(q, (snapshot) => {
                postedWorkList.innerHTML = '';
                
                if (snapshot.empty) {
                    postedWorkList.innerHTML = '<p class="no-work">No work posted yet.</p>';
                    return;
                }

                snapshot.forEach(doc => {
                    const work = doc.data();
                    const workCard = createWorkCard(doc.id, work);
                    postedWorkList.appendChild(workCard);
                });
            }, (error) => {
                console.error('Error in real-time updates:', error);
                // Don't show error to user since we already have the data
            });

            // Store unsubscribe function for cleanup
            window.currentWorkListener = unsubscribe;
        } catch (listenerError) {
            console.error('Error setting up real-time listener:', listenerError);
            // Don't show error to user since we already have the data
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (window.currentWorkListener) {
                window.currentWorkListener();
            }
        });

    } catch (error) {
        console.error('Error loading posted work:', error);
        postedWorkList.innerHTML = `
            <div class="error-container">
                <p class="error">Error loading work: ${error.message}</p>
                <button onclick="window.location.reload()" class="retry-button">
                    <i class="fas fa-sync-alt"></i> Refresh Page
                </button>
            </div>
        `;
    }
}

// Create work card element
function createWorkCard(id, work) {
    const card = document.createElement('div');
    card.className = 'work-card';
    
    const postedDate = work.postedAt ? new Date(work.postedAt.toDate()).toLocaleDateString() : 'N/A';
    
    card.innerHTML = `
        <h3>${work.title}</h3>
        <p class="company">Company: ${work.postedByName || 'N/A'}</p>
        <p>${work.description}</p>
        <p class="category">Category: ${work.category}</p>
        <p class="budget">Budget: $${work.budget}</p>
        <p class="deadline">Deadline: ${work.deadline}</p>
        <p class="posted-date">Posted: ${postedDate}</p>
        <p class="status">Status: ${work.status}</p>
        <div class="work-actions">
            <button class="action-button edit-button" data-id="${id}">Edit</button>
            <button class="action-button delete-button" data-id="${id}">Delete</button>
            <button class="action-button view-applications-button" data-id="${id}" data-title="${work.title}">View Applications</button>
        </div>
    `;

    // Add event listeners for buttons
    card.querySelector('.edit-button').addEventListener('click', () => openEditModal(id, work));
    card.querySelector('.delete-button').addEventListener('click', () => deleteWork(id));
    card.querySelector('.view-applications-button').addEventListener('click', () => {
        const button = card.querySelector('.view-applications-button');
        openApplicationsModal(id, button.dataset.title);
    });
    
    return card;
}

// Open edit modal
async function openEditModal(workId, work) {
    document.getElementById('edit-work-id').value = workId;
    document.getElementById('edit-work-title').value = work.title;
    document.getElementById('edit-work-description').value = work.description;
    document.getElementById('edit-work-category').value = work.category;
    document.getElementById('edit-work-budget').value = work.budget;
    document.getElementById('edit-work-deadline').value = work.deadline;
    editWorkModal.style.display = 'block';
}

// Delete work
async function deleteWork(workId) {
    if (!confirm('Are you sure you want to delete this work post? This will also delete all associated applications.')) {
        return;
    }

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('You must be logged in to delete a work post');
        }

        // First, get the work post document to verify ownership
        const workRef = doc(db, 'posted_work', workId);
        const workDoc = await getDoc(workRef);

        if (!workDoc.exists()) {
            throw new Error('Work post not found');
        }

        const workData = workDoc.data();
        
        // Verify ownership
        if (workData.postedBy !== user.uid) {
            throw new Error('You do not have permission to delete this work post');
        }

        // Delete all applications for this work post
        const applicationsSnapshot = await getDocs(query(
            collection(db, 'work_applications'),
            where('workId', '==', workId)
        ));

        const batch = db.batch();
        applicationsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Delete the work post
        batch.delete(workRef);

        // Commit the batch
        await batch.commit();
        console.log('Work post and associated applications deleted successfully');
        await loadPostedWork(user.uid);
    } catch (error) {
        console.error('Error deleting work:', error);
        alert(error.message || 'Error deleting work post. Please try again.');
    }
}

// Add showError function at the top with other utility functions
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    // Remove error message after 3 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

// Update loadApplications function to use correct Firestore syntax
async function loadApplications(workId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            showError('Please sign in to view applications');
            return;
        }

        // Get the work post to verify ownership
        const workDoc = await getDoc(doc(db, 'posted_work', workId));
        if (!workDoc.exists()) {
            showError('Work post not found');
            return;
        }

        const workData = workDoc.data();
        if (workData.postedBy !== user.uid) {
            showError('You can only view applications for your own work posts');
            return;
        }

        // Query applications for this work (removed orderBy to avoid index requirement)
        const applicationsQuery = query(
            collection(db, 'work_applications'),
            where('workId', '==', workId)
        );

        // Set up real-time listener
        const unsubscribe = onSnapshot(applicationsQuery, async (snapshot) => {
            const applications = [];
            
            // First, collect all applications
            snapshot.forEach(doc => {
                applications.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Then fetch all freelancer profiles
            const freelancerPromises = applications.map(application => 
                getDoc(doc(db, 'freelancer_profiles', application.freelancerId))
            );

            try {
                const freelancerSnapshots = await Promise.all(freelancerPromises);
                
                // Map freelancer data to applications
                applications.forEach((application, index) => {
                    const freelancerDoc = freelancerSnapshots[index];
                    if (freelancerDoc && freelancerDoc.exists()) {
                        application.freelancerProfile = freelancerDoc.data();
                    }
                });

                // Sort applications: pending first, then by date (client-side sorting)
                applications.sort((a, b) => {
                    // First sort by status (pending first)
                    if (a.status === 'pending' && b.status !== 'pending') return -1;
                    if (a.status !== 'pending' && b.status === 'pending') return 1;
                    
                    // Then sort by timestamp (newest first)
                    const timestampA = a.timestamp?.toDate?.() || new Date(0);
                    const timestampB = b.timestamp?.toDate?.() || new Date(0);
                    return timestampB - timestampA;
                });

                displayApplications(applications);
            } catch (error) {
                console.error('Error fetching freelancer profiles:', error);
                showError('Error loading freelancer profiles');
            }
        }, error => {
            console.error('Error loading applications:', error);
            showError('Error loading applications');
        });

        // Store unsubscribe function for cleanup
        window.currentApplicationsListener = unsubscribe;
    } catch (error) {
        console.error('Error in loadApplications:', error);
        showError('Error loading applications');
    }
}

// Add displayApplications function if it doesn't exist
function displayApplications(applications) {
    applicationsList.innerHTML = '';
    
    if (applications.length === 0) {
        applicationsList.innerHTML = '<p class="no-applications">No applications yet.</p>';
        return;
    }

    applications.forEach(application => {
        const applicationCard = createApplicationCard(application.id, application);
        applicationsList.appendChild(applicationCard);
    });
}

// Create application card element with enhanced details
function createApplicationCard(id, application) {
    const card = document.createElement('div');
    card.className = 'application-card';
    
    const appliedDate = application.appliedAt ? new Date(application.appliedAt.toDate()).toLocaleDateString() : 'N/A';
    const statusClass = `status-${application.status.toLowerCase()}`;
    
    // Get freelancer profile data safely
    const freelancerProfile = application.freelancerProfile || {};
    const skills = freelancerProfile.skills || [];
    const experience = freelancerProfile.experience || 'Not specified';
    const bio = freelancerProfile.bio || 'Not specified';
    const name = freelancerProfile.name || 'Anonymous';
    const email = freelancerProfile.email || 'No email provided';
    
    card.innerHTML = `
        <div class="application-header">
            <div class="applicant-info">
                <h4>${name}</h4>
                <p class="applied-date">Applied: ${appliedDate}</p>
            </div>
            <span class="status-badge ${statusClass}">${application.status}</span>
        </div>
        <div class="application-details">
            <div class="skills-section">
                <h5>Skills:</h5>
                <div class="skills-list">
                    ${skills.length > 0 
                        ? skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')
                        : '<span class="no-skills">No skills specified</span>'
                    }
                </div>
            </div>
            <div class="experience-section">
                <h5>Experience:</h5>
                <p>${experience}</p>
            </div>
            <div class="bio-section">
                <h5>Bio:</h5>
                <p>${bio}</p>
            </div>
            <div class="proposal-section">
                <h5>Proposal:</h5>
                <p>${application.message || 'No proposal provided'}</p>
            </div>
        </div>
        <div class="application-actions">
            <button class="action-button view-profile-button" data-id="${application.freelancerId}">
                <i class="fas fa-user"></i> View Profile
            </button>
            <button class="action-button chat-button" data-id="${application.freelancerId}" data-name="${name}">
                <i class="fas fa-comments"></i> Chat
            </button>
            <select class="status-select" data-id="${id}">
                <option value="pending" ${application.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="accepted" ${application.status === 'accepted' ? 'selected' : ''}>Accept</option>
                <option value="rejected" ${application.status === 'rejected' ? 'selected' : ''}>Reject</option>
            </select>
        </div>
    `;

    // Add event listeners
    card.querySelector('.view-profile-button').addEventListener('click', () => loadApplicantProfile(application.freelancerId));
    card.querySelector('.chat-button').addEventListener('click', () => openChat(application.freelancerId, name));
    card.querySelector('.status-select').addEventListener('change', (e) => updateApplicationStatus(id, e.target.value));
    
    return card;
}

// Update application status with real-time feedback
async function updateApplicationStatus(applicationId, newStatus) {
    try {
        const applicationRef = doc(db, 'work_applications', applicationId);
        await updateDoc(applicationRef, {
            status: newStatus,
            updatedAt: serverTimestamp()
        });

        // Show success message
        const statusMessage = document.createElement('div');
        statusMessage.className = 'status-message success';
        statusMessage.textContent = `Application ${newStatus} successfully`;
        document.body.appendChild(statusMessage);

        // Remove message after 3 seconds
        setTimeout(() => {
            statusMessage.remove();
        }, 3000);
    } catch (error) {
        console.error('Error updating application status:', error);
        
        // Show error message
        const statusMessage = document.createElement('div');
        statusMessage.className = 'status-message error';
        statusMessage.textContent = 'Error updating application status';
        document.body.appendChild(statusMessage);

        // Remove message after 3 seconds
        setTimeout(() => {
            statusMessage.remove();
        }, 3000);
    }
}

// Open applications modal
function openApplicationsModal(workId, workTitle) {
    const modalTitle = document.querySelector('#applications-modal h2');
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="fas fa-users"></i> Applications for: ${workTitle}`;
    }
    applicationsModal.style.display = 'block';
    loadApplications(workId);
}

// Open chat with freelancer
async function openChat(freelancerId, freelancerName) {
    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('You must be logged in to chat');
        }

        // Create a unique chat ID (sorted IDs to ensure consistency)
        const chatId = [user.uid, freelancerId].sort().join('_');
        
        // Check if chat document exists
        const chatRef = doc(db, 'chats', chatId);
        const chatDoc = await getDoc(chatRef);
        
        if (!chatDoc.exists()) {
            // Create new chat document
            await setDoc(chatRef, {
                participants: [user.uid, freelancerId],
                participantNames: [user.displayName || 'Anonymous', freelancerName],
                createdAt: serverTimestamp(),
                lastMessage: null,
                lastMessageTime: null
            });
        }

        // Update UI
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            chatTitle.textContent = `Chat with ${freelancerName}`;
        }
        
        const chatModal = document.getElementById('chat-modal');
        if (chatModal) {
            chatModal.style.display = 'block';
        }
        
        // Load messages
        await loadMessages(chatId);
        
        // Set up real-time message listener
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const unsubscribe = onSnapshot(messagesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const message = change.doc.data();
                    appendMessage(message);
                }
            });
            // Scroll to bottom
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        });

        // Store unsubscribe function for cleanup
        window.currentChatListener = unsubscribe;

        // Set up chat form submission
        const chatForm = document.getElementById('chat-form');
        if (chatForm) {
            chatForm.onsubmit = async (e) => {
                e.preventDefault();
                const messageInput = document.getElementById('message-input');
                if (!messageInput) return;
                
                const message = messageInput.value.trim();
                if (!message) return;

                try {
                    // Add message to subcollection
                    await addDoc(collection(db, 'chats', chatId, 'messages'), {
                        text: message,
                        senderId: user.uid,
                        senderName: user.displayName || 'Anonymous',
                        timestamp: serverTimestamp()
                    });

                    // Update last message in chat document
                    await updateDoc(chatRef, {
                        lastMessage: message,
                        lastMessageTime: serverTimestamp()
                    });

                    messageInput.value = '';
                } catch (error) {
                    console.error('Error sending message:', error);
                    showError('Error sending message. Please try again.');
                }
            };
        }
    } catch (error) {
        console.error('Error opening chat:', error);
        showError(error.message || 'Error opening chat. Please try again.');
    }
}

// Load chat messages
async function loadMessages(chatId) {
    try {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        chatMessages.innerHTML = '';
        
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));
        const messagesSnapshot = await getDocs(messagesQuery);
        
        if (messagesSnapshot.empty) {
            chatMessages.innerHTML = '<p class="no-messages">No messages yet. Start the conversation!</p>';
            return;
        }

        messagesSnapshot.forEach(doc => {
            const message = doc.data();
            appendMessage(message);
        });

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error loading messages:', error);
        showError('Error loading messages. Please try again.');
    }
}

// Append message to chat
function appendMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === auth.currentUser.uid ? 'sent' : 'received'}`;
    
    const timestamp = message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString() : 'N/A';
    
    messageElement.innerHTML = `
        <div class="message-content">
            <p class="message-text">${message.text}</p>
            <p class="message-time">${timestamp}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageElement);
}

// Load applicant profile
const loadApplicantProfile = async (applicantId) => {
    try {
        const profileDoc = await getDoc(doc(db, 'profiles', applicantId));
        
        if (!profileDoc.exists()) {
            showError('Profile not found');
            return;
        }

        const profile = profileDoc.data();
        console.log('Profile data:', profile); // Debug log
        
        // Create and show profile modal
        const profileModal = document.createElement('div');
        profileModal.className = 'modal';
        profileModal.innerHTML = `
            <div class="modal-content profile-modal">
                <span class="close">&times;</span>
                <div class="profile-header">
                    <h2>${profile.basicInfo?.name || 'Anonymous'}</h2>
                    <p class="profession">${profile.basicInfo?.profession || 'Not specified'}</p>
                </div>
                
                <div class="profile-section">
                    <h3>Professional Summary</h3>
                    <p>${profile.basicInfo?.description || 'No description provided'}</p>
                </div>

                <div class="profile-section">
                    <h3>Skills</h3>
                    <div class="skills-container">
                        ${(profile.skills || []).map(skill => 
                            `<span class="skill-tag">${skill}</span>`
                        ).join('') || '<p>No skills specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Technical Skills</h3>
                    <div class="tech-skills-container">
                        ${(profile.technicalSkills || []).map(skill => 
                            `<div class="tech-skill-item">
                                <span class="skill-name">${skill.skill}</span>
                                <span class="skill-proficiency">${skill.proficiency}</span>
                            </div>`
                        ).join('') || '<p>No technical skills specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Education</h3>
                    <div class="education-container">
                        ${(profile.education || []).map(edu => 
                            `<div class="education-item">
                                <h4>${edu.degree}</h4>
                                <p>${edu.institution} - ${edu.year}</p>
                            </div>`
                        ).join('') || '<p>No education specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Projects</h3>
                    <div class="projects-container">
                        ${(profile.projects || []).map(project => 
                            `<div class="project-item">
                                <h4>${project.name}</h4>
                                <p>${project.description}</p>
                                <a href="${project.link}" target="_blank" class="project-link">View Project</a>
                            </div>`
                        ).join('') || '<p>No projects specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Achievements</h3>
                    <div class="achievements-container">
                        ${(profile.achievements || []).map(achievement => 
                            `<div class="achievement-item">
                                <p>${achievement}</p>
                            </div>`
                        ).join('') || '<p>No achievements specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Social Links</h3>
                    <div class="social-links">
                        ${profile.github ? `
                            <a href="${profile.github}" target="_blank" class="social-link">
                                <i class="fab fa-github"></i> GitHub
                            </a>
                        ` : ''}
                        ${profile.linkedin ? `
                            <a href="${profile.linkedin}" target="_blank" class="social-link">
                                <i class="fab fa-linkedin"></i> LinkedIn
                            </a>
                        ` : ''}
                        ${!profile.github && !profile.linkedin ? '<p>No social links provided</p>' : ''}
                    </div>
                </div>

                <div class="profile-actions">
                    <button class="action-button chat-button" onclick="openChat('${applicantId}', '${profile.basicInfo?.name || 'Anonymous'}')">
                        <i class="fas fa-comments"></i> Start Chat
                    </button>
                </div>
            </div>
        `;

        // Add styles for the profile modal
        const style = document.createElement('style');
        style.textContent = `
            .profile-modal {
                max-width: 800px;
                max-height: 90vh;
                overflow-y: auto;
            }

            .profile-header {
                text-align: center;
                margin-bottom: 2rem;
                padding-bottom: 1rem;
                border-bottom: 2px solid var(--neon-pink);
            }

            .profile-header .profession {
                color: var(--neon-pink);
                font-size: 1.2em;
                margin: 0.5rem 0;
            }

            .profile-section {
                margin-bottom: 2rem;
                padding: 1rem;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                border: 1px solid rgba(255, 42, 109, 0.2);
            }

            .profile-section h3 {
                color: var(--neon-pink);
                margin-bottom: 1rem;
                font-family: 'Orbitron', sans-serif;
            }

            .skills-container, .tech-skills-container {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
            }

            .skill-tag {
                background: rgba(255, 42, 109, 0.1);
                color: var(--neon-pink);
                padding: 0.5rem 1rem;
                border-radius: 20px;
                border: 1px solid var(--neon-pink);
            }

            .tech-skill-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.5rem;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 4px;
                margin-bottom: 0.5rem;
            }

            .skill-proficiency {
                color: var(--neon-pink);
            }

            .education-item, .project-item, .achievement-item {
                margin-bottom: 1rem;
                padding: 1rem;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                border: 1px solid rgba(255, 42, 109, 0.1);
            }

            .project-link {
                display: inline-block;
                margin-top: 0.5rem;
                color: var(--neon-pink);
                text-decoration: none;
            }

            .project-link:hover {
                text-decoration: underline;
            }

            .social-links {
                display: flex;
                gap: 1rem;
                justify-content: center;
            }

            .social-link {
                color: var(--neon-pink);
                text-decoration: none;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 1rem;
                border: 1px solid var(--neon-pink);
                border-radius: 20px;
                transition: all 0.3s ease;
            }

            .social-link:hover {
                background: rgba(255, 42, 109, 0.1);
                transform: translateY(-2px);
            }

            .profile-actions {
                display: flex;
                justify-content: center;
                margin-top: 2rem;
                padding-top: 1rem;
                border-top: 2px solid var(--neon-pink);
            }

            .chat-button {
                background: var(--neon-pink);
                color: white;
                border: none;
                padding: 1rem 2rem;
                border-radius: 25px;
                cursor: pointer;
                font-family: 'Orbitron', sans-serif;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                transition: all 0.3s ease;
            }

            .chat-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 0 20px var(--neon-pink);
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(profileModal);
        profileModal.style.display = 'block';

        // Close modal when clicking the X or outside the modal
        const closeBtn = profileModal.querySelector('.close');
        closeBtn.onclick = () => {
            profileModal.remove();
            style.remove();
        };
        window.onclick = (e) => {
            if (e.target === profileModal) {
                profileModal.remove();
                style.remove();
            }
        };
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Error loading profile. Please try again.');
    }
};

// Handle logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await auth.signOut();
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Error signing out:', error);
            alert('Error signing out. Please try again.');
        }
    });
} 