#!/usr/bin/env node

require('dotenv').config();
const { initializeDatabase } = require('../config/database');
const seedSubscriptionPlans = require('./seedSubscriptionPlans');

/**
 * Script para inicializar o banco de dados PostgreSQL
 * Cria as tabelas necessárias e configura a estrutura inicial
 */

async function main() {
  console.log('🚀 Iniciando configuração do banco de dados...');
  console.log('📊 Configurações:');
  console.log(`   - Host: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`   - Porta: ${process.env.DB_PORT || 5432}`);
  console.log(`   - Database: ${process.env.DB_NAME || 'linguanova'}`);
  console.log(`   - Usuário: ${process.env.DB_USER || 'postgres'}`);
  console.log('');

  try {
    await initializeDatabase();
    console.log('');
    
    // Popular planos de assinatura
    await seedSubscriptionPlans();
    console.log('');
    
    console.log('✅ Banco de dados inicializado com sucesso!');
    console.log('🎉 Você pode agora executar o servidor com: npm run server:dev');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Erro ao inicializar banco de dados:');
    console.error(error.message);
    console.error('');
    console.error('💡 Dicas para resolver:');
    console.error('   1. Verifique se o PostgreSQL está rodando');
    console.error('   2. Confirme as credenciais no arquivo .env');
    console.error('   3. Certifique-se que o banco "linguanova" existe');
    console.error('   4. Verifique as permissões do usuário do banco');
    console.error('');
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = main;