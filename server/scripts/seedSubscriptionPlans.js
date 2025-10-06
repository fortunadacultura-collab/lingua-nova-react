#!/usr/bin/env node

require('dotenv').config();
const { query } = require('../config/database');

/**
 * Script para popular o banco com os planos de assinatura padrão
 * Executa apenas se os planos não existirem ainda
 */

const subscriptionPlans = [
  {
    name: 'FREE',
    description: 'Perfeito para começar sua jornada de aprendizado',
    price: 0.00,
    billing_cycle: 'monthly',
    features: JSON.stringify(['3 decks', '50 cards por deck', '20 estudos diários', '5 interações IA'])
  },
  {
    name: 'BASIC',
    description: 'Ideal para estudantes regulares',
    price: 9.99,
    billing_cycle: 'monthly',
    features: JSON.stringify(['10 decks', '200 cards por deck', '100 estudos diários', '50 interações IA', 'Analytics avançado', 'Temas customizados', 'Exportar/Importar'])
  },
  {
    name: 'PREMIUM',
    description: 'Para estudantes sérios e dedicados',
    price: 19.99,
    billing_cycle: 'monthly',
    features: JSON.stringify(['Decks ilimitados', 'Cards ilimitados', 'Estudos ilimitados', '200 interações IA', 'Analytics avançado', 'Modo offline', 'Temas customizados', 'Suporte prioritário', 'Exportar/Importar', 'Colaboração'])
  },
  {
    name: 'PRO',
    description: 'Para educadores e uso comercial',
    price: 39.99,
    billing_cycle: 'monthly',
    features: JSON.stringify(['Tudo ilimitado', 'IA ilimitada', 'Analytics avançado', 'Modo offline', 'Temas customizados', 'Suporte prioritário', 'Exportar/Importar', 'Colaboração', 'Uso comercial'])
  }
];

async function seedSubscriptionPlans() {
  try {
    // Verificar se já existem planos
    const existingPlans = await query('SELECT COUNT(*) as count FROM subscription_plans');
    const count = existingPlans[0]?.count || 0;

    if (count > 0) {
      console.log('ℹ️  Planos de assinatura já existem no banco de dados');
      return false;
    }

    console.log('🔄 Criando planos de assinatura...');

    // Inserir planos
    for (const plan of subscriptionPlans) {
      await query(`
        INSERT INTO subscription_plans (
          name, description, price, billing_cycle, features, is_active
        ) VALUES ($1, $2, $3, $4, $5, true)
      `, [
        plan.name,
        plan.description,
        plan.price,
        plan.billing_cycle,
        plan.features
      ]);
      
      console.log(`✅ Plano ${plan.name} criado`);
    }

    console.log('');
    console.log('🎉 Todos os planos de assinatura foram criados com sucesso!');
    console.log('📋 Planos disponíveis:');
    subscriptionPlans.forEach(plan => {
      const monthlyPrice = plan.price === 0 ? 'Gratuito' : `$${plan.price.toFixed(2)}/mês`;
      console.log(`   - ${plan.name}: ${monthlyPrice}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao criar planos de assinatura:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await seedSubscriptionPlans();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao popular planos:', error.message);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = seedSubscriptionPlans;