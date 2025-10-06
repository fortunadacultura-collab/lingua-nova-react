# 🐘 Guia de Instalação do PostgreSQL

Este guia irá te ajudar a instalar e configurar o PostgreSQL no macOS para o projeto LinguaNova.

## 📦 Instalação

### Opção 1: Homebrew (Recomendado)

```bash
# Instalar PostgreSQL
brew install postgresql@15

# Iniciar o serviço
brew services start postgresql@15

# Verificar se está rodando
brew services list | grep postgresql
```

### Opção 2: PostgreSQL.app

1. Baixe o [Postgres.app](https://postgresapp.com/)
2. Arraste para a pasta Applications
3. Execute o aplicativo
4. Clique em "Initialize" para criar um novo servidor

### Opção 3: Instalador Oficial

1. Baixe do [site oficial](https://www.postgresql.org/download/macos/)
2. Execute o instalador
3. Siga as instruções na tela

## ⚙️ Configuração Inicial

### 1. Conectar ao PostgreSQL

```bash
# Conectar como usuário padrão
psql postgres
```

### 2. Criar Usuário e Banco de Dados

```sql
-- Criar usuário (se não existir)
CREATE USER postgres WITH PASSWORD 'password';

-- Dar privilégios de superusuário
ALTER USER postgres WITH SUPERUSER;

-- Criar banco de dados
CREATE DATABASE linguanova OWNER postgres;

-- Conectar ao banco
\c linguanova

-- Verificar conexão
SELECT current_database(), current_user;

-- Sair
\q
```

### 3. Testar Conexão

```bash
# Testar conexão com o banco
psql -h localhost -p 5432 -U postgres -d linguanova
```

## 🚀 Inicializar Banco para LinguaNova

Após instalar o PostgreSQL:

```bash
# No diretório do projeto
cd /Users/ernestotakahara/Documents/LinguaNova/webpage

# Inicializar tabelas
npm run db:init
```

## 🔧 Comandos Úteis

### Gerenciar Serviço

```bash
# Iniciar PostgreSQL
brew services start postgresql@15

# Parar PostgreSQL
brew services stop postgresql@15

# Reiniciar PostgreSQL
brew services restart postgresql@15

# Status do serviço
brew services list | grep postgresql
```

### Comandos psql

```sql
-- Listar bancos de dados
\l

-- Conectar a um banco
\c nome_do_banco

-- Listar tabelas
\dt

-- Descrever tabela
\d nome_da_tabela

-- Listar usuários
\du

-- Sair
\q
```

## 🐛 Troubleshooting

### Erro: "psql: command not found"

```bash
# Adicionar ao PATH (adicione ao ~/.zshrc ou ~/.bash_profile)
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

# Recarregar terminal
source ~/.zshrc
```

### Erro: "Connection refused"

```bash
# Verificar se PostgreSQL está rodando
brew services list | grep postgresql

# Se não estiver, iniciar
brew services start postgresql@15

# Verificar porta
lsof -i :5432
```

### Erro: "Authentication failed"

```bash
# Resetar senha do usuário
psql postgres
ALTER USER postgres PASSWORD 'password';
\q
```

### Erro: "Database does not exist"

```bash
# Criar o banco manualmente
psql postgres
CREATE DATABASE linguanova OWNER postgres;
\q
```

## 📊 Verificar Instalação

Após seguir os passos, execute:

```bash
# Verificar versão
psql --version

# Testar conexão
psql -h localhost -p 5432 -U postgres -d linguanova -c "SELECT version();"

# Inicializar banco do projeto
npm run db:init
```

Se tudo estiver funcionando, você verá:
```
✅ Conexão com PostgreSQL estabelecida com sucesso
📅 Timestamp do banco: [data/hora atual]
✅ Tabelas criadas/verificadas com sucesso
🎉 Banco de dados inicializado com sucesso
```

## 🎯 Próximos Passos

Após configurar o PostgreSQL:

1. **Executar o backend:**
   ```bash
   npm run server:dev
   ```

2. **Executar frontend + backend:**
   ```bash
   npm run full:dev
   ```

3. **Testar a API:**
   - Abra http://localhost:5000/api/health
   - Deve retornar: `{"status":"OK","timestamp":"..."}`

---

**💡 Dica:** Mantenha o PostgreSQL sempre rodando durante o desenvolvimento com `brew services start postgresql@15`