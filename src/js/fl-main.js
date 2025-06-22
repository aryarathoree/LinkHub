import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    collection, 
    doc, 
    getDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    getDocs, 
    addDoc,
    updateDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// DOM Elements
const opportunitiesGrid = document.querySelector('.opportunities-grid');
const searchInput = document.querySelector('.search-bar input');
const categoryFilter = document.querySelector('.filter-select:first-child');
const experienceFilter = document.querySelector('.filter-select:last-child');
const searchBtn = document.querySelector('.search-btn');
const logoutBtn = document.getElementById('logout-btn');
const viewProfileBtn = document.getElementById('view-profile-btn');

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Check if profile exists
            const profileDoc = await getDoc(doc(db, 'freelancer_profiles', user.uid));
            const profileBtn = document.querySelector('.nav-button');
            
            if (profileDoc.exists()) {
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
        const q = query(
            collection(db, 'posted_work'),
            where('status', '==', 'open'),
            orderBy('postedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
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
    card.dataset.experience = work.experienceLevel || 'not-specified'; // Add experience level to card data
    
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
    const currentUser = auth.currentUser;
    if (currentUser) {
        // Check if user has a profile
        getDoc(doc(db, 'freelancer_profiles', currentUser.uid))
            .then(async profileDoc => {
                if (!profileDoc.exists) {
                    applyBtn.disabled = true;
                    applyBtn.style.backgroundColor = '#666';
                    applyBtn.title = 'Create a profile to apply';
                } else {
                    // Check if already applied
                    const applicationsQuery = query(
                        collection(db, 'work_applications'),
                        where('workId', '==', id),
                        where('freelancerId', '==', currentUser.uid)
                    );
                    const applicationsSnapshot = await getDocs(applicationsQuery);
                    if (!applicationsSnapshot.empty) {
                        applyBtn.disabled = true;
                        applyBtn.textContent = 'Applied';
                        applyBtn.style.backgroundColor = '#666';
                    }
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
    const currentUser = auth.currentUser;
    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }

    try {
        // Check if user has a profile
        const profileDoc = await getDoc(doc(db, 'freelancer_profiles', currentUser.uid));
        if (!profileDoc.exists()) {
            alert('Please create a profile before applying.');
            window.location.href = 'fl-profile.html';
            return;
        }

        // Check if already applied
        const applicationsQuery = query(
            collection(db, 'work_applications'),
            where('workId', '==', workId),
            where('freelancerId', '==', currentUser.uid)
        );
        const applicationsSnapshot = await getDocs(applicationsQuery);
        
        if (!applicationsSnapshot.empty) {
            alert('You have already applied for this opportunity.');
            return;
        }

        // Show proposal modal
        showProposalModal(workId, work);
    } catch (error) {
        console.error('Error checking application status:', error);
        alert('Error checking application status. Please try again.');
    }
}

// Show proposal modal
function showProposalModal(workId, work) {
    const proposalModal = document.getElementById('proposal-modal');
    const proposalJobTitle = document.getElementById('proposal-job-title');
    const proposalJobBudget = document.getElementById('proposal-job-budget');
    const proposalJobDeadline = document.getElementById('proposal-job-deadline');
    const proposalText = document.getElementById('proposal-text');
    const proposalCharCount = document.getElementById('proposal-char-count');

    // Populate job details
    proposalJobTitle.textContent = work.title;
    proposalJobBudget.textContent = work.budget;
    proposalJobDeadline.textContent = work.deadline;

    // Clear previous proposal
    proposalText.value = '';
    proposalCharCount.textContent = '0';

    // Show modal
    proposalModal.style.display = 'block';
    proposalModal.classList.add('show');

    // Store work data for submission
    proposalModal.dataset.workId = workId;
    proposalModal.dataset.workData = JSON.stringify(work);

    // Focus on textarea
    proposalText.focus();
}

// Handle proposal submission
async function submitProposal(workId, work, proposal) {
    try {
        // Create application
        const application = {
            workId,
            freelancerId: auth.currentUser.uid,
            hirerId: work.postedBy,
            status: 'pending',
            appliedAt: serverTimestamp(),
            proposal: proposal,
            budget: work.budget,
            deadline: work.deadline
        };

        await addDoc(collection(db, 'work_applications'), application);
        
        // Update the applications count in the posted_work document
        const workRef = doc(db, 'posted_work', workId);
        const currentApplications = work.applications || 0;
        await updateDoc(workRef, {
            applications: currentApplications + 1
        });
        
        alert('Application submitted successfully!');
        closeProposalModal();
    } catch (error) {
        console.error('Error submitting application:', error);
        alert('Error submitting application. Please try again.');
    }
}

// Close proposal modal
function closeProposalModal() {
    const proposalModal = document.getElementById('proposal-modal');
    proposalModal.style.display = 'none';
    proposalModal.classList.remove('show');
    
    // Clear stored data
    delete proposalModal.dataset.workId;
    delete proposalModal.dataset.workData;
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
        await auth.signOut();
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
    const user = auth.currentUser;

    if (!user) {
        applicationsGrid.innerHTML = '<p class="error">Please sign in to view your applications.</p>';
        return;
    }

    try {
        applicationsGrid.innerHTML = '<p class="loading">Loading applications...</p>';

        // Subscribe to real-time updates for applications
        const q = query(
            collection(db, 'work_applications'),
            where('freelancerId', '==', user.uid)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
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
                        const workDoc = await getDoc(doc(db, 'posted_work', application.workId));
                        if (workDoc.exists()) {
                            const workData = workDoc.data();
                            return {
                                ...application,
                                workTitle: workData.title,
                                workDescription: workData.description,
                                workCategory: workData.category,
                                workBudget: workData.budget,
                                workDeadline: workData.deadline,
                                workExperienceLevel: workData.experienceLevel,
                                workPostedByName: workData.postedByName,
                                workPostedAt: workData.postedAt,
                                workApplications: workData.applications || 0
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
    
    // Get hirer data
    const hirerId = application.hirerId || application.postedBy;
    
    card.innerHTML = `
        <div class="application-header">
            <div class="job-info">
                <h4>${application.workTitle || 'Untitled Work'}</h4>
                <p class="applied-date">Applied: ${appliedDate}</p>
            </div>
            <div class="header-actions">
                <span class="status-badge status-${application.status}">${application.status}</span>
                <button class="toggle-details-btn" data-application-id="${id}">
                    <span class="toggle-icon">▼</span>
                    <span class="toggle-text">View Details</span>
                </button>
            </div>
        </div>
        <div class="application-details collapsed" id="details-${id}">
            <div class="job-details">
                <h5>Job Details:</h5>
                <div class="job-info-grid">
                    <div class="job-info-item">
                        <strong>Category:</strong> ${application.workCategory || 'Not specified'}
                    </div>
                    <div class="job-info-item">
                        <strong>Experience Level:</strong> ${application.workExperienceLevel || 'Not specified'}
                    </div>
                    <div class="job-info-item">
                        <strong>Budget:</strong> $${application.workBudget || 'Not specified'}
                    </div>
                    <div class="job-info-item">
                        <strong>Deadline:</strong> ${application.workDeadline || 'Not specified'}
                    </div>
                    <div class="job-info-item">
                        <strong>Posted by:</strong> ${application.workPostedByName || 'Unknown Hirer'}
                    </div>
                    <div class="job-info-item">
                        <strong>Total Applications:</strong> ${application.workApplications || 0} proposals
                    </div>
                </div>
            </div>
            <div class="job-description">
                <h5>Job Description:</h5>
                <p>${application.workDescription || 'No description available'}</p>
            </div>
            <div class="proposal-section">
                <h5>Your Proposal:</h5>
                <p>${application.proposal || application.message || 'No proposal provided'}</p>
            </div>
        </div>
        <div class="application-actions">
            ${application.status === 'pending' ? `
                <button class="action-button edit-button" data-id="${id}">Edit</button>
                <button class="action-button delete-button" data-id="${id}">Delete</button>
            ` : ''}
            <button class="action-button chat-button" data-hirer-id="${hirerId}" data-hirer-name="${application.workPostedByName || 'Unknown Hirer'}">Chat</button>
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
    if (chatBtn) {
        chatBtn.addEventListener('click', () => {
            const hirerId = chatBtn.dataset.hirerId;
            const hirerName = chatBtn.dataset.hirerName;
            if (hirerId && hirerName) {
                openChat(hirerId, hirerName);
            } else {
                console.error('Missing hirer data:', { hirerId, hirerName });
                alert('Error: Unable to start chat. Missing recipient information.');
            }
        });
    }

    // Add toggle functionality
    const toggleBtn = card.querySelector('.toggle-details-btn');
    const detailsSection = card.querySelector('.application-details');
    const toggleIcon = card.querySelector('.toggle-icon');
    const toggleText = card.querySelector('.toggle-text');

    if (toggleBtn && detailsSection) {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = detailsSection.classList.contains('collapsed');
            
            if (isCollapsed) {
                // Expand
                detailsSection.classList.remove('collapsed');
                toggleIcon.textContent = '▲';
                toggleText.textContent = 'Hide Details';
                toggleBtn.classList.add('expanded');
            } else {
                // Collapse
                detailsSection.classList.add('collapsed');
                toggleIcon.textContent = '▼';
                toggleText.textContent = 'View Details';
                toggleBtn.classList.remove('expanded');
            }
        });
    }

    return card;
}

// Edit application
async function editApplication(applicationId) {
    try {
        const applicationRef = doc(db, 'work_applications', applicationId);
        const applicationDoc = await getDoc(applicationRef);
        
        if (!applicationDoc.exists) {
            throw new Error('Application not found');
        }

        const application = applicationDoc.data();

        if (!auth.currentUser || application.freelancerId !== auth.currentUser.uid) {
            throw new Error('You do not have permission to edit this application');
        }

        if (application.status !== 'pending') {
            throw new Error('Can only edit pending applications');
        }

        // Get freelancer profile for current values
        const profileDoc = await getDoc(doc(db, 'freelancer_profiles', auth.currentUser.uid));
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
                updatedAt: new Date()
            };

            try {
                await updateDoc(applicationRef, updatedData);
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
        const applicationRef = doc(db, 'work_applications', applicationId);
        const applicationDoc = await getDoc(applicationRef);
        
        if (!applicationDoc.exists) {
            throw new Error('Application not found');
        }

        const application = applicationDoc.data();

        if (!auth.currentUser || application.freelancerId !== auth.currentUser.uid) {
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
        const workRef = doc(db, 'posted_work', application.workId);
        batch.update(workRef, {
            applications: increment(-1)
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

    const currentUser = auth.currentUser;
    if (!currentUser) {
        alert('Please sign in to chat');
        return;
    }

    // Validate hirer data
    if (!hirerId || typeof hirerId !== 'string' || !hirerName || typeof hirerName !== 'string') {
        console.error('Invalid hirer data:', { hirerId, hirerName });
        alert('Error: Invalid chat recipient data');
        return;
    }

    try {
        // Verify hirer exists
        const hirerDoc = await getDoc(doc(db, 'hirer_profiles', hirerId));
        if (!hirerDoc.exists()) {
            console.error('Hirer profile not found:', hirerId);
            alert('Error: Chat recipient not found');
            return;
        }

        // Find or create chat
        const chatQuery = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', currentUser.uid),
            where('hirerId', '==', hirerId)
        );
        const chatSnapshot = await getDocs(chatQuery);

        let chatId;
        if (chatSnapshot.empty) {
            // Create new chat
            const chatRef = await addDoc(collection(db, 'chats'), {
                participants: [currentUser.uid, hirerId],
                createdAt: new Date(),
                lastMessage: null,
                lastMessageTime: null,
                freelancerName: currentUser.displayName || 'Freelancer',
                hirerName: hirerName,
                hirerId: hirerId
            });
            chatId = chatRef.id;
        } else {
            chatId = chatSnapshot.docs[0].id;
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
    const currentUser = auth.currentUser;

    if (!currentUser) {
        chatMessages.innerHTML = '<p class="error">Please sign in to view messages.</p>';
        return;
    }

    try {
        chatMessages.innerHTML = '<p class="loading">Loading messages...</p>';

        // Subscribe to messages
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
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
    const currentUser = auth.currentUser;

    if (!message || !currentUser || !chatId) return;

    try {
        // Add message to Firestore
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text: message,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || 'Freelancer',
            timestamp: new Date()
        });

        // Update chat's last message
        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: message,
            lastMessageTime: new Date()
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
            const docRef = doc(db, 'hirer_profiles', hirerId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
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

// Proposal modal event listeners
document.addEventListener('DOMContentLoaded', function() {
    const proposalModal = document.getElementById('proposal-modal');
    const proposalForm = document.getElementById('proposal-form');
    const proposalText = document.getElementById('proposal-text');
    const proposalCharCount = document.getElementById('proposal-char-count');
    const closeProposalBtn = document.getElementById('close-proposal');
    const cancelProposalBtn = document.getElementById('cancel-proposal');

    // Character count for proposal textarea
    proposalText.addEventListener('input', function() {
        const count = this.value.length;
        proposalCharCount.textContent = count;
        
        // Change color when approaching limit
        if (count > 1800) {
            proposalCharCount.style.color = '#f44336';
        } else if (count > 1500) {
            proposalCharCount.style.color = '#ff9800';
        } else {
            proposalCharCount.style.color = 'var(--text-secondary)';
        }
    });

    // Handle proposal form submission
    proposalForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const proposal = proposalText.value.trim();
        if (!proposal) {
            alert('Please write a proposal before submitting.');
            return;
        }

        if (proposal.length > 2000) {
            alert('Proposal is too long. Please keep it under 2000 characters.');
            return;
        }

        const workId = proposalModal.dataset.workId;
        const workData = JSON.parse(proposalModal.dataset.workData);
        
        submitProposal(workId, workData, proposal);
    });

    // Close modal when clicking close button
    closeProposalBtn.addEventListener('click', closeProposalModal);

    // Close modal when clicking cancel button
    cancelProposalBtn.addEventListener('click', closeProposalModal);

    // Close modal when clicking outside
    proposalModal.addEventListener('click', function(e) {
        if (e.target === proposalModal) {
            closeProposalModal();
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && proposalModal.style.display === 'block') {
            closeProposalModal();
        }
    });
}); 