import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, addDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
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
const upcomingEventsBtn = document.getElementById('upcoming-events-btn');

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

// Get capacity status for styling
function getCapacityStatus(current, total) {
  const percentage = (current / total) * 100;
  if (percentage >= 100) return 'full';
  if (percentage >= 80) return 'almost-full';
  if (percentage >= 60) return 'filling-up';
  return 'available';
}

// Create event card HTML
function createEventCard(event, isRegistered = false, registrationData = null) {
  const isHackathon = event.type?.toLowerCase() === 'hackathon';
  const selectedTab = document.querySelector('.tab-btn.active')?.getAttribute('data-type');
  const isHost = auth.currentUser && event.createdBy === auth.currentUser.uid;
  
  // Debug logging
  console.log('Creating event card:', {
    eventTitle: event.title,
    eventType: event.type,
    isHackathon,
    isHost,
    isRegistered,
    currentUser: auth.currentUser?.uid,
    eventCreatedBy: event.createdBy,
    shouldShowParticipants: isHackathon && (isHost || isRegistered)
  });
  
  const card = document.createElement('div');
  card.className = `event-card ${isHackathon ? 'hackathon-card' : ''}`;
  card.setAttribute('data-type', event.type?.toLowerCase());
  
  card.innerHTML = `
    <div class="event-header">
      <h3>${event.title}</h3>
      <span class="event-type ${event.type?.toLowerCase()}">${event.type}</span>
    </div>
    <div class="participants-count ${getCapacityStatus(event.currentParticipants || 0, event.maxParticipants || 200)}">
      <i class="fas fa-users"></i> 
      <span class="count">${event.currentParticipants || 0}/${event.maxParticipants || 200}</span> 
      <span class="label">participants</span>
    </div>
    <div class="event-details">
      <p><i class="fas fa-calendar"></i> ${event.date}</p>
      <p><i class="fas fa-map-marker-alt"></i> ${event.location}</p>
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
      ${!event.registrationClosed && !isRegistered && selectedTab !== 'my-events' && (event.currentParticipants || 0) < (event.maxParticipants || 200) ? `
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
      ${!event.registrationClosed && !isRegistered && (event.currentParticipants || 0) >= (event.maxParticipants || 200) ? `
        <button class="cyber-button closed-btn" disabled>
          <i class="fas fa-users"></i> Event Full
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
            <input type="number" id="team-size" min="1" max="4" value="1" required>
          </div>
          <div id="team-members-container" class="team-members-container">
            <h3>Team Members</h3>
            <div class="form-group">
              <label for="member-1">Team Lead (You)</label>
              <input type="email" id="member-1" value="${auth.currentUser.email || ''}" readonly>
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
          <label for="member-${i}">Team Member ${i} Email</label>
          <div class="input-container">
            <input type="email" id="member-${i}" placeholder="Type email or click Search to browse users" required>
            <button type="button" class="action-btn search-btn" data-member="${i}">
              <i class="fas fa-search"></i> Search Users
            </button>
          </div>
          <div id="search-results-${i}" class="search-results" style="display: none;"></div>
        `;
        additionalMembersContainer.appendChild(memberDiv);

        // Add event listeners
        const emailInput = memberDiv.querySelector(`#member-${i}`);
        const searchBtn = memberDiv.querySelector('.search-btn');
        const searchResults = memberDiv.querySelector(`#search-results-${i}`);

        // Store all users for filtering
        let allUsers = [];

        // Load users on modal open
        const loadUsers = async () => {
          try {
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);
            allUsers = [];
            querySnapshot.forEach(doc => {
              allUsers.push({
                id: doc.id,
                ...doc.data()
              });
            });
            console.log(`Loaded ${allUsers.length} users for search`);
          } catch (error) {
            console.error('Error loading users:', error);
            allUsers = [];
          }
        };

        // Load users immediately
        loadUsers();

        // Real-time search as user types
        emailInput.addEventListener('input', debounce((e) => {
          const searchTerm = e.target.value.trim().toLowerCase();
          
          if (searchTerm.length < 2) {
            searchResults.style.display = 'none';
            return;
          }

          // Filter users based on search term
          const filteredUsers = allUsers.filter(user => 
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm))
          );

          searchResults.innerHTML = '';
          
          if (filteredUsers.length === 0) {
            searchResults.innerHTML = '<div class="no-results">No users found matching your search</div>';
          } else {
            // Limit to top 10 results
            filteredUsers.slice(0, 10).forEach(userData => {
              const userDiv = document.createElement('div');
              userDiv.className = 'user-result';
              userDiv.innerHTML = `
                <div class="user-info">
                  <span class="user-name">${userData.name || 'Unknown'}</span>
                  <span class="user-email">${userData.email}</span>
                </div>
              `;
              userDiv.addEventListener('click', () => {
                emailInput.value = userData.email;
                searchResults.style.display = 'none';
              });
              searchResults.appendChild(userDiv);
            });
            
            if (filteredUsers.length > 10) {
              const moreDiv = document.createElement('div');
              moreDiv.className = 'more-results';
              moreDiv.textContent = `... and ${filteredUsers.length - 10} more results`;
              searchResults.appendChild(moreDiv);
            }
          }
          
          searchResults.style.display = 'block';
        }, 300));

        // Show all users button
        searchBtn.addEventListener('click', async () => {
          if (allUsers.length === 0) {
            await loadUsers();
          }
          
          searchResults.innerHTML = '';
          if (allUsers.length === 0) {
            searchResults.innerHTML = '<div class="no-results">No users found in database</div>';
          } else {
            searchResults.innerHTML = '<div class="search-header">All registered users:</div>';
            allUsers.forEach(userData => {
              const userDiv = document.createElement('div');
              userDiv.className = 'user-result';
              userDiv.innerHTML = `
                <div class="user-info">
                  <span class="user-name">${userData.name || 'Unknown'}</span>
                  <span class="user-email">${userData.email}</span>
                </div>
              `;
              userDiv.addEventListener('click', () => {
                emailInput.value = userData.email;
                searchResults.style.display = 'none';
              });
              searchResults.appendChild(userDiv);
            });
          }
          searchResults.style.display = 'block';
        });

        // Hide search results when clicking outside
        document.addEventListener('click', (e) => {
          if (!memberDiv.contains(e.target)) {
            searchResults.style.display = 'none';
          }
        });

        // Don't hide when focusing on input - let user continue typing
        emailInput.addEventListener('focus', () => {
          // Keep results visible if they exist
          if (searchResults.innerHTML && searchResults.style.display === 'block') {
            return;
          }
        });
      }
    });
  }

  // Handle form submission
  const form = modal.querySelector('#registration-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validate team size and members first
    if (isHackathon) {
      const teamSizeInput = document.getElementById('team-size');
      const teamSize = parseInt(teamSizeInput.value);
      
      if (!teamSize || teamSize < 1 || teamSize > 4) {
        showCyberPopup('Please select a valid team size (1-4 members)', 'error');
        teamSizeInput.focus();
        return;
      }
      
      // Check that all team member fields are filled
      const emptyFields = [];
      for (let i = 1; i <= teamSize; i++) {
        const memberInput = document.getElementById(`member-${i}`);
        if (!memberInput || !memberInput.value.trim()) {
          emptyFields.push(i === 1 ? 'Team Lead (You)' : `Team Member ${i}`);
          if (memberInput) {
            memberInput.style.borderColor = 'red';
            memberInput.addEventListener('input', function() {
              this.style.borderColor = '';
            }, { once: true });
          }
        }
      }
      
      if (emptyFields.length > 0) {
        showCyberPopup(`Please fill in all team member emails. Missing: ${emptyFields.join(', ')}`, 'error');
        return;
      }
    }
    
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
      
      // Always add team lead (member-1)
      const teamLeadEmail = document.getElementById('member-1').value;
      if (teamLeadEmail) {
        registrationData.teamMembers.push(teamLeadEmail);
      }
      
      // Add additional team members only if team size > 1
      for (let i = 2; i <= teamSize; i++) {
        const memberInput = document.getElementById(`member-${i}`);
        if (memberInput && memberInput.value.trim()) {
          registrationData.teamMembers.push(memberInput.value.trim());
        }
      }
      
      // Debug logging
      console.log('Team registration data:', {
        teamSize: teamSize,
        teamMembers: registrationData.teamMembers,
        memberCount: registrationData.teamMembers.length
      });
    }

    try {
      await handleRegistration(eventId, eventData, registrationData);
      modal.remove();
    } catch (error) {
      console.error('Error in registration:', error);
      showCyberPopup('Error during registration. Please try again.', 'error');
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
  popup.className = `cyber-popup cyber-popup-${type}`;
  
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
  const startTime = Date.now();
  
  try {
    // Create a promise that rejects after 5 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Registration timeout')), 5000);
    });

    // Create the registration process promise
    const registrationPromise = (async () => {
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

      // Validate registration data
      if (!registrationData) {
        showCyberPopup('Invalid registration data', 'error');
        return;
      }

      // For hackathons, validate team data
      if (eventData.type?.toLowerCase() === 'hackathon') {
        console.log('Validating hackathon registration:', registrationData);
        
        if (!registrationData.teamSize || registrationData.teamSize < 1 || registrationData.teamSize > 4) {
          console.log('Invalid team size:', registrationData.teamSize);
          showCyberPopup('Invalid team size. Must be between 1 and 4 members.', 'error');
          return;
        }

        if (!registrationData.teamMembers || registrationData.teamMembers.length === 0) {
          console.log('No team members found:', registrationData.teamMembers);
          showCyberPopup('Team members data is incomplete', 'error');
          return;
        }
        
        // For teams > 1, ensure we have the right number of members
        if (registrationData.teamSize > 1 && registrationData.teamMembers.length !== registrationData.teamSize) {
          console.log(`Team size mismatch: expected ${registrationData.teamSize}, got ${registrationData.teamMembers.length}`);
          
          // Check which team member fields are empty
          const emptyFields = [];
          for (let i = 1; i <= registrationData.teamSize; i++) {
            const memberInput = document.getElementById(`member-${i}`);
            if (!memberInput || !memberInput.value.trim()) {
              emptyFields.push(`Team Member ${i}`);
            }
          }
          
          if (emptyFields.length > 0) {
            showCyberPopup(`Please fill in all team member emails. Missing: ${emptyFields.join(', ')}`, 'error');
          } else {
            showCyberPopup(`Please provide ${registrationData.teamSize} team member emails (including yourself)`, 'error');
          }
          return;
        }
        
        // For single person teams, ensure we have at least the team lead
        if (registrationData.teamSize === 1 && registrationData.teamMembers.length !== 1) {
          console.log(`Single team size mismatch: expected 1, got ${registrationData.teamMembers.length}`);
          showCyberPopup('Single person team registration requires your email', 'error');
          return;
        }

        // Check for duplicate team members
        const uniqueMembers = new Set(registrationData.teamMembers);
        if (uniqueMembers.size !== registrationData.teamMembers.length) {
          showCyberPopup('Duplicate team members are not allowed', 'error');
          return;
        }
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

      // Check current capacity from actual registrations
      const registrationsQuery = query(
        collection(db, 'registrations'),
        where('eventId', '==', eventId)
      );
      const registrationsSnapshot = await getDocs(registrationsQuery);
      
      // Count total participants (team leads + team members)
      let currentParticipants = 0;
      registrationsSnapshot.docs.forEach(regDoc => {
        const regData = regDoc.data();
        currentParticipants += 1; // Team lead
        if (regData.teamMembers && regData.teamMembers.length > 0) {
          currentParticipants += regData.teamMembers.length; // Team members
        }
      });
      
      // Calculate how many participants this registration will add
      let participantsToAdd = 1; // Team lead (current user)
      if (registrationData.teamMembers && registrationData.teamMembers.length > 1) {
        participantsToAdd += registrationData.teamMembers.length - 1; // Additional team members (excluding lead)
      }
      
      const eventRef = doc(db, 'events', eventId);
      const eventDoc = await getDoc(eventRef);
      const currentEventData = eventDoc.data();
      const maxParticipants = currentEventData.maxParticipants || 200;
      
      // Check if adding this registration would exceed capacity
      if (currentParticipants + participantsToAdd > maxParticipants) {
        showCyberPopup(`Event capacity exceeded! Only ${maxParticipants - currentParticipants} spots remaining.`, 'error');
        return;
      }
      
      // Add registration
      const registrationRef = await addDoc(collection(db, 'registrations'), registration);
      console.log('Registration successfully added:', registrationRef.id, registration);
      
      // Check if we've reached capacity after this registration
      const newParticipantCount = currentParticipants + participantsToAdd;
      if (newParticipantCount >= maxParticipants) {
        await updateDoc(eventRef, {
          registrationClosed: true
        });
        console.log(`Event ${eventId} has reached capacity (${newParticipantCount}/${maxParticipants}). Closing registration.`);
      }
      
      return 'success';
    })();

    // Race between registration and timeout
    const result = await Promise.race([registrationPromise, timeoutPromise]);
    
    const endTime = Date.now();
    const elapsedTime = (endTime - startTime) / 1000;
    
    if (result === 'success' && elapsedTime <= 5) {
      // Check if this registration filled the event to capacity
      const eventRef = doc(db, 'events', eventId);
      const updatedEventDoc = await getDoc(eventRef);
      const updatedEventData = updatedEventDoc.data();
      
      // Get actual current participant count from registrations
      const registrationsQuery = query(
        collection(db, 'registrations'),
        where('eventId', '==', eventId)
      );
      const registrationsSnapshot = await getDocs(registrationsQuery);
      
      let participantCount = 0;
      registrationsSnapshot.docs.forEach(regDoc => {
        const regData = regDoc.data();
        participantCount += 1; // Team lead
        if (regData.teamMembers && regData.teamMembers.length > 0) {
          participantCount += regData.teamMembers.length; // Team members
        }
      });
      
      const maxParticipants = updatedEventData.maxParticipants || 200;
      
      if (updatedEventData.registrationClosed && participantCount >= maxParticipants) {
        showCyberPopup(`Registration successful! Event is now full (${participantCount}/${maxParticipants}) - Registration automatically closed.`, 'success');
      } else {
        showCyberPopup('Registration successful!', 'success');
      }
      fetchEvents();
    } else {
      showCyberPopup('Registration failed - took too long to complete', 'error');
    }
    
  } catch (error) {
    const endTime = Date.now();
    const elapsedTime = (endTime - startTime) / 1000;
    
    console.error('Error registering for event:', error);
    
    if (elapsedTime <= 5 && error.message !== 'Registration timeout') {
      // Check if this registration filled the event to capacity
      try {
        const eventRef = doc(db, 'events', eventId);
        const updatedEventDoc = await getDoc(eventRef);
        const updatedEventData = updatedEventDoc.data();
        
        // Get actual current participant count from registrations
        const registrationsQuery = query(
          collection(db, 'registrations'),
          where('eventId', '==', eventId)
        );
        const registrationsSnapshot = await getDocs(registrationsQuery);
        
        let participantCount = 0;
        registrationsSnapshot.docs.forEach(regDoc => {
          const regData = regDoc.data();
          participantCount += 1; // Team lead
          if (regData.teamMembers && regData.teamMembers.length > 0) {
            participantCount += regData.teamMembers.length; // Team members
          }
        });
        
        const maxParticipants = updatedEventData.maxParticipants || 200;
        
        if (updatedEventData.registrationClosed && participantCount >= maxParticipants) {
          showCyberPopup(`Registration successful! Event is now full (${participantCount}/${maxParticipants}) - Registration automatically closed.`, 'success');
        } else {
          showCyberPopup('Registration successful!', 'success');
        }
      } catch (fetchError) {
        showCyberPopup('Registration successful!', 'success');
      }
      fetchEvents();
    } else {
      showCyberPopup('Registration failed - Please try again.', 'error');
    }
  }
}

// Test registration system
async function testRegistrationSystem() {
  try {
    console.log('Testing registration system...');
    
    // Check if user is authenticated
    if (!auth.currentUser) {
      console.error('User not authenticated');
      return false;
    }

    // Check if events collection exists and has data
    const eventsSnapshot = await getDocs(collection(db, 'events'));
    console.log(`Found ${eventsSnapshot.size} events`);

    // Check if registrations collection exists
    const registrationsSnapshot = await getDocs(collection(db, 'registrations'));
    console.log(`Found ${registrationsSnapshot.size} registrations`);

    // Check if users collection exists
    const usersSnapshot = await getDocs(collection(db, 'users'));
    console.log(`Found ${usersSnapshot.size} users`);

    // Test user data
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (userDoc.exists()) {
      console.log('User data found:', userDoc.data());
    } else {
      console.log('User data not found, creating...');
      // Create user data if it doesn't exist
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        name: auth.currentUser.displayName || 'Unknown User',
        email: auth.currentUser.email,
        photoURL: auth.currentUser.photoURL,
        createdAt: serverTimestamp()
      });
    }

    console.log('Registration system test completed successfully');
    return true;
  } catch (error) {
    console.error('Registration system test failed:', error);
    return false;
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

// Make function globally accessible for inline onclick handlers
window.closeEventRegistration = closeEventRegistration;

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
        
        // Set up real-time listener for registrations to trigger event updates
        const registrationsRef = collection(db, 'registrations');
        onSnapshot(registrationsRef, () => {
            console.log('Registrations changed, triggering event refresh...');
            // This will trigger the events listener to recalculate participant counts
        });
        
        // Set up real-time listener for events
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

                // Get actual participant count from registrations collection
                const registrationsQuery = query(
                    collection(db, 'registrations'),
                    where('eventId', '==', doc.id)
                );
                const registrationsSnapshot = await getDocs(registrationsQuery);
                
                // Count total participants (team leads + team members)
                let totalParticipants = 0;
                registrationsSnapshot.docs.forEach(regDoc => {
                    const regData = regDoc.data();
                    totalParticipants += 1; // Team lead
                    if (regData.teamMembers && regData.teamMembers.length > 0) {
                        totalParticipants += regData.teamMembers.length; // Team members
                    }
                });
                
                // Update the event data with actual participant count
                eventData.currentParticipants = totalParticipants;
                eventData.maxParticipants = event.maxParticipants || 200;
                
                // Check if event is full (auto-close at capacity)
                if (totalParticipants >= eventData.maxParticipants && !event.registrationClosed) {
                    try {
                        const eventRef = doc(db, 'events', doc.id);
                        await updateDoc(eventRef, {
                            registrationClosed: true
                        });
                        console.log(`Event ${doc.id} automatically closed - capacity reached (${totalParticipants}/${eventData.maxParticipants})`);
                    } catch (error) {
                        console.error('Error auto-closing event:', error);
                    }
                }

                // Check if user is registered for this event
                if (auth.currentUser) {
                    // First check if user is directly registered (team lead)
                    const registrationsQuery = query(
                        collection(db, 'registrations'),
                        where('eventId', '==', doc.id),
                        where('userId', '==', auth.currentUser.uid)
                    );
                    const registrationSnapshot = await getDocs(registrationsQuery);
                    
                    if (!registrationSnapshot.empty) {
                        eventData.isRegistered = true;
                        eventData.registrationData = registrationSnapshot.docs[0].data();
                        console.log('User is registered for event:', doc.id, eventData.registrationData);
                    } else {
                        // Check if user is a team member in any registration
                        const allRegistrationsQuery = query(
                            collection(db, 'registrations'),
                            where('eventId', '==', doc.id)
                        );
                        const allRegistrationsSnapshot = await getDocs(allRegistrationsQuery);
                        
                        let isTeamMember = false;
                        let teamRegistrationData = null;
                        
                        for (const regDoc of allRegistrationsSnapshot.docs) {
                            const regData = regDoc.data();
                            if (regData.teamMembers && regData.teamMembers.includes(auth.currentUser.email)) {
                                isTeamMember = true;
                                teamRegistrationData = regData;
                                break;
                            }
                        }
                        
                        if (isTeamMember) {
                            eventData.isRegistered = true;
                            eventData.registrationData = teamRegistrationData;
                            console.log('User is team member for event:', doc.id, teamRegistrationData);
                        } else {
                            eventData.isRegistered = false;
                            eventData.registrationData = null;
                            console.log('User is NOT registered for event:', doc.id);
                        }
                    }
                } else {
                    eventData.isRegistered = false;
                    eventData.registrationData = null;
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

// Handle upcoming events button - redirect to My Events tab
upcomingEventsBtn.addEventListener('click', () => {
  // Remove active class from all tab buttons
  tabButtons.forEach(btn => btn.classList.remove('active'));
  
  // Find and activate the "My Events" tab
  const myEventsTab = document.querySelector('.tab-btn[data-type="my-events"]');
  if (myEventsTab) {
    myEventsTab.classList.add('active');
    currentFilters.type = 'my-events';
    fetchEvents();
  }
});

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        console.log('User authenticated:', user.email);
        
        // Test registration system
        const systemTest = await testRegistrationSystem();
        if (systemTest) {
            console.log('Registration system is working properly');
        } else {
            console.error('Registration system has issues');
        }
        
        fetchEvents();
    } else {
        window.location.href = 'auth.html';
    }
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Events page loaded');
    // fetchEvents() will be called after authentication check
}); 