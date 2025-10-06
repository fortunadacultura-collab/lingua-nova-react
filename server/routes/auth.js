const express = require('express');
const User = require('../models/User');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { 
  authenticateToken, 
  generateToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} = require('../middleware/auth');
const { 
  validate, 
  sanitize,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema
} = require('../middleware/validation');
const {
  authRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter
} = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/auth/register - Registrar novo usuário
router.post('/register', 
  registerRateLimiter,
  sanitize,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName } = req.body;

    try {
      const user = await User.create({
        email: email.toLowerCase(),
        password,
        firstName,
        lastName
      });

      const token = generateToken(user.id);
      const refreshToken = generateRefreshToken(user.id);

      console.log(`✅ Novo usuário registrado: ${user.email}`);

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: user.toJSON(),
        token,
        refreshToken
      });
    } catch (error) {
      if (error.message === 'Email já está em uso') {
        return res.status(409).json({
          error: 'Email já cadastrado',
          message: 'Este email já está sendo usado por outro usuário'
        });
      }
      throw error;
    }
  })
);

// POST /api/auth/login - Fazer login
router.post('/login',
  authRateLimiter,
  sanitize,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, rememberMe } = req.body;

    const user = await User.verifyPassword(email.toLowerCase(), password);

    if (!user) {
      return res.status(401).json({
        error: 'Credenciais inválidas',
        message: 'Email ou senha incorretos'
      });
    }

    // Atualizar last_login do usuário
    await user.update({ last_login: new Date() });

    const tokenExpiry = rememberMe ? '30d' : '7d';
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    console.log(`✅ Login realizado: ${user.email}`);

    res.json({
      message: 'Login realizado com sucesso',
      user: user.toJSON(),
      token,
      refreshToken
    });
  })
);

// POST /api/auth/refresh - Renovar token
router.post('/refresh',
  verifyRefreshToken,
  asyncHandler(async (req, res) => {
    const user = req.user;
    
    const newToken = generateToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    res.json({
      message: 'Token renovado com sucesso',
      token: newToken,
      refreshToken: newRefreshToken
    });
  })
);

// POST /api/auth/logout - Fazer logout
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Em uma implementação mais robusta, você poderia:
    // 1. Adicionar o token a uma blacklist
    // 2. Remover refresh tokens do banco
    // 3. Limpar sessões ativas
    
    console.log(`✅ Logout realizado: ${req.user.email}`);
    
    res.json({
      message: 'Logout realizado com sucesso'
    });
  })
);

// GET /api/auth/me - Obter dados do usuário atual
router.get('/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({
      user: req.user.toJSON()
    });
  })
);

// PUT /api/auth/update-profile - Atualizar perfil do usuário
router.put('/update-profile',
  authenticateToken,
  sanitize,
  asyncHandler(async (req, res) => {
    const user = req.user;
    const { firstName, lastName, email, currentPassword, newPassword } = req.body;

    // Validações básicas
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        error: 'Dados obrigatórios',
        message: 'Nome, sobrenome e email são obrigatórios'
      });
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Email inválido',
        message: 'Por favor, forneça um email válido'
      });
    }

    // Se está alterando senha, validar senha atual
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          error: 'Senha atual obrigatória',
          message: 'Senha atual é obrigatória para alterar a senha'
        });
      }

      // Verificar senha atual
      const bcrypt = require('bcrypt');
      const result = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
      const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      
      if (!isValidPassword) {
        return res.status(400).json({
          error: 'Senha incorreta',
          message: 'Senha atual está incorreta'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          error: 'Senha muito curta',
          message: 'Nova senha deve ter pelo menos 6 caracteres'
        });
      }
    }

    // Verificar se o email já está em uso por outro usuário
    if (email.toLowerCase() !== user.email.toLowerCase()) {
      const existingUser = await User.findByEmail(email.toLowerCase());
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({
          error: 'Email em uso',
          message: 'Este email já está sendo usado por outro usuário'
        });
      }
    }

    try {
      const updateData = {
        firstName,
        lastName,
        email: email.toLowerCase()
      };

      // Se está alterando senha, incluir nova senha hasheada
      if (newPassword) {
        const bcrypt = require('bcrypt');
        const saltRounds = 12;
        updateData.password = await bcrypt.hash(newPassword, saltRounds);
      }

      await user.update(updateData);

      console.log(`✅ Perfil atualizado: ${user.email}`);

      res.json({
        message: 'Perfil atualizado com sucesso',
        user: user.toJSON()
      });
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      res.status(500).json({
        error: 'Erro interno',
        message: 'Erro ao atualizar perfil. Tente novamente.'
      });
    }
  })
);

// POST /api/auth/upload-avatar - Upload de avatar
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuração do multer para upload de avatar
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/avatars');
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gerar nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // Apenas um arquivo por vez
  },
  fileFilter: function (req, file, cb) {
    // Verificar se é uma imagem
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos (JPEG, PNG, GIF, WebP)'), false);
    }
  }
});

router.post('/upload-avatar',
  authenticateToken,
  (req, res, next) => {
    // Pular middleware de parsing JSON para FormData
    upload.single('avatar')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error('❌ Erro Multer:', err.message);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'Arquivo muito grande',
            message: 'A imagem deve ter no máximo 5MB'
          });
        }
        return res.status(400).json({
          error: 'Erro no upload',
          message: err.message
        });
      } else if (err) {
        console.error('❌ Erro de validação:', err.message);
        return res.status(400).json({
          error: 'Formato inválido',
          message: err.message
        });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'Arquivo não fornecido',
        message: 'Por favor, selecione uma imagem para upload'
      });
    }

    try {
      const user = req.user;
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      console.log(`📤 Iniciando upload de avatar para usuário: ${user.email}`);
      console.log(`📁 Arquivo: ${req.file.filename} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);

      // Remover avatar anterior se existir
      if (user.profilePicture && user.profilePicture.startsWith('/uploads/')) {
        const oldAvatarPath = path.join(__dirname, '..', user.profilePicture);
        if (fs.existsSync(oldAvatarPath)) {
          try {
            fs.unlinkSync(oldAvatarPath);
            console.log(`🗑️ Avatar anterior removido: ${user.profilePicture}`);
          } catch (deleteError) {
            console.warn(`⚠️ Erro ao remover avatar anterior: ${deleteError.message}`);
          }
        }
      }

      // Atualizar URL do avatar no banco
      await user.update({ profilePicture: avatarUrl });
      
      // Recarregar usuário com dados atualizados
      await user.reload();

      console.log(`✅ Avatar atualizado com sucesso: ${user.email} -> ${avatarUrl}`);

      res.json({
        message: 'Avatar atualizado com sucesso',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Erro ao fazer upload do avatar:', error);
      
      // Remover arquivo se houve erro
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({
        error: 'Erro interno',
        message: 'Erro ao fazer upload do avatar. Tente novamente.'
      });
    }
  })
);

// PUT /api/auth/profile - Manter compatibilidade com endpoint antigo
router.put('/profile',
  authenticateToken,
  sanitize,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = req.user;
    const updateData = req.body;

    await user.update(updateData);

    console.log(`✅ Perfil atualizado: ${user.email}`);

    res.json({
      message: 'Perfil atualizado com sucesso',
      user: user.toJSON()
    });
  })
);

// POST /api/auth/forgot-password - Solicitar reset de senha
router.post('/forgot-password',
  passwordResetRateLimiter,
  sanitize,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findByEmail(email.toLowerCase());

    if (!user) {
      // Por segurança, sempre retorna sucesso mesmo se o email não existir
      return res.json({
        message: 'Se o email existir, você receberá instruções para redefinir sua senha'
      });
    }

    const resetToken = await user.generatePasswordResetToken();

    // Aqui você enviaria o email com o token
    // Para desenvolvimento, vamos apenas logar o token
    console.log(`🔑 Token de reset para ${email}: ${resetToken}`);

    res.json({
      message: 'Se o email existir, você receberá instruções para redefinir sua senha',
      // Em desenvolvimento, incluir o token na resposta
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  })
);

// POST /api/auth/reset-password - Redefinir senha
router.post('/reset-password',
  passwordResetRateLimiter,
  sanitize,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    try {
      const user = await User.resetPassword(token, password);
      
      console.log(`✅ Senha redefinida: ${user.email}`);

      res.json({
        message: 'Senha redefinida com sucesso'
      });
    } catch (error) {
      if (error.message === 'Token inválido ou expirado') {
        return res.status(400).json({
          error: 'Token inválido',
          message: 'Token de reset inválido ou expirado'
        });
      }
      throw error;
    }
  })
);

// POST /api/auth/verify-email - Verificar email
router.post('/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Token obrigatório',
        message: 'Token de verificação é obrigatório'
      });
    }

    // Implementar verificação de email
    // Por enquanto, retorna sucesso
    res.json({
      message: 'Email verificado com sucesso'
    });
  })
);

// DELETE /api/auth/delete-account - Deletar conta do usuário permanentemente
router.delete('/delete-account',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = req.user;
    
    try {
      // Remover avatar se existir
      if (user.profilePicture && user.profilePicture.startsWith('/uploads/')) {
        const fs = require('fs');
        const path = require('path');
        const avatarPath = path.join(__dirname, '..', user.profilePicture);
        if (fs.existsSync(avatarPath)) {
          fs.unlinkSync(avatarPath);
        }
      }
      
      // Deletar permanentemente do banco de dados
      await user.delete();
      
      console.log(`🗑️ Conta deletada permanentemente: ${user.email}`);
      
      res.json({
        message: 'Conta deletada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar conta:', error);
      res.status(500).json({
        error: 'Erro interno',
        message: 'Erro ao deletar conta. Tente novamente.'
      });
    }
  })
);

// DELETE /api/auth/account - Deletar conta do usuário (soft delete)
router.delete('/account',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = req.user;
    
    await user.softDelete();
    
    console.log(`🗑️ Conta deletada: ${user.email}`);
    
    res.json({
      message: 'Conta deletada com sucesso'
    });
  })
);

// Rotas de autenticação social
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');

// Função para verificar se uma estratégia está configurada
const isStrategyConfigured = (strategyName) => {
  return passport._strategies && passport._strategies[strategyName];
};

// Google OAuth
router.post('/google/url', (req, res) => {
  console.log('🔍 Google URL: Iniciando geração de URL de autenticação');
  console.log('🔍 Google URL: Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Configurado' : 'NÃO CONFIGURADO');
  
  if (!isStrategyConfigured('google')) {
    console.log('❌ Google URL: Estratégia não configurada');
    return res.status(503).json({ 
      error: 'Autenticação Google não configurada',
      message: 'O serviço de autenticação Google não está disponível no momento.' 
    });
  }
  
  try {
    const redirectUri = 'http://localhost:5001/api/auth/google/callback';
    
    // Parâmetros para forçar seleção de conta e seguir melhores práticas
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email profile',
      prompt: 'select_account',  // Força seleção de conta
      access_type: 'offline',    // Para refresh tokens
      include_granted_scopes: 'true'  // Melhores práticas do Google
    });
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    console.log('✅ Google URL: URL gerada com sucesso (com seleção de conta)');
    console.log('🔍 Google URL: Redirect URI:', redirectUri);
    console.log('🔍 Google URL: Auth URL:', authUrl);
    
    res.json({ url: authUrl });
  } catch (error) {
    console.error('❌ Google URL: Erro ao gerar URL:', error);
    res.status(500).json({ error: 'Erro ao gerar URL de autenticação Google' });
  }
});

router.get('/google', (req, res, next) => {
  console.log('🔍 Google Auth: Iniciando autenticação direta');
  
  if (!isStrategyConfigured('google')) {
    console.log('❌ Google Auth: Estratégia não configurada');
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_not_configured`);
  }
  
  console.log('✅ Google Auth: Redirecionando para Google (com seleção de conta)');
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',  // Força seleção de conta
    accessType: 'offline',     // Para refresh tokens
    includeGrantedScopes: true // Melhores práticas do Google
  })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  console.log('🔍 Google Callback: Recebendo callback do Google');
  console.log('🔍 Google Callback: Query params:', req.query);
  console.log('🔍 Google Callback: Headers:', {
    'user-agent': req.headers['user-agent'],
    'referer': req.headers['referer']
  });
  
  if (!isStrategyConfigured('google')) {
    console.log('❌ Google Callback: Estratégia não configurada');
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_not_configured`);
  }
  
  console.log('✅ Google Callback: Iniciando autenticação via Passport');
  passport.authenticate('google', { 
    failureRedirect: '/login',
    failureMessage: true 
  })(req, res, next);
}, async (req, res) => {
    try {
      console.log('🔍 Google Callback: Processando usuário autenticado');
      
      const user = req.user;
      if (!user) {
        console.error('❌ Google Callback: Usuário não encontrado no req.user');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=user_not_found`);
      }
      
      console.log('👤 Google Callback: Usuário autenticado:', { id: user.id, email: user.email });
      
      // Atualizar last_login do usuário
      await user.update({ last_login: new Date() });
      
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
      
      console.log('🔑 Google Callback: Tokens gerados com sucesso');
      
      // Preparar dados do usuário para o frontend
      const userData = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        provider: 'google'
      };
      
      // Armazenar dados na sessão em vez de passar pela URL
      req.session.authData = {
        token,
        refreshToken,
        user: userData
      };
      
      console.log('💾 Google Callback: Dados armazenados na sessão:', { 
        hasToken: !!token, 
        hasRefreshToken: !!refreshToken, 
        userId: userData.id 
      });
      
      // Gerar um token temporário para transferir dados entre domínios
      const tempToken = Buffer.from(JSON.stringify({
        token: req.session.authData.token,
        refreshToken: req.session.authData.refreshToken,
        user: req.session.authData.user,
        timestamp: Date.now()
      })).toString('base64');
      
      // Redirecionar para página de confirmação com token temporário
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/confirmation?temp=${tempToken}`;
      console.log('🔄 Google Callback: Redirecionando para confirmação com token temporário');
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('💥 Google Callback: Erro ao processar callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
    }
  }
);

// Facebook OAuth
router.post('/facebook/url', (req, res) => {
  if (!isStrategyConfigured('facebook')) {
    return res.status(503).json({ 
      error: 'Autenticação Facebook não configurada',
      message: 'O serviço de autenticação Facebook não está disponível no momento.' 
    });
  }
  
  try {
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent('http://localhost:5001/auth/facebook/callback')}&scope=email`;
    res.json({ url: authUrl });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar URL de autenticação Facebook' });
  }
});

router.get('/facebook', (req, res, next) => {
  if (!isStrategyConfigured('facebook')) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=facebook_not_configured`);
  }
  passport.authenticate('facebook', {
    scope: ['email']
  })(req, res, next);
});

router.get('/facebook/callback', (req, res, next) => {
  if (!isStrategyConfigured('facebook')) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=facebook_not_configured`);
  }
  passport.authenticate('facebook', { failureRedirect: '/login' })(req, res, next);
}, async (req, res) => {
    try {
      const user = req.user;
      
      // Atualizar last_login do usuário
      await user.update({ last_login: new Date() });
      
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      
      const userParam = encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture
      }));
      
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/callback?token=${token}&refreshToken=${refreshToken}&user=${userParam}`);
    } catch (error) {
      console.error('Erro no callback do Facebook:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=${encodeURIComponent('Erro na autenticação')}`);
    }
  }
);

// GitHub OAuth
router.post('/github/url', (req, res) => {
  if (!isStrategyConfigured('github')) {
    return res.status(503).json({ 
      error: 'Autenticação GitHub não configurada',
      message: 'O serviço de autenticação GitHub não está disponível no momento.' 
    });
  }
  
  try {
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent('http://localhost:5001/api/auth/github/callback')}&scope=user:email`;
    res.json({ url: authUrl });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar URL de autenticação GitHub' });
  }
});

router.get('/github', (req, res, next) => {
  if (!isStrategyConfigured('github')) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=github_not_configured`);
  }
  passport.authenticate('github', {
    scope: ['user:email']
  })(req, res, next);
});

router.get('/github/callback', (req, res, next) => {
  if (!isStrategyConfigured('github')) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=github_not_configured`);
  }
  passport.authenticate('github', { failureRedirect: '/login' })(req, res, next);
}, async (req, res) => {
    try {
      const user = req.user;
      
      // Atualizar last_login do usuário
      await user.update({ last_login: new Date() });
      
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      
      const userParam = encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture
      }));
      
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/callback?token=${token}&refreshToken=${refreshToken}&user=${userParam}`);
    } catch (error) {
      console.error('Erro no callback do GitHub:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=${encodeURIComponent('Erro na autenticação')}`);
    }
  }
);

// POST /api/auth/social - Autenticação social genérica
router.post('/social',
  asyncHandler(async (req, res) => {
    const { provider, email, firstName, lastName, avatar } = req.body;
    
    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Dados incompletos',
        message: 'Email, nome e sobrenome são obrigatórios'
      });
    }
    
    try {
      // Verificar se usuário já existe
      let user = await User.findByEmail(email.toLowerCase());
      
      if (!user) {
        // Criar novo usuário
        user = await User.create({
          email: email.toLowerCase(),
          firstName,
          lastName,
          password: `social_auth_${provider}_` + Math.random().toString(36),
          isVerified: true
        });
        
        console.log(`✅ Novo usuário criado via ${provider}: ${user.email}`);
      } else {
        console.log(`✅ Login via ${provider}: ${user.email}`);
      }
      
      const token = generateToken(user.id);
      const refreshToken = generateRefreshToken(user.id);
      
      res.json({
        message: 'Autenticação realizada com sucesso',
        user: user.toJSON(),
        token,
        refreshToken
      });
    } catch (error) {
      console.error(`Erro na autenticação ${provider}:`, error);
      res.status(500).json({
        error: 'Erro interno',
        message: 'Erro ao processar autenticação social'
      });
    }
  })
);

module.exports = router;