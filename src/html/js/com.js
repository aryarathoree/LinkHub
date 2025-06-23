import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, deleteDoc, addDoc, arrayRemove, arrayUnion, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream = null;
let peerConnection = null;
let currentCall = null;

// State
let currentUser = null;
let currentChat = null;
let currentChatType = null;
let messageListener = null;
let selectedParticipants = [];

// Function to show connection error
function showConnectionError(message = 'Connection error. Please check your internet connection and try again.') {
    // Remove any existing error message
    const existingError = document.querySelector('.connection-error');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'connection-error';
    errorDiv.innerHTML = `
        <div class="error-content">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Connection Blocked</h3>
            <p>${message}</p>
            <div class="error-steps">
                <h4>To fix this issue:</h4>
                <ol>
                    <li>Disable your ad blocker or privacy extension for this site</li>
                    <li>Allow connections to firestore.googleapis.com</li>
                    <li>Refresh the page</li>
            </ol>
            </div>
            <div class="error-actions">
                <button class="retry-btn" onclick="window.location.reload()">
                    <i class="fas fa-sync-alt"></i> Retry Connection
                </button>
                <button class="dismiss-btn" onclick="this.closest('.connection-error').remove()">
                    <i class="fas fa-times"></i> Dismiss
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(errorDiv);
}

// Update the connection error styles
const connectionErrorStyles = document.createElement('style');
connectionErrorStyles.textContent = `
    .connection-error {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        color: #fff;
        font-family: 'Orbitron', sans-serif;
    }
    .error-content {
        background: #1a1a1a;
        padding: 2rem;
        border-radius: 12px;
        max-width: 600px;
        border: 1px solid var(--neon-pink);
        box-shadow: 0 0 20px var(--neon-pink);
    }
    .error-content h3 {
        color: var(--neon-pink);
        margin-bottom: 1rem;
        font-size: 1.5em;
        text-shadow: 0 0 10px var(--neon-pink);
    }
    .error-content p {
        margin-bottom: 1.5rem;
        line-height: 1.5;
    }
    .error-steps {
        background: rgba(255, 0, 128, 0.1);
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
    }
    .error-steps h4 {
        color: var(--neon-pink);
        margin-bottom: 0.5rem;
    }
    .error-steps ol, .error-steps ul {
        margin: 0.5rem 0;
        padding-left: 1.5rem;
    }
    .error-steps li {
        margin: 0.5rem 0;
        line-height: 1.4;
    }
    .error-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
    }
    .retry-btn, .dismiss-btn {
        padding: 0.8rem 1.5rem;
        border: 1px solid var(--neon-pink);
        background: transparent;
        color: var(--neon-pink);
        border-radius: 25px;
        cursor: pointer;
        font-family: 'Orbitron', sans-serif;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .retry-btn:hover {
        background: var(--neon-pink);
        color: #fff;
        box-shadow: 0 0 15px var(--neon-pink);
    }
    .dismiss-btn:hover {
        background: rgba(255, 0, 128, 0.1);
        box-shadow: 0 0 15px rgba(255, 0, 128, 0.3);
    }
`;
document.head.appendChild(connectionErrorStyles);

// Function to show welcome message
function showWelcomeMessage() {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <h2>Welcome to LINKHUB</h2>
            <p>Community Chat</p>
            <div class="welcome-features">
                <div class="feature">
                    <i class="fas fa-users"></i>
                    <span>Create Groups</span>
                </div>
                <div class="feature">
                    <i class="fas fa-comment"></i>
                    <span>Direct Messages</span>
                </div>
                <div class="feature">
                    <i class="fas fa-bullhorn"></i>
                    <span>Announcements</span>
                </div>
            </div>
        </div>
    `;
    messagesContainer.style.display = 'flex';
}

// Add styles for the welcome message
const welcomeStyles = document.createElement('style');
welcomeStyles.textContent = `
    .welcome-message {
        text-align: center;
        padding: 2rem;
        color: #fff;
        max-width: 600px;
        margin: 0 auto;
    }

    .welcome-message h2 {
        font-size: 2.5em;
        color: var(--neon-pink);
        margin-bottom: 0.5rem;
        font-family: 'Orbitron', sans-serif;
        text-shadow: 0 0 10px var(--neon-pink);
    }

    .welcome-message p {
        font-size: 1.2em;
        color: rgba(255, 255, 255, 0.8);
        margin-bottom: 2rem;
    }

    .welcome-features {
        display: flex;
        justify-content: center;
        gap: 2rem;
        margin-top: 2rem;
    }

    .feature {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }

    .feature i {
        font-size: 2em;
        color: var(--neon-pink);
    }

    .feature span {
        color: rgba(255, 255, 255, 0.8);
        font-family: 'Orbitron', sans-serif;
    }
`;
document.head.appendChild(welcomeStyles);

// Add connection check function
async function checkFirestoreConnection() {
    try {
        // Try to make a simple read operation
        await getDoc(doc(db, 'users', 'connection-test'));
        return true;
    } catch (error) {
        console.error('Connection check error:', error);
        
        // Check for specific error types
        if (error.message.includes('ERR_BLOCKED_BY_CLIENT') || 
            error.message.includes('blocked') ||
            error.code === 'permission-denied') {
            
            // Show specific error message for ad blocker
            showConnectionError('It seems your ad blocker or privacy extension is blocking the connection. Please disable it for this site to continue.');
            return false;
        }
        
        // Check for network errors
        if (error.message.includes('network error') || 
            error.message.includes('terminate')) {
            showConnectionError('Network connection error. Please check your internet connection.');
            return false;
        }
        
        // For other errors, show generic message
        showConnectionError('Unable to connect to the server. Please try again later.');
        return false;
    }
}

// Update the initialization code
document.addEventListener('DOMContentLoaded', async () => {
    // Listen for auth state changes
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('User is logged in:', user.email);
            currentUser = user;
            
            try {
                // Check connection before proceeding
                const isConnected = await checkFirestoreConnection();
                if (!isConnected) {
                    return; // Stop initialization if connection check fails
                }

                // Create or update user document
                await setDoc(doc(db, 'users', user.uid), {
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    photoURL: user.photoURL || null,
                    lastSeen: serverTimestamp(),
                    createdAt: serverTimestamp()
                }, { merge: true });

            // Initialize UI elements
            initializeUI();
                
            // Load initial data
                await loadGroups();
                await loadDMs();
                
                // Show welcome message
                showWelcomeMessage();
            } catch (error) {
                if (!handleFirestoreError(error)) {
                    showNotification('Error initializing application', true);
                }
            }
        } else {
            console.log('No user logged in, redirecting to index');
            window.location.href = 'index.html';
        }
    });
});

function initializeUI() {
    // Get all DOM elements
    const createGroupBtn = document.getElementById('create-group-btn');
    const newDmBtn = document.getElementById('new-dm-btn');
    const announcementBtn = document.getElementById('announcement-btn');
    const manageParticipantsBtn = document.getElementById('manage-participants-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const cleanupDmsBtn = document.getElementById('cleanup-dms-btn');
    const createGroupModal = document.getElementById('create-group-modal');
    const newDmModal = document.getElementById('new-dm-modal');
    const announcementModal = document.getElementById('announcement-modal');
    const manageParticipantsModal = document.getElementById('manage-participants-modal');
    const createGroupForm = document.getElementById('create-group-form');
    const announcementForm = document.getElementById('announcement-form');
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages');
    const userName = document.getElementById('user-name');
    const dmUserSearch = document.getElementById('dm-user-search');
    const dmSearchResults = document.getElementById('dm-search-results');
    const addParticipantSearch = document.getElementById('add-participant-search');
    const addParticipantResults = document.getElementById('add-participant-results');
    const showAllUsersBtn = document.getElementById('show-all-users-btn');
    const saveParticipantsBtn = document.getElementById('save-participants-btn');

    // Set user profile
    if (currentUser) {
        if (userName) {
            userName.textContent = currentUser.displayName || currentUser.email.split('@')[0];
        }
    }

    // Show welcome state by default
    showWelcomeState();

    // Add event listeners only if elements exist
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => {
            if (createGroupModal) {
                createGroupModal.classList.add('active');
            }
        });
    }

    if (newDmBtn) {
        newDmBtn.addEventListener('click', () => {
            if (newDmModal) {
                newDmModal.classList.add('active');
            }
        });
    }

    if (announcementBtn) {
        announcementBtn.addEventListener('click', () => {
            if (currentChatType === 'group') {
                if (announcementModal) {
                    announcementModal.classList.add('active');
                }
            } else {
                showNotification('Announcements can only be made in groups', true);
            }
        });
    }

    if (manageParticipantsBtn) {
        manageParticipantsBtn.addEventListener('click', async () => {
            if (currentChatType === 'group' && currentChat) {
                if (manageParticipantsModal) {
                    manageParticipantsModal.classList.add('active');
                    await loadCurrentParticipants();
                }
            }
        });
    }

    if (cleanupDmsBtn) {
        cleanupDmsBtn.addEventListener('click', async () => {
            try {
                cleanupDmsBtn.disabled = true;
                cleanupDmsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cleaning...';
                await cleanupDuplicateDMs();
            } catch (error) {
                console.error('Error during cleanup:', error);
                showNotification('Error during cleanup', true);
            } finally {
                cleanupDmsBtn.disabled = false;
                cleanupDmsBtn.innerHTML = '<i class="fas fa-broom"></i> Cleanup';
            }
        });
    }

    // Enhanced message input handling
    if (messageInput) {
        // Send on Enter (without shift)
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = messageInput.value.trim();
                if (text) {
                    sendMessage(text);
                }
            }
        });

        // Auto-resize textarea
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        });

        // Add send button functionality
        const sendButton = document.getElementById('send-btn');
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                const text = messageInput.value.trim();
                if (text) {
                    sendMessage(text);
                }
            });
        }
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error signing out:', error);
            }
        });
    }

    if (createGroupForm) {
        createGroupForm.addEventListener('submit', handleCreateGroup);
    }

    if (announcementForm) {
        announcementForm.addEventListener('submit', handleAnnouncement);
    }

    if (saveParticipantsBtn) {
        saveParticipantsBtn.addEventListener('click', saveParticipantChanges);
    }

    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Close modals when clicking cancel buttons
    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Add DM search functionality
    if (dmUserSearch) {
        let searchTimeout;
        dmUserSearch.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                if (dmSearchResults) {
                    dmSearchResults.innerHTML = '';
                    dmSearchResults.classList.remove('active');
                }
                return;
            }

            // Show loading state
            if (dmSearchResults) {
                dmSearchResults.innerHTML = `
                    <div class="loading-message">
                        <i class="fas fa-spinner fa-spin"></i>
                        Searching users...
                    </div>
                `;
                dmSearchResults.classList.add('active');
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const users = await searchUsers(query);
                    if (dmSearchResults) {
                        dmSearchResults.innerHTML = '';
                        
                        if (users.length === 0) {
                            dmSearchResults.innerHTML = `
                                <div class="no-results">
                                    <i class="fas fa-search"></i>
                                    No users found
                                </div>
                            `;
                        } else {
                            users.forEach(user => {
                                const userElement = document.createElement('div');
                                userElement.className = 'user-result';
                                userElement.innerHTML = `
                                    <div class="user-info">
                                        <div class="user-name">
                                            ${user.displayName || user.email.split('@')[0]}
                                        </div>
                                        <div class="user-email">${user.email}</div>
                                    </div>
                                `;
                                
                                userElement.addEventListener('click', async () => {
                                    try {
                                        if (!user.id || !user.email) {
                                            throw new Error('Invalid user data');
                                        }

                                        // Show loading state
                                        userElement.innerHTML = `
                                            <div class="loading-message">
                                                <i class="fas fa-spinner fa-spin"></i>
                                                Creating conversation...
                                            </div>
                                        `;

                                        const dm = await createOrGetDM(
                                            user.id,
                                            user.displayName || user.email.split('@')[0],
                                            user.email
                                        );
                                        
                                        // Close modal
                                        if (newDmModal) {
                                            newDmModal.classList.remove('active');
                                        }
                                        
                                        // Select the DM
                                        await selectDM(dm, {
                                            participants: [currentUser.uid, user.id],
                                            participantNames: {
                                                [currentUser.uid]: currentUser.displayName || currentUser.email.split('@')[0],
                                                [user.id]: user.displayName || user.email.split('@')[0]
                                            }
                                        });
                                        
                                        // Clear search
                                        if (dmUserSearch) {
                                            dmUserSearch.value = '';
                                        }
                                        if (dmSearchResults) {
                                            dmSearchResults.innerHTML = '';
                                            dmSearchResults.classList.remove('active');
                                        }
                                        
                                    } catch (error) {
                                        console.error('Error creating DM:', error);
                                        showNotification('Error creating conversation', true);
                                    }
                                });
                                
                                dmSearchResults.appendChild(userElement);
                            });
                        }
                    }
                } catch (error) {
                    console.error('Error searching users:', error);
                    if (dmSearchResults) {
                        dmSearchResults.innerHTML = `
                            <div class="error-message">
                                <i class="fas fa-exclamation-circle"></i>
                                Error searching users
                            </div>
                        `;
                    }
                }
            }, 300);
        });
    }

    // Add participant search functionality for group creation
    if (addParticipantSearch) {
        let searchTimeout;
        addParticipantSearch.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                if (addParticipantResults) {
                    addParticipantResults.innerHTML = '';
                    addParticipantResults.classList.remove('active');
                }
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const users = await searchUsers(query);
                    if (addParticipantResults) {
                        addParticipantResults.innerHTML = '';
                        
                        if (users.length === 0) {
                            addParticipantResults.innerHTML = `
                                <div class="no-results">
                                    <i class="fas fa-search"></i>
                                    No users found
                                </div>
                            `;
                        } else {
                            users.forEach(user => {
                                const userElement = document.createElement('div');
                                userElement.className = 'user-result';
                                userElement.innerHTML = `
                                    <div class="user-info">
                                        <div class="user-name">
                                            ${user.displayName || user.email.split('@')[0]}
                                        </div>
                                        <div class="user-email">${user.email}</div>
                                    </div>
                                `;
                                
                                userElement.addEventListener('click', () => {
                                    addParticipantToSelection(user);
                                    if (addParticipantSearch) {
                                        addParticipantSearch.value = '';
                                    }
                                    if (addParticipantResults) {
                                        addParticipantResults.innerHTML = '';
                                        addParticipantResults.classList.remove('active');
                                    }
                                });
                                
                                addParticipantResults.appendChild(userElement);
                            });
                        }
                        addParticipantResults.classList.add('active');
                    }
                } catch (error) {
                    console.error('Error searching users:', error);
                }
            }, 300);
        });
    }

    // Show all users button functionality
    if (showAllUsersBtn) {
        showAllUsersBtn.addEventListener('click', async () => {
            try {
                const users = await loadAllUsers();
                if (addParticipantResults) {
                    addParticipantResults.innerHTML = '';
                    
                    if (users.length === 0) {
                        addParticipantResults.innerHTML = `
                            <div class="no-results">
                                <i class="fas fa-users"></i>
                                No users found
                            </div>
                        `;
                    } else {
                        users.forEach(user => {
                            const userElement = document.createElement('div');
                            userElement.className = 'user-result';
                            userElement.innerHTML = `
                                <div class="user-info">
                                    <div class="user-name">
                                        ${user.displayName || user.email.split('@')[0]}
                                    </div>
                                    <div class="user-email">${user.email}</div>
                                </div>
                            `;
                            
                            userElement.addEventListener('click', () => {
                                addParticipantToSelection(user);
                            });
                            
                            addParticipantResults.appendChild(userElement);
                        });
                    }
                    addParticipantResults.classList.add('active');
                }
            } catch (error) {
                console.error('Error loading all users:', error);
            }
        });
    }

    // Add event listeners for welcome state buttons
    const welcomeCreateGroupBtn = document.getElementById('welcome-create-group-btn');
    const welcomeNewDmBtn = document.getElementById('welcome-new-dm-btn');
    
    if (welcomeCreateGroupBtn) {
        welcomeCreateGroupBtn.addEventListener('click', () => {
            if (createGroupModal) {
                createGroupModal.classList.add('active');
            }
        });
    }
    
    if (welcomeNewDmBtn) {
        welcomeNewDmBtn.addEventListener('click', () => {
            if (newDmModal) {
                newDmModal.classList.add('active');
            }
        });
    }
}

// Function to update selected participants display
function updateSelectedParticipants() {
    const newParticipants = document.getElementById('new-participants');
    if (!newParticipants) return;

    newParticipants.innerHTML = '';
    
    selectedParticipants.forEach(participant => {
        const participantElement = document.createElement('div');
        participantElement.className = 'selected-participant';
        participantElement.innerHTML = `
            <span class="participant-name">${participant.name}</span>
            <span class="participant-email">${participant.email}</span>
            <button class="remove-participant" data-id="${participant.id}">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        const removeBtn = participantElement.querySelector('.remove-participant');
        removeBtn.addEventListener('click', () => {
            selectedParticipants = selectedParticipants.filter(p => p.id !== participant.id);
            updateSelectedParticipants();
        });
        
        newParticipants.appendChild(participantElement);
    });
}

// Function to add participant to selection
function addParticipantToSelection(user) {
    if (!selectedParticipants.some(p => p.id === user.id)) {
        selectedParticipants.push({
            id: user.id,
            name: user.displayName || user.email.split('@')[0],
            email: user.email
        });
        updateSelectedParticipants();
    }
}

// Function to load current participants for group management
async function loadCurrentParticipants() {
    try {
        if (!currentChat || currentChatType !== 'group') return;

        const currentParticipantsList = document.getElementById('current-participants-list');
        if (!currentParticipantsList) return;

        currentParticipantsList.innerHTML = '';

        if (currentChat.members && currentChat.members.length > 0) {
            for (const memberId of currentChat.members) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', memberId));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        const participantElement = document.createElement('div');
                        participantElement.className = 'participant-item';
                        participantElement.innerHTML = `
                            <div class="participant-info">
                                <span class="participant-name">${userData.displayName || userData.email.split('@')[0]}</span>
                                <span class="participant-email">${userData.email}</span>
                            </div>
                            ${memberId !== currentUser.uid ? `
                                <button class="remove-participant-btn" data-user-id="${memberId}">
                                    <i class="fas fa-times"></i>
                                </button>
                            ` : '<span class="owner-badge">Owner</span>'}
                        `;

                        // Add remove participant functionality
                        const removeBtn = participantElement.querySelector('.remove-participant-btn');
                        if (removeBtn) {
                            removeBtn.addEventListener('click', () => {
                                removeParticipantFromGroup(memberId);
                            });
                        }

                        currentParticipantsList.appendChild(participantElement);
                    }
                } catch (error) {
                    console.error('Error loading participant:', error);
                }
            }
        } else {
            currentParticipantsList.innerHTML = '<p>No participants found</p>';
        }
    } catch (error) {
        console.error('Error loading current participants:', error);
    }
}

// Function to remove participant from group
async function removeParticipantFromGroup(userId) {
    try {
        if (!currentChat || currentChatType !== 'group') return;

        const groupRef = doc(db, 'groups', currentChat.id);
        await updateDoc(groupRef, {
            members: arrayRemove(userId)
        });

        // Reload current participants
        await loadCurrentParticipants();
        showNotification('Participant removed from group', false);
    } catch (error) {
        console.error('Error removing participant:', error);
        showNotification('Error removing participant', true);
    }
}

// Update handleCreateGroup function
async function handleCreateGroup(e) {
    e.preventDefault();
    
    try {
        const groupName = document.getElementById('group-name').value.trim();
        const groupDescription = document.getElementById('group-description').value.trim();
        const groupType = document.getElementById('group-type').value;

        if (!groupName) {
            throw new Error('Please enter a group name');
        }

        if (selectedParticipants.length === 0) {
            throw new Error('Please select at least one participant');
        }

        const groupData = {
            name: groupName,
            description: groupDescription,
            type: groupType,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            members: [currentUser.uid, ...selectedParticipants.map(p => p.id)],
            memberNames: {
                [currentUser.uid]: currentUser.displayName || currentUser.email.split('@')[0],
                ...selectedParticipants.reduce((acc, p) => ({
                    ...acc,
                    [p.id]: p.name
                }), {})
            },
            memberEmails: {
                [currentUser.uid]: currentUser.email,
                ...selectedParticipants.reduce((acc, p) => ({
                    ...acc,
                    [p.id]: p.email
                }), {})
            }
        };

        const groupRef = await addDoc(collection(db, 'groups'), groupData);

        // Add system message for group creation
        await addDoc(collection(db, 'groups', groupRef.id, 'messages'), {
            text: 'Group created',
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email.split('@')[0],
            timestamp: serverTimestamp(),
            type: 'system'
        });

        showNotification('Group created successfully');
        
        // Reset form and close modal
        document.getElementById('create-group-form').reset();
        selectedParticipants = [];
        updateSelectedParticipants();
        document.getElementById('create-group-modal').classList.remove('active');

        // Load the new group immediately
        await loadGroups();

        // Auto-select the newly created group
        const newGroup = {
            id: groupRef.id,
            ...groupData
        };
        await selectGroup(groupRef.id, newGroup);

    } catch (error) {
        console.error('Error creating group:', error);
        showNotification(error.message || 'Error creating group', true);
    }
}

// Load groups for the current user
async function loadGroups() {
    try {
        // First verify the user document exists
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
            throw new Error('User document not found');
        }

        // Get groups where user is a member
        const groupsQuery = query(
            collection(db, 'groups'),
            where('members', 'array-contains', currentUser.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);

        const groupList = document.getElementById('group-list');
        if (!groupList) return;

        groupList.innerHTML = '';
        
        if (groupsSnapshot.empty) {
            const noGroups = document.createElement('div');
            noGroups.className = 'no-groups';
            noGroups.textContent = 'No groups yet';
            groupList.appendChild(noGroups);
            return;
        }

        // Sort groups by creation time (newest first)
        const sortedGroups = groupsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const timeA = a.createdAt?.toDate() || new Date(0);
                const timeB = b.createdAt?.toDate() || new Date(0);
                return timeB - timeA;
            });

        sortedGroups.forEach(group => {
            const groupElement = createGroupElement(group.id, group);
            groupList.appendChild(groupElement);
        });

        // Show welcome state by default instead of auto-selecting
        if (!currentChat) {
            showWelcomeState();
        }

    } catch (error) {
        console.error('Error loading groups:', error);
        const groupList = document.getElementById('group-list');
        if (groupList) {
            groupList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    Error loading groups. Please try again.
                </div>
            `;
        }
    }
}

// Load direct messages for the current user
async function loadDMs() {
    try {
        const dmList = document.getElementById('dm-list');
        if (!dmList) return;

        dmList.innerHTML = '';
        
        // First try with the ordered query
        try {
            const dmsQuery = query(
                collection(db, 'directMessages'),
                where('participants', 'array-contains', currentUser.uid),
                orderBy('lastMessageTime', 'desc')
            );
            const dmsSnapshot = await getDocs(dmsQuery);

            if (!dmsSnapshot.empty) {
                // Group DMs by email to handle duplicates
                const dmMap = new Map(); // email -> DM
                
                dmsSnapshot.forEach(doc => {
                    const dm = doc.data();
                    const otherParticipantEmail = Object.values(dm.participantEmails || {}).find(email => email !== currentUser.email);
                    
                    if (otherParticipantEmail) {
                        // If we already have a DM with this email, keep the one with more recent activity
                        if (dmMap.has(otherParticipantEmail)) {
                            const existingDM = dmMap.get(otherParticipantEmail);
                            const existingTime = existingDM.lastMessageTime?.toDate() || new Date(0);
                            const newTime = dm.lastMessageTime?.toDate() || new Date(0);
                            
                            if (newTime > existingTime) {
                                dmMap.set(otherParticipantEmail, { id: doc.id, ...dm });
                                // Mark the old one for deletion
                                console.log('Marking duplicate DM for deletion:', existingDM.id, 'keeping:', doc.id);
                            }
                        } else {
                            dmMap.set(otherParticipantEmail, { id: doc.id, ...dm });
                        }
                    }
                });

                // Display unique DMs
                const uniqueDMs = Array.from(dmMap.values());
                uniqueDMs.sort((a, b) => {
                    const timeA = a.lastMessageTime?.toDate() || new Date(0);
                    const timeB = b.lastMessageTime?.toDate() || new Date(0);
                    return timeB - timeA;
                });

                uniqueDMs.forEach(dm => {
                    const dmElement = createDMElement(dm.id, dm);
                    dmList.appendChild(dmElement);
                });
                return;
            }
        } catch (indexError) {
            console.log('Index not ready, falling back to basic query');
            // If index is not ready, fall back to basic query
            const basicQuery = query(
                collection(db, 'directMessages'),
                where('participants', 'array-contains', currentUser.uid)
            );
            const basicSnapshot = await getDocs(basicQuery);

            if (!basicSnapshot.empty) {
                // Group DMs by email to handle duplicates
                const dmMap = new Map(); // email -> DM
                
                basicSnapshot.forEach(doc => {
                    const dm = doc.data();
                    const otherParticipantEmail = Object.values(dm.participantEmails || {}).find(email => email !== currentUser.email);
                    
                    if (otherParticipantEmail) {
                        // If we already have a DM with this email, keep the one with more recent activity
                        if (dmMap.has(otherParticipantEmail)) {
                            const existingDM = dmMap.get(otherParticipantEmail);
                            const existingTime = existingDM.lastMessageTime?.toDate() || new Date(0);
                            const newTime = dm.lastMessageTime?.toDate() || new Date(0);
                            
                            if (newTime > existingTime) {
                                dmMap.set(otherParticipantEmail, { id: doc.id, ...dm });
                            }
                        } else {
                            dmMap.set(otherParticipantEmail, { id: doc.id, ...dm });
                        }
                    }
                });

                // Sort in memory
                const sortedDMs = Array.from(dmMap.values()).sort((a, b) => {
                    const timeA = a.lastMessageTime?.toDate() || new Date(0);
                    const timeB = b.lastMessageTime?.toDate() || new Date(0);
                    return timeB - timeA;
                });

                sortedDMs.forEach(dm => {
                    const dmElement = createDMElement(dm.id, dm);
                    dmList.appendChild(dmElement);
                });
                return;
            }
        }

        // If we get here, there are no DMs
        const noDMs = document.createElement('div');
        noDMs.className = 'no-dms';
        noDMs.textContent = 'No direct messages yet';
        dmList.appendChild(noDMs);

    } catch (error) {
        console.error('Error loading DMs:', error);
        if (error.code === 'permission-denied' || error.message.includes('blocked')) {
            showConnectionError();
        } else {
            const dmList = document.getElementById('dm-list');
            if (dmList) {
                dmList.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        Error loading messages. Please try again.
                    </div>
                `;
            }
        }
    }
}

// Create group element
function createGroupElement(groupId, group) {
    const div = document.createElement('div');
    div.className = 'group-item';
    div.dataset.groupId = groupId;
    
    const icon = document.createElement('div');
    icon.className = 'group-icon';
    icon.innerHTML = `<i class="fas fa-${group.type === 'public' ? 'globe' : 'lock'}"></i>`;
    
    const info = document.createElement('div');
    info.className = 'group-info';
    
    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = group.name;
    
    const type = document.createElement('div');
    type.className = 'group-type';
    type.textContent = group.type;
    
    const actions = document.createElement('div');
    actions.className = 'group-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = group.createdBy === currentUser.uid ? 'Delete Group' : 'Leave Group';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(groupId, 'group');
    });
    
    actions.appendChild(deleteBtn);
    
    info.appendChild(name);
    info.appendChild(type);
    
    div.appendChild(icon);
    div.appendChild(info);
    div.appendChild(actions);
    
    div.addEventListener('click', () => selectGroup(groupId, group));
    
    return div;
}

// Create DM element
function createDMElement(dmId, dm) {
    const div = document.createElement('div');
    div.className = 'dm-item';
    div.dataset.dmId = dmId;
    
    const icon = document.createElement('div');
    icon.className = 'dm-avatar';
    icon.innerHTML = `<i class="fas fa-user"></i>`;
    
    const info = document.createElement('div');
    info.className = 'dm-info';
    
    const name = document.createElement('div');
    name.className = 'dm-name';
    // Get the other participant's name
    const otherParticipantId = dm?.participants?.find(id => id !== currentUser.uid) || '';
    const otherParticipantName = dm?.participantNames?.[otherParticipantId] || 
                                dm?.participantEmails?.[otherParticipantId]?.split('@')[0] || 
                                'Unknown User';
    name.textContent = otherParticipantName;
    
    const email = document.createElement('div');
    email.className = 'dm-email';
    email.textContent = dm?.participantEmails?.[otherParticipantId] || '';
    
    const lastMessage = document.createElement('div');
    lastMessage.className = 'dm-last-message';
    if (dm?.lastMessage) {
        const sender = dm.lastMessageSender === currentUser.displayName ? 'You' : dm.lastMessageSender;
        lastMessage.textContent = `${sender}: ${dm.lastMessage}`;
    } else {
        lastMessage.textContent = 'No messages yet';
    }
    
    const actions = document.createElement('div');
    actions.className = 'dm-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = 'Delete Conversation';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(dmId, 'dm');
    });
    
    actions.appendChild(deleteBtn);
    
    info.appendChild(name);
    info.appendChild(email);
    info.appendChild(lastMessage);
    
    div.appendChild(icon);
    div.appendChild(info);
    div.appendChild(actions);
    
    div.addEventListener('click', () => selectDM(dmId, dm));
    
    return div;
}

// Select group and load messages
async function selectGroup(groupId, group) {
    try {
        currentChat = { id: groupId, ...group };
        currentChatType = 'group';
        
        // Update UI
        document.querySelectorAll('.group-item').forEach(item => {
            item.classList.remove('active');
        });
        const groupElement = document.querySelector(`[data-group-id="${groupId}"]`);
        if (groupElement) {
            groupElement.classList.add('active');
        }
        
        // Update chat header
        const chatName = document.getElementById('current-chat-name');
        const chatType = document.getElementById('chat-type');
        if (chatName) {
            chatName.textContent = group.name;
        }
        if (chatType) {
            chatType.textContent = group.type;
        }
        
        // Show manage participants and announcement buttons
        const manageParticipantsBtn = document.getElementById('manage-participants-btn');
        const announcementBtn = document.getElementById('announcement-btn');
        if (manageParticipantsBtn) {
            manageParticipantsBtn.style.display = 'flex';
        }
        if (announcementBtn) {
            announcementBtn.style.display = 'flex';
        }
        
        // Initialize participant management if the function exists
        if (typeof initializeParticipantManagement === 'function') {
        initializeParticipantManagement();
        }
        
        // Show chat interface and hide welcome state
        const welcomeState = document.getElementById('welcome-state');
        const chatInterface = document.getElementById('chat-interface');
        if (welcomeState) welcomeState.style.display = 'none';
        if (chatInterface) chatInterface.style.display = 'flex';
        
        // Load messages
        await loadMessages(groupId, 'group');
        
        // Update the messages container visibility
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.style.display = 'flex';
        }
        
        // Update the no-conversation message visibility
        const noConversation = document.querySelector('.no-conversation');
        if (noConversation) {
            noConversation.style.display = 'none';
        }
    } catch (error) {
        console.error('Error selecting group:', error);
        showNotification('Error loading group', true);
    }
}

// Select DM and load messages
async function selectDM(dmId, dm) {
    try {
        currentChat = { id: dmId, ...dm };
        currentChatType = 'dm';
        
        // Update UI
        const dmItems = document.querySelectorAll('.dm-item');
        dmItems.forEach(item => {
            item.classList.remove('active');
        });

        // Find or create the DM element
        let dmElement = document.querySelector(`[data-dm-id="${dmId}"]`);
        if (!dmElement) {
            // If DM element doesn't exist, create it
            dmElement = createDMElement(dmId, dm);
            const dmList = document.getElementById('dm-list');
            if (dmList) {
                dmList.appendChild(dmElement);
            }
        }
        
        if (dmElement) {
            dmElement.classList.add('active');
        }
        
        // Update chat header with the other participant's name
        const chatName = document.getElementById('current-chat-name');
        const chatType = document.getElementById('chat-type');
        
        if (chatName) {
            // Get the other participant's ID
            const otherParticipantId = dm.participants.find(id => id !== currentUser.uid);
            // Get their name from participantNames or fallback to email
            const otherParticipantName = dm.participantNames?.[otherParticipantId] || 
                                        dm.participantEmails?.[otherParticipantId]?.split('@')[0] || 
                                        'Unknown User';
            chatName.textContent = otherParticipantName;
        }
        if (chatType) {
            chatType.textContent = 'Direct Message';
        }

        // Hide manage participants and announcement buttons for DMs
        const manageParticipantsBtn = document.getElementById('manage-participants-btn');
        const announcementBtn = document.getElementById('announcement-btn');
        if (manageParticipantsBtn) {
            manageParticipantsBtn.style.display = 'none';
        }
        if (announcementBtn) {
            announcementBtn.style.display = 'none';
        }
        
        // Show chat interface and hide welcome state
        const welcomeState = document.getElementById('welcome-state');
        const chatInterface = document.getElementById('chat-interface');
        if (welcomeState) welcomeState.style.display = 'none';
        if (chatInterface) chatInterface.style.display = 'flex';
        
        // Load messages
        await loadMessages(dmId, 'dm');
    } catch (error) {
        console.error('Error selecting DM:', error);
        // Show error in UI
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    Error loading conversation. Please try again.
                </div>
            `;
        }
    }
}

// Load messages for a chat with proper error handling
async function loadMessages(chatId, type) {
    try {
        // Remove existing listener if any
        if (messageListener) {
            messageListener();
            messageListener = null;
        }

        const messagesRef = type === 'group' 
            ? collection(db, 'groups', chatId, 'messages')
            : collection(db, 'directMessages', chatId, 'messages');
            
        // First verify we have access to the chat
        const chatRef = type === 'group' 
            ? doc(db, 'groups', chatId)
            : doc(db, 'directMessages', chatId);
            
        const chatDoc = await getDoc(chatRef);
        if (!chatDoc.exists()) {
            throw new Error('Chat not found');
        }

        const chat = chatDoc.data();
        
        // Verify user has access
        if (type === 'group') {
            if (!chat.members || !Array.isArray(chat.members) || !chat.members.includes(currentUser.uid)) {
                throw new Error('You are not a member of this group');
            }
        } else {
            if (!chat.participants || !Array.isArray(chat.participants) || !chat.participants.includes(currentUser.uid)) {
                throw new Error('You are not a participant in this conversation');
            }
        }

        console.log('User access verified for chat:', {
            chatId: chatId,
            type: type,
            userId: currentUser.uid,
            members: chat.members,
            participants: chat.participants
        });

        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;

        // Clear existing messages
        messagesContainer.innerHTML = '';

        // Set up real-time listener for all messages
        messageListener = onSnapshot(
            query(messagesRef, orderBy('timestamp', 'asc')),
            snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const message = change.doc.data();
                        // Check if message already exists in UI
                        const existingMessage = document.querySelector(`[data-message-id="${change.doc.id}"]`);
                        if (!existingMessage) {
                            const messageElement = createMessageElement({
                                ...message,
                                id: change.doc.id
                            });
                            messageElement.classList.add('new');
                            
                            // Insert message in correct position based on timestamp
                            const messages = Array.from(messagesContainer.children);
                            const messageTimestamp = message.timestamp?.toDate ? message.timestamp.toDate() : message.timestamp || new Date();
                            
                            let insertIndex = messages.length;
                            for (let i = 0; i < messages.length; i++) {
                                const existingTimestamp = messages[i].dataset.timestamp;
                                if (existingTimestamp) {
                                    const existingTime = new Date(parseInt(existingTimestamp));
                                    if (messageTimestamp < existingTime) {
                                        insertIndex = i;
                                        break;
                                    }
                                }
                            }
                            
                            // Store timestamp in dataset for future comparisons
                            messageElement.dataset.timestamp = messageTimestamp.getTime();
                            
                            if (insertIndex === messages.length) {
                                // Add to end
                                messagesContainer.appendChild(messageElement);
                            } else {
                                // Insert at correct position
                                messagesContainer.insertBefore(messageElement, messages[insertIndex]);
                            }
                            
                            // Smart scrolling logic for real-time messages
                            const isFromOtherUser = (message.userId || message.senderId) !== currentUser.uid;
                            
                            // Always scroll for all messages (both sent and received)
                            scrollToBottom(messagesContainer, true);

                            // Update last message in chat list
                            if (type === 'dm') {
                                updateLastMessage(chatId, message);
                            }
                        }
                    } else if (change.type === 'modified') {
                        // Message was modified - no action needed for now
                    }
                });
            }, error => {
                console.error('Error in message listener:', error);
                console.error('Error details:', {
                    errorCode: error.code,
                    errorMessage: error.message,
                    chatId: chatId,
                    type: type,
                    currentUser: currentUser?.uid
                });
                // Don't show error to user for listener errors
            });

    } catch (error) {
        console.error('Error loading messages:', error);
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    ${error.message || 'Error loading messages. Please try again.'}
                </div>
            `;
        }
    }
}

// Function to update last message in chat list
async function updateLastMessage(chatId, message) {
    try {
        // Validate message data
        if (!message) {
            console.warn('No message data provided for updating last message');
            return;
        }

        // Ensure we have the required fields
        const messageText = message.text || message.lastMessage || '';
        const messageTime = message.timestamp || message.lastMessageTime || serverTimestamp();
        const messageSender = message.userName || message.lastMessageSender || 'Unknown User';

        const dmRef = doc(db, 'directMessages', chatId);
        const updateData = {
            lastMessage: messageText,
            lastMessageTime: messageTime,
            lastMessageSender: messageSender
        };

        await updateDoc(dmRef, updateData);

        // Update the DM element in the list
        const dmElement = document.querySelector(`[data-dm-id="${chatId}"]`);
        if (dmElement) {
            const lastMessageElement = dmElement.querySelector('.dm-last-message');
            if (lastMessageElement) {
                const sender = (message.userId || message.senderId) === currentUser.uid ? 'You' : messageSender;
                lastMessageElement.textContent = `${sender}: ${messageText}`;
            }
        }
    } catch (error) {
        console.error('Error updating last message:', error);
    }
}

// Function to send message with proper error handling
async function sendMessage(text) {
    if (!text.trim() || !currentChat || !currentUser) return;
    
    try {
        if (!currentChat.id) {
            throw new Error('Invalid chat ID');
        }

        const messagesRef = currentChatType === 'group'
            ? collection(db, 'groups', currentChat.id, 'messages')
            : collection(db, 'directMessages', currentChat.id, 'messages');

        // Get user's display name
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userName = userDoc.exists() ? userDoc.data().displayName : currentUser.displayName || currentUser.email.split('@')[0];

        // Create message data
        const messageData = {
            text: text.trim(),
            userId: currentUser.uid,
            userName: userName,
            timestamp: serverTimestamp()
        };

        // Clear input first to prevent duplicate sends
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = '';
            messageInput.style.height = 'auto'; // Reset height
        }

        // Add message to Firestore
        const messageRef = await addDoc(messagesRef, messageData);

        // Add message to UI
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            // Check if message already exists
            const existingMessage = document.querySelector(`[data-message-id="${messageRef.id}"]`);
            if (!existingMessage) {
                const messageElement = createMessageElement({
                    ...messageData,
                    id: messageRef.id,
                    timestamp: new Date()
                });
                messageElement.classList.add('sent', 'new');
                
                // Store timestamp in dataset for ordering
                const messageTimestamp = new Date();
                messageElement.dataset.timestamp = messageTimestamp.getTime();
                
                // Insert message in correct position based on timestamp
                const messages = Array.from(messagesContainer.children);
                let insertIndex = messages.length;
                
                for (let i = 0; i < messages.length; i++) {
                    const existingTimestamp = messages[i].dataset.timestamp;
                    if (existingTimestamp) {
                        const existingTime = new Date(parseInt(existingTimestamp));
                        if (messageTimestamp < existingTime) {
                            insertIndex = i;
                            break;
                        }
                    }
                }
                
                if (insertIndex === messages.length) {
                    // Add to end
                    messagesContainer.appendChild(messageElement);
                } else {
                    // Insert at correct position
                    messagesContainer.insertBefore(messageElement, messages[insertIndex]);
                }
                
                // Always scroll to show sent messages
                scrollToBottom(messagesContainer, true);
                
                // Additional immediate scroll for sent messages
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 10);
            }
        }

        // Update last message in chat document
        if (currentChatType === 'dm') {
            const chatRef = doc(db, 'directMessages', currentChat.id);
            await updateDoc(chatRef, {
                lastMessage: text.trim(),
                lastMessageTime: serverTimestamp(),
                lastMessageSender: userName
            });
        } else if (currentChatType === 'group') {
            const chatRef = doc(db, 'groups', currentChat.id);
            await updateDoc(chatRef, {
                lastMessage: text.trim(),
                lastMessageTime: serverTimestamp(),
                lastMessageSender: userName
            });
        }

        // Update chat list immediately
        if (currentChatType === 'dm') {
            updateLastMessage(currentChat.id, messageData);
        }

    } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage = error.message || 'Failed to send message. Please try again.';
        
        // Show error in UI
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            const errorElement = document.createElement('div');
            errorElement.className = 'message error-message';
            errorElement.innerHTML = `
                <div class="message-content">
                    <i class="fas fa-exclamation-circle"></i>
                    ${errorMessage}
                </div>
            `;
            messagesContainer.appendChild(errorElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        showNotification(errorMessage, true);
    }
}

// Function to update message status
function updateMessageStatus(messageElement, status) {
    if (!messageElement) return;

    const content = messageElement.querySelector('.message-content');
    if (!content) return;

    let statusElement = content.querySelector('.message-status');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.className = 'message-status';
        content.appendChild(statusElement);
    }
    
    switch (status) {
        case 'sending':
            statusElement.innerHTML = '<i class="fas fa-clock"></i>';
            messageElement.classList.add('sending');
            break;
        case 'sent':
            statusElement.innerHTML = '<i class="fas fa-check"></i>';
            messageElement.classList.remove('sending');
            messageElement.classList.add('sent');
            break;
        case 'delivered':
            statusElement.innerHTML = '<i class="fas fa-check-double"></i>';
            messageElement.classList.remove('sending', 'sent');
            messageElement.classList.add('delivered');
            break;
        case 'read':
            statusElement.innerHTML = '<i class="fas fa-check-double" style="color: var(--neon-pink);"></i>';
            messageElement.classList.remove('sending', 'sent', 'delivered');
            messageElement.classList.add('read');
            break;
    }
}

// Function to create message element
function createMessageElement(message) {
    if (!message) return null;

    const div = document.createElement('div');
    div.className = `message ${(message.userId || message.senderId) === currentUser.uid ? 'message-sent' : 'message-received'}`;
    if (message.id) {
        div.dataset.messageId = message.id;
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    // Special handling for announcements
    if (message.type === 'announcement') {
        div.className = 'message announcement';
        content.innerHTML = `
            <div class="announcement-header">
                <div class="announcement-title">${message.title}</div>
                <div class="announcement-meta">
                    <span class="announcement-author">Posted by ${message.userName}</span>
                    <span class="announcement-time">${new Date(message.timestamp?.toDate() || message.timestamp).toLocaleString()}</span>
                </div>
            </div>
            <div class="announcement-body">${message.text}</div>
        `;
    } else {
        const header = document.createElement('div');
        header.className = 'message-header';
        
        const name = document.createElement('span');
        name.className = 'message-username';
        
        // Get the correct username with proper fallbacks
        if ((message.userId || message.senderId) === currentUser.uid) {
            name.textContent = 'You';
        } else {
            let otherParticipantName = 'User';
            
            // Try to get name from currentChat data
            if (currentChat) {
                if (currentChat.participantNames && (message.userId || message.senderId)) {
                    otherParticipantName = currentChat.participantNames[message.userId || message.senderId];
                } else if (currentChat.participantEmails && (message.userId || message.senderId)) {
                    const email = currentChat.participantEmails[message.userId || message.senderId];
                    otherParticipantName = email ? email.split('@')[0] : 'User';
                }
            }
            
            // Fallback to message data
            if (!otherParticipantName || otherParticipantName === 'User') {
                otherParticipantName = message.userName || 'User';
            }
            
            name.textContent = otherParticipantName;
        }
        
        const time = document.createElement('span');
        time.className = 'message-time';
        const timestamp = message.timestamp?.toDate ? message.timestamp.toDate() : message.timestamp || new Date();
        time.textContent = new Date(timestamp).toLocaleTimeString();
        
        const text = document.createElement('p');
        text.className = 'message-text';
        text.textContent = message.text || '';
        
        header.appendChild(name);
        header.appendChild(time);
        content.appendChild(header);
        content.appendChild(text);
    }

    div.appendChild(content);
    return div;
}

// Add styles for announcements
const announcementStyles = document.createElement('style');
announcementStyles.textContent = `
    .message.announcement {
        background: rgba(255, 0, 128, 0.1);
        border: 1px solid var(--neon-pink);
        border-radius: 12px;
        padding: 15px;
        margin: 15px auto;
        max-width: 90%;
        box-shadow: 0 0 10px rgba(255, 0, 128, 0.2);
    }

    .announcement-header {
        margin-bottom: 10px;
        border-bottom: 1px solid rgba(255, 0, 128, 0.2);
        padding-bottom: 8px;
    }

    .announcement-title {
        font-size: 1.2em;
        color: var(--neon-pink);
        font-weight: bold;
        margin-bottom: 5px;
        font-family: 'Orbitron', sans-serif;
    }

    .announcement-meta {
        display: flex;
        justify-content: space-between;
        font-size: 0.8em;
        color: rgba(255, 255, 255, 0.7);
    }

    .announcement-author {
        font-style: italic;
    }

    .announcement-time {
        font-family: 'Orbitron', sans-serif;
    }

    .announcement-body {
        color: #fff;
        line-height: 1.5;
        white-space: pre-wrap;
    }
`;
document.head.appendChild(announcementStyles);

// Function to update showNotification function to handle errors
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = isError ? 'error-message' : 'notification';
    notification.innerHTML = `
        <i class="fas fa-${isError ? 'exclamation-circle' : 'check-circle'}"></i>
        ${message}
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Handle media upload
async function handleMediaUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const storageRef = storage.ref();
            const fileRef = storageRef.child(`media/${currentUser.uid}/${Date.now()}_${file.name}`);
            
            const snapshot = await fileRef.put(file);
            const url = await snapshot.ref.getDownloadURL();
            
            // Send message with media URL
            await sendMessage(`[Media](${url})`);
        } catch (error) {
            console.error('Error uploading media:', error);
            alert('Failed to upload media. Please try again.');
        }
    };
    
    input.click();
}

// Function to load user profile with better error handling
async function loadUserProfile(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            throw new Error('User not found');
            }

        const userData = userDoc.data();
        showProfileModal(userData);
    } catch (error) {
        console.error('Error loading user profile:', error);
        showNotification('Error loading profile', true);
    }
}

async function createOrUpdateUserProfile() {
    try {
        const userData = {
            displayName: currentUser.displayName || currentUser.email.split('@')[0],
            photoURL: currentUser.photoURL || null,
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, 'users', currentUser.uid), userData, { merge: true });
        } catch (error) {
        console.error('Error creating/updating user profile:', error);
    }
}

// Close announcement modal
function closeAnnouncementModal() {
    const modal = document.getElementById('announcement-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}
    
// Handle announcement form submission
async function handleAnnouncement(event) {
    event.preventDefault();
    
    if (!currentChat || currentChatType !== 'group') {
        showNotification('Announcements are only available for groups', true);
        return;
    }

    const title = document.getElementById('announcement-title').value.trim();
    const text = document.getElementById('announcement-text').value.trim();
    
    if (!title || !text) {
        showNotification('Please fill in both title and message', true);
        return;
    }
    
    try {
        // Add announcement as a message in the group
        await addDoc(collection(db, 'groups', currentChat.id, 'messages'), {
            type: 'announcement',
            title: title,
            text: text,
            timestamp: serverTimestamp(),
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email.split('@')[0]
        });
        
        showNotification('Announcement posted successfully');
        
        // Close modal and reset form
        const modal = document.getElementById('announcement-modal');
        const form = document.getElementById('announcement-form');
        if (modal) modal.classList.remove('active');
        if (form) form.reset();

        // Reload messages to show the new announcement
        await loadMessages(currentChat.id, 'group');
    } catch (error) {
        console.error('Error posting announcement:', error);
        showNotification('Failed to post announcement. Please try again.', true);
    }
}

// Add helper functions for showing success/error messages
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

// Add styles for success/error messages
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .success-message, .error-message {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 8px;
        color: white;
        font-family: 'Orbitron', sans-serif;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    }

    .success-message {
        background: rgba(0, 255, 0, 0.2);
        border: 1px solid #00ff00;
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
    }

    .error-message {
        background: rgba(255, 0, 0, 0.2);
        border: 1px solid #ff0000;
        box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(notificationStyles);

async function saveParticipantChanges() {
    try {
        const groupDoc = await getDoc(doc(db, 'groups', currentChat.id));
        if (!groupDoc.exists()) {
            throw new Error('Group not found');
    }

        const groupData = groupDoc.data();
        const currentMembers = groupData.members || [];
        const currentMemberNames = groupData.memberNames || {};

        // Get all participant checkboxes
        const checkboxes = document.querySelectorAll('.participant-checkbox');
        const selectedParticipants = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => ({
                id: cb.dataset.userId,
                name: cb.dataset.userName
            }));

        // Find added and removed members
        const addedMembers = selectedParticipants.filter(p => !currentMembers.includes(p.id));
        const removedMembers = currentMembers.filter(id => !selectedParticipants.some(p => p.id === id));

        // Update group document
        const updates = {
            members: selectedParticipants.map(p => p.id),
            memberNames: {
                ...currentMemberNames,
                ...addedMembers.reduce((acc, p) => ({
                    ...acc,
                    [p.id]: p.name
                }), {})
            }
        };

        // Remove names of removed members
        removedMembers.forEach(id => {
            delete updates.memberNames[id];
        });

        await updateDoc(doc(db, 'groups', currentChat.id), updates);

        // Add system message for member changes
        if (addedMembers.length > 0 || removedMembers.length > 0) {
            const messageText = [];
            if (addedMembers.length > 0) {
                messageText.push(`${addedMembers.map(m => m.name).join(', ')} joined the group`);
    }
            if (removedMembers.length > 0) {
                messageText.push(`${removedMembers.map(id => currentMemberNames[id]).join(', ')} left the group`);
    }

            await addDoc(collection(db, 'groups', currentChat.id, 'messages'), {
                text: messageText.join(' and '),
                type: 'system',
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email.split('@')[0],
                timestamp: serverTimestamp()
            });
    }

        showNotification('Group members updated successfully');
        closeManageParticipantsModal();
        loadCurrentParticipants();
    } catch (error) {
        console.error('Error saving participant changes:', error);
        showNotification('Error updating group members', true);
    }
}

async function loadAllUsers() {
    try {
        const users = new Map(); // Use Map to avoid duplicates
        
        // Get users from users collection
        const usersSnapshot = await getDocs(collection(db, 'users'));
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (doc.id !== currentUser.uid) {
                users.set(doc.id, {
                    id: doc.id,
                    ...userData
                });
            }
        });

        // Get users from freelancer_profiles collection
        const freelancerSnapshot = await getDocs(collection(db, 'freelancer_profiles'));
        freelancerSnapshot.forEach(doc => {
            const profileData = doc.data();
            if (doc.id !== currentUser.uid && !users.has(doc.id)) {
                users.set(doc.id, {
                    id: doc.id,
                    displayName: profileData.basicInfo?.name || profileData.basicInfo?.email?.split('@')[0],
                    email: profileData.basicInfo?.email,
                    isFreelancer: true
                });
            }
        });

        return Array.from(users.values());
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

async function searchUsers(query) {
    try {
        // Search in users collection
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = new Map(); // Use Map to avoid duplicates
        
        // Process users collection
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (doc.id !== currentUser.uid) {
                const searchString = `${userData.displayName || ''} ${userData.email}`.toLowerCase();
                if (searchString.includes(query.toLowerCase())) {
                    users.set(doc.id, {
                        id: doc.id,
                        ...userData
                    });
                }
            }
        });

        // Search in freelancer_profiles collection
        const freelancerSnapshot = await getDocs(collection(db, 'freelancer_profiles'));
        freelancerSnapshot.forEach(doc => {
            const profileData = doc.data();
            if (doc.id !== currentUser.uid) {
                const searchString = `${profileData.basicInfo?.name || ''} ${profileData.basicInfo?.email || ''}`.toLowerCase();
                if (searchString.includes(query.toLowerCase())) {
                    // Only add if not already in users map
                    if (!users.has(doc.id)) {
                        users.set(doc.id, {
                            id: doc.id,
                            displayName: profileData.basicInfo?.name || profileData.basicInfo?.email?.split('@')[0],
                            email: profileData.basicInfo?.email,
                            isFreelancer: true
                        });
                    }
                }
            }
        });
            
        return Array.from(users.values());
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

async function createOrGetDM(userId, userName, userEmail) {
    try {
        // Check if DM already exists by email (to prevent duplicates for same email)
        const existingDMs = await getDocs(query(
            collection(db, 'directMessages'),
            where('participants', 'array-contains', currentUser.uid)
        ));

        let dmId = null;
        existingDMs.forEach(doc => {
            const dm = doc.data();
            // Check if any participant has the same email
            if (dm.participantEmails && Object.values(dm.participantEmails).includes(userEmail)) {
                dmId = doc.id;
            }
        });

        if (dmId) {
            console.log('Found existing DM for email:', userEmail, 'DM ID:', dmId);
            return dmId;
        }

        // Create new DM
        const dmData = {
            participants: [currentUser.uid, userId],
            participantNames: {
                [currentUser.uid]: currentUser.displayName || currentUser.email.split('@')[0],
                [userId]: userName
            },
            participantEmails: {
                [currentUser.uid]: currentUser.email,
                [userId]: userEmail
            },
            createdAt: serverTimestamp(),
            lastMessageTime: serverTimestamp()
        };

        const dmRef = await addDoc(collection(db, 'directMessages'), dmData);
        console.log('Created new DM for email:', userEmail, 'DM ID:', dmRef.id);
        return dmRef.id;
    } catch (error) {
        console.error('Error creating/getting DM:', error);
        throw error;
    }
}

// Function to show profile modal
function showProfileModal(userProfile) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>User Profile</h2>
            <div class="profile-container">
                <div class="profile-header">
                    <div class="profile-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="profile-info">
                        <div class="profile-name">${userProfile.displayName || userProfile.email.split('@')[0]}</div>
                        <div class="profile-email">${userProfile.email}</div>
                    </div>
                </div>
                <div class="profile-actions">
                    <button class="profile-btn" onclick="editProfile()">
                        <i class="fas fa-edit"></i> Edit Profile
                    </button>
                </div>
            </div>
            <div class="modal-actions">
                <button class="cancel-btn" onclick="this.closest('.modal').remove()">Close</button>
            </div>
        </div>
    `;
}

async function handleIncomingCall(callId, callData) {
    try {
    const modal = document.createElement('div');
        modal.className = 'call-modal incoming';
    modal.innerHTML = `
            <div class="call-content">
                <h3>Incoming ${callData.type} call</h3>
                <p>From: ${callData.callerName}</p>
                <div class="call-actions">
                    <button class="accept-call" data-call-id="${callId}">
                        <i class="fas fa-phone"></i> Accept
                    </button>
                    <button class="reject-call" data-call-id="${callId}">
                        <i class="fas fa-phone-slash"></i> Reject
                    </button>
                </div>
        </div>
    `;
        
    document.body.appendChild(modal);

        const acceptBtn = modal.querySelector('.accept-call');
        const rejectBtn = modal.querySelector('.reject-call');
        
        acceptBtn.onclick = async () => {
            try {
                const answer = await createAnswer(callData.offer);
                await updateDoc(doc(db, 'calls', callId), {
                    status: 'accepted',
                    answer: answer
                });
                
                currentCall = { id: callId, ...callData };
                showCallModal(callData.type);
            modal.remove();
        } catch (error) {
                console.error('Error accepting call:', error);
                showNotification('Error accepting call', true);
            }
        };
        
        rejectBtn.onclick = async () => {
            try {
                await updateDoc(doc(db, 'calls', callId), {
                    status: 'rejected'
                });
                modal.remove();
    } catch (error) {
                console.error('Error rejecting call:', error);
            }
        };
    } catch (error) {
        console.error('Error handling incoming call:', error);
    }
}

// Update the handleFirestoreError function
function handleFirestoreError(error) {
    console.error('Firestore error:', error);
    
    // Check for connection errors
    if (error.code === 'permission-denied' || 
        error.message.includes('blocked') || 
        error.message.includes('ERR_BLOCKED_BY_CLIENT') ||
        error.message.includes('network error') ||
        error.message.includes('terminate')) {
        
        // Show connection error with specific instructions
        if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
            showConnectionError('It seems your ad blocker or privacy extension is blocking the connection. Please disable it for this site to continue.');
                } else {
            showConnectionError('Connection error. Please check your internet connection and try again.');
        }
        
        // Add event listener for when ad blocker is disabled
        window.addEventListener('online', async () => {
            const isConnected = await checkFirestoreConnection();
            if (isConnected) {
                window.location.reload();
            }
        });
        
        return true;
    }
    
    // For other errors, show a generic error message
    showNotification('Error connecting to the server. Please try again.', true);
    return false;
}

// Function to clean up duplicate DMs (can be called manually if needed)
async function cleanupDuplicateDMs() {
    try {
        console.log('Starting duplicate DM cleanup...');
        
        const dmsQuery = query(
            collection(db, 'directMessages'),
            where('participants', 'array-contains', currentUser.uid)
        );
        const dmsSnapshot = await getDocs(dmsQuery);

        if (dmsSnapshot.empty) {
            console.log('No DMs to clean up');
            return;
        }

        const emailGroups = new Map(); // email -> array of DMs
        
        // Group DMs by email
        dmsSnapshot.forEach(doc => {
            const dm = doc.data();
            const otherParticipantEmail = Object.values(dm.participantEmails || {}).find(email => email !== currentUser.email);
            
            if (otherParticipantEmail) {
                if (!emailGroups.has(otherParticipantEmail)) {
                    emailGroups.set(otherParticipantEmail, []);
                }
                emailGroups.get(otherParticipantEmail).push({ id: doc.id, ...dm });
            }
        });

        // Find and delete duplicates
        let deletedCount = 0;
        for (const [email, dms] of emailGroups) {
            if (dms.length > 1) {
                // Sort by last message time, keep the most recent
                dms.sort((a, b) => {
                    const timeA = a.lastMessageTime?.toDate() || new Date(0);
                    const timeB = b.lastMessageTime?.toDate() || new Date(0);
                    return timeB - timeA;
                });

                // Delete all but the first (most recent) DM
                for (let i = 1; i < dms.length; i++) {
                    try {
                        await deleteDoc(doc(db, 'directMessages', dms[i].id));
                        console.log('Deleted duplicate DM:', dms[i].id, 'for email:', email);
                        deletedCount++;
                    } catch (error) {
                        console.error('Error deleting duplicate DM:', dms[i].id, error);
                    }
                }
            }
        }

        console.log(`Cleanup complete. Deleted ${deletedCount} duplicate DMs.`);
        if (deletedCount > 0) {
            showNotification(`Cleaned up ${deletedCount} duplicate conversations`, false);
            // Reload DMs to reflect changes
            await loadDMs();
        }
    } catch (error) {
        console.error('Error during DM cleanup:', error);
        showNotification('Error cleaning up duplicate conversations', true);
    }
}

// Add cleanup function to window for manual execution
window.cleanupDuplicateDMs = cleanupDuplicateDMs;

// Function to delete conversation (group or DM)
async function deleteConversation(chatId, type) {
    try {
        // Confirm deletion
        const action = type === 'group' ? 'delete this group' : 'delete this conversation';
        const isConfirmed = confirm(`Are you sure you want to ${action}? This action cannot be undone.`);
        
        if (!isConfirmed) {
            return;
        }

        if (type === 'group') {
            // For groups, check if user is the creator
            const groupRef = doc(db, 'groups', chatId);
            const groupDoc = await getDoc(groupRef);
            
            if (!groupDoc.exists()) {
                throw new Error('Group not found');
            }
            
            const groupData = groupDoc.data();
            
            if (groupData.createdBy === currentUser.uid) {
                // Creator can delete the entire group
                await deleteDoc(groupRef);
                showNotification('Group deleted successfully');
            } else {
                // Other members can only leave the group
                const updatedMembers = groupData.members.filter(memberId => memberId !== currentUser.uid);
                await updateDoc(groupRef, {
                    members: updatedMembers
                });
                showNotification('You have left the group');
            }
            
            // Remove from UI
            const groupElement = document.querySelector(`[data-group-id="${chatId}"]`);
            if (groupElement) {
                groupElement.remove();
            }
            
        } else {
            // For DMs, delete the conversation
            const dmRef = doc(db, 'directMessages', chatId);
            await deleteDoc(dmRef);
            
            // Remove from UI
            const dmElement = document.querySelector(`[data-dm-id="${chatId}"]`);
            if (dmElement) {
                dmElement.remove();
            }
            
            showNotification('Conversation deleted successfully');
        }
        
        // If the deleted chat was currently selected, clear the chat area
        if (currentChat && currentChat.id === chatId) {
            closeChat();
        }
        
    } catch (error) {
        console.error('Error deleting conversation:', error);
        showNotification('Error deleting conversation. Please try again.', true);
    }
}

// Helper function to scroll to bottom of messages
function scrollToBottom(messagesContainer, force = false) {
    if (!messagesContainer) return;
    
    const isAtBottom = messagesContainer.scrollTop + messagesContainer.clientHeight >= messagesContainer.scrollHeight - 10;
    
    if (force || isAtBottom) {
        // Use multiple approaches to ensure scrolling works
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 50);
        
        // Additional scroll attempt with longer delay for reliability
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 150);
        
        // Force scroll behavior for better compatibility
        setTimeout(() => {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }
}

// --- Emoji Picker Functionality ---

const emojiData = {
    smileys: ["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥰","😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","🥱","😴","😌","😛","😜","😝","🤤","😒","😓","😔","😕","🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨","😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","😡","😠","🤬","😷","🤒","🤕","🤢","🤮","🥴","😇","🥳","🥺","🤠","🤡","🤥","🤫","🤭","🧐","🤓"],
    animals: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦥","🦦","🦨","🦡","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐓","🦃","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦦","🦥","🐁","🐀","🐿️","🦔"],
    food: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🥞","🧇","🧀","🍖","🍗","🥩","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🫔","🥙","🧆","🥚","🍳","🥘","🍲","🫕","🥣","🥗","🍿","🧈","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🥮","🍡","🥟","🥠","🥡","🦪","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾","🧊"],
    activities: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🥅","🏒","🏑","🥍","🏏","⛳","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️‍♂️","🏋️‍♀️","🤼‍♂️","🤼‍♀️","🤸‍♂️","🤸‍♀️","⛹️‍♂️","⛹️‍♀️","🤺","🤾‍♂️","🤾‍♀️","🏌️‍♂️","🏌️‍♀️","🏇","🧘‍♂️","🧘‍♀️","🏄‍♂️","🏄‍♀️","🏊‍♂️","🏊‍♀️","🤽‍♂️","🤽‍♀️","🚣‍♂️","🚣‍♀️","🧗‍♂️","🧗‍♀️","🚵‍♂️","🚵‍♀️","🚴‍♂️","🚴‍♀️","🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️","🎪","🤹‍♂️","🤹‍♀️","🎭","🩰","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🎸","🪕","🎻","🎲","♟️","🎯","🎳","🎮","🎰"],
    travel: ["✈️","🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🦯","🦽","🦼","🛴","🚲","🛵","🏍️","🛺","🚨","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊","🚉","🚁","🛩️","🛫","🛬","🪂","⛵","🛶","🚤","🛳️","⛴️","🛥️","🚢","⚓","🪝","⛽","🚧","🚦","🚥","🚏","🗺️","🗿","🗽","🗼","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","⛱️","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺","🏠","🏡","🏘️","🏚️","🏗️","🏭","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏛️","⛪","🕌","🛕","🕍","🕋","⛩️","🛤️","🛣️","🗾","🎑","🏞️","🌅","🌄","🌠","🎇","🎆","🌇","🌆","🏙️","🌃","🌌","🌉","🌁"],
    objects: ["💡","🔦","🏮","🪔","📱","📲","☎️","📞","📟","📠","🔋","🔌","💻","🖥️","🖨️","⌨️","🖱️","🖲️","💽","💾","💿","📀","🧮","🎥","🎞️","📽️","🎬","📺","📷","📸","📹","📼","🔍","🔎","🕯️","💸","💵","💴","💶","💷","💰","💳","🧾","💎","⚖️","🔧","🔨","⚒️","🛠️","⛏️","🔩","⚙️","🧰","🧲","🧪","🧫","🧬","🔬","🔭","📡","💉","🩸","💊","🩹","🩺","🚪","🛏️","🛋️","🚽","🚿","🛁","🪑","🚬","⚰️","🪦","⚱️","🧴","🧷","🧹","🧺","🧻","🧼","🪣","🧽","🧯","🛒","🚽","🚰","🚿","🛁","🪑","🛋️","🛏️","🚪","🗄️","🗑️","🛢️","🛎️","🧳","⌛","⏳","⌚","⏰","⏱️","⏲️","🕰️","🌡️","🗜️","🔒","🔓","🔏","🔐","🔑","🗝️","🔨","🛠️","⛏️","🔧","🔩","⚙️","🧰","🧲","🧪","🧫","🧬","🔬","🔭","📡"],
    symbols: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❓","❕","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❇️","✳️","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🛗","🚹","🚺","🚼","🚻","🚮","🎦","📶","🈁","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆓","🆕","🆚","🆑","🆘","🆔","🆚","🆑","🆘","🆔"],
    flags: ["🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇦🇫","🇦🇽","🇦🇱","🇩🇿","🇦🇸","🇦🇩","🇦🇴","🇦🇮","🇦🇶","🇦🇬","🇦🇷","🇦🇲","🇦🇼","🇦🇺","🇦🇹","🇦🇿","🇧🇸","🇧🇭","🇧🇩","🇧🇧","🇧🇾","🇧🇪","🇧🇿","🇧🇯","🇧🇲","🇧🇹","🇧🇴","🇧🇦","🇧🇼","🇧🇷","🇮🇴","🇻🇬","🇧🇳","🇧🇬","🇧🇫","🇧🇮","🇰🇭","🇨🇲","🇨🇦","🇨🇻","🇰🇾","🇨🇫","🇹🇩","🇨🇱","🇨🇳","🇨🇽","🇨🇨","🇨🇴","🇰🇲","🇨🇬","🇨🇩","🇨🇰","🇨🇷","🇨🇮","🇭🇷","🇨🇺","🇨🇼","🇨🇾","🇨🇿","🇩🇰","🇩🇯","🇩🇲","🇩🇴","🇪🇨","🇪🇬","🇸🇻","🇬🇶","🇪🇷","🇪🇪","🇸🇿","🇪🇹","🇪🇺","🇫🇰","🇫🇴","🇫🇯","🇫🇮","🇫🇷","🇬🇫","🇵🇫","🇹🇫","🇬🇦","🇬🇲","🇬🇪","🇩🇪","🇬🇭","🇬🇮","🇬🇷","🇬🇱","🇬🇩","🇬🇵","🇬🇺","🇬🇹","🇬🇬","🇬🇳","🇬🇼","🇬🇾","🇭🇹","🇭🇳","🇭🇰","🇭🇺","🇮🇸","🇮🇳","🇮🇩","🇮🇷","🇮🇶","🇮🇪","🇮🇲","🇮🇱","🇮🇹","🇯🇲","🇯🇵","🎌"]
};

const emojiBtn = document.getElementById('emoji-btn');
const emojiPickerModal = document.getElementById('emoji-picker-modal');
const closeEmojiBtn = document.getElementById('close-emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');
const emojiCategories = document.querySelectorAll('.emoji-category');
const messageInput = document.getElementById('message-input');

function showEmojiPicker(category = 'smileys') {
    emojiPickerModal.classList.add('active');
    populateEmojiGrid(category);
}

function hideEmojiPicker() {
    emojiPickerModal.classList.remove('active');
}

function populateEmojiGrid(category) {
    emojiGrid.innerHTML = '';
    (emojiData[category] || []).forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.textContent = emoji;
        btn.onclick = () => {
            insertEmoji(emoji);
            hideEmojiPicker();
        };
        emojiGrid.appendChild(btn);
    });
}

function insertEmoji(emoji) {
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const text = messageInput.value;
    messageInput.value = text.slice(0, start) + emoji + text.slice(end);
    messageInput.focus();
    messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
}

emojiBtn.addEventListener('click', () => showEmojiPicker());
closeEmojiBtn.addEventListener('click', hideEmojiPicker);
emojiPickerModal.addEventListener('click', (e) => {
    if (e.target === emojiPickerModal) hideEmojiPicker();
});
emojiCategories.forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        populateEmojiGrid(btn.dataset.category);
    });
});

// Function to show welcome state
function showWelcomeState() {
    const welcomeState = document.getElementById('welcome-state');
    const chatInterface = document.getElementById('chat-interface');
    if (welcomeState) welcomeState.style.display = 'flex';
    if (chatInterface) chatInterface.style.display = 'none';
    
    // Clear current chat
    currentChat = null;
    currentChatType = null;
    
    // Remove active states from chat items
    document.querySelectorAll('.dm-item, .group-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Hide action buttons
    const manageParticipantsBtn = document.getElementById('manage-participants-btn');
    const announcementBtn = document.getElementById('announcement-btn');
    if (manageParticipantsBtn) manageParticipantsBtn.style.display = 'none';
    if (announcementBtn) announcementBtn.style.display = 'none';
}

// Function to close chat and show welcome state
function closeChat() {
    showWelcomeState();
}