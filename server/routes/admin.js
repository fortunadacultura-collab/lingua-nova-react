const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { adminRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Função helper para async/await
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware para verificar se é admin
const authenticateAdmin = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar se é o usuário admin específico
    if (decoded.username !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido' });
  }
});

// POST /api/admin/login - Login do admin
router.post('/login',
  adminRateLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Verificar credenciais hardcoded
    if (username !== 'admin' || password !== 'apav1975') {
      console.log(`❌ Tentativa de login admin falhada: ${username}`);
      return res.status(401).json({ 
        error: 'Credenciais inválidas' 
      });
    }

    // Gerar token JWT para admin
    const token = jwt.sign(
      { 
        username: 'admin',
        role: 'admin',
        isAdmin: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // Token expira em 8 horas
    );

    console.log(`✅ Login admin realizado com sucesso`);

    res.json({
      message: 'Login realizado com sucesso',
      token,
      admin: {
        username: 'admin',
        role: 'admin'
      }
    });
  })
);

// POST /api/admin/logout - Logout do admin
router.post('/logout',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    // Em uma implementação real, você adicionaria o token a uma blacklist
    console.log(`✅ Logout admin realizado`);
    
    res.json({
      message: 'Logout realizado com sucesso'
    });
  })
);

// GET /api/admin/verify - Verificar se o token admin é válido
router.get('/verify',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    res.json({
      valid: true,
      admin: {
        username: 'admin',
        role: 'admin'
      }
    });
  })
);

// GET /api/admin/users - Listar todos os usuários
router.get('/users',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, search = '', sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    
    try {
      const offset = (page - 1) * limit;
      const users = await User.findAllWithPagination({
        search,
        sortBy,
        sortOrder,
        limit: parseInt(limit),
        offset
      });

      const totalUsers = await User.countAll(search);
      const totalPages = Math.ceil(totalUsers / limit);

      // Remover senhas dos dados retornados
      const sanitizedUsers = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      console.log(`📊 Admin consultou ${sanitizedUsers.length} usuários`);

      res.json({
        success: true,
        users: sanitizedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// GET /api/admin/stats - Estatísticas do sistema
router.get('/stats',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    try {
      const totalUsers = await User.countAll();
      const activeUsers = await User.countActive(); // Usuários que fizeram login nos últimos 30 dias
      const newUsersThisMonth = await User.countNewThisMonth();
      const verifiedUsers = await User.countVerified();

      const stats = {
        totalUsers,
        activeUsers,
        newUsersThisMonth,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers
      };

      console.log(`📊 Admin consultou estatísticas do sistema`);

      res.json(stats);
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// POST /api/admin/reset-password - Reset de senha via email
router.post('/reset-password',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Verificar se o email é o autorizado
    if (email !== 'fortunadacultura@gmail.com') {
      return res.status(400).json({ 
        error: 'Email não autorizado para reset de senha admin' 
      });
    }

    try {
      // Em uma implementação real, você enviaria um email com link de reset
      // Por enquanto, vamos apenas simular o processo
      
      console.log(`📧 Solicitação de reset de senha admin para: ${email}`);
      
      // Simular envio de email (aqui você integraria com um serviço de email)
      const resetToken = jwt.sign(
        { email, type: 'admin_reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Em produção, você salvaria este token no banco e enviaria por email
      console.log(`🔑 Token de reset gerado: ${resetToken}`);

      res.json({
        message: 'Instruções de reset de senha foram enviadas para o email especificado',
        // Em produção, NÃO retorne o token na resposta
        resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
      });
    } catch (error) {
      console.error('Erro ao processar reset de senha:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// GET /api/admin/user/:id - Obter detalhes de um usuário específico
router.get('/user/:id',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Remover senha dos dados retornados
      const { password, ...userWithoutPassword } = user;

      console.log(`👤 Admin consultou detalhes do usuário: ${user.email}`);

      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// POST /api/admin/promote-user - Promover usuário a administrador
router.post('/promote-user',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário é obrigatório' });
    }

    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Verificar se o usuário já é admin
      if (user.isAdmin) {
        return res.status(400).json({ error: 'Usuário já é administrador' });
      }

      // Promover usuário a admin
      const updatedUser = await User.promoteToAdmin(userId);
      
      console.log(`✅ Usuário ${user.email} promovido a administrador pelo admin`);
      
      res.json({
        message: 'Usuário promovido a administrador com sucesso',
        user: updatedUser.toJSON()
      });
    } catch (error) {
      console.error('❌ Erro ao promover usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// POST /api/admin/demote-user - Remover privilégios de administrador
router.post('/demote-user',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário é obrigatório' });
    }

    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Verificar se o usuário é admin
      if (!user.isAdmin) {
        return res.status(400).json({ error: 'Usuário não é administrador' });
      }

      // Remover privilégios de admin
      const updatedUser = await User.demoteFromAdmin(userId);
      
      console.log(`✅ Privilégios de admin removidos do usuário ${user.email}`);
      
      res.json({
        message: 'Privilégios de administrador removidos com sucesso',
        user: updatedUser.toJSON()
      });
    } catch (error) {
      console.error('❌ Erro ao remover privilégios de admin:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// POST /api/admin/change-access-level - Alterar nível de acesso do usuário
router.post('/change-access-level',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { userId, accessLevel } = req.body;

    if (!userId || !accessLevel) {
      return res.status(400).json({ error: 'ID do usuário e nível de acesso são obrigatórios' });
    }

    const validLevels = ['user', 'moderator', 'admin', 'super_admin', 'FREE', 'BASIC', 'PREMIUM', 'PRO'];
    if (!validLevels.includes(accessLevel)) {
      return res.status(400).json({ 
        error: 'Nível de acesso inválido',
        validLevels: validLevels
      });
    }

    try {
      // Verificar se o usuário existe
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Alterar nível de acesso
      const updatedUser = await User.changeAccessLevel(userId, accessLevel);

      console.log(`✅ Nível de acesso do usuário ${user.email} alterado para ${accessLevel}`);

      res.json({
        message: `Nível de acesso alterado para ${accessLevel} com sucesso`,
        user: updatedUser.toJSON()
      });
    } catch (error) {
      console.error('❌ Erro ao alterar nível de acesso:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// GET /api/admin/access-levels - Listar níveis de acesso disponíveis
router.get('/access-levels',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    try {
      const accessLevels = [
        // Níveis Administrativos
        {
          value: 'user',
          label: 'Usuário',
          description: 'Acesso básico à plataforma',
          color: '#28a745',
          category: 'admin'
        },
        {
          value: 'moderator', 
          label: 'Moderador',
          description: 'Pode moderar conteúdo e usuários',
          color: '#ffc107',
          category: 'admin'
        },
        {
          value: 'admin',
          label: 'Administrador', 
          description: 'Acesso completo ao sistema',
          color: '#dc3545',
          category: 'admin'
        },
        {
          value: 'super_admin',
          label: 'Super Administrador', 
          description: 'Acesso total ao sistema',
          color: '#6f42c1',
          category: 'admin'
        },
        // Níveis de Assinatura
        {
          value: 'FREE',
          label: 'Gratuito',
          description: 'Perfeito para começar sua jornada de aprendizado',
          color: '#6c757d',
          category: 'subscription'
        },
        {
          value: 'BASIC',
          label: 'Básico',
          description: 'Ideal para estudantes regulares',
          color: '#17a2b8',
          category: 'subscription'
        },
        {
          value: 'PREMIUM',
          label: 'Premium',
          description: 'Para estudantes sérios e dedicados',
          color: '#fd7e14',
          category: 'subscription'
        },
        {
          value: 'PRO',
          label: 'Profissional',
          description: 'Para educadores e uso comercial',
          color: '#e83e8c',
          category: 'subscription'
        }
      ];

      res.json({ success: true, accessLevels });
    } catch (error) {
      console.error('❌ Erro ao buscar níveis de acesso:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// POST /api/admin/delete-user - Soft delete de usuário (apenas super admin)
router.post('/delete-user',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    try {
      const { userId, reason } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'ID do usuário é obrigatório' });
      }

      // Buscar usuário
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Verificar se o usuário já foi deletado
      if (user.deletedAt) {
        return res.status(400).json({ error: 'Usuário já foi deletado' });
      }

      // Impedir auto-exclusão (proteção adicional)
      if (user.email === 'admin@linguanova.com') {
        return res.status(403).json({ error: 'Não é possível deletar a conta principal do sistema' });
      }

      // Fazer soft delete
      const deletedBy = `admin (${req.admin.username})`;
      await user.softDelete(deletedBy);

      // Log de auditoria
      console.log(`🗑️ ADMIN ACTION: Usuário ${user.email} foi deletado por ${deletedBy}. Motivo: ${reason || 'Não informado'}`);

      res.json({ 
        success: true, 
        message: 'Usuário deletado com sucesso',
        deletedUser: {
          id: user.id,
          email: user.email,
          deletedAt: user.deletedAt,
          deletedBy: user.deletedBy
        }
      });
    } catch (error) {
      console.error('❌ Erro ao deletar usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// POST /api/admin/restore-user - Restaurar usuário deletado
router.post('/restore-user',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'ID do usuário é obrigatório' });
      }

      // Buscar usuário incluindo deletados
      const user = await User.findByIdIncludingDeleted(userId);
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Verificar se o usuário está deletado
      if (!user.deletedAt) {
        return res.status(400).json({ error: 'Usuário não está deletado' });
      }

      // Restaurar usuário
      await user.restore();

      // Log de auditoria
      console.log(`♻️ ADMIN ACTION: Usuário ${user.email} foi restaurado por admin (${req.admin.username})`);

      res.json({ 
        success: true, 
        message: 'Usuário restaurado com sucesso',
        restoredUser: {
          id: user.id,
          email: user.email
        }
      });
    } catch (error) {
      console.error('❌ Erro ao restaurar usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

// GET /api/admin/deleted-users - Listar usuários deletados
router.get('/deleted-users',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const deletedUsers = await User.findDeletedUsers({ limit, offset });

      res.json({ 
        success: true, 
        users: deletedUsers.map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          accessLevel: user.accessLevel,
          deletedAt: user.deletedAt,
          deletedBy: user.deletedBy
        })),
        pagination: {
          page,
          limit,
          offset
        }
      });
    } catch (error) {
      console.error('❌ Erro ao buscar usuários deletados:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  })
);

module.exports = router;