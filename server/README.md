# LinguaNova Backend

Backend da aplicação LinguaNova construído com Node.js, Express e PostgreSQL.

## 🚀 Configuração Rápida

### 1. Instalar PostgreSQL

**macOS (usando Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Configurar Banco de Dados

```bash
# Conectar ao PostgreSQL
psql postgres

# Criar usuário e banco
CREATE USER postgres WITH PASSWORD 'password';
CREATE DATABASE linguanova OWNER postgres;
GRANT ALL PRIVILEGES ON DATABASE linguanova TO postgres;

# Sair do psql
\q
```

### 3. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar as configurações
nano .env
```

**Configurações mínimas necessárias:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=linguanova
DB_USER=postgres
DB_PASSWORD=password
JWT_SECRET=sua_chave_secreta_muito_longa_e_aleatoria
```

### 4. Instalar Dependências

```bash
npm install
```

### 5. Inicializar Banco de Dados

```bash
npm run db:init
```

### 6. Executar Servidor

```bash
# Desenvolvimento (com auto-reload)
npm run server:dev

# Produção
npm run server

# Frontend + Backend simultaneamente
npm run full:dev
```

## 📁 Estrutura do Projeto

```
server/
├── config/
│   └── database.js          # Configuração do PostgreSQL
├── middleware/
│   ├── auth.js              # Autenticação JWT
│   ├── errorHandler.js      # Tratamento de erros
│   ├── rateLimiter.js       # Rate limiting
│   └── validation.js        # Validação de dados
├── models/
│   └── User.js              # Modelo de usuário
├── routes/
│   └── auth.js              # Rotas de autenticação
├── scripts/
│   └── initDb.js            # Script de inicialização
└── server.js                # Servidor principal
```

## 🔐 Endpoints da API

### Autenticação

| Método | Endpoint | Descrição |
|--------|----------|----------|
| POST | `/api/auth/register` | Registrar usuário |
| POST | `/api/auth/login` | Fazer login |
| POST | `/api/auth/logout` | Fazer logout |
| POST | `/api/auth/refresh` | Renovar token |
| GET | `/api/auth/me` | Dados do usuário |
| PUT | `/api/auth/profile` | Atualizar perfil |
| POST | `/api/auth/forgot-password` | Solicitar reset |
| POST | `/api/auth/reset-password` | Redefinir senha |
| DELETE | `/api/auth/account` | Deletar conta |

### Exemplo de Uso

**Registro:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@exemplo.com",
    "password": "MinhaSenh@123",
    "firstName": "João",
    "lastName": "Silva",
    "acceptTerms": true
  }'
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@exemplo.com",
    "password": "MinhaSenh@123"
  }'
```

## 🛡️ Segurança

- **Rate Limiting**: Proteção contra ataques de força bruta
- **Validação**: Validação rigorosa de dados de entrada
- **Hashing**: Senhas criptografadas com bcrypt
- **JWT**: Tokens seguros para autenticação
- **CORS**: Configurado para frontend específico
- **Sanitização**: Limpeza automática de dados

## 🗄️ Banco de Dados

### Tabelas Principais

**users**
- `id` (SERIAL PRIMARY KEY)
- `email` (VARCHAR UNIQUE)
- `password` (VARCHAR)
- `first_name` (VARCHAR)
- `last_name` (VARCHAR)
- `is_verified` (BOOLEAN)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**user_profiles**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER FK)
- `avatar_url` (VARCHAR)
- `bio` (TEXT)
- `language_level` (VARCHAR)
- `preferred_language` (VARCHAR)
- `study_streak` (INTEGER)
- `total_points` (INTEGER)

## 🔧 Scripts Disponíveis

```bash
# Servidor
npm run server          # Executar servidor
npm run server:dev      # Servidor com nodemon

# Banco de dados
npm run db:init         # Inicializar tabelas
npm run db:seed         # Popular com dados de teste

# Desenvolvimento
npm run full:dev        # Frontend + Backend
```

## 🐛 Troubleshooting

### Erro de Conexão com PostgreSQL
```
❌ Erro ao conectar com PostgreSQL: connection refused
```

**Soluções:**
1. Verificar se PostgreSQL está rodando: `brew services list | grep postgresql`
2. Iniciar PostgreSQL: `brew services start postgresql`
3. Verificar porta: `lsof -i :5432`

### Erro de Autenticação
```
❌ Erro ao conectar com PostgreSQL: password authentication failed
```

**Soluções:**
1. Verificar credenciais no `.env`
2. Resetar senha do usuário PostgreSQL
3. Verificar permissões do banco

### Tabelas não Encontradas
```
❌ relation "users" does not exist
```

**Solução:**
```bash
npm run db:init
```

## 📝 Logs

O servidor registra automaticamente:
- Conexões de usuários
- Queries executadas
- Erros e exceções
- Rate limiting
- Performance de queries

## 🚀 Deploy

Para produção, configure:

1. **Variáveis de ambiente de produção**
2. **SSL para PostgreSQL**
3. **HTTPS para API**
4. **Monitoramento e logs**
5. **Backup automático do banco**

---

**Desenvolvido com ❤️ para LinguaNova**