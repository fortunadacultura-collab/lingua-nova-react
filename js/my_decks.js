// Sistema de tradução para my_decks.html
let currentTranslationLanguage = null;

// Initialize the application
async function init() {
    console.log('🚀 [MY_DECKS] Inicializando página my_decks...');
    
    try {
        // Aguardar o navbar carregar primeiro
        await waitForNavbar();
        console.log('✅ [MY_DECKS] Navbar carregado');
        
        // Inicializar o gerenciador de idioma nativo DEPOIS do navbar
        if (window.nativeLanguageManager) {
            await window.nativeLanguageManager.init();
            console.log('✅ [MY_DECKS] Native Language Manager inicializado');
        }
        
        // Carregar idioma do sistema nativo
        const currentLang = window.nativeLanguageManager?.getCurrentNativeLanguage() || 'pt';
        console.log('📍 [MY_DECKS] Idioma encontrado:', currentLang);
        
        // Aguardar um pouco para garantir que as traduções estejam carregadas
        setTimeout(() => {
            translatePage(currentLang);
        }, 500);
        
        console.log('✅ [MY_DECKS] Inicialização concluída com sucesso');
    } catch (error) {
        console.error('❌ [MY_DECKS] Erro na inicialização:', error);
    }
}

// Função para aguardar o navbar carregar
function waitForNavbar() {
    return new Promise((resolve) => {
        const checkNavbar = () => {
            const navbarContainer = document.getElementById('navbar-container');
            const userLanguage = document.getElementById('user-language');
            
            if (navbarContainer && navbarContainer.innerHTML.trim() !== '' && userLanguage) {
                console.log('✅ [MY_DECKS] Navbar detectado no DOM');
                resolve();
            } else {
                console.log('⏳ [MY_DECKS] Aguardando navbar carregar...');
                setTimeout(checkNavbar, 100);
            }
        };
        checkNavbar();
    });
}

// Função para traduzir a página
function translatePage(targetLanguage) {
    console.log('🌐 [MY_DECKS] translatePage chamada com idioma:', targetLanguage);
    
    if (!window.nativeLanguageManager || !window.nativeLanguageManager.translations) {
        console.warn('❌ [MY_DECKS] Sistema de traduções não disponível');
        return;
    }
    
    const translations = window.nativeLanguageManager.translations[targetLanguage];
    if (!translations) {
        console.warn(`❌ [MY_DECKS] Traduções não encontradas para: ${targetLanguage}`);
        return;
    }
    
    // Aplicar traduções nos elementos com data-translate
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[key]) {
            element.textContent = translations[key];
        }
    });
    
    // Atualizar idioma atual
    currentTranslationLanguage = targetLanguage;
    console.log('✅ [MY_DECKS] Traduções aplicadas para:', targetLanguage);
}

// Listener para mudanças de idioma
document.addEventListener('translationLanguageChanged', function(event) {
    const newLanguage = event.detail.language;
    console.log('🔄 [MY_DECKS] Evento de mudança de idioma recebido:', newLanguage);
    
    // Evitar loops - só traduzir se for diferente do atual
    if (currentTranslationLanguage !== newLanguage) {
        translatePage(newLanguage);
    } else {
        console.log('⏭️ [MY_DECKS] Idioma já é o atual, ignorando');
    }
});

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 [MY_DECKS] Página carregada');
    
    // Initialize the application first
    init();
    
    // O idioma será carregado pela função init() acima
    console.log('🔍 [MY_DECKS] Carregamento de idioma delegado para init()');
    
    // Aguardar o navbar ser carregado antes de configurar funcionalidades específicas
    setTimeout(() => {
    
    // Funcionalidade dos botões CTA
    const createDeckBtn = document.querySelector('.cta-buttons .btn-solid');
    if (createDeckBtn) {
        createDeckBtn.addEventListener('click', function() {
            window.location.href = 'new_deck.html';
        });
    }
    
    const exploreCommunityBtn = document.querySelector('.cta-buttons .btn-outline');
    if (exploreCommunityBtn) {
        exploreCommunityBtn.addEventListener('click', function() {
            // Implementar navegação para página da comunidade
            console.log('Navegando para comunidade...');
        });
    }
    
    // Funcionalidade dos botões de estudo
    document.querySelectorAll('.btn-study').forEach(button => {
        button.addEventListener('click', function() {
            const deckCard = this.closest('.deck-card');
            const deckTitle = deckCard.querySelector('.deck-title').textContent;
            
            // Implementar navegação para página de estudo
            console.log(`Iniciando estudo do deck: ${deckTitle}`);
            window.location.href = 'study.html';
        });
    });
    
    }, 500); // Fechar setTimeout
});