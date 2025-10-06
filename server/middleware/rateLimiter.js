const rateLimit = require('express-rate-limit');

// Rate limiter geral
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  // Mais permissivo em desenvolvimento para evitar bloqueios durante testes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100,
  message: {
    error: 'Muitas tentativas',
    message: 'Muitas requisições deste IP, tente novamente em 15 minutos',
    retryAfter: 15 * 60
  },
  standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
  // Não contar requisições bem-sucedidas (evita bloquear navegação normal)
  skipSuccessfulRequests: true,
  // Usar o usuário autenticado como chave quando disponível, caso contrário IP
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`),
  handler: (req, res) => {
    console.warn(`🚨 Rate limit excedido para chave: ${req.user?.id || req.ip}`);
    res.status(429).json({
      error: 'Muitas tentativas',
      message: 'Muitas requisições deste IP/usuário, tente novamente em 15 minutos',
      retryAfter: 15 * 60
    });
  }
});

// Rate limiter específico para autenticação (mais restritivo)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 tentativas de login por IP por janela de tempo
  message: {
    error: 'Muitas tentativas de login',
    message: 'Muitas tentativas de login falharam, tente novamente em 15 minutos',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Não conta requests bem-sucedidos
  handler: (req, res) => {
    console.warn(`🚨 Rate limit de auth excedido para IP: ${req.ip}`);
    res.status(429).json({
      error: 'Muitas tentativas de login',
      message: 'Muitas tentativas de login falharam, tente novamente em 15 minutos',
      retryAfter: 15 * 60
    });
  }
});

// Rate limiter para registro (moderado)
const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 registros por IP por hora
  message: {
    error: 'Muitas tentativas de registro',
    message: 'Muitas tentativas de registro, tente novamente em 1 hora',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`🚨 Rate limit de registro excedido para IP: ${req.ip}`);
    res.status(429).json({
      error: 'Muitas tentativas de registro',
      message: 'Muitas tentativas de registro, tente novamente em 1 hora',
      retryAfter: 60 * 60
    });
  }
});

// Rate limiter para reset de senha
const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 tentativas de reset por IP por hora
  message: {
    error: 'Muitas tentativas de reset',
    message: 'Muitas tentativas de reset de senha, tente novamente em 1 hora',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`🚨 Rate limit de reset de senha excedido para IP: ${req.ip}`);
    res.status(429).json({
      error: 'Muitas tentativas de reset',
      message: 'Muitas tentativas de reset de senha, tente novamente em 1 hora',
      retryAfter: 60 * 60
    });
  }
});

// Rate limiter específico para admin (muito restritivo)
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 3, // máximo 3 tentativas de login admin por IP por janela de tempo
  message: {
    error: 'Muitas tentativas de login admin',
    message: 'Muitas tentativas de login admin falharam, tente novamente em 15 minutos',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    console.warn(`🚨 Rate limit de admin excedido para IP: ${req.ip}`);
    res.status(429).json({
      error: 'Muitas tentativas de login admin',
      message: 'Muitas tentativas de login admin falharam, tente novamente em 15 minutos',
      retryAfter: 15 * 60
    });
  }
});

module.exports = {
  rateLimiter,
  authRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  adminRateLimiter
};