const Joi = require('joi');

// Schema para registro de usuário
const registerSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Email deve ter um formato válido',
      'any.required': 'Email é obrigatório'
    }),
  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Senha deve ter pelo menos 8 caracteres',
      'string.pattern.base': 'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial',
      'any.required': 'Senha é obrigatória'
    }),
  firstName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-ZÀ-ÿ\s]+$/)
    .required()
    .messages({
      'string.min': 'Nome deve ter pelo menos 2 caracteres',
      'string.max': 'Nome deve ter no máximo 50 caracteres',
      'string.pattern.base': 'Nome deve conter apenas letras e espaços',
      'any.required': 'Nome é obrigatório'
    }),
  lastName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-ZÀ-ÿ\s]+$/)
    .required()
    .messages({
      'string.min': 'Sobrenome deve ter pelo menos 2 caracteres',
      'string.max': 'Sobrenome deve ter no máximo 50 caracteres',
      'string.pattern.base': 'Sobrenome deve conter apenas letras e espaços',
      'any.required': 'Sobrenome é obrigatório'
    }),
  acceptTerms: Joi.boolean()
    .valid(true)
    .required()
    .messages({
      'any.only': 'Você deve aceitar os termos de uso',
      'any.required': 'Aceitação dos termos é obrigatória'
    })
});

// Schema para login
const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Email deve ter um formato válido',
      'any.required': 'Email é obrigatório'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Senha é obrigatória'
    }),
  rememberMe: Joi.boolean().optional()
});

// Schema para reset de senha
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Email deve ter um formato válido',
      'any.required': 'Email é obrigatório'
    })
});

// Schema para nova senha
const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Token é obrigatório'
    }),
  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Senha deve ter pelo menos 8 caracteres',
      'string.pattern.base': 'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial',
      'any.required': 'Senha é obrigatória'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Confirmação de senha deve ser igual à senha',
      'any.required': 'Confirmação de senha é obrigatória'
    })
});

// Schema para atualização de perfil
const updateProfileSchema = Joi.object({
  firstName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-ZÀ-ÿ\s]+$/)
    .optional()
    .messages({
      'string.min': 'Nome deve ter pelo menos 2 caracteres',
      'string.max': 'Nome deve ter no máximo 50 caracteres',
      'string.pattern.base': 'Nome deve conter apenas letras e espaços'
    }),
  lastName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-ZÀ-ÿ\s]+$/)
    .optional()
    .messages({
      'string.min': 'Sobrenome deve ter pelo menos 2 caracteres',
      'string.max': 'Sobrenome deve ter no máximo 50 caracteres',
      'string.pattern.base': 'Sobrenome deve conter apenas letras e espaços'
    }),
  bio: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Bio deve ter no máximo 500 caracteres'
    }),
  languageLevel: Joi.string()
    .valid('beginner', 'intermediate', 'advanced', 'native')
    .optional()
    .messages({
      'any.only': 'Nível de idioma deve ser: beginner, intermediate, advanced ou native'
    }),
  preferredLanguage: Joi.string()
    .valid('en', 'pt', 'es', 'fr', 'de', 'it')
    .optional()
    .messages({
      'any.only': 'Idioma preferido deve ser: en, pt, es, fr, de ou it'
    })
});

// Middleware de validação genérico
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Retorna todos os erros
      stripUnknown: true // Remove campos não definidos no schema
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'Por favor, corrija os erros nos campos indicados',
        details: errorDetails
      });
    }

    // Substituir req.body pelos dados validados e limpos
    req.body = value;
    next();
  };
};

// Middleware para sanitizar dados de entrada
const sanitize = (req, res, next) => {
  // Remover espaços em branco no início e fim de strings
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  next();
};

module.exports = {
  validate,
  sanitize,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema
};