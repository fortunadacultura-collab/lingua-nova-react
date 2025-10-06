const { db } = require('../config/database');

/**
 * Middleware para verificar limites de assinatura
 * @param {string} action - Ação a ser verificada (create_deck, add_card, daily_study, ai_interaction)
 * @param {number} amount - Quantidade da ação (padrão: 1)
 */
const checkSubscriptionLimit = (action, amount = 1) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      
      // Mapear ações para campos do banco
      const actionMap = {
        'create_deck': 'decks',
        'add_card': 'cards',
        'daily_study': 'daily_studies',
        'ai_interaction': 'ai_interactions'
      };
      
      const field = actionMap[action];
      if (!field) {
        return res.status(400).json({
          success: false,
          message: 'Ação de verificação inválida'
        });
      }
      
      // Buscar assinatura ativa do usuário
      const subscriptionQuery = `
        SELECT 
          us.current_${field}_count,
          us.usage_reset_date,
          sp.max_${field === 'cards' ? 'cards_per_deck' : field} as max_limit,
          sp.name as plan_name
        FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = ? AND us.status = 'active'
        ORDER BY us.created_at DESC
        LIMIT 1
      `;
      
      db.get(subscriptionQuery, [userId], (err, subscription) => {
        if (err) {
          console.error('Erro ao verificar assinatura:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
          });
        }
        
        // Se não tem assinatura ativa, usar limites do plano FREE
        if (!subscription) {
          const freeQuery = `SELECT max_${field === 'cards' ? 'cards_per_deck' : field} as max_limit FROM subscription_plans WHERE name = 'FREE'`;
          
          db.get(freeQuery, (err, freePlan) => {
            if (err) {
              console.error('Erro ao buscar plano FREE:', err.message);
              return res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
              });
            }
            
            const maxLimit = freePlan.max_limit;
            const currentUsage = 0; // Usuário FREE sem registro de uso
            
            // Verificar limite
            if (maxLimit !== -1 && (currentUsage + amount) > maxLimit) {
              return res.status(403).json({
                success: false,
                message: `Limite do plano FREE excedido. Máximo: ${maxLimit}`,
                error_code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
                data: {
                  current_usage: currentUsage,
                  max_limit: maxLimit,
                  plan_name: 'FREE',
                  action: action
                }
              });
            }
            
            // Adicionar informações da assinatura ao request
            req.subscription = {
              plan_name: 'FREE',
              current_usage: currentUsage,
              max_limit: maxLimit,
              can_proceed: true
            };
            
            next();
          });
        } else {
          // Verificar se precisa resetar contadores mensais
          const today = new Date().toISOString().split('T')[0];
          const resetDate = subscription.usage_reset_date;
          
          if (resetDate !== today) {
            // Resetar contadores mensais
            const resetQuery = `
              UPDATE user_subscriptions 
              SET 
                current_decks_count = 0,
                current_cards_count = 0,
                current_daily_studies = 0,
                current_ai_interactions = 0,
                usage_reset_date = ?
              WHERE user_id = ? AND status = 'active'
            `;
            
            db.run(resetQuery, [today, userId], (err) => {
              if (err) {
                console.error('Erro ao resetar contadores:', err.message);
              }
              
              // Continuar com contadores zerados
              checkLimitAndProceed(0, subscription.max_limit, subscription.plan_name);
            });
          } else {
            // Usar contadores atuais
            const currentUsage = subscription[`current_${field}_count`] || 0;
            checkLimitAndProceed(currentUsage, subscription.max_limit, subscription.plan_name);
          }
          
          function checkLimitAndProceed(currentUsage, maxLimit, planName) {
            // Verificar limite (-1 significa ilimitado)
            if (maxLimit !== -1 && (currentUsage + amount) > maxLimit) {
              return res.status(403).json({
                success: false,
                message: `Limite do plano ${planName} excedido. Máximo: ${maxLimit}`,
                error_code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
                data: {
                  current_usage: currentUsage,
                  max_limit: maxLimit,
                  plan_name: planName,
                  action: action,
                  upgrade_required: true
                }
              });
            }
            
            // Adicionar informações da assinatura ao request
            req.subscription = {
              plan_name: planName,
              current_usage: currentUsage,
              max_limit: maxLimit,
              can_proceed: true
            };
            
            next();
          }
        }
      });
      
    } catch (error) {
      console.error('Erro no middleware de assinatura:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  };
};

/**
 * Middleware para verificar se usuário tem acesso a funcionalidade premium
 * @param {string} feature - Funcionalidade a ser verificada
 */
const checkPremiumFeature = (feature) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      
      // Mapear funcionalidades para campos do banco
      const featureMap = {
        'advanced_analytics': 'has_advanced_analytics',
        'offline_mode': 'has_offline_mode',
        'custom_themes': 'has_custom_themes',
        'priority_support': 'has_priority_support',
        'export_import': 'has_export_import',
        'collaboration': 'has_collaboration'
      };
      
      const dbField = featureMap[feature];
      if (!dbField) {
        return res.status(400).json({
          success: false,
          message: 'Funcionalidade inválida'
        });
      }
      
      // Buscar assinatura ativa
      const query = `
        SELECT sp.${dbField}, sp.name as plan_name
        FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = ? AND us.status = 'active'
        ORDER BY us.created_at DESC
        LIMIT 1
      `;
      
      db.get(query, [userId], (err, subscription) => {
        if (err) {
          console.error('Erro ao verificar funcionalidade premium:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
          });
        }
        
        // Se não tem assinatura ativa, verificar plano FREE
        if (!subscription) {
          const freeQuery = `SELECT ${dbField}, name as plan_name FROM subscription_plans WHERE name = 'FREE'`;
          
          db.get(freeQuery, (err, freePlan) => {
            if (err) {
              console.error('Erro ao buscar plano FREE:', err.message);
              return res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
              });
            }
            
            if (!freePlan[dbField]) {
              return res.status(403).json({
                success: false,
                message: `Funcionalidade '${feature}' não disponível no plano FREE`,
                error_code: 'PREMIUM_FEATURE_REQUIRED',
                data: {
                  feature: feature,
                  plan_name: 'FREE',
                  upgrade_required: true
                }
              });
            }
            
            next();
          });
        } else {
          // Verificar se o plano atual tem a funcionalidade
          if (!subscription[dbField]) {
            return res.status(403).json({
              success: false,
              message: `Funcionalidade '${feature}' não disponível no plano ${subscription.plan_name}`,
              error_code: 'PREMIUM_FEATURE_REQUIRED',
              data: {
                feature: feature,
                plan_name: subscription.plan_name,
                upgrade_required: true
              }
            });
          }
          
          next();
        }
      });
      
    } catch (error) {
      console.error('Erro no middleware de funcionalidade premium:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  };
};

/**
 * Função para incrementar uso após ação bem-sucedida
 * @param {number} userId - ID do usuário
 * @param {string} action - Ação executada
 * @param {number} amount - Quantidade a incrementar
 */
const incrementUsage = (userId, action, amount = 1) => {
  const actionMap = {
    'create_deck': 'current_decks_count',
    'add_card': 'current_cards_count',
    'daily_study': 'current_daily_studies',
    'ai_interaction': 'current_ai_interactions'
  };
  
  const field = actionMap[action];
  if (!field) {
    console.error('Ação inválida para incremento:', action);
    return;
  }
  
  const query = `
    UPDATE user_subscriptions 
    SET ${field} = ${field} + ?
    WHERE user_id = ? AND status = 'active'
  `;
  
  db.run(query, [amount, userId], (err) => {
    if (err) {
      console.error('Erro ao incrementar uso:', err.message);
    }
  });
};

/**
 * Função para obter informações da assinatura do usuário
 * @param {number} userId - ID do usuário
 * @returns {Promise} - Promise com dados da assinatura
 */
const getUserSubscription = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        us.id, us.status, us.started_at, us.expires_at,
        us.current_decks_count, us.current_cards_count,
        us.current_daily_studies, us.current_ai_interactions,
        sp.name as plan_name, sp.display_name,
        sp.max_decks, sp.max_cards_per_deck, sp.max_daily_studies, sp.max_ai_interactions,
        sp.has_advanced_analytics, sp.has_offline_mode, sp.has_custom_themes,
        sp.has_priority_support, sp.has_export_import, sp.has_collaboration
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.status = 'active'
      ORDER BY us.created_at DESC
      LIMIT 1
    `;
    
    db.get(query, [userId], (err, subscription) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!subscription) {
        // Retornar dados do plano FREE
        const freeQuery = 'SELECT * FROM subscription_plans WHERE name = "FREE"';
        
        db.get(freeQuery, (err, freePlan) => {
          if (err) {
            reject(err);
            return;
          }
          
          resolve({
            id: null,
            status: 'free',
            plan_name: 'FREE',
            display_name: freePlan.display_name,
            max_decks: freePlan.max_decks,
            max_cards_per_deck: freePlan.max_cards_per_deck,
            max_daily_studies: freePlan.max_daily_studies,
            max_ai_interactions: freePlan.max_ai_interactions,
            has_advanced_analytics: Boolean(freePlan.has_advanced_analytics),
            has_offline_mode: Boolean(freePlan.has_offline_mode),
            has_custom_themes: Boolean(freePlan.has_custom_themes),
            has_priority_support: Boolean(freePlan.has_priority_support),
            has_export_import: Boolean(freePlan.has_export_import),
            has_collaboration: Boolean(freePlan.has_collaboration),
            current_decks_count: 0,
            current_cards_count: 0,
            current_daily_studies: 0,
            current_ai_interactions: 0
          });
        });
      } else {
        // Converter valores booleanos
        resolve({
          ...subscription,
          has_advanced_analytics: Boolean(subscription.has_advanced_analytics),
          has_offline_mode: Boolean(subscription.has_offline_mode),
          has_custom_themes: Boolean(subscription.has_custom_themes),
          has_priority_support: Boolean(subscription.has_priority_support),
          has_export_import: Boolean(subscription.has_export_import),
          has_collaboration: Boolean(subscription.has_collaboration)
        });
      }
    });
  });
};

module.exports = {
  checkSubscriptionLimit,
  checkPremiumFeature,
  incrementUsage,
  getUserSubscription
};