// Remove imports and use global firebase object
const db = firebase.firestore();

// DOM Elements
const opportunitiesGrid = document.querySelector('.opportunities-grid');
const searchInput = document.querySelector('.search-bar input');
const categoryFilter = document.querySelector('.filter-select:first-child');
const experienceFilter = document.querySelector('.filter-select:last-child');
const searchBtn = document.querySelector('.search-btn');
const logoutBtn = document.getElementById('logout-btn');
const viewProfileBtn = document.getElementById('view-profile-btn');

// Check if user is logged in
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // Check if profile exists
            const profileDoc = await db.collection('freelancer_profiles').doc(user.uid).get();
            const profileBtn = document.querySelector('.nav-button');
            
            if (profileDoc.exists) {
                // Update profile button text
                if (profileBtn) {
                    profileBtn.textContent = 'Edit Profile';
                    profileBtn.href = 'fl-profile.html';
                }
                
                // Enable all apply buttons
                document.querySelectorAll('.apply-btn').forEach(btn => {
                    btn.disabled = false;
                    btn.style.backgroundColor = '';
                });
            } else {
                // Update profile button text
                if (profileBtn) {
                    profileBtn.textContent = 'Create Profile';
                    profileBtn.href = 'fl-profile.html';
                }
                
                // Disable all apply buttons
                document.querySelectorAll('.apply-btn').forEach(btn => {
                    btn.disabled = true;
                    btn.style.backgroundColor = '#666';
                    btn.title = 'Create a profile to apply';
                });
            }
            
            // Load opportunities
            loadOpportunities();
        } catch (error) {
            console.error('Error checking profile:', error);
        }
    } else {
        window.location.href = 'auth.html';
    }
});

// Load opportunities with real-time updates
async function loadOpportunities() {
    try {
        const q = db.collection('posted_work')
            .where('status', '==', 'open')
            .orderBy('postedAt', 'desc');

        const unsubscribe = q.onSnapshot((snapshot) => {
            opportunitiesGrid.innerHTML = '';
            
            if (snapshot.empty) {
                opportunitiesGrid.innerHTML = '<p class="no-opportunities">No opportunities available at the moment.</p>';
                return;
            }

            // Convert to array and filter out example posts
            const opportunities = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(work => !work.isExample);

            if (opportunities.length === 0) {
                opportunitiesGrid.innerHTML = '<p class="no-opportunities">No opportunities available at the moment.</p>';
                return;
            }

            opportunities.forEach(work => {
                const opportunityCard = createOpportunityCard(work.id, work);
                opportunitiesGrid.appendChild(opportunityCard);
            });
        }, (error) => {
            console.error('Error in real-time updates:', error);
            opportunitiesGrid.innerHTML = '<p class="error">Error loading opportunities. Please refresh the page.</p>';
        });

        // Store unsubscribe function for cleanup
        window.addEventListener('beforeunload', () => {
            unsubscribe();
        });
    } catch (error) {
        console.error('Error loading opportunities:', error);
        opportunitiesGrid.innerHTML = '<p class="error">Error loading opportunities. Please refresh the page.</p>';
    }
}

// Create opportunity card with enhanced UI
function createOpportunityCard(id, work) {
    const card = document.createElement('div');
    card.className = 'opportunity-card';
    card.dataset.experience = work.experienceLevel || 'entry'; // Add experience level to card data
    
    const postedDate = work.postedAt ? new Date(work.postedAt.toDate()).toLocaleDateString() : 'N/A';
    const timeAgo = work.postedAt ? getTimeAgo(work.postedAt.toDate()) : 'N/A';
    
    card.innerHTML = `
        <div class="card-header">
            <h3>${work.title}</h3>
            <div class="company-info">
                <span class="company clickable" data-hirer-id="${work.postedBy}">${work.postedByName}</span>
                <span class="posted-time">${timeAgo}</span>
            </div>
        </div>
        <div class="card-body">
            <p class="description">${work.description}</p>
            <div class="tags">
                <span class="tag">${work.category}</span>
                <span class="experience-tag">${work.experienceLevel || 'Entry Level'}</span>
                <span class="applications">${work.applications || 0} proposals</span>
            </div>
            <div class="details">
                <div class="budget">
                    <i class="fas fa-dollar-sign"></i>
                    <span>$${work.budget}</span>
                </div>
                <div class="deadline">
                    <i class="far fa-clock"></i>
                    <span>Deadline: ${work.deadline}</span>
                </div>
            </div>
        </div>
        <div class="card-footer">
            <button class="apply-btn" data-id="${id}">Apply Now</button>
        </div>
    `;

    // Add click handler for apply button
    const applyBtn = card.querySelector('.apply-btn');
    applyBtn.addEventListener('click', () => handleApply(id, work));

    // Check if user has already applied
    const currentUser = firebase.auth().currentUser;
    if (currentUser) {
        // Check if user has a profile
        db.collection('freelancer_profiles').doc(currentUser.uid).get()
            .then(profileDoc => {
                if (!profileDoc.exists) {
                    applyBtn.disabled = true;
                    applyBtn.style.backgroundColor = '#666';
                    applyBtn.title = 'Create a profile to apply';
                } else {
                    // Check if already applied
                    db.collection('work_applications')
                        .where('workId', '==', id)
                        .where('freelancerId', '==', currentUser.uid)
                        .get()
                        .then(snapshot => {
                            if (!snapshot.empty) {
                                applyBtn.disabled = true;
                                applyBtn.textContent = 'Applied';
                                applyBtn.style.backgroundColor = '#666';
                            }
                        })
                        .catch(error => console.error('Error checking application status:', error));
                }
            })
            .catch(error => console.error('Error checking profile:', error));
    }

    return card;
}

// Helper function to get time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';
    
    return Math.floor(seconds) + ' seconds ago';
}

// Handle apply button click
async function handleApply(workId, work) {
    if (!firebase.auth().currentUser) {
        alert('Please sign in to apply for work');
        window.location.href = 'index.html';
        return;
    }

    try {
        // Check if user has a profile
        const profileDoc = await db.collection('freelancer_profiles').doc(firebase.auth().currentUser.uid).get();
        if (!profileDoc.exists) {
            alert('Please create your profile before applying for work.');
            window.location.href = 'fl-profile.html';
            return;
        }

        const profileData = profileDoc.data();
        
        // Check if profile is complete
        if (!profileData.basicInfo || !profileData.basicInfo.name) {
            alert('Please complete your profile with your name before applying for work.');
            window.location.href = 'fl-profile.html';
            return;
        }

        // Check if already applied
        const existingApplication = await db.collection('work_applications')
            .where('workId', '==', workId)
            .where('freelancerId', '==', firebase.auth().currentUser.uid)
            .get();

        if (!existingApplication.empty) {
            alert('You have already applied for this job.');
            return;
        }

        // Create and show application modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Apply for ${work.title}</h2>
                <form id="application-form">
                    <div class="form-group">
                        <label for="application-message">Your Message:</label>
                        <textarea id="application-message" required placeholder="Describe why you're a good fit for this role..."></textarea>
                    </div>
                    <div class="form-group">
                        <label for="hourly-rate">Your Hourly Rate ($):</label>
                        <input type="number" id="hourly-rate" required min="1" step="0.01" value="${profileData.basicInfo?.hourlyRate || ''}" placeholder="Enter your hourly rate">
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="cyber-button">Submit Application</button>
                        <button type="button" class="cancel-button">Cancel</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('show');

        // Handle form submission
        const form = modal.querySelector('#application-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const message = document.getElementById('application-message').value;
            const hourlyRate = parseFloat(document.getElementById('hourly-rate').value);

            // Create application data
            const applicationData = {
                workId,
                workTitle: work.title,
                freelancerId: firebase.auth().currentUser.uid,
                freelancerName: profileData.basicInfo.name,
                postedBy: work.postedBy,
                postedByName: work.postedByName,
                freelancerProfile: {
                    skills: profileData.skills || [],
                    experience: profileData.technicalSkills || [],
                    hourlyRate: hourlyRate,
                    description: profileData.basicInfo?.description || '',
                    name: profileData.basicInfo.name
                },
                status: 'pending',
                appliedAt: firebase.firestore.FieldValue.serverTimestamp(),
                message: message
            };

            try {
                // Add application to Firestore
                const applicationRef = await db.collection('work_applications').add(applicationData);
                console.log('Application submitted with ID:', applicationRef.id);

                // Update applications count in the work post
                await db.collection('posted_work').doc(workId).update({
                    applications: firebase.firestore.FieldValue.increment(1)
                });

                // Disable the apply button for this job
                const applyBtn = document.querySelector(`.apply-btn[data-id="${workId}"]`);
                if (applyBtn) {
                    applyBtn.disabled = true;
                    applyBtn.textContent = 'Applied';
                    applyBtn.style.backgroundColor = '#666';
                }

                alert('Application submitted successfully!');
                modal.remove();
                
                // If we're on the applications tab, reload the applications
                if (document.querySelector('.tab-button[data-tab="applications"]').classList.contains('active')) {
                    loadApplications();
                }
            } catch (error) {
                console.error('Error submitting application:', error);
                alert('Error submitting application: ' + error.message);
            }
        });

        // Handle modal close
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = modal.querySelector('.cancel-button');
        
        const closeModal = () => {
            modal.remove();
        };

        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

    } catch (error) {
        console.error('Error applying for work:', error);
        alert('Error submitting application: ' + error.message);
    }
}

// Search and Filter Functionality
searchBtn.addEventListener('click', filterOpportunities);

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        filterOpportunities();
    }
});

// Filter functionality
categoryFilter.addEventListener('change', filterOpportunities);
experienceFilter.addEventListener('change', filterOpportunities);

function filterOpportunities() {
    const searchTerm = searchInput.value.toLowerCase();
    const category = categoryFilter.value;
    const experience = experienceFilter.value;

    // Get all opportunity cards
    const cards = document.querySelectorAll('.opportunity-card');

    cards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        const description = card.querySelector('.description').textContent.toLowerCase();
        const cardCategory = card.querySelector('.tag').textContent.toLowerCase();
        const cardExperience = card.dataset.experience || '';
        
        // Check if card matches search term
        const matchesSearch = !searchTerm || 
            title.includes(searchTerm) || 
            description.includes(searchTerm);
        
        // Check if card matches category
        const matchesCategory = !category || 
            cardCategory === category.toLowerCase();
        
        // Check if card matches experience level
        const matchesExperience = !experience || 
            cardExperience === experience.toLowerCase();
        
        // Show/hide card based on all filters
        card.style.display = (matchesSearch && matchesCategory && matchesExperience) ? 'block' : 'none';
    });
}

// Handle logout
logoutBtn.addEventListener('click', async () => {
    try {
        await firebase.auth().signOut();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Handle view profile
viewProfileBtn.addEventListener('click', () => {
    window.location.href = 'my-fl-profile.html';
});

// Tab switching
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and contents
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        document.getElementById(`${button.dataset.tab}-tab`).classList.add('active');
        
        // Load content based on active tab
        if (button.dataset.tab === 'applications') {
            loadApplications();
        } else {
            loadOpportunities();
        }
    });
});

// Add status filter event listener
document.getElementById('status-filter').addEventListener('change', loadApplications);

// Load applications
async function loadApplications() {
    console.log('Loading applications...');
    const applicationsGrid = document.querySelector('.applications-grid');
    const statusFilter = document.getElementById('status-filter');
    const user = firebase.auth().currentUser;

    if (!user) {
        applicationsGrid.innerHTML = '<p class="error">Please sign in to view your applications.</p>';
        return;
    }

    try {
        applicationsGrid.innerHTML = '<p class="loading">Loading applications...</p>';

        // Subscribe to real-time updates for applications
        const q = db.collection('work_applications')
            .where('freelancerId', '==', user.uid);

        const unsubscribe = q.onSnapshot(async (snapshot) => {
            if (snapshot.empty) {
                applicationsGrid.innerHTML = '<p class="no-applications">No applications found.</p>';
                return;
            }

            // Convert to array and sort by appliedAt
            const applications = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(app => app.status !== 'withdrawn')
                .sort((a, b) => {
                    const dateA = a.appliedAt?.toDate() || new Date(0);
                    const dateB = b.appliedAt?.toDate() || new Date(0);
                    return dateB - dateA;
                });

            // Filter by status if selected
            const selectedStatus = statusFilter.value;
            const filteredApplications = selectedStatus
                ? applications.filter(app => app.status === selectedStatus)
                : applications;

            if (filteredApplications.length === 0) {
                applicationsGrid.innerHTML = '<p class="no-applications">No applications found with the selected status.</p>';
                return;
            }

            // Fetch work details for each application
            const applicationsWithWorkDetails = await Promise.all(
                filteredApplications.map(async (application) => {
                    try {
                        const workDoc = await db.collection('posted_work').doc(application.workId).get();
                        if (workDoc.exists) {
                            const workData = workDoc.data();
                            return {
                                ...application,
                                workBudget: workData.budget,
                                workDeadline: workData.deadline
                            };
                        }
                        return application;
                    } catch (error) {
                        console.error('Error fetching work details:', error);
                        return application;
                    }
                })
            );

            applicationsGrid.innerHTML = '';
            applicationsWithWorkDetails.forEach(application => {
                const applicationCard = createApplicationCard(application.id, application);
                applicationsGrid.appendChild(applicationCard);
            });
        }, (error) => {
            console.error('Error in real-time updates:', error);
            applicationsGrid.innerHTML = '<p class="error">Error loading applications. Please refresh the page.</p>';
        });

        // Store unsubscribe function for cleanup
        window.addEventListener('beforeunload', () => {
            unsubscribe();
        });
    } catch (error) {
        console.error('Error loading applications:', error);
        applicationsGrid.innerHTML = '<p class="error">Error loading applications. Please try again.</p>';
    }
}

// Create application card
function createApplicationCard(id, application) {
    const card = document.createElement('div');
    card.className = 'application-card';
    
    const appliedDate = application.appliedAt ? new Date(application.appliedAt.toDate()).toLocaleDateString() : 'N/A';
    
    card.innerHTML = `
        <div class="application-header">
            <h4>${application.workTitle || 'Untitled Work'}</h4>
            <span class="status-badge status-${application.status}">${application.status}</span>
        </div>
        <div class="application-details">
            <p>Applied: ${appliedDate}</p>
            <p>Posted by: ${application.postedByName || 'Unknown'}</p>
            <p>Budget: $${application.workBudget || 'Not specified'}</p>
            <p>Deadline: ${application.workDeadline || 'Not specified'}</p>
            <p>Your Message: ${application.message || 'No message provided'}</p>
        </div>
        <div class="application-actions">
            ${application.status === 'pending' ? `
                <button class="action-button edit-button" data-id="${id}">Edit</button>
                <button class="action-button delete-button" data-id="${id}">Delete</button>
            ` : ''}
            <button class="action-button chat-button" data-id="${id}" data-hirer="${application.postedBy}" data-name="${application.postedByName}">Chat</button>
        </div>
    `;

    // Add event listeners
    if (application.status === 'pending') {
        const editBtn = card.querySelector('.edit-button');
        const deleteBtn = card.querySelector('.delete-button');
        if (editBtn) editBtn.addEventListener('click', () => editApplication(id));
        if (deleteBtn) deleteBtn.addEventListener('click', () => deleteApplication(id));
    }
    
    const chatBtn = card.querySelector('.chat-button');
    if (chatBtn) chatBtn.addEventListener('click', () => openChat(application.postedBy, application.postedByName));

    return card;
}

// Edit application
async function editApplication(applicationId) {
    try {
        const applicationRef = db.collection('work_applications').doc(applicationId);
        const applicationDoc = await applicationRef.get();
        
        if (!applicationDoc.exists) {
            throw new Error('Application not found');
        }

        const application = applicationDoc.data();

        if (!firebase.auth().currentUser || application.freelancerId !== firebase.auth().currentUser.uid) {
            throw new Error('You do not have permission to edit this application');
        }

        if (application.status !== 'pending') {
            throw new Error('Can only edit pending applications');
        }

        // Get freelancer profile for current values
        const profileDoc = await db.collection('freelancer_profiles').doc(firebase.auth().currentUser.uid).get();
        const profile = profileDoc.exists() ? profileDoc.data() : null;

        // Create edit form
        const editForm = document.createElement('form');
        editForm.innerHTML = `
            <h3>Edit Application</h3>
            <div class="form-group">
                <label for="edit-message">Message:</label>
                <textarea id="edit-message" required>${application.message || ''}</textarea>
            </div>
            <div class="form-group">
                <label for="edit-hourly-rate">Hourly Rate ($):</label>
                <input type="number" id="edit-hourly-rate" value="${profile?.hourlyRate || ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-experience">Experience (years):</label>
                <input type="number" id="edit-experience" value="${profile?.experience || ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-skills">Skills (comma-separated):</label>
                <input type="text" id="edit-skills" value="${profile?.skills?.join(', ') || ''}" required>
            </div>
            <div class="form-actions">
                <button type="submit">Save Changes</button>
                <button type="button" class="cancel-button">Cancel</button>
            </div>
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.appendChild(editForm);
        document.body.appendChild(modal);

        // Handle form submission
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const updatedData = {
                message: document.getElementById('edit-message').value,
                freelancerProfile: {
                    hourlyRate: parseFloat(document.getElementById('edit-hourly-rate').value),
                    experience: parseInt(document.getElementById('edit-experience').value),
                    skills: document.getElementById('edit-skills').value.split(',').map(s => s.trim())
                },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                await applicationRef.update(updatedData);
                modal.remove();
                alert('Application updated successfully');
            } catch (error) {
                console.error('Error updating application:', error);
                alert('Error updating application: ' + error.message);
            }
        });

        // Handle cancel
        editForm.querySelector('.cancel-button').addEventListener('click', () => {
            modal.remove();
        });

    } catch (error) {
        console.error('Error editing application:', error);
        alert('Error editing application: ' + error.message);
    }
}

// Delete application
async function deleteApplication(applicationId) {
    if (!confirm('Are you sure you want to delete this application?')) return;

    try {
        const applicationRef = db.collection('work_applications').doc(applicationId);
        const applicationDoc = await applicationRef.get();
        
        if (!applicationDoc.exists) {
            throw new Error('Application not found');
        }

        const application = applicationDoc.data();

        if (!firebase.auth().currentUser || application.freelancerId !== firebase.auth().currentUser.uid) {
            throw new Error('You do not have permission to delete this application');
        }

        if (application.status !== 'pending') {
            throw new Error('Can only delete pending applications');
        }

        // Create a batch to handle both the application deletion and work post update
        const batch = db.batch();

        // Delete the application
        batch.delete(applicationRef);

        // Decrement the applications count in the work post
        const workRef = db.collection('posted_work').doc(application.workId);
        batch.update(workRef, {
            applications: firebase.firestore.FieldValue.increment(-1)
        });

        await batch.commit();
        alert('Application deleted successfully');
    } catch (error) {
        console.error('Error deleting application:', error);
        alert('Error deleting application: ' + error.message);
    }
}

// Ensure chat modal is hidden on page load
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('chat-modal').classList.remove('show');
});

// Open chat with hirer
async function openChat(hirerId, hirerName) {
    const chatModal = document.getElementById('chat-modal');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');

    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        alert('Please sign in to chat');
        return;
    }

    if (!hirerId || !hirerName) {
        console.error('Invalid hirer data:', { hirerId, hirerName });
        alert('Error: Invalid chat recipient data');
        return;
    }

    try {
        // Find or create chat
        const chatQuery = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .where('hirerId', '==', hirerId)
            .get();

        let chatId;
        if (chatQuery.empty) {
            // Create new chat
            const chatRef = await db.collection('chats').add({
                freelancerId: currentUser.uid,
                hirerId: hirerId,
                participants: [currentUser.uid, hirerId],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: null,
                lastMessageTime: null,
                freelancerName: currentUser.displayName || 'Freelancer',
                hirerName: hirerName
            });
            chatId = chatRef.id;
        } else {
            chatId = chatQuery.docs[0].id;
        }

        // Store chat ID for message sending
        chatForm.dataset.chatId = chatId;
        document.getElementById('chat-hirer-name').textContent = hirerName;
        chatModal.classList.add('show');

        // Load messages
        await loadMessages(chatId);
    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error opening chat. Please try again.');
    }
}

// Load chat messages
async function loadMessages(chatId) {
    const chatMessages = document.getElementById('chat-messages');
    const currentUser = firebase.auth().currentUser;

    if (!currentUser) {
        chatMessages.innerHTML = '<p class="error">Please sign in to view messages.</p>';
        return;
    }

    try {
        chatMessages.innerHTML = '<p class="loading">Loading messages...</p>';

        // Subscribe to messages
        const q = db.collection('chats').doc(chatId).collection('messages').orderBy('timestamp', 'asc');

        const unsubscribe = q.onSnapshot((snapshot) => {
            chatMessages.innerHTML = '';
            
            if (snapshot.empty) {
                chatMessages.innerHTML = '<p class="no-messages">No messages yet. Start the conversation!</p>';
                return;
            }

            snapshot.forEach(doc => {
                const message = doc.data();
                const messageElement = document.createElement('div');
                messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                
                const timestamp = message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString() : 'N/A';
                
                messageElement.innerHTML = `
                    <div class="message-content">
                        <p>${message.text}</p>
                        <span class="message-time">${timestamp}</span>
                    </div>
                `;
                
                chatMessages.appendChild(messageElement);
            });

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, (error) => {
            console.error('Error loading messages:', error);
            chatMessages.innerHTML = '<p class="error">Error loading messages. Please try again.</p>';
        });

        // Store unsubscribe function for cleanup
        window.addEventListener('beforeunload', () => {
            unsubscribe();
        });
    } catch (error) {
        console.error('Error loading messages:', error);
        chatMessages.innerHTML = '<p class="error">Error loading messages. Please try again.</p>';
    }
}

// Handle chat form submission
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const chatId = e.target.dataset.chatId;
    const messageInput = document.getElementById('chat-message');
    const message = messageInput.value.trim();
    const currentUser = firebase.auth().currentUser;

    if (!message || !currentUser || !chatId) return;

    try {
        // Add message to Firestore
        await db.collection('chats').doc(chatId).collection('messages').add({
            text: message,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || 'Freelancer',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update chat's last message
        await db.collection('chats').doc(chatId).update({
            lastMessage: message,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Clear input
        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message. Please try again.');
    }
});

// Close chat modal when clicking outside
window.addEventListener('click', (e) => {
    const chatModal = document.getElementById('chat-modal');
    if (e.target === chatModal) {
        chatModal.classList.remove('show');
    }
});

// Close chat modal when clicking close button
document.querySelector('#chat-modal .close').addEventListener('click', () => {
    document.getElementById('chat-modal').classList.remove('show');
});

// Company profile click handler
document.addEventListener('click', async function(e) {
    if (e.target.classList.contains('company') && e.target.dataset.hirerId) {
        const hirerId = e.target.dataset.hirerId;
        const modal = document.getElementById('company-profile-modal');
        const content = document.getElementById('company-profile-content');
        
        // Show loading state
        content.querySelector('#company-profile-name').textContent = 'Loading...';
        content.querySelector('#company-profile-description').textContent = '';
        content.querySelector('#company-profile-website').textContent = '';
        content.querySelector('#company-profile-website').href = '#';
        content.querySelector('#company-profile-location').textContent = '';
        content.querySelector('#company-profile-industry').textContent = '';

        modal.classList.add('show');

        try {
            const doc = await db.collection('hirer_profiles').doc(hirerId).get();
            if (doc.exists) {
                const data = doc.data();
                content.querySelector('#company-profile-name').textContent = data.companyName || 'N/A';
                content.querySelector('#company-profile-description').textContent = data.companyDescription || '';
                content.querySelector('#company-profile-website').textContent = data.companyWebsite || '';
                content.querySelector('#company-profile-website').href = data.companyWebsite || '#';
                content.querySelector('#company-profile-location').textContent = data.companyLocation || '';
                content.querySelector('#company-profile-industry').textContent = data.companyIndustry || '';
            } else {
                content.querySelector('#company-profile-name').textContent = 'Profile not found';
            }
        } catch (err) {
            console.error('Error loading company profile:', err);
            content.querySelector('#company-profile-name').textContent = 'Error loading profile';
        }
    }
});

// Close company profile modal
document.getElementById('close-company-profile').onclick = function() {
    document.getElementById('company-profile-modal').classList.remove('show');
}; 