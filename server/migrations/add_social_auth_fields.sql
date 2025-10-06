-- Adicionar campos para autenticação social na tabela users (SQLite)
ALTER TABLE users ADD COLUMN google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN facebook_id VARCHAR(255);
ALTER TABLE users ADD COLUMN github_id VARCHAR(255);
ALTER TABLE users ADD COLUMN profile_picture TEXT;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);