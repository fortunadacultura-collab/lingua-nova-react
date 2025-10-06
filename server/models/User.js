const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const crypto = require('crypto');

class User {
  constructor(userData) {
    this.id = userData.id;
    this.email = userData.email;
    this.firstName = userData.first_name;
    this.lastName = userData.last_name;
    this.isVerified = userData.is_verified;
    this.createdAt = userData.created_at;
    this.updatedAt = userData.updated_at;
    this.googleId = userData.google_id;
    this.facebookId = userData.facebook_id;
    this.githubId = userData.github_id;
    this.profilePicture = userData.avatar_url;
    this.isAdmin = userData.is_admin;
    this.accessLevel = userData.access_level || 'user';
    this.lastLogin = userData.last_login || null;
    this.deletedAt = userData.deleted_at;
    this.deletedBy = userData.deleted_by;
  }

  // Criar novo usuário
  static async create({ email, password, firstName, lastName }) {
    try {
      // Verificar se o email já existe
      const existingUser = await this.findByEmail(email);
      if (existingUser) {
        throw new Error('Email já está em uso');
      }

      // Hash da senha
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Gerar token de verificação
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      const result = await query(
        `INSERT INTO users (email, password, first_name, last_name, verification_token) 
         VALUES (?, ?, ?, ?, ?)`,
        [email, hashedPassword, firstName, lastName, verificationToken]
      );

      // Buscar o usuário criado
      const createdUser = await this.findByEmail(email);

      return createdUser;
    } catch (error) {
      console.error('Erro ao criar usuário:', error.message);
      throw error;
    }
  }

  // Criar usuário via autenticação social
  static async createSocialUser({ email, firstName, lastName, googleId, facebookId, githubId, profilePicture, isEmailVerified = false }) {
    try {
      // Inserir usuário no SQLite
      const insertResult = await query(
        `INSERT INTO users (email, password, first_name, last_name, google_id, facebook_id, github_id, avatar_url, is_verified) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, 'oauth_user', firstName, lastName, googleId, facebookId, githubId, profilePicture, isEmailVerified ? 1 : 0]
      );

      // Para SQLite, insertResult pode ter lastID ou insertId
      // Para PostgreSQL, insertResult pode ter insertId
      const userId = insertResult.lastID || insertResult.insertId;
      
      if (!userId) {
        throw new Error('Falha ao obter ID do usuário inserido');
      }
      
      const userResult = await query(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );

      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(userResult) ? userResult : userResult.rows;
      
      if (!rows || rows.length === 0) {
        throw new Error('Usuário não encontrado após inserção');
      }

      const user = new User(rows[0]);
      return user;
    } catch (error) {
      console.error('Erro ao criar usuário social:', error.message);
      throw error;
    }
  }

  // Buscar usuário por email
  static async findByEmail(email) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      
      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(result) ? result : result.rows;
      return rows && rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('Erro ao buscar usuário por email:', error.message);
      throw error;
    }
  }

  // Buscar usuário por ID
  static async findById(id) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      
      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(result) ? result : result.rows;
      return rows && rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('Erro ao buscar usuário por ID:', error.message);
      throw error;
    }
  }

  // Buscar usuário por Google ID
  static async findByGoogleId(googleId) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE google_id = $1',
        [googleId]
      );
      
      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(result) ? result : result.rows;
      return rows && rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('Erro ao buscar usuário por Google ID:', error.message);
      throw error;
    }
  }

  // Buscar usuário por Facebook ID
  static async findByFacebookId(facebookId) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE facebook_id = $1',
        [facebookId]
      );
      
      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(result) ? result : result.rows;
      return rows && rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('Erro ao buscar usuário por Facebook ID:', error.message);
      throw error;
    }
  }

  // Buscar usuário por GitHub ID
  static async findByGithubId(githubId) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE github_id = $1',
        [githubId]
      );
      
      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(result) ? result : result.rows;
      return rows && rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('Erro ao buscar usuário por GitHub ID:', error.message);
      throw error;
    }
  }

  // Verificar senha
  static async verifyPassword(email, password) {
    try {
      const result = await query(
        'SELECT id, email, password, first_name, last_name, is_verified, created_at, updated_at FROM users WHERE email = ?',
        [email]
      );

      // Verificar se result é um array (SQLite) ou tem propriedade rows (PostgreSQL)
      const rows = Array.isArray(result) ? result : result.rows;
      
      if (rows.length === 0) {
        return null;
      }

      const userData = rows[0];
      const isValidPassword = await bcrypt.compare(password, userData.password);
      
      if (!isValidPassword) {
        return null;
      }

      // Remover senha do objeto retornado
      delete userData.password;
      return new User(userData);
    } catch (error) {
      console.error('Erro ao verificar senha:', error.message);
      throw error;
    }
  }

  // Atualizar usuário
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      // Construir query dinamicamente
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updateData[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('Nenhum campo para atualizar');
      }

      // Adicionar updated_at
      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(this.id);

      const result = await query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      // Para SQLite, precisamos buscar o registro atualizado separadamente
      const updatedUser = await query(
        'SELECT id, email, first_name, last_name, is_verified, created_at, updated_at, avatar_url FROM users WHERE id = ?',
        [this.id]
      );

      if (updatedUser.rows && updatedUser.rows.length > 0) {
        Object.assign(this, updatedUser.rows[0]);
      }

      return this;
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error.message);
      throw error;
    }
  }

  // Verificar email
  async verifyEmail() {
    try {
      await query(
        'UPDATE users SET is_verified = true, verification_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [this.id]
      );
      this.isVerified = true;
      return this;
    } catch (error) {
      console.error('Erro ao verificar email:', error.message);
      throw error;
    }
  }

  // Gerar token de reset de senha
  async generatePasswordResetToken() {
    try {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hora

      await query(
        'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
        [resetToken, resetExpires, this.id]
      );

      return resetToken;
    } catch (error) {
      console.error('Erro ao gerar token de reset:', error.message);
      throw error;
    }
  }

  // Resetar senha
  static async resetPassword(token, newPassword) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
        [token]
      );

      if (result.rows.length === 0) {
        throw new Error('Token inválido ou expirado');
      }

      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      await query(
        'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
        [hashedPassword, result.rows[0].id]
      );

      return new User(result.rows[0]);
    } catch (error) {
      console.error('Erro ao resetar senha:', error.message);
      throw error;
    }
  }

  // Soft delete do usuário (apenas para super admin)
  async softDelete(deletedBy = 'system') {
    try {
      const deletedAt = new Date().toISOString();
      await query(
        'UPDATE users SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [deletedAt, deletedBy, deletedAt, this.id]
      );
      
      this.deletedAt = deletedAt;
      this.deletedBy = deletedBy;
      
      console.log(`✅ Usuário ${this.email} foi marcado como deletado por ${deletedBy}`);
      return true;
    } catch (error) {
      console.error('Erro ao fazer soft delete do usuário:', error.message);
      throw error;
    }
  }

  // Restaurar usuário deletado (apenas para super admin)
  async restore() {
    try {
      await query(
        'UPDATE users SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?',
        [new Date().toISOString(), this.id]
      );
      
      this.deletedAt = null;
      this.deletedBy = null;
      
      console.log(`✅ Usuário ${this.email} foi restaurado`);
      return true;
    } catch (error) {
      console.error('Erro ao restaurar usuário:', error.message);
      throw error;
    }
  }

  // Hard delete (apenas para casos extremos - manter o método original)
  async delete() {
    try {
      await query('DELETE FROM users WHERE id = ?', [this.id]);
      console.log(`⚠️ HARD DELETE: Usuário ${this.email} foi permanentemente removido`);
      return true;
    } catch (error) {
      console.error('Erro ao deletar usuário permanentemente:', error.message);
      throw error;
    }
  }

  // Promover usuário a administrador
  static async promoteToAdmin(userId) {
    try {
      const result = await query(
        'UPDATE users SET is_admin = true, access_level = \'admin\', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      return new User(result.rows[0]);
    } catch (error) {
      console.error('Erro ao promover usuário a admin:', error.message);
      throw error;
    }
  }

  // Remover privilégios de administrador
  static async demoteFromAdmin(userId) {
    try {
      const result = await query(
        'UPDATE users SET is_admin = false, access_level = \'user\', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      return new User(result.rows[0]);
    } catch (error) {
      console.error('Erro ao remover privilégios de admin:', error.message);
      throw error;
    }
  }

  // Alterar nível de acesso do usuário
  static async changeAccessLevel(userId, accessLevel) {
    try {
      const validLevels = ['user', 'moderator', 'admin', 'super_admin', 'FREE', 'BASIC', 'PREMIUM', 'PRO'];
      if (!validLevels.includes(accessLevel)) {
        throw new Error('Nível de acesso inválido');
      }

      // Atualizar is_admin baseado no access_level
      const isAdmin = ['admin', 'super_admin'].includes(accessLevel);

      const result = await query(
        'UPDATE users SET access_level = $1, is_admin = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [accessLevel, isAdmin, userId]
      );

      if (result.changes === 0) {
        throw new Error('Usuário não encontrado');
      }

      // Buscar o usuário atualizado
      const updatedUser = await this.findById(userId);
      return updatedUser;
    } catch (error) {
      console.error('Erro ao alterar nível de acesso:', error.message);
      throw error;
    }
  }

  // Verificar se o usuário tem permissão para uma ação específica
  hasPermission(requiredLevel) {
    const levels = {
      'user': 1,
      'moderator': 2,
      'admin': 3,
      'super_admin': 4
    };

    const userLevel = levels[this.accessLevel] || 1;
    const required = levels[requiredLevel] || 1;

    return userLevel >= required;
  }

  // Verificar se é moderador ou superior
  isModerator() {
    return this.hasPermission('moderator');
  }

  // Verificar se é super admin
  isSuperAdmin() {
    return this.accessLevel === 'super_admin';
  }

  // Converter para JSON (remover dados sensíveis)
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      isVerified: this.isVerified,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      googleId: this.googleId,
      facebookId: this.facebookId,
      githubId: this.githubId,
      profilePicture: this.profilePicture,
      isAdmin: this.isAdmin,
      accessLevel: this.accessLevel
    };
  }

  // Métodos para admin
  static async findAllWithPagination({ search = '', sortBy = 'created_at', sortOrder = 'desc', limit = 50, offset = 0 }) {
    try {
      let whereClause = '';
      let params = [];
      
      if (search) {
        whereClause = 'WHERE email LIKE ? OR first_name LIKE ? OR last_name LIKE ?';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      
      const validSortColumns = ['created_at', 'email', 'first_name', 'last_name', 'is_verified'];
      const validSortOrders = ['asc', 'desc'];
      
      if (!validSortColumns.includes(sortBy)) {
        sortBy = 'created_at';
      }
      
      if (!validSortOrders.includes(sortOrder.toLowerCase())) {
        sortOrder = 'desc';
      }
      
      const orderByClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      const limitOffset = 'LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const result = await query(
        `SELECT id, email, first_name, last_name, is_verified, created_at, updated_at, 
                google_id, facebook_id, github_id, avatar_url, 
                access_level, deleted_at, deleted_by, last_login 
         FROM users ${whereClause ? whereClause + ' AND' : 'WHERE'} deleted_at IS NULL ${orderByClause} ${limitOffset}`,
        params
      );
      
      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(result) ? result : result.rows;
      return rows.map(row => new User(row));
    } catch (error) {
      console.error('Erro ao buscar usuários com paginação:', error.message);
      throw error;
    }
  }

  static async countAll(search = '') {
    try {
      let whereClause = '';
      let params = [];
      
      if (search) {
        whereClause = 'WHERE email LIKE ? OR first_name LIKE ? OR last_name LIKE ?';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      
      const result = await query(
        `SELECT COUNT(*) as count FROM users ${whereClause}`,
        params
      );
      
      // Para SQLite, result é um array diretamente
      // Para PostgreSQL, result.rows é o array
      const rows = Array.isArray(result) ? result : result.rows;
      return parseInt(rows[0].count);
    } catch (error) {
      console.error('Erro ao contar usuários:', error.message);
      throw error;
    }
  }

  static async countActive() {
    try {
      // Usuários que fizeram login nos últimos 30 dias
      const result = await query(
        `SELECT COUNT(*) as count FROM users 
         WHERE updated_at >= NOW() - INTERVAL '30 days'`
      );
      
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Erro ao contar usuários ativos:', error.message);
      throw error;
    }
  }

  static async countNewThisMonth() {
    try {
      const result = await query(
        `SELECT COUNT(*) as count FROM users 
         WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`
      );
      
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Erro ao contar novos usuários:', error.message);
      throw error;
    }
  }

  static async countVerified() {
    try {
      const result = await query(
        `SELECT COUNT(*) as count FROM users WHERE is_verified = 1 AND deleted_at IS NULL`
      );
      
      return result.rows[0].count;
    } catch (error) {
      console.error('Erro ao contar usuários verificados:', error.message);
      throw error;
    }
  }

  // Buscar usuários deletados (apenas para super admin)
  static async findDeletedUsers({ limit = 50, offset = 0 }) {
    try {
      const result = await query(
        `SELECT id, email, first_name, last_name, deleted_at, deleted_by, access_level
         FROM users WHERE deleted_at IS NOT NULL 
         ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      
      return result.rows.map(row => new User(row));
    } catch (error) {
      console.error('Erro ao buscar usuários deletados:', error.message);
      throw error;
    }
  }

  // Buscar usuário por ID incluindo deletados
  static async findByIdIncludingDeleted(id) {
    try {
      const result = await query(
        `SELECT * FROM users WHERE id = ?`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new User(result.rows[0]);
    } catch (error) {
      console.error('Erro ao buscar usuário por ID (incluindo deletados):', error.message);
      throw error;
    }
  }
}

module.exports = User;