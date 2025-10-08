const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('./config/passport');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscriptions');
const flashcardsRoutes = require('./routes/flashcards');
const uploadRoutes = require('./routes/upload');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 5000;
const { initializeDatabase, createAdminUser } = require('./config/database');

// Trust proxy for session cookies
app.set('trust proxy', 1);

// Request ID middleware for better tracing
app.use((req, res, next) => {
  const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = req.get('X-Request-Id') || genId();
  res.set('X-Request-Id', req.requestId);
  next();
});

// CORS configuration (supports multiple origins via CORS_ORIGINS or FRONTEND_URLS)
const parseOrigins = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
};
const allowedOrigins = (
  parseOrigins(process.env.CORS_ORIGINS) ||
  parseOrigins(process.env.FRONTEND_URLS)
);
if (allowedOrigins.length === 0 && process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL.trim());
}
if (allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:3001');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow non-browser or same-origin
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));

// Explicit preflight for all routes
app.options('*', cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));

// Session configuration with MemoryStore (fallback quando PostgreSQL não está disponível)
app.use(session({
  // Usando MemoryStore padrão temporariamente
  secret: process.env.SESSION_SECRET || 'linguanova-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'linguanova.sid',
  cookie: {
    secure: false, // false para desenvolvimento local
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    sameSite: 'lax'
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Serve uploaded files (avatars, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static assets from public folder
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// Serve audio files with strict path matching
app.use('/audio', express.static(path.join(__dirname, '../public/audio'), {
  fallthrough: false,  // Não fazer fallback para outros middlewares
  redirect: false      // Não redirecionar automaticamente
}));

// Serve data files
app.use('/data', express.static(path.join(__dirname, '../public/data')));

// Serve stories and dialogues text files
app.use('/stories', express.static(path.join(__dirname, '../public/stories')));
app.use('/dialogues', express.static(path.join(__dirname, '../public/dialogues')));

// Upload routes BEFORE JSON parsing middleware and rate limiting
app.use('/api/upload', uploadRoutes);
// Compatibilidade: aceitar também sem o prefixo /api
app.use('/upload', uploadRoutes);

// JSON parsing middleware (after upload routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Auth routes WITHOUT rate limiting for social auth URLs
app.use('/api/auth', authRoutes);

// Rate limiting (after auth routes to avoid blocking social auth)
app.use(rateLimiter);

// Compat: reescrever rotas legacy sem prefixo "/api"
app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/flashcards')) {
    const original = req.originalUrl || req.url;
    const rewritten = `/api${req.url}`;
    console.warn(`🔁 Compat rewrite: ${req.method} ${original} -> ${rewritten}`);
    req.url = rewritten;
  }
  next();
});

app.use('/api/admin', adminRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/flashcards', flashcardsRoutes);

// Rota específica para callback do Google (sem /api prefix)
// Callback do Google OAuth movido para /api/auth/google/callback em routes/auth.js

// Nova rota para recuperar dados da sessão de autenticação
app.get('/api/auth/session-data', (req, res) => {
  console.log('📡 Session Data: Requisição recebida');
  console.log('📊 Session Data: Session ID:', req.sessionID);
  console.log('📊 Session Data: Session exists:', !!req.session);
  console.log('📊 Session Data: AuthData exists:', !!req.session?.authData);
  
  if (req.session && req.session.authData) {
    const authData = req.session.authData;
    console.log('✅ Session Data: Dados encontrados na sessão:', { 
      hasToken: !!authData.token, 
      hasRefreshToken: !!authData.refreshToken, 
      userId: authData.user?.id 
    });
    
    // Limpar dados da sessão após recuperação
    delete req.session.authData;
    console.log('🧹 Session Data: Dados removidos da sessão');
    
    res.json(authData);
  } else {
    console.log('❌ Session Data: Dados de autenticação não encontrados na sessão');
    res.status(404).json({ error: 'Dados de autenticação não encontrados na sessão' });
  }
});

// Rota específica para callback do Facebook (sem /api prefix)
app.get('/auth/facebook/callback', (req, res, next) => {
  const passport = require('./config/passport');
  const jwt = require('jsonwebtoken');
  
  passport.authenticate('facebook', { failureRedirect: '/login' })(req, res, async (err) => {
    if (err) {
      console.error('Erro na autenticação Facebook:', err);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
    }
    
    try {
      const user = req.user;
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      
      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '30d' }
      );
      
      // Redirecionar para o frontend com o token
      res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&refreshToken=${refreshToken}`);
    } catch (error) {
      console.error('Erro ao processar callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
    }
  });
});

// Serve static files from React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 and error handling middleware (order matters)
app.use(notFound);
app.use(errorHandler);

// Inicializa o banco e só então inicia o servidor
(async () => {
  try {
    console.log('🔧 Inicializando banco de dados...');
    await initializeDatabase();
    await createAdminUser();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Falha ao inicializar o banco de dados:', err.message);
    process.exit(1);
  }
})();

module.exports = app;