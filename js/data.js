// Global variable to store application data
let appData = null;

// Function to load data from JSON file
async function loadAppData() {
    try {
        const response = await fetch('data/data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        appData = await response.json();
        console.log('App data loaded successfully');
        return appData;
    } catch (error) {
        console.error('Error loading app data:', error);
        // Fallback data in case of error
        appData = {
            languages: [
                {
                    code: 'pt',
                    name: 'Português',
                    flag: 'https://flagcdn.com/w20/br.png',
                    targetName: 'Portuguese'
                },
                {
                    code: 'en',
                    name: 'English',
                    flag: 'https://flagcdn.com/w20/us.png',
                    targetName: 'English'
                }
            ],
            translations: {
                pt: {
                    heroTitle: 'Aprenda idiomas naturalmente e divertido',
                    heroSubtitle: 'Domine novos idiomas através de diálogos reais, histórias envolventes e flashcards inteligentes.',
                    btnStartNow: 'Começar Agora',
                    btnLearnMore: 'Saiba Mais'
                },
                en: {
                    heroTitle: 'Learn languages naturally and fun',
                    heroSubtitle: 'Master new languages through real dialogues, engaging stories and smart flashcards.',
                    btnStartNow: 'Start Now',
                    btnLearnMore: 'Learn More'
                }
            },
            features: [],
            dialogues: [],
            stories: [],
            flashcards: []
        };
        return appData;
    }
}

// Load data when script is loaded
loadAppData();