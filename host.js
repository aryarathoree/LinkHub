import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, query, where, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Check if user has a profile
        const profileDoc = await getDoc(doc(db, 'hosts', user.uid));
        if (profileDoc.exists()) {
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
    const user = auth.currentUser;
    if (!user) return;

    const profileData = {
        name: document.getElementById('host-name').value,
        organization: document.getElementById('host-org').value,
        email: document.getElementById('host-email').value,
        phone: document.getElementById('host-phone').value,
        userId: user.uid,
        createdAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, 'hosts', user.uid), profileData);
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
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.uid,
            registrationOpen: true,
            participants: []
        };

        // Add prize amount for hackathons
        if (typeInput.value === 'hackathon') {
            eventData.prizeAmount = parseInt(prizeAmountInput.value);
        }

        const eventsRef = collection(db, 'events');
        const docRef = await addDoc(eventsRef, eventData);

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

        // Remove popup after animation
        setTimeout(() => {
            document.body.removeChild(popup);
        }, 5000);

        // Clear form
        e.target.reset();
    } catch (error) {
        showCyberPopup('Error creating event: ' + error.message, 'error');
    }
});

// Load events
async function loadEvents(hostId) {
    try {
        const eventsQuery = query(collection(db, 'events'), where('createdBy', '==', hostId));
        const querySnapshot = await getDocs(eventsQuery);
        
        eventsGrid.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const event = doc.data();
            createEventCard(doc.id, event);
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
            <span class="event-type ${event.type}">${event.type}</span>
        </div>
        <div class="event-details">
            <p><i class="fas fa-calendar"></i> ${new Date(event.date).toLocaleDateString()}</p>
            <p><i class="fas fa-map-marker-alt"></i> ${event.location}</p>
            <p><i class="fas fa-users"></i> ${event.participants.length}/${event.capacity} participants</p>
            ${event.type === 'hackathon' ? `<p><i class="fas fa-trophy"></i> Prize: ₹${event.prizeAmount}</p>` : ''}
        </div>
        <div class="event-actions">
            <button onclick="showParticipantsModal('${eventId}')" class="cyber-button">
                <i class="fas fa-users"></i> View Participants
            </button>
            ${event.registrationOpen ? `
                <button onclick="closeEventRegistration('${eventId}')" class="cyber-button">
                    <i class="fas fa-lock"></i> Close Registration
                </button>
            ` : `
                <button disabled class="cyber-button">
                    <i class="fas fa-lock"></i> Registration Closed
                </button>
            `}
        </div>
    `;
    eventsGrid.appendChild(card);
}

// Show participants modal
async function showParticipantsModal(eventId) {
    try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (!eventDoc.exists()) {
            showCyberPopup('Event not found', 'error');
            return;
        }

        const event = eventDoc.data();
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Participants - ${event.title}</h2>
                    <button class="close-button">&times;</button>
                </div>
                <div class="modal-body">
                    ${event.participants.length === 0 ? 
                        '<p>No participants yet</p>' :
                        `<ul class="participants-list">
                            ${event.participants.map(participant => `
                                <li>
                                    <i class="fas fa-user"></i>
                                    ${participant.name}
                                    <span class="participant-email">${participant.email}</span>
                                </li>
                            `).join('')}
                        </ul>`
                    }
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal when clicking the close button or outside the modal
        modal.querySelector('.close-button').onclick = () => {
            document.body.removeChild(modal);
        };
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };
    } catch (error) {
        showCyberPopup('Error loading participants: ' + error.message, 'error');
    }
}

// Close event registration
async function closeEventRegistration(eventId) {
    try {
        await updateDoc(doc(db, 'events', eventId), {
            registrationOpen: false
        });
        showCyberPopup('Event registration closed successfully', 'success');
        // Reload events
        loadEvents(auth.currentUser.uid);
    } catch (error) {
        showCyberPopup('Error closing registration: ' + error.message, 'error');
    }
}

// Filter events
function filterEvents() {
    const typeValue = typeFilter.value;
    const statusValue = statusFilter.value;
    const cards = eventsGrid.getElementsByClassName('event-card');

    Array.from(cards).forEach(card => {
        const type = card.querySelector('.event-type').textContent;
        const date = new Date(card.querySelector('.event-details p:first-child').textContent.split(' ')[1]);
        const now = new Date();

        const typeMatch = typeValue === 'all' || type === typeValue;
        let statusMatch = true;

        if (statusValue !== 'all') {
            if (statusValue === 'upcoming') {
                statusMatch = date > now;
            } else if (statusValue === 'ongoing') {
                statusMatch = date.toDateString() === now.toDateString();
            } else if (statusValue === 'past') {
                statusMatch = date < now;
            }
        }

        card.style.display = typeMatch && statusMatch ? 'block' : 'none';
    });
}

// Add filter event listeners
typeFilter.addEventListener('change', filterEvents);
statusFilter.addEventListener('change', filterEvents);

// Logout functionality
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'auth.html';
    } catch (error) {
        showCyberPopup('Error signing out: ' + error.message, 'error');
    }
});

// Show cyber popup
function showCyberPopup(message, type = 'info') {
    const popup = document.createElement('div');
    popup.className = `cyber-popup ${type}`;
    popup.innerHTML = `
        <div class="cyber-popup-content">
            <div class="cyber-popup-icon">
                <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            </div>
            <div class="cyber-popup-message">
                <p>${message}</p>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Remove popup after 5 seconds
    setTimeout(() => {
        document.body.removeChild(popup);
    }, 5000);
}