// Remove imports and use global firebase object
const db = firebase.firestore();

// DOM Elements
const eventsGrid = document.querySelector('.events-grid');
const tabButtons = document.querySelectorAll('.tab-btn');
const searchInput = document.querySelector('.search-bar input');
const dateFilter = document.getElementById('date-filter');
const categoryFilter = document.getElementById('category-filter');
const logoutBtn = document.getElementById('logout-btn');

// Current filter state
let currentFilters = {
  type: 'all',
  search: '',
  date: '',
  category: ''
};

// Format date for display
function formatDate(timestamp) {
  if (!timestamp) return 'Date TBD';
  const date = timestamp.toDate();
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Create event card HTML
function createEventCard(event, isRegistered = false, registrationData = null) {
  const isHackathon = event.type?.toLowerCase() === 'hackathon';
  const selectedTab = document.querySelector('.tab-btn.active')?.getAttribute('data-type');
  
  const card = document.createElement('div');
  card.className = `event-card ${isHackathon ? 'hackathon-card' : ''}`;
  card.setAttribute('data-type', event.type?.toLowerCase());
  
  card.innerHTML = `
    <div class="event-header">
      <h3>${event.title}</h3>
      <span class="event-type ${event.type?.toLowerCase()}">${event.type}</span>
    </div>
    <div class="event-details">
      <p><i class="fas fa-calendar"></i> ${event.date}</p>
      <p><i class="fas fa-map-marker-alt"></i> ${event.location}</p>
      <p><i class="fas fa-users"></i> ${event.participants?.length || 0}/${event.capacity} participants</p>
      <p><i class="fas fa-tag"></i> ${event.type}</p>
      ${isHackathon ? `
        <div class="hackathon-details">
          <span class="prize-pool"><i class="fas fa-trophy"></i> Prize Pool: ₹${event.prizeAmount || 'TBD'}</span>
        </div>
      ` : ''}
    </div>
    ${isRegistered && registrationData ? `
      <div class="registration-details">
        <h4>Your Registration Details</h4>
        ${registrationData.teamSize > 1 ? `
          <div class="team-info">
            <p><strong>Team Name:</strong> ${registrationData.teamMembers[0]}'s Team</p>
            <p><strong>Team Members:</strong></p>
            <ul>
              ${registrationData.teamMembers.map(member => `<li>${member}</li>`).join('')}
            </ul>
          </div>
        ` : `
          <p><strong>Registered as:</strong> ${registrationData.userName || 'Unknown User'}</p>
          <p><strong>Email:</strong> ${registrationData.userEmail || 'No email'}</p>
        `}
        <p><strong>Registration Date:</strong> ${formatDate(registrationData.timestamp)}</p>
      </div>
    ` : ''}
    <div class="event-actions">
      ${!event.registrationClosed && !isRegistered && selectedTab !== 'my-events' ? `
        <button class="cyber-button register-btn" data-event-id="${event.id}">
          <i class="fas fa-user-plus"></i> Register Now
        </button>
      ` : ''}
      ${isRegistered ? `
        <button class="cyber-button registered-btn" disabled>
          <i class="fas fa-check-circle"></i> Already Registered
        </button>
      ` : ''}
      ${event.registrationClosed ? `
        <button class="cyber-button closed-btn" disabled>
          <i class="fas fa-lock"></i> Registration Closed
        </button>
      ` : ''}
    </div>
  `;

  // Add event listener for registration
  const registerBtn = card.querySelector('.register-btn');
  if (registerBtn) {
    registerBtn.addEventListener('click', () => showRegistrationModal(event.id, event));
  }

  return card;
}

// Show registration modal
function showRegistrationModal(eventId, eventData) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  
  const isHackathon = eventData.type?.toLowerCase() === 'hackathon';
  
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-modal">&times;</span>
      <h2>Register for ${eventData.title}</h2>
      <form id="registration-form" class="registration-form">
        ${isHackathon ? `
          <div class="form-group">
            <label for="team-size">Team Size (1-4 members)</label>
            <input type="number" id="team-size" min="1" max="4" required>
          </div>
          <div id="team-members-container" class="team-members-container">
            <h3>Team Members</h3>
            <div class="form-group">
              <label for="member-1">Team Lead (You)</label>
              <input type="text" id="member-1" value="${firebase.auth().currentUser.displayName || ''}" readonly>
            </div>
            <div id="additional-members"></div>
          </div>
        ` : ''}
        <div class="form-group">
          <label for="registration-notes">Additional Notes (Optional)</label>
          <textarea id="registration-notes" rows="3" placeholder="Any special requirements or questions?"></textarea>
        </div>
        <button type="submit" class="cyber-button">Confirm Registration</button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'block';

  // Handle team size change
  if (isHackathon) {
    const teamSizeInput = modal.querySelector('#team-size');
    const additionalMembersContainer = modal.querySelector('#additional-members');
    
    teamSizeInput.addEventListener('change', (e) => {
      const size = parseInt(e.target.value);
      additionalMembersContainer.innerHTML = '';
      
      // Add input fields for additional team members
      for (let i = 2; i <= size; i++) {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'form-group';
        memberDiv.innerHTML = `
          <label for="member-${i}">Team Member ${i}</label>
          <input type="text" id="member-${i}" placeholder="Enter team member name" required>
        `;
        additionalMembersContainer.appendChild(memberDiv);
      }
    });
  }

  // Handle form submission
  const form = modal.querySelector('#registration-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const registrationData = {
      eventId: eventId,
      userId: firebase.auth().currentUser.uid,
      timestamp: new Date(),
      status: 'registered',
      notes: document.getElementById('registration-notes').value
    };

    if (isHackathon) {
      const teamSize = parseInt(document.getElementById('team-size').value);
      registrationData.teamSize = teamSize;
      
      // Collect team member names
      registrationData.teamMembers = [];
      for (let i = 1; i <= teamSize; i++) {
        const memberName = document.getElementById(`member-${i}`).value;
        registrationData.teamMembers.push(memberName);
      }
    }

    try {
      await handleRegistration(eventId, eventData, registrationData);
      modal.remove();
    } catch (error) {
      console.error('Error in registration:', error);
      alert('Error during registration. Please try again.');
    }
  });

  // Handle modal close
  const closeBtn = modal.querySelector('.close-modal');
  closeBtn.onclick = () => modal.remove();
  
  window.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

// Show cyberpunk popup message
function showCyberPopup(message, type = 'info') {
  const popup = document.createElement('div');
  popup.className = 'cyber-popup';
  
  const content = document.createElement('div');
  content.className = 'cyber-popup-content';
  content.textContent = message;
  
  const buttons = document.createElement('div');
  buttons.className = 'cyber-popup-buttons';
  
  const okButton = document.createElement('button');
  okButton.className = 'cyber-popup-button';
  okButton.textContent = 'OK';
  okButton.onclick = () => popup.remove();
  
  buttons.appendChild(okButton);
  popup.appendChild(content);
  popup.appendChild(buttons);
  
  document.body.appendChild(popup);
  
  // Auto remove after 5 seconds for info messages
  if (type === 'info') {
    setTimeout(() => {
      if (document.body.contains(popup)) {
        popup.remove();
      }
    }, 5000);
  }
}

// Handle event registration
async function handleRegistration(eventId, eventData, registrationData) {
  try {
    const user = firebase.auth().currentUser;
    if (!user) {
      throw new Error('Please log in to register for events');
    }

    console.log('Current user:', user.uid);
    console.log('Event data:', eventData);

    // Check if user is already registered
    const existingRegistration = await db.collection('registrations')
      .where('eventId', '==', eventId)
      .where('userId', '==', user.uid)
      .get();

    if (!existingRegistration.empty) {
      throw new Error('You are already registered for this event');
    }

    // Check if user is the event creator
    if (eventData.createdBy === user.uid) {
      throw new Error('You cannot register for your own event');
    }

    // Get current registration count
    const registrationsSnapshot = await db.collection('registrations')
      .where('eventId', '==', eventId)
      .get();

    const currentCount = registrationsSnapshot.size;
    if (currentCount >= eventData.capacity) {
      throw new Error('Sorry, this event is full');
    }

    // Create registration with required fields
    const registration = {
      eventId: eventId,
      userId: user.uid,
      timestamp: new Date(),
      status: 'registered',
      userName: user.displayName || user.email,
      userEmail: user.email
    };

    console.log('Attempting to create registration:', registration);

    try {
      // Add registration to Firestore using v9 syntax
      const registrationsRef = db.collection('registrations');
      const docRef = await registrationsRef.add(registration);
      console.log('Registration created with ID:', docRef.id);
      showCyberPopup('Successfully registered for the event!', 'success');
      fetchEvents();
    } catch (error) {
      console.error('Firestore error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      throw new Error('Error during registration. Please try again.');
    }
  } catch (error) {
    console.error('Error registering for event:', error);
    showCyberPopup(error.message || 'Error during registration. Please try again.', 'error');
    throw error;
  }
}

// Show participants modal
async function showParticipantsModal(eventId) {
  try {
    const registrationsRef = db.collection('registrations');
    const registrationQuery = db.collection('registrations').where('eventId', '==', eventId);
    const registrationsSnapshot = await registrationsRef.get();

    const modal = document.createElement('div');
    modal.className = 'modal';
    
    let participantsHtml = '';
    if (registrationsSnapshot.empty) {
      participantsHtml = '<p class="no-participants">No participants registered yet.</p>';
    } else {
      participantsHtml = `
        <div class="participants-list">
          <div class="participants-header">
            <h3>Total Participants: ${registrationsSnapshot.size}</h3>
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
                <h4>${registration.teamMembers[0]}'s Team</h4>
                <span class="team-size">${registration.teamSize} members</span>
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
                <i class="fas fa-user"></i> ${registration.userName || 'Anonymous'}
                <span class="participant-email">${registration.userEmail || ''}</span>
              </div>
            `}
            <div class="registration-details">
              <div class="registration-time">
                <i class="fas fa-clock"></i> ${formatDate(registration.timestamp)}
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
      <div class="modal-content">
        <span class="close-modal">&times;</span>
        <h2>Event Participants</h2>
        ${participantsHtml}
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Handle modal close
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn.onclick = () => modal.remove();
    
    window.onclick = (e) => {
      if (e.target === modal) modal.remove();
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
      registrationClosed: true
    });
    showCyberPopup('Registration closed successfully', 'success');
    fetchEvents();
  } catch (error) {
    console.error('Error closing registration:', error);
    showCyberPopup('Error closing registration. Please try again.', 'error');
  }
}

// Fetch and display events
async function fetchEvents() {
    try {
        const eventsGrid = document.querySelector('.events-grid');
        if (!eventsGrid) {
            console.error('Events grid element not found');
            return;
        }

        // Show loading state
        eventsGrid.innerHTML = '<div class="loading">Loading events...</div>';

        const eventsRef = db.collection('events');
        const eventsQuery = eventsRef.orderBy('createdAt', 'desc');
        
        // Set up real-time listener
        eventsQuery.onSnapshot(async (snapshot) => {
            const events = [];
            
            // Process each event
            for (const doc of snapshot.docs) {
                const event = doc.data();
                const eventData = {
                    id: doc.id,
                    ...event,
                    date: event.date,
                    createdAt: event.createdAt?.toDate()
                };

                // Check if user is registered for this event
                if (firebase.auth().currentUser) {
                    const registrationsQuery = db.collection('registrations')
                        .where('eventId', '==', doc.id)
                        .where('userId', '==', firebase.auth().currentUser.uid);
                    const registrationSnapshot = await registrationsQuery.get();
                    if (!registrationSnapshot.empty) {
                        eventData.isRegistered = true;
                        eventData.registrationData = registrationSnapshot.docs[0].data();
                    }
                }

                events.push(eventData);
            }

            // Filter events based on selected tab
            const selectedTab = document.querySelector('.tab-btn.active')?.getAttribute('data-type') || 'all';
            let filteredEvents = events;

            if (selectedTab !== 'all') {
                if (selectedTab === 'my-events') {
                    if (firebase.auth().currentUser) {
                        filteredEvents = events.filter(event => event.isRegistered);
                    } else {
                        filteredEvents = [];
                    }
                } else {
                    filteredEvents = events.filter(event => event.type?.toLowerCase() === selectedTab);
                }
            }

            // Sort events by date
            filteredEvents.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateA - dateB;
            });

            // Display events
            displayEvents(filteredEvents);
        }, (error) => {
            console.error('Error in events listener:', error);
            eventsGrid.innerHTML = '<div class="error">Error loading events. Please try again.</div>';
            showCyberPopup('Error loading events. Please try again.', 'error');
        });
    } catch (error) {
        console.error('Error fetching events:', error);
        showCyberPopup('Error loading events. Please try again.', 'error');
    }
}

// Display events
function displayEvents(events) {
    const eventsGrid = document.querySelector('.events-grid');
    if (!eventsGrid) return;

    eventsGrid.innerHTML = '';
    
    if (events.length === 0) {
        eventsGrid.innerHTML = `
            <div class="no-events">
                <i class="fas fa-calendar-times"></i>
                <p>No events found</p>
            </div>
        `;
        return;
    }

    events.forEach(event => {
        const eventCard = createEventCard(event, event.isRegistered, event.registrationData);
        eventsGrid.appendChild(eventCard);
    });
}

// Handle tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        // Add active class to clicked tab
        tab.classList.add('active');
        // Fetch events with new filter
        fetchEvents();
    });
});

// Event Listeners
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilters.type = btn.dataset.type;
    fetchEvents();
  });
});

searchInput.addEventListener('input', (e) => {
  currentFilters.search = e.target.value;
  fetchEvents();
});

dateFilter.addEventListener('change', (e) => {
  currentFilters.date = e.target.value;
  fetchEvents();
});

categoryFilter.addEventListener('change', (e) => {
  currentFilters.category = e.target.value;
  fetchEvents();
});

// Handle logout
logoutBtn.addEventListener('click', async () => {
  try {
    await firebase.auth().signOut();
    showCyberPopup('Logging out...', 'info');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (error) {
    console.error('Error signing out:', error);
    showCyberPopup('Error signing out. Please try again.', 'error');
  }
});

// Check if user is logged in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User is signed in
        fetchEvents();
    } else {
        window.location.href = 'auth.html';
    }
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    fetchEvents();
}); 