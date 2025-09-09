// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBqJmJvQ8tZ9X2kL4nP5wR7sT6uV8yW0zA",
    authDomain: "linguanova-12345.firebaseapp.com",
    projectId: "linguanova-12345",
    storageBucket: "linguanova-12345.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456789012345"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let user = null;
let cards = [];
let currentCardIndex = 0;
let studyMode = 'learn';
let isSyncing = false;

// Statistics
let stats = {
    cardsStudied: 0,
    correctAnswers: 0,
    streak: 0,
    lastStudyDate: null
};

// Sample deck data (in a real app, this would come from the database)
const deckData = {
    id: 'sample-deck',
    title: 'Inglês Básico',
    description: 'Vocabulário essencial para iniciantes',
    cards: [
        {
            id: 1,
            front: { text: 'Hello', audio: null, video: null },
            back: { text: 'Olá', audio: null, video: null },
            difficulty: 'easy',
            tags: ['greetings', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 2,
            front: { text: 'Goodbye', audio: null, video: null },
            back: { text: 'Tchau', audio: null, video: null },
            difficulty: 'easy',
            tags: ['greetings', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 3,
            front: { text: 'Thank you', audio: null, video: null },
            back: { text: 'Obrigado', audio: null, video: null },
            difficulty: 'easy',
            tags: ['politeness', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 4,
            front: { text: 'Please', audio: null, video: null },
            back: { text: 'Por favor', audio: null, video: null },
            difficulty: 'easy',
            tags: ['politeness', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 5,
            front: { text: 'Water', audio: null, video: null },
            back: { text: 'Água', audio: null, video: null },
            difficulty: 'easy',
            tags: ['food', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 6,
            front: { text: 'Food', audio: null, video: null },
            back: { text: 'Comida', audio: null, video: null },
            difficulty: 'easy',
            tags: ['food', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 7,
            front: { text: 'House', audio: null, video: null },
            back: { text: 'Casa', audio: null, video: null },
            difficulty: 'medium',
            tags: ['home', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 8,
            front: { text: 'Car', audio: null, video: null },
            back: { text: 'Carro', audio: null, video: null },
            difficulty: 'medium',
            tags: ['transport', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 9,
            front: { text: 'Book', audio: null, video: null },
            back: { text: 'Livro', audio: null, video: null },
            difficulty: 'medium',
            tags: ['education', 'basic'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        },
        {
            id: 10,
            front: { text: 'Computer', audio: null, video: null },
            back: { text: 'Computador', audio: null, video: null },
            difficulty: 'hard',
            tags: ['technology', 'intermediate'],
            studied: false,
            correct: 0,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            dueDate: new Date().toISOString(),
            difficult: false
        }
    ]
};

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initializeFirebaseAuth();
    setupAuthEventListeners();
    setupEventListeners();
    setupNavbarEventListeners();
    // RESET: Inicializar sempre com dados zerados
    resetStudySession();
});

// Initialize Firebase Authentication
function initializeFirebaseAuth() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            // User is signed in
            setUser(user);
            loadUserData();
        } else {
            // User is signed out
            clearUser();
            // RESET: Inicializar sempre com dados zerados
            resetStudySession();
        }
    });
}

// Set user data
function setUser(userData) {
    user = userData;
    // Update sync status
    updateSyncStatus('synced', 'Sincronizado com a nuvem');
}

// Clear user data
function clearUser() {
    user = null;
    // Update sync status
    updateSyncStatus('', 'Dados locais');
}

// Setup authentication event listeners
function setupAuthEventListeners() {
    // Authentication is now handled by the navbar
    // No local auth buttons to setup
    
    // Sync now button (if exists)
    const syncBtn = document.getElementById('sync-now');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            syncData();
        });
    }
}

// Show auth modal
function showAuthModal(tab) {
    document.getElementById('auth-modal').style.display = 'flex';
    
    // Show selected tab
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.remove('active');
    });
    document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');
    
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
    document.getElementById(`${tab}-form`).classList.add('active');
}

// Hide auth modal
function hideAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

// Login user
function loginUser(email, password) {
    updateSyncStatus('syncing', 'Autenticando...');
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            hideAuthModal();
            updateSyncStatus('synced', 'Sincronizado com a nuvem');
        })
        .catch((error) => {
            console.error('Login error:', error);
            updateSyncStatus('error', 'Erro de autenticação');
            alert('Erro ao fazer login: ' + error.message);
        });
}

// Sign up user
function signUpUser(name, email, password) {
    updateSyncStatus('syncing', 'Criando conta...');
    
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Update user profile with name
            return userCredential.user.updateProfile({
                displayName: name
            });
        })
        .then(() => {
            hideAuthModal();
            updateSyncStatus('synced', 'Sincronizado com a nuvem');
            
            // Create user document in Firestore
            return db.collection('users').doc(auth.currentUser.uid).set({
                name: name,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                stats: {
                    streak: 0,
                    totalCardsStudied: 0,
                    totalCorrectAnswers: 0
                }
            });
        })
        .catch((error) => {
            console.error('Sign up error:', error);
            updateSyncStatus('error', 'Erro ao criar conta');
            alert('Erro ao criar conta: ' + error.message);
        });
}

// Logout user
function logoutUser() {
    updateSyncStatus('syncing', 'Saindo...');
    
    auth.signOut()
        .then(() => {
            updateSyncStatus('', 'Dados locais');
        })
        .catch((error) => {
            console.error('Logout error:', error);
            updateSyncStatus('error', 'Erro ao sair');
        });
}

// Load user data from Firestore
function loadUserData() {
    if (!user) return;
    
    updateSyncStatus('syncing', 'Sincronizando dados...');
    
    // Load user stats
    db.collection('users').doc(user.uid).get()
        .then((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                if (userData.stats) {
                    stats = { ...stats, ...userData.stats };
                    updateStats();
                }
            }
            
            // Load deck data
            return db.collection('decks').doc(user.uid).get();
        })
        .then((doc) => {
            if (doc.exists) {
                const deckData = doc.data();
                cards = deckData.cards || [];
            } else {
                // No deck data found, initialize with sample data
                initializeWithSampleData();
            }
            
            initializeStudySession();
            updateSyncStatus('synced', 'Sincronizado com a nuvem');
        })
        .catch((error) => {
            console.error('Error loading user data:', error);
            updateSyncStatus('error', 'Erro ao carregar dados');
            
            // Fallback to local data
            initializeWithSampleData();
            initializeStudySession();
        });
}

// Sync data to Firestore
function syncData() {
    if (!user) return;
    
    updateSyncStatus('syncing', 'Sincronizando...');
    isSyncing = true;
    
    // Update user stats
    db.collection('users').doc(user.uid).update({
        'stats.streak': stats.streak,
        'stats.totalCardsStudied': stats.cardsStudied,
        'stats.totalCorrectAnswers': stats.correctAnswers,
        'stats.lastStudyDate': stats.lastStudyDate
    })
    .then(() => {
        // Save deck data
        return db.collection('decks').doc(user.uid).set({
            cards: cards,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    })
    .then(() => {
        updateSyncStatus('synced', 'Sincronizado com a nuvem');
        isSyncing = false;
    })
    .catch((error) => {
        console.error('Error syncing data:', error);
        updateSyncStatus('error', 'Erro de sincronização');
        isSyncing = false;
    });
}

// Initialize with sample data
function initializeWithSampleData() {
    cards = [...deckData.cards];
    saveCards();
}

// Update sync status UI
function updateSyncStatus(status, message) {
    const syncStatus = document.getElementById('sync-status');
    syncStatus.className = 'sync-status ' + status;
    syncStatus.querySelector('span').textContent = message;
    
    // Update icon
    let iconClass = 'fa-check-circle';
    if (status === 'syncing') iconClass = 'fa-sync fa-spin';
    if (status === 'error') iconClass = 'fa-exclamation-circle';
    
    syncStatus.querySelector('i').className = 'fas ' + iconClass;
}

// Initialize study session
function initializeStudySession() {
    // Get deck ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get('deck');
    
    // In a real app, you would fetch the deck data based on the ID
    document.getElementById('deck-title').textContent = deckData.title;
    document.getElementById('deck-description').textContent = deckData.description;
    
    // Load cards from localStorage or use default
    const savedCards = localStorage.getItem(`deck-${deckId}-cards`);
    if (savedCards) {
        cards = JSON.parse(savedCards);
    } else {
        cards = [...deckData.cards];
        saveCards();
    }
    
    // Filter cards based on study mode
    filterCardsByStudyMode();
    
    updateCardDisplay();
    updateProgressBar();
    loadStats();
    updateStats();
}

// Filter cards based on study mode
function filterCardsByStudyMode() {
    const now = new Date();
    
    switch(studyMode) {
        case 'learn':
            // Show cards that haven't been studied or are due for review
            cards = cards.filter(card => 
                !card.studied || new Date(card.dueDate) <= now
            );
            break;
        case 'review':
            // Show only cards that are due for review
            cards = cards.filter(card => 
                card.studied && new Date(card.dueDate) <= now
            );
            break;
        case 'cram':
            // Show all cards regardless of due date
            // No filtering needed
            break;
    }
    
    // If no cards, show message
    if (cards.length === 0) {
        document.getElementById('flashcard').style.display = 'none';
        document.getElementById('navigation-controls').style.display = 'none';
        document.getElementById('rating-container').style.display = 'none';
        
        const flashcardContainer = document.querySelector('.flashcard-container');
        flashcardContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <i class="fas fa-check-circle" style="font-size: 3rem; color: var(--success); margin-bottom: 1rem;"></i>
                <h3>Não há cartas para estudar neste modo!</h3>
                <p>Volte mais tarde ou altere o modo de estudo.</p>
            </div>
        `;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Flashcard flip
    document.getElementById('flashcard').addEventListener('click', function() {
        this.classList.toggle('flipped');
        
        // Show rating buttons when card is flipped to back
        if (this.classList.contains('flipped')) {
            document.getElementById('rating-container').style.display = 'flex';
            document.getElementById('navigation-controls').style.display = 'none';
        } else {
            document.getElementById('rating-container').style.display = 'none';
            document.getElementById('navigation-controls').style.display = 'flex';
        }
    });

    // Navigation buttons
    document.getElementById('prev-btn').addEventListener('click', goToPreviousCard);
    document.getElementById('next-btn').addEventListener('click', goToNextCard);

    // Study controls
    document.getElementById('shuffle-btn').addEventListener('click', shuffleCards);
    document.getElementById('mark-difficult-btn').addEventListener('click', markAsDifficult);
    document.getElementById('reset-btn').addEventListener('click', resetStudySession);
    
    // Rating buttons
    document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            processCardRating(rating);
        });
    });
    
    // Study mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Update active button
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Change study mode
            studyMode = this.getAttribute('data-mode');
            
            // Reinitialize study session
            initializeStudySession();
        });
    });
    
    // Toggle stats
    const toggleStatsBtn = document.getElementById('toggle-stats');
    if (toggleStatsBtn) {
        toggleStatsBtn.addEventListener('click', function() {
            const statsGrid = document.querySelector('.stats-grid');
            const icon = this.querySelector('i');
            
            if (statsGrid.style.display === 'none') {
                statsGrid.style.display = 'grid';
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            } else {
                statsGrid.style.display = 'none';
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        });
    }
}

// Setup navbar event listeners
function setupNavbarEventListeners() {
    // Language selector functionality
    const languageSelector = document.querySelector('.language-selector');
    const targetLanguageWrapper = document.querySelector('.target-language-wrapper');
    const userMenu = document.querySelector('.user-menu');
    
    if (languageSelector) {
        languageSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            languageSelector.classList.toggle('active');
            if (targetLanguageWrapper) targetLanguageWrapper.classList.remove('active');
            if (userMenu) userMenu.classList.remove('active');
        });
    }
    
    if (targetLanguageWrapper) {
        targetLanguageWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            targetLanguageWrapper.classList.toggle('active');
            if (languageSelector) languageSelector.classList.remove('active');
            if (userMenu) userMenu.classList.remove('active');
        });
    }
    
    if (userMenu) {
        userMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('active');
            if (languageSelector) languageSelector.classList.remove('active');
            if (targetLanguageWrapper) targetLanguageWrapper.classList.remove('active');
        });
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        if (languageSelector) languageSelector.classList.remove('active');
        if (targetLanguageWrapper) targetLanguageWrapper.classList.remove('active');
        if (userMenu) userMenu.classList.remove('active');
    });
    
    // Dropdown menu functionality
    document.querySelectorAll('.dropdown').forEach(dropdown => {
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
}

// Update card display
function updateCardDisplay() {
    if (cards.length === 0) return;
    
    const card = cards[currentCardIndex];
    const flashcard = document.getElementById('flashcard');
    
    // Reset flip state
    flashcard.classList.remove('flipped');
    
    // Hide rating buttons and show navigation
    document.getElementById('rating-container').style.display = 'none';
    document.getElementById('navigation-controls').style.display = 'flex';
    
    // Update front side
    document.getElementById('card-front-text').textContent = card.front.text;
    updateMediaElement('card-front-media', card.front.audio, card.front.video);
    
    // Update back side
    document.getElementById('card-back-text').textContent = card.back.text;
    updateMediaElement('card-back-media', card.back.audio, card.back.video);
    
    // Update counter
    document.getElementById('card-counter').textContent = `${currentCardIndex + 1}/${cards.length}`;
    
    // Update navigation buttons
    document.getElementById('prev-btn').disabled = currentCardIndex === 0;
    document.getElementById('next-btn').disabled = currentCardIndex === cards.length - 1;
    
    // Update difficult button state
    const difficultBtn = document.getElementById('mark-difficult-btn');
    if (difficultBtn) {
        if (card.difficult) {
            difficultBtn.innerHTML = '<i class="fas fa-star" style="color: gold;"></i><span>Marcado como Difícil</span>';
        } else {
            difficultBtn.innerHTML = '<i class="fas fa-star"></i><span>Marcar como Difícil</span>';
        }
    }
}

// Update media element (audio or video)
function updateMediaElement(containerId, audioUrl, videoUrl) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (audioUrl) {
        const audio = document.createElement('audio');
        audio.className = 'card-audio';
        audio.controls = true;
        audio.src = audioUrl;
        container.appendChild(audio);
    } else if (videoUrl) {
        const video = document.createElement('video');
        video.className = 'card-video';
        video.controls = true;
        video.src = videoUrl;
        container.appendChild(video);
    }
}

// Update progress bar
function updateProgressBar() {
    const studiedCount = cards.filter(card => card.studied).length;
    const progress = (studiedCount / cards.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
}

// Process card rating using SM-2 algorithm
function processCardRating(rating) {
    const card = cards[currentCardIndex];
    
    // Update card statistics
    card.reviews += 1;
    if (rating >= 2) { // Good or Easy
        card.correct += 1;
    }
    
    // SM-2 algorithm implementation
    if (rating >= 3) { // Easy response
        card.interval = card.interval === 0 ? 4 : Math.round(card.interval * card.ease * 1.3);
        card.ease = Math.min(card.ease + 0.15, 2.5);
    } else if (rating === 2) { // Good response
        if (card.interval === 0) {
            card.interval = 1;
        } else if (card.interval === 1) {
            card.interval = 3;
        } else {
            card.interval = Math.round(card.interval * card.ease);
        }
    } else if (rating === 1) { // Hard response
        card.interval = Math.max(1, Math.round(card.interval * 0.8));
        card.ease = Math.max(1.3, card.ease - 0.15);
    } else { // Again response (rating = 0)
        card.interval = 0;
        card.ease = Math.max(1.3, card.ease - 0.2);
    }
    
    // Calculate next due date
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + card.interval);
    card.dueDate = nextDate.toISOString();
    card.studied = true;
    
    // Update stats
    stats.cardsStudied += 1;
    if (rating >= 2) stats.correctAnswers += 1;
    
    // Update streak
    const today = new Date().toDateString();
    if (stats.lastStudyDate !== today) {
        if (stats.lastStudyDate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (stats.lastStudyDate === yesterday.toDateString()) {
                stats.streak += 1;
            } else {
                stats.streak = 1;
            }
        } else {
            stats.streak = 1;
        }
        stats.lastStudyDate = today;
    }
    
    // Save data
    saveCards();
    saveStats();
    updateStats();
    
    // Auto-sync if user is logged in
    if (user && !isSyncing) {
        syncData();
    }
    
    // Move to next card or finish session
    if (currentCardIndex < cards.length - 1) {
        currentCardIndex++;
        updateCardDisplay();
        updateProgressBar();
    } else {
        // Session completed
        document.getElementById('flashcard').style.display = 'none';
        document.getElementById('navigation-controls').style.display = 'none';
        document.getElementById('rating-container').style.display = 'none';
        
        const flashcardContainer = document.querySelector('.flashcard-container');
        flashcardContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <i class="fas fa-trophy" style="font-size: 3rem; color: var(--warning); margin-bottom: 1rem;"></i>
                <h3>Sessão concluída!</h3>
                <p>Você estudou todas as cartas disponíveis.</p>
                <button class="nav-btn" id="restart-session" style="margin-top: 1rem;">
                    <i class="fas fa-redo"></i>
                    <span>Reiniciar Sessão</span>
                </button>
            </div>
        `;
        
        document.getElementById('restart-session').addEventListener('click', function() {
            initializeStudySession();
            document.getElementById('flashcard').style.display = 'block';
            document.getElementById('navigation-controls').style.display = 'flex';
        });
    }
}

// Update statistics display
function updateStats() {
    const totalCards = cards.length;
    const studiedCards = cards.filter(card => card.studied).length;
    const dueCards = cards.filter(card => {
        return card.studied && new Date(card.dueDate) <= new Date();
    }).length;
    
    const masteryRate = stats.cardsStudied > 0 
        ? Math.round((stats.correctAnswers / stats.cardsStudied) * 100) 
        : 0;
    
    const statCardsStudied = document.getElementById('stat-cards-studied');
    const statMastery = document.getElementById('stat-mastery');
    const statDue = document.getElementById('stat-due');
    const statStreak = document.getElementById('stat-streak');
    
    if (statCardsStudied) statCardsStudied.textContent = studiedCards;
    if (statMastery) statMastery.textContent = `${masteryRate}%`;
    if (statDue) statDue.textContent = dueCards;
    if (statStreak) statStreak.textContent = stats.streak;
}

// Load statistics from localStorage
function loadStats() {
    const savedStats = localStorage.getItem('study-stats');
    if (savedStats) {
        stats = JSON.parse(savedStats);
    }
}

// Save statistics to localStorage
function saveStats() {
    localStorage.setItem('study-stats', JSON.stringify(stats));
}

// Save cards to localStorage
function saveCards() {
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get('deck');
    localStorage.setItem(`deck-${deckId}-cards`, JSON.stringify(cards));
}

// Navigation functions
function goToPreviousCard() {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        updateCardDisplay();
    }
}

function goToNextCard() {
    if (currentCardIndex < cards.length - 1) {
        currentCardIndex++;
        updateCardDisplay();
    }
}

// Study control functions
function shuffleCards() {
    // Fisher-Yates shuffle algorithm
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    
    currentCardIndex = 0;
    updateCardDisplay();
}

function markAsDifficult() {
    cards[currentCardIndex].difficult = !cards[currentCardIndex].difficult;
    updateCardDisplay();
    saveCards();
}

// RESET: Função para resetar a sessão de estudo
function resetStudySession() {
    // Reset all cards
    cards = [...deckData.cards]; // Usar os dados originais resetados
    
    // Reset stats
    stats.cardsStudied = 0;
    stats.correctAnswers = 0;
    stats.streak = 0;
    stats.lastStudyDate = null;
    
    currentCardIndex = 0;
    
    // Atualizar a interface
    document.getElementById('deck-title').textContent = deckData.title;
    document.getElementById('deck-description').textContent = deckData.description;
    
    filterCardsByStudyMode();
    updateCardDisplay();
    updateProgressBar();
    updateStats();
    
    // Salvar os dados resetados
    saveCards();
    saveStats();
}