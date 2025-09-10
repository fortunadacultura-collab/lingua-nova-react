// Current language state
let currentLanguage = 'en';
let targetLanguage = 'en';

// Global variable to store user data
let userData = null;

// Function to load user data
async function loadUserData() {
    try {
        const response = await fetch("data/user-profiles.json");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const userProfiles = await response.json();
        // For now, use the first user as the current user
        userData = userProfiles.users[0];
        console.log("User data loaded successfully:", userData);
        return userData;
    } catch (error) {
        console.error("Error loading user data:", error);
        // Fallback user data
        userData = {
            id: "guest",
            username: "Guest",
            email: "guest@example.com",
            nativeLanguage: "pt",
            targetLanguages: ["en"],
            currentTargetLanguage: "en"
        };
        return userData;
    }
}
// Initialize the application
async function init() {
    console.log("Initializing index page...");
        
        // Load user data first
        await loadUserData();
    // Wait for app data to load
    try {
        // Inicializar o gerenciador de idioma nativo PRIMEIRO
        if (window.nativeLanguageManager) {
            await window.nativeLanguageManager.init();
        }
        
        if (!appData) {
            await loadAppData();
        }
        
        // Wait a bit more to ensure data is fully loaded
        let attempts = 0;
        while (!appData && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        // Initialize language selectors only if data is available
        if (appData) {
            initLanguageSelectors();
        }
        
        // Initialize user interface
        setTimeout(() => {
            initUserInterface();
        }, 100);
        
    } catch (error) {
        console.error('Error loading app data:', error);
    }
    
    // Load saved language
    const savedLang = localStorage.getItem('linguaNovaLanguage') || 'en';
    translatePage(savedLang);
    
    const savedTargetLang = localStorage.getItem('linguaNovaTargetLanguage');
    if (savedTargetLang) {
        changeTargetLanguage(savedTargetLang);
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Initial render of dynamic content
    renderDialoguesPreview();
    renderStoriesPreview();
    renderFlashcardsPreview();

// Initialize language selectors
function initLanguageSelectors() {
    const langDropdown = document.querySelector("#learning-language-options");
    
    const targetLangDropdown = document.querySelector(".target-language-dropdown");
    
    if (!langDropdown || !targetLangDropdown || !appData || !appData.languages) {
        console.warn("Language selectors or data not available");
        return;
    }
    
    // Populate language selector
    langDropdown.innerHTML = appData.languages.map(lang => `
        <div class="language-option" data-lang="${lang.code}">
            <img src="${lang.flag}" class="language-flag" alt="${lang.name}">
            <span>${lang.name}</span>
        </div>
    `).join('');
    
    // Populate target language selector (excluding current target language)
    updateTargetLanguageDropdown();
}

// Update target language dropdown
function updateTargetLanguageDropdown() {
    // This function is kept for compatibility but simplified
    // The actual language switching is handled by navbar.js
    if (appData && appData.languages) {
        console.log("Target language dropdown updated for:", targetLanguage);
    }
}
// Update language selector display
function updateLanguageSelector() {
    if (appData && appData.languages) {
        const selectedLang = appData.languages.find(l => l.code === currentLanguage);
        if (selectedLang) {
            console.log('Language updated to:', selectedLang.name);
        }
    }
}

// Update target language selector display
function updateTargetLanguageSelector() {
    if (appData && appData.languages) {
        const selectedLang = appData.languages.find(l => l.code === targetLanguage);
        if (selectedLang) {
            console.log('Target language updated to:', selectedLang.name);
        }
    }
    
    updateTargetLanguageDropdown();
}

// Translate the entire page
function translatePage(langCode) {
    console.log('🌐 translatePage chamada com idioma:', langCode);
    console.log('📊 Estado atual - currentLanguage:', currentLanguage, 'localStorage linguaNovaLanguage:', localStorage.getItem('linguaNovaLanguage'));
    
    document.documentElement.lang = langCode;
    currentLanguage = langCode;
    
    // Sincronizar todos os sistemas de localStorage
    localStorage.setItem('linguaNovaLanguage', langCode);
    localStorage.setItem('nativeLanguage', langCode);
    localStorage.setItem('translationLanguage', langCode);
    
    console.log('💾 LocalStorage atualizado para:', langCode);
    
    const translations = appData.translations[langCode];
    
    if (!translations) {
        console.error('❌ Traduções não encontradas para o idioma:', langCode);
        return;
    }
    
    console.log('📝 Aplicando traduções para elementos com data-translate...');
    let translatedCount = 0;
    
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[key]) {
            element.textContent = translations[key];
            translatedCount++;
        }
    });
    
    console.log(`✅ ${translatedCount} elementos traduzidos para ${langCode}`);
    
    updateTargetLanguageDropdown();
    updateLanguageSelector();
    
    renderDialoguesPreview();
    renderStoriesPreview();
    renderFlashcardsPreview();
}

// Change target language
function changeTargetLanguage(langCode) {
    targetLanguage = langCode;
    localStorage.setItem('linguaNovaTargetLanguage', langCode);
    updateTargetLanguageSelector();
    
    // Atualiza imediatamente o dropdown
    updateTargetLanguageDropdown();
    
    renderDialoguesPreview();
    renderStoriesPreview();
    renderFlashcardsPreview();
}

// Render dialogues preview
function renderDialoguesPreview() {
    const dialoguesPreview = document.getElementById('dialogues-preview');
    if (!appData || !appData.dialogues || !appData.dialogues[0]) return;
    const dialogue = appData.dialogues[0];
    
    if (dialoguesPreview) {
        dialoguesPreview.innerHTML = `
            <h3 class="preview-title">
                <i class="${dialogue.icon}"></i>
                ${dialogue.title}
            </h3>
            ${dialogue.lines.map(line => `
                <div class="dialog-line">
                    <div class="dialog-speaker">${line.speaker}:</div>
                    <div class="dialog-text">
                        ${line.text}
                        <div class="dialog-translation">${
                            currentLanguage === 'en' ? '' : 
                            (line.translation[currentLanguage] || '')
                        }</div>
                    </div>
                </div>
            `).join('')}
        `;
    }
}

// Render stories preview
function renderStoriesPreview() {
    const storiesPreview = document.getElementById('stories-preview');
    if (!appData || !appData.stories || !appData.stories[0]) return;
    const story = appData.stories[0];
    const translations = appData.translations[currentLanguage];
    
    if (storiesPreview) {
        storiesPreview.innerHTML = `
            <h3 class="preview-title">
                <i class="${story.icon}"></i>
                ${story.title}
            </h3>
            <div class="story-content">
                ${story.content}
                ${currentLanguage !== 'en' && story.translation && story.translation[currentLanguage] ? 
                    `<div class="story-translation">${story.translation[currentLanguage]}</div>` : ''}
            </div>
            <a href="#" class="story-read-more">
                ${translations.featureStoriesLink}
                <i class="fas fa-arrow-right"></i>
            </a>
        `;
    }
}

// Render flashcards preview
function renderFlashcardsPreview() {
    const flashcardsPreview = document.getElementById('flashcards-preview');
    if (!appData || !appData.flashcards || !appData.flashcards[0]) return;
    const flashcard = appData.flashcards[0];
    const translations = appData.translations[currentLanguage];
    
    if (flashcardsPreview) {
        flashcardsPreview.innerHTML = `
            <h3 class="preview-title">
                <i class="fas fa-layer-group"></i>
                ${translations.navFlashcards} ${translations.ofTheDay}
            </h3>
            <div class="flashcard-container">
                <div class="flashcard">
                    <div class="flashcard-front">${flashcard.front}</div>
                    <div class="flashcard-back">${
                        flashcard.back[currentLanguage] || flashcard.back.en
                    }</div>
                </div>
            </div>
            <div class="flashcard-controls">
                <div class="flashcard-progress">${translations.navFlashcards} 1 of 10</div>
                <div class="flashcard-actions">
                    <button class="flashcard-btn easy">${translations.btnEasy}</button>
                    <button class="flashcard-btn medium">${translations.btnMedium}</button>
                    <button class="flashcard-btn hard">${translations.btnHard}</button>
                </div>
            </div>
        `;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Language selector toggle
    const languageSelector = document.querySelector('.language-selector');
    const targetLanguageWrapper = document.querySelector('.target-language-wrapper');
    
    if (languageSelector) {
        languageSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            languageSelector.classList.toggle('active');
            targetLanguageWrapper?.classList.remove('active');
        });
    }
    
    if (targetLanguageWrapper) {
        targetLanguageWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            targetLanguageWrapper.classList.toggle('active');
            languageSelector?.classList.remove('active');
        });
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        languageSelector?.classList.remove('active');
        targetLanguageWrapper?.classList.remove('active');
    });
    
    // Language selection
    document.querySelectorAll('.language-option[data-lang]').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const lang = option.getAttribute('data-lang');
            translatePage(lang);
            languageSelector?.classList.remove('active');
        });
    });
    
    // Target language selection
    document.querySelectorAll('.language-option[data-target-lang]').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const lang = option.getAttribute('data-target-lang');
            changeTargetLanguage(lang);
            targetLanguageWrapper?.classList.remove('active');
        });
    });
    
    // Listen for translation language changes
    document.addEventListener('translationLanguageChanged', (e) => {
        const newLanguage = e.detail.language;
        console.log('🔄 Index.js recebeu evento translationLanguageChanged:', newLanguage);
        
        // Verificar se o idioma é diferente do atual para evitar loops
        if (newLanguage !== currentLanguage && appData && appData.translations && appData.translations[newLanguage]) {
            console.log('✅ Aplicando tradução para:', newLanguage);
            translatePage(newLanguage);
        } else {
            console.log('⚠️ Idioma já aplicado ou não suportado:', newLanguage);
        }
    });
    
    // Flashcard flip
    document.addEventListener('click', function(e) {
        const flashcard = e.target.closest('.flashcard');
        if (flashcard) {
            flashcard.classList.toggle('flipped');
        }
    });
    
    // Flashcard buttons - Corrected version
    document.addEventListener('click', function(e) {
        const flashcardBtn = e.target.closest('.flashcard-btn');
        if (flashcardBtn) {
            e.stopPropagation();
            const cardContainer = flashcardBtn.closest('.preview-example');
            if (cardContainer) {
                const progress = cardContainer.querySelector('.flashcard-progress');
                const translations = appData.translations[currentLanguage];
                
                if (progress) {
                    const currentCard = parseInt(progress.textContent.match(/\d+/)[0]);
                    
                    if (currentCard < 10) {
                        progress.textContent = `${translations.navFlashcards} ${currentCard + 1} of 10`;
                        
                        // Reset flashcard to front
                        const flashcard = cardContainer.querySelector('.flashcard');
                        if (flashcard) flashcard.classList.remove('flipped');
                        
                        // Change flashcard content
                        const frontTexts = ["Happiness", "Joy", "Love", "Peace", "Success", 
                                          "Hope", "Courage", "Wisdom", "Harmony", "Gratitude"];
                        const backTexts = {
                            pt: ["Felicidade", "Alegria", "Amor", "Paz", "Sucesso", 
                                "Esperança", "Coragem", "Sabedoria", "Harmonia", "Gratidão"],
                            es: ["Felicidad", "Alegría", "Amor", "Paz", "Éxito", 
                                "Esperanza", "Valentía", "Sabiduría", "Armonía", "Gratitud"],
                            ja: ["幸福", "喜び", "愛", "平和", "成功", 
                                "希望", "勇気", "知恵", "調和", "感謝"],
                            en: ["Happiness", "Joy", "Love", "Peace", "Success", 
                                "Hope", "Courage", "Wisdom", "Harmony", "Gratitude"]
                        };
                        
                        const front = cardContainer.querySelector('.flashcard-front');
                        const back = cardContainer.querySelector('.flashcard-back');
                        if (front && back) {
                            front.textContent = frontTexts[currentCard];
                            back.textContent = backTexts[currentLanguage][currentCard] || backTexts.en[currentCard];
                        }
                    } else {
                        progress.textContent = translations.sessionComplete || "Session complete!";
                        const actions = cardContainer.querySelector('.flashcard-actions');
                        if (actions) actions.style.display = 'none';
                    }
                }
            }
        }
    });
}
}

// Function to initialize user interface
function initUserInterface() {
    if (userData) {
        // User avatar initialization moved to navbar.js
        
        // Set user language preferences
        if (userData.nativeLanguage) {
            currentLanguage = userData.nativeLanguage;
        }
        if (userData.currentTargetLanguage) {
            targetLanguage = userData.currentTargetLanguage;
        }
        
        // Render cards with correct language
        renderDialoguesPreview();
        renderStoriesPreview();
        renderFlashcardsPreview();
        
        console.log("User interface initialized for:", userData.username);
    }
}
