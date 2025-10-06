const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

/**
 * @route GET /api/subscriptions/plans
 * @desc Obter todos os planos de assinatura disponíveis
 * @access Public
 */
router.get('/plans', (req, res) => {
  const query = 'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_monthly ASC';
  
  db.all(query, [], (err, plans) => {
    if (err) {
      console.error('Erro ao buscar planos:', err.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Erro interno do servidor' 
      });
    }
    
    const formattedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      displayName: plan.display_name,
      description: plan.description,
      priceMonthly: plan.price_monthly,
      priceYearly: plan.price_yearly,
      features: {
        maxDecks: plan.max_decks,
        maxCardsPerDeck: plan.max_cards_per_deck,
        maxDailyStudies: plan.max_daily_studies,
        maxAiInteractions: plan.max_ai_interactions,
        hasAdvancedAnalytics: Boolean(plan.has_advanced_analytics),
        hasOfflineMode: Boolean(plan.has_offline_mode),
        hasCustomThemes: Boolean(plan.has_custom_themes),
        hasPrioritySupport: Boolean(plan.has_priority_support),
        hasExportImport: Boolean(plan.has_export_import),
        hasCollaboration: Boolean(plan.has_collaboration)
      }
    }));
    
    res.json({
      success: true,
      plans: formattedPlans
    });
  });
});

/**
 * @route GET /api/subscriptions/my-subscription
 * @desc Obter assinatura atual do usuário
 * @access Private
 */
router.get('/my-subscription', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      us.id, us.status, us.started_at, us.expires_at,
      us.current_decks_count, us.current_cards_count, 
      us.current_daily_studies, us.current_ai_interactions,
      us.usage_reset_date,
      sp.name as plan_name, sp.display_name, sp.description,
      sp.max_decks, sp.max_cards_per_deck, sp.max_daily_studies, sp.max_ai_interactions,
      sp.has_advanced_analytics, sp.has_offline_mode, sp.has_custom_themes,
      sp.has_priority_support, sp.has_export_import, sp.has_collaboration
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = ? AND us.status = 'active'
    ORDER BY us.created_at DESC
    LIMIT 1
  `;
  
  db.get(query, [req.user.id], (err, subscription) => {
    if (err) {
      console.error('Erro ao buscar assinatura:', err.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Erro interno do servidor' 
      });
    }
    
    if (!subscription) {
      const freeQuery = 'SELECT * FROM subscription_plans WHERE name = "FREE"';
      db.get(freeQuery, [], (err, freePlan) => {
        if (err) {
          console.error('Erro ao buscar plano FREE:', err.message);
          return res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
          });
        }
        
        res.json({
          success: true,
          subscription: {
            planName: freePlan.name,
            displayName: freePlan.display_name,
            description: freePlan.description,
            status: 'free',
            features: {
              maxDecks: freePlan.max_decks,
              maxCardsPerDeck: freePlan.max_cards_per_deck,
              maxDailyStudies: freePlan.max_daily_studies,
              maxAiInteractions: freePlan.max_ai_interactions,
              hasAdvancedAnalytics: Boolean(freePlan.has_advanced_analytics),
              hasOfflineMode: Boolean(freePlan.has_offline_mode),
              hasCustomThemes: Boolean(freePlan.has_custom_themes),
              hasPrioritySupport: Boolean(freePlan.has_priority_support),
              hasExportImport: Boolean(freePlan.has_export_import),
              hasCollaboration: Boolean(freePlan.has_collaboration)
            },
            usage: {
              currentDecksCount: 0,
              currentCardsCount: 0,
              currentDailyStudies: 0,
              currentAiInteractions: 0
            }
          }
        });
      });
    } else {
      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          planName: subscription.plan_name,
          displayName: subscription.display_name,
          description: subscription.description,
          status: subscription.status,
          startedAt: subscription.started_at,
          expiresAt: subscription.expires_at,
          features: {
            maxDecks: subscription.max_decks,
            maxCardsPerDeck: subscription.max_cards_per_deck,
            maxDailyStudies: subscription.max_daily_studies,
            maxAiInteractions: subscription.max_ai_interactions,
            hasAdvancedAnalytics: Boolean(subscription.has_advanced_analytics),
            hasOfflineMode: Boolean(subscription.has_offline_mode),
            hasCustomThemes: Boolean(subscription.has_custom_themes),
            hasPrioritySupport: Boolean(subscription.has_priority_support),
            hasExportImport: Boolean(subscription.has_export_import),
            hasCollaboration: Boolean(subscription.has_collaboration)
          },
          usage: {
            currentDecksCount: subscription.current_decks_count,
            currentCardsCount: subscription.current_cards_count,
            currentDailyStudies: subscription.current_daily_studies,
            currentAiInteractions: subscription.current_ai_interactions,
            usageResetDate: subscription.usage_reset_date
          }
        }
      });
    }
  });
});

/**
 * @route POST /api/subscriptions/create
 * @desc Criar nova assinatura para o usuário
 * @access Private
 */
router.post('/create', authenticateToken, (req, res) => {
  const { planId, paymentMethod } = req.body;
  
  if (!planId) {
    return res.status(400).json({
      success: false,
      message: 'ID do plano é obrigatório'
    });
  }
  
  const planQuery = 'SELECT * FROM subscription_plans WHERE id = ?';
  db.get(planQuery, [planId], (err, plan) => {
    if (err) {
      console.error('Erro ao buscar plano:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plano não encontrado'
      });
    }
    
    const activeSubQuery = 'SELECT * FROM user_subscriptions WHERE user_id = ? AND status = "active"';
    db.get(activeSubQuery, [req.user.id], (err, existingSub) => {
      if (err) {
        console.error('Erro ao verificar assinatura existente:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Erro interno do servidor'
        });
      }
      
      if (existingSub) {
        return res.status(400).json({
          success: false,
          message: 'Usuário já possui uma assinatura ativa'
        });
      }
      
      const now = new Date().toISOString();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      
      const insertQuery = `
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, started_at, expires_at,
          current_decks_count, current_cards_count, 
          current_daily_studies, current_ai_interactions,
          usage_reset_date
        ) VALUES (?, ?, 'active', ?, ?, 0, 0, 0, 0, ?)
      `;
      
      db.run(insertQuery, [
        req.user.id, planId, now, expiresAt.toISOString(), now
      ], function(err) {
        if (err) {
          console.error('Erro ao criar assinatura:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Erro ao criar assinatura'
          });
        }
        
        res.status(201).json({
          success: true,
          message: 'Assinatura criada com sucesso',
          subscriptionId: this.lastID
        });
      });
    });
  });
});

/**
 * @route POST /api/subscriptions/cancel
 * @desc Cancelar assinatura do usuário
 * @access Private
 */
router.post('/cancel', authenticateToken, (req, res) => {
  const query = 'UPDATE user_subscriptions SET status = "cancelled" WHERE user_id = ? AND status = "active"';
  
  db.run(query, [req.user.id], function(err) {
    if (err) {
      console.error('Erro ao cancelar assinatura:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhuma assinatura ativa encontrada'
      });
    }
    
    res.json({
      success: true,
      message: 'Assinatura cancelada com sucesso'
    });
  });
});

/**
 * @route GET /api/subscriptions/usage
 * @desc Obter uso atual do usuário
 * @access Private
 */
router.get('/usage', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      us.current_decks_count, us.current_cards_count,
      us.current_daily_studies, us.current_ai_interactions,
      us.usage_reset_date,
      sp.max_decks, sp.max_cards_per_deck, 
      sp.max_daily_studies, sp.max_ai_interactions
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = ? AND us.status = 'active'
  `;
  
  db.get(query, [req.user.id], (err, usage) => {
    if (err) {
      console.error('Erro ao buscar uso:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
    
    if (!usage) {
      const freeQuery = 'SELECT * FROM subscription_plans WHERE name = "FREE"';
      db.get(freeQuery, [], (err, freePlan) => {
        if (err) {
          console.error('Erro ao buscar plano FREE:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
          });
        }
        
        res.json({
          success: true,
          usage: {
            current: {
              decks: 0,
              cards: 0,
              dailyStudies: 0,
              aiInteractions: 0
            },
            limits: {
              maxDecks: freePlan.max_decks,
              maxCardsPerDeck: freePlan.max_cards_per_deck,
              maxDailyStudies: freePlan.max_daily_studies,
              maxAiInteractions: freePlan.max_ai_interactions
            },
            resetDate: new Date().toISOString()
          }
        });
      });
    } else {
      res.json({
        success: true,
        usage: {
          current: {
            decks: usage.current_decks_count,
            cards: usage.current_cards_count,
            dailyStudies: usage.current_daily_studies,
            aiInteractions: usage.current_ai_interactions
          },
          limits: {
            maxDecks: usage.max_decks,
            maxCardsPerDeck: usage.max_cards_per_deck,
            maxDailyStudies: usage.max_daily_studies,
            maxAiInteractions: usage.max_ai_interactions
          },
          resetDate: usage.usage_reset_date
        }
      });
    }
  });
});

/**
 * @route POST /api/subscriptions/check-limit
 * @desc Verificar se usuário pode executar uma ação baseada nos limites
 * @access Private
 */
router.post('/check-limit', authenticateToken, (req, res) => {
  const { action, amount = 1 } = req.body;
  
  if (!action) {
    return res.status(400).json({
      success: false,
      message: 'Ação é obrigatória'
    });
  }
  
  const query = `
    SELECT 
      us.current_decks_count, us.current_cards_count,
      us.current_daily_studies, us.current_ai_interactions,
      sp.max_decks, sp.max_cards_per_deck,
      sp.max_daily_studies, sp.max_ai_interactions
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = ? AND us.status = 'active'
  `;
  
  db.get(query, [req.user.id], (err, limits) => {
    if (err) {
      console.error('Erro ao verificar limites:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
    
    if (!limits) {
      const freeQuery = 'SELECT * FROM subscription_plans WHERE name = "FREE"';
      db.get(freeQuery, [], (err, freePlan) => {
        if (err) {
          console.error('Erro ao buscar plano FREE:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
          });
        }
        
        const freeLimits = {
          current_decks_count: 0,
          current_cards_count: 0,
          current_daily_studies: 0,
          current_ai_interactions: 0,
          max_decks: freePlan.max_decks,
          max_cards_per_deck: freePlan.max_cards_per_deck,
          max_daily_studies: freePlan.max_daily_studies,
          max_ai_interactions: freePlan.max_ai_interactions
        };
        
        checkActionLimit(action, amount, freeLimits, res);
      });
    } else {
      checkActionLimit(action, amount, limits, res);
    }
  });
});

function checkActionLimit(action, amount, limits, res) {
  let canPerform = false;
  let currentUsage = 0;
  let maxLimit = 0;
  
  switch (action) {
    case 'create_deck':
      currentUsage = limits.current_decks_count;
      maxLimit = limits.max_decks;
      canPerform = (currentUsage + amount) <= maxLimit;
      break;
    case 'add_card':
      currentUsage = limits.current_cards_count;
      maxLimit = limits.max_cards_per_deck;
      canPerform = (currentUsage + amount) <= maxLimit;
      break;
    case 'daily_study':
      currentUsage = limits.current_daily_studies;
      maxLimit = limits.max_daily_studies;
      canPerform = (currentUsage + amount) <= maxLimit;
      break;
    case 'ai_interaction':
      currentUsage = limits.current_ai_interactions;
      maxLimit = limits.max_ai_interactions;
      canPerform = (currentUsage + amount) <= maxLimit;
      break;
    default:
      return res.status(400).json({
        success: false,
        message: 'Ação não reconhecida'
      });
  }
  
  res.json({
    success: true,
    canPerform,
    currentUsage,
    maxLimit,
    remaining: maxLimit - currentUsage
  });
}

module.exports = router;