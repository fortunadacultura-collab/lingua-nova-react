// Middleware de tratamento de erros
const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId;
  const timestamp = new Date().toISOString();
  console.error('🚨 Erro capturado:', {
    requestId,
    timestamp,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Erro de validação do Joi
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Dados inválidos',
      code: 'VALIDATION_ERROR',
      requestId,
      timestamp,
      details: err.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }

  // Erro de duplicação (PostgreSQL)
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Recurso já existe',
      code: 'UNIQUE_VIOLATION',
      requestId,
      timestamp,
      message: 'Este email já está cadastrado'
    });
  }

  // Erro de violação de constraint
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Referência inválida',
      code: 'FOREIGN_KEY_VIOLATION',
      requestId,
      timestamp,
      message: 'Dados relacionados não encontrados'
    });
  }

  // Erro de conexão com banco
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      error: 'Serviço indisponível',
      code: 'DB_CONNECTION_ERROR',
      requestId,
      timestamp,
      message: 'Erro de conexão com o banco de dados'
    });
  }

  // Erro de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido',
      code: 'JWT_INVALID',
      requestId,
      timestamp,
      message: 'Token de autenticação inválido'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado',
      code: 'JWT_EXPIRED',
      requestId,
      timestamp,
      message: 'Token de autenticação expirado'
    });
  }

  // Erro de sintaxe JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'JSON inválido',
      code: 'JSON_PARSE_ERROR',
      requestId,
      timestamp,
      message: 'Formato de dados inválido'
    });
  }

  // Erro personalizado com status
  if (err.status) {
    return res.status(err.status).json({
      error: err.message || 'Erro do servidor',
      code: err.code || 'ERROR',
      requestId,
      timestamp,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Erro genérico do servidor
  res.status(500).json({
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
    requestId,
    timestamp,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Middleware para capturar erros assíncronos
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Middleware para rotas não encontradas
const notFound = (req, res, next) => {
  const error = new Error(`Rota não encontrada - ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFound
};