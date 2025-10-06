-- Migração para adicionar coluna de nível de acesso
-- Níveis: 'user' (padrão), 'moderator', 'admin', 'super_admin'

ALTER TABLE users ADD COLUMN access_level VARCHAR(20) DEFAULT 'user';

-- Atualizar usuários existentes que já são admin
UPDATE users SET access_level = 'admin' WHERE is_admin = true;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_users_access_level ON users(access_level);

-- Comentários sobre os níveis de acesso:
-- 'user': Usuário comum com acesso básico
-- 'moderator': Pode moderar conteúdo, mas sem acesso total ao admin
-- 'admin': Administrador com acesso completo ao painel admin
-- 'super_admin': Super administrador com todas as permissões