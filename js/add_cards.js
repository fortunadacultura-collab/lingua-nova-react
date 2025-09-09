// Add Cards Page JavaScript

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Add Cards page loaded');
    
    // Initialize page components
    initializeAddCards();
    
    // Setup event listeners
    setupEventListeners();
});

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