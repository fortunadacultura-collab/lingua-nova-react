// Import Page Translation Manager
const importTranslationManager = {
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
        console.log('Import: Carregando idioma salvo:', savedLang);
        this.changeLanguage(savedLang);
    },
    
    changeLanguage(langCode) {
        console.log(`Import: Mudando idioma para ${langCode}`);
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
            
            // Traduzir placeholders
            document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
                const key = element.getAttribute('data-translate-placeholder');
                if (langTranslations[key]) {
                    element.placeholder = langTranslations[key];
                }
            });
            
            console.log(`Import: Página traduzida para ${this.currentLanguage}`);
        } catch (error) {
            console.error('Erro ao carregar traduções:', error);
        }
    }
};

// Global variables
let appConfig = {
    initialized: false
};

// Sample deck data
const decks = [
    {
        id: 1,
        title: "Vocabulário Básico",
        description: "Palavras essenciais para iniciantes",
        cardCount: 50,
        lastStudied: "2024-01-15",
        progress: 75,
        difficulty: "Iniciante",
        category: "Vocabulário"
    },
    {
        id: 2,
        title: "Gramática Avançada",
        description: "Estruturas gramaticais complexas",
        cardCount: 30,
        lastStudied: "2024-01-14",
        progress: 45,
        difficulty: "Avançado",
        category: "Gramática"
    },
    {
        id: 3,
        title: "Conversação Diária",
        description: "Frases úteis para o dia a dia",
        cardCount: 40,
        lastStudied: "2024-01-13",
        progress: 60,
        difficulty: "Intermediário",
        category: "Conversação"
    },
    {
        id: 4,
        title: "Expressões Idiomáticas",
        description: "Expressões comuns e seus significados",
        cardCount: 25,
        lastStudied: "2024-01-12",
        progress: 30,
        difficulty: "Avançado",
        category: "Expressões"
    },
    {
        id: 5,
        title: "Números e Datas",
        description: "Como usar números e expressar datas",
        cardCount: 20,
        lastStudied: "2024-01-11",
        progress: 85,
        difficulty: "Iniciante",
        category: "Números"
    },
    {
        id: 6,
        title: "Verbos Irregulares",
        description: "Conjugações de verbos irregulares",
        cardCount: 60,
        lastStudied: "2024-01-10",
        progress: 20,
        difficulty: "Intermediário",
        category: "Verbos"
    },
    {
        id: 7,
        title: "Cultura e Tradições",
        description: "Aspectos culturais importantes",
        cardCount: 35,
        lastStudied: "2024-01-09",
        progress: 55,
        difficulty: "Intermediário",
        category: "Cultura"
    },
    {
        id: 8,
        title: "Negócios e Trabalho",
        description: "Vocabulário profissional",
        cardCount: 45,
        lastStudied: "2024-01-08",
        progress: 40,
        difficulty: "Avançado",
        category: "Profissional"
    },
    {
        id: 9,
        title: "Viagens e Turismo",
        description: "Frases úteis para viajantes",
        cardCount: 38,
        lastStudied: "2024-01-07",
        progress: 70,
        difficulty: "Intermediário",
        category: "Viagem"
    },
    {
        id: 10,
        title: "Comida e Restaurantes",
        description: "Vocabulário gastronômico",
        cardCount: 28,
        lastStudied: "2024-01-06",
        progress: 90,
        difficulty: "Iniciante",
        category: "Gastronomia"
    }
];

// Pagination and search variables
let currentPage = 1;
const itemsPerPage = 6;
let filteredDecks = [...decks];
let searchTerm = '';

// Import variables
let selectedFormat = 'csv';
let uploadedFile = null;
let csvData = null;
let fieldMapping = {};

// Initialize the page
function waitForNavbar() {
    return new Promise((resolve) => {
        const checkNavbar = () => {
            const navbarContainer = document.getElementById('navbar-container');
            const userLanguage = document.getElementById('user-language');
            
            if (navbarContainer && navbarContainer.innerHTML.trim() !== '' && userLanguage) {
                console.log('✅ [IMPORT] Navbar detectado no DOM');
                resolve();
            } else {
                console.log('⏳ [IMPORT] Aguardando navbar carregar...');
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
        console.log("Import: App already initialized");
        return;
    }
    
    try {
        console.log('Import: Initializing application...');
        
        // Aguardar o navbar carregar
        await waitForNavbar();
        
        // Inicializar o gerenciador de idioma nativo PRIMEIRO
        if (window.nativeLanguageManager) {
            await window.nativeLanguageManager.init();
            console.log('Import: Sistema de idiomas nativo inicializado');
        } else {
            console.warn('Import: nativeLanguageManager não encontrado');
        }
        
        // Inicializar o gerenciador de traduções
        importTranslationManager.init();
        
        // Traduzir a página após inicialização
        setTimeout(() => {
            importTranslationManager.translatePage();
        }, 500);
        
        // Initialize page components
        initializeImportPage();
        setupEventListeners();
        setupImportEventListeners();
        checkCloudSyncStatus();
        
        appConfig.initialized = true;
        console.log('Import: Application initialized successfully');
    } catch (error) {
        console.error('Import: Initialization error:', error);
    }
}

/**
 * Initialize the Import page
 */
function initializeImportPage() {
    console.log('Initializing Import functionality...');
    renderDecks();
}

// Render decks based on current page and filters
function renderDecks() {
    const grid = document.getElementById('flashcardGrid');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const decksToShow = filteredDecks.slice(startIndex, endIndex);
    
    if (decksToShow.length === 0) {
        grid.innerHTML = '<div class="no-results">Nenhum deck encontrado.</div>';
        return;
    }
    
    grid.innerHTML = decksToShow.map(deck => `
        <div class="flashcard-item" onclick="studyDeck(${deck.id})">
            <div class="flashcard-header">
                <h3 class="flashcard-title">${deck.title}</h3>
                <span class="flashcard-count">${deck.cardCount} cards</span>
            </div>
            <p class="flashcard-description">${deck.description}</p>
            <div class="flashcard-meta">
                <span>Última revisão: ${formatDate(deck.lastStudied)}</span>
                <span>Progresso: ${deck.progress}%</span>
            </div>
            <div class="flashcard-actions">
                <button class="flashcard-btn study-btn" onclick="event.stopPropagation(); studyDeck(${deck.id})">
                    <i class="fas fa-play"></i> Estudar
                </button>
                <button class="flashcard-btn edit-btn" onclick="event.stopPropagation(); editDeck(${deck.id})">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="flashcard-btn share-btn" onclick="event.stopPropagation(); shareDeck(${deck.id})">
                    <i class="fas fa-share"></i> Compartilhar
                </button>
            </div>
        </div>
    `).join('');
    
    updateLoadButtons();
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

// Update load more/less buttons
function updateLoadButtons() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadLessBtn = document.getElementById('loadLessBtn');
    const totalPages = Math.ceil(filteredDecks.length / itemsPerPage);
    
    loadMoreBtn.style.display = currentPage < totalPages ? 'flex' : 'none';
    loadLessBtn.style.display = currentPage > 1 ? 'flex' : 'none';
}

// Load more decks
function loadMoreDecks() {
    const totalPages = Math.ceil(filteredDecks.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderDecks();
    }
}

// Load less decks
function loadLessDecks() {
    if (currentPage > 1) {
        currentPage--;
        renderDecks();
    }
}

// Perform search
function performSearch() {
    const searchInput = document.getElementById('searchInput');
    searchTerm = searchInput.value.toLowerCase().trim();
    
    if (searchTerm === '') {
        filteredDecks = [...decks];
    } else {
        filteredDecks = decks.filter(deck => 
            deck.title.toLowerCase().includes(searchTerm) ||
            deck.description.toLowerCase().includes(searchTerm) ||
            deck.category.toLowerCase().includes(searchTerm)
        );
    }
    
    currentPage = 1;
    renderDecks();
}

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadLessBtn = document.getElementById('loadLessBtn');
    
    searchInput.addEventListener('input', performSearch);
    searchBtn.addEventListener('click', performSearch);
    loadMoreBtn.addEventListener('click', loadMoreDecks);
    loadLessBtn.addEventListener('click', loadLessDecks);
    
    // Enter key for search
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// Setup import event listeners
function setupImportEventListeners() {
    // Format selection
    document.querySelectorAll('.format-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.format-option').forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            selectedFormat = this.dataset.format;
        });
    });
    
    // File upload
    const fileInput = document.getElementById('fileInput');
    const fileUpload = document.querySelector('.file-upload');
    
    fileUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Modal close buttons
    document.querySelectorAll('.modal-close, .btn-outline').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal-overlay').classList.remove('active');
        });
    });
    
    // Import buttons
    document.getElementById('importCSVBtn').addEventListener('click', () => {
        selectedFormat = 'csv';
        document.getElementById('importModal').classList.add('active');
    });
    
    document.getElementById('importAnkiBtn').addEventListener('click', () => {
        selectedFormat = 'anki';
        document.getElementById('importModal').classList.add('active');
    });
    
    document.getElementById('importJSONBtn').addEventListener('click', () => {
        selectedFormat = 'json';
        document.getElementById('importModal').classList.add('active');
    });
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    uploadedFile = file;
    
    // Update UI to show selected file
    const fileUpload = document.querySelector('.file-upload');
    fileUpload.innerHTML = `
        <div class="file-upload-icon">📄</div>
        <div>Arquivo selecionado: ${file.name}</div>
        <div style="font-size: 0.9rem; color: var(--text-light); margin-top: 0.5rem;">
            Tamanho: ${(file.size / 1024).toFixed(1)} KB
        </div>
    `;
    
    // Process file based on format
    if (selectedFormat === 'csv') {
        processCSVFile(file);
    } else if (selectedFormat === 'anki') {
        processAnkiFile(file);
    } else if (selectedFormat === 'json') {
        processJSONFile(file);
    }
}

// Process CSV file
function processCSVFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const csvText = e.target.result;
        csvData = parseCSVData(csvText);
        
        if (csvData && csvData.length > 0) {
            showCSVPreview(csvData);
            setupFieldMapping(csvData[0]);
        } else {
            showToast('Erro ao processar arquivo CSV', 'error');
        }
    };
    reader.readAsText(file);
}

// Parse CSV data
function parseCSVData(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            data.push(row);
        }
    }
    
    return data;
}

// Show CSV preview
function showCSVPreview(data) {
    const previewContainer = document.getElementById('csvPreview');
    if (!data || data.length === 0) {
        previewContainer.innerHTML = '<p>Nenhum dado encontrado no arquivo.</p>';
        return;
    }
    
    const headers = Object.keys(data[0]);
    const previewData = data.slice(0, 5); // Show first 5 rows
    
    let tableHTML = '<table class="preview-table"><thead><tr>';
    headers.forEach(header => {
        tableHTML += `<th>${header}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';
    
    previewData.forEach(row => {
        tableHTML += '<tr>';
        headers.forEach(header => {
            tableHTML += `<td>${row[header] || ''}</td>`;
        });
        tableHTML += '</tr>';
    });
    
    tableHTML += '</tbody></table>';
    
    if (data.length > 5) {
        tableHTML += `<p style="margin-top: 1rem; color: var(--text-light);">Mostrando 5 de ${data.length} registros</p>`;
    }
    
    previewContainer.innerHTML = tableHTML;
}

// Setup field mapping
function setupFieldMapping(sampleRow) {
    const mappingContainer = document.getElementById('fieldMapping');
    const availableFields = Object.keys(sampleRow);
    
    const mappingHTML = `
        <div class="mapping-row">
            <label class="mapping-label">Pergunta:</label>
            <select class="mapping-select" data-field="question">
                <option value="">Selecione um campo</option>
                ${availableFields.map(field => `<option value="${field}">${field}</option>`).join('')}
            </select>
        </div>
        <div class="mapping-row">
            <label class="mapping-label">Resposta:</label>
            <select class="mapping-select" data-field="answer">
                <option value="">Selecione um campo</option>
                ${availableFields.map(field => `<option value="${field}">${field}</option>`).join('')}
            </select>
        </div>
        <div class="mapping-row">
            <label class="mapping-label">Categoria:</label>
            <select class="mapping-select" data-field="category">
                <option value="">Selecione um campo (opcional)</option>
                ${availableFields.map(field => `<option value="${field}">${field}</option>`).join('')}
            </select>
        </div>
    `;
    
    mappingContainer.innerHTML = mappingHTML;
    
    // Auto-detect common field names
    autoDetectFields(availableFields);
    
    // Add event listeners for mapping changes
    document.querySelectorAll('.mapping-select').forEach(select => {
        select.addEventListener('change', function() {
            fieldMapping[this.dataset.field] = this.value;
        });
    });
}

// Auto-detect common field names
function autoDetectFields(availableFields) {
    const commonMappings = {
        question: ['question', 'pergunta', 'front', 'frente', 'term', 'termo'],
        answer: ['answer', 'resposta', 'back', 'verso', 'definition', 'definição'],
        category: ['category', 'categoria', 'deck', 'topic', 'tópico']
    };
    
    Object.keys(commonMappings).forEach(fieldType => {
        const select = document.querySelector(`[data-field="${fieldType}"]`);
        const matchedField = availableFields.find(field => 
            commonMappings[fieldType].some(common => 
                field.toLowerCase().includes(common.toLowerCase())
            )
        );
        
        if (matchedField) {
            select.value = matchedField;
            fieldMapping[fieldType] = matchedField;
        }
    });
}

// Process Anki file
function processAnkiFile(file) {
    // Simplified Anki processing - in reality, you'd need a proper Anki parser
    showToast('Processamento de arquivos Anki em desenvolvimento', 'warning');
}

// Process JSON file
function processJSONFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            showToast('Arquivo JSON carregado com sucesso', 'success');
            // Process JSON data here
        } catch (error) {
            showToast('Erro ao processar arquivo JSON', 'error');
        }
    };
    reader.readAsText(file);
}

// Confirm import
function confirmImport() {
    if (!uploadedFile) {
        showToast('Por favor, selecione um arquivo', 'error');
        return;
    }
    
    if (selectedFormat === 'csv') {
        importCSVData();
    } else if (selectedFormat === 'anki') {
        importAnkiData();
    } else if (selectedFormat === 'json') {
        importJSONData();
    }
}

// Import CSV data
function importCSVData() {
    if (!csvData || !fieldMapping.question || !fieldMapping.answer) {
        showToast('Por favor, mapeie pelo menos os campos de pergunta e resposta', 'error');
        return;
    }
    
    // Simulate import process
    showToast('Importando dados...', 'success');
    
    setTimeout(() => {
        const newDeckId = decks.length + 1;
        const newDeck = {
            id: newDeckId,
            title: `Deck Importado ${newDeckId}`,
            description: `Importado de ${uploadedFile.name}`,
            cardCount: csvData.length,
            lastStudied: new Date().toISOString().split('T')[0],
            progress: 0,
            difficulty: "Iniciante",
            category: fieldMapping.category ? csvData[0][fieldMapping.category] : "Importado"
        };
        
        decks.push(newDeck);
        filteredDecks = [...decks];
        renderDecks();
        
        document.getElementById('importModal').classList.remove('active');
        showToast(`${csvData.length} cards importados com sucesso!`, 'success');
        
        // Reset import state
        uploadedFile = null;
        csvData = null;
        fieldMapping = {};
        document.getElementById('fileInput').value = '';
    }, 2000);
}

// Import Anki data
function importAnkiData() {
    showToast('Importação de Anki em desenvolvimento', 'warning');
}

// Import JSON data
function importJSONData() {
    showToast('Importação de JSON em desenvolvimento', 'warning');
}

// Create new deck
function createNewDeck() {
    document.getElementById('createDeckModal').classList.add('active');
}

// Check cloud sync status
function checkCloudSyncStatus() {
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
        // Simulate sync check
        setTimeout(() => {
            syncStatus.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Sincronizado';
        }, 2000);
    }
}

// Sync with cloud
function syncWithCloud() {
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
        syncStatus.innerHTML = '<i class="fas fa-sync-alt sync-icon"></i> Sincronizando...';
        
        setTimeout(() => {
            syncStatus.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Sincronizado';
            showToast('Dados sincronizados com sucesso!', 'success');
        }, 3000);
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');
    
    // Set icon based on type
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toastIcon.className = icons[type] || icons.info;
    toastMessage.textContent = message;
    
    // Remove existing type classes and add new one
    toast.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info');
    toast.classList.add(`toast-${type}`);
    
    // Show toast
    toast.classList.add('show');
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Study deck function
function studyDeck(deckId) {
    showToast(`Iniciando estudo do deck ${deckId}`, 'info');
    // Redirect to study page or open study modal
}

// Edit deck function
function editDeck(deckId) {
    showToast(`Editando deck ${deckId}`, 'info');
    // Open edit modal or redirect to edit page
}

// Share deck function
function shareDeck(deckId) {
    showToast(`Compartilhando deck ${deckId}`, 'info');
    // Open share modal or copy link
}

// Export deck function
function exportDeck(deckId, format) {
    showToast(`Exportando deck ${deckId} em formato ${format}`, 'info');
    // Implement export functionality
}

// Share online function
function shareOnline(deckId) {
    showToast(`Compartilhando deck ${deckId} online`, 'info');
    // Implement online sharing
}

// Logout function
function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
        showToast('Saindo...', 'info');
        // Implement logout logic
    }
}

// Initialize page when DOM is loaded
// Remove the old DOMContentLoaded listener since it's now handled in HTML