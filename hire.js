// Remove imports and use global firebase object
const db = firebase.firestore();

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
        editWorkModal.style.display = 'none';
        applicationsModal.style.display = 'none';
        chatModal.style.display = 'none';
    });
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === editWorkModal) editWorkModal.style.display = 'none';
    if (e.target === applicationsModal) applicationsModal.style.display = 'none';
    if (e.target === chatModal) chatModal.style.display = 'none';
});

// Check if user is logged in
firebase.auth().onAuthStateChanged(async (user) => {
    try {
        if (!user) {
            console.log('No user found, redirecting to index');
            window.location.href = 'index.html';
            return;
        }

        console.log('User is authenticated:', user.uid);
        
        // Add a small delay to ensure Firebase is fully initialized
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            // Check if profile exists
            const profileDoc = await db.collection('hirer_profiles').doc(user.uid).get();
            if (profileDoc.exists) {
                profileBtn.textContent = 'Edit Profile';
            }
            
            // Load posted work
            await loadPostedWork(user.uid);
        } catch (dbError) {
            console.error('Database error:', dbError);
            postedWorkList.innerHTML = '<p class="error">Error loading data. Please refresh the page.</p>';
        }
    } catch (error) {
        console.error('Error in auth state change:', error);
        if (error.code && error.code.startsWith('auth/')) {
            alert('Authentication error. Please log in again.');
            window.location.href = 'index.html';
        } else {
            alert('An error occurred. Please try again.');
        }
    }
});

// Handle work posting
if (postWorkForm) {
    postWorkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = firebase.auth().currentUser;
        if (!user) {
            alert('Please log in to post work');
            window.location.href = 'index.html';
            return;
        }

        // Check if hirer profile exists
        const profileDoc = await db.collection('hirer_profiles').doc(user.uid).get();
        if (!profileDoc.exists) {
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
            postedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'open',
            applications: 0,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const docRef = await db.collection('posted_work').add(workData);
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
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('posted_work').doc(workId).update(workData);
            editWorkModal.style.display = 'none';
            await loadPostedWork(firebase.auth().currentUser.uid);
        } catch (error) {
            console.error('Error updating work:', error);
            alert('Error updating work. Please try again.');
        }
    });
}

// Load posted work with real-time updates
async function loadPostedWork(userId) {
    try {
        const unsubscribe = db.collection('posted_work')
            .where('postedBy', '==', userId)
            .orderBy('postedAt', 'desc')
            .onSnapshot((snapshot) => {
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
                postedWorkList.innerHTML = '<p class="error">Error loading work. Please refresh the page.</p>';
            });

        // Store unsubscribe function for cleanup
        window.addEventListener('beforeunload', () => {
            unsubscribe();
        });
    } catch (error) {
        console.error('Error loading posted work:', error);
        postedWorkList.innerHTML = '<p class="error">Error loading work. Please refresh the page.</p>';
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
            <button class="action-button view-applications-button" data-id="${id}">View Applications</button>
        </div>
    `;

    // Add event listeners for buttons
    card.querySelector('.edit-button').addEventListener('click', () => openEditModal(id, work));
    card.querySelector('.delete-button').addEventListener('click', () => deleteWork(id));
    card.querySelector('.view-applications-button').addEventListener('click', () => openApplicationsModal(id, work.title));
    
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
        const user = firebase.auth().currentUser;
        if (!user) {
            throw new Error('You must be logged in to delete a work post');
        }

        // First, get the work post document to verify ownership
        const workRef = db.collection('posted_work').doc(workId);
        const workDoc = await workRef.get();

        if (!workDoc.exists) {
            throw new Error('Work post not found');
        }

        const workData = workDoc.data();
        
        // Verify ownership
        if (workData.postedBy !== user.uid) {
            throw new Error('You do not have permission to delete this work post');
        }

        // Delete all applications for this work post
        const applicationsSnapshot = await db.collection('applications')
            .where('workId', '==', workId)
            .get();

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

// Load applications for a work post
async function loadApplications(workId) {
    try {
        const applicationsSnapshot = await db.collection('applications')
            .where('workId', '==', workId)
            .orderBy('appliedAt', 'desc')
            .get();

        applicationsList.innerHTML = '';
        
        if (applicationsSnapshot.empty) {
            applicationsList.innerHTML = '<p class="no-applications">No applications yet.</p>';
            return;
        }

        applicationsSnapshot.forEach(doc => {
            const application = doc.data();
            const applicationCard = createApplicationCard(doc.id, application);
            applicationsList.appendChild(applicationCard);
        });
    } catch (error) {
        console.error('Error loading applications:', error);
        applicationsList.innerHTML = '<p class="error">Error loading applications. Please try again.</p>';
    }
}

// Create application card element
function createApplicationCard(id, application) {
    const card = document.createElement('div');
    card.className = 'application-card';
    
    const appliedDate = application.appliedAt ? new Date(application.appliedAt.toDate()).toLocaleDateString() : 'N/A';
    
    card.innerHTML = `
        <div class="applicant-info">
            <h4>${application.applicantName}</h4>
            <p class="applied-date">Applied: ${appliedDate}</p>
        </div>
        <div class="application-details">
            <p>${application.message}</p>
            <p class="status">Status: ${application.status}</p>
        </div>
        <div class="application-actions">
            <button class="action-button view-profile-button" data-id="${application.applicantId}">View Profile</button>
            <button class="action-button chat-button" data-id="${application.applicantId}" data-name="${application.applicantName}">Chat</button>
            <select class="status-select" data-id="${id}">
                <option value="pending" ${application.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="accepted" ${application.status === 'accepted' ? 'selected' : ''}>Accept</option>
                <option value="rejected" ${application.status === 'rejected' ? 'selected' : ''}>Reject</option>
            </select>
        </div>
    `;

    // Add event listeners
    card.querySelector('.view-profile-button').addEventListener('click', () => loadApplicantProfile(application.applicantId));
    card.querySelector('.chat-button').addEventListener('click', () => openChat(application.applicantId, application.applicantName));
    card.querySelector('.status-select').addEventListener('change', (e) => updateApplicationStatus(id, e.target.value));
    
    return card;
}

// Update application status
async function updateApplicationStatus(applicationId, newStatus) {
    try {
        await db.collection('applications').doc(applicationId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating application status:', error);
        alert('Error updating application status. Please try again.');
    }
}

// Open applications modal
function openApplicationsModal(workId, workTitle) {
    document.getElementById('applications-title').textContent = `Applications for: ${workTitle}`;
    applicationsModal.style.display = 'block';
    loadApplications(workId);
}

// Open chat with freelancer
async function openChat(freelancerId, freelancerName) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            throw new Error('You must be logged in to chat');
        }

        // Create a unique chat ID (sorted IDs to ensure consistency)
        const chatId = [user.uid, freelancerId].sort().join('_');
        
        // Check if chat document exists
        const chatDoc = await db.collection('chats').doc(chatId).get();
        
        if (!chatDoc.exists) {
            // Create new chat document
            await db.collection('chats').doc(chatId).set({
                participants: [user.uid, freelancerId],
                participantNames: [user.displayName || 'Anonymous', freelancerName],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: null,
                lastMessageTime: null
            });
        }

        // Update UI
        document.getElementById('chat-title').textContent = `Chat with ${freelancerName}`;
        chatModal.style.display = 'block';
        
        // Load messages
        await loadMessages(chatId);
        
        // Set up real-time message listener
        const unsubscribe = db.collection('chats')
            .doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const message = change.doc.data();
                        appendMessage(message);
                    }
                });
                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            });

        // Store unsubscribe function for cleanup
        window.addEventListener('beforeunload', () => {
            unsubscribe();
        });

        // Set up chat form submission
        if (chatForm) {
            chatForm.onsubmit = async (e) => {
                e.preventDefault();
                const messageInput = document.getElementById('message-input');
                const message = messageInput.value.trim();
                
                if (!message) return;

                try {
                    await db.collection('chats')
                        .doc(chatId)
                        .collection('messages')
                        .add({
                            text: message,
                            senderId: user.uid,
                            senderName: user.displayName || 'Anonymous',
                            timestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });

                    // Update last message in chat document
                    await db.collection('chats').doc(chatId).update({
                        lastMessage: message,
                        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    messageInput.value = '';
                } catch (error) {
                    console.error('Error sending message:', error);
                    alert('Error sending message. Please try again.');
                }
            };
        }
    } catch (error) {
        console.error('Error opening chat:', error);
        alert(error.message || 'Error opening chat. Please try again.');
    }
}

// Load chat messages
async function loadMessages(chatId) {
    try {
        const messagesSnapshot = await db.collection('chats')
            .doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .get();

        chatMessages.innerHTML = '';
        
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
        chatMessages.innerHTML = '<p class="error">Error loading messages. Please try again.</p>';
    }
}

// Append message to chat
function appendMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === firebase.auth().currentUser.uid ? 'sent' : 'received'}`;
    
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
        const profileDoc = await db.collection('freelancer_profiles').doc(applicantId).get();
        
        if (!profileDoc.exists) {
            alert('Profile not found');
            return;
        }

        const profile = profileDoc.data();
        
        // Create and show profile modal
        const profileModal = document.createElement('div');
        profileModal.className = 'modal';
        profileModal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>${profile.name || 'Anonymous'}</h2>
                <div class="profile-details">
                    <p><strong>Skills:</strong> ${profile.skills?.join(', ') || 'Not specified'}</p>
                    <p><strong>Experience:</strong> ${profile.experience || 'Not specified'}</p>
                    <p><strong>Bio:</strong> ${profile.bio || 'Not specified'}</p>
                </div>
            </div>
        `;

        document.body.appendChild(profileModal);
        profileModal.style.display = 'block';

        // Close modal when clicking the X or outside the modal
        const closeBtn = profileModal.querySelector('.close');
        closeBtn.onclick = () => profileModal.remove();
        window.onclick = (e) => {
            if (e.target === profileModal) {
                profileModal.remove();
            }
        };
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Error loading profile. Please try again.');
    }
};

// Handle logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await firebase.auth().signOut();
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Error signing out:', error);
            alert('Error signing out. Please try again.');
        }
    });
} 