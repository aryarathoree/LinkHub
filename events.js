import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, addDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Utility function for debouncing
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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
              <input type="text" id="member-1" value="${auth.currentUser.displayName || ''}" readonly>
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
          <div class="search-container">
            <input type="text" id="member-${i}" placeholder="Search user by email..." class="member-search">
            <button type="button" class="action-btn show-all-btn" data-member="${i}">
              <i class="fas fa-users"></i> Show All Users
            </button>
          </div>
          <div id="search-results-${i}" class="search-results"></div>
          <div id="selected-member-${i}" class="selected-member"></div>
        `;
        additionalMembersContainer.appendChild(memberDiv);

        // Add event listeners for search
        const searchInput = memberDiv.querySelector('.member-search');
        const showAllBtn = memberDiv.querySelector('.show-all-btn');
        const searchResults = memberDiv.querySelector(`#search-results-${i}`);
        const selectedMember = memberDiv.querySelector(`#selected-member-${i}`);

        // Search users as you type
        searchInput.addEventListener('input', debounce(async (e) => {
          const searchTerm = e.target.value.trim();
          if (searchTerm.length < 3) {
            searchResults.innerHTML = '';
            searchResults.classList.remove('active');
            return;
          }

          try {
            const usersRef = collection(db, 'users');
            const searchQuery = query(
              usersRef,
              where('email', '>=', searchTerm),
              where('email', '<=', searchTerm + '\uf8ff')
            );
            const querySnapshot = await getDocs(searchQuery);
            
            searchResults.innerHTML = '';
            if (querySnapshot.empty) {
              searchResults.innerHTML = '<div class="no-results">No users found</div>';
            } else {
              querySnapshot.forEach(doc => {
                const userData = doc.data();
                const userDiv = document.createElement('div');
                userDiv.className = 'user-result';
                userDiv.innerHTML = `
                  <div class="user-info">
                    <span class="user-name">${userData.name || 'Unknown'}</span>
                    <span class="user-email">${userData.email}</span>
                  </div>
                `;
                userDiv.addEventListener('click', () => {
                  searchInput.value = userData.email;
                  selectedMember.innerHTML = `
                    <div class="selected-user">
                      <span>${userData.name || 'Unknown'}</span>
                      <span class="user-email">${userData.email}</span>
                      <button type="button" class="remove-user" data-email="${userData.email}">
                        <i class="fas fa-times"></i>
                      </button>
                    </div>
                  `;
                  searchResults.classList.remove('active');
                });
                searchResults.appendChild(userDiv);
              });
            }
            searchResults.classList.add('active');
          } catch (error) {
            console.error('Error searching users:', error);
            searchResults.innerHTML = '<div class="error-message">Error searching users</div>';
          }
        }, 300));

        // Show all users
        showAllBtn.addEventListener('click', async () => {
          try {
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);
            
            searchResults.innerHTML = '';
            if (querySnapshot.empty) {
              searchResults.innerHTML = '<div class="no-results">No users found</div>';
            } else {
              querySnapshot.forEach(doc => {
                const userData = doc.data();
                const userDiv = document.createElement('div');
                userDiv.className = 'user-result';
                userDiv.innerHTML = `
                  <div class="user-info">
                    <span class="user-name">${userData.name || 'Unknown'}</span>
                    <span class="user-email">${userData.email}</span>
                  </div>
                `;
                userDiv.addEventListener('click', () => {
                  searchInput.value = userData.email;
                  selectedMember.innerHTML = `
                    <div class="selected-user">
                      <span>${userData.name || 'Unknown'}</span>
                      <span class="user-email">${userData.email}</span>
                      <button type="button" class="remove-user" data-email="${userData.email}">
                        <i class="fas fa-times"></i>
                      </button>
                    </div>
                  `;
                  searchResults.classList.remove('active');
                });
                searchResults.appendChild(userDiv);
              });
            }
            searchResults.classList.add('active');
          } catch (error) {
            console.error('Error loading users:', error);
            searchResults.innerHTML = '<div class="error-message">Error loading users</div>';
          }
        });

        // Remove selected user
        selectedMember.addEventListener('click', (e) => {
          if (e.target.closest('.remove-user')) {
            searchInput.value = '';
            selectedMember.innerHTML = '';
          }
        });
      }
    });
  }

  // Handle form submission
  const form = modal.querySelector('#registration-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const registrationData = {
      eventId: eventId,
      userId: auth.currentUser.uid,
      timestamp: new Date(),
      status: 'registered',
      notes: document.getElementById('registration-notes').value
    };

    if (isHackathon) {
      const teamSize = parseInt(document.getElementById('team-size').value);
      registrationData.teamSize = teamSize;
      
      // Collect team member emails
      registrationData.teamMembers = [];
      for (let i = 1; i <= teamSize; i++) {
        const memberEmail = document.getElementById(`member-${i}`).value;
        registrationData.teamMembers.push(memberEmail);
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
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });
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
    // Check if already registered
    const existingRegistration = await getDocs(query(
      collection(db, 'registrations'),
      where('eventId', '==', eventId),
      where('userId', '==', auth.currentUser.uid)
    ));

    if (!existingRegistration.empty) {
      showCyberPopup('You are already registered for this event', 'error');
      return;
    }

    // Get current user data
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const userData = userDoc.data();

    // Create registration with complete user information
    const registration = {
      eventId,
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || userData?.name || 'Unknown User',
      userEmail: auth.currentUser.email,
      userPhoto: auth.currentUser.photoURL || userData?.photoURL,
      status: 'registered',
      registeredAt: serverTimestamp(),
      ...registrationData
    };

    // Add registration
    const registrationRef = await addDoc(collection(db, 'registrations'), registration);
    
    // Update event participants count
    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);
    const currentParticipants = eventDoc.data().participants || [];
    
    await updateDoc(eventRef, {
      participants: [...currentParticipants, auth.currentUser.uid]
    });
    
    showCyberPopup('Registration successful!', 'success');
    fetchEvents();
  } catch (error) {
    console.error('Error registering for event:', error);
    showCyberPopup('Error registering for event. Please try again.', 'error');
  }
}

// Show participants modal
async function showParticipantsModal(eventId) {
  try {
    const registrationsRef = collection(db, 'registrations');
    const registrationQuery = query(
      collection(db, 'registrations'),
      where('eventId', '==', eventId)
    );
    const registrationsSnapshot = await getDocs(registrationQuery);

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
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
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

        const eventsRef = collection(db, 'events');
        const eventsQuery = query(eventsRef, orderBy('createdAt', 'desc'));
        
        // Set up real-time listener
        onSnapshot(eventsQuery, async (snapshot) => {
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
                if (auth.currentUser) {
                    const registrationsQuery = query(
                        collection(db, 'registrations'),
                        where('eventId', '==', doc.id),
                        where('userId', '==', auth.currentUser.uid)
                    );
                    const registrationSnapshot = await getDocs(registrationsQuery);
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
                    if (auth.currentUser) {
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
    await signOut(auth);
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Error signing out:', error);
  }
});

// Check if user is logged in
onAuthStateChanged(auth, (user) => {
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