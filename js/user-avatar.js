/**
 * Módulo centralizado para gerenciamento do avatar do usuário
 * Elimina duplicação de lógica e garante consistência entre páginas
 */

const UserAvatarManager = {
    userData: null,
    avatarElement: null,
    
    /**
     * Inicializa o gerenciador do avatar
     */
    async init() {
        try {
            // Aguardar o carregamento dos dados do usuário
            await this.loadUserData();
            
            // Encontrar o elemento do avatar
            this.avatarElement = document.querySelector('.user-avatar');
            
            // Inicializar o avatar
            this.updateAvatar();
            
            console.log('UserAvatarManager initialized successfully');
        } catch (error) {
            console.error('Error initializing UserAvatarManager:', error);
            this.setFallbackAvatar();
        }
    },
    
    /**
     * Carrega os dados do usuário
     */
    async loadUserData() {
        // Verificar se userData já está disponível globalmente
        if (typeof userData !== 'undefined' && userData) {
            this.userData = userData;
            return this.userData;
        }
        
        // Se não estiver disponível, carregar do arquivo
        try {
            const response = await fetch('data/user-profiles.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const userProfiles = await response.json();
            this.userData = userProfiles.users[0];
            
            // Disponibilizar globalmente para compatibilidade
            if (typeof window !== 'undefined') {
                window.userData = this.userData;
            }
            
            console.log('User data loaded by UserAvatarManager:', this.userData);
            return this.userData;
        } catch (error) {
            console.error('Error loading user data:', error);
            // Dados de fallback
            this.userData = {
                id: 'user',
                username: 'User',
                email: 'user@example.com',
                nativeLanguage: 'pt',
                targetLanguages: ['en'],
                currentTargetLanguage: 'en'
            };
            return this.userData;
        }
    },
    
    /**
     * Atualiza o avatar com base nos dados do usuário
     */
    updateAvatar() {
        if (!this.avatarElement) {
            console.warn('Avatar element not found');
            return;
        }
        
        if (this.userData && this.userData.username) {
            const avatarLetter = this.userData.username.charAt(0).toUpperCase();
            this.avatarElement.textContent = avatarLetter;
            console.log(`Avatar updated with letter: ${avatarLetter}`);
        } else {
            this.setFallbackAvatar();
        }
    },
    
    /**
     * Define um avatar de fallback
     */
    setFallbackAvatar() {
        if (this.avatarElement) {
            this.avatarElement.textContent = 'U';
            console.log('Fallback avatar set');
        }
    },
    
    /**
     * Atualiza os dados do usuário e o avatar
     */
    async updateUserData(newUserData) {
        this.userData = newUserData;
        
        // Atualizar variável global para compatibilidade
        if (typeof window !== 'undefined') {
            window.userData = this.userData;
        }
        
        this.updateAvatar();
    },
    
    /**
     * Obtém os dados atuais do usuário
     */
    getUserData() {
        return this.userData;
    },
    
    /**
     * Reinicializa o avatar (útil para mudanças dinâmicas)
     */
    async reinitialize() {
        await this.init();
    }
};

// Disponibilizar globalmente
if (typeof window !== 'undefined') {
    window.UserAvatarManager = UserAvatarManager;
}

// Auto-inicialização quando o DOM estiver pronto
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Aguardar um pouco para garantir que outros scripts carregaram
            setTimeout(() => UserAvatarManager.init(), 200);
        });
    } else {
        // DOM já está pronto
        setTimeout(() => UserAvatarManager.init(), 200);
    }
}

// Exportar para uso em módulos (se necessário)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserAvatarManager;
}