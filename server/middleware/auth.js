const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler } = require('./errorHandler');

// Middleware para verificar token JWT
const authenticateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Token não fornecido',
      message: 'Token de acesso é obrigatório'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuário no banco de dados
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        error: 'Usuário não encontrado',
        message: 'Token inválido - usuário não existe'
      });
    }

    // Adicionar usuário ao request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'Token de acesso expirado, faça login novamente'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Token de acesso inválido'
      });
    }

    throw error;
  }
});

// Middleware opcional - não falha se não houver token
const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    req.user = user;
  } catch (error) {
    req.user = null;
  }

  next();
});

// Middleware para verificar se usuário está verificado
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Não autenticado',
      message: 'Usuário não autenticado'
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      error: 'Email não verificado',
      message: 'Verifique seu email antes de continuar'
    });
  }

  next();
};

// Função para gerar token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'linguanova-api',
      audience: 'linguanova-app'
    }
  );
};

// Função para gerar refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { 
      expiresIn: '30d',
      issuer: 'linguanova-api',
      audience: 'linguanova-app'
    }
  );
};

// Middleware para verificar refresh token
const verifyRefreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      error: 'Refresh token não fornecido',
      message: 'Refresh token é obrigatório'
    });
  }

  try {
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );
    
    if (decoded.type !== 'refresh') {
      throw new Error('Token inválido');
    }

    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        error: 'Usuário não encontrado',
        message: 'Refresh token inválido'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Refresh token inválido',
      message: 'Refresh token inválido ou expirado'
    });
  }
});

module.exports = {
  authenticateToken,
  optionalAuth,
  requireVerified,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};