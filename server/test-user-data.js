const User = require('./models/User');

async function testUserData() {
  try {
    console.log('🔍 Verificando dados do usuário fortunadacultura@gmail.com...');
    
    const user = await User.findByEmail('fortunadacultura@gmail.com');
    
    if (user) {
      console.log('✅ Usuário encontrado:');
      console.log('- ID:', user.id);
      console.log('- Nome:', user.firstName, user.lastName);
      console.log('- Email:', user.email);
      console.log('- Profile Picture:', user.avatar_url);
      console.log('- Google ID:', user.google_id);
      console.log('- Created At:', user.created_at);
      
      // Verificar se a URL da imagem é válida
      if (user.avatar_url) {
        console.log('\n🖼️ URL da imagem do perfil:', user.avatar_url);
        
        if (user.avatar_url.startsWith('https://lh3.googleusercontent.com')) {
          console.log('✅ URL do Google válida');
        } else {
          console.log('⚠️ URL não é do Google');
        }
      } else {
        console.log('❌ Nenhuma imagem de perfil encontrada');
      }
    } else {
      console.log('❌ Usuário não encontrado');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar dados do usuário:', error);
  }
}

testUserData();