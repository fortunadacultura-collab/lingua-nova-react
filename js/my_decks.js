document.addEventListener('DOMContentLoaded', function() {
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