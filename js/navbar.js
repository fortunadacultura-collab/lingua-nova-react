// Navbar functionality
// Função para configurar os dropdowns
function setupDropdowns() {
    // Limpar todos os dropdowns e remover listeners antigos
    document.querySelectorAll('.dropdown').forEach(dropdown => {
        dropdown.classList.remove('active');
    });
    
    // Remover todos os event listeners antigos clonando os elementos
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        const clone = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(clone, toggle);
    });
    
    // Adicionar novos event listeners para todos os dropdown toggles
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const dropdown = this.parentElement;
            const isActive = dropdown.classList.contains('active');
            
            // Fechar todos os dropdowns primeiro
            document.querySelectorAll('.dropdown').forEach(d => {
                d.classList.remove('active');
            });
            
            // Se não estava ativo, ativar este dropdown
            if (!isActive) {
                dropdown.classList.add('active');
            }
        });
    });
    
    // Prevenir que o clique nos dropdowns propague para o documento
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    // Remover listener antigo de clique fora
    if (window.dropdownClickOutsideListener) {
        document.removeEventListener('click', window.dropdownClickOutsideListener);
    }
    
    // Fechar dropdowns ao clicar fora
    const clickOutsideListener = function(event) {
        // Verificar se o clique foi fora de qualquer dropdown
        const clickedInsideDropdown = event.target.closest('.dropdown');
        
        // Fechar dropdowns ao clicar fora
        if (!clickedInsideDropdown) {
            document.querySelectorAll('.dropdown').forEach(dropdown => {
                dropdown.classList.remove('active');
            });
        }
    };
    
    document.addEventListener('click', clickOutsideListener);
    window.dropdownClickOutsideListener = clickOutsideListener;
}

function setupMobileMenuToggle() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navLinks = document.getElementById('nav-links');
    
    if (mobileMenuToggle && navLinks) {
        // Remove existing listeners by cloning elements
        const newToggle = mobileMenuToggle.cloneNode(true);
        mobileMenuToggle.parentNode.replaceChild(newToggle, mobileMenuToggle);
        
        newToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            this.classList.toggle('active');
            navLinks.classList.toggle('active');
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
            
            // Fechar os menus de idiomas se estiverem abertos
            closeLanguageSelectors();
            
            // Fechar menu do usuário se estiver aberto
            closeUserMenu();
        });
        
        // Close menu when clicking on links
        document.querySelectorAll('.nav-links a, .dropdown-item').forEach(link => {
            link.addEventListener('click', function() {
                newToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            if (!event.target.closest('.nav-links') && !event.target.closest('.mobile-menu-toggle') && navLinks.classList.contains('active')) {
                newToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Load navbar and footer
    loadNavbar();
    loadFooter();
    
    // Toggle dropdown menus on all devices (mobile and desktop)
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const dropdown = this.parentElement;
            
            // Toggle active state
            const isActive = dropdown.classList.contains('active');
            
            // Fechar todos os dropdowns primeiro
            document.querySelectorAll('.dropdown').forEach(d => {
                if (d.classList.contains('active')) {
                    d.classList.remove('active');
                    // Resetar estilos inline
                    const menu = d.querySelector('.dropdown-menu');
                    if (menu) {
                        menu.style.opacity = '';
                        menu.style.visibility = '';
                        menu.style.transform = '';
                    }
                }
            });
            
            // Se não estava ativo, ativar este dropdown
            if (!isActive) {
                dropdown.classList.add('active');
            }
        });
    });
    
    // Fechar os menus ao clicar fora
    document.addEventListener('click', function(event) {
        // Fechar menus de idioma
        closeLanguageSelectorsOnClickOutside(event);
        
        // Fechar menu do usuário ao clicar fora
        closeUserMenuOnClickOutside(event);
    });
    
    // Prevenir que o clique nos dropdowns propague para o documento
    const dropdownMenus = document.querySelectorAll('.dropdown-menu');
    dropdownMenus.forEach(menu => {
        menu.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
});

// CORREÇÃO: Nova lógica para os seletores de idioma
function setupLanguageSelectors() {
    // Seletor de idioma de aprendizado
    const learningSelector = document.querySelector('#learning-language').closest('.language-selector');
    const learningSelected = document.getElementById('learning-language');
    const learningOptions = document.getElementById('learning-language-options');
    
    if (learningSelected && learningOptions) {
        learningSelected.addEventListener('click', function(e) {
            e.stopPropagation();
            learningSelector.classList.toggle('active');
            
            // Fechar outros seletores
            closeOtherSelectors(learningSelector);
            closeUserMenu();
        });
        
        setupLanguageOptions(learningOptions, 'learning');
    }
    
    // Seletor de idioma nativo
    const userSelector = document.querySelector('#user-language').closest('.language-selector');
    const userSelected = document.getElementById('user-language');
    const userOptions = document.getElementById('user-language-options');
    
    if (userSelected && userOptions) {
        userSelected.addEventListener('click', function(e) {
            e.stopPropagation();
            userSelector.classList.toggle('active');
            
            // Fechar outros seletores
            closeOtherSelectors(userSelector);
            closeUserMenu();
        });
        
        setupLanguageOptions(userOptions, 'native');
    }
}

function setupLanguageOptions(optionsContainer, type) {
    optionsContainer.querySelectorAll('li').forEach(option => {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            const value = this.getAttribute('data-value');
            const flag = this.getAttribute('data-flag');
            
            if (type === 'learning') {
                // Atualizar visualmente
                const selectedElement = document.getElementById('learning-language');
                const flagImg = selectedElement.querySelector('img');
                if (flagImg) {
                    flagImg.src = `assets/images/flags/${flag}.svg`;
                    flagImg.alt = value;
                }
                
                // Marcar como selecionado
                optionsContainer.querySelectorAll('li').forEach(li => {
                    li.classList.remove('selected');
                });
                this.classList.add('selected');
                
                // Fechar menu e redirecionar
                this.closest('.language-selector').classList.remove('active');
                window.location.href = `study-${value}.html`;
            } else if (type === 'native') {
                console.log(`Selecionado idioma nativo: ${value} (bandeira: ${flag})`);
                
                // NOTIFICAR a mudança de idioma de tradução
                notifyNativeLanguageChange(value);
                
                // Fechar menu
                this.closest('.language-selector').classList.remove('active');
            }
        });
    });
}

function closeOtherSelectors(currentSelector) {
    document.querySelectorAll('.language-selector').forEach(selector => {
        if (selector !== currentSelector && selector.classList.contains('active')) {
            selector.classList.remove('active');
        }
    });
}

function closeLanguageSelectorsOnClickOutside(event) {
    if (!event.target.closest('.language-selector')) {
        closeLanguageSelectors();
    }
}

function closeLanguageSelectors() {
    document.querySelectorAll('.language-selector').forEach(selector => {
        selector.classList.remove('active');
    });
}

function closeUserMenuOnClickOutside(event) {
    const userDropdownMenu = document.querySelector('.user-dropdown-menu');
    if (!event.target.closest('.user-menu') && 
        userDropdownMenu && 
        userDropdownMenu.style.visibility === 'visible') {
        closeUserMenu();
    }
}

// Função para destacar o item de menu da página atual
function highlightCurrentPage() {
    // Verificar se a página atual foi definida explicitamente
    let pageName;
    
    if (window.currentPage) {
        // Usar a página definida explicitamente
        pageName = window.currentPage;
        console.log('Usando página definida explicitamente:', pageName);
    } else {
        // Obter o caminho da página atual
        const currentPath = window.location.pathname;
        pageName = currentPath.split('/').pop() || 'index.html';
        console.log('Página atual detectada:', pageName);
    }
    
    // Remover a classe 'active' de todos os links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });
    
    // Adicionar a classe 'active' ao link da página atual
    document.querySelectorAll('.nav-links a').forEach(link => {
        const href = link.getAttribute('href');
        
        if (href === pageName || 
            (pageName === 'index.html' && href === 'index.html') ||
            (pageName === '' && href === 'index.html')) {
            console.log('Link ativo encontrado:', href);
            link.classList.add('active');
        }
    });
}

// Load navbar from external file
function loadNavbar() {
    fetch('navbar.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('navbar-container').innerHTML = data;
            
            // ⚠️ AGUARDAR O NATIVE-LANGUAGE CARREGAR PRIMEIRO
            setTimeout(() => {
                setupLanguageSelectors();
                initTooltips();
                
                // Configurar os dropdowns após o carregamento do navbar
                setupDropdowns();
                
                // Destacar o item de menu da página atual
                highlightCurrentPage();
                
                const userMenu = document.querySelector('.user-menu');
                const userDropdownMenu = document.querySelector('.user-dropdown-menu');
                
                if (userMenu && userDropdownMenu) {
                    userMenu.addEventListener('click', function(e) {
                        e.stopPropagation();
                        closeLanguageSelectors();
                        
                        const isVisible = userDropdownMenu.style.visibility === 'visible';
                        if (isVisible) {
                            closeUserMenu();
                        } else {
                            openUserMenu();
                        }
                    });
                    
                    userDropdownMenu.addEventListener('click', function(e) {
                        e.stopPropagation();
                    });
                }

                // ⚠️ SÓ SINCRONIZAR DEPOIS QUE TUDO ESTIVER CARREGADO
                setTimeout(() => syncWithDetectedLanguage(), 500);
                
                // Inicializar gerenciador de traduções do navbar
                if (typeof navbarTranslationManager !== 'undefined') {
                    navbarTranslationManager.init();
                }
                
                // User avatar is now initialized automatically by UserAvatarManager
                
                // Setup mobile menu toggle after navbar is loaded
                setupMobileMenuToggle();
                
            }, 100);
        })
        .catch(error => {
            console.error('Error loading navbar:', error);
        });
}

// Load footer from external file
function loadFooter() {
    fetch('footer.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('footer-container').innerHTML = data;
        })
        .catch(error => {
            console.error('Error loading footer:', error);
        });
}

// Funções para o menu do usuário
function openUserMenu() {
    const userDropdownMenu = document.querySelector('.user-dropdown-menu');
    if (userDropdownMenu) {
        userDropdownMenu.style.opacity = '1';
        userDropdownMenu.style.visibility = 'visible';
        userDropdownMenu.style.transform = 'translateY(0)';
    }
}

function closeUserMenu() {
    const userDropdownMenu = document.querySelector('.user-dropdown-menu');
    if (userDropdownMenu) {
        userDropdownMenu.style.opacity = '0';
        userDropdownMenu.style.visibility = 'hidden';
        userDropdownMenu.style.transform = 'translateY(10px)';
    }
}

// Função para obter o idioma nativo selecionado
function getSelectedNativeLanguage() {
    const selectedOption = document.querySelector('#user-language-options li.selected');
    return selectedOption ? selectedOption.getAttribute('data-value') : 'pt';
}

// Função para notificar mudança de idioma nativo
function notifyNativeLanguageChange(langCode) {
    document.dispatchEvent(new CustomEvent('nativeLanguageChanged', {
        detail: { language: langCode }
    }));
    
    // Também disparar evento para o app.js
    document.dispatchEvent(new CustomEvent('translationLanguageChanged', {
        detail: { language: langCode }
    }));
}

// Sincronizar com idioma detectado
async function syncWithDetectedLanguage() {
    try {
        // Verificar se já existe um idioma salvo no localStorage
        const savedLanguage = localStorage.getItem('nativeLanguage');
        if (savedLanguage) {
            console.log("Usando idioma salvo do localStorage:", savedLanguage);
            applyLanguageToUI(savedLanguage);
            return;
        }
        
        // Se não houver idioma salvo, aguardar a detecção automática completar
        console.log("Nenhum idioma salvo encontrado, detectando automaticamente...");
        const detectedLanguage = await languageDetector.detectLanguage();
        console.log("Idioma detectado pelo navbar.js:", detectedLanguage);
        
        // Aplicar o idioma detectado à UI
        applyLanguageToUI(detectedLanguage);
        
    } catch (error) {
        console.error("Error syncing with detected language:", error);
        applyLanguageToUI('pt'); // Fallback
    }
}

function applyLanguageToUI(langCode) {
    const userOptions = document.getElementById('user-language-options');
    if (userOptions) {
        const targetOption = userOptions.querySelector(`li[data-value="${langCode}"]`);
        
        if (targetOption) {
            // Remover seleção atual
            userOptions.querySelectorAll('li').forEach(li => {
                li.classList.remove('selected');
            });
            
            // Selecionar idioma detectado
            targetOption.classList.add('selected');
            
            // Atualizar a bandeira exibida
            const selectedLanguage = document.getElementById('user-language');
            const flagImg = selectedLanguage.querySelector('img');
            if (flagImg) {
                const flag = targetOption.getAttribute('data-flag');
                const flagUrl = `assets/images/flags/${flag}.svg`;
                flagImg.src = flagUrl;
                flagImg.alt = langCode.toUpperCase();
                console.log(`Bandeira atualizada no navbar: ${flagUrl} (${langCode})`);
            }
            
            console.log("UI sincronizada com idioma detectado:", langCode);
            
            // Salvar a preferência no localStorage (se ainda não estiver salva)
            if (!localStorage.getItem('nativeLanguage')) {
                localStorage.setItem('nativeLanguage', langCode);
                console.log(`Idioma ${langCode} salvo no localStorage pela primeira vez`);
            }
        } else {
            console.warn(`Opção para o idioma ${langCode} não encontrada no seletor`);
        }
    } else {
        console.warn('Seletor de idioma não encontrado no DOM');
    }
}

// Funções do menu do usuário
function viewProfile() {
    console.log('Abrindo perfil do usuário');
    alert('Abrindo perfil do usuário');
    closeUserMenu();
}

function openSettings() {
    console.log('Abrindo configurações');
    alert('Abrindo configurações');
    closeUserMenu();
}

// Logout function
function logout() {
    console.log('Efetuando logout');
    alert('Logout realizado com sucesso!');
    closeUserMenu();
    // Em uma aplicação real, redirecionar para a página de login:
    // window.location.href = 'login.html';
}

// Inicializar tooltips
function initTooltips() {
    const tooltipElements = document.querySelectorAll('.icon-tooltip');
    
    tooltipElements.forEach(tooltip => {
        tooltip.addEventListener('mouseenter', function() {
            const tooltipText = this.querySelector('.tooltip-text');
            if (tooltipText) {
                tooltipText.style.visibility = 'visible';
                tooltipText.style.opacity = '1';
            }
        });
        
        tooltip.addEventListener('mouseleave', function() {
            const tooltipText = this.querySelector('.tooltip-text');
            if (tooltipText) {
                tooltipText.style.visibility = 'hidden';
                tooltipText.style.opacity = '0';
            }
        });
    });
}
// Melhorar suporte touch para dropdowns em mobile
function addTouchSupport() {
    const dropdowns = document.querySelectorAll('.language-selector, .target-language-wrapper');
    
    dropdowns.forEach(dropdown => {
        const trigger = dropdown.querySelector('.selected-language, .target-language-selector');
        if (trigger) {
            // Adicionar eventos touch para melhor responsividade mobile
            trigger.addEventListener('touchstart', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Fechar outros dropdowns
                dropdowns.forEach(otherDropdown => {
                    if (otherDropdown !== dropdown) {
                        otherDropdown.classList.remove('active');
                    }
                });
                
                // Toggle do dropdown atual
                dropdown.classList.toggle('active');
            }, { passive: false });
        }
    });
    
    // Fechar dropdowns ao tocar fora em mobile
    document.addEventListener('touchstart', function(e) {
        const touchedDropdown = e.target.closest('.language-selector, .target-language-wrapper');
        if (!touchedDropdown) {
            dropdowns.forEach(dropdown => {
                dropdown.classList.remove('active');
            });
        }
    });
}

// Chamar a função após carregar o navbar
if (typeof loadNavbar !== 'undefined') {
    const originalLoadNavbar = loadNavbar;
    loadNavbar = function() {
        originalLoadNavbar.apply(this, arguments);
        setTimeout(addTouchSupport, 200);
    };
}

// ===== MOVIDO DO DIALOGUES.JS =====
// Gerenciador de idioma de tradução para o navbar
const navbarTranslationManager = {
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
        const storedLang = localStorage.getItem('translationLanguage') || 'pt';
        this.changeLanguage(storedLang);
    },
    
    changeLanguage(langCode) {
        this.currentLanguage = langCode;
        localStorage.setItem('translationLanguage', langCode);
        
        // Atualizar traduções do navbar imediatamente
        this.updateNavbarTranslations();
    },
    
    async updateNavbarTranslations() {
        try {
            // Carregar dados de tradução se não estiverem disponíveis
            if (!window.translationsData) {
                const response = await fetch('data/translations.json');
                window.translationsData = await response.json();
            }
            
            const translations = window.translationsData[this.currentLanguage] || window.translationsData['en'] || {};
            
            // Atualizar apenas elementos do navbar
            const navbar = document.querySelector('.navbar');
            if (navbar) {
                navbar.querySelectorAll('[data-translate]').forEach(element => {
                    const key = element.getAttribute('data-translate');
                    if (translations[key]) {
                        element.textContent = translations[key];
                    }
                });
            }
        } catch (error) {
            console.error('Erro ao atualizar traduções do navbar:', error);
        }
    }
};

// Função para atualizar traduções globais (mantida para compatibilidade)
function updateUITexts(langCode) {
    if (typeof navbarTranslationManager !== 'undefined') {
        navbarTranslationManager.changeLanguage(langCode);
    }
}

// Function to initialize user avatar
// Avatar initialization is now handled by UserAvatarManager
// This function is kept for backward compatibility but delegates to the centralized module
function initUserAvatar() {
    if (typeof UserAvatarManager !== 'undefined') {
        UserAvatarManager.reinitialize();
    } else {
        console.warn('UserAvatarManager not loaded. Please include user-avatar.js');
    }
}

// Disponibilizar globalmente para compatibilidade
window.updateUITexts = updateUITexts;
window.navbarTranslationManager = navbarTranslationManager;
