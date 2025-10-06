const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// ========= APKG (Anki) upload =========
// Armazenar .apkg sob /uploads/apkg/<userId>/<basename>/
const apkgStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Sanitizar nome base do arquivo (sem extensão)
    const baseName = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80) || 'apkg';
    const dir = path.join(__dirname, '../uploads/apkg', String(req.user?.id || 'unknown'), baseName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `${ts}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const apkgUpload = multer({
  storage: apkgStorage,
  limits: {
    // Aumentar limite para suportar APKGs muito grandes (até ~8GB)
    fileSize: 8 * 1024 * 1024 * 1024,
    files: 1
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const allowed = ext === '.apkg' || mime === 'application/zip' || mime === 'application/octet-stream';
    if (!allowed) return cb(new Error('Apenas arquivos .apkg (zip) são permitidos'));
    cb(null, true);
  }
});

// POST /upload/apkg - Upload de arquivo .apkg autenticado
router.post('/apkg',
  authenticateToken,
  (req, res, next) => {
    apkgUpload.single('apkg')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: 'Erro no upload',
          code: 'UPLOAD_ERROR',
          requestId: req.requestId,
          message: err.message
        });
      } else if (err) {
        return res.status(400).json({
          error: 'Formato inválido',
          code: 'UPLOAD_INVALID_FORMAT',
          requestId: req.requestId,
          message: err.message
        });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({
      error: 'Arquivo .apkg não fornecido',
      code: 'UPLOAD_MISSING_FILE',
      requestId: req.requestId
    });
    const userId = req.user.id;
    const fullPath = req.file.path;
    const relPath = `/uploads/apkg/${userId}/${path.basename(path.dirname(fullPath))}/${path.basename(fullPath)}`;
    const baseDir = path.dirname(fullPath);
    res.status(201).json({
      message: 'Upload APKG realizado com sucesso',
      requestId: req.requestId,
      apkg: {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: relPath,
        baseDir: `/uploads/apkg/${userId}/${path.basename(baseDir)}`
      }
    });
  })
);

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
    // Verificar se é uma imagem (incluindo SVG para teste)
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    
    console.log('🔍 Verificando tipo de arquivo:', file.mimetype);
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Apenas arquivos de imagem são permitidos. Recebido: ${file.mimetype}`), false);
    }
  }
});

// POST /upload/simple - Rota super simples sem middleware
router.post('/simple', (req, res) => {
  console.log('🔥 === TESTE SUPER SIMPLES ===');
  console.log('Chegou na rota /simple');
  res.json({ success: true, message: 'Rota funcionando!' });
});

// Configuração de multer para teste (sem autenticação)
const testStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/test');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `test-avatar-${uniqueSuffix}${extension}`);
  }
});

const testUpload = multer({
  storage: testStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: function (req, file, cb) {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    console.log('🔍 Verificando tipo de arquivo:', file.mimetype);
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Apenas arquivos de imagem são permitidos. Recebido: ${file.mimetype}`), false);
    }
  }
});

// POST /upload/test - Rota de teste sem autenticação
router.post('/test', (req, res) => {
  console.log('🧪 === TESTE DE UPLOAD SEM AUTENTICAÇÃO ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Content-Type:', req.get('Content-Type'));
  console.log('Content-Length:', req.get('Content-Length'));
  
  const uploadSingle = testUpload.single('avatar');
  uploadSingle(req, res, (err) => {
    if (err) {
      console.error('❌ Erro no upload de teste:', err);
      return res.status(400).json({ 
        error: 'Upload failed', 
        message: err.message,
        details: err.stack 
      });
    }
    
    console.log('✅ Upload de teste bem-sucedido!');
    console.log('File info:', req.file);
    
    res.json({ 
      success: true, 
      message: 'Upload realizado com sucesso',
      file: req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      } : null
    });
  });
});

// POST /upload/avatar-test - Teste da rota avatar sem autenticação
router.post('/avatar-test', (req, res, next) => {
  console.log('🧪 === TESTE ROTA AVATAR SEM AUTH ===');
  console.log('Headers:', req.headers);
  console.log('Content-Type:', req.get('Content-Type'));
  
  // Simular usuário para teste
  req.user = { id: 'test-user-123' };
  
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
    
    console.log('✅ Upload avatar-test bem-sucedido!');
    console.log('File info:', req.file);
    console.log('🔧 Teste sem atualização do banco (apenas upload de arquivo)');
    
    res.json({ 
      success: true, 
      message: 'Upload de avatar realizado com sucesso (teste - apenas arquivo)',
      file: req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path
      } : null
    });
  });
});

// POST /upload/avatar - Upload de avatar
router.post('/avatar',
  authenticateToken,
  (req, res, next) => {
    console.log('🔐 Upload com autenticação');
    console.log('Headers:', req.headers);
    console.log('Content-Type:', req.get('Content-Type'));
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
      await user.update({ avatar_url: avatarUrl });

      console.log(`✅ Avatar atualizado com sucesso: ${user.email} -> ${avatarUrl}`);

      res.json({
        message: 'Avatar atualizado com sucesso',
        user: {
          id: user.id,
          name: user.firstName + ' ' + user.lastName,
          email: user.email,
          profilePicture: user.profilePicture || avatarUrl,
          isEmailVerified: user.isVerified,
          createdAt: user.createdAt
        },
        avatarUrl: avatarUrl
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

// ============================
// Upload de mídia de Cards
// ============================

// Storage para mídia de cards (áudio/vídeo)
const cardMediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.user?.id || 'anonymous';
    const uploadDir = path.join(__dirname, `../uploads/cards/${userId}`);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `card-${req.user?.id || 'anon'}-${uniqueSuffix}${extension}`);
  }
});

const allowedCardMimes = [
  // Áudio
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
  // Vídeo
  'video/mp4', 'video/webm', 'video/ogg'
];

const uploadCardMedia = multer({
  storage: cardMediaStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // até 50MB para vídeos
    files: 1
  },
  fileFilter: function (req, file, cb) {
    if (allowedCardMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Formato inválido. Áudio/Vídeo suportados. Recebido: ${file.mimetype}`), false);
    }
  }
});

// POST /upload/card-media - Upload de áudio/vídeo para cards
router.post('/card-media',
  authenticateToken,
  (req, res, next) => {
    uploadCardMedia.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'Arquivo muito grande',
            message: 'O arquivo deve ter no máximo 50MB'
          });
        }
        return res.status(400).json({ error: 'Erro no upload', message: err.message });
      } else if (err) {
        return res.status(400).json({ error: 'Formato inválido', message: err.message });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não fornecido' });
    }

    const userId = req.user.id;
    const relativeDir = `/uploads/cards/${userId}`;
    const url = `${relativeDir}/${req.file.filename}`;

    res.json({
      message: 'Upload de mídia realizado com sucesso',
      file: {
        url,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  })
);

module.exports = router;
