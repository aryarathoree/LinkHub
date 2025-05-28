// Initialize Firebase using the global firebase object
if (!firebase.apps.length) {
    firebase.initializeApp({
        apiKey: "AIzaSyB8UrXNtQzOC1CnoDDFFbPcURGOuXVbEIs",
        authDomain: "linkhub-172cf.firebaseapp.com",
        projectId: "linkhub-172cf",
        storageBucket: "linkhub-172cf.firebasestorage.app",
        messagingSenderId: "827745021850",
        appId: "1:827745021850:web:776587c4acd95a79a15423",
        measurementId: "G-G3X5HTZNPR"
    });
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Add connection state management
let isOnline = navigator.onLine;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5 seconds

// Add these state variables at the top with other state variables
let typingTimeout = null;
let isTyping = false;
let lastReadTimestamp = null;

// Add these variables at the top with other state variables
let reconnectTimeout = null;
let isReconnecting = false;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
let currentReconnectDelay = 1000; // Start with 1 second

// Update Firebase service references
const collection = (db, path) => db.collection(path);
const doc = (db, path, ...segments) => db.collection(path).doc(segments.join('/'));
const getDoc = (docRef) => docRef.get();
const getDocs = (query) => query.get();
const addDoc = (collectionRef, data) => collectionRef.add(data);
const setDoc = (docRef, data, options) => docRef.set(data, options);
const updateDoc = (docRef, data) => docRef.update(data);
const deleteDoc = (docRef) => docRef.delete();
const query = (collectionRef, ...queryConstraints) => {
    let q = collectionRef;
    queryConstraints.forEach(constraint => {
        if (constraint.type === 'where') {
            q = q.where(constraint.field, constraint.opStr, constraint.value);
        } else if (constraint.type === 'orderBy') {
            q = q.orderBy(constraint.field, constraint.direction);
        }
    });
    return q;
};
const where = (field, opStr, value) => ({ type: 'where', field, opStr, value });
const orderBy = (field, direction = 'asc') => ({ type: 'orderBy', field, direction });
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const arrayUnion = (...elements) => firebase.firestore.FieldValue.arrayUnion(...elements);
const onSnapshot = (query, callback, errorCallback) => query.onSnapshot(callback, errorCallback);
const enableNetwork = (db) => db.enableNetwork();
const disableNetwork = (db) => db.disableNetwork();

// Function to handle connection state changes
async function handleConnectionChange() {
    isOnline = navigator.onLine;
    if (isOnline) {
        try {
            await enableNetwork(db);
            // Reset reconnection delay
            currentReconnectDelay = 1000;
            // Clear any pending reconnection
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            // If we have a current chat, reload it
            if (currentChat) {
                if (currentChatType === 'group') {
                    await selectGroup(currentChat.id, currentChat);
                } else {
                    await selectDM(currentChat.id, currentChat);
                }
            }
            showNotification('Connection restored');
        } catch (error) {
            console.error('Error reconnecting:', error);
            showNotification('Failed to reconnect. Please refresh the page.', true);
        }
    } else {
        await disableNetwork(db);
        showNotification('You are offline. Changes will be saved when you reconnect.', true);
    }
}

// Add connection event listeners
window.addEventListener('online', handleConnectionChange);
window.addEventListener('offline', handleConnectionChange);

// State
let currentUser = null;
let currentChat = null;
let currentChatType = null;
let messageListener = null;
let peerConnection;
let localStream;
let remoteStream;
const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Add global call listener after Firebase initialization
const setupGlobalCallListener = () => {
    const callsRef = collection(db, 'calls');
    const q = query(
        callsRef, 
        where('status', '==', 'calling'),
        where('participants', 'array-contains', currentUser.uid)
    );
    
    return onSnapshot(q, async (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const callData = change.doc.data();
                
                // Only handle calls where current user is a participant but not the creator
                if (callData.createdBy !== currentUser.uid) {
                    // Show browser notification if permitted
                    if (Notification.permission === 'granted') {
                        new Notification('Incoming Call', {
                            body: `Incoming ${callData.type} call from ${callData.callerName || 'Unknown User'}`,
                            icon: '/icon.png'
                        });
                    }
                    
                    // If we're not in the chat where the call is coming from, switch to it
                    if (!currentChat || currentChat.id !== change.doc.id) {
                        const dmRef = doc(db, 'directMessages', change.doc.id);
                        const dmDoc = await getDoc(dmRef);
                        if (dmDoc.exists()) {
                            await selectDM(change.doc.id, dmDoc.data());
                        }
                    }
                    
                    // Handle the incoming call
                    await handleIncomingCall(callData);
                }
            }
        });
    });
};

// Request notification permission on auth state change
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        console.log('User is logged in:', user.email);
        // Add debug logging
        const token = await user.getIdToken();
        console.log('Auth token:', token);
        console.log('User ID:', user.uid);
        
        currentUser = user;
        
        try {
            // Create or update user document with retry logic
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL || null,
                lastSeen: serverTimestamp(),
                createdAt: serverTimestamp(),
                status: 'online'
            }, { merge: true });

            // Initialize UI elements
            initializeUI();
            // Load initial data
            await loadGroups();
            await loadDMs();
        } catch (error) {
            console.error('Error in auth state change:', error);
            if (error.code === 'auth/network-request-failed') {
                showConnectionError();
            } else {
                showNotification('Error initializing app. Please try again.', true);
            }
        }
        
        // Set up global call listener
        const unsubscribe = setupGlobalCallListener();
        
        // Store unsubscribe function for cleanup
        window.callListenerUnsubscribe = unsubscribe;
    } else {
        console.log('No user logged in, redirecting to index');
        window.location.href = 'index.html';

        // Clean up call listener on logout
        if (window.callListenerUnsubscribe) {
            window.callListenerUnsubscribe();
            window.callListenerUnsubscribe = null;
        }
    }
}, (error) => {
    console.error('Auth state change error:', error);
    if (error.code === 'auth/network-request-failed') {
        showConnectionError();
    } else {
        showNotification('Authentication error. Please try again.', true);
    }
});

// Enhanced logout function
async function handleLogout() {
    try {
        // Update user status before signing out
        if (currentUser) {
            const userRef = doc(db, 'users', currentUser.uid);
            await setDoc(userRef, {
                status: 'offline',
                lastSeen: serverTimestamp()
            }, { merge: true });
        }

        // Sign out and redirect to index.html
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error signing out:', error);
        showNotification('Error signing out. Please try again.', true);
    }
}

// Update initializeUI function
function initializeUI() {
    // Get all DOM elements
    const createGroupBtn = document.getElementById('create-group-btn');
    const newDmBtn = document.getElementById('new-dm-btn');
    const announcementBtn = document.getElementById('announcement-btn');
    const mediaBtn = document.getElementById('media-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages');
    const chatHeader = document.getElementById('chat-header');
    const chatControls = document.getElementById('chat-controls');
    const videoCallBtn = document.getElementById('video-call-btn');
    const voiceCallBtn = document.getElementById('voice-call-btn');
    const messageInputContainer = document.querySelector('.message-input-container');

    // Create modals if they don't exist
    let createGroupModal = document.getElementById('create-group-modal');
    if (!createGroupModal) {
        createGroupModal = document.createElement('div');
        createGroupModal.id = 'create-group-modal';
        createGroupModal.className = 'modal';
        createGroupModal.innerHTML = `
            <div class="modal-content">
                <h2>Create New Group</h2>
                <form id="create-group-form">
                    <div class="form-group">
                        <label for="group-name">Group Name</label>
                        <input type="text" id="group-name" required placeholder="Enter group name">
                    </div>
                    <div class="form-group">
                        <label for="group-type">Group Type</label>
                        <select id="group-type" required>
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="group-description">Description (Optional)</label>
                        <textarea id="group-description" placeholder="Enter group description"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="cancel-btn">Cancel</button>
                        <button type="submit" class="create-btn">Create Group</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(createGroupModal);
    }

    let newDmModal = document.getElementById('new-dm-modal');
    if (!newDmModal) {
        newDmModal = document.createElement('div');
        newDmModal.id = 'new-dm-modal';
        newDmModal.className = 'modal';
        newDmModal.innerHTML = `
            <div class="modal-content">
                <h2>New Message</h2>
                <div class="search-container">
                    <input type="text" id="user-search" placeholder="Search users by email...">
                    <div id="search-results" class="search-results"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(newDmModal);
    }

    let announcementModal = document.getElementById('announcement-modal');
    if (!announcementModal) {
        announcementModal = document.createElement('div');
        announcementModal.id = 'announcement-modal';
        announcementModal.className = 'modal';
        announcementModal.innerHTML = `
            <div class="modal-content">
                <h2>Create Announcement</h2>
                <form id="announcement-form">
                    <div class="form-group">
                        <label for="announcement-text">Announcement</label>
                        <textarea id="announcement-text" name="announcement-text" required placeholder="Enter your announcement"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="cancel-btn">Cancel</button>
                        <button type="submit" class="create-btn">Post Announcement</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(announcementModal);

        // Add event listeners for the modal
        const form = announcementModal.querySelector('#announcement-form');
        if (form) {
            form.addEventListener('submit', handleAnnouncement);
        }

        const cancelBtn = announcementModal.querySelector('.cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                announcementModal.classList.remove('active');
            });
        }

        announcementModal.addEventListener('click', (e) => {
            if (e.target === announcementModal) {
                announcementModal.classList.remove('active');
            }
        });
    }

    // Get form references after creating modals
    const createGroupForm = document.getElementById('create-group-form');
    const announcementForm = document.getElementById('announcement-form');

    // Initially hide all chat features including message input
    if (chatHeader) chatHeader.style.display = 'none';
    if (chatControls) chatControls.style.display = 'none';
    if (announcementBtn) announcementBtn.style.display = 'none';
    if (mediaBtn) mediaBtn.style.display = 'none';
    if (videoCallBtn) videoCallBtn.style.display = 'none';
    if (voiceCallBtn) voiceCallBtn.style.display = 'none';
    if (messageInputContainer) messageInputContainer.style.display = 'none';

    // Show welcome message in messages container
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h2>Welcome to LinkHub Chat</h2>
                <p>Select a conversation or start a new one to begin chatting</p>
                <div class="welcome-actions">
                    <button class="welcome-btn" onclick="document.getElementById('new-dm-btn').click()">
                        <i class="fas fa-user-plus"></i> New Message
                    </button>
                    <button class="welcome-btn" onclick="document.getElementById('create-group-btn').click()">
                        <i class="fas fa-users"></i> Create Group
                    </button>
                </div>
            </div>
        `;
    }

    // Add event listeners only if elements exist
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => {
            createGroupModal.classList.add('active');
        });
    }

    if (newDmBtn) {
        newDmBtn.addEventListener('click', () => {
            newDmModal.classList.add('active');
        });
    }

    if (announcementBtn) {
        announcementBtn.addEventListener('click', () => {
            if (currentChatType === 'group') {
                announcementModal.classList.add('active');
            } else {
                showNotification('Announcements can only be made in groups', true);
            }
        });
    }

    if (mediaBtn) {
        mediaBtn.addEventListener('click', handleMediaUpload);
    }

    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(messageInput.value);
            }
        });

        // Add typing indicator event listener
        messageInput.addEventListener('input', handleTyping);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Add form submit handlers
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', handleCreateGroup);
    }

    if (announcementForm) {
        announcementForm.addEventListener('submit', handleAnnouncement);
    }

    // Add call button handlers
    if (videoCallBtn) {
        videoCallBtn.addEventListener('click', async () => {
            if (!currentChat || currentChatType !== 'dm') {
                showNotification('Video calls are only available in direct messages', true);
                return;
            }

            // Check if other user is online
            const otherParticipantId = currentChat.participants.find(id => id !== currentUser.uid);
            const otherUserRef = doc(db, 'users', otherParticipantId);
            const otherUserDoc = await getDoc(otherUserRef);
            
            if (!otherUserDoc.exists() || otherUserDoc.data().status !== 'online') {
                showNotification('User is offline', true);
                return;
            }

            // Initialize call document if it doesn't exist
            const callRef = doc(db, 'calls', currentChat.id);
            await setDoc(callRef, {
                participants: currentChat.participants,
                status: 'calling',
                startedAt: serverTimestamp(),
                type: 'video'
            }, { merge: true });

            startCall(true);
            listenForSignaling();
        });
    }

    if (voiceCallBtn) {
        voiceCallBtn.addEventListener('click', async () => {
            if (!currentChat || currentChatType !== 'dm') {
                showNotification('Voice calls are only available in direct messages', true);
                return;
            }

            // Check if other user is online
            const otherParticipantId = currentChat.participants.find(id => id !== currentUser.uid);
            const otherUserRef = doc(db, 'users', otherParticipantId);
            const otherUserDoc = await getDoc(otherUserRef);
            
            if (!otherUserDoc.exists() || otherUserDoc.data().status !== 'online') {
                showNotification('User is offline', true);
                return;
            }

            // Initialize call document if it doesn't exist
            const callRef = doc(db, 'calls', currentChat.id);
            await setDoc(callRef, {
                participants: currentChat.participants,
                status: 'calling',
                startedAt: serverTimestamp(),
                type: 'voice'
            }, { merge: true });

            startCall(false);
            listenForSignaling();
        });
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
            btn.closest('.modal').classList.remove('active');
        });
    });

    // Add user search functionality
    const searchInput = document.getElementById('user-search');
    const searchResults = document.getElementById('search-results');
    
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 3) {
                searchResults.innerHTML = '';
                return;
            }

            searchTimeout = setTimeout(async () => {
                const users = await searchUsers(query);
                searchResults.innerHTML = '';
                
                if (users.length === 0) {
                    searchResults.innerHTML = '<div class="no-results">No users found</div>';
                    return;
                }

                users.forEach(user => {
                    const userElement = document.createElement('div');
                    userElement.className = 'user-result';
                    userElement.innerHTML = `
                        <div class="user-info">
                            <div class="user-name">${user.displayName || user.email}</div>
                            <div class="user-email">${user.email}</div>
                        </div>
                    `;
                    
                    userElement.addEventListener('click', async () => {
                        try {
                            if (!user.id || !user.email) {
                                throw new Error('Invalid user data');
                            }

                            const dm = await createOrGetDM(
                                user.id,
                                user.displayName || user.email.split('@')[0],
                                user.email
                            );
                            
                            if (newDmModal) {
                                newDmModal.classList.remove('active');
                            }
                            
                            await selectDM(dm.id, dm);
                            
                            searchInput.value = '';
                            searchResults.innerHTML = '';
                            await loadDMs();
                        } catch (error) {
                            console.error('Error starting DM:', error);
                            searchResults.innerHTML = `
                                <div class="error-message">
                                    <i class="fas fa-exclamation-circle"></i>
                                    Failed to start conversation. Please try again.
                                </div>
                            `;
                        }
                    });
                    
                    searchResults.appendChild(userElement);
                });
            }, 300);
        });
    }
}

// Load groups for the current user
async function loadGroups() {
    try {
        console.log('Loading groups for user:', currentUser.uid);
        const groupsRef = collection(db, 'groups');
        const q = query(
            groupsRef,
            where('members', 'array-contains', currentUser.uid)
        );
        
        const snapshot = await getDocs(q);
        console.log('Groups query result:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const groupsList = document.getElementById('group-list');
        if (!groupsList) {
            console.error('Group list element not found');
            return;
        }
        
        groupsList.innerHTML = '';
        
        if (snapshot.empty) {
            console.log('No groups found for user');
            groupsList.innerHTML = '<div class="no-chats">No groups yet</div>';
            return;
        }
        
        snapshot.forEach(doc => {
            const group = doc.data();
            console.log('Processing group:', doc.id, group);
            const groupElement = createGroupElement(doc.id, group);
            groupsList.appendChild(groupElement);
        });
    } catch (error) {
        console.error('Error loading groups:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        showNotification('Error loading groups. Please try again.', true);
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
                dmsSnapshot.forEach(doc => {
                    const dm = doc.data();
                    const dmElement = createDMElement(doc.id, dm);
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
                // Sort in memory
                const sortedDMs = basicSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .sort((a, b) => {
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
        const dmList = document.getElementById('dm-list');
        if (dmList) {
            dmList.innerHTML = '<div class="error-message">Error loading messages</div>';
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
    
    // Add invite button for private groups
    if (group.type === 'private') {
        const inviteBtn = document.createElement('button');
        inviteBtn.className = 'invite-btn';
        inviteBtn.innerHTML = '<i class="fas fa-user-plus"></i>';
        inviteBtn.title = 'Invite Member';
        inviteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showInviteMemberModal();
        });
        actions.appendChild(inviteBtn);
    }
    
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
    const otherParticipantId = dm.participants.find(id => id !== currentUser.uid);
    const otherParticipantName = dm.participantNames?.[otherParticipantId] || 
                                dm.participantEmails?.[otherParticipantId]?.split('@')[0] || 
                                'Unknown User';
    name.textContent = otherParticipantName;
    
    const email = document.createElement('div');
    email.className = 'dm-email';
    email.textContent = dm.participantEmails?.[otherParticipantId] || '';
    
    const lastMessage = document.createElement('div');
    lastMessage.className = 'dm-last-message';
    if (dm.lastMessage) {
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
        document.querySelector(`[data-group-id="${groupId}"]`).classList.add('active');
        
        // Show chat features including message input
        const chatHeader = document.getElementById('chat-header');
        const chatControls = document.getElementById('chat-controls');
        const messageInputContainer = document.querySelector('.message-input-container');
        const announcementBtn = document.getElementById('announcement-btn');
        const mediaBtn = document.getElementById('media-btn');
        
        if (chatHeader) chatHeader.style.display = 'flex';
        if (chatControls) chatControls.style.display = 'flex';
        if (messageInputContainer) messageInputContainer.style.display = 'flex';
        if (announcementBtn) announcementBtn.style.display = 'block';
        if (mediaBtn) mediaBtn.style.display = 'block';
        
        // Update chat header
        document.getElementById('current-chat-name').textContent = group.name;
        document.getElementById('chat-type').textContent = group.type;
        
        // Load messages
        await loadMessages(groupId, 'group');
    } catch (error) {
        console.error('Error selecting group:', error);
        showNotification('Error loading group chat', true);
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

        let dmElement = document.querySelector(`[data-dm-id="${dmId}"]`);
        if (!dmElement) {
            dmElement = createDMElement(dmId, dm);
            const dmList = document.getElementById('dm-list');
            if (dmList) {
                dmList.appendChild(dmElement);
            }
        }
        
        if (dmElement) {
            dmElement.classList.add('active');
        }
        
        // Show chat features including message input
        const chatHeader = document.getElementById('chat-header');
        const chatControls = document.getElementById('chat-controls');
        const messageInputContainer = document.querySelector('.message-input-container');
        const videoCallBtn = document.getElementById('video-call-btn');
        const voiceCallBtn = document.getElementById('voice-call-btn');
        const mediaBtn = document.getElementById('media-btn');
        
        if (chatHeader) chatHeader.style.display = 'flex';
        if (chatControls) chatControls.style.display = 'flex';
        if (messageInputContainer) messageInputContainer.style.display = 'flex';
        if (videoCallBtn) videoCallBtn.style.display = 'block';
        if (voiceCallBtn) voiceCallBtn.style.display = 'block';
        if (mediaBtn) mediaBtn.style.display = 'block';
        
        // Update chat header
        const chatName = document.getElementById('current-chat-name');
        const chatType = document.getElementById('chat-type');
        
        if (chatName) {
            const otherParticipantId = dm.participants.find(id => id !== currentUser.uid);
            const otherParticipantName = dm.participantNames?.[otherParticipantId] || 
                                       dm.participantEmails?.[otherParticipantId]?.split('@')[0] || 
                                       'Unknown User';
            chatName.textContent = otherParticipantName;
        }
        if (chatType) {
            chatType.textContent = 'Direct Message';
        }
        
        // Load messages
        await loadMessages(dmId, 'dm');
    } catch (error) {
        console.error('Error selecting DM:', error);
        showNotification('Error loading direct message', true);
    }
}

// Load messages for a chat with proper error handling
async function loadMessages(chatId, type) {
    try {
        // Clear any existing reconnection timeout
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        // Remove existing listener if any
        if (messageListener) {
            messageListener();
            messageListener = null;
        }

        const messagesRef = type === 'group' 
            ? collection(db, 'groups', chatId, 'messages')
            : collection(db, 'directMessages', chatId, 'messages');
            
        const chatRef = type === 'group' 
            ? doc(db, 'groups', chatId)
            : doc(db, 'directMessages', chatId);
            
        const chatDoc = await getDoc(chatRef);
        if (!chatDoc.exists) {  // Changed from chatDoc.exists() to chatDoc.exists
            throw new Error('Chat not found');
        }

        const chat = chatDoc.data();
        
        if (type === 'group') {
            // Check if the group is public or if user is a member
            if (chat.type === 'private' && !chat.members?.includes(currentUser.uid)) {
                throw new Error('You are not a member of this group');
            }
        } else {
            if (!chat.participants?.includes(currentUser.uid)) {
                throw new Error('You are not a participant in this conversation');
            }
        }

        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;

        // Clear existing messages except temporary ones
        const tempMessages = messagesContainer.querySelectorAll('.temp-message');
        messagesContainer.innerHTML = '';
        tempMessages.forEach(msg => messagesContainer.appendChild(msg));

        // Keep track of processed message IDs
        const processedMessageIds = new Set(
            Array.from(tempMessages).map(msg => msg.dataset.messageId)
        );

        // Set up real-time listener with error handling
        const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));
        messageListener = onSnapshot(messagesQuery, 
            snapshot => {
                // Reset reconnection delay on successful update
                currentReconnectDelay = 1000;
                
                snapshot.docChanges().forEach(change => {
                    const messageId = change.doc.id;
                    const message = { id: messageId, ...change.doc.data() };
                    
                    // Skip if we've already processed this message
                    if (processedMessageIds.has(messageId)) {
                        return;
                    }

                    // If this is a new message from the current user with a tempId
                    if (change.type === 'added' && message.senderId === currentUser.uid && message.tempId) {
                        // Find and update the temporary message
                        const tempMessage = messagesContainer.querySelector(`[data-message-id="${message.tempId}"]`);
                        if (tempMessage) {
                            tempMessage.dataset.messageId = messageId;
                            tempMessage.classList.remove('sending', 'temp-message');
                            tempMessage.classList.add('sent');
                            updateMessageStatus(tempMessage, 'sent');
                            processedMessageIds.add(messageId);
                            return;
                        }
                    }
                    
                    if (change.type === 'added') {
                        const messageElement = createMessageElement(message);
                        messageElement.classList.add('new');
                        messagesContainer.appendChild(messageElement);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        processedMessageIds.add(messageId);

                        if (type === 'dm') {
                            updateLastMessage(chatId, message);
                        }
                    } else if (change.type === 'modified') {
                        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                        if (messageElement) {
                            updateMessageStatus(messageElement, message.status);
                        }
                    }
                });
            },
            error => {
                console.error('Error in message listener:', error);
                
                // Handle specific error types
                if (error.code === 'unavailable' || 
                    error.code === 'failed-precondition' || 
                    error.message?.includes('QUIC_PROTOCOL_ERROR')) {
                    
                    // Clear existing listener
                    if (messageListener) {
                        messageListener();
                        messageListener = null;
                    }
                    
                    // Show error message
                    const messagesContainer = document.getElementById('messages');
                    if (messagesContainer) {
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'error-message';
                        errorDiv.innerHTML = `
                            <i class="fas fa-exclamation-circle"></i>
                            Connection lost. Attempting to reconnect...
                        `;
                        messagesContainer.appendChild(errorDiv);
                    }
                    
                    // Attempt reconnection
                    if (!isReconnecting) {
                        handleReconnect();
                    }
                } else {
                    showNotification('Error loading messages. Please refresh the page.', true);
                }
            }
        );

        // Set up typing indicator listener with error handling
        const typingListener = onSnapshot(chatRef, 
            (doc) => {
                // Reset reconnection delay on successful update
                currentReconnectDelay = 1000;
                
                const data = doc.data();
                if (data?.typing) {
                    const typingUsers = Object.entries(data.typing)
                        .filter(([uid, isTyping]) => isTyping && uid !== currentUser.uid)
                        .map(([uid]) => data.participantNames?.[uid] || 'Someone');
                    
                    const typingIndicator = document.getElementById('typing-indicator');
                    if (typingIndicator) {
                        if (typingUsers.length > 0) {
                            typingIndicator.textContent = `${typingUsers.join(', ')} ${typingUsers.length === 1 ? 'is' : 'are'} typing...`;
                            typingIndicator.style.display = 'block';
                        } else {
                            typingIndicator.style.display = 'none';
                        }
                    }
                }
            },
            error => {
                console.error('Error in typing listener:', error);
                // Don't show notification for typing errors
            }
        );

        return () => {
            typingListener();
        };

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
        
        // If it's a network error, attempt reconnection
        if (error.code === 'unavailable' || 
            error.code === 'failed-precondition' || 
            error.message?.includes('QUIC_PROTOCOL_ERROR')) {
            handleReconnect();
        }
    }
}

// Function to update last message in chat list
async function updateLastMessage(chatId, message) {
    try {
        const dmRef = doc(db, 'directMessages', chatId);
        await setDoc(dmRef, {
            lastMessage: message.text,
            lastMessageTime: message.timestamp,
            lastMessageSender: message.userName
        }, { merge: true });

        // Update the DM element in the list
        const dmElement = document.querySelector(`[data-dm-id="${chatId}"]`);
        if (dmElement) {
            const lastMessageElement = dmElement.querySelector('.dm-last-message');
            if (lastMessageElement) {
                const sender = message.userId === currentUser.uid ? 'You' : message.userName;
                lastMessageElement.textContent = `${sender}: ${message.text}`;
            }
        }
    } catch (error) {
        console.error('Error updating last message:', error);
    }
}

// Function to send message with improved duplicate prevention
async function sendMessage(text) {
    if (!text.trim() || !currentChat || !currentUser) {
        showNotification('Cannot send message: Invalid chat context or empty message', true);
        return;
    }
    
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages');
    
    // Prevent duplicate sends
    if (messageInput && messageInput.disabled) {
        return;
    }
    
    // Generate a temporary ID for the message
    const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        // Disable input while sending
        if (messageInput) {
            messageInput.disabled = true;
            messageInput.value = '';
        }

        const messagesRef = currentChatType === 'group'
            ? collection(db, 'groups', currentChat.id, 'messages')
            : collection(db, 'directMessages', currentChat.id, 'messages');

        // Create message data without read receipts
        const messageData = {
            text: text.trim(),
            senderId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email.split('@')[0],
            timestamp: serverTimestamp(),
            status: 'sending',
            tempId: tempMessageId
        };

        // Add message to UI immediately with optimistic update
        if (messagesContainer) {
            const tempMessageElement = createMessageElement({
                ...messageData,
                id: tempMessageId,
                timestamp: new Date()
            });
            tempMessageElement.dataset.messageId = tempMessageId;
            tempMessageElement.classList.add('sending', 'new', 'temp-message');
            messagesContainer.appendChild(tempMessageElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Add message to Firestore with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        let success = false;
        let messageRef;

        while (retryCount < maxRetries && !success) {
            try {
                messageRef = await addDoc(messagesRef, {
                    ...messageData,
                    status: 'sent'
                });

                success = true;
            } catch (error) {
                retryCount++;
                if (retryCount === maxRetries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
        }

        // Update last message in chat document
        if (currentChatType === 'dm') {
            const chatRef = doc(db, 'directMessages', currentChat.id);
            await setDoc(chatRef, {
                lastMessage: text.trim(),
                lastMessageTime: serverTimestamp(),
                lastMessageSender: currentUser.displayName || currentUser.email.split('@')[0],
                lastMessageSenderId: currentUser.uid
            }, { merge: true });
        }

        // Clear typing indicator
        if (currentChat) {
            const chatRef = currentChatType === 'group'
                ? doc(db, 'groups', currentChat.id)
                : doc(db, 'directMessages', currentChat.id);
            await setDoc(chatRef, {
                [`typing.${currentUser.uid}`]: false
            }, { merge: true });
        }

    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message. Please try again.', true);
        
        // Remove failed message from UI
        const failedMessage = messagesContainer?.querySelector(`[data-message-id="${tempMessageId}"]`);
        if (failedMessage) {
            failedMessage.remove();
        }
    } finally {
        if (messageInput) {
            messageInput.disabled = false;
            messageInput.focus();
        }
    }
}

// Function to update message status in UI
function updateMessageStatus(messageElement, status) {
    if (!messageElement) return;

    const content = messageElement.querySelector('.message-content');
    if (!content) return;

    let statusElement = content.querySelector('.message-status');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.className = 'message-status';
        statusElement.setAttribute('title', status === 'sending' ? 'Sending...' : 
                                     status === 'sent' ? 'Sent' :
                                     status === 'delivered' ? 'Delivered' : 'Read');
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

// Function to create message element with improved real-time features
function createMessageElement(message) {
    if (!message) return null;

    const div = document.createElement('div');
    div.className = `message ${message.senderId === currentUser.uid ? 'message-sent' : 'message-received'}`;
    if (message.id) {
        div.dataset.messageId = message.id;
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const header = document.createElement('div');
    header.className = 'message-header';
    
    const name = document.createElement('span');
    name.className = 'message-username';
    
    // Set the sender name based on message type and sender
    if (message.isAnnouncement) {
        name.textContent = '📢 Announcement';
    } else if (message.senderId === currentUser.uid) {
        name.textContent = 'You';
    } else {
        name.textContent = message.userName || 'Unknown User';
    }
    
    const time = document.createElement('span');
    time.className = 'message-time';
    const timestamp = message.timestamp?.toDate ? message.timestamp.toDate() : message.timestamp || new Date();
    time.textContent = new Date(timestamp).toLocaleTimeString();
    
    const text = document.createElement('p');
    text.className = 'message-text';
    
    // Add support for links and handle announcement styling
    if (message.isAnnouncement) {
        text.className += ' announcement-text';
        text.innerHTML = `<strong>${message.userName}:</strong> ${message.text}`;
    } else {
        // Enhanced link detection and formatting
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        const formattedText = message.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(linkRegex, url => {
                try {
                    const urlObj = new URL(url);
                    return `<a href="${urlObj.href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
                } catch {
                    return url;
                }
            });
        text.innerHTML = formattedText;
    }
    
    header.appendChild(name);
    header.appendChild(time);
    content.appendChild(header);
    content.appendChild(text);

    // Add simple status indicator for sent messages only
    if (message.senderId === currentUser.uid) {
        const status = document.createElement('div');
        status.className = 'message-status';
        status.innerHTML = message.status === 'sending' ? 
            '<i class="fas fa-clock"></i>' : 
            '<i class="fas fa-check"></i>';
        content.appendChild(status);
    }

    // Add message actions
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.setAttribute('role', 'toolbar');
    actions.setAttribute('aria-label', 'Message actions');
    
    if (message.senderId === currentUser.uid) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'message-action-btn delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = 'Delete message';
        deleteBtn.setAttribute('aria-label', 'Delete message');
        deleteBtn.onclick = () => {
            if (confirm('Are you sure you want to delete this message?')) {
                deleteMessage(message.id);
            }
        };
        actions.appendChild(deleteBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn copy-btn';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.title = 'Copy message';
    copyBtn.setAttribute('aria-label', 'Copy message');
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(message.text || '')
            .then(() => {
                showNotification('Message copied to clipboard');
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                }, 2000);
            })
            .catch(() => showNotification('Failed to copy message', true));
    };
    actions.appendChild(copyBtn);

    div.appendChild(content);
    div.appendChild(actions);
    
    return div;
}

// Function to delete message with improved ID handling
async function deleteMessage(messageId) {
    if (!messageId || !currentChat || !currentUser) return;

    try {
        // First check if it's a temporary message
        const messagesContainer = document.getElementById('messages');
        const messageElement = messagesContainer?.querySelector(`[data-message-id="${messageId}"]`);
        
        if (messageElement) {
            // If it's a temporary message, just remove it from UI
            if (messageId.startsWith('temp_')) {
                messageElement.remove();
                return;
            }
        }

        const messagesRef = currentChatType === 'group'
            ? collection(db, 'groups', currentChat.id, 'messages')
            : collection(db, 'directMessages', currentChat.id, 'messages');

        // Get the message first to verify ownership
        const messageDoc = doc(messagesRef, messageId);
        const messageSnapshot = await getDoc(messageDoc);
        
        if (!messageSnapshot.exists()) {
            // If message not found in Firestore, try to find it in UI
            if (messageElement) {
                messageElement.remove();
                showNotification('Message removed from view');
                return;
            }
            throw new Error('Message not found');
        }

        const messageData = messageSnapshot.data();
        if (messageData.senderId !== currentUser.uid) {
            throw new Error('You can only delete your own messages');
        }

        // Delete from Firestore
        await deleteDoc(messageDoc);

        // Remove from UI if still present
        if (messageElement) {
            messageElement.remove();
        }

        showNotification('Message deleted');
    } catch (error) {
        console.error('Error deleting message:', error);
        
        // If it's a "not found" error but we have the element, just remove it
        if (error.message === 'Message not found' && messageElement) {
            messageElement.remove();
            showNotification('Message removed from view');
            return;
        }
        
        showNotification(error.message || 'Failed to delete message', true);
    }
}

// Update showNotification function to handle errors
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
            const storageRef = ref(storage, `media/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            
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
        // First check if the user is authenticated
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Ensure we're using the correct user ID
        const targetUserId = userId || currentUser.uid;

        // Get the user document
        const userRef = doc(db, 'users', targetUserId);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            // If user document doesn't exist, create it with basic info
            const newUserData = {
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email.split('@')[0],
                photoURL: currentUser.photoURL || null,
                lastSeen: serverTimestamp(),
                createdAt: serverTimestamp(),
                status: 'online'
            };

            try {
                // Use set with merge to avoid overwriting existing data
                await setDoc(userRef, newUserData, { merge: true });
                return newUserData;
            } catch (createError) {
                console.error('Error creating user profile:', createError);
                // Return basic info even if creation fails
                return {
                    email: currentUser.email,
                    displayName: currentUser.displayName || currentUser.email.split('@')[0],
                    photoURL: currentUser.photoURL || null,
                    status: 'offline'
                };
            }
        }

        // If document exists, return the data
        const userData = userDoc.data();
        return {
            ...userData,
            // Ensure required fields exist
            email: userData.email || currentUser.email,
            displayName: userData.displayName || currentUser.displayName || currentUser.email.split('@')[0],
            photoURL: userData.photoURL || currentUser.photoURL || null,
            status: userData.status || 'offline'
        };
    } catch (error) {
        console.error('Error loading profile:', error);
        
        // Show user-friendly error message
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            ${error.message === 'Missing or insufficient permissions.' 
                ? 'Unable to access profile. Please check your permissions.'
                : 'Error loading profile. Please try again.'}
        `;
        document.body.appendChild(errorMessage);
        
        // Remove error message after 5 seconds
        setTimeout(() => {
            errorMessage.remove();
        }, 5000);

        // Return basic user info if profile can't be loaded
        return {
            email: currentUser?.email || '',
            displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
            photoURL: currentUser?.photoURL || null,
            status: 'offline'
        };
    }
}

// Function to create or update user profile
async function createOrUpdateUserProfile() {
    try {
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        const userData = {
            email: currentUser.email,
            displayName: currentUser.displayName || currentUser.email.split('@')[0],
            photoURL: currentUser.photoURL || null,
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
            status: 'online'
        };

        try {
            // Use set with merge to avoid overwriting existing data
            const userRef = doc(db, 'users', currentUser.uid);
            await setDoc(userRef, userData, { merge: true });
            return userData;
        } catch (error) {
            console.error('Error updating profile:', error);
            // Return the data even if update fails
            return userData;
        }
    } catch (error) {
        console.error('Error in createOrUpdateUserProfile:', error);
        throw error;
    }
}

// Function to handle user status
async function updateUserStatus(status) {
    try {
        if (!currentUser) return;

        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, {
            status: status,
            lastSeen: serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

// Add event listeners for user status
window.addEventListener('online', () => updateUserStatus('online'));
window.addEventListener('offline', () => updateUserStatus('offline'));
window.addEventListener('beforeunload', () => updateUserStatus('offline'));

// Add styles for profile-related elements
const profileStyles = document.createElement('style');
profileStyles.textContent = `
    .profile-container {
        padding: 20px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 12px;
        border: 1px solid var(--neon-pink);
        margin: 10px;
    }

    .profile-header {
        display: flex;
        align-items: center;
        gap: 15px;
        margin-bottom: 20px;
    }

    .profile-avatar {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: rgba(255, 0, 128, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--neon-pink);
        box-shadow: 0 0 15px var(--neon-pink);
    }

    .profile-avatar i {
        font-size: 2em;
        color: var(--neon-pink);
    }

    .profile-info {
        flex: 1;
    }

    .profile-name {
        font-size: 1.5em;
        color: var(--neon-pink);
        margin-bottom: 5px;
        font-family: 'Orbitron', sans-serif;
    }

    .profile-email {
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.9em;
    }

    .profile-status {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 0.8em;
        margin-top: 5px;
    }

    .status-online {
        background: rgba(0, 255, 0, 0.2);
        color: #00ff00;
        border: 1px solid #00ff00;
    }

    .status-offline {
        background: rgba(255, 0, 0, 0.2);
        color: #ff0000;
        border: 1px solid #ff0000;
    }

    .profile-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }

    .profile-btn {
        padding: 8px 16px;
        border: 1px solid var(--neon-pink);
        background: transparent;
        color: var(--neon-pink);
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-family: 'Orbitron', sans-serif;
    }

    .profile-btn:hover {
        background: var(--neon-pink);
        color: #fff;
        box-shadow: 0 0 10px var(--neon-pink);
    }
`;
document.head.appendChild(profileStyles);

// Function to handle group creation
async function handleCreateGroup(e) {
    e.preventDefault();
    
    try {
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        const form = e.target;
        const groupName = form.querySelector('#group-name').value.trim();
        const groupType = form.querySelector('#group-type').value;
        const groupDescription = form.querySelector('#group-description').value.trim();

        if (!groupName) {
            throw new Error('Group name is required');
        }

        // Create group data
        const groupData = {
            name: groupName,
            type: groupType,
            description: groupDescription,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            members: [currentUser.uid],
            memberNames: {
                [currentUser.uid]: currentUser.displayName || currentUser.email.split('@')[0]
            }
        };

        // Add group to Firestore
        const groupRef = await addDoc(collection(db, 'groups'), groupData);

        // Create initial announcement
        const announcementsRef = collection(db, 'groups', groupRef.id, 'announcements');
        await addDoc(announcementsRef, {
            text: 'Group created',
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            type: 'system',
            userName: currentUser.displayName || currentUser.email.split('@')[0]
        });

        // Add system message to messages collection
        const messagesRef = collection(db, 'groups', groupRef.id, 'messages');
        await addDoc(messagesRef, {
            text: 'Group created',
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            type: 'system',
            userName: currentUser.displayName || currentUser.email.split('@')[0],
            isSystem: true
        });

        // Close modal and show success message
        const modal = document.getElementById('create-group-modal');
        if (modal) {
            modal.classList.remove('active');
        }

        showNotification('Group created successfully');

        // Reload groups list
        await loadGroups();

        // Select the new group
        await selectGroup(groupRef.id, groupData);

    } catch (error) {
        console.error('Error creating group:', error);
        showNotification(error.message || 'Failed to create group', true);
    }
}

// Function to handle announcement creation
async function handleAnnouncement(e) {
    e.preventDefault();
    console.log('handleAnnouncement called');
    console.log('event target:', e.target);
    console.log('form innerHTML:', e.target.innerHTML);
    console.log('announcementTextInput:', e.target.querySelector('#announcement-text'));
    try {
        if (!currentUser || !currentChat || currentChatType !== 'group') {
            throw new Error('Invalid chat context for announcement');
        }

        const form = e.target;
        if (!form) {
            throw new Error('Form element not found');
        }

        const announcementTextInput = form.querySelector('#announcement-text');
        if (!announcementTextInput) {
            throw new Error('Announcement text input not found');
        }

        const announcementText = announcementTextInput.value.trim();
        if (!announcementText) {
            throw new Error('Announcement text is required');
        }

        // Create announcement data
        const announcementData = {
            text: announcementText,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            type: 'announcement',
            userName: currentUser.displayName || currentUser.email.split('@')[0]
        };

        // Add announcement to Firestore
        const announcementsRef = collection(db, 'groups', currentChat.id, 'announcements');
        await addDoc(announcementsRef, announcementData);

        // Add announcement to messages collection for display
        const messagesRef = collection(db, 'groups', currentChat.id, 'messages');
        await addDoc(messagesRef, {
            ...announcementData,
            isAnnouncement: true
        });

        // Close modal and show success message
        const modal = document.getElementById('announcement-modal');
        if (modal) {
            modal.classList.remove('active');
        }

        showNotification('Announcement posted successfully');

        // Clear form
        form.reset();

    } catch (error) {
        console.error('Error creating announcement:', error);
        showNotification(error.message || 'Failed to post announcement', true);
    }
}

// Add styles for DM items
const dmStyles = document.createElement('style');
dmStyles.textContent = `
    .dm-item {
        display: flex;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid rgba(255, 0, 128, 0.1);
        cursor: pointer;
        transition: background-color 0.3s;
        position: relative;
        width: 100%;
        box-sizing: border-box;
    }

    .dm-item:hover {
        background-color: rgba(255, 0, 128, 0.05);
    }

    .dm-item.active {
        background-color: rgba(255, 0, 128, 0.1);
    }

    .dm-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 0, 128, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 10px;
        flex-shrink: 0;
    }

    .dm-avatar i {
        color: var(--neon-pink);
        font-size: 1.2em;
    }

    .dm-info {
        flex: 1;
        min-width: 0; /* Enable text truncation */
        margin-right: 10px;
        overflow: hidden;
    }

    .dm-name {
        font-weight: bold;
        color: var(--neon-pink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
        max-width: 100%;
    }

    .dm-email {
        font-size: 0.8em;
        color: #888;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
        max-width: 100%;
    }

    .dm-last-message {
        font-size: 0.9em;
        color: #888;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .dm-actions {
        display: flex;
        align-items: center;
        margin-left: auto;
        opacity: 0;
        transition: opacity 0.3s;
        flex-shrink: 0;
    }

    .dm-item:hover .dm-actions {
        opacity: 1;
    }

    .delete-btn {
        background: none;
        border: none;
        color: var(--neon-pink);
        cursor: pointer;
        padding: 5px;
        border-radius: 4px;
        transition: all 0.3s;
        flex-shrink: 0;
    }

    .delete-btn:hover {
        background: rgba(255, 0, 128, 0.1);
        transform: scale(1.1);
    }

    .delete-btn i {
        font-size: 0.9em;
    }

    /* Add a subtle glow effect on hover */
    .dm-item:hover .dm-avatar {
        box-shadow: 0 0 10px var(--neon-pink);
    }

    /* Add a subtle animation for the last message */
    .dm-last-message {
        transition: color 0.3s;
    }

    .dm-item:hover .dm-last-message {
        color: #fff;
    }
`;
document.head.appendChild(dmStyles);

// Add enhanced chat interface styles
const enhancedChatStyles = document.createElement('style');
enhancedChatStyles.textContent = `
    /* Chat Container Layout */
    .chat-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        position: relative;
    }

    /* Messages Container */
    #messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: rgba(0, 0, 0, 0.2);
        margin: 0;
        height: 100vh; /* Full height when no chat is selected */
        scroll-behavior: smooth;
    }

    /* Welcome Message */
    .welcome-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        padding: 20px;
        color: rgba(255, 255, 255, 0.7);
        background: rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(10px);
    }

    .welcome-icon {
        font-size: 4em;
        color: var(--neon-pink);
        margin-bottom: 30px;
        animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
        0%, 100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-15px);
        }
    }

    .welcome-message h2 {
        color: var(--neon-pink);
        font-size: 2.2em;
        margin-bottom: 15px;
        text-shadow: 0 0 15px var(--neon-pink);
        font-family: 'Orbitron', sans-serif;
    }

    .welcome-message p {
        font-size: 1.2em;
        margin-bottom: 30px;
        color: rgba(255, 255, 255, 0.8);
        font-family: 'Orbitron', sans-serif;
    }

    .welcome-actions {
        display: flex;
        gap: 20px;
    }

    .welcome-btn {
        padding: 12px 25px;
        background: rgba(255, 0, 128, 0.1);
        border: 2px solid var(--neon-pink);
        color: var(--neon-pink);
        border-radius: 30px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1em;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .welcome-btn:hover {
        background: var(--neon-pink);
        color: #fff;
        transform: scale(1.05);
        box-shadow: 0 0 20px var(--neon-pink);
    }

    .welcome-btn i {
        margin-right: 8px;
    }

    /* When chat is selected */
    .chat-active #messages {
        height: calc(100vh - 180px); /* Account for header and input */
    }

    /* Message Input Container - Always Visible */
    .message-input-container {
        position: sticky;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        padding: 15px 20px;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255, 0, 128, 0.2);
        z-index: 100;
        margin: 0;
        box-shadow: 0 -5px 15px rgba(0, 0, 0, 0.3);
    }

    #message-input {
        flex: 1;
        padding: 15px 20px;
        border: 2px solid var(--neon-pink);
        border-radius: 25px;
        background: rgba(0, 0, 0, 0.3);
        color: #fff;
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1em;
        resize: none;
        max-height: 120px;
        min-height: 50px;
        transition: all 0.3s ease;
        margin: 0;
    }

    #message-input:focus {
        outline: none;
        box-shadow: 0 0 15px var(--neon-pink);
        border-color: #ff1493;
    }

    /* Message Bubbles */
    .message {
        max-width: 75%;
    #message-input::placeholder {
        color: rgba(255, 255, 255, 0.5);
    }

    /* Message Actions */
    .message-actions {
        position: absolute;
        right: -40px;
        top: 50%;
        transform: translateY(-50%);
        display: none;
        gap: 8px;
        background: rgba(0, 0, 0, 0.8);
        padding: 4px;
        border-radius: 8px;
        border: 1px solid var(--neon-pink);
    }

    .message:hover .message-actions {
        display: flex;
    }

    .message-action-btn {
        background: none;
        border: none;
        color: var(--neon-pink);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.3s ease;
    }

    .message-action-btn:hover {
        background: rgba(255, 0, 128, 0.1);
        transform: scale(1.1);
    }

    /* Animations */
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @keyframes pulse {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.02);
        }
        100% {
            transform: scale(1);
        }
    }

    .message.new {
        animation: newMessage 0.3s ease-out;
    }

    @keyframes newMessage {
        0% {
            transform: translateY(20px);
            opacity: 0;
        }
        100% {
            transform: translateY(0);
            opacity: 1;
        }
    }

    /* Message Status Animations */
    .message.sending {
        opacity: 0.7;
    }

    .message.sending .message-status i {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    /* Typing Indicator */
    .typing-indicator {
        padding: 10px 20px;
        color: rgba(255, 255, 255, 0.7);
        font-style: italic;
        font-size: 0.9em;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .typing-indicator::before {
        content: '';
        width: 8px;
        height: 8px;
        background: var(--neon-pink);
        border-radius: 50%;
        animation: typing 1s infinite;
    }

    @keyframes typing {
        0%, 100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-5px);
        }
    }

    /* Scrollbar Styling */
    #messages::-webkit-scrollbar {
        width: 8px;
    }

    #messages::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
    }

    #messages::-webkit-scrollbar-thumb {
        background: var(--neon-pink);
        border-radius: 4px;
    }

    #messages::-webkit-scrollbar-thumb:hover {
        background: #ff1493;
    }

    /* Empty State */
    .no-messages {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: rgba(255, 255, 255, 0.5);
        text-align: center;
        padding: 20px;
    }

    .no-messages i {
        font-size: 3em;
        margin-bottom: 10px;
        color: var(--neon-pink);
    }

    .no-messages p {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.2em;
    }

    /* Chat Header */
    .chat-header {
        display: flex;
        align-items: center;
        padding: 15px 20px;
        background: rgba(0, 0, 0, 0.3);
        border-bottom: 1px solid rgba(255, 0, 128, 0.2);
        margin: 10px;
        border-radius: 12px;
    }

    .chat-header-info {
        flex: 1;
    }

    .chat-header-name {
        font-size: 1.2em;
        color: var(--neon-pink);
        font-weight: bold;
        margin-bottom: 2px;
    }

    .chat-header-type {
        font-size: 0.9em;
        color: rgba(255, 255, 255, 0.7);
    }

    /* Message Groups */
    .message-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 8px;
    }

    .message-group .message {
        margin: 0;
    }

    .message-group .message:not(:last-child) {
        margin-bottom: 2px;
    }

    /* System Messages */
    .message.system {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.7);
        font-style: italic;
        text-align: center;
        max-width: 90%;
        margin: 8px auto;
        padding: 8px 16px;
        border-radius: 12px;
        font-size: 0.9em;
    }
`;
document.head.appendChild(enhancedChatStyles);

// Update the showConnectionError function
function showConnectionError() {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'connection-error';
    errorDiv.innerHTML = `
        <div class="error-content">
            <h3>Connection Error</h3>
            <p>Unable to connect to the server. This might be due to:</p>
            <ul>
                <li>Network connectivity issues</li>
                <li>Firewall or security software blocking the connection</li>
                <li>Server maintenance or downtime</li>
            </ul>
            <p>Please try:</p>
            <ol>
                <li>Checking your internet connection</li>
                <li>Disabling any VPN or proxy services</li>
                <li>Refreshing the page</li>
                <li>If the problem persists, try again later</li>
            </ol>
            <button class="retry-btn" onclick="window.location.reload()">Retry Connection</button>
        </div>
    `;
    document.body.appendChild(errorDiv);
}

// Add styles for the enhanced error message
const enhancedErrorStyles = document.createElement('style');
enhancedErrorStyles.textContent = `
    .connection-error {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        color: #fff;
        font-family: 'Roboto', sans-serif;
    }
    .error-content {
        background: #1a1a1a;
        padding: 2rem;
        border-radius: 8px;
        max-width: 500px;
        border: 1px solid var(--neon-pink);
        box-shadow: 0 0 20px var(--neon-pink);
    }
    .error-content h3 {
        color: var(--neon-pink);
        margin-bottom: 1rem;
        font-family: 'Orbitron', sans-serif;
    }
    .error-content ul, .error-content ol {
        margin: 1rem 0;
        padding-left: 1.5rem;
    }
    .error-content li {
        margin: 0.5rem 0;
    }
    .retry-btn {
        background: var(--neon-pink);
        color: #fff;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        font-family: 'Orbitron', sans-serif;
        margin-top: 1rem;
        transition: all 0.3s ease;
    }
    .retry-btn:hover {
        background: #ff1493;
        transform: scale(1.05);
    }
`;
document.head.appendChild(enhancedErrorStyles);

// Function to handle typing indicator
function handleTyping() {
    if (!currentChat || !currentUser) return;
    
    if (!isTyping) {
        isTyping = true;
        const chatRef = currentChatType === 'group'
            ? doc(db, 'groups', currentChat.id)
            : doc(db, 'directMessages', currentChat.id);
            
        setDoc(chatRef, {
            [`typing.${currentUser.uid}`]: true
        }, { merge: true });
    }

    // Clear existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }

    // Set new timeout
    typingTimeout = setTimeout(() => {
        isTyping = false;
        const chatRef = currentChatType === 'group'
            ? doc(db, 'groups', currentChat.id)
            : doc(db, 'directMessages', currentChat.id);
            
        setDoc(chatRef, {
            [`typing.${currentUser.uid}`]: false
        }, { merge: true });
    }, 3000);
}

// Function to handle member invitation
async function handleInviteMember(e) {
    e.preventDefault();
    
    try {
        if (!currentUser || !currentChat || currentChatType !== 'group') {
            throw new Error('Invalid chat context for invitation');
        }

        const form = e.target;
        const email = form.querySelector('#invite-email').value.trim().toLowerCase();

        if (!email) {
            throw new Error('Email is required');
        }

        // Check if user exists
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            throw new Error('User not found');
        }

        const userDoc = querySnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();

        // Check if user is already a member
        if (currentChat.members.includes(userId)) {
            throw new Error('User is already a member');
        }

        // Add user to group
        const groupRef = doc(db, 'groups', currentChat.id);
        await updateDoc(groupRef, {
            members: arrayUnion(userId),
            [`memberNames.${userId}`]: userData.displayName || userData.email.split('@')[0],
            updatedAt: serverTimestamp()
        });

        // Add system message about new member
        const messagesRef = collection(db, 'groups', currentChat.id, 'messages');
        await addDoc(messagesRef, {
            text: `${userData.displayName || userData.email.split('@')[0]} was added to the group`,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            type: 'system',
            userName: currentUser.displayName || currentUser.email.split('@')[0],
            isSystem: true
        });

        // Close modal and show success message
        const modal = document.getElementById('invite-member-modal');
        if (modal) {
            modal.classList.remove('active');
        }

        showNotification('Member added successfully');

        // Reload group data
        await loadGroups();
        await selectGroup(currentChat.id, {
            ...currentChat,
            members: [...currentChat.members, userId],
            memberNames: {
                ...currentChat.memberNames,
                [userId]: userData.displayName || userData.email.split('@')[0]
            }
        });

    } catch (error) {
        console.error('Error inviting member:', error);
        showNotification(error.message || 'Failed to add member', true);
    }
}

// Function to show invite member modal
function showInviteMemberModal() {
    if (!currentChat || currentChatType !== 'group' || currentChat.type !== 'private') {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'invite-member-modal';
    modal.className = 'modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Invite Member</h2>
            <form id="invite-member-form">
                <div class="form-group">
                    <label for="invite-email">Email Address</label>
                    <input type="email" id="invite-email" required placeholder="Enter email address">
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn">Cancel</button>
                    <button type="submit" class="create-btn">Invite</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('active');

    // Add event listeners
    const form = modal.querySelector('#invite-member-form');
    form.addEventListener('submit', handleInviteMember);

    const cancelBtn = modal.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    });
}

// Add this function to handle reconnection
async function handleReconnect() {
    if (isReconnecting) return;
    
    isReconnecting = true;
    try {
        // Disable network first
        await disableNetwork(db);
        
        // Wait a bit before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Enable network
        await enableNetwork(db);
        
        // Reset reconnection delay
        currentReconnectDelay = 1000;
        
        // Reload current chat if any
        if (currentChat) {
            if (currentChatType === 'group') {
                await selectGroup(currentChat.id, currentChat);
            } else {
                await selectDM(currentChat.id, currentChat);
            }
        }
        
        showNotification('Connection restored');
    } catch (error) {
        console.error('Reconnection failed:', error);
        // Exponential backoff for next attempt
        currentReconnectDelay = Math.min(currentReconnectDelay * 2, MAX_RECONNECT_DELAY);
        
        // Schedule next reconnection attempt
        reconnectTimeout = setTimeout(handleReconnect, currentReconnectDelay);
        showNotification('Connection lost. Retrying...', true);
    } finally {
        isReconnecting = false;
    }
}

// Function to delete or leave a conversation
async function deleteConversation(conversationId, type) {
  try {
    const batch = db.batch();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error('User must be authenticated to delete conversations');
    }

    if (type === 'group') {
      // Get the group document first to check permissions
      const groupRef = doc(db, 'groups', conversationId);
      const groupDoc = await getDoc(groupRef);
      
      if (!groupDoc.exists()) {
        throw new Error('Group not found');
      }

      const groupData = groupDoc.data();
      
      // Check if user is the creator
      if (groupData.createdBy !== currentUser.uid) {
        throw new Error('Only group creator can delete the group');
      }

      // Delete all messages in the group
      const messagesRef = collection(db, 'groups', conversationId, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      messagesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Delete all announcements in the group
      const announcementsRef = collection(db, 'groups', conversationId, 'announcements');
      const announcementsSnapshot = await getDocs(announcementsRef);
      announcementsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Finally delete the group document
      batch.delete(groupRef);
    } else if (type === 'direct') {
      // Get the DM document first to check permissions
      const dmRef = doc(db, 'directMessages', conversationId);
      const dmDoc = await getDoc(dmRef);
      
      if (!dmDoc.exists()) {
        throw new Error('Direct message not found');
      }

      const dmData = dmDoc.data();
      
      // Check if user is a participant
      if (!dmData.participants.includes(currentUser.uid)) {
        throw new Error('User is not a participant in this conversation');
      }

      // Delete all messages in the DM
      const messagesRef = collection(db, 'directMessages', conversationId, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      messagesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Finally delete the DM document
      batch.delete(dmRef);
    } else {
      throw new Error('Invalid conversation type');
    }

    // Commit the batch
    await batch.commit();
    
    // Remove from UI
    const conversationElement = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (conversationElement) {
      conversationElement.remove();
    }

    // Clear chat area if this was the active conversation
    if (activeConversationId === conversationId) {
      document.getElementById('chat-messages').innerHTML = '';
      activeConversationId = null;
    }

    // Show success message
    showNotification('Conversation deleted successfully', 'success');
  } catch (error) {
    console.error('Error deleting conversation:', error);
    showNotification(error.message || 'Failed to delete conversation', 'error');
  }
}

// Update video call styles for better sizing and layout
const videoCallStyles = document.createElement('style');
videoCallStyles.textContent = `
    #video-call-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: rgba(0, 0, 0, 0.9);
        padding: 15px;
        border-radius: 12px;
        border: 1px solid var(--neon-pink);
        box-shadow: 0 0 20px var(--neon-pink);
        width: 320px;
    }

    #video-call-container .videos-wrapper {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        width: 100%;
    }

    #video-call-container .video-wrapper {
        position: relative;
        width: 100%;
        padding-top: 75%; /* 4:3 Aspect Ratio */
    }

    #video-call-container video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 8px;
        background: #000;
        object-fit: cover;
    }

    #video-call-container .video-wrapper.local {
        transform: scaleX(-1); /* Mirror local video */
    }

    #video-call-container .video-wrapper.remote {
        border: 2px solid var(--neon-pink);
    }

    #video-call-container .call-controls {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 10px;
    }

    #video-call-container .call-btn {
        background: none;
        border: 1px solid var(--neon-pink);
        color: var(--neon-pink);
        padding: 8px 16px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    #video-call-container .call-btn:hover {
        background: var(--neon-pink);
        color: #fff;
    }

    #video-call-container .call-btn.end-call {
        background: #ff4444;
        border-color: #ff4444;
        color: #fff;
    }

    #video-call-container .call-btn.end-call:hover {
        background: #cc0000;
        border-color: #cc0000;
    }

    .call-status {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: #fff;
        padding: 10px 20px;
        border-radius: 20px;
        border: 1px solid var(--neon-pink);
        z-index: 10000;
        display: none;
        font-size: 14px;
    }

    .call-status.active {
        display: block;
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(255, 0, 128, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(255, 0, 128, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 0, 128, 0); }
    }

    .incoming-call {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        padding: 20px;
        border-radius: 12px;
        border: 1px solid var(--neon-pink);
        z-index: 10001;
        text-align: center;
        color: #fff;
    }

    .incoming-call .caller-info {
        margin-bottom: 20px;
    }

    .incoming-call .call-buttons {
        display: flex;
        gap: 10px;
        justify-content: center;
    }

    .incoming-call button {
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .incoming-call .accept-call {
        background: var(--neon-pink);
        border: none;
        color: #fff;
    }

    .incoming-call .reject-call {
        background: none;
        border: 1px solid #ff4444;
        color: #ff4444;
    }
`;
document.head.appendChild(videoCallStyles);

// Update createVideoElements function
function createVideoElements(local, remote) {
    const container = document.createElement('div');
    container.id = 'video-call-container';
    
    const videosWrapper = document.createElement('div');
    videosWrapper.className = 'videos-wrapper';

    const localWrapper = document.createElement('div');
    localWrapper.className = 'video-wrapper local';
    const localVideo = document.createElement('video');
    localVideo.autoplay = true;
    localVideo.muted = true;
    localVideo.srcObject = local;
    localWrapper.appendChild(localVideo);

    const remoteWrapper = document.createElement('div');
    remoteWrapper.className = 'video-wrapper remote';
    const remoteVideo = document.createElement('video');
    remoteVideo.autoplay = true;
    remoteVideo.srcObject = remote;
    remoteWrapper.appendChild(remoteVideo);

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'call-controls';
    
    const endCallBtn = document.createElement('button');
    endCallBtn.id = 'end-call-btn';
    endCallBtn.className = 'call-btn end-call';
    endCallBtn.innerHTML = '<i class="fas fa-phone-slash"></i> End Call';
    endCallBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to end this call?')) {
            await endCall();
        }
    });
    
    const muteBtn = document.createElement('button');
    muteBtn.className = 'call-btn';
    muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    muteBtn.onclick = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                muteBtn.innerHTML = audioTrack.enabled ? 
                    '<i class="fas fa-microphone"></i>' : 
                    '<i class="fas fa-microphone-slash"></i>';
            }
        }
    };

    const videoBtn = document.createElement('button');
    videoBtn.className = 'call-btn';
    videoBtn.innerHTML = '<i class="fas fa-video"></i>';
    videoBtn.onclick = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                videoBtn.innerHTML = videoTrack.enabled ? 
                    '<i class="fas fa-video"></i>' : 
                    '<i class="fas fa-video-slash"></i>';
                localVideo.style.display = videoTrack.enabled ? 'block' : 'none';
            }
        }
    };

    controlsDiv.appendChild(muteBtn);
    controlsDiv.appendChild(videoBtn);
    controlsDiv.appendChild(endCallBtn);

    videosWrapper.appendChild(localWrapper);
    videosWrapper.appendChild(remoteWrapper);
    container.appendChild(videosWrapper);
    container.appendChild(controlsDiv);

    const statusDiv = document.createElement('div');
    statusDiv.className = 'call-status active';
    statusDiv.textContent = 'Call in progress...';
    document.body.appendChild(statusDiv);

    document.body.appendChild(container);
}

// Update startCall function to ensure consistent media line order
async function startCall(isVideo = true) {
    try {
        if (!currentChat || currentChatType !== 'dm') {
            throw new Error('Calls are only available in direct messages');
        }

        // Check if other user is online
        const otherParticipantId = currentChat.participants.find(id => id !== currentUser.uid);
        const otherUserRef = doc(db, 'users', otherParticipantId);
        const otherUserDoc = await getDoc(otherUserRef);
        
        if (!otherUserDoc.exists() || otherUserDoc.data().status !== 'online') {
            throw new Error('User is offline');
        }

        // Initialize call document
        const callRef = doc(db, 'calls', currentChat.id);
        await setDoc(callRef, {
            participants: currentChat.participants,
            status: 'calling',
            type: isVideo ? 'video' : 'voice',
            startedAt: serverTimestamp(),
            createdBy: currentUser.uid
        });

        // Get user media first
        const mediaConstraints = { 
            audio: true, 
            video: isVideo ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } : false 
        };

        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        remoteStream = new MediaStream();

        // Create peer connection
        peerConnection = new RTCPeerConnection(servers);
        
        // Add connection state change handler
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateCallStatus('in-progress');
            } else if (peerConnection.connectionState === 'disconnected' || 
                      peerConnection.connectionState === 'failed') {
                endCall();
            }
        };

        // Add ICE connection state change handler
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                endCall();
            }
        };

        // Add tracks to peer connection BEFORE creating offer
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Handle incoming tracks
        peerConnection.ontrack = event => {
            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                sendToSignaling('ice', event.candidate);
            }
        };

        // Create offer with explicit media options
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: isVideo
        });

        // Set local description
        await peerConnection.setLocalDescription(offer);
        
        // Create video elements after setting local description
        createVideoElements(localStream, remoteStream);

        // Send the offer
        sendToSignaling('offer', offer);

        // Start listening for signaling
        listenForSignaling();
    } catch (err) {
        console.error('Error starting call:', err);
        showNotification('Could not start call: ' + err.message, true);
        cleanupCall();
    }
}

// Update listenForSignaling function with proper state handling
function listenForSignaling() {
    if (!currentChat) return;
    
    const callRef = doc(db, 'calls', currentChat.id);
    const unsubscribe = onSnapshot(callRef, async docSnap => {
        const data = docSnap.data();
        if (!data) return;

        try {
            // Handle incoming call
            if (data.status === 'calling' && 
                data.participants.includes(currentUser.uid) && 
                data.offer && 
                !peerConnection &&
                data.createdBy !== currentUser.uid) {
                await handleIncomingCall(data);
                return;
            }

            if (!peerConnection) return;

            // Handle offer
            if (data.offer && 
                peerConnection.signalingState === 'stable' && 
                data.createdBy !== currentUser.uid) {
                try {
                    const offer = JSON.parse(data.offer);
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    sendToSignaling('answer', answer);
                } catch (error) {
                    console.error('Error handling offer:', error);
                    if (error.name === 'InvalidStateError') {
                        // If we're in the wrong state, clean up and try again
                        await cleanupCall();
                        await handleIncomingCall(data);
                    } else {
                        throw error;
                    }
                }
            }

            // Handle answer
            if (data.answer && 
                peerConnection.signalingState === 'have-local-offer' && 
                data.createdBy === currentUser.uid) {
                try {
                    const answer = JSON.parse(data.answer);
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (error) {
                    console.error('Error handling answer:', error);
                    if (error.name === 'InvalidStateError') {
                        // If we're in the wrong state, end the call
                        await endCall();
                    } else {
                        throw error;
                    }
                }
            }

            // Handle ICE candidates
            if (data.ice && 
                peerConnection.remoteDescription && 
                peerConnection.signalingState !== 'closed') {
                try {
                    const ice = new RTCIceCandidate(JSON.parse(data.ice));
                    await peerConnection.addIceCandidate(ice);
                } catch (error) {
                    console.error('Error handling ICE candidate:', error);
                    // Don't end call for ICE candidate errors
                }
            }
        } catch (error) {
            console.error('Error in signaling:', error);
            if (error.name === 'InvalidStateError') {
                // For invalid state errors, try to recover
                if (peerConnection.signalingState === 'stable') {
                    // If we're stable, we might need to restart the call
                    await cleanupCall();
                    if (data.createdBy === currentUser.uid) {
                        // If we initiated the call, try to restart it
                        await startCall(data.type === 'video');
                    } else {
                        // If we received the call, try to handle it again
                        await handleIncomingCall(data);
                    }
                } else {
                    // For other invalid states, end the call
                    await endCall();
                }
            } else {
                showNotification('Error in call connection. Please try again.', true);
                await endCall();
            }
        }
    }, error => {
        console.error('Error in signaling listener:', error);
        if (error.code === 'permission-denied') {
            showNotification('You do not have permission to make calls in this chat', true);
        } else {
            showNotification('Error in call connection. Please try again.', true);
        }
        endCall();
    });

    // Store unsubscribe function for cleanup
    if (currentChat) {
        currentChat.signalingUnsubscribe = unsubscribe;
    }
}

// Update cleanupCall function to be async
async function cleanupCall() {
    if (currentChat?.signalingUnsubscribe) {
        currentChat.signalingUnsubscribe();
        currentChat.signalingUnsubscribe = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }

    const container = document.getElementById('video-call-container');
    if (container) {
        container.remove();
    }

    const statusDiv = document.querySelector('.call-status');
    if (statusDiv) {
        statusDiv.remove();
    }

    if (currentChat) {
        await updateCallStatus('ended');
    }
}

// Add function to handle incoming calls
async function handleIncomingCall(callData) {
    try {
        // Remove any existing incoming call UI
        const existingCall = document.querySelector('.incoming-call');
        if (existingCall) {
            existingCall.remove();
        }

        const otherParticipantId = callData.participants.find(id => id !== currentUser.uid);
        const otherUserRef = doc(db, 'users', otherParticipantId);
        const otherUserDoc = await getDoc(otherUserRef);
        const otherUserName = otherUserDoc.data()?.displayName || 'Unknown User';

        // Update call document with caller name
        const callRef = doc(db, 'calls', currentChat.id);
        await updateDoc(callRef, {
            callerName: otherUserName
        });

        const incomingCallDiv = document.createElement('div');
        incomingCallDiv.className = 'incoming-call';
        incomingCallDiv.innerHTML = `
            <div class="caller-info">
                <h3>Incoming ${callData.type} call</h3>
                <p>From: ${otherUserName}</p>
            </div>
            <div class="call-buttons">
                <button class="accept-call">
                    <i class="fas fa-phone"></i> Accept
                </button>
                <button class="reject-call">
                    <i class="fas fa-phone-slash"></i> Reject
                </button>
            </div>
        `;

        document.body.appendChild(incomingCallDiv);

        // Add event listeners with proper cleanup
        const acceptBtn = incomingCallDiv.querySelector('.accept-call');
        const rejectBtn = incomingCallDiv.querySelector('.reject-call');

        const handleAccept = async () => {
            acceptBtn.removeEventListener('click', handleAccept);
            rejectBtn.removeEventListener('click', handleReject);
            incomingCallDiv.remove();
            await createAnswer(JSON.parse(callData.offer));
        };

        const handleReject = async () => {
            acceptBtn.removeEventListener('click', handleAccept);
            rejectBtn.removeEventListener('click', handleReject);
            incomingCallDiv.remove();
            await endCall();
        };

        acceptBtn.addEventListener('click', handleAccept);
        rejectBtn.addEventListener('click', handleReject);

        // Play notification sound using a data URL instead of a file
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);

        // Auto-remove after 30 seconds if not answered
        setTimeout(() => {
            if (document.body.contains(incomingCallDiv)) {
                handleReject();
            }
        }, 30000);
    } catch (error) {
        console.error('Error handling incoming call:', error);
        showNotification('Error handling incoming call', true);
    }
}

// Add function to update call status
async function updateCallStatus(status) {
    if (!currentChat) return;
    const callRef = doc(db, 'calls', currentChat.id);
    await updateDoc(callRef, {
        status: status,
        ...(status === 'ended' ? { endedAt: serverTimestamp() } : {})
    });
}

// Update endCall function to be more robust
async function endCall() {
    try {
        // Get the current call document first
        if (currentChat) {
            const callRef = doc(db, 'calls', currentChat.id);
            const callDoc = await getDoc(callRef);
            
            if (callDoc.exists()) {
                const callData = callDoc.data();
                
                // Only update if the call is still active
                if (callData.status !== 'ended') {
                    await updateDoc(callRef, {
                        status: 'ended',
                        endedAt: serverTimestamp(),
                        endedBy: currentUser.uid
                    });
                }
            }
        }

        // Clean up peer connection
        if (peerConnection) {
            // Remove all event listeners
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.onicecandidate = null;
            peerConnection.ontrack = null;
            
            // Close all data channels
            peerConnection.getSenders().forEach(sender => {
                if (sender.track) {
                    sender.track.stop();
                }
            });
            
            peerConnection.close();
            peerConnection = null;
        }

        // Stop all media tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            localStream = null;
        }

        if (remoteStream) {
            remoteStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            remoteStream = null;
        }

        // Remove UI elements
        const container = document.getElementById('video-call-container');
        if (container) {
            container.remove();
        }

        const statusDiv = document.querySelector('.call-status');
        if (statusDiv) {
            statusDiv.remove();
        }

        // Remove any incoming call UI
        const incomingCall = document.querySelector('.incoming-call');
        if (incomingCall) {
            incomingCall.remove();
        }

        // Clean up signaling listener
        if (currentChat?.signalingUnsubscribe) {
            currentChat.signalingUnsubscribe();
            currentChat.signalingUnsubscribe = null;
        }

        showNotification('Call ended');
    } catch (error) {
        console.error('Error ending call:', error);
        showNotification('Error ending call', true);
    }
}

// Add WebRTC signaling functions
async function sendToSignaling(type, data) {
    if (!currentChat) return;
    
    try {
        const callRef = doc(db, 'calls', currentChat.id);
        await updateDoc(callRef, {
            [type]: JSON.stringify(data),
            lastUpdated: serverTimestamp()
        });
    } catch (error) {
        console.error('Error sending signaling data:', error);
        showNotification('Error in call connection', true);
        endCall();
    }
}

async function createAnswer(offer) {
    try {
        // Clean up any existing call first
        await cleanupCall();

        // Create new peer connection first
        peerConnection = new RTCPeerConnection(servers);
        
        // Add connection state change handler
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateCallStatus('in-progress');
            } else if (peerConnection.connectionState === 'disconnected' || 
                      peerConnection.connectionState === 'failed') {
                endCall();
            }
        };

        // Add ICE connection state change handler
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                endCall();
            }
        };

        // Get user media first to ensure we have the tracks ready
        const mediaConstraints = { 
            audio: true, 
            video: offer.sdp.includes('m=video') ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } : false 
        };

        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        remoteStream = new MediaStream();

        // Add tracks to peer connection BEFORE setting remote description
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Handle incoming tracks
        peerConnection.ontrack = event => {
            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                sendToSignaling('ice', event.candidate);
            }
        };

        // Set remote description (offer) first
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Create video elements after setting remote description
        createVideoElements(localStream, remoteStream);

        // Create answer with explicit media options
        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: offer.sdp.includes('m=video')
        });

        // Set local description
        await peerConnection.setLocalDescription(answer);
        
        // Send the answer
        sendToSignaling('answer', answer);

        // Apply any stored ICE candidates
        if (peerConnection.iceCandidates) {
            for (const ice of peerConnection.iceCandidates) {
                try {
                    await peerConnection.addIceCandidate(ice);
                } catch (error) {
                    console.error('Error applying stored ICE candidate:', error);
                }
            }
            peerConnection.iceCandidates = [];
        }
    } catch (error) {
        console.error('Error creating answer:', error);
        showNotification('Could not accept call: ' + error.message, true);
        await cleanupCall();
    }
}

// Add enhanced message styles
const messageStyles = document.createElement('style');
messageStyles.textContent = `
    .messages-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 20px;
    }

    .message {
        max-width: 70%;
        margin: 4px 0;
        position: relative;
        animation: fadeIn 0.3s ease-out;
    }

    .message-sent {
        align-self: flex-end;
        margin-left: auto;
    }

    .message-received {
        align-self: flex-start;
        margin-right: auto;
    }

    .message-content {
        padding: 12px 16px;
        border-radius: 15px;
        position: relative;
        word-wrap: break-word;
    }

    .message-sent .message-content {
        background: linear-gradient(135deg, var(--neon-pink), #ff69b4);
        color: white;
        border-bottom-right-radius: 4px;
    }

    .message-received .message-content {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border-bottom-left-radius: 4px;
    }

    .message-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
        font-size: 0.9em;
    }

    .message-sent .message-header {
        flex-direction: row-reverse;
    }

    .message-username {
        font-weight: bold;
        color: rgba(255, 255, 255, 0.9);
    }

    .message-time {
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.8em;
    }

    .message-text {
        margin: 0;
        line-height: 1.4;
    }

    .message-status {
        position: absolute;
        bottom: -15px;
        right: 0;
        font-size: 0.8em;
        color: rgba(255, 255, 255, 0.7);
    }

    .message-sent .message-status {
        right: 0;
    }

    .message-received .message-status {
        left: 0;
    }

    .read-receipt {
        font-size: 0.8em;
        color: rgba(255, 255, 255, 0.7);
        margin-top: 4px;
    }

    .message-actions {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        display: none;
        gap: 8px;
        background: rgba(0, 0, 0, 0.95);
        padding: 8px;
        border-radius: 12px;
        border: 1px solid var(--neon-pink);
        box-shadow: 0 0 15px rgba(255, 0, 128, 0.3);
        backdrop-filter: blur(10px);
        z-index: 1000;
        transition: all 0.3s ease;
    }

    .message-sent .message-actions {
        left: -60px;
    }

    .message-received .message-actions {
        right: -60px;
    }

    .message:hover .message-actions {
        display: flex;
        animation: fadeIn 0.2s ease-out;
    }

    .message-action-btn {
        background: none;
        border: none;
        color: var(--neon-pink);
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
    }

    .message-action-btn:hover {
        background: rgba(255, 0, 128, 0.1);
        transform: scale(1.1);
        box-shadow: 0 0 10px rgba(255, 0, 128, 0.2);
    }

    .message-action-btn i {
        font-size: 1.1em;
    }

    .message-action-btn.delete-btn:hover {
        color: #ff4444;
        background: rgba(255, 68, 68, 0.1);
    }

    .message-action-btn.copy-btn:hover {
        color: #00ff00;
        background: rgba(0, 255, 0, 0.1);
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-50%) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(-50%) scale(1);
        }
    }

    /* Add tooltip for action buttons */
    .message-action-btn::after {
        content: attr(title);
        position: absolute;
        bottom: -25px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8em;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        border: 1px solid var(--neon-pink);
    }

    .message-action-btn:hover::after {
        opacity: 1;
        visibility: visible;
        bottom: -30px;
    }
`;
document.head.appendChild(messageStyles);

// Move notification permission request to a user gesture handler
function requestNotificationPermission() {
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}

// Add click handler to a button or element that user interacts with
document.addEventListener('DOMContentLoaded', () => {
    const notificationBtn = document.createElement('button');
    notificationBtn.id = 'notification-btn';
    notificationBtn.className = 'notification-btn';
    notificationBtn.innerHTML = '<i class="fas fa-bell"></i>';
    notificationBtn.title = 'Enable Notifications';
    notificationBtn.onclick = requestNotificationPermission;
    
    // Add the button to the UI where appropriate
    const header = document.querySelector('.chat-header');
    if (header) {
        header.appendChild(notificationBtn);
    }
});

// Check if user is logged in
firebase.auth().onAuthStateChanged((user) => {
    const userSection = document.getElementById('user-section');
    const authSection = document.getElementById('auth-section');
    const userEmail = document.getElementById('user-email');

    if (user) {
        // User is signed in
        if (userSection) userSection.style.display = 'block';
        if (authSection) authSection.style.display = 'none';
        if (userEmail) userEmail.textContent = user.email;
    } else {
        // User is signed out
        if (userSection) userSection.style.display = 'none';
        if (authSection) authSection.style.display = 'block';
    }
});

// Search users function
async function searchUsers(searchQuery) {
    try {
        // Search by email
        const usersRef = collection(db, 'users');
        const usersQuery = firebase.firestore().collection('users')
            .where('email', '>=', searchQuery)
            .where('email', '<=', searchQuery + '\uf8ff');
        
        const snapshot = await getDocs(usersQuery);
        const users = [];
        
        snapshot.forEach(doc => {
            const userData = doc.data();
            // Don't include current user in results
            if (doc.id !== currentUser.uid) {
                users.push({
                    id: doc.id,
                    email: userData.email,
                    displayName: userData.displayName
                });
            }
        });
        
        return users;
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

// Create or get direct message conversation
async function createOrGetDM(userId, userName, userEmail) {
    try {
        // Check if DM already exists
        const existingDMQuery = query(
            collection(db, 'directMessages'),
            where('participants', 'array-contains', currentUser.uid)
        );
        
        const snapshot = await getDocs(existingDMQuery);
        let existingDM = null;
        
        snapshot.forEach(doc => {
            const dm = doc.data();
            if (dm.participants.includes(userId)) {
                existingDM = { id: doc.id, ...dm };
            }
        });
        
        if (existingDM) {
            return existingDM;
        }
        
        // Create new DM
        const newDM = {
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
        
        const dmRef = await addDoc(collection(db, 'directMessages'), newDM);
        return { id: dmRef.id, ...newDM };
    } catch (error) {
        console.error('Error creating/getting DM:', error);
        throw error;
    }
}


