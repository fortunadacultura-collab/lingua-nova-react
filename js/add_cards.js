// Add Cards Page JavaScript

// Translation Manager for Add Cards page
const addCardsTranslationManager = {
    currentLanguage: 'pt',
    
    init() {
        this.setupEventListeners();
        this.loadStoredLanguage();
    },
    
    setupEventListeners() {
        document.addEventListener('translationLanguageChanged', (e) => {
            this.changeLanguage(e.detail.language);
        });
        
        document.addEventListener('nativeLanguageChanged', (e) => {
            this.changeLanguage(e.detail.language);
        });
    },
    
    loadStoredLanguage() {
        // Load saved language from native language manager
        const savedLang = window.nativeLanguageManager?.getCurrentNativeLanguage() || 'pt';
        console.log('Add Cards: Carregando idioma salvo:', savedLang);
        this.changeLanguage(savedLang);
    },
    
    changeLanguage(langCode) {
        console.log(`Add Cards: Mudando idioma para ${langCode}`);
        this.currentLanguage = langCode;
        
        // Apenas traduzir a página, não chamar changeNativeLanguage para evitar loop
        this.updateAllTranslations();
    },
    
    updateAllTranslations() {
        this.translatePage();
        // Notificar navbar para atualizar suas traduções
        if (window.updateUITexts) {
            window.updateUITexts(this.currentLanguage);
        }
    },
    
    async translatePage() {
        try {
            const response = await fetch('data/translations.json');
            const translations = await response.json();
            const langTranslations = translations[this.currentLanguage] || translations['pt'];
            
            // Traduzir todos os elementos com data-translate
            document.querySelectorAll('[data-translate]').forEach(element => {
                const key = element.getAttribute('data-translate');
                if (langTranslations[key]) {
                    element.textContent = langTranslations[key];
                }
            });
            
            console.log(`Add Cards: Página traduzida para ${this.currentLanguage}`);
        } catch (error) {
            console.error('Erro ao carregar traduções:', error);
        }
    }
};

// Global variables
let appConfig = {
    initialized: false
};

// Função para aguardar o navbar carregar
function waitForNavbar() {
    return new Promise((resolve) => {
        const checkNavbar = () => {
            const navbarContainer = document.getElementById('navbar-container');
            const userLanguage = document.getElementById('user-language');
            
            if (navbarContainer && navbarContainer.innerHTML.trim() !== '' && userLanguage) {
                console.log('✅ [ADD_CARDS] Navbar detectado no DOM');
                resolve();
            } else {
                console.log('⏳ [ADD_CARDS] Aguardando navbar carregar...');
                setTimeout(checkNavbar, 100);
            }
        };
        checkNavbar();
    });
}

/**
 * Global init function - called from HTML
 */
async function init() {
    if (appConfig.initialized) {
        console.log("Add Cards: App already initialized");
        return;
    }
    
    try {
        console.log('Add Cards: Initializing application...');
        
        // Aguardar o navbar carregar
        await waitForNavbar();
        
        // Inicializar o gerenciador de idioma nativo PRIMEIRO
        if (window.nativeLanguageManager) {
            await window.nativeLanguageManager.init();
            console.log('Add Cards: Sistema de idiomas nativo inicializado');
        } else {
            console.warn('Add Cards: nativeLanguageManager não encontrado');
        }
        
        // Inicializar o gerenciador de traduções
        addCardsTranslationManager.init();
        
        // Traduzir a página após inicialização
        setTimeout(() => {
            addCardsTranslationManager.translatePage();
        }, 500);
        
        // Initialize page components
        initializeAddCards();
        setupEventListeners();
        
        appConfig.initialized = true;
        console.log('Add Cards: Application initialized successfully');
    } catch (error) {
        console.error('Add Cards: Initialization error:', error);
    }
}

/**
 * Initialize the Add Cards page
 */
function initializeAddCards() {
    // Add any initialization logic here
    console.log('Initializing Add Cards functionality...');
    
    // Example: Setup tooltips, animations, etc.
    setupAnimations();
}

/**
 * Setup event listeners for the page
 */
function setupEventListeners() {
    // Add event listeners for buttons and interactions
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', handleButtonClick);
    });
    
    // Add hover effects for cards
    const cards = document.querySelectorAll('.feature-card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', handleCardHover);
        card.addEventListener('mouseleave', handleCardLeave);
    });
}

/**
 * Handle button clicks
 * @param {Event} event - The click event
 */
function handleButtonClick(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    
    console.log('Button clicked:', action);
    
    // Add button click logic based on action
    switch(action) {
        case 'create-deck':
            navigateToCreateDeck();
            break;
        case 'import-cards':
            handleImportCards();
            break;
        case 'browse-templates':
            handleBrowseTemplates();
            break;
        default:
            console.log('Unknown action:', action);
    }
}

/**
 * Handle card hover effects
 * @param {Event} event - The hover event
 */
function handleCardHover(event) {
    const card = event.currentTarget;
    card.style.transform = 'translateY(-8px)';
}

/**
 * Handle card leave effects
 * @param {Event} event - The leave event
 */
function handleCardLeave(event) {
    const card = event.currentTarget;
    card.style.transform = 'translateY(0)';
}

/**
 * Setup page animations
 */
function setupAnimations() {
    // Add entrance animations for cards
    const cards = document.querySelectorAll('.feature-card');
    
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        
        setTimeout(() => {
            card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 200);
    });
}

/**
 * Navigate to create deck page
 */
function navigateToCreateDeck() {
    window.location.href = 'new_deck.html';
}

/**
 * Handle import cards functionality
 */
function handleImportCards() {
    // Placeholder for import functionality
    alert('Funcionalidade de importar cartões em desenvolvimento!');
}

/**
 * Handle browse templates functionality
 */
function handleBrowseTemplates() {
    // Placeholder for browse templates functionality
    alert('Funcionalidade de navegar templates em desenvolvimento!');
}

/**
 * Utility function to show loading state
 * @param {HTMLElement} element - Element to show loading state
 */
function showLoading(element) {
    const originalText = element.textContent;
    element.textContent = 'Carregando...';
    element.disabled = true;
    
    return () => {
        element.textContent = originalText;
        element.disabled = false;
    };
}

/**
 * Utility function to show success message
 * @param {string} message - Success message to show
 */
function showSuccess(message) {
    // Create and show success notification
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Utility function to show error message
 * @param {string} message - Error message to show
 */
function showError(message) {
    // Create and show error notification
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}