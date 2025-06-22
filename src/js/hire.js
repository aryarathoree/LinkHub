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
    const basicInfo = freelancerProfile.basicInfo || {};
    const skills = freelancerProfile.skills || [];
    const technicalSkills = freelancerProfile.technicalSkills || [];
    const professionalDescription = basicInfo.description || 'Not specified';
    const name = basicInfo.name || application.freelancerName || 'Anonymous';
    const email = application.freelancerEmail || 'No email provided';
    const education = freelancerProfile.education || [];
    const projects = freelancerProfile.projects || [];
    const achievements = freelancerProfile.achievements || [];
    const socialLinks = {
        github: freelancerProfile.basicInfo?.github || '',
        linkedin: freelancerProfile.basicInfo?.linkedin || '',
        portfolio: freelancerProfile.portfolio || ''
    };
    
    card.innerHTML = `
        <div class="application-header">
        <div class="applicant-info">
                <h4>${name}</h4>
            <p class="applied-date">Applied: ${appliedDate}</p>
            </div>
            <span class="status-badge ${statusClass}">${application.status}</span>
        </div>
        <div class="application-details">
            <div class="basic-info-section">
                <h5><i class="fas fa-user"></i> Basic Information</h5>
                <p><strong>Email:</strong> ${email}</p>
            </div>

            <div class="social-links-section">
                <h5><i class="fas fa-share-alt"></i> Social Links</h5>
                <div class="social-links">
                    ${socialLinks.github ? `
                        <a href="${socialLinks.github}" target="_blank" class="social-link">
                            <i class="fab fa-github"></i> GitHub
                        </a>
                    ` : ''}
                    ${socialLinks.linkedin ? `
                        <a href="${socialLinks.linkedin}" target="_blank" class="social-link">
                            <i class="fab fa-linkedin"></i> LinkedIn
                        </a>
                    ` : ''}
                    ${socialLinks.portfolio ? `
                        <a href="${socialLinks.portfolio}" target="_blank" class="social-link">
                            <i class="fas fa-globe"></i> Portfolio
                        </a>
                    ` : ''}
                    ${!socialLinks.github && !socialLinks.linkedin && !socialLinks.portfolio ? 
                        '<p>No social links provided</p>' : ''}
                </div>
            </div>

            <div class="professional-description-section">
                <h5><i class="fas fa-file-alt"></i> Professional Description</h5>
                <p>${professionalDescription}</p>
            </div>

            <div class="skills-section">
                <h5><i class="fas fa-tools"></i> Skills</h5>
                <div class="skills-list">
                    ${skills.length > 0 
                        ? skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')
                        : '<span class="no-skills">No skills specified</span>'
                    }
                </div>
            </div>

            <div class="technical-skills-section">
                <h5><i class="fas fa-code"></i> Technical Skills</h5>
                <div class="technical-skills-list">
                    ${technicalSkills.length > 0 
                        ? technicalSkills.map(skill => `
                            <div class="tech-skill-item">
                                <span class="skill-name">${skill.skill}</span>
                                <span class="skill-proficiency">${skill.proficiency}</span>
                            </div>
                        `).join('')
                        : '<p>No technical skills specified</p>'
                    }
                </div>
            </div>

            <div class="education-section">
                <h5><i class="fas fa-graduation-cap"></i> Education</h5>
                <div class="education-list">
                    ${education.length > 0 
                        ? education.map(edu => `
                            <div class="education-item">
                                <h6>${edu.degree}</h6>
                                <p>${edu.institution} - ${edu.year}</p>
                                ${edu.description ? `<p class="education-description">${edu.description}</p>` : ''}
                            </div>
                        `).join('')
                        : '<p>No education specified</p>'
                    }
                </div>
            </div>

            <div class="projects-section">
                <h5><i class="fas fa-project-diagram"></i> Projects</h5>
                <div class="projects-list">
                    ${projects.length > 0 
                        ? projects.map(project => `
                            <div class="project-item">
                                <h6>${project.name}</h6>
                                <p>${project.description}</p>
                                ${project.technologies ? `<p class="project-tech">Technologies: ${project.technologies.join(', ')}</p>` : ''}
                                ${project.link ? `<a href="${project.link}" target="_blank" class="project-link">View Project</a>` : ''}
                            </div>
                        `).join('')
                        : '<p>No projects specified</p>'
                    }
                </div>
            </div>

            <div class="achievements-section">
                <h5><i class="fas fa-trophy"></i> Achievements</h5>
                <div class="achievements-list">
                    ${achievements.length > 0 
                        ? achievements.map(achievement => `
                            <div class="achievement-item">
                                <p>${achievement}</p>
                            </div>
                        `).join('')
                        : '<p>No achievements specified</p>'
                    }
                </div>
            </div>

            <div class="proposal-section">
                <h5><i class="fas fa-file-alt"></i> Proposal</h5>
                <p>${application.message || 'No proposal provided'}</p>
            </div>
        </div>
        <div class="application-actions">
            <button class="action-button view-profile-button" data-id="${application.freelancerId}">
                <i class="fas fa-user"></i> View Profile
            </button>
            <button class="action-button chat-button" data-id="${application.freelancerId}" data-name="${name}" data-work-id="${application.workId}">
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
    card.querySelector('.chat-button').addEventListener('click', () => openChat(application.freelancerId, name, application.workId));
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
async function openChat(freelancerId, freelancerName, workId = null) {
    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('You must be logged in to chat');
        }

        if (!workId) {
            // If workId is not provided, try to find it from the application
            const applicationsQuery = query(
                collection(db, 'work_applications'),
                where('freelancerId', '==', freelancerId),
                where('status', 'in', ['pending', 'accepted'])
            );
            const applicationsSnapshot = await getDocs(applicationsQuery);
            if (!applicationsSnapshot.empty) {
                workId = applicationsSnapshot.docs[0].data().workId;
            } else {
                throw new Error('No active application found for this freelancer');
            }
        }

        // Find existing chat or create new one
        const chatQuery = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.uid),
            where('workId', '==', workId)
        );
        const chatSnapshot = await getDocs(chatQuery);
        
        let chatId;
        let chatDoc = null;
        
        // Check if chat already exists
        for (const doc of chatSnapshot.docs) {
            const data = doc.data();
            if (data.participants.includes(freelancerId)) {
                chatId = doc.id;
                chatDoc = data;
                break;
            }
        }
        
        if (!chatId) {
            // Get work details
            const workDoc = await getDoc(doc(db, 'posted_work', workId));
            if (!workDoc.exists()) {
                throw new Error('Work post not found');
            }
            const workData = workDoc.data();

            // Create new chat document
            const chatRef = await addDoc(collection(db, 'chats'), {
                participants: [user.uid, freelancerId],
                participantNames: [user.displayName || 'Anonymous', freelancerName],
                createdAt: serverTimestamp(),
                lastMessage: null,
                lastMessageTime: null,
                type: 'direct',
                workId: workId,
                workTitle: workData.title,
                workStatus: workData.status
            });
            chatId = chatRef.id;
        }

        // Update UI
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            const workTitle = chatDoc?.workTitle || 'Job';
            chatTitle.textContent = `Chat with ${freelancerName} - ${workTitle}`;
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
                const messageInput = document.getElementById('chat-message');
                if (!messageInput) return;
                
                const message = messageInput.value.trim();
                if (!message) return;

                try {
                    // Add message to subcollection
                    await addDoc(collection(db, 'chats', chatId, 'messages'), {
                        text: message,
                        senderId: user.uid,
                        senderName: user.displayName || 'Anonymous',
                        timestamp: serverTimestamp(),
                        workId: workId
                    });

                    // Update last message in chat document
                    await updateDoc(doc(db, 'chats', chatId), {
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
        // Get the freelancer profile
        const profileDoc = await getDoc(doc(db, 'freelancer_profiles', applicantId));
        
        if (!profileDoc.exists()) {
            showError('Profile not found');
            return;
        }

        const profile = profileDoc.data();

        // Get the application to get the email and workId
        const applicationsQuery = query(
            collection(db, 'work_applications'),
            where('freelancerId', '==', applicantId),
            where('status', 'in', ['pending', 'accepted'])
        );
        const applicationsSnapshot = await getDocs(applicationsQuery);
        let email = 'No email provided';
        let workId = null;
        
        if (!applicationsSnapshot.empty) {
            const application = applicationsSnapshot.docs[0].data();
            email = application.freelancerEmail || 'No email provided';
            workId = application.workId;
        }
        
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
                    <h3><i class="fas fa-envelope"></i> Contact Information</h3>
                    <p>${email}</p>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-share-alt"></i> Social Links</h3>
                    <div class="social-links">
                        ${profile.basicInfo?.github ? `
                            <a href="${profile.basicInfo.github}" target="_blank" class="social-link">
                                <i class="fab fa-github"></i> GitHub
                            </a>
                        ` : ''}
                        ${profile.basicInfo?.linkedin ? `
                            <a href="${profile.basicInfo.linkedin}" target="_blank" class="social-link">
                                <i class="fab fa-linkedin"></i> LinkedIn
                            </a>
                        ` : ''}
                        ${profile.portfolio ? `
                            <a href="${profile.portfolio}" target="_blank" class="social-link">
                                <i class="fas fa-globe"></i> Portfolio
                            </a>
                        ` : ''}
                        ${!profile.basicInfo?.github && !profile.basicInfo?.linkedin && !profile.portfolio ? '<p>No social links provided</p>' : ''}
                    </div>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-file-alt"></i> Professional Description</h3>
                    <p>${profile.basicInfo?.description || 'No description provided'}</p>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-tools"></i> Skills</h3>
                    <div class="skills-container">
                        ${(profile.skills || []).map(skill => 
                            `<span class="skill-tag">${skill}</span>`
                        ).join('') || '<p>No skills specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-code"></i> Technical Skills</h3>
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
                    <h3><i class="fas fa-graduation-cap"></i> Education</h3>
                    <div class="education-container">
                        ${(profile.education || []).map(edu => 
                            `<div class="education-item">
                                <h4>${edu.degree}</h4>
                                <p>${edu.institution} - ${edu.year}</p>
                                ${edu.description ? `<p class="education-description">${edu.description}</p>` : ''}
                            </div>`
                        ).join('') || '<p>No education specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-project-diagram"></i> Projects</h3>
                    <div class="projects-container">
                        ${(profile.projects || []).map(project => 
                            `<div class="project-item">
                                <h4>${project.name}</h4>
                                <p>${project.description}</p>
                                ${project.technologies ? `<p class="project-tech">Technologies: ${project.technologies.join(', ')}</p>` : ''}
                                ${project.link ? `<a href="${project.link}" target="_blank" class="project-link">View Project</a>` : ''}
                            </div>`
                        ).join('') || '<p>No projects specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-trophy"></i> Achievements</h3>
                    <div class="achievements-container">
                        ${(profile.achievements || []).map(achievement => 
                            `<div class="achievement-item">
                                <p>${achievement}</p>
                            </div>`
                        ).join('') || '<p>No achievements specified</p>'}
                    </div>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-briefcase"></i> Experience</h3>
                    <p>${profile.experience || 'No experience specified'}</p>
                </div>

                <div class="profile-section">
                    <h3><i class="fas fa-dollar-sign"></i> Hourly Rate</h3>
                    <p>$${profile.hourlyRate || 'Not specified'}/hour</p>
                </div>

                <div class="profile-actions">
                    <button class="action-button chat-button" onclick="openChat('${applicantId}', '${profile.basicInfo?.name || 'Anonymous'}', '${workId}')">
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
                padding: 1.5rem;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                border: 1px solid rgba(255, 42, 109, 0.2);
            }

            .profile-section h3 {
                color: var(--neon-pink);
                margin-bottom: 1rem;
                font-family: 'Orbitron', sans-serif;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .profile-section h3 i {
                font-size: 1.2rem;
            }

            .skills-container, .tech-skills-container {
                display: flex;
                flex-wrap: wrap;
                gap: 0.8rem;
            }

            .skill-tag {
                background: rgba(255, 42, 109, 0.1);
                color: var(--neon-pink);
                padding: 0.5rem 1rem;
                border-radius: 20px;
                border: 1px solid var(--neon-pink);
                transition: all 0.3s ease;
            }

            .skill-tag:hover {
                transform: translateY(-2px);
                box-shadow: 0 0 15px var(--neon-pink);
            }

            .tech-skill-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.8rem 1rem;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 4px;
                margin-bottom: 0.5rem;
                border: 1px solid var(--neon-pink);
            }

            .skill-proficiency {
                color: var(--neon-blue);
            }

            .education-item, .project-item, .achievement-item {
                margin-bottom: 1rem;
                padding: 1rem;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                border: 1px solid rgba(255, 42, 109, 0.1);
                transition: all 0.3s ease;
            }

            .education-item:hover, .project-item:hover, .achievement-item:hover {
                transform: translateY(-2px);
                box-shadow: 0 0 15px rgba(255, 42, 109, 0.2);
            }

            .project-link {
                display: inline-block;
                margin-top: 0.5rem;
                color: var(--neon-pink);
                text-decoration: none;
                transition: all 0.3s ease;
            }

            .project-link:hover {
                color: var(--neon-blue);
                text-shadow: 0 0 10px var(--neon-blue);
            }

            .social-links {
                display: flex;
                gap: 1rem;
                flex-wrap: wrap;
            }

            .social-link {
                color: var(--neon-pink);
                text-decoration: none;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.8rem 1.2rem;
                border: 1px solid var(--neon-pink);
                border-radius: 20px;
                transition: all 0.3s ease;
            }

            .social-link:hover {
                background: rgba(255, 42, 109, 0.1);
                transform: translateY(-2px);
                box-shadow: 0 0 15px var(--neon-pink);
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

            @media (max-width: 768px) {
                .profile-modal {
                    width: 95%;
                    margin: 1rem auto;
                }

                .social-links {
                    flex-direction: column;
                }

                .social-link {
                    width: 100%;
                    justify-content: center;
                }
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