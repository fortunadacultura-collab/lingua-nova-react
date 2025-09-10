// Initialize the application
async function init() {
    console.log('Initializing new_deck.js...');
    
    try {
        // Wait for navbar to load first
        await waitForNavbar();
        
        // Initialize native language manager
        if (window.nativeLanguageManager) {
            await window.nativeLanguageManager.init();
            console.log('✅ [NEW_DECK] Native Language Manager inicializado');
        }
        
        // Wait for native language manager to initialize and apply language
        setTimeout(() => {
            const currentLang = window.nativeLanguageManager?.getCurrentNativeLanguage() || 'pt';
            console.log('💾 [NEW_DECK] Idioma atual do sistema:', currentLang);
            translatePage(currentLang);
        }, 500);
        
        console.log('New deck initialization completed');
    } catch (error) {
        console.error('Failed to initialize new deck:', error);
    }
}

// Translate page function
function translatePage(targetLanguage) {
    console.log('🌐 [NEW_DECK] Traduzindo página para:', targetLanguage);
    
    if (!window.nativeLanguageManager || !window.nativeLanguageManager.translations) {
        console.warn('❌ [NEW_DECK] Sistema de tradução não disponível');
        return;
    }
    
    const translations = window.nativeLanguageManager.translations[targetLanguage];
    if (!translations) {
        console.warn('❌ [NEW_DECK] Traduções não encontradas para:', targetLanguage);
        return;
    }
    
    // Apply translations to elements with data-translate attribute
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[key]) {
            element.textContent = translations[key];
        }
    });
    
    // Apply translations to placeholders
    document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
        const key = element.getAttribute('data-translate-placeholder');
        if (translations[key]) {
            element.placeholder = translations[key];
        }
    });
    
    console.log('✅ [NEW_DECK] Página traduzida com sucesso');
}

// Wait for navbar to be loaded
function waitForNavbar() {
    return new Promise((resolve) => {
        const checkNavbar = () => {
            const navbarContainer = document.getElementById('navbar-container');
            const userLanguageElement = document.getElementById('user-language');
            
            if (navbarContainer && navbarContainer.children.length > 0 && userLanguageElement) {
                console.log('Navbar loaded successfully in new_deck');
                resolve();
            } else {
                setTimeout(checkNavbar, 100);
            }
        };
        
        checkNavbar();
        
        // Timeout after 5 seconds
        setTimeout(() => {
            console.warn('Navbar loading timeout in new_deck');
            resolve();
        }, 5000);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application first
    init();
    
    // Idioma de aprendizado (target language)
    const targetLanguageWrapper = document.querySelector('.target-language-wrapper');
    if (targetLanguageWrapper) {
        targetLanguageWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            targetLanguageWrapper.classList.toggle('active');
            document.querySelector('.language-selector')?.classList.remove('active');
        });
    }
    
    // Idioma da interface (UI language)
    const languageSelector = document.querySelector('.language-selector');
    if (languageSelector) {
        languageSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            languageSelector.classList.toggle('active');
            document.querySelector('.target-language-wrapper')?.classList.remove('active');
        });
    }
    
    // Fechar dropdowns ao clicar fora
    document.addEventListener('click', () => {
        document.querySelector('.target-language-wrapper')?.classList.remove('active');
        document.querySelector('.language-selector')?.classList.remove('active');
    });
    
    // Prevenir fechamento ao clicar dentro dos dropdowns
    document.querySelectorAll('.target-language-dropdown, .language-dropdown').forEach(dropdown => {
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
    
    // Simular seleção de idioma
    document.querySelectorAll('.language-option').forEach(option => {
        option.addEventListener('click', function() {
            const isTargetLanguage = this.closest('.target-language-dropdown');
            const flag = this.querySelector('.language-flag').src;
            const text = this.querySelector('span').textContent;
            
            if (isTargetLanguage) {
                const targetSelector = document.querySelector('.target-language-selector');
                targetSelector.querySelector('.language-flag').src = flag;
                targetSelector.querySelector('strong').textContent = text;
            } else {
                const currentLanguage = document.querySelector('.current-language');
                currentLanguage.querySelector('.language-flag').src = flag;
                currentLanguage.querySelector('span').textContent = text.slice(0, 2).toUpperCase();
            }
            
            // Fechar o dropdown
            this.closest('.target-language-wrapper, .language-selector')?.classList.remove('active');
        });
    });

    // Preview flashcard flip
    const previewFlashcard = document.getElementById('preview-flashcard');
    if (previewFlashcard) {
        previewFlashcard.addEventListener('click', function() {
            this.classList.toggle('flipped');
        });
    }
    
    // Card tabs
    const cardTabs = document.querySelectorAll('.card-tab');
    cardTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            cardTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // In a real implementation, this would switch between front/back editing
            updatePreview();
        });
    });
    
    // Update preview when text changes
    const cardText = document.getElementById('card-text');
    if (cardText) {
        cardText.addEventListener('input', updatePreview);
    }
    
    // Media upload buttons
    const uploadButtons = document.querySelectorAll('.upload-btn');
    uploadButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // In a real implementation, this would open a file picker
            alert('Em uma implementação real, isso abriria um seletor de arquivos para upload de mídia.');
        });
    });
    
    // Add card button
    const addCardBtn = document.getElementById('add-card-btn');
    if (addCardBtn) {
        addCardBtn.addEventListener('click', function() {
            addNewCard();
        });
    }
    
    // Add new card button
    const addNewCardBtn = document.getElementById('add-new-card-btn');
    if (addNewCardBtn) {
        addNewCardBtn.addEventListener('click', function() {
            // Clear the editor
            document.getElementById('card-text').value = '';
            document.getElementById('media-preview').innerHTML = '';
            document.getElementById('media-preview').style.display = 'none';
            
            // Switch to front tab
            document.querySelectorAll('.card-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelector('.card-tab[data-tab="front"]').classList.add('active');
            
            // Update preview
            updatePreview();
        });
    }
    
    // Function to update preview
    function updatePreview() {
        const activeTab = document.querySelector('.card-tab.active').getAttribute('data-tab');
        const textValue = document.getElementById('card-text').value;
        
        if (activeTab === 'front') {
            document.getElementById('preview-front-text').textContent = textValue || 'Texto frontal';
        } else {
            document.getElementById('preview-back-text').textContent = textValue || 'Texto traseiro';
        }
    }
    
    // Function to add a new card
    function addNewCard() {
        const frontText = "Texto frontal exemplo"; // In real implementation, get from form
        const backText = "Texto traseiro exemplo"; // In real implementation, get from form
        
        const cardsContainer = document.getElementById('cards-container');
        const newCard = document.createElement('div');
        newCard.className = 'card-item';
        newCard.innerHTML = `
            <div class="card-content-preview">
                <div class="card-front-preview">${frontText}</div>
                <div class="card-back-preview">${backText}</div>
            </div>
            <div class="card-actions">
                <button class="card-action-btn">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="card-action-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        cardsContainer.appendChild(newCard);
        
        // Add event listeners to the new buttons
        newCard.querySelector('.fa-edit').closest('.card-action-btn').addEventListener('click', function() {
            alert('Editar card functionality would be implemented here.');
        });
        
        newCard.querySelector('.fa-trash').closest('.card-action-btn').addEventListener('click', function() {
            newCard.remove();
        });
        
        // Show success message
        alert('Card adicionado com sucesso!');
    }
    
    // Initialize card action buttons
    document.querySelectorAll('.card-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.querySelector('.fa-trash')) {
                this.closest('.card-item').remove();
            } else if (this.querySelector('.fa-edit')) {
                alert('Editar card functionality would be implemented here.');
            }
        });
    });
});