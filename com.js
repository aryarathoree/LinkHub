import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, deleteDoc, addDoc, arrayRemove, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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
function showConnectionError() {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'connection-error';
    errorDiv.innerHTML = `
        <div class="error-content">
            <h3>Connection Error</h3>
            <p>It seems your connection to Firebase is being blocked. This might be due to:</p>
            <ul>
                <li>An ad blocker or privacy extension</li>
                <li>Firewall settings</li>
                <li>Network restrictions</li>
            </ul>
            <p>To fix this:</p>
            <ol>
                <li>Disable your ad blocker for this site</li>
                <li>Or add an exception for firestore.googleapis.com</li>
                <li>Refresh the page after making changes</li>
            </ol>
        </div>
    `;
    document.body.appendChild(errorDiv);
}

// Add styles for the error message
const style = document.createElement('style');
style.textContent = `
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
`;
document.head.appendChild(style);

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Listen for auth state changes
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('User is logged in:', user.email);
            currentUser = user;
            
            // Create or update user document
            try {
                await setDoc(doc(db, 'users', user.uid), {
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    photoURL: user.photoURL || null,
                    lastSeen: serverTimestamp(),
                    createdAt: serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error('Error creating user document:', error);
            }

            // Initialize UI elements
            initializeUI();
            // Load initial data
            loadGroups();
            loadDMs();
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
    const mediaBtn = document.getElementById('media-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const profileBtn = document.getElementById('profile-btn');
    const createGroupModal = document.getElementById('create-group-modal');
    const newDmModal = document.getElementById('new-dm-modal');
    const announcementModal = document.getElementById('announcement-modal');
    const createGroupForm = document.getElementById('create-group-form');
    const announcementForm = document.getElementById('announcement-form');
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    // Set user profile
    if (currentUser) {
        if (userName) {
            userName.textContent = currentUser.displayName || currentUser.email.split('@')[0];
        }
        if (userAvatar) {
            userAvatar.innerHTML = `<i class="fas fa-user"></i>`;
            userAvatar.style.display = 'flex';
            userAvatar.style.alignItems = 'center';
            userAvatar.style.justifyContent = 'center';
            userAvatar.style.fontSize = '1.5em';
            userAvatar.style.color = 'var(--neon-pink)';
        }
    }

    // Add profile button click handler
    if (profileBtn) {
        profileBtn.addEventListener('click', async () => {
            try {
                const userProfile = await loadUserProfile(currentUser.uid);
                showProfileModal(userProfile);
            } catch (error) {
                console.error('Error loading profile:', error);
                showNotification('Error loading profile', true);
            }
        });
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
                            // Ensure we have all required user data
                            if (!user.id || !user.email) {
                                throw new Error('Invalid user data');
                            }

                            const dm = await createOrGetDM(
                                user.id,
                                user.displayName || user.email.split('@')[0],
                                user.email
                            );
                            
                            // Close modal
                            const newDmModal = document.getElementById('new-dm-modal');
                            if (newDmModal) {
                                newDmModal.classList.remove('active');
                            }
                            
                            // Select the DM
                            await selectDM(dm.id, dm);
                            
                            // Clear search and reload DMs
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

        groupsSnapshot.forEach(doc => {
            const group = doc.data();
            const groupElement = createGroupElement(doc.id, group);
            groupList.appendChild(groupElement);
        });
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
        document.querySelector(`[data-group-id="${groupId}"]`).classList.add('active');
        
        // Update chat header
        document.getElementById('current-chat-name').textContent = group.name;
        document.getElementById('chat-type').textContent = group.type;
        
        // Show manage participants and announcement buttons
        const manageParticipantsBtn = document.getElementById('manage-participants-btn');
        const announcementBtn = document.getElementById('announcement-btn');
        if (manageParticipantsBtn) {
            manageParticipantsBtn.style.display = 'flex';
        }
        if (announcementBtn) {
            announcementBtn.style.display = 'flex';
        }
        
        // Initialize participant management
        initializeParticipantManagement();
        
        // Load messages
        await loadMessages(groupId, 'group');
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
        
        // Update chat header
        const chatName = document.getElementById('current-chat-name');
        const chatType = document.getElementById('chat-type');
        
        if (chatName) {
            chatName.textContent = dm.name || 'Direct Message';
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
            if (!chat.members.includes(currentUser.uid)) {
                throw new Error('You are not a member of this group');
            }
        } else {
            if (!chat.participants.includes(currentUser.uid)) {
                throw new Error('You are not a participant in this conversation');
            }
        }

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
                            messagesContainer.appendChild(messageElement);
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;

                            // Update last message in chat list
                            if (type === 'dm') {
                                updateLastMessage(chatId, message);
                            }
                        }
                    } else if (change.type === 'modified') {
                        // Update message status if it was modified
                        const message = change.doc.data();
                        const messageElement = document.querySelector(`[data-message-id="${change.doc.id}"]`);
                        if (messageElement) {
                            updateMessageStatus(messageElement, message.status);
                        }
                    }
                });
            }, error => {
                console.error('Error in message listener:', error);
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
                const sender = message.userId === currentUser.uid ? 'You' : messageSender;
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
            timestamp: serverTimestamp(),
            status: 'sending'
        };

        // Clear input first to prevent duplicate sends
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = '';
        }

        // Add message to Firestore
        const messageRef = await addDoc(messagesRef, {
            ...messageData,
            status: 'sent'
        });

        // Update message status in UI
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
                messagesContainer.appendChild(messageElement);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        }

    } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage = error.message || 'Failed to send message. Please try again.';
        
        // Show error in UI
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = errorMessage;
            messagesContainer.appendChild(errorDiv);
        }
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
    div.className = `message ${message.userId === currentUser.uid ? 'message-sent' : 'message-received'}`;
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
                    <span class="announcement-author">Posted by ${message.createdByName}</span>
                    <span class="announcement-time">${new Date(message.createdAt?.toDate() || message.createdAt).toLocaleString()}</span>
                </div>
            </div>
            <div class="announcement-body">${message.text}</div>
        `;
    } else {
        const header = document.createElement('div');
        header.className = 'message-header';
        
        const name = document.createElement('span');
        name.className = 'message-username';
        
        // Get the correct username
        if (message.userId === currentUser.uid) {
            name.textContent = 'You';
        } else {
            // Get the other participant's name from the chat data
            const otherParticipantId = currentChat.participants.find(id => id !== currentUser.uid);
            const otherParticipantName = currentChat.participantNames?.[otherParticipantId] || 
                                        currentChat.participantEmails?.[otherParticipantId]?.split('@')[0] || 
                                        message.userName || 
                                        'User';
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

        // Add status indicator for sent messages
        if (message.userId === currentUser.uid) {
            const status = document.createElement('div');
            status.className = 'message-status';
            content.appendChild(status);
            updateMessageStatus(div, message.status || 'sending');
        }
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

async function handleCreateGroup(e) {
    e.preventDefault();
    
    try {
        const groupName = document.getElementById('group-name').value.trim();
        const groupDescription = document.getElementById('group-description').value.trim();

        if (!groupName) {
            throw new Error('Please enter a group name');
        }

        if (selectedParticipants.length === 0) {
            throw new Error('Please select at least one participant');
        }

        const groupData = {
            name: groupName,
            description: groupDescription,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            members: [currentUser.uid, ...selectedParticipants.map(p => p.id)],
            memberNames: {
                [currentUser.uid]: currentUser.displayName || currentUser.email.split('@')[0],
                ...selectedParticipants.reduce((acc, p) => ({
                    ...acc,
                    [p.id]: p.name
                }), {})
            }
        };

        const groupRef = await addDoc(collection(db, 'groups'), groupData);

        // Add system message for group creation
        await addDoc(collection(db, 'groups', groupRef.id, 'messages'), {
            text: 'Group created',
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            type: 'system'
        });

        showNotification('Group created successfully');
        closeCreateGroupModal();
        loadGroups();
    } catch (error) {
        console.error('Error creating group:', error);
        showNotification(error.message || 'Error creating group', true);
    }
    }

// Close announcement modal
function closeAnnouncementModal() {
    const modal = document.getElementById('announcement-modal');
    if (modal) {
        modal.classList.remove('show');
    }
    }
    
// Handle announcement form submission
async function handleAnnouncement(e) {
    e.preventDefault();
    
    const announcementText = document.getElementById('announcement-text').value.trim();
    if (!announcementText) return;

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        const announcement = {
            text: announcementText,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || 'Anonymous',
            timestamp: new Date()
        };

        await addDoc(collection(db, 'groups', currentGroupId, 'announcements'), announcement);

        // Clear form and close modal
        document.getElementById('announcement-text').value = '';
        closeAnnouncementModal();

        showNotification('Announcement posted successfully');
    } catch (error) {
        console.error('Error posting announcement:', error);
        showNotification('Error posting announcement: ' + error.message, 'error');
    }
}

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
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (doc.id !== currentUser.uid) {
                users.push({
                    id: doc.id,
                    ...userData
                });
                        }
                    });

        return users;
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

async function searchUsers(query) {
    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (doc.id !== currentUser.uid) {
                const searchString = `${userData.displayName} ${userData.email}`.toLowerCase();
                if (searchString.includes(query.toLowerCase())) {
                    users.push({
                        id: doc.id,
                        ...userData
                    });
                }
                }
            });
            
        return users;
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

async function createOrGetDM(userId, userName, userEmail) {
    try {
        // Check if DM already exists
        const existingDMs = await getDocs(query(
            collection(db, 'directMessages'),
            where('participants', 'array-contains', currentUser.uid)
        ));

        let dmId = null;
        existingDMs.forEach(doc => {
            const dm = doc.data();
            if (dm.participants.includes(userId)) {
                dmId = doc.id;
                }
            });

        if (dmId) {
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
    document.body.appendChild(modal);
}

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

// Function to edit profile
async function editProfile() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Edit Profile</h2>
            <form id="edit-profile-form">
                <div class="form-group">
                    <label for="display-name">Display Name</label>
                    <input type="text" id="display-name" value="${currentUser.displayName || ''}" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="this.closest('.modal').remove()">Cancel</button>
                    <button type="submit" class="create-btn">Save Changes</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const form = modal.querySelector('#edit-profile-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const displayName = form.querySelector('#display-name').value.trim();
        
        try {
            await currentUser.updateProfile({
                displayName: displayName
            });
            
            await db.collection('users').doc(currentUser.uid).update({
                displayName: displayName
            });
            
            showNotification('Profile updated successfully');
            modal.remove();
            
            // Update UI
            const userName = document.getElementById('user-name');
            if (userName) {
                userName.textContent = displayName;
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            showNotification('Error updating profile', true);
        }
    });
}

// Function to show/hide manage participants button
function updateManageParticipantsButton() {
    const manageParticipantsBtn = document.getElementById('manage-participants-btn');
    if (manageParticipantsBtn) {
        manageParticipantsBtn.style.display = currentChatType === 'group' ? 'flex' : 'none';
    }
}

// Function to load current participants
async function loadCurrentParticipants() {
    const currentParticipantsList = document.getElementById('current-participants-list');
    if (!currentParticipantsList || !currentChat) return;

    currentParticipantsList.innerHTML = '';

    try {
        const groupDoc = await getDoc(doc(db, 'groups', currentChat.id));
        if (!groupDoc.exists()) return;

        const groupData = groupDoc.data();
        const members = groupData.members || [];
        const memberNames = groupData.memberNames || {};
        const memberEmails = groupData.memberEmails || {};

        members.forEach(memberId => {
            const participantElement = document.createElement('div');
            participantElement.className = 'participant-item';
            participantElement.dataset.userId = memberId;

            const isCreator = memberId === groupData.createdBy;
            const isCurrentUser = memberId === currentUser.uid;

            participantElement.innerHTML = `
                <div class="participant-info">
                    <div class="participant-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="participant-details">
                        <div class="participant-name">${memberNames[memberId] || 'Unknown User'}</div>
                        <div class="participant-email">${memberEmails[memberId] || ''}</div>
                    </div>
                    ${isCreator ? '<span class="participant-role">Creator</span>' : ''}
                </div>
                ${!isCreator && !isCurrentUser ? `
                    <button class="remove-participant-btn" title="Remove participant">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
            `;

            const removeBtn = participantElement.querySelector('.remove-participant-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    participantElement.remove();
                });
            }

            currentParticipantsList.appendChild(participantElement);
        });
    } catch (error) {
        console.error('Error loading participants:', error);
        showNotification('Error loading participants', true);
    }
}

// Function to close manage participants modal
function closeManageParticipantsModal() {
    const modal = document.getElementById('manage-participants-modal');
    if (modal) {
        modal.classList.remove('active');
        // Clear new participants
        const newParticipants = document.getElementById('new-participants');
        if (newParticipants) newParticipants.innerHTML = '';
        // Clear search
        const searchInput = document.getElementById('add-participant-search');
        if (searchInput) searchInput.value = '';
        const searchResults = document.getElementById('add-participant-results');
        if (searchResults) searchResults.innerHTML = '';
    }
}

// Function to initialize participant management
function initializeParticipantManagement() {
    const manageParticipantsBtn = document.getElementById('manage-participants-btn');
    const manageParticipantsModal = document.getElementById('manage-participants-modal');
    const saveParticipantsBtn = document.getElementById('save-participants-btn');
    const addParticipantSearch = document.getElementById('add-participant-search');
    const addParticipantResults = document.getElementById('add-participant-results');
    const showAllUsersBtn = document.getElementById('show-all-users-btn');

    if (manageParticipantsBtn) {
        manageParticipantsBtn.addEventListener('click', async () => {
            try {
                await loadCurrentParticipants();
                manageParticipantsModal.classList.add('active');
            } catch (error) {
                console.error('Error loading participants:', error);
                showNotification('Error loading participants', true);
            }
        });
    }

    if (manageParticipantsModal) {
        // Close modal when clicking outside
        manageParticipantsModal.addEventListener('click', (e) => {
            if (e.target === manageParticipantsModal) {
                closeManageParticipantsModal();
            }
        });

        // Close modal when clicking cancel
        const cancelBtn = manageParticipantsModal.querySelector('.cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeManageParticipantsModal);
        }
    }

    if (saveParticipantsBtn) {
        saveParticipantsBtn.addEventListener('click', async () => {
            try {
                await saveParticipantChanges();
            } catch (error) {
                console.error('Error saving changes:', error);
                showNotification('Error saving changes', true);
            }
        });
    }

    // Handle "Show All Users" button
    if (showAllUsersBtn) {
        showAllUsersBtn.addEventListener('click', async () => {
            try {
                const users = await loadAllUsers();
                addParticipantResults.innerHTML = '';
                
                if (users.length === 0) {
                    addParticipantResults.innerHTML = '<div class="no-results">No users found</div>';
                } else {
                    users.forEach(user => {
                        const userElement = document.createElement('div');
                        userElement.className = 'user-result';
                        userElement.innerHTML = `
                            <div class="user-info">
                                <div class="user-name">${user.displayName || user.email.split('@')[0]}</div>
                                <div class="user-email">${user.email}</div>
                            </div>
                        `;
                        
                        userElement.addEventListener('click', () => {
                            addParticipant(user);
                            addParticipantSearch.value = '';
                            addParticipantResults.innerHTML = '';
                            addParticipantResults.classList.remove('active');
                        });
                        
                        addParticipantResults.appendChild(userElement);
                    });
                }
                
                addParticipantResults.classList.add('active');
            } catch (error) {
                console.error('Error loading users:', error);
                showNotification('Error loading users', true);
            }
        });
    }

    // Handle participant search
    if (addParticipantSearch) {
        let searchTimeout;
        addParticipantSearch.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 3) {
                addParticipantResults.innerHTML = '';
                addParticipantResults.classList.remove('active');
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const users = await searchUsers(query);
                    addParticipantResults.innerHTML = '';
                    
                    if (users.length === 0) {
                        addParticipantResults.innerHTML = '<div class="no-results">No users found</div>';
                    } else {
                        users.forEach(user => {
                            const userElement = document.createElement('div');
                            userElement.className = 'user-result';
                            userElement.innerHTML = `
                                <div class="user-info">
                                    <div class="user-name">${user.displayName || user.email.split('@')[0]}</div>
                                    <div class="user-email">${user.email}</div>
                                </div>
                            `;
                            
                            userElement.addEventListener('click', () => {
                                addParticipant(user);
                                addParticipantSearch.value = '';
                                addParticipantResults.innerHTML = '';
                                addParticipantResults.classList.remove('active');
                            });
                            
                            addParticipantResults.appendChild(userElement);
                        });
                    }
                    
                    addParticipantResults.classList.add('active');
                } catch (error) {
                    console.error('Error searching users:', error);
                    showNotification('Error searching users', true);
                }
            }, 300);
        });
    }
}

// Call initializeParticipantManagement when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeParticipantManagement();
});

// Function to delete conversation (group or DM)
async function deleteConversation(chatId, type) {
    try {
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Confirm deletion
        if (!confirm(`Are you sure you want to ${type === 'group' ? 'leave' : 'delete'} this conversation?`)) {
            return;
        }

        if (type === 'group') {
            // Get group data
            const groupDoc = await db.collection('groups').doc(chatId).get();
            if (!groupDoc.exists) {
                throw new Error('Group not found');
            }

            const groupData = groupDoc.data();

            // If user is the creator, delete the entire group
            if (groupData.createdBy === currentUser.uid) {
                // Delete all messages
                const messagesSnapshot = await db.collection('groups').doc(chatId)
                    .collection('messages').get();
                const deletePromises = messagesSnapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deletePromises);

                // Delete all announcements
                const announcementsSnapshot = await db.collection('groups').doc(chatId)
                    .collection('announcements').get();
                const announcementDeletePromises = announcementsSnapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(announcementDeletePromises);

                // Delete the group document
                await db.collection('groups').doc(chatId).delete();
                showNotification('Group deleted successfully');
            } else {
                // If user is not the creator, remove them from members
                await db.collection('groups').doc(chatId).update({
                    members: arrayRemove(currentUser.uid)
                });
                showNotification('Left group successfully');
            }
        } else {
            // For direct messages, delete the entire conversation
            const dmDoc = await db.collection('directMessages').doc(chatId).get();
            if (!dmDoc.exists) {
                throw new Error('Conversation not found');
            }

            // Delete all messages
            const messagesSnapshot = await db.collection('directMessages').doc(chatId)
                .collection('messages').get();
            const deletePromises = messagesSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);

            // Delete the DM document
            await db.collection('directMessages').doc(chatId).delete();
            showNotification('Conversation deleted successfully');
        }

        // Clear current chat if it was the deleted one
        if (currentChat && currentChat.id === chatId) {
            currentChat = null;
            currentChatType = null;
            document.getElementById('current-chat-name').textContent = 'Select a chat';
            document.getElementById('chat-type').textContent = 'No chat selected';
            document.getElementById('messages').innerHTML = '';
            document.getElementById('manage-participants-btn').style.display = 'none';
        }

        // Reload the appropriate list
        if (type === 'group') {
            await loadGroups();
        } else {
            await loadDMs();
        }

    } catch (error) {
        console.error('Error deleting conversation:', error);
        showNotification(error.message || 'Error deleting conversation', true);
    }
}

// Function to initialize DM search functionality
function initializeDMSearch() {
    const newDmBtn = document.getElementById('new-dm-btn');
    const newDmModal = document.getElementById('new-dm-modal');
    const dmUserSearch = document.getElementById('dm-user-search');
    const dmSearchResults = document.getElementById('dm-search-results');
    const showAllUsersDmBtn = document.getElementById('show-all-users-dm-btn');

    if (newDmBtn) {
        newDmBtn.addEventListener('click', () => {
            newDmModal.classList.add('active');
            dmUserSearch.value = '';
            dmSearchResults.innerHTML = '';
        });
    }

    // Handle "Show All Users" button
    if (showAllUsersDmBtn) {
        showAllUsersDmBtn.addEventListener('click', async () => {
            try {
                const users = await loadAllUsers();
                dmSearchResults.innerHTML = '';
                
                if (users.length === 0) {
                    dmSearchResults.innerHTML = '<div class="no-results">No users found</div>';
                } else {
                    users.forEach(user => {
                        const userElement = createUserSearchResult(user);
                        dmSearchResults.appendChild(userElement);
                    });
                }
                
                dmSearchResults.classList.add('active');
            } catch (error) {
                console.error('Error loading users:', error);
                showNotification('Error loading users', true);
            }
        });
    }

    // Handle user search
    if (dmUserSearch) {
        let searchTimeout;
        dmUserSearch.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 3) {
                dmSearchResults.innerHTML = '';
                dmSearchResults.classList.remove('active');
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const users = await searchUsers(query);
                    dmSearchResults.innerHTML = '';
                    
                    if (users.length === 0) {
                        dmSearchResults.innerHTML = '<div class="no-results">No users found</div>';
                    } else {
                        users.forEach(user => {
                            const userElement = createUserSearchResult(user);
                            dmSearchResults.appendChild(userElement);
                        });
                    }
                    
                    dmSearchResults.classList.add('active');
                } catch (error) {
                    console.error('Error searching users:', error);
                    showNotification('Error searching users', true);
                }
            }, 300);
        });
    }
}

// Function to create user search result element
function createUserSearchResult(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-result';
    userElement.innerHTML = `
        <div class="user-info">
            <div class="user-name">${user.displayName || user.email.split('@')[0]}</div>
            <div class="user-email">${user.email}</div>
        </div>
    `;
    
    userElement.addEventListener('click', async () => {
        try {
            const dm = await createOrGetDM(
                user.id,
                user.displayName || user.email.split('@')[0],
                user.email
            );
            
            // Close modal
            const newDmModal = document.getElementById('new-dm-modal');
            if (newDmModal) {
                newDmModal.classList.remove('active');
            }
            
            // Select the DM
            await selectDM(dm.id, dm);
            
            // Clear search and reload DMs
            const dmUserSearch = document.getElementById('dm-user-search');
            const dmSearchResults = document.getElementById('dm-search-results');
            if (dmUserSearch) dmUserSearch.value = '';
            if (dmSearchResults) {
                dmSearchResults.innerHTML = '';
                dmSearchResults.classList.remove('active');
            }
            
            await loadDMs();
            showNotification('Direct message started');
        } catch (error) {
            console.error('Error starting DM:', error);
            showNotification('Error starting conversation', true);
        }
    });
    
    return userElement;
}

// Call initializeDMSearch when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeDMSearch();
});

async function handleVideoCall() {
    try {
        if (!currentChat || !currentUser) return;

        const offer = await createOffer();
        
        currentCall = await addDoc(collection(db, 'calls'), {
            type: 'video',
            chatId: currentChat.id,
            chatType: currentChatType,
            callerId: currentUser.uid,
            callerName: currentUser.displayName || currentUser.email.split('@')[0],
            offer: offer,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        
        showCallModal('video');
        
        const unsubscribe = onSnapshot(doc(db, 'calls', currentCall.id), (doc) => {
            if (!doc.exists()) return;
            
            const callData = doc.data();
            if (callData.status === 'accepted') {
                handleCallAccepted(callData.answer);
            } else if (callData.status === 'rejected') {
                handleCallRejected();
            } else if (callData.status === 'ended') {
                handleCallEnded();
            }
        });
        
        callListener = unsubscribe;
    } catch (error) {
        console.error('Error initiating video call:', error);
        showNotification('Error starting video call', true);
            }
        }

async function handleVoiceCall() {
    try {
        if (!currentChat || !currentUser) return;

        const offer = await createOffer();
        
        currentCall = await addDoc(collection(db, 'calls'), {
            type: 'voice',
            chatId: currentChat.id,
            chatType: currentChatType,
            callerId: currentUser.uid,
            callerName: currentUser.displayName || currentUser.email.split('@')[0],
            offer: offer,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        
        showCallModal('voice');
        
        const unsubscribe = onSnapshot(doc(db, 'calls', currentCall.id), (doc) => {
            if (!doc.exists()) return;
            
            const callData = doc.data();
            if (callData.status === 'accepted') {
                handleCallAccepted(callData.answer);
            } else if (callData.status === 'rejected') {
                handleCallRejected();
            } else if (callData.status === 'ended') {
                handleCallEnded();
            }
        });
        
        callListener = unsubscribe;
    } catch (error) {
        console.error('Error initiating voice call:', error);
        showNotification('Error starting voice call', true);
    }
}

async function endCall() {
    try {
        if (!currentCall) return;

        await updateDoc(doc(db, 'calls', currentCall.id), {
            status: 'ended',
            endedAt: serverTimestamp()
        });
        
        currentCall = null;
        
        if (callListener) {
            callListener();
            callListener = null;
        }
        
        closeCallModal();
    } catch (error) {
        console.error('Error ending call:', error);
    }
}

function handleIncomingCalls() {
    const callsRef = collection(db, 'calls');
    const callsQuery = query(
        callsRef,
        where('status', '==', 'pending'),
        where('chatId', '==', currentChat?.id)
    );
    
    onSnapshot(callsQuery, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const callData = change.doc.data();
                if (callData.callerId !== currentUser.uid) {
                    handleIncomingCall(change.doc.id, callData);
                }
            }
        });
    });
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

async function leaveGroup() {
    try {
        if (!currentChat || !currentUser) return;

        await updateDoc(doc(db, 'groups', currentChat.id), {
            members: arrayRemove(currentUser.uid)
        });

        // Remove user's name from memberNames
        const groupDoc = await getDoc(doc(db, 'groups', currentChat.id));
        if (groupDoc.exists()) {
            const groupData = groupDoc.data();
            const memberNames = { ...groupData.memberNames };
            delete memberNames[currentUser.uid];
            
            await updateDoc(doc(db, 'groups', currentChat.id), {
                memberNames: memberNames
            });
        }

        showNotification('Left group successfully');
        closeChat();
        loadGroups();
    } catch (error) {
        console.error('Error leaving group:', error);
        showNotification('Error leaving group', true);
    }
}

// Function to add participant
function addParticipant(user) {
    // Check if user is already selected
    if (selectedParticipants.some(p => p.id === user.id)) {
        showNotification('User already selected', true);
        return;
    }

    // Add user to selected participants
    selectedParticipants.push({
        id: user.id,
        name: user.displayName || user.email.split('@')[0],
        email: user.email
    });

    // Update UI
    const newParticipants = document.getElementById('new-participants');
    if (newParticipants) {
        const participantElement = document.createElement('div');
        participantElement.className = 'selected-participant';
        participantElement.dataset.userId = user.id;
        participantElement.innerHTML = `
            <div class="participant-info">
                <div class="participant-name">${user.displayName || user.email.split('@')[0]}</div>
                <div class="participant-email">${user.email}</div>
            </div>
            <button class="remove-participant" onclick="removeParticipant('${user.id}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        newParticipants.appendChild(participantElement);
    }
}

// Function to remove participant
function removeParticipant(userId) {
    // Remove from array
    selectedParticipants = selectedParticipants.filter(p => p.id !== userId);

    // Remove from UI
    const participantElement = document.querySelector(`.selected-participant[data-user-id="${userId}"]`);
    if (participantElement) {
        participantElement.remove();
    }
}

// Function to close create group modal
function closeCreateGroupModal() {
    const modal = document.getElementById('create-group-modal');
    if (modal) {
        modal.classList.remove('active');
        // Clear form
        const form = document.getElementById('create-group-form');
        if (form) {
            form.reset();
        }
        // Clear selected participants
        selectedParticipants = [];
        const newParticipants = document.getElementById('new-participants');
        if (newParticipants) {
            newParticipants.innerHTML = '';
        }
    }
}