// native-language.js - CORREÇÃO DO LOOP INFINITO
class NativeLanguageManager {
    constructor() {
        this.currentNativeLanguage = null; // Não definir padrão para evitar flash
        this.translations = {};
        this.isChangingLanguage = false; // ⚠️ FLAG PARA PREVENIR LOOP
        // Não chamar init() no construtor para evitar problemas de timing
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

    async loadUserPreference() {
        const savedLang = localStorage.getItem('nativeLanguage');
        console.log('🔍 loadUserPreference - savedLang:', savedLang);
        
        if (savedLang) {
            console.log('✅ Aplicando idioma salvo:', savedLang);
            // Aplicar idioma salvo diretamente sem causar flash
            await this.applyLanguage(savedLang, false);
        } else {
            console.log('🔄 Nenhum idioma salvo, iniciando detecção automática...');
            // Auto-detect if no preference is saved
            await this.autoDetectLanguage();
        }
    }

    async autoDetectLanguage() {
        try {
            console.log('🌍 [NATIVE-LANG] Iniciando detecção automática de idioma...');
            
            // CORREÇÃO: Sempre usar português como padrão
            console.log('🇧🇷 [NATIVE-LANG] Aplicando português como idioma padrão');
            await this.applyLanguage('pt', true);
            
        } catch (error) {
            console.error('❌ [NATIVE-LANG] Erro na detecção automática de idioma:', error);
            // Fallback para português
            await this.applyLanguage('pt', true);
        }
    }

    // ⚠️ NOVA FUNÇÃO: Aplicar idioma sem causar loop
    async applyLanguage(langCode, isAutoDetection = false) {
        if (this.isChangingLanguage || langCode === this.currentNativeLanguage) {
            console.log('⏭️ [NATIVE-LANG] applyLanguage ignorado - já aplicando ou idioma igual:', langCode);
            return;
        }

        this.isChangingLanguage = true;
        
        console.log('🎯 [NATIVE-LANG] Aplicando idioma:', langCode, '(detecção automática:', isAutoDetection, ')');
        console.log('📍 [NATIVE-LANG] Idioma anterior:', this.currentNativeLanguage);
        
        this.currentNativeLanguage = langCode;
        this.updateUITexts(langCode);
        
        // Aguardar navbar estar carregado e atualizar seletor
        await this.waitForNavbarAndUpdateSelector(langCode);
        
        if (isAutoDetection) {
            // Salva a detecção automática para futuro
            localStorage.setItem('nativeLanguage', langCode);
            console.log(`Idioma detectado automaticamente salvo: ${langCode}`);
        }
        
        this.notifyLanguageChange(langCode, true); // ⚠️ Sempre disparar evento para aplicar traduções
        
        this.isChangingLanguage = false;
    }

    async waitForNavbarAndUpdateSelector(langCode) {
        // Aguardar até que o navbar esteja carregado
        const maxAttempts = 20; // 2 segundos máximo
        let attempts = 0;
        
        const checkNavbar = async () => {
            const userLanguageElement = document.getElementById('user-language');
            if (userLanguageElement) {
                await this.updateLanguageSelector(langCode);
                return true;
            }
            return false;
        };
        
        // Tentar imediatamente
        if (await checkNavbar()) {
            return;
        }
        
        // Se não encontrou, aguardar com polling
        const pollInterval = setInterval(async () => {
            attempts++;
            if (await checkNavbar() || attempts >= maxAttempts) {
                clearInterval(pollInterval);
                if (attempts >= maxAttempts) {
                    console.warn('Timeout aguardando navbar carregar para atualizar bandeira');
                }
            }
        }, 100);
    }

    notifyLanguageChange(langCode, shouldDispatch = true) {
        console.log('🔔 nativeLanguageManager.notifyLanguageChange:', langCode, 'shouldDispatch:', shouldDispatch);
        
        if (shouldDispatch) {
            // Sincronizar localStorage em todas as páginas para manter consistência
            console.log('📄 Sincronizando localStorage para idioma:', langCode);
            localStorage.setItem('linguaNovaLanguage', langCode);
            localStorage.setItem('translationLanguage', langCode)
            
            console.log('🚀 Disparando evento translationLanguageChanged para:', langCode);
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
                    flagImg.style.display = 'inline-block'; // Mostrar a bandeira
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
        console.log('🔄 [NATIVE-LANG] updateUITexts chamado com idioma:', langCode);
        const translations = this.translations[langCode] || {};
        console.log('📚 [NATIVE-LANG] Traduções disponíveis para', langCode, ':', Object.keys(translations).length, 'chaves');
        
        let elementsTranslated = 0;
        document.querySelectorAll('[data-translate]').forEach(element => {
            const key = element.getAttribute('data-translate');
            if (translations[key]) {
                element.textContent = translations[key];
                elementsTranslated++;
            }
        });
        
        console.log('✅ [NATIVE-LANG] Elementos traduzidos:', elementsTranslated);

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

// Função global para sincronizar com idioma detectado (chamada pelo navbar)
window.syncWithDetectedLanguage = async function() {
    try {
        console.log('Sincronizando com idioma detectado...');
        
        // Verificar se já há uma preferência salva
        const savedLang = localStorage.getItem('nativeLanguage');
        if (savedLang) {
            console.log(`Idioma já salvo: ${savedLang}, não fazendo detecção automática`);
            return;
        }
        
        // Só fazer detecção automática se não houver preferência salva
        if (window.languageDetector && nativeLanguageManager) {
            const detectedLang = await window.languageDetector.getPreferredLanguage();
            console.log(`Sincronizando com idioma detectado: ${detectedLang}`);
            
            // Aplicar sem salvar (deixar o usuário decidir)
            await nativeLanguageManager.applyLanguage(detectedLang, false);
        }
    } catch (error) {
        console.error('Erro ao sincronizar com idioma detectado:', error);
    }
};

console.log('🌐 Native Language Manager inicializado com sucesso');