// native-language.js - CORREÇÃO DO LOOP INFINITO
class NativeLanguageManager {
    constructor() {
        this.currentNativeLanguage = 'pt';
        this.translations = {};
        this.isChangingLanguage = false; // ⚠️ FLAG PARA PREVENIR LOOP
        this.init();
    }

    async init() {
        await this.loadTranslations();
        await this.loadUserPreference();
        
        this.setupEventListeners();
    }

    async loadTranslations() {
        try {
            const response = await fetch('data/translations.json');
            if (!response.ok) throw new Error('Failed to load translations');
            this.translations = await response.json();
        } catch (error) {
            console.error('Error loading translations:', error);
            this.translations = {};
        }
    }

    setupEventListeners() {
        // ⚠️ CORREÇÃO: Usar once ou verificar se já está processando
        document.addEventListener('nativeLanguageChanged', (e) => {
            if (!this.isChangingLanguage && e.detail.language !== this.currentNativeLanguage) {
                this.changeNativeLanguage(e.detail.language);
            }
        });
    }

    loadUserPreference() {
        const savedLang = localStorage.getItem('nativeLanguage');
        if (savedLang) {
            this.changeNativeLanguage(savedLang);
        } else {
            // Auto-detect if no preference is saved
            this.autoDetectLanguage();
        }
    }

    // ⚠️ NOVA FUNÇÃO: Aplicar idioma sem causar loop
    async applyLanguage(langCode, isAutoDetection = false) {
        if (this.isChangingLanguage || langCode === this.currentNativeLanguage) {
            return;
        }

        this.isChangingLanguage = true;
        
        console.log(`Aplicando idioma: ${langCode} (detecção automática: ${isAutoDetection})`);
        
        this.currentNativeLanguage = langCode;
        this.updateUITexts(langCode);
        
        // Garantir que o seletor de idioma seja atualizado corretamente
        await this.updateLanguageSelector(langCode);
        
        if (isAutoDetection) {
            // Salva a detecção automática para futuro
            localStorage.setItem('nativeLanguage', langCode);
            console.log(`Idioma detectado automaticamente salvo: ${langCode}`);
        }
        
        this.notifyLanguageChange(langCode, false); // ⚠️ Não redisparar evento
        
        this.isChangingLanguage = false;
    }

    notifyLanguageChange(langCode, shouldDispatch = true) {
        if (shouldDispatch) {
            document.dispatchEvent(new CustomEvent('translationLanguageChanged', {
                detail: { language: langCode }
            }));
        }
    }

    async changeNativeLanguage(langCode) {
        if (this.isChangingLanguage || !this.translations[langCode]) {
            return;
        }

        this.isChangingLanguage = true;
        
        console.log(`Mudando idioma nativo para: ${langCode}`);
        
        this.currentNativeLanguage = langCode;
        this.updateUITexts(langCode);
        await this.updateLanguageSelector(langCode);
        this.saveNativeLanguagePreference(langCode);

        console.log(`Native language changed to: ${langCode}`);
        
        this.notifyLanguageChange(langCode, true);
        
        this.isChangingLanguage = false;
    }

    async updateLanguageSelector(langCode) {
        const userSelectedLanguage = document.getElementById('user-language');
        const userLanguageOptions = document.getElementById('user-language-options');
        
        if (userSelectedLanguage && userLanguageOptions) {
            // Encontrar a opção correspondente ao idioma
            const option = userLanguageOptions.querySelector(`li[data-value="${langCode}"]`);
            
            if (option) {
                const flag = option.getAttribute('data-flag');
                console.log(`Atualizando seletor de idioma para: ${langCode} (bandeira: ${flag})`);
                
                // Atualizar a imagem da bandeira
                const flagImg = userSelectedLanguage.querySelector('img');
                if (flagImg) {
                    // Garantir que a URL da bandeira esteja correta
                    const flagUrl = `assets/images/flags/${flag}.svg`;
                    flagImg.src = flagUrl;
                    flagImg.alt = langCode.toUpperCase();
                    console.log(`Bandeira atualizada: ${flagUrl}`);
                } else {
                    console.warn('Elemento de imagem da bandeira não encontrado');
                }
                
                // Atualizar a seleção nas opções
                userLanguageOptions.querySelectorAll('li').forEach(li => {
                    li.classList.remove('selected');
                });
                option.classList.add('selected');
            } else {
                console.warn(`Opção para o idioma ${langCode} não encontrada no seletor`);
            }
        } else {
            console.warn('Seletor de idioma não encontrado no DOM');
        }
    }

    updateUITexts(langCode) {
        const translations = this.translations[langCode] || {};
        
        document.querySelectorAll('[data-translate]').forEach(element => {
            const key = element.getAttribute('data-translate');
            if (translations[key]) {
                element.textContent = translations[key];
            }
        });

        const pageTitle = document.querySelector('title');
        if (pageTitle && translations['pageTitle']) {
            const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
            if (translations[`pageTitle_${currentPage}`]) {
                pageTitle.textContent = translations[`pageTitle_${currentPage}`];
            } else if (translations['pageTitle']) {
                pageTitle.textContent = translations['pageTitle'];
            }
        }
    }

    saveNativeLanguagePreference(langCode) {
        localStorage.setItem('nativeLanguage', langCode);
        console.log(`Saved native language preference: ${langCode}`);
    }

    getTranslation(key, langCode = this.currentNativeLanguage) {
        const langTranslations = this.translations[langCode] || {};
        return langTranslations[key] || key;
    }

    getCurrentNativeLanguage() {
        return this.currentNativeLanguage;
    }
}

// Initialize native language manager
const nativeLanguageManager = new NativeLanguageManager();
window.nativeLanguageManager = nativeLanguageManager;
window.getTranslation = (key) => nativeLanguageManager.getTranslation(key);