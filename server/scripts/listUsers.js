#!/usr/bin/env node

const { query } = require('../config/database');

/**
 * Script para listar todos os usuários cadastrados na aplicação
 */

async function listUsers() {
  try {
    console.log('📋 Listando usuários cadastrados...');
    console.log('');
    
    const result = await query(
      `SELECT 
        id, 
        username, 
        email, 
        first_name, 
        last_name, 
        google_id, 
        facebook_id, 
        github_id, 
        profile_picture: avatar_url, 
        is_verified, 
        created_at 
      FROM users 
      ORDER BY created_at DESC`
    );
    
    // Para SQLite, o resultado vem em result.rows
    const users = result.rows || [];
    
    if (users.length === 0) {
      console.log('❌ Nenhum usuário encontrado.');
      console.log('💡 Faça login pela primeira vez para criar um usuário.');
    } else {
      console.log(`✅ ${users.length} usuário(s) encontrado(s):`);
      console.log('');
      
      users.forEach((user, index) => {
        console.log(`👤 Usuário ${index + 1}:`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Nome: ${user.first_name} ${user.last_name}`);
        console.log(`   Google ID: ${user.google_id || 'N/A'}`);
        console.log(`   Facebook ID: ${user.facebook_id || 'N/A'}`);
        console.log(`   GitHub ID: ${user.github_id || 'N/A'}`);
        console.log(`   Avatar: ${user.avatar_url ? 'Sim' : 'Não'}`);
        console.log(`   Verificado: ${user.is_verified ? 'Sim' : 'Não'}`);
        console.log(`   Criado em: ${user.created_at}`);
        console.log('');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error.message);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  listUsers();
}

module.exports = listUsers;