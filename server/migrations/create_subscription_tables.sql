-- Migração para criar tabelas de assinatura
-- Sistema de níveis: FREE, BASIC, PREMIUM, PRO

-- Tabela de planos de assinatura
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  
  -- Limites de recursos
  max_decks INTEGER DEFAULT -1,  -- -1 = ilimitado
  max_cards_per_deck INTEGER DEFAULT -1,
  max_daily_studies INTEGER DEFAULT -1,
  max_ai_interactions INTEGER DEFAULT -1,
  
  -- Funcionalidades premium
  has_advanced_analytics BOOLEAN DEFAULT FALSE,
  has_offline_mode BOOLEAN DEFAULT FALSE,
  has_custom_themes BOOLEAN DEFAULT FALSE,
  has_priority_support BOOLEAN DEFAULT FALSE,
  has_export_import BOOLEAN DEFAULT FALSE,
  has_collaboration BOOLEAN DEFAULT FALSE,
  
  -- Metadados
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de assinaturas dos usuários
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  
  -- Status da assinatura
  status VARCHAR(20) DEFAULT 'active', -- active, cancelled, expired, suspended
  
  -- Datas importantes
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  cancelled_at DATETIME,
  
  -- Informações de pagamento
  payment_method VARCHAR(50), -- stripe, paypal, apple_pay, etc.
  external_subscription_id VARCHAR(255), -- ID do provedor de pagamento
  
  -- Uso atual (resetado mensalmente)
  current_decks_count INTEGER DEFAULT 0,
  current_cards_count INTEGER DEFAULT 0,
  current_daily_studies INTEGER DEFAULT 0,
  current_ai_interactions INTEGER DEFAULT 0,
  usage_reset_date DATE DEFAULT (date('now')),
  
  -- Metadados
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

-- Tabela de histórico de assinaturas
CREATE TABLE IF NOT EXISTS subscription_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subscription_id INTEGER NOT NULL,
  
  -- Evento
  event_type VARCHAR(50) NOT NULL, -- created, upgraded, downgraded, cancelled, renewed, expired
  old_plan_id INTEGER,
  new_plan_id INTEGER,
  
  -- Detalhes
  description TEXT,
  metadata TEXT, -- JSON com informações adicionais
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (old_plan_id) REFERENCES subscription_plans(id),
  FOREIGN KEY (new_plan_id) REFERENCES subscription_plans(id)
);

-- Inserir planos padrão
INSERT OR IGNORE INTO subscription_plans (
  name, display_name, description, price_monthly, price_yearly,
  max_decks, max_cards_per_deck, max_daily_studies, max_ai_interactions,
  has_advanced_analytics, has_offline_mode, has_custom_themes, 
  has_priority_support, has_export_import, has_collaboration,
  sort_order
) VALUES 
-- Plano FREE
('FREE', 'Gratuito', 'Perfeito para começar sua jornada de aprendizado', 0.00, 0.00,
 3, 50, 20, 5,
 FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 1),

-- Plano BASIC
('BASIC', 'Básico', 'Ideal para estudantes regulares', 9.99, 99.99,
 10, 200, 100, 50,
 TRUE, FALSE, TRUE, FALSE, TRUE, FALSE, 2),

-- Plano PREMIUM
('PREMIUM', 'Premium', 'Para estudantes sérios e dedicados', 19.99, 199.99,
 -1, -1, -1, 200,
 TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3),

-- Plano PRO
('PRO', 'Profissional', 'Para educadores e uso comercial', 39.99, 399.99,
 -1, -1, -1, -1,
 TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 4);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON user_subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_event_type ON subscription_history(event_type);

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER IF NOT EXISTS update_subscription_plans_updated_at
  AFTER UPDATE ON subscription_plans
  FOR EACH ROW
  BEGIN
    UPDATE subscription_plans SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_user_subscriptions_updated_at
  AFTER UPDATE ON user_subscriptions
  FOR EACH ROW
  BEGIN
    UPDATE user_subscriptions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

-- Trigger para criar entrada no histórico quando assinatura é criada/modificada
CREATE TRIGGER IF NOT EXISTS log_subscription_changes
  AFTER INSERT ON user_subscriptions
  FOR EACH ROW
  BEGIN
    INSERT INTO subscription_history (user_id, subscription_id, event_type, new_plan_id, description)
    VALUES (NEW.user_id, NEW.id, 'created', NEW.plan_id, 'Assinatura criada');
  END;

-- Comentários sobre o sistema:
-- 1. Todos os usuários começam com plano FREE por padrão
-- 2. Limites -1 significam ilimitado
-- 3. usage_reset_date controla quando resetar contadores mensais
-- 4. Status: active (ativa), cancelled (cancelada), expired (expirada), suspended (suspensa)
-- 5. O histórico mantém log de todas as mudanças para auditoria