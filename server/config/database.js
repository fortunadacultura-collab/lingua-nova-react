const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Configuração do PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'linguanova',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'linguanova123',
});

// Fallback para SQLite se PostgreSQL não estiver disponível
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqliteDb = new sqlite3.Database(dbPath);
let usePostgreSQL = false;

// Determinar qual banco usar
const db = pool;

// Função para testar a conexão
const testConnection = async () => {
  console.log('🔄 Testando conexão com o banco de dados...');
  
  try {
    // Tentar PostgreSQL primeiro
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Conectado ao PostgreSQL com sucesso!');
    console.log(`⏰ Hora do servidor: ${result.rows[0].current_time}`);
    usePostgreSQL = true;
    return true;
  } catch (pgError) {
    console.log('⚠️  PostgreSQL não disponível, usando SQLite como fallback');
    console.log(`   Erro PostgreSQL: ${pgError.message}`);
    
    try {
      // Fallback para SQLite
      return new Promise((resolve, reject) => {
        sqliteDb.get('SELECT datetime("now") as current_time', (err, row) => {
          if (err) {
            console.error('❌ Erro ao conectar com SQLite:', err.message);
            reject(err);
          } else {
            console.log('✅ Conectado ao SQLite com sucesso!');
            console.log(`⏰ Hora do servidor: ${row.current_time}`);
            usePostgreSQL = false;
            resolve(true);
          }
        });
      });
    } catch (sqliteError) {
      console.error('❌ Erro ao conectar com SQLite:', sqliteError.message);
      throw new Error('Não foi possível conectar a nenhum banco de dados');
    }
  }
};

// Função para criar as tabelas necessárias
const createTables = async () => {
  try {
    if (usePostgreSQL) {
      // SQL para PostgreSQL
      const createTablesSQL = `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          is_verified BOOLEAN DEFAULT FALSE,
          verification_token VARCHAR(255),
          reset_password_token VARCHAR(255),
          reset_password_expires TIMESTAMP,
          google_id VARCHAR(255) UNIQUE,
          facebook_id VARCHAR(255) UNIQUE,
          github_id VARCHAR(255) UNIQUE,
          avatar_url TEXT,
          access_level VARCHAR(20) DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP,
          deleted_by VARCHAR(255),
          last_login TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          bio TEXT,
          location VARCHAR(255),
          website VARCHAR(255),
          birth_date DATE,
          phone VARCHAR(20),
          preferences TEXT DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          session_token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS password_resets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS subscription_plans (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          price DECIMAL(10,2) NOT NULL,
          billing_cycle VARCHAR(20) NOT NULL,
          features TEXT DEFAULT '[]',
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          plan_id INTEGER REFERENCES subscription_plans(id),
          status VARCHAR(20) DEFAULT 'active',
          starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ends_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        /* ============================================
           FLASHCARDS: DECKS E CARDS
           ============================================ */
        CREATE TABLE IF NOT EXISTS decks (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          language VARCHAR(10),
          tags JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);

        CREATE TABLE IF NOT EXISTS cards (
          id SERIAL PRIMARY KEY,
          deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE,
          front_text TEXT NOT NULL,
          back_text TEXT NOT NULL,
          front_audio_url TEXT,
          front_video_url TEXT,
          back_audio_url TEXT,
          back_video_url TEXT,
          hint TEXT,
          notes TEXT,
          ease_factor REAL DEFAULT 2.5,
          interval_days INTEGER DEFAULT 0,
          repetitions INTEGER DEFAULT 0,
          due_date DATE,
          last_reviewed TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
        CREATE INDEX IF NOT EXISTS idx_cards_due_date ON cards(due_date);
      `;
      
      await pool.query(createTablesSQL);
      // Schema upgrade: add video_order_key to cards if missing
      try {
        const colCheck = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'video_order_key'`
        );
        const exists = Array.isArray(colCheck.rows) && colCheck.rows.length > 0;
        if (!exists) {
          await pool.query(`ALTER TABLE cards ADD COLUMN video_order_key BIGINT`);
        }
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_cards_video_order ON cards(deck_id, video_order_key)`);
      } catch (e) {
        console.warn('⚠️ PostgreSQL: falha ao garantir coluna video_order_key:', e?.message || String(e));
      }
      console.log('✅ Tabelas PostgreSQL criadas com sucesso!');
    } else {
      // SQL para SQLite
      const createTablesSQL = `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          is_verified INTEGER DEFAULT 0,
          verification_token TEXT,
          reset_password_token TEXT,
          reset_password_expires TEXT,
          google_id TEXT UNIQUE,
          facebook_id TEXT UNIQUE,
          github_id TEXT UNIQUE,
          avatar_url TEXT,
          access_level TEXT DEFAULT 'user',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          deleted_by TEXT,
          last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          bio TEXT,
          location TEXT,
          website TEXT,
          birth_date TEXT,
          phone TEXT,
          preferences TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          session_token TEXT UNIQUE NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS password_resets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          token TEXT UNIQUE NOT NULL,
          expires_at TEXT NOT NULL,
          used INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS subscription_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          price REAL NOT NULL,
          billing_cycle TEXT NOT NULL,
          features TEXT DEFAULT '[]',
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          plan_id INTEGER,
          status TEXT DEFAULT 'active',
          starts_at TEXT DEFAULT CURRENT_TIMESTAMP,
          ends_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
        );

        /* ============================================
           FLASHCARDS: DECKS E CARDS
           ============================================ */
        CREATE TABLE IF NOT EXISTS decks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          name TEXT NOT NULL,
          description TEXT,
          language TEXT,
          tags TEXT DEFAULT '[]',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deck_id INTEGER,
          front_text TEXT NOT NULL,
          back_text TEXT NOT NULL,
          front_audio_url TEXT,
          front_video_url TEXT,
          back_audio_url TEXT,
          back_video_url TEXT,
          hint TEXT,
          notes TEXT,
          ease_factor REAL DEFAULT 2.5,
          interval_days INTEGER DEFAULT 0,
          repetitions INTEGER DEFAULT 0,
          due_date TEXT,
          last_reviewed TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
        );
      `;
      
      await new Promise((resolve, reject) => {
        sqliteDb.exec(createTablesSQL, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // Schema upgrade: add video_order_key to cards if missing (SQLite)
      try {
        const cols = await new Promise((resolve, reject) => {
          sqliteDb.all('PRAGMA table_info(cards)', [], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
          });
        });
        const hasCol = cols.some((c) => String(c.name || '').toLowerCase() === 'video_order_key');
        if (!hasCol) {
          await new Promise((resolve, reject) => {
            sqliteDb.run('ALTER TABLE cards ADD COLUMN video_order_key INTEGER', [], (err) => {
              if (err) reject(err); else resolve();
            });
          });
        }
        await new Promise((resolve, reject) => {
          sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_cards_video_order ON cards(deck_id, video_order_key)', [], (err) => {
            if (err) reject(err); else resolve();
          });
        });
        console.log('✅ Tabelas SQLite criadas/atualizadas com sucesso!');
      } catch (e) {
        console.warn('⚠️ SQLite: falha ao garantir coluna video_order_key:', e?.message || String(e));
      }
    }
  } catch (err) {
    console.error('❌ Erro ao criar tabelas:', err.message);
    throw err;
  }
};

// Função para inicializar o banco de dados
const initializeDatabase = async () => {
  console.log('🔄 Testando conexão com o banco de dados...');
  const isConnected = await testConnection();
  
  if (!isConnected) {
    throw new Error('Não foi possível conectar ao banco de dados');
  }

  console.log('🔄 Criando tabelas...');
  await createTables();
  
  console.log('✅ Banco de dados inicializado com sucesso!');
};

// Função para criar usuário admin se não existir
const createAdminUser = async () => {
  try {
    if (usePostgreSQL) {
      // PostgreSQL
      const existingAdmin = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@linguanova.com']);
      
      if (existingAdmin.rows.length > 0) {
        console.log('✅ Usuário admin já existe');
        return existingAdmin.rows[0];
      }
      
      const bcrypt = require('bcrypt');
      const saltRounds = 10;
      const adminPassword = 'apav1975';
      
      const hash = await bcrypt.hash(adminPassword, saltRounds);
      
      const insertAdmin = `
        INSERT INTO users (email, password, first_name, last_name, is_verified, access_level)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      
      const result = await pool.query(insertAdmin, [
        'admin@linguanova.com',
        hash,
        'Admin',
        'LinguaNova',
        true,
        'admin'
      ]);
      
      console.log('✅ Usuário admin criado com sucesso!');
      console.log('📧 Email: admin@linguanova.com');
      console.log('🔑 Senha: apav1975');
      return { id: result.rows[0].id };
    } else {
      // SQLite
      return new Promise((resolve, reject) => {
        sqliteDb.get('SELECT * FROM users WHERE email = ?', ['admin@linguanova.com'], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (row) {
            console.log('✅ Usuário admin já existe');
            resolve(row);
            return;
          }
          
          const bcrypt = require('bcrypt');
          const saltRounds = 10;
          const adminPassword = 'apav1975';
          
          bcrypt.hash(adminPassword, saltRounds, (err, hash) => {
            if (err) {
              reject(err);
              return;
            }
            
            const insertAdmin = `
              INSERT INTO users (email, password, first_name, last_name, is_verified, access_level)
              VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            sqliteDb.run(insertAdmin, [
              'admin@linguanova.com',
              hash,
              'Admin',
              'LinguaNova',
              1, // SQLite usa 1 para true
              'admin'
            ], function(err) {
              if (err) {
                reject(err);
              } else {
                console.log('✅ Usuário admin criado com sucesso!');
                console.log('📧 Email: admin@linguanova.com');
                console.log('🔑 Senha: apav1975');
                resolve({ id: this.lastID });
              }
            });
          });
        });
      });
    }
  } catch (err) {
    console.error('❌ Erro ao criar usuário admin:', err.message);
    throw err;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Fechando conexões do banco de dados...');
  db.close((err) => {
    if (err) {
      console.error('❌ Erro ao fechar conexões:', err.message);
      process.exit(1);
    } else {
      console.log('✅ Conexões fechadas com sucesso!');
      process.exit(0);
    }
  });
});

// Função helper para queries (PostgreSQL)
const query = async (sql, params = []) => {
  try {
    if (usePostgreSQL) {
      // PostgreSQL
      const result = await pool.query(sql, params);
      return result.rows;
    } else {
      // SQLite
      return new Promise((resolve, reject) => {
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          sqliteDb.all(sql, params, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        } else {
          sqliteDb.run(sql, params, function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({ changes: this.changes, lastID: this.lastID });
            }
          });
        }
      });
    }
  } catch (err) {
    console.error('❌ Erro na consulta:', err.message);
    throw err;
  }
};

module.exports = {
  db,
  testConnection,
  initializeDatabase,
  createAdminUser,
  query
};