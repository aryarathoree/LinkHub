// Remove imports and use global firebase object
const db = firebase.firestore();

// DOM Elements
const profileSection = document.getElementById('profile-section');
const eventSection = document.getElementById('event-section');
const hostProfileForm = document.getElementById('host-profile-form');
const createEventForm = document.getElementById('create-event-form');
const eventsGrid = document.getElementById('events-grid');
const typeFilter = document.getElementById('type-filter');
const statusFilter = document.getElementById('status-filter');
const logoutBtn = document.getElementById('logout-btn');

// Check authentication state
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user has a profile
        const profileDoc = await db.collection('hosts').doc(user.uid).get();
        if (profileDoc.exists) {
            // User has a profile, show event section
            profileSection.style.display = 'none';
            eventSection.style.display = 'block';
            // Load profile data into form
            const profileData = profileDoc.data();
            document.getElementById('host-name').value = profileData.name || '';
            document.getElementById('host-org').value = profileData.organization || '';
            document.getElementById('host-email').value = profileData.email || '';
            document.getElementById('host-phone').value = profileData.phone || '';
        } else {
            // User doesn't have a profile, show profile section
            profileSection.style.display = 'block';
            eventSection.style.display = 'none';
        }
        // Load events
        loadEvents(user.uid);
    } else {
        // Not logged in, show cyber popup
        showCyberPopup('Please log in to access the host dashboard', 'error');
    }
});

// Handle profile form submission
hostProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = firebase.auth().currentUser;
    if (!user) return;

    const profileData = {
        name: document.getElementById('host-name').value,
        organization: document.getElementById('host-org').value,
        email: document.getElementById('host-email').value,
        phone: document.getElementById('host-phone').value,
        userId: user.uid,
        createdAt: new Date()
    };

    try {
        await db.collection('hosts').doc(user.uid).set(profileData);
        showCyberPopup('Profile saved successfully!', 'success');
        // Show event section
        profileSection.style.display = 'none';
        eventSection.style.display = 'block';
    } catch (error) {
        showCyberPopup('Error saving profile: ' + error.message, 'error');
    }
});

// Event type change handler
document.getElementById('event-type').addEventListener('change', (e) => {
    const prizeAmountGroup = document.getElementById('prize-amount-group');
    const prizeAmountInput = document.getElementById('prize-amount');
    
    if (e.target.value === 'hackathon') {
        prizeAmountGroup.style.display = 'block';
        prizeAmountInput.required = true;
    } else {
        prizeAmountGroup.style.display = 'none';
        prizeAmountInput.required = false;
        prizeAmountInput.value = '';
    }
});

// Event creation form submission
document.getElementById('create-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const titleInput = document.getElementById('event-title');
    const typeInput = document.getElementById('event-type');
    const descriptionInput = document.getElementById('event-description');
    const dateInput = document.getElementById('event-date');
    const locationInput = document.getElementById('event-location');
    const capacityInput = document.getElementById('event-capacity');
    const prizeAmountInput = document.getElementById('prize-amount');

    try {
        const eventData = {
            title: titleInput.value,
            type: typeInput.value,
            description: descriptionInput.value,
            date: dateInput.value,
            location: locationInput.value,
            capacity: parseInt(capacityInput.value),
            createdAt: new Date(),
            createdBy: firebase.auth().currentUser.uid,
            registrationOpen: true,
            participants: []
        };

        // Add prize amount for hackathons
        if (typeInput.value === 'hackathon') {
            eventData.prizeAmount = parseInt(prizeAmountInput.value);
        }

        const eventsRef = db.collection('events');
        const docRef = await eventsRef.add(eventData);

        // Show success popup
        const popup = document.createElement('div');
        popup.className = 'cyber-popup';
        popup.innerHTML = `
            <div class="cyber-popup-content">
                <div class="cyber-popup-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="cyber-popup-message">
                    <h3>Event Created</h3>
                    <p>Your ${eventData.type} has been successfully created!</p>
                    ${eventData.type === 'hackathon' ? `<p>Prize Amount: ₹${eventData.prizeAmount}</p>` : ''}
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .cyber-popup {
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--darker-bg);
                border: 2px solid var(--primary-pink);
                box-shadow: 0 0 20px rgba(255, 42, 109, 0.3);
                padding: 1.5rem;
                border-radius: 4px;
                z-index: 1000;
                animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 4.7s forwards;
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .cyber-popup-content {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .cyber-popup-icon {
                font-size: 2rem;
                color: var(--primary-pink);
                animation: pulse 2s infinite;
            }

            .cyber-popup-message h3 {
                color: var(--primary-pink);
                margin: 0 0 0.5rem 0;
                font-size: 1.2rem;
            }

            .cyber-popup-message p {
                color: var(--text-color);
                margin: 0;
                font-size: 0.9rem;
            }

            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                }
                to {
                    transform: translateX(0);
                }
            }

            @keyframes fadeOut {
                from {
                    opacity: 1;
                }
                to {
                    opacity: 0;
                }
            }

            @keyframes pulse {
                0% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.1);
                }
                100% {
                    transform: scale(1);
                }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(popup);

        // Remove popup and style after animation
        setTimeout(() => {
            popup.remove();
            style.remove();
        }, 5000);

        // Reset form
        e.target.reset();
        document.getElementById('prize-amount-group').style.display = 'none';

        // Reload events
        loadEvents();
    } catch (error) {
        console.error('Error creating event:', error);
        alert('Error creating event. Please try again.');
    }
});

// Load events
async function loadEvents(hostId) {
    try {
        const eventsQuery = db.collection('events').where('hostId', '==', hostId);
        const querySnapshot = await eventsQuery.get();
        
        eventsGrid.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const event = doc.data();
            const eventCard = createEventCard(doc.id, event);
            eventsGrid.appendChild(eventCard);
        });
    } catch (error) {
        showCyberPopup('Error loading events: ' + error.message, 'error');
    }
}

// Create event card
function createEventCard(eventId, event) {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
        <div class="event-header">
            <h3>${event.title}</h3>
            <span class="event-type ${event.type.toLowerCase()}">${event.type}</span>
        </div>
        <div class="event-details">
            <p><i class="fas fa-calendar"></i> ${event.date}</p>
            <p><i class="fas fa-map-marker-alt"></i> ${event.location}</p>
            <p><i class="fas fa-users"></i> ${event.participants.length}/${event.capacity} participants</p>
            <p><i class="fas fa-tag"></i> ${event.type}</p>
        </div>
        <div class="event-actions">
            <button class="cyber-button view-participants" data-event-id="${eventId}">
                <i class="fas fa-users"></i> View Participants
            </button>
            <button class="cyber-button close-registration" data-event-id="${eventId}" ${event.status === 'closed' ? 'disabled' : ''}>
                <i class="fas fa-lock"></i> Close Registration
            </button>
        </div>
    `;

    // Add event listeners
    const viewParticipantsBtn = card.querySelector('.view-participants');
    if (viewParticipantsBtn) {
        viewParticipantsBtn.addEventListener('click', () => showParticipantsModal(eventId));
    }

    const closeRegistrationBtn = card.querySelector('.close-registration');
    if (closeRegistrationBtn) {
        closeRegistrationBtn.addEventListener('click', () => closeEventRegistration(eventId));
    }

    return card;
}

// Show participants modal
async function showParticipantsModal(eventId) {
    try {
        const registrationsRef = db.collection('registrations');
        const registrationQuery = registrationsRef.where('eventId', '==', eventId);
        const registrationsSnapshot = await registrationQuery.get();

        const modal = document.createElement('div');
        modal.className = 'cyber-modal';
        
        let participantsHtml = '';
        if (registrationsSnapshot.empty) {
            participantsHtml = '<p class="no-participants">No participants registered yet.</p>';
        } else {
            participantsHtml = `
                <div class="participants-list">
                    <div class="participants-header">
                        <h3><i class="fas fa-users"></i> Total Participants: ${registrationsSnapshot.size}</h3>
                    </div>
                    <div class="participants-grid">
            `;
            
            registrationsSnapshot.forEach(doc => {
                const registration = doc.data();
                const isTeam = registration.teamSize > 1;
                
                participantsHtml += `
                    <div class="participant-card ${isTeam ? 'team-card' : ''}">
                        ${isTeam ? `
                            <div class="team-header">
                                <h4><i class="fas fa-users-cog"></i> ${registration.teamMembers[0]}'s Team</h4>
                                <span class="team-size"><i class="fas fa-user-friends"></i> ${registration.teamSize} members</span>
                            </div>
                            <div class="team-members">
                                ${registration.teamMembers.map(member => `
                                    <div class="team-member">
                                        <i class="fas fa-user"></i> ${member}
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="participant-info">
                                <div class="participant-name">
                                    <i class="fas fa-user"></i> ${registration.userName || 'Anonymous'}
                                </div>
                                <div class="participant-email">
                                    <i class="fas fa-envelope"></i> ${registration.userEmail || ''}
                                </div>
                            </div>
                        `}
                        <div class="registration-details">
                            <div class="registration-time">
                                <i class="fas fa-clock"></i> ${new Date(registration.timestamp.toDate()).toLocaleString()}
                            </div>
                            ${registration.notes ? `
                                <div class="registration-notes">
                                    <i class="fas fa-sticky-note"></i> ${registration.notes}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            
            participantsHtml += `
                    </div>
                </div>
            `;
        }

        modal.innerHTML = `
            <div class="cyber-modal-content">
                <div class="cyber-modal-header">
                    <h2><i class="fas fa-users"></i> Event Participants</h2>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="cyber-modal-body">
                    ${participantsHtml}
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .cyber-modal {
                display: block;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 1000;
                overflow-y: auto;
            }

            .cyber-modal-content {
                background: var(--darker-bg);
                border: 2px solid var(--primary-pink);
                box-shadow: 0 0 20px rgba(255, 42, 109, 0.3);
                margin: 5% auto;
                padding: 0;
                width: 90%;
                max-width: 800px;
                position: relative;
                animation: modalSlideIn 0.3s ease-out;
            }

            @keyframes modalSlideIn {
                from {
                    transform: translateY(-50px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            .cyber-modal-header {
                background: rgba(255, 42, 109, 0.1);
                padding: 1rem;
                border-bottom: 1px solid var(--primary-pink);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .cyber-modal-header h2 {
                color: var(--primary-pink);
                margin: 0;
                font-size: 1.5rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .cyber-modal-body {
                padding: 1.5rem;
                max-height: 70vh;
                overflow-y: auto;
            }

            .close-modal {
                color: var(--primary-pink);
                font-size: 2rem;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .close-modal:hover {
                color: var(--text-color);
                text-shadow: 0 0 10px var(--primary-pink);
            }

            .participants-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 1.5rem;
                margin-top: 1.5rem;
            }

            .participant-card {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--primary-pink);
                border-radius: 4px;
                padding: 1rem;
                transition: all 0.3s ease;
            }

            .participant-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 0 15px rgba(255, 42, 109, 0.2);
            }

            .team-card {
                background: rgba(255, 42, 109, 0.05);
            }

            .team-header {
                margin-bottom: 1rem;
            }

            .team-header h4 {
                color: var(--primary-pink);
                margin: 0 0 0.5rem 0;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .team-size {
                color: var(--text-secondary);
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 0.3rem;
            }

            .team-members {
                margin-top: 0.5rem;
            }

            .team-member {
                padding: 0.5rem;
                background: rgba(0, 0, 0, 0.2);
                margin: 0.3rem 0;
                border-radius: 2px;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .participant-info {
                margin-bottom: 1rem;
            }

            .participant-name {
                color: var(--primary-pink);
                font-size: 1.1rem;
                margin-bottom: 0.5rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .participant-email {
                color: var(--text-secondary);
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .registration-details {
                margin-top: 1rem;
                padding-top: 1rem;
                border-top: 1px solid rgba(255, 42, 109, 0.2);
            }

            .registration-time {
                color: var(--text-secondary);
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .registration-notes {
                margin-top: 0.5rem;
                color: var(--text-secondary);
                font-size: 0.9rem;
                display: flex;
                align-items: flex-start;
                gap: 0.5rem;
            }

            .no-participants {
                text-align: center;
                color: var(--text-secondary);
                padding: 2rem;
                font-size: 1.1rem;
            }

            @media (max-width: 768px) {
                .cyber-modal-content {
                    width: 95%;
                    margin: 10% auto;
                }

                .participants-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(modal);
        modal.style.display = 'block';

        // Handle modal close
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.onclick = () => {
            modal.remove();
            style.remove();
        };
        
        window.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                style.remove();
            }
        };
    } catch (error) {
        console.error('Error showing participants:', error);
        showCyberPopup('Error loading participants. Please try again.', 'error');
    }
}

// Close event registration
async function closeEventRegistration(eventId) {
    try {
        const eventRef = db.collection('events').doc(eventId);
        await eventRef.update({
            status: 'closed',
            registrationClosed: true
        });
        
        // Show cyberpunk-themed popup
        const popup = document.createElement('div');
        popup.className = 'cyber-popup';
        popup.innerHTML = `
            <div class="cyber-popup-content">
                <div class="cyber-popup-icon">
                    <i class="fas fa-lock"></i>
                </div>
                <div class="cyber-popup-message">
                    <h3>Registration Closed</h3>
                    <p>Event registration has been successfully closed.</p>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .cyber-popup {
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--darker-bg);
                border: 2px solid var(--primary-pink);
                box-shadow: 0 0 20px rgba(255, 42, 109, 0.3);
                padding: 1.5rem;
                border-radius: 4px;
                z-index: 1000;
                animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 4.7s forwards;
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .cyber-popup-content {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .cyber-popup-icon {
                font-size: 2rem;
                color: var(--primary-pink);
                animation: pulse 2s infinite;
            }

            .cyber-popup-message h3 {
                color: var(--primary-pink);
                margin: 0 0 0.5rem 0;
                font-size: 1.2rem;
            }

            .cyber-popup-message p {
                color: var(--text-color);
                margin: 0;
                font-size: 0.9rem;
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

            @keyframes fadeOut {
                from {
                    opacity: 1;
                }
                to {
                    opacity: 0;
                }
            }

            @keyframes pulse {
                0% {
                    text-shadow: 0 0 5px var(--primary-pink);
                }
                50% {
                    text-shadow: 0 0 20px var(--primary-pink);
                }
                100% {
                    text-shadow: 0 0 5px var(--primary-pink);
                }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(popup);

        // Remove popup and style after animation
        setTimeout(() => {
            popup.remove();
            style.remove();
        }, 5000);

        // Reload events
        loadEvents(firebase.auth().currentUser.uid);
    } catch (error) {
        console.error('Error closing registration:', error);
        showCyberPopup('Error closing registration. Please try again.', 'error');
    }
}

// Handle filters
typeFilter.addEventListener('change', () => filterEvents());
statusFilter.addEventListener('change', () => filterEvents());

function filterEvents() {
    const type = typeFilter.value;
    const status = statusFilter.value;
    const cards = eventsGrid.getElementsByClassName('event-card');

    Array.from(cards).forEach(card => {
        const eventType = card.querySelector('.event-type').textContent;
        const eventStatus = card.querySelector('.close-registration').disabled ? 'closed' : 'open';
        
        const typeMatch = type === 'all' || eventType === type;
        const statusMatch = status === 'all' || eventStatus === status;
        
        card.style.display = typeMatch && statusMatch ? 'block' : 'none';
    });
}

// Handle logout
logoutBtn.addEventListener('click', async () => {
    try {
        await firebase.auth().signOut();
        showCyberPopup('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    } catch (error) {
        showCyberPopup('Error logging out: ' + error.message, 'error');
    }
});

// Cyberpunk popup message
function showCyberPopup(message, type = 'info') {
    const popup = document.createElement('div');
    popup.className = 'cyber-popup';
    popup.innerHTML = `
        <div class="cyber-popup-content">${message}</div>
        <div class="cyber-popup-buttons">
            <button class="cyber-popup-button">OK</button>
        </div>
    `;

    document.body.appendChild(popup);

    const button = popup.querySelector('.cyber-popup-button');
    button.addEventListener('click', () => {
        popup.remove();
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(popup)) {
            popup.remove();
        }
    }, 5000);
}