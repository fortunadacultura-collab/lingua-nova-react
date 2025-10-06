const express = require('express');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const multer = require('multer');
const sqlite3 = require('sqlite3');
const { query } = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
// Permitir multipart/form-data com possíveis arquivos anexados por engano
const parseFormFields = multer({ storage: multer.memoryStorage() }).any();

// Normalizar códigos de idioma (ex.: pt-BR -> pt, en_US -> en)
const normalizeLangCode = (code) => {
  if (!code) return '';
  const raw = String(code).trim().toLowerCase();
  // separar por '-' ou '_' e ficar só com o prefixo
  const base = raw.split(/[-_]/)[0];
  // mapeamentos específicos se necessário no futuro
  return base;
};

// Helper: obter ID de inserção (compatível com PostgreSQL e SQLite)
const getInsertId = (result) => {
  if (Array.isArray(result)) {
    return result[0]?.id;
  }
  return result?.lastID;
};

// Helper: parse de tags compatível com Postgres (JSONB) e SQLite (string JSON)
const parseTagsCompat = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Array.isArray(val) ? val : []; // JSONB deve vir como array
  if (typeof val === 'string') {
    try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
};

// Helper: ensure deck belongs to user (para operações de escrita)
const ensureDeckOwnership = async (deckId, userId) => {
  const rows = await query('SELECT id, user_id FROM decks WHERE id = $1', [deckId]);
  const deck = rows[0];
  if (!deck) {
    const err = new Error('Deck não encontrado');
    err.status = 404;
    throw err;
  }
  if (deck.user_id === null) {
    const err = new Error('Deck padrão global não pode ser modificado pelo usuário');
    err.status = 403;
    throw err;
  }
  if (String(deck.user_id) !== String(userId)) {
    const err = new Error('Deck não pertence ao usuário');
    err.status = 403;
    throw err;
  }
  return deck;
};

// Helper: ensure deck is accessible (leitura)
const ensureDeckAccessible = async (deckId, userId) => {
  const rows = await query('SELECT id, user_id FROM decks WHERE id = $1', [deckId]);
  const deck = rows[0];
  if (!deck) {
    const err = new Error('Deck não encontrado');
    err.status = 404;
    throw err;
  }
  if (deck.user_id !== null && String(deck.user_id) !== String(userId)) {
    const err = new Error('Deck não pertence ao usuário');
    err.status = 403;
    throw err;
  }
  return deck;
};

// Auto-sincronização: criar/remover decks globais de diálogos conforme arquivos
const autoSyncGlobalDialogueDecks = async (sourceLang = 'en', defaultTargetLang = 'pt') => {
  try {
    const keys = new Set(listDialogueKeys(sourceLang));
    // Buscar decks globais existentes de diálogos
    const existing = await query('SELECT id, name, language, tags FROM decks WHERE user_id IS NULL');

    // Compat: tags podem ser JSONB (objeto/array) no Postgres ou string JSON no SQLite
    const parseTagsCompat = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'object') return Array.isArray(val) ? val : [];
      if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      }
      return [];
    };

    const dialogueDecks = existing.filter((row) => {
      const tags = parseTagsCompat(row?.tags);
      const isDialogue = Array.isArray(tags) && tags.includes('dialogue');
      const lang = (row.language || 'en').toLowerCase();
      return isDialogue && lang === sourceLang.toLowerCase();
    });

    const keyToDeck = new Map();
    for (const row of dialogueDecks) {
      const tags = parseTagsCompat(row?.tags);
      const key = tags[1];
      if (key) keyToDeck.set(key, row);
    }

    // Remover decks cujo arquivo foi apagado
    for (const [key, row] of keyToDeck.entries()) {
      if (!keys.has(key)) {
        await query('DELETE FROM cards WHERE deck_id = $1', [row.id]);
        await query('DELETE FROM decks WHERE id = $1', [row.id]);
      }
    }

    // Atualizar nomes de decks existentes conforme traduções disponíveis
    for (const [key, row] of keyToDeck.entries()) {
      const availableLangs = listAvailableLanguages(key).filter((l) => l !== sourceLang);
      const desiredSpec = availableLangs.includes(defaultTargetLang)
        ? defaultTargetLang
        : (availableLangs.length > 0 ? 'ALL' : defaultTargetLang);
      const desiredName = `${toTitle(key)} (${sourceLang} → ${desiredSpec})`;
      if (row.name !== desiredName) {
        await query('UPDATE decks SET name = $1 WHERE id = $2', [desiredName, row.id]);
      }
    }

    // Criar decks para novos arquivos
    for (const key of keys) {
      if (!keyToDeck.has(key)) {
        const availableLangs = listAvailableLanguages(key).filter((l) => l !== sourceLang);
        const targetSpec = availableLangs.includes(defaultTargetLang)
          ? defaultTargetLang
          : (availableLangs.length > 0 ? 'ALL' : defaultTargetLang);
        const deckName = `${toTitle(key)} (${sourceLang} → ${targetSpec})`;
        await query(
          'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5)',
          [
            null,
            deckName,
            `Deck padrão importado do diálogo ${key}`,
            sourceLang,
            JSON.stringify(['dialogue', key, 'global'])
          ]
        );
      }
    }
  } catch (err) {
    // Não bloquear listagem de decks caso haja erro na sincronização
    console.error('Falha na auto-sincronização de diálogos:', err.message);
  }
};

// GET /api/flashcards/decks - listar decks do usuário
router.get('/decks', authenticateToken, asyncHandler(async (req, res) => {
  // Remover duplicatas de decks de diálogo globais e sincronizar
  await cleanupDuplicateDialogueDecks();
  // Auto-sincronizar diálogos globais (novos e removidos)
  await autoSyncGlobalDialogueDecks('en');
  const userId = req.user.id;
  const rows = await query(
    'SELECT id, name, description, language, tags, created_at, updated_at FROM decks WHERE user_id = $1 OR user_id IS NULL ORDER BY updated_at DESC',
    [userId]
  );

  const rawTarget = (req.headers['x-target-lang'] || (req.query ? req.query.targetLang : '') || '').toString().trim().toLowerCase();
  const normTarget = normalizeLangCode(rawTarget);
  const enriched = rows.map((row) => {
    let display_name = row.name;
    const tags = parseTagsCompat(row?.tags);
    const isDialogue = Array.isArray(tags) && tags.includes('dialogue');
    if (isDialogue) {
      const baseName = String(row.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const sourceLang = (row.language || 'en').toUpperCase();
      if (normTarget) {
        if (normTarget === 'all') {
          display_name = `${baseName} (${sourceLang} → ALL)`;
        } else {
          display_name = `${baseName} (${sourceLang} → ${normTarget.toUpperCase()})`;
        }
      }
    }
    return { ...row, display_name };
  });

  res.json({ decks: enriched });
}));

// POST /api/flashcards/decks - criar deck
router.post('/decks', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { name, description, language, tags } = req.body;
  if (!name) {
    const requestId = req.requestId;
    return res.status(400).json({
      code: 'DECK_NAME_REQUIRED',
      error: 'Nome do deck é obrigatório',
      requestId
    });
  }
  const insertRes = await query(
    'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, language, tags, created_at, updated_at',
    [userId, name, description || null, language || null, Array.isArray(tags) ? JSON.stringify(tags) : tags || '[]']
  );
  if (Array.isArray(insertRes)) {
    return res.status(201).json({ deck: insertRes[0] });
  }
  const deckId = getInsertId(insertRes);
  const [deck] = await query(
    'SELECT id, name, description, language, tags, created_at, updated_at FROM decks WHERE id = $1',
    [deckId]
  );
  res.status(201).json({ deck });
}));

// PUT /api/flashcards/decks/:id - atualizar deck
router.put('/decks/:id', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const deckId = req.params.id;
  await ensureDeckOwnership(deckId, userId);
  const { name, description, language, tags } = req.body;
  const updateRes = await query(
    'UPDATE decks SET name = $1, description = $2, language = $3, tags = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, name, description, language, tags, created_at, updated_at',
    [name, description || null, language || null, Array.isArray(tags) ? JSON.stringify(tags) : tags || '[]', deckId]
  );
  if (Array.isArray(updateRes)) {
    return res.json({ deck: updateRes[0] });
  }
  const [deck] = await query(
    'SELECT id, name, description, language, tags, created_at, updated_at FROM decks WHERE id = $1',
    [deckId]
  );
  res.json({ deck });
}));

// DELETE /api/flashcards/decks/:id - remover deck
router.delete('/decks/:id', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const deckId = req.params.id;
  await ensureDeckOwnership(deckId, userId);
  // Limpeza sincronizada: detectar bases APKG referenciadas pelos cards do deck
  // e remover diretórios somente se não forem referenciados por outros decks.
  try {
    const cardRows = await query(
      'SELECT id, front_text, back_text, front_audio_url, back_audio_url FROM cards WHERE deck_id = $1',
      [deckId]
    );
    const bases = new Set();
    const findBases = (s) => {
      const str = String(s || '');
      // Capturar /uploads/apkg/<userId>/<base>/...
      const re = new RegExp(`/uploads/apkg/${String(userId)}/([^/]+)/`, 'g');
      let m;
      while ((m = re.exec(str)) !== null) {
        const base = (m[1] || '').trim();
        if (base) bases.add(base);
      }
    };
    for (const row of cardRows) {
      findBases(row.front_text);
      findBases(row.back_text);
      findBases(row.front_audio_url);
      findBases(row.back_audio_url);
    }

    for (const baseName of bases) {
      try {
        const like = `%/uploads/apkg/${String(userId)}/${baseName}/%`;
        const [cntRow] = await query(
          `SELECT COUNT(*) AS cnt FROM cards
           WHERE deck_id <> $1 AND (
             front_text LIKE $2 OR back_text LIKE $2 OR
             front_audio_url LIKE $2 OR back_audio_url LIKE $2
           )`,
          [deckId, like]
        );
        const cnt = Number((cntRow && (cntRow.cnt || cntRow.count)) || 0);
        if (cnt === 0) {
          const absDir = path.join(__dirname, '..', 'uploads', 'apkg', String(userId), baseName);
          if (fs.existsSync(absDir)) {
            try {
              fs.rmSync(absDir, { recursive: true, force: true });
              console.log('🧹 [DELETE/DECK] Removido diretório APKG órfão:', absDir);
            } catch (rmErr) {
              console.warn('⚠️ [DELETE/DECK] Falha ao remover diretório APKG:', absDir, rmErr?.message || rmErr);
            }
          }
        } else {
          console.log('ℹ️ [DELETE/DECK] Base APKG mantida (referenciada por outros decks):', baseName, 'refs:', cnt);
        }
      } catch (chkErr) {
        console.warn('⚠️ [DELETE/DECK] Erro verificando referências APKG para base', baseName, chkErr?.message || chkErr);
      }
    }
  } catch (scanErr) {
    console.warn('⚠️ [DELETE/DECK] Falha ao varrer bases APKG do deck:', scanErr?.message || scanErr);
  }
  await query('DELETE FROM cards WHERE deck_id = $1', [deckId]);
  await query('DELETE FROM decks WHERE id = $1', [deckId]);
  res.json({ message: 'Deck removido com sucesso' });
}));

// DELETE /api/flashcards/decks - remover todos os decks do usuário (e seus cards)
router.delete('/decks', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  // Remover todos os cards pertencentes aos decks do usuário
  await query('DELETE FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = $1)', [userId]);
  // Remover todos os decks do usuário
  await query('DELETE FROM decks WHERE user_id = $1', [userId]);
  res.json({ message: 'Todos os decks do usuário foram removidos' });
}));

// GET /api/flashcards/decks/unused - listar decks do usuário que não estão sendo usados
router.get('/decks/unused', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const rows = await query(
    `SELECT d.id, d.name, d.updated_at,
            COUNT(c.id) AS total,
            SUM(CASE WHEN (c.repetitions > 0 OR c.last_reviewed IS NOT NULL) THEN 1 ELSE 0 END) AS used_count
     FROM decks d
     LEFT JOIN cards c ON c.deck_id = d.id
     WHERE d.user_id = $1
     GROUP BY d.id, d.name, d.updated_at
     ORDER BY d.updated_at DESC`,
    [userId]
  );
  const unused = [];
  for (const r of rows) {
    const total = Number(r.total || r.count || 0);
    const used = Number(r.used_count || 0);
    if (total === 0) {
      unused.push({ id: r.id, name: r.name, reason: 'no_cards' });
    } else if (used === 0) {
      unused.push({ id: r.id, name: r.name, reason: 'never_reviewed' });
    }
  }
  res.json({ unused });
}));

// DELETE /api/flashcards/decks/unused - remover decks não usados com limpeza de mídia APKG
router.delete('/decks/unused', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const rows = await query(
    `SELECT d.id, d.name,
            COUNT(c.id) AS total,
            SUM(CASE WHEN (c.repetitions > 0 OR c.last_reviewed IS NOT NULL) THEN 1 ELSE 0 END) AS used_count
     FROM decks d
     LEFT JOIN cards c ON c.deck_id = d.id
     WHERE d.user_id = $1
     GROUP BY d.id, d.name`,
    [userId]
  );
  const candidates = rows.filter((r) => {
    const total = Number(r.total || r.count || 0);
    const used = Number(r.used_count || 0);
    return total === 0 || used === 0;
  });

  const removed = [];
  const keptBases = [];
  const errors = [];

  for (const d of candidates) {
    const deckId = d.id;
    try {
      // Coletar bases de APKG referenciadas pelos cards do deck
      const cardRows = await query(
        'SELECT front_text, back_text, front_audio_url, back_audio_url FROM cards WHERE deck_id = $1',
        [deckId]
      );
      const bases = new Set();
      const findBases = (s) => {
        const str = String(s || '');
        const re = new RegExp(`/uploads/apkg/${String(userId)}/([^/]+)/`, 'g');
        let m;
        while ((m = re.exec(str)) !== null) {
          const base = (m[1] || '').trim();
          if (base) bases.add(base);
        }
      };
      for (const row of cardRows) {
        findBases(row.front_text);
        findBases(row.back_text);
        findBases(row.front_audio_url);
        findBases(row.back_audio_url);
      }

      for (const baseName of bases) {
        try {
          const like = `%/uploads/apkg/${String(userId)}/${baseName}/%`;
          const [cntRow] = await query(
            `SELECT COUNT(*) AS cnt FROM cards
             WHERE deck_id <> $1 AND (
               front_text LIKE $2 OR back_text LIKE $2 OR
               front_audio_url LIKE $2 OR back_audio_url LIKE $2
             )`,
            [deckId, like]
          );
          const cnt = Number((cntRow && (cntRow.cnt || cntRow.count)) || 0);
          if (cnt === 0) {
            const absDir = path.join(__dirname, '..', 'uploads', 'apkg', String(userId), baseName);
            if (fs.existsSync(absDir)) {
              try { fs.rmSync(absDir, { recursive: true, force: true }); }
              catch (rmErr) { errors.push({ deckId, baseName, error: rmErr?.message || String(rmErr) }); }
            }
          } else {
            keptBases.push({ baseName, refs: cnt });
          }
        } catch (chkErr) {
          errors.push({ deckId, baseName, error: chkErr?.message || String(chkErr) });
        }
      }

      await query('DELETE FROM cards WHERE deck_id = $1', [deckId]);
      await query('DELETE FROM decks WHERE id = $1', [deckId]);
      removed.push({ id: deckId, name: d.name });
    } catch (e) {
      errors.push({ deckId, error: e?.message || String(e) });
    }
  }

  res.json({ removed, keptBases, errors, message: 'Decks não utilizados removidos' });
}));

// GET /api/flashcards/decks/:deckId/cards - listar cards
router.get('/decks/:deckId/cards', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const deckId = req.params.deckId;
  await ensureDeckAccessible(deckId, userId);

  // Obter detalhes completos do deck para decidir se é diálogo e montar dinamicamente
  const deckRows = await query('SELECT id, name, description, language, tags FROM decks WHERE id = $1', [deckId]);
  const deck = deckRows[0];
  const tags = parseTagsCompat(deck?.tags);
  const nameStrFull = String(deck?.name || '');
  const hasDialoguePattern = /\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i.test(nameStrFull);
  const isDialogue = (Array.isArray(tags) && tags.includes('dialogue')) || hasDialoguePattern;

  if (isDialogue) {
    // Derivar a chave do diálogo: usar tag se disponível; caso contrário, casar pelo título
    let dialogueKey = tags[1];
    if (!dialogueKey) {
      const baseName = nameStrFull.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const keys = listDialogueKeys('en');
      for (const k of keys) {
        if (toTitle(k).toLowerCase() === baseName.toLowerCase()) {
          dialogueKey = k;
          break;
        }
      }
    }
    if (!dialogueKey) {
      return res.json({ cards: [] });
    }
    const sourceLang = deck.language || 'en';
    const nameStr = String(deck.name || '');
    const match = nameStr.match(/\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i);
    const targetLangRaw = match ? match[2] : null;
    const targetLang = targetLangRaw && targetLangRaw.toLowerCase() !== 'all' ? targetLangRaw.toLowerCase() : null;
    const includeAllTranslations = targetLangRaw && targetLangRaw.toLowerCase() === 'all';

    // Priorizar cabeçalho/param targetLang
    const headerTarget = (req.headers['x-target-lang'] || (req.query ? req.query.targetLang : '') || '').toString().trim().toLowerCase();
    const headerTargetNorm = normalizeLangCode(headerTarget);
    let effectiveTargetLang = targetLang;
    let effectiveIncludeAll = includeAllTranslations;
    if (headerTargetNorm) {
      if (headerTargetNorm === 'all') {
        effectiveTargetLang = null;
        effectiveIncludeAll = true;
      } else {
        effectiveTargetLang = headerTargetNorm;
        effectiveIncludeAll = false;
      }
    }

    const srcLines = readDialogueLines(sourceLang, dialogueKey) || [];
    if (srcLines.length === 0) {
      return res.json({ cards: [] });
    }

    let cards = [];
    if (effectiveIncludeAll) {
      const langs = listAvailableLanguages(dialogueKey).filter((l) => l !== sourceLang);
      const translationsByLang = {};
      for (const l of langs) {
        const lines = readDialogueLines(l, dialogueKey);
        if (lines && lines.length > 0) translationsByLang[l] = lines;
      }
      for (let i = 0; i < srcLines.length; i++) {
        const parts = [];
        for (const lang of Object.keys(translationsByLang)) {
          const lines = translationsByLang[lang];
          if (Array.isArray(lines) && lines[i]) {
            parts.push(`${lang.toUpperCase()}: ${lines[i]}`);
          }
        }
        const back_text = parts.length > 0 ? parts.join('\n') : srcLines[i];
        cards.push({
          id: `v_${deckId}_${i}`,
          deck_id: deckId,
          front_text: srcLines[i],
          back_text,
          front_audio_url: resolveAudioUrl(sourceLang, dialogueKey, i),
          front_video_url: null,
          back_audio_url: null,
          back_video_url: null,
          // Campos de agendamento não se aplicam a cards dinâmicos
        });
      }
    } else {
      const tgtLines = effectiveTargetLang ? (readDialogueLines(effectiveTargetLang, dialogueKey) || []) : [];
      for (let i = 0; i < srcLines.length; i++) {
        const candidate = effectiveTargetLang ? tgtLines[i] : null;
        const back_text = candidate || srcLines[i];
        cards.push({
          id: `v_${deckId}_${i}`,
          deck_id: deckId,
          front_text: srcLines[i],
          back_text,
          front_audio_url: resolveAudioUrl(sourceLang, dialogueKey, i),
          front_video_url: null,
          back_audio_url: effectiveTargetLang ? resolveAudioUrl(effectiveTargetLang, dialogueKey, i) : null,
          back_video_url: null,
        });
      }
    }

    return res.json({ cards });
  }

  // Decks não-diálogo: retornar cards do banco ordenados pela chave de vídeo
  const rows = await query(
    'SELECT * FROM cards WHERE deck_id = $1 ORDER BY COALESCE(video_order_key, 9223372036854775807) ASC, id ASC',
    [deckId]
  );
  // Reescrever src de imagens com base na pasta de mídia do APKG (se existir)
  const ownerId = String(deck?.user_id || userId);
  // Inferir base de mídia a partir de URLs já armazenadas nos cards (mais confiável que usar o nome do deck)
  let mediaBaseRelByDeck = null;
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const tryStrings = [r.front_audio_url, r.back_audio_url, r.front_text, r.back_text];
      let found = null;
      for (const s0 of tryStrings) {
        const s = String(s0 || '');
        const m = s.match(new RegExp(`/uploads/apkg/${ownerId}/([^/]+)/extract/media`));
        if (m && m[1]) { found = `/uploads/apkg/${ownerId}/${m[1]}/extract/media`; break; }
      }
      if (found) { mediaBaseRelByDeck = found; break; }
    }
  }
  // Fallback: usar nome do deck (funciona quando base de mídia foi criada com o mesmo nome)
  if (!mediaBaseRelByDeck && nameStrFull) {
    mediaBaseRelByDeck = `/uploads/apkg/${ownerId}/${nameStrFull}/extract/media`;
  }
  // Fallback extra: localizar a base de mídia mais recente do usuário quando nome do deck não bater
  if (!mediaBaseRelByDeck) {
    try {
      const userApkgRoot = path.join(__dirname, '..', 'uploads', 'apkg', String(ownerId));
      if (fs.existsSync(userApkgRoot)) {
        const dirs = fs.readdirSync(userApkgRoot)
          .map((d) => {
            const p = path.join(userApkgRoot, d);
            let stat = null;
            try { stat = fs.statSync(p); } catch (_) {}
            return { name: d, stat };
          })
          .filter((x) => x.stat && x.stat.isDirectory())
          .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
        for (const dir of dirs) {
          const mediaDir = path.join(userApkgRoot, dir.name, 'extract', 'media');
          if (fs.existsSync(mediaDir)) {
            mediaBaseRelByDeck = `/uploads/apkg/${ownerId}/${dir.name}/extract/media`;
            break;
          }
        }
      }
    } catch (_) {}
  }
  const uploadsHost = `${req.protocol}://${req.get('host')}`;
  const prefixImgSrcForDeck = (html) => {
    const s = String(html || '');
    if (!mediaBaseRelByDeck) return s;
    return s.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/ig, (m, p1, src, p3) => {
      const val = String(src || '').trim();
      if (!val) return m;
      if (/^https?:\/\//i.test(val) || /^data:/i.test(val)) return `${p1}${val}${p3}`;
      if (/^\//.test(val)) return `${p1}${uploadsHost}${val}${p3}`;
      const clean = val.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
      return `${p1}${uploadsHost}${mediaBaseRelByDeck}/${clean}${p3}`;
    });
  };
  const sanitizeBackText = (html) => {
    let s = String(html || '');
    // Remove linhas do tipo "sentence:123456 sentence" (conteúdo técnico do APKG)
    s = s.replace(/(^|\n)\s*sentence:\s*\d+\s*sentence\s*(?=\n|$)/ig, (match, p1) => p1 ? p1 : '');
    // Remover ocorrências soltas, caso venham sem quebra de linha
    s = s.replace(/\bsentence:\s*\d+\s*sentence\b/ig, '');
    // Normalizar atributo src em <img>: casos com quebra de linha ou sem '='
    // Ex.: <img src\n "..."> ou <img src "..."> -> <img src="...">
    s = s.replace(/(<img[^>]*\bsrc)\s*[\r\n]+\s*(["'])/ig, '$1=$2');
    s = s.replace(/(<img[^>]*\bsrc)\s*(["'])/ig, '$1=$2');
    // Forçar quebra entre japonês e português quando vierem na mesma linha
    // Heurística: se a linha contém CJK e caracteres latinos, inserir quebra entre blocos
    // Também quebra em delimitadores comuns ("=", "-", "→") para melhorar legibilidade
    s = s.replace(/\r\n/g, '\n');
    const cjkRe = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    const latinRe = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
    const lines = s.split('\n').map(line => {
      let L = String(line || '');
      // evitar interferir em quebras HTML explícitas
      if (/<br\s*\/?\s*>/i.test(L)) return L;
      // delimitadores explícitos fora de tags HTML
      const hasHtmlTag = /<[^>]+>/.test(L);
      if (!hasHtmlTag && /\s*=\s*/.test(L)) return L.replace(/\s*=\s*/, '\n');
      if (!hasHtmlTag && /\s*-\s*/.test(L)) return L.replace(/\s*-\s*/, '\n');
      if (!hasHtmlTag && /\s*→\s*/.test(L)) return L.replace(/\s*→\s*/, '\n');
      // CJK seguido de latim na mesma linha
      if (cjkRe.test(L) && latinRe.test(L)) {
        const m = L.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々ゝゞ〜、。！？・（）「」『』\s]+)[\s\-–—=:→]*([A-Za-zÀ-ÖØ-öø-ÿ].*)$/u);
        if (m) {
          return `${m[1].trim()}\n${m[2].trim()}`;
        }
      }
      return L;
    }).join('\n');
    s = lines;
    // Normalizar múltiplas quebras em excesso
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    return s;
  };
  const prefixMediaUrl = (url) => {
    const v = String(url || '').trim();
    if (!v) return v;
    if (/^https?:\/\//i.test(v) || /^data:/i.test(v)) return v;
    if (/^\//.test(v)) return `${uploadsHost}${v}`;
    return `${uploadsHost}/${v}`;
  };
  const mapped = Array.isArray(rows) ? rows.map(r => ({
    ...r,
    front_text: prefixImgSrcForDeck(r.front_text),
    back_text: prefixImgSrcForDeck(sanitizeBackText(r.back_text)),
    front_audio_url: prefixMediaUrl(r.front_audio_url),
    back_audio_url: prefixMediaUrl(r.back_audio_url),
    front_video_url: prefixMediaUrl(r.front_video_url),
    back_video_url: prefixMediaUrl(r.back_video_url)
  })) : rows;
  res.json({ cards: mapped });
}));

// GET /api/flashcards/public/decks/:deckId/cards - listar cards (rota pública somente em dev)
router.get('/public/decks/:deckId/cards', optionalAuth, asyncHandler(async (req, res) => {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProd) {
    return res.status(403).json({ error: 'Public cards endpoint disabled in production' });
  }

  const userId = req.user?.id || null;
  const deckId = req.params.deckId;

  // Obter detalhes do deck (não bloqueia por ownership em dev)
  const deckRows = await query('SELECT id, name, description, language, tags, user_id FROM decks WHERE id = $1', [deckId]);
  const deck = deckRows[0];
  if (!deck) {
    return res.status(404).json({ error: 'Deck não encontrado' });
  }

  const tags = parseTagsCompat(deck?.tags);
  const nameStrFull = String(deck?.name || '');
  const hasDialoguePattern = /\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i.test(nameStrFull);
  const isDialogue = (Array.isArray(tags) && tags.includes('dialogue')) || hasDialoguePattern;

  if (isDialogue) {
    let dialogueKey = tags[1];
    if (!dialogueKey) {
      const baseName = nameStrFull.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const keys = listDialogueKeys('en');
      for (const k of keys) {
        if (toTitle(k).toLowerCase() === baseName.toLowerCase()) {
          dialogueKey = k;
          break;
        }
      }
    }
    if (!dialogueKey) {
      return res.json({ cards: [] });
    }
    const sourceLang = deck.language || 'en';
    const nameStr = String(deck.name || '');
    const match = nameStr.match(/\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i);
    const targetLangRaw = match ? match[2] : null;
    const targetLang = targetLangRaw && targetLangRaw.toLowerCase() !== 'all' ? targetLangRaw.toLowerCase() : null;
    const includeAllTranslations = targetLangRaw && targetLangRaw.toLowerCase() === 'all';

    const headerTarget = (req.headers['x-target-lang'] || (req.query ? req.query.targetLang : '') || '').toString().trim().toLowerCase();
    const headerTargetNorm = normalizeLangCode(headerTarget);
    let effectiveTargetLang = targetLang;
    let effectiveIncludeAll = includeAllTranslations;
    if (headerTargetNorm) {
      if (headerTargetNorm === 'all') {
        effectiveTargetLang = null;
        effectiveIncludeAll = true;
      } else {
        effectiveTargetLang = headerTargetNorm;
        effectiveIncludeAll = false;
      }
    }

    const srcLines = readDialogueLines(sourceLang, dialogueKey) || [];
    if (srcLines.length === 0) {
      return res.json({ cards: [] });
    }

    let cards = [];
    if (effectiveIncludeAll) {
      const langs = listAvailableLanguages(dialogueKey).filter((l) => l !== sourceLang);
      const translationsByLang = {};
      for (const l of langs) {
        const lines = readDialogueLines(l, dialogueKey);
        if (lines && lines.length > 0) translationsByLang[l] = lines;
      }
      for (let i = 0; i < srcLines.length; i++) {
        const parts = [];
        for (const lang of Object.keys(translationsByLang)) {
          const lines = translationsByLang[lang];
          if (Array.isArray(lines) && lines[i]) {
            parts.push(`${lang.toUpperCase()}: ${lines[i]}`);
          }
        }
        const back_text = parts.length > 0 ? parts.join('\n') : srcLines[i];
        cards.push({
          id: `v_${deckId}_${i}`,
          deck_id: deckId,
          front_text: srcLines[i],
          back_text,
          front_audio_url: resolveAudioUrl(sourceLang, dialogueKey, i),
          front_video_url: null,
          back_audio_url: null,
          back_video_url: null,
        });
      }
    } else {
      const tgtLines = effectiveTargetLang ? (readDialogueLines(effectiveTargetLang, dialogueKey) || []) : [];
      for (let i = 0; i < srcLines.length; i++) {
        const candidate = effectiveTargetLang ? tgtLines[i] : null;
        const back_text = candidate || srcLines[i];
        cards.push({
          id: `v_${deckId}_${i}`,
          deck_id: deckId,
          front_text: srcLines[i],
          back_text,
          front_audio_url: resolveAudioUrl(sourceLang, dialogueKey, i),
          front_video_url: null,
          back_audio_url: effectiveTargetLang ? resolveAudioUrl(effectiveTargetLang, dialogueKey, i) : null,
          back_video_url: null,
        });
      }
    }

    return res.json({ cards, deck: { id: deck.id, name: deck.name } });
  }

  // Decks não-diálogo: retornar cards do banco ordenados pela chave de vídeo (com prefixo de mídia baseado no ownerId)
  const rows = await query(
    'SELECT * FROM cards WHERE deck_id = $1 ORDER BY COALESCE(video_order_key, 9223372036854775807) ASC, id ASC',
    [deckId]
  );

  // Definir ownerId de forma segura
  const ownerId = deck?.user_id != null ? String(deck.user_id) : (userId != null ? String(userId) : null);
  const nameStrFullSafe = String(deck?.name || '');

  // Inferir base de mídia a partir de URLs já armazenadas nos cards
  let mediaBaseRelByDeck = null;
  if (Array.isArray(rows) && ownerId) {
    for (const r of rows) {
      const tryStrings = [r.front_audio_url, r.back_audio_url, r.front_text, r.back_text];
      let found = null;
      for (const s0 of tryStrings) {
        const s = String(s0 || '');
        const m = s.match(new RegExp(`/uploads/apkg/${ownerId}/([^/]+)/extract/media`));
        if (m && m[1]) { found = `/uploads/apkg/${ownerId}/${m[1]}/extract/media`; break; }
      }
      if (found) { mediaBaseRelByDeck = found; break; }
    }
  }
  // Fallback: usar nome do deck somente se houver ownerId
  if (!mediaBaseRelByDeck && ownerId && nameStrFullSafe) {
    mediaBaseRelByDeck = `/uploads/apkg/${ownerId}/${nameStrFullSafe}/extract/media`;
  }
  // Fallback extra: localizar a base de mídia mais recente do usuário se houver ownerId
  if (!mediaBaseRelByDeck && ownerId) {
    try {
      const userApkgRoot = path.join(__dirname, '..', 'uploads', 'apkg', String(ownerId));
      if (fs.existsSync(userApkgRoot)) {
        const dirs = fs.readdirSync(userApkgRoot)
          .map((d) => {
            const p = path.join(userApkgRoot, d);
            let stat = null;
            try { stat = fs.statSync(p); } catch (_) {}
            return { name: d, stat };
          })
          .filter((x) => x.stat && x.stat.isDirectory())
          .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
        for (const dir of dirs) {
          const mediaDir = path.join(userApkgRoot, dir.name, 'extract', 'media');
          if (fs.existsSync(mediaDir)) {
            mediaBaseRelByDeck = `/uploads/apkg/${ownerId}/${dir.name}/extract/media`;
            break;
          }
        }
      }
    } catch (_) {}
  }

  const uploadsHost = `${req.protocol}://${req.get('host')}`;
  const prefixImgSrcForDeck = (html) => {
    const s = String(html || '');
    if (!mediaBaseRelByDeck) return s;
    return s.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/ig, (m, p1, src, p3) => {
      const val = String(src || '').trim();
      if (!val) return m;
      if (/^https?:\/\//i.test(val) || /^data:/i.test(val)) return `${p1}${val}${p3}`;
      if (/^\//.test(val)) return `${p1}${uploadsHost}${val}${p3}`;
      const clean = val.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
      return `${p1}${uploadsHost}${mediaBaseRelByDeck}/${clean}${p3}`;
    });
  };
  const sanitizeBackText = (html) => {
    let s = String(html || '');
    s = s.replace(/(^|\n)\s*sentence:\s*\d+\s*sentence\s*(?=\n|$)/ig, (match, p1) => p1 ? p1 : '');
    s = s.replace(/\bsentence:\s*\d+\s*sentence\b/ig, '');
    // Normalizar atributo src em <img>: casos com quebra de linha ou sem '='
    // Ex.: <img src\n "..."> ou <img src "..."> -> <img src="...">
    s = s.replace(/(<img[^>]*\bsrc)\s*[\r\n]+\s*(["'])/ig, '$1=$2');
    s = s.replace(/(<img[^>]*\bsrc)\s*(["'])/ig, '$1=$2');
    s = s.replace(/\r\n/g, '\n');
    const cjkRe = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    const latinRe = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
    const lines = s.split('\n').map(line => {
      let L = String(line || '');
      if (/<br\s*\/?>/i.test(L)) return L;
      const hasHtmlTag = /<[^>]+>/.test(L);
      if (!hasHtmlTag && /\s*=\s*/.test(L)) return L.replace(/\s*=\s*/, '\n');
      if (!hasHtmlTag && /\s*-\s*/.test(L)) return L.replace(/\s*-\s*/, '\n');
      if (!hasHtmlTag && /\s*→\s*/.test(L)) return L.replace(/\s*→\s*/, '\n');
      if (cjkRe.test(L) && latinRe.test(L)) {
        const m = L.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々ゝゞ〜、。！？・（）「」『』\s]+)[\s\-–—=:→]*([A-Za-zÀ-ÖØ-öø-ÿ].*)$/u);
        if (m) {
          return `${m[1].trim()}\n${m[2].trim()}`;
        }
      }
      return L;
    }).join('\n');
    s = lines;
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    return s;
  };
  const prefixMediaUrl = (url) => {
    const v = String(url || '').trim();
    if (!v) return v;
    if (/^https?:\/\//i.test(v) || /^data:/i.test(v)) return v;
    if (/^\//.test(v)) return `${uploadsHost}${v}`;
    return `${uploadsHost}/${v}`;
  };
  const mapped = Array.isArray(rows) ? rows.map(r => ({
    ...r,
    front_text: prefixImgSrcForDeck(r.front_text),
    back_text: prefixImgSrcForDeck(sanitizeBackText(r.back_text)),
    front_audio_url: prefixMediaUrl(r.front_audio_url),
    back_audio_url: prefixMediaUrl(r.back_audio_url),
    front_video_url: prefixMediaUrl(r.front_video_url),
    back_video_url: prefixMediaUrl(r.back_video_url)
  })) : rows;

  res.json({ cards: mapped, deck: { id: deck.id, name: deck.name } });
}));

// POST /api/flashcards/decks/:deckId/normalize
// Recria os cards do deck a partir dos arquivos de diálogo e dos áudios
router.post('/decks/:deckId/normalize', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const deckId = req.params.deckId;
  await ensureDeckAccessible(deckId, userId);

  const deckRows = await query('SELECT id, name, description, language, tags FROM decks WHERE id = $1', [deckId]);
  const deck = deckRows[0];
  if (!deck) {
    const err = new Error('Deck não encontrado');
    err.status = 404;
    throw err;
  }

  const tags = parseTagsCompat(deck?.tags);
  const nameStrFull = String(deck?.name || '');
  const hasDialoguePattern = /\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i.test(nameStrFull);
  const isDialogue = (Array.isArray(tags) && tags.includes('dialogue')) || hasDialoguePattern;

  // Atualmente só suportamos normalização para decks de diálogo
  if (!isDialogue) {
    const requestId = req.requestId;
    return res.status(400).json({
      code: 'DECK_NORMALIZE_UNSUPPORTED',
      error: 'Normalização suportada apenas para decks de diálogo',
      requestId
    });
  }

  // Derivar clave do diálogo
  let dialogueKey = Array.isArray(tags) ? tags[1] : null;
  if (!dialogueKey) {
    const baseName = nameStrFull.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const keys = listDialogueKeys(deck.language || 'en');
    for (const k of keys) {
      if (toTitle(k).toLowerCase() === baseName.toLowerCase()) {
        dialogueKey = k;
        break;
      }
    }
  }
  if (!dialogueKey) {
    const requestId = req.requestId;
    return res.status(400).json({
      code: 'DIALOGUE_KEY_UNRESOLVED',
      error: 'Não foi possível determinar a chave do diálogo deste deck',
      requestId
    });
  }

  const sourceLang = (deck.language || 'en').toLowerCase();
  const match = nameStrFull.match(/\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i);
  const targetLangRaw = match ? match[2] : null;
  const headerTarget = (req.headers['x-target-lang'] || (req.query ? req.query.targetLang : '') || '').toString().trim().toLowerCase();
  const headerTargetNorm = normalizeLangCode(headerTarget);
  let effectiveTargetLang = (targetLangRaw && targetLangRaw.toLowerCase() !== 'all') ? targetLangRaw.toLowerCase() : null;
  let effectiveIncludeAll = targetLangRaw && targetLangRaw.toLowerCase() === 'all';
  if (headerTargetNorm) {
    if (headerTargetNorm === 'all') {
      effectiveTargetLang = null;
      effectiveIncludeAll = true;
    } else {
      effectiveTargetLang = headerTargetNorm;
      effectiveIncludeAll = false;
    }
  }

  const srcLines = readDialogueLines(sourceLang, dialogueKey);
  if (!srcLines || srcLines.length === 0) {
    const requestId = req.requestId;
    return res.status(404).json({
      code: 'DIALOGUE_FILE_NOT_FOUND',
      error: `Arquivo de diálogo não encontrado ou vazio: ${sourceLang}/${dialogueKey}.txt`,
      requestId
    });
  }

  // Preparar traduções
  let translationsByLang = {};
  if (effectiveIncludeAll) {
    const langs = listAvailableLanguages(dialogueKey).filter((l) => l !== sourceLang);
    for (const l of langs) {
      const lines = readDialogueLines(l, dialogueKey);
      if (lines && lines.length > 0) translationsByLang[l] = lines;
    }
  } else if (effectiveTargetLang) {
    const tgtLines = readDialogueLines(effectiveTargetLang, dialogueKey);
    translationsByLang[effectiveTargetLang] = Array.isArray(tgtLines) ? tgtLines : [];
  }

  // Apagar todos os cards atuais e recriar alinhados aos arquivos
  await query('DELETE FROM cards WHERE deck_id = $1', [deckId]);
  let created = 0;
  for (let i = 0; i < srcLines.length; i++) {
    const front_text = srcLines[i];
    let back_text;
    if (effectiveIncludeAll) {
      const parts = [];
      for (const lang of Object.keys(translationsByLang)) {
        const lines = translationsByLang[lang];
        if (Array.isArray(lines) && lines[i]) {
          parts.push(`${lang.toUpperCase()}: ${lines[i]}`);
        }
      }
      back_text = parts.length > 0 ? parts.join('\n') : front_text;
    } else if (effectiveTargetLang) {
      back_text = translationsByLang[effectiveTargetLang]?.[i] || front_text;
    } else {
      back_text = front_text;
    }

    const front_audio_url = resolveAudioUrl(sourceLang, dialogueKey, i);
    const back_audio_url = null;

    const ease_factor = 2.5;
    const interval_days = 0;
    const repetitions = 0;
    const due_date = new Date().toISOString().slice(0, 10);
    const last_reviewed = null;

    await query(
      `INSERT INTO cards (deck_id, front_text, back_text, front_audio_url, back_audio_url,
        ease_factor, interval_days, repetitions, due_date, last_reviewed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        deckId,
        front_text,
        back_text,
        front_audio_url,
        back_audio_url,
        ease_factor,
        interval_days,
        repetitions,
        due_date,
        last_reviewed
      ]
    );
    created++;
  }

  // Atualizar updated_at do deck
  await query('UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [deckId]);

  res.json({ deckId, dialogueKey, sourceLang, target: effectiveIncludeAll ? 'ALL' : (effectiveTargetLang || null), cardsRebuilt: created });
}));

// POST /api/flashcards/decks/sync-all
// Sincroniza todos os decks de diálogo (globais e do usuário) com os arquivos de texto/áudio
router.post('/decks/sync-all', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  // Primeiro, garantir que os decks globais estejam sincronizados
  await cleanupDuplicateDialogueDecks();
  await autoSyncGlobalDialogueDecks('en');

  const headerTarget = (req.headers['x-target-lang'] || (req.query ? req.query.targetLang : '') || '').toString().trim().toLowerCase();
  const normTarget = normalizeLangCode(headerTarget);

  const allDecks = await query('SELECT id, name, description, language, tags FROM decks WHERE user_id = $1 OR user_id IS NULL', [userId]);
  const results = [];
  for (const deck of allDecks) {
    const tags = parseTagsCompat(deck?.tags);
    const nameStrFull = String(deck?.name || '');
    const hasDialoguePattern = /\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i.test(nameStrFull);
    const isDialogue = (Array.isArray(tags) && tags.includes('dialogue')) || hasDialoguePattern;
    if (!isDialogue) continue;

    // Derivar chave do diálogo
    let dialogueKey = Array.isArray(tags) ? tags[1] : null;
    if (!dialogueKey) {
      const baseName = nameStrFull.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const keys = listDialogueKeys(deck.language || 'en');
      for (const k of keys) {
        if (toTitle(k).toLowerCase() === baseName.toLowerCase()) {
          dialogueKey = k;
          break;
        }
      }
    }
    if (!dialogueKey) {
      results.push({ deckId: deck.id, status: 'skipped', reason: 'dialogue_key_not_found' });
      continue;
    }

    const sourceLang = (deck.language || 'en').toLowerCase();
    const match = nameStrFull.match(/\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i);
    const targetLangRaw = match ? match[2] : null;

    let effectiveTargetLang = (targetLangRaw && targetLangRaw.toLowerCase() !== 'all') ? targetLangRaw.toLowerCase() : null;
    let effectiveIncludeAll = targetLangRaw && targetLangRaw.toLowerCase() === 'all';
    if (normTarget) {
      if (normTarget === 'all') {
        effectiveTargetLang = null;
        effectiveIncludeAll = true;
      } else {
        effectiveTargetLang = normTarget;
        effectiveIncludeAll = false;
      }
    }

    const srcLines = readDialogueLines(sourceLang, dialogueKey);
    if (!srcLines || srcLines.length === 0) {
      results.push({ deckId: deck.id, status: 'error', reason: `missing_source:${sourceLang}/${dialogueKey}.txt` });
      continue;
    }

    // Preparar traduções
    let translationsByLang = {};
    if (effectiveIncludeAll) {
      const langs = listAvailableLanguages(dialogueKey).filter((l) => l !== sourceLang);
      for (const l of langs) {
        const lines = readDialogueLines(l, dialogueKey);
        if (lines && lines.length > 0) translationsByLang[l] = lines;
      }
    } else if (effectiveTargetLang) {
      const tgtLines = readDialogueLines(effectiveTargetLang, dialogueKey);
      translationsByLang[effectiveTargetLang] = Array.isArray(tgtLines) ? tgtLines : [];
    }

    // Apagar e recriar cards
    await query('DELETE FROM cards WHERE deck_id = $1', [deck.id]);
    let created = 0;
    for (let i = 0; i < srcLines.length; i++) {
      const front_text = srcLines[i];
      let back_text;
      if (effectiveIncludeAll) {
        const parts = [];
        for (const lang of Object.keys(translationsByLang)) {
          const lines = translationsByLang[lang];
          if (Array.isArray(lines) && lines[i]) {
            parts.push(`${lang.toUpperCase()}: ${lines[i]}`);
          }
        }
        back_text = parts.length > 0 ? parts.join('\n') : front_text;
      } else if (effectiveTargetLang) {
        back_text = translationsByLang[effectiveTargetLang]?.[i] || front_text;
      } else {
        back_text = front_text;
      }

      const front_audio_url = resolveAudioUrl(sourceLang, dialogueKey, i);
      const back_audio_url = effectiveTargetLang ? resolveAudioUrl(effectiveTargetLang, dialogueKey, i) : null;
      const ease_factor = 2.5;
      const interval_days = 0;
      const repetitions = 0;
      const due_date = new Date().toISOString().slice(0, 10);
      const last_reviewed = null;
      await query(
        `INSERT INTO cards (deck_id, front_text, back_text, front_audio_url, back_audio_url,
          ease_factor, interval_days, repetitions, due_date, last_reviewed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [deck.id, front_text, back_text, front_audio_url, back_audio_url, ease_factor, interval_days, repetitions, due_date, last_reviewed]
      );
      created++;
    }
    await query('UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [deck.id]);
    results.push({ deckId: deck.id, status: 'ok', createdCards: created });
  }

  res.json({ synced: results.length, results });
}));

// POST /api/flashcards/decks/:deckId/cards - criar card
router.post('/decks/:deckId/cards', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const deckId = req.params.deckId;
  await ensureDeckOwnership(deckId, userId);

  const {
    front_text, back_text,
    front_audio_url, front_video_url,
    back_audio_url, back_video_url,
    hint, notes
  } = req.body;

  if (!front_text || !back_text) {
    const requestId = req.requestId;
    return res.status(400).json({
      code: 'CARD_TEXT_REQUIRED',
      error: 'Texto da frente e verso são obrigatórios',
      requestId
    });
  }

  const insertRes = await query(
    `INSERT INTO cards (
      deck_id, front_text, back_text,
      front_audio_url, front_video_url,
      back_audio_url, back_video_url,
      hint, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      deckId, front_text, back_text,
      front_audio_url || null, front_video_url || null,
      back_audio_url || null, back_video_url || null,
      hint || null, notes || null
    ]
  );
  if (Array.isArray(insertRes)) {
    return res.status(201).json({ card: insertRes[0] });
  }
  const cardId = getInsertId(insertRes);
  const [card] = await query('SELECT * FROM cards WHERE id = $1', [cardId]);
  res.status(201).json({ card });
}));

// PUT /api/flashcards/cards/:id - atualizar card
router.put('/cards/:id', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cardId = req.params.id;
  const cardRows = await query('SELECT deck_id FROM cards WHERE id = $1', [cardId]);
  const card = cardRows[0];
  if (!card) {
    const err = new Error('Card não encontrado');
    err.status = 404;
    throw err;
  }
  await ensureDeckOwnership(card.deck_id, userId);

  const {
    front_text, back_text,
    front_audio_url, front_video_url,
    back_audio_url, back_video_url,
    hint, notes,
    ease_factor, interval_days, repetitions, due_date, last_reviewed
  } = req.body;

  const rows = await query(
    `UPDATE cards SET
      front_text = $1,
      back_text = $2,
      front_audio_url = $3,
      front_video_url = $4,
      back_audio_url = $5,
      back_video_url = $6,
      hint = $7,
      notes = $8,
      ease_factor = COALESCE($9, ease_factor),
      interval_days = COALESCE($10, interval_days),
      repetitions = COALESCE($11, repetitions),
      due_date = COALESCE($12, due_date),
      last_reviewed = COALESCE($13, last_reviewed),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $14
    RETURNING *`,
    [
      front_text, back_text,
      front_audio_url || null, front_video_url || null,
      back_audio_url || null, back_video_url || null,
      hint || null, notes || null,
      ease_factor, interval_days, repetitions, due_date, last_reviewed,
      cardId
    ]
  );
  if (Array.isArray(rows)) {
    return res.json({ card: rows[0] });
  }
  const [card2] = await query('SELECT * FROM cards WHERE id = $1', [cardId]);
  res.json({ card: card2 });
}));

// DELETE /api/flashcards/cards/:id - remover card
router.delete('/cards/:id', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cardId = req.params.id;
  const cardRows = await query('SELECT deck_id FROM cards WHERE id = $1', [cardId]);
  const card = cardRows[0];
  if (!card) {
    const err = new Error('Card não encontrado');
    err.status = 404;
    throw err;
  }
  await ensureDeckOwnership(card.deck_id, userId);
  await query('DELETE FROM cards WHERE id = $1', [cardId]);
  res.json({ message: 'Card removido com sucesso' });
}));

// ============================
// Importar diálogo como Deck
// ============================

// Helper: título do deck a partir da chave do diálogo
const toTitle = (key) => key
  .split(/[_-]/)
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join(' ');

// Helper: ler linhas do arquivo de diálogo
// Suporta dois formatos:
// 1) Arquivo simples por idioma: public/dialogues/{lang}/{key}.txt com uma frase por linha
// 2) Arquivo multi-idioma unificado (ex.: em en/{key}.txt) com blocos:
//    speaker: <nome>
//    text: <frase em EN>
//    pt: <tradução>
//    es: <tradução>
//    ... (linhas vazias separam blocos)
const readDialogueLines = (lang, dialogueKey) => {
  const directPath = path.join(__dirname, `../../public/dialogues/${lang}/${dialogueKey}.txt`);
  const multiPath = path.join(__dirname, `../../public/dialogues/en/${dialogueKey}.txt`);

  const hasDirect = fs.existsSync(directPath);
  const hasMulti = fs.existsSync(multiPath);
  if (!hasDirect && !hasMulti) return null;

  const parseMultiForLang = (targetLang) => {
    const content = fs.readFileSync(multiPath, 'utf-8');
    const lines = content.split(/\r?\n/).map((l) => String(l).trim());

    // Só considerar formato multi-idioma quando houver labels relevantes (speaker, text, códigos de 2 letras)
    const hasLabels = lines.some((l) => /^([a-z]{2}|speaker|text)\s*:/i.test(l));
    if (!hasLabels) return null;

    const results = [];
    let current = {};

    const pushCurrent = () => {
      const hasAny = current.text || Object.keys(current).some((k) => k !== 'title' && k !== 'speaker' && current[k]);
      if (!hasAny) return;
      if (targetLang === 'en') {
        if (current.text) results.push(String(current.text).trim());
      } else if (current[targetLang]) {
        results.push(String(current[targetLang]).trim());
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l) continue;
      const match = l.match(/^([a-z]{2}|title|speaker|text)\s*:\s*(.*)$/i);
      if (!match) {
        continue;
      }
      const key = match[1].toLowerCase();
      const value = match[2];

      if ((key === 'speaker' || key === 'text') && (current.text || Object.keys(current).some((k) => k !== 'title' && k !== 'speaker' && current[k]))) {
        pushCurrent();
        current = {};
      }

      current[key] = value;
    }

    pushCurrent();
    return results.length > 0 ? results : null;
  };

  const parseDirectSimple = () => {
    const content = fs.readFileSync(directPath, 'utf-8');
    const lines = content.split(/\r?\n/).map((l) => String(l).trim());
    // Tratar como formato simples SEM labels, mesmo que haja "TITLE:".
    return lines.filter((l) => l.length > 0 && !l.startsWith('#'));
  };

  // Preferir multi-idioma para alinhar contagens quando possível (especialmente para traduções)
  if (lang !== 'en' && hasMulti) {
    const multiResults = parseMultiForLang(lang);
    if (multiResults && multiResults.length > 0) return multiResults;
    // Se não houver labels do idioma alvo no arquivo EN, cair para arquivo direto se existir
    if (hasDirect) return parseDirectSimple();
    return null;
  }

  // EN ou ausência de multi: usar direto se existir; caso contrário, tentar multi para EN
  if (lang === 'en') {
    if (hasMulti) {
      const enResults = parseMultiForLang('en');
      if (enResults && enResults.length > 0) return enResults;
    }
    if (hasDirect) return parseDirectSimple();
    return null;
  }

  // Fallback final para idiomas não-EN sem multi
  if (hasDirect) return parseDirectSimple();
  return null;
};

// Helper: caminho de áudio por linha
const resolveAudioUrl = (lang, dialogueKey, index) => {
  const rel = `/audio/dialogues/${lang}/${dialogueKey}/line_${index}.mp3`;
  const abs = path.join(__dirname, `../../public${rel}`);
  return fs.existsSync(abs) ? rel : null;
};

// Helper: listar idiomas disponíveis para um diálogo
// Considera arquivos por idioma e também detecta idiomas dentro de um arquivo multi-idioma (EN)
const listAvailableLanguages = (dialogueKey) => {
  const baseDir = path.join(__dirname, '../../public/dialogues');
  if (!fs.existsSync(baseDir)) return [];
  const langsFromDirs = fs.readdirSync(baseDir)
    .filter((entry) => {
      const candidate = path.join(baseDir, entry, `${dialogueKey}.txt`);
      return fs.existsSync(candidate);
    });

  // Adicionar idiomas detectados dentro do arquivo EN multi-idioma
  const multiPath = path.join(baseDir, 'en', `${dialogueKey}.txt`);
  if (fs.existsSync(multiPath)) {
    const content = fs.readFileSync(multiPath, 'utf-8');
    const raw = content.split(/\r?\n/);
    const set = new Set(langsFromDirs);
    for (let line of raw) {
      const l = String(line).trim();
      const match = l.match(/^([a-z]{2})\s*:\s*(.*)$/i);
      if (match) {
        const code = match[1].toLowerCase();
        set.add(code);
      }
    }
    return Array.from(set);
  }

  return langsFromDirs;
};

// Helper: listar chaves de diálogos disponíveis a partir de uma língua
const listDialogueKeys = (lang) => {
  const langDir = path.join(__dirname, `../../public/dialogues/${lang}`);
  if (!fs.existsSync(langDir)) return [];
  return fs.readdirSync(langDir)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => name.replace(/\.txt$/, ''));
};

// POST /api/flashcards/import/dialogue
// body: { dialogueKey: string, sourceLang?: string='en', targetLang?: string, includeAllTranslations?: boolean }
router.post('/import/dialogue', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { dialogueKey, sourceLang = 'en', targetLang, includeAllTranslations = false } = req.body;

  if (!dialogueKey) {
    const requestId = req.requestId;
    return res.status(400).json({
      code: 'DIALOGUE_KEY_REQUIRED',
      error: 'dialogueKey é obrigatório',
      requestId
    });
  }

  // Ler textos de origem e destino
  const srcLines = readDialogueLines(sourceLang, dialogueKey);
  if (!srcLines) {
    const requestId = req.requestId;
    return res.status(404).json({
      code: 'DIALOGUE_FILE_NOT_FOUND',
      error: `Arquivo de diálogo não encontrado: ${sourceLang}/${dialogueKey}.txt`,
      requestId
    });
  }
  let count = srcLines.length;
  let allLangs = [];
  let translationsByLang = {};

  if (includeAllTranslations) {
    allLangs = listAvailableLanguages(dialogueKey).filter((l) => l !== sourceLang);
    if (allLangs.length === 0) {
      const requestId = req.requestId;
      return res.status(404).json({
        code: 'TRANSLATIONS_NOT_FOUND',
        error: 'Nenhuma tradução disponível encontrada para este diálogo',
        requestId
      });
    }
    // Carregar todas as traduções
    for (const lang of allLangs) {
      const lines = readDialogueLines(lang, dialogueKey);
      if (lines && lines.length > 0) {
        translationsByLang[lang] = lines;
      }
    }
  } else {
    if (!targetLang) {
      const requestId = req.requestId;
      return res.status(400).json({
        code: 'TARGET_LANG_REQUIRED',
        error: 'targetLang (Meu idioma) é obrigatório quando includeAllTranslations=false',
        requestId
      });
    }
    const tgtLines = readDialogueLines(targetLang, dialogueKey);
    if (!tgtLines) {
      const requestId = req.requestId;
      return res.status(404).json({
        code: 'TRANSLATION_FILE_NOT_FOUND',
        error: `Arquivo de tradução não encontrado: ${targetLang}/${dialogueKey}.txt`,
        requestId
      });
    }
    translationsByLang[targetLang] = tgtLines;
  }
  if (count === 0) {
    const requestId = req.requestId;
    return res.status(400).json({
      code: 'NO_VALID_LINES',
      error: 'Nenhuma linha válida encontrada para criar cards',
      requestId
    });
  }

  // Criar (ou reutilizar) deck
  const deckName = includeAllTranslations
    ? `${toTitle(dialogueKey)} (${sourceLang} → ALL)`
    : `${toTitle(dialogueKey)} (${sourceLang} → ${targetLang})`;
  const existingRows = await query(
    'SELECT id FROM decks WHERE user_id = $1 AND name = $2',
    [userId, deckName]
  );

  let deckId;
  if (existingRows[0]?.id) {
    deckId = existingRows[0].id;
  } else {
    const deckRows = await query(
      'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        userId,
        deckName,
        `Importado do diálogo ${dialogueKey}`,
        sourceLang,
        JSON.stringify(['dialogue', dialogueKey])
      ]
    );
    deckId = getInsertId(deckRows);
  }

  // Inserir cards alinhando linhas por índice
  let created = 0;
  for (let i = 0; i < count; i++) {
    const front_text = srcLines[i];
    // Montar verso com todas as traduções disponíveis
    let back_text;
    if (includeAllTranslations) {
      const parts = [];
      for (const lang of Object.keys(translationsByLang)) {
        const lines = translationsByLang[lang];
        if (Array.isArray(lines) && lines[i]) {
          parts.push(`${lang.toUpperCase()}: ${lines[i]}`);
        }
      }
      back_text = parts.length > 0 ? parts.join('\n') : front_text;
    } else {
      const candidate = translationsByLang[targetLang][i];
      back_text = candidate || front_text;
    }

    const front_audio_url = resolveAudioUrl(sourceLang, dialogueKey, i);
    const back_audio_url = null; // Traduções não possuem áudio

    // Agendamento inicial estilo Anki: new card
    const ease_factor = 2.5;
    const interval_days = 0;
    const repetitions = 0;
    const due_date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const last_reviewed = null;

    await query(
      `INSERT INTO cards (
        deck_id, front_text, back_text,
        front_audio_url, back_audio_url,
        ease_factor, interval_days, repetitions, due_date, last_reviewed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        deckId, front_text, back_text,
        front_audio_url, back_audio_url,
        ease_factor, interval_days, repetitions, due_date, last_reviewed
      ]
    );
    created++;
  }

  res.status(201).json({
    message: 'Deck importado com sucesso',
    deck: { id: deckId, name: deckName },
    createdCards: created
  });
}));

// POST /api/flashcards/import/all
// body: { sourceLang?: string='en', targetLang: string, includeAllTranslations?: boolean=false }
router.post('/import/all', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sourceLang = 'en', targetLang, includeAllTranslations = false } = req.body || {};

  if (!includeAllTranslations && !targetLang) {
    const requestId = req.requestId;
    return res.status(400).json({
      code: 'TARGET_LANG_REQUIRED',
      error: 'targetLang (Meu idioma) é obrigatório quando includeAllTranslations=false',
      requestId
    });
  }

  const keys = listDialogueKeys(sourceLang);
  if (!keys || keys.length === 0) {
    const requestId = req.requestId;
    return res.status(404).json({
      code: 'DIALOGUES_NOT_FOUND',
      error: `Nenhum diálogo encontrado para ${sourceLang}`,
      requestId
    });
  }

  const createdDecks = [];
  for (const dialogueKey of keys) {
    const deckName = includeAllTranslations
      ? `${toTitle(dialogueKey)} (${sourceLang} → ALL)`
      : `${toTitle(dialogueKey)} (${sourceLang} → ${targetLang})`;
    const existing = await query('SELECT id FROM decks WHERE user_id = $1 AND name = $2', [userId, deckName]);
    if (existing[0]?.id) {
      continue; // pular se já existir
    }

    // Ler linhas de origem e alvo
    const srcLines = readDialogueLines(sourceLang, dialogueKey);
    if (!srcLines) continue;
    const count = srcLines.length;
    if (count === 0) continue;

    let translationsByLang = {};
    if (includeAllTranslations) {
      const langs = listAvailableLanguages(dialogueKey).filter((l) => l !== sourceLang);
      for (const l of langs) {
        const lines = readDialogueLines(l, dialogueKey);
        if (lines && lines.length > 0) {
          translationsByLang[l] = lines;
        }
      }
    } else {
      const tgtLines = readDialogueLines(targetLang, dialogueKey);
      translationsByLang[targetLang] = tgtLines || [];
    }

    // Criar deck
    const deckRows = await query(
      'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        userId,
        deckName,
        `Importado do diálogo ${dialogueKey}`,
        sourceLang,
        JSON.stringify(['dialogue', dialogueKey])
      ]
    );
    const deckId = getInsertId(deckRows);

    // Criar cards
    for (let i = 0; i < count; i++) {
      const front_text = srcLines[i];
      let back_text;
      if (includeAllTranslations) {
        const parts = [];
        for (const lang of Object.keys(translationsByLang)) {
          const lines = translationsByLang[lang];
          if (Array.isArray(lines) && lines[i]) {
            parts.push(`${lang.toUpperCase()}: ${lines[i]}`);
          }
        }
        back_text = parts.length > 0 ? parts.join('\n') : front_text;
      } else {
        const candidate = translationsByLang[targetLang]?.[i];
        back_text = candidate || front_text;
      }

      const front_audio_url = resolveAudioUrl(sourceLang, dialogueKey, i);
      const back_audio_url = null;

      const ease_factor = 2.5;
      const interval_days = 0;
      const repetitions = 0;
      const due_date = new Date().toISOString().slice(0, 10);
      const last_reviewed = null;

      await query(
        `INSERT INTO cards (
          deck_id, front_text, back_text,
          front_audio_url, back_audio_url,
          ease_factor, interval_days, repetitions, due_date, last_reviewed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          deckId, front_text, back_text,
          front_audio_url, back_audio_url,
          ease_factor, interval_days, repetitions, due_date, last_reviewed
        ]
      );
    }

    createdDecks.push({ id: deckId, name: deckName });
  }

  res.status(201).json({ message: 'Diálogos importados', decks: createdDecks });
}));

// POST /api/flashcards/import/apkg
// body: {
//   apkgPath?: string (ex.: /uploads/apkg/<user>/<basename>/<file>.apkg),
//   baseDir?: string (ex.: /uploads/apkg/<user>/<basename>),
//   deckStrategy?: 'single'|'split'
// }
router.post('/import/apkg', authenticateToken, parseFormFields, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const requestId = req.requestId;
  // Aceitar campos vindos em JSON, multipart/form-data (via multer) ou querystring
  let apkgPath = (req.body?.apkgPath || req.query?.apkgPath || '').toString();
  let apkgBaseDir = (req.body?.baseDir || req.query?.baseDir || '').toString();
  let deckStrategy = (req.body?.deckStrategy || req.query?.deckStrategy || 'split').toString();
  // Estratégia de duplicatas: 'ask' (retorna 409 com lista), 'skip', 'overwrite'
  // Para melhorar a UX, usamos 'overwrite' como padrão em desenvolvimento
  let onDuplicate = (req.body?.onDuplicate || req.query?.onDuplicate || process.env.APKG_DUPLICATE_STRATEGY || 'overwrite').toString().toLowerCase();
  if (!['ask','skip','overwrite'].includes(onDuplicate)) onDuplicate = 'ask';
  const allDuplicates = [];
  let absApkg;
  let relApkgPath;

  // Debug logs: headers and body snapshot
  try {
    console.log('🧾 [IMPORT/APKG] Headers:', {
      requestId,
      authorization: req.headers['authorization'],
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length')
    });
    console.log('🧾 [IMPORT/APKG] Body:', req.body);
    console.log('🧾 [IMPORT/APKG] Extracted:', { requestId, apkgPath, apkgBaseDir, deckStrategy, onDuplicate, userId });
  } catch (logErr) {
    console.warn('⚠️ [IMPORT/APKG] Falha ao logar request:', logErr?.message);
  }

  // Caso 0: arquivo .apkg enviado diretamente via multipart/form-data
  if ((!apkgPath && !apkgBaseDir) && Array.isArray(req.files) && req.files.length > 0) {
    try {
      const apkgFile = req.files.find((f) => {
        const name = String(f.originalname || '').toLowerCase();
        const extOk = name.endsWith('.apkg');
        const mime = (f.mimetype || '').toLowerCase();
        const zipLike = mime === 'application/zip' || mime === 'application/octet-stream';
        return extOk || zipLike;
      });
      if (apkgFile && apkgFile.buffer && apkgFile.buffer.length > 0) {
        const baseName = String(apkgFile.originalname || 'apkg')
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .slice(0, 80) || 'apkg';
        const dir = path.join(__dirname, '../uploads/apkg', String(userId), baseName);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${ts}.apkg`;
        const outPath = path.join(dir, filename);
        fs.writeFileSync(outPath, apkgFile.buffer);
        absApkg = outPath;
        relApkgPath = `/uploads/apkg/${userId}/${baseName}/${filename}`;
        console.log('🧾 [IMPORT/APKG] Recebido arquivo direto via multipart, salvo em:', { relApkgPath });
      }
    } catch (fileErr) {
      console.warn('⚠️ [IMPORT/APKG] Falha ao salvar arquivo multipart:', fileErr?.message);
    }
  }

  if (!absApkg && apkgPath && typeof apkgPath === 'string') {
    const clean = apkgPath.replace(/\\+/g, '/');
    const expectedPrefix = `/uploads/apkg/${userId}/`;
    if (!clean.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: 'Acesso negado ao arquivo APKG', code: 'ACCESS_DENIED', requestId });
    }
    absApkg = path.join(__dirname, '..', clean);
    relApkgPath = clean;
    if (!fs.existsSync(absApkg)) {
      return res.status(404).json({ error: 'Arquivo APKG não encontrado', code: 'APKG_NOT_FOUND', requestId });
    }
  } else if (!absApkg && apkgBaseDir && typeof apkgBaseDir === 'string') {
    const cleanBase = apkgBaseDir.replace(/\\+/g, '/');
    const expectedPrefix = `/uploads/apkg/${userId}/`;
    if (!cleanBase.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: 'Acesso negado ao diretório APKG', code: 'ACCESS_DENIED', requestId });
    }
    const absBase = path.join(__dirname, '..', cleanBase);
    if (!fs.existsSync(absBase)) {
      return res.status(404).json({ error: 'Diretório APKG não encontrado', code: 'APKG_DIR_NOT_FOUND', requestId });
    }
    const candidates = fs.readdirSync(absBase)
      .filter((f) => f.toLowerCase().endsWith('.apkg'))
      .map((f) => ({ f, stat: fs.statSync(path.join(absBase, f)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    if (!candidates.length) {
      return res.status(400).json({ error: 'Nenhum arquivo .apkg encontrado no diretório', code: 'APKG_DIR_EMPTY', requestId });
    }
    absApkg = path.join(absBase, candidates[0].f);
    relApkgPath = `${cleanBase}/${candidates[0].f}`.replace(/\\+/g, '/');
  } else {
    // Fallback: tentar localizar o último arquivo APKG enviado pelo usuário
    try {
      const userApkgRoot = path.join(__dirname, '../uploads/apkg', String(userId));
      if (fs.existsSync(userApkgRoot)) {
        const dirs = fs.readdirSync(userApkgRoot)
          .map((d) => {
            const dirPath = path.join(userApkgRoot, d);
            const stat = fs.statSync(dirPath);
            return { name: d, stat };
          })
          .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

        for (const dir of dirs) {
          const absBase = path.join(userApkgRoot, dir.name);
          if (!fs.existsSync(absBase)) continue;
          const candidates = fs.readdirSync(absBase)
            .filter((f) => f.toLowerCase().endsWith('.apkg'))
            .map((f) => ({ f, stat: fs.statSync(path.join(absBase, f)) }))
            .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
          if (candidates.length > 0) {
            absApkg = path.join(absBase, candidates[0].f);
            relApkgPath = `/uploads/apkg/${userId}/${dir.name}/${candidates[0].f}`;
            console.log('🧾 [IMPORT/APKG] Fallback escolhido:', { relApkgPath });
            break;
          }
        }
      }
    } catch (fallbackErr) {
      console.warn('⚠️ [IMPORT/APKG] Falha no fallback de APKG:', fallbackErr?.message);
    }

    if (!absApkg) {
      return res.status(400).json({ error: 'apkgPath é obrigatório', code: 'APKG_PATH_REQUIRED', requestId });
    }
  }

  const baseDir = path.dirname(absApkg);
  const extractDir = path.join(baseDir, 'extract');
  if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

  try {
    await fs.createReadStream(absApkg)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        const name = entry.path;
        if (name === 'collection.anki2') {
          entry.pipe(fs.createWriteStream(path.join(extractDir, 'collection.anki2')));
        } else if (name === 'collection.anki21') {
          // Compatibilidade com exports de versões mais novas do Anki
          entry.pipe(fs.createWriteStream(path.join(extractDir, 'collection.anki21')));
        } else if (name === 'media') {
          entry.pipe(fs.createWriteStream(path.join(extractDir, 'media.json')));
        } else {
          // Flatten qualquer estrutura de diretórios: manter apenas o basename
          const outName = path.basename(name);
          const mediaOut = path.join(extractDir, 'media', outName);
          const mediaDir = path.dirname(mediaOut);
          if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
          entry.pipe(fs.createWriteStream(mediaOut));
        }
      })
      .promise();
  } catch (extractErr) {
    console.error('❌ [IMPORT/APKG] Falha na extração do APKG:', { requestId, error: extractErr?.message });
    return res.status(400).json({ error: 'Falha ao extrair APKG', code: 'APKG_EXTRACT_FAILED', requestId, details: extractErr?.message });
  }

  const anki2Path = path.join(extractDir, 'collection.anki2');
  const altCollectionPath = path.join(extractDir, 'collection.anki21');
  const mediaJsonPath = path.join(extractDir, 'media.json');
  let collectionPath;
  // Preferir anki21 quando disponível; alguns exports modernos incluem ambos,
  // mas os dados reais estão em collection.anki21.
  if (fs.existsSync(altCollectionPath)) {
    collectionPath = altCollectionPath;
    console.log('🧾 [IMPORT/APKG] Preferindo collection.anki21 (detected newer schema)');
  } else if (fs.existsSync(anki2Path)) {
    collectionPath = anki2Path;
    console.log('🧾 [IMPORT/APKG] Usando collection.anki2');
  } else {
    return res.status(400).json({ error: 'Arquivo collection (anki2/anki21) ausente no APKG', code: 'APKG_COLLECTION_MISSING', requestId });
  }

  let mediaMap = {};
  if (fs.existsSync(mediaJsonPath)) {
    try { mediaMap = JSON.parse(fs.readFileSync(mediaJsonPath, 'utf-8')); } catch (_) {}
  }

  // Ajustar nomes de arquivos de mídia: renomear índices numéricos para nomes originais do media.json
  try {
    const mediaDir = path.join(extractDir, 'media');
    if (fs.existsSync(mediaDir) && mediaMap && typeof mediaMap === 'object') {
      for (const [key, originalNameRaw] of Object.entries(mediaMap)) {
        const originalName = path.basename(String(originalNameRaw || '')); // evitar paths inválidos
        if (!originalName) continue;
        const srcNumeric = path.join(mediaDir, key);
        const dstNamed = path.join(mediaDir, originalName);
        if (fs.existsSync(srcNumeric)) {
          // Se o arquivo destino não existe, renomear para preservar extensão e facilitar content-type
          if (!fs.existsSync(dstNamed)) {
            try {
              fs.renameSync(srcNumeric, dstNamed);
              // console.log(`🪄 [IMPORT/APKG] Renamed media: ${key} -> ${originalName}`);
            } catch (renErr) {
              // Em caso de falha, manter o arquivo numérico e tentar copiar
              try {
                fs.copyFileSync(srcNumeric, dstNamed);
              } catch (_) {}
            }
          }
        }
      }

      // Extra: achatar quaisquer subpastas numéricas (ex.: "3/arquivo.mp3") colocando arquivos diretamente em media/
      try {
        const children = fs.readdirSync(mediaDir, { withFileTypes: true });
        for (const d of children) {
          if (d.isDirectory() && /^\d+$/.test(d.name)) {
            const fromDir = path.join(mediaDir, d.name);
            const subItems = fs.readdirSync(fromDir, { withFileTypes: true });
            for (const it of subItems) {
              if (it.isFile()) {
                const src = path.join(fromDir, it.name);
                const dst = path.join(mediaDir, it.name);
                try {
                  if (!fs.existsSync(dst)) fs.renameSync(src, dst);
                } catch (mvErr) {
                  try { if (!fs.existsSync(dst)) fs.copyFileSync(src, dst); } catch (_) {}
                }
              }
            }
          }
        }
      } catch (_) {}
    }
  } catch (mmErr) {
    console.warn('⚠️ [IMPORT/APKG] Falha ao ajustar nomes de mídia via media.json:', mmErr?.message);
  }

  const adb = new sqlite3.Database(collectionPath, sqlite3.OPEN_READONLY);
  const getAsync = (sql, params=[]) => new Promise((resolve, reject) => {
    adb.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
  const allAsync = (sql, params=[]) => new Promise((resolve, reject) => {
    adb.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });

  // Diagnóstico: listar tabelas e contagens básicas
  let tables = [];
  try {
    tables = await allAsync("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name");
  } catch (e) {
    console.warn('⚠️ [IMPORT/APKG] Falha ao listar tabelas:', e?.message);
  }
  let countCards = null, countNotes = null;
  try {
    const r1 = await getAsync('SELECT COUNT(*) AS c FROM cards');
    countCards = r1?.c ?? null;
  } catch (e) {
    console.warn('⚠️ [IMPORT/APKG] Tabela cards inacessível:', e?.message);
  }
  try {
    const r2 = await getAsync('SELECT COUNT(*) AS c FROM notes');
    countNotes = r2?.c ?? null;
  } catch (e) {
    console.warn('⚠️ [IMPORT/APKG] Tabela notes inacessível:', e?.message);
  }

  let colRow = {};
  try {
    colRow = await getAsync('SELECT * FROM col LIMIT 1');
  } catch (e) {
    console.warn('⚠️ [IMPORT/APKG] Falha ao ler tabela col:', e?.message);
    colRow = {};
  }
  const dbVersion = Number(colRow?.ver ?? 0); // versão do banco (Anki)
  const schemaTimestamp = Number(colRow?.scm ?? 0); // timestamp de schema
  let decksJson = {}; let modelsJson = {};
  try { decksJson = JSON.parse(colRow?.decks || '{}'); } catch { decksJson = {}; }
  try { modelsJson = JSON.parse(colRow?.models || '{}'); } catch { modelsJson = {}; }

  const deckMap = {};
  for (const [did, d] of Object.entries(decksJson)) {
    deckMap[did] = d?.name || `Deck ${did}`;
  }

  let cards = [];
  let notes = [];
  try {
    cards = await allAsync('SELECT id AS cid, nid, did FROM cards');
  } catch (e) {
    console.warn('⚠️ [IMPORT/APKG] Falha ao ler tabela cards:', e?.message);
    cards = [];
  }
  try {
    notes = await allAsync('SELECT id, flds FROM notes');
  } catch (e) {
    console.warn('⚠️ [IMPORT/APKG] Falha ao ler tabela notes:', e?.message);
    notes = [];
  }
  // Normalizar chaves para string para evitar mismatch de tipo (INTEGER vs TEXT)
  const notesById = Object.fromEntries(notes.map(n => [String(n.id), n.flds]));
  console.log('🧾 [IMPORT/APKG] APKG stats:', {
    dbVersion,
    schemaTimestamp,
    decks: Object.keys(deckMap).length,
    cards: cards.length,
    notes: notes.length,
    source: path.basename(collectionPath),
    countCards,
    countNotes,
    tables
  });

  // Construir perDeck com base em notas únicas para evitar múltiplos cartões por nota
  const perDeck = {};
  const noteToDid = {};
  for (const c of cards) {
    const nid = String(c.nid);
    if (!noteToDid[nid]) {
      noteToDid[nid] = String(c.did);
    }
  }
  // Escolher um deck padrão quando uma nota não estiver mapeada em cards
  const defaultDid = Object.keys(deckMap)[0] || 'anki-fallback';
  for (const n of notes) {
    const nid = String(n.id);
    const did = String(noteToDid[nid] || defaultDid);
    const flds = String(n.flds || '').split('\x1f');
    if (!perDeck[did]) perDeck[did] = [];
    perDeck[did].push(flds);
  }
  console.log('🧾 [IMPORT/APKG] perDeck construído por notas únicas:', { decks: Object.keys(perDeck).length, totalNotesDistributed: notes.length });

  const results = [];
  const baseRel = relApkgPath.replace(/\/[^/]+$/, '');
  const mediaBaseRel = `${baseRel}/extract/media`;
  // Totais de diagnóstico
  const totals = { cardsCreated: 0, audioRefs: 0, imageRefs: 0, videoRefs: 0 };
  // Resolver nomes de mídia que podem estar como índices numéricos (ex.: "0", "12") via media.json
  const resolveMediaName = (name) => {
    const raw = String(name || '').trim();
    if (!raw) return raw;
    // Se for um índice numérico presente no media.json, usar o nome original
    if (/^\d+$/.test(raw) && mediaMap && Object.prototype.hasOwnProperty.call(mediaMap, raw)) {
      return path.basename(String(mediaMap[raw] || raw));
    }
    return raw;
  };
  const extractAudio = (text) => {
    const m = String(text || '').match(/\[sound:([^\]]+)\]/i);
    if (!m) return null;
    const mapped = resolveMediaName(m[1]);
    return `${mediaBaseRel}/${mapped}`;
  };
  // Extrair áudio de tags HTML <audio> e <source> dentro de <audio>
  const extractAudioHtml = (text) => {
    const s = String(text || '');
    // <audio src="..."> com ou sem aspas
    let m = s.match(/<audio[^>]*\bsrc=(["']?)([^"'>\s]+)\1/ig);
    if (m && m.length > 0) {
      const last = m[m.length - 1];
      const mm = last.match(/<audio[^>]*\bsrc=(["']?)([^"'>\s]+)\1/i);
      const name = mm && mm[2] ? resolveMediaName(mm[2]) : null;
      if (name) return `${mediaBaseRel}/${name}`;
    }
    // <audio> ... <source src="..."> ... </audio>
    let m2 = s.match(/<audio[\s\S]*?<source[^>]*\bsrc=(["']?)([^"'>\s]+)\1[\s\S]*?<\/audio>/i);
    if (m2 && m2[2]) {
      const name = resolveMediaName(m2[2]);
      if (name) return `${mediaBaseRel}/${name}`;
    }
    return null;
  };
  const extractAnyAudioFromFlds = (flds) => {
    if (!Array.isArray(flds)) return null;
    for (const f of flds) {
      const a = extractAudio(f) || extractAudioHtml(f);
      if (a) return a;
    }
    return null;
  };
  // Extrair vídeo (<video src> ou <source src>)
  const extractVideo = (text) => {
    const s = String(text || '');
    let m = s.match(/<video[^>]*\bsrc=["']([^"']+)["']/i);
    if (!m) m = s.match(/<source[^>]*\bsrc=["']([^"']+)["']/i);
    if (!m) return null;
    const mapped = resolveMediaName(m[1]);
    return `${mediaBaseRel}/${mapped}`;
  };
  // Alguns decks Anki referenciam vídeos usando a sintaxe de áudio [sound:arquivo.mp4].
  // Promover tais referências com extensões de vídeo conhecidas para vídeo.
  const extractVideoFromSound = (text) => {
    const s = String(text || '');
    const m = s.match(/\[sound:([^\]]+)\]/i);
    if (!m) return null;
    const name = resolveMediaName(m[1]);
    if (/\.(mp4|webm|ogv)$/i.test(name)) {
      return `${mediaBaseRel}/${name}`;
    }
    return null;
  };
  const extractAnyVideoFromFlds = (flds) => {
    if (!Array.isArray(flds)) return null;
    for (const f of flds) {
      const v = extractVideo(f);
      if (v) return v;
    }
    return null;
  };
  // Derivar chave de ordenação do vídeo a partir do nome do arquivo (ex.: 0.00.49.941-0.00.53.010, ou timestamp numérico)
  const deriveVideoOrderKeyFromUrl = (url) => {
    const u = String(url || '').trim();
    if (!u) return null;
    try {
      const base = path.basename(u).replace(/\?.*/, '');
      const name = base.replace(/\.[^.]+$/, '');
      const findTime = (str) => {
        const m = str.match(/(\d+)\.(\d{2})\.(\d{2})\.(\d{3})/);
        if (!m) return null;
        const h = parseInt(m[1], 10) || 0;
        const mm = parseInt(m[2], 10) || 0;
        const ss = parseInt(m[3], 10) || 0;
        const ms = parseInt(m[4], 10) || 0;
        return (((h * 60 + mm) * 60 + ss) * 1000) + ms;
      };
      // Preferir início de intervalo se houver
      const parts = name.split('-');
      let msKey = null;
      if (parts.length >= 2) {
        msKey = findTime(parts[0]);
      }
      if (msKey == null) {
        msKey = findTime(name);
      }
      if (msKey != null) return msKey;
      // Fallback: último segmento numérico grande após '_'
      const segs = name.split('_');
      for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i];
        if (/^\d{10,}$/.test(s)) {
          const n = Number(s);
          if (Number.isFinite(n)) return n;
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  };
  const extractAnyVideoFromSoundFlds = (flds) => {
    if (!Array.isArray(flds)) return null;
    for (const f of flds) {
      const v = extractVideoFromSound(f);
      if (v) return v;
    }
    return null;
  };
  const stripAudioTag = (text) => String(text || '').replace(/\[sound:[^\]]+\]/ig, '').trim();
  const stripVideoTag = (text) => String(text || '')
    .replace(/<video[^>]*>[\s\S]*?<\/video>/ig, '')
    .replace(/<source[^>]*>/ig, '')
    .trim();
  const countImgTags = (html) => {
    const s = String(html || '');
    // Contar imagens com src com ou sem aspas
    const matches = s.match(/<img[^>]+src=(["']?)[^"'>\s]+\1[^>]*>/ig);
    return matches ? matches.length : 0;
  };
  const prefixImgSrc = (html) => {
    const s = String(html || '');
    // Tratar src com aspas
    let out = s.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/ig, (m, p1, src, p3) => {
      const val = String(src || '').trim();
      if (!val) return m;
      if (/^(https?:\/\/|data:|\/)/i.test(val)) return `${p1}${val}${p3}`;
      let clean = val.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
      clean = resolveMediaName(clean);
      return `${p1}${mediaBaseRel}/${clean}${p3}`;
    });
    // Tratar src sem aspas (ex.: <img src=arquivo.png ...>)
    out = out.replace(/(<img[^>]*\bsrc=)([^"'>\s]+)([^>]*>)/ig, (m, p1, src, p3) => {
      const val = String(src || '').trim();
      if (!val) return m;
      if (/^(https?:\/\/|data:|\/)/i.test(val)) return `${p1}${val}${p3}`;
      let clean = val.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
      clean = resolveMediaName(clean);
      return `${p1}${mediaBaseRel}/${clean}${p3}`;
    });
    return out;
  };

  // Fallback: se não há cards vinculados, importar diretamente as notas como cartões simples
  if (Object.keys(perDeck).length === 0 && notes.length > 0) {
    // Derivar um nome base do arquivo APKG para evitar colisões com "Default"
    const baseRel = relApkgPath.replace(/\/[^/]+$/, '');
    const apkgBaseName = baseRel.split('/').filter(Boolean).pop();
    const targetDeckName = (deckStrategy === 'split')
      ? (Object.values(deckMap)[0] || apkgBaseName || 'Anki Notas')
      : (apkgBaseName || Object.values(deckMap)[0] || 'Anki Notas');
    const existing = await query('SELECT id FROM decks WHERE user_id = $1 AND name = $2', [userId, targetDeckName]);
    let deckId;
    if (existing[0]?.id) {
      deckId = existing[0].id;
    } else {
      const ins = await query(
        'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, targetDeckName, 'Importado do Anki (Notas sem cartões)', null, JSON.stringify(['import','anki','notes-only'])]
      );
      deckId = getInsertId(ins);
    }
    let created = 0;
    for (const n of notes) {
      const flds = String(n.flds || '').split('\x1f');
      const frontRaw = flds[0] || '';
      // Compor verso priorizando leitura e tradução, incluindo demais campos (ex.: imagem)
      let backParts = [];
      if (flds[2]) backParts.push(flds[2]);
      if (flds[1]) backParts.push(flds[1]);
      if (flds.length > 3) {
        for (let i = 3; i < flds.length; i++) {
          const val = flds[i];
          if (!val) continue;
          backParts.push(val);
        }
      }
      if (backParts.length === 0) {
        backParts = flds.slice(1).filter(Boolean);
      }
      const backRaw = (backParts.join('\n') || flds[0] || '').trim();
      // Melhor prática: vídeo na frente; áudio e tradução no verso
  const front_video_url = extractVideo(frontRaw) || extractAnyVideoFromFlds(flds) || extractVideoFromSound(frontRaw) || extractAnyVideoFromSoundFlds(flds);
      const back_video_url = extractVideo(backRaw) || extractAnyVideoFromFlds(flds) || extractVideoFromSound(backRaw) || extractAnyVideoFromSoundFlds(flds);
      // Fallback seguro: se não houver vídeo na frente e não houver áudio frontal,
      // usar áudio do verso ou qualquer áudio encontrado nos campos
      const back_audio_url = extractAudio(backRaw) || extractAnyAudioFromFlds(flds);
      const front_audio_url = front_video_url
        ? null
        : (extractAudio(frontRaw) || extractAnyAudioFromFlds(flds) || back_audio_url || null);
      // Contagem de diagnósticos
      if (front_audio_url) totals.audioRefs++;
      if (back_audio_url) totals.audioRefs++;
      if (front_video_url) totals.videoRefs = (totals.videoRefs || 0) + 1;
      if (back_video_url) totals.videoRefs = (totals.videoRefs || 0) + 1;
      totals.imageRefs += countImgTags(frontRaw) + countImgTags(backRaw);
      const front_text = prefixImgSrc(stripVideoTag(stripAudioTag(frontRaw)));
      const back_text = prefixImgSrc(stripVideoTag(stripAudioTag(backRaw)));
      // Dica/episódio: usar basename do pacote APKG para identificar origem
      const episodeHint = (() => {
        try {
          const baseRel = relApkgPath.replace(/\/[^/]+$/, '');
          const baseName = baseRel.split('/').filter(Boolean).pop();
          return baseName || null;
        } catch (_) {
          return null;
        }
      })();
      // Inserir sempre, preservando duplicatas internas do APKG (para manter a contagem original)
      const orderKey = deriveVideoOrderKeyFromUrl(front_video_url || back_video_url);
      await query(
        `INSERT INTO cards (
          deck_id, front_text, back_text,
          front_audio_url, front_video_url,
          back_audio_url, back_video_url,
          video_order_key, hint, notes,
          ease_factor, interval_days, repetitions, due_date, last_reviewed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          deckId, front_text, back_text,
          front_audio_url, front_video_url,
          back_audio_url, back_video_url,
          orderKey, episodeHint, null,
          2.5, 0, 0, new Date().toISOString().slice(0, 10), null
        ]
      );
      created++;
    }
    await query('UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [deckId]);
    totals.cardsCreated += created;
    results.push({ deckId, name: targetDeckName, createdCards: created, overwritten: (typeof overwritten === 'number' ? overwritten : 0), skippedDuplicates: (typeof skipped === 'number' ? skipped : 0), fallback: 'notes-only' });
  }

  for (const [did, fieldsList] of Object.entries(perDeck)) {
    const sourceDeckName = deckMap[did] || 'Anki Deck';
    // Tornar nomes estáveis por APKG para evitar mesclas indesejadas
    const baseRel = relApkgPath.replace(/\/[^/]+$/, '');
    const apkgBaseName = baseRel.split('/').filter(Boolean).pop();
    const targetDeckName = deckStrategy === 'split'
      ? (apkgBaseName ? `${sourceDeckName} — ${apkgBaseName}` : sourceDeckName)
      : (apkgBaseName || Object.values(deckMap)[0] || 'Anki Deck');

    const existing = await query('SELECT id FROM decks WHERE user_id = $1 AND name = $2', [userId, targetDeckName]);
    let deckId;
    if (existing[0]?.id) {
      deckId = existing[0].id;
    } else {
      const ins = await query(
        'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, targetDeckName, `Importado do Anki (${sourceDeckName}${apkgBaseName ? ` · ${apkgBaseName}` : ''})`, null, JSON.stringify(['import','anki'])]
      );
      deckId = getInsertId(ins);
    }

    let created = 0;
    let skipped = 0;
    let overwritten = 0;
    for (const flds of fieldsList) {
      const frontRaw = flds[0] || '';
      // Compor verso priorizando leitura e tradução, incluindo demais campos (ex.: imagem)
      let backParts = [];
      if (flds[2]) backParts.push(flds[2]);
      if (flds[1]) backParts.push(flds[1]);
      if (flds.length > 3) {
        for (let i = 3; i < flds.length; i++) {
          const val = flds[i];
          if (!val) continue;
          backParts.push(val);
        }
      }
      if (backParts.length === 0) {
        backParts = flds.slice(1).filter(Boolean);
      }
      const backRaw = (backParts.join('\n') || flds[0] || '').trim();
      // Vídeo na frente; áudio e tradução no verso
  const front_video_url = extractVideo(frontRaw) || extractAnyVideoFromFlds(flds) || extractVideoFromSound(frontRaw) || extractAnyVideoFromSoundFlds(flds);
      const back_video_url = extractVideo(backRaw) || extractAnyVideoFromFlds(flds) || extractVideoFromSound(backRaw) || extractAnyVideoFromSoundFlds(flds);
      // Fallback seguro: se não houver vídeo na frente e não houver áudio frontal,
      // usar áudio do verso ou qualquer áudio encontrado nos campos
      const back_audio_url = extractAudio(backRaw) || extractAnyAudioFromFlds(flds);
      const front_audio_url = front_video_url
        ? null
        : (extractAudio(frontRaw) || extractAnyAudioFromFlds(flds) || back_audio_url || null);
      // Contagem de diagnósticos
      if (front_audio_url) totals.audioRefs++;
      if (back_audio_url) totals.audioRefs++;
      if (front_video_url) totals.videoRefs = (totals.videoRefs || 0) + 1;
      if (back_video_url) totals.videoRefs = (totals.videoRefs || 0) + 1;
      totals.imageRefs += countImgTags(frontRaw) + countImgTags(backRaw);
      const front_text = prefixImgSrc(stripVideoTag(stripAudioTag(frontRaw)));
      const back_text = prefixImgSrc(stripVideoTag(stripAudioTag(backRaw)));

      const ease_factor = 2.5;
      const interval_days = 0;
      const repetitions = 0;
      const due_date = new Date().toISOString().slice(0, 10);
      const last_reviewed = null;

      // Inserir sempre para preservar a contagem original do APKG (permitir duplicatas internas)
      const hintVal = deckStrategy === 'single' ? (sourceDeckName || null) : null;
      const orderKey2 = deriveVideoOrderKeyFromUrl(front_video_url || back_video_url);
      await query(
        `INSERT INTO cards (
          deck_id, front_text, back_text,
          front_audio_url, front_video_url,
          back_audio_url, back_video_url,
          video_order_key, hint, notes,
          ease_factor, interval_days, repetitions, due_date, last_reviewed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          deckId, front_text, back_text,
          front_audio_url, front_video_url,
          back_audio_url, back_video_url,
          orderKey2, hintVal, null,
          ease_factor, interval_days, repetitions, due_date, last_reviewed
        ]
      );
      created++;
    }

    await query('UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [deckId]);
    totals.cardsCreated += created;
    results.push({ deckId, name: targetDeckName, createdCards: created, overwritten, skippedDuplicates: skipped });
  }

  adb.close();
  if (onDuplicate === 'ask' && allDuplicates.length > 0) {
    console.log('✅ [IMPORT/APKG] Resumo (duplicatas encontradas):', { decks: results.length, ...totals });
    return res.status(409).json({
      error: 'Duplicatas encontradas',
      code: 'DUPLICATES_FOUND',
      requestId,
      message: 'Confirme para sobrescrever ou criar novo.',
      duplicates: allDuplicates,
      results,
      totals
    });
  }
  console.log('✅ [IMPORT/APKG] Importação concluída:', { decks: results.length, ...totals });
  return res.status(201).json({
    message: 'APKG importado com sucesso',
    requestId,
    results,
    totals
  });
}));

// Importação dedicada para "FC 200 Frases em Japonês" sem impactar a rota geral
router.post('/import/fc200', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const requestId = req.requestId;
  // Parâmetros opcionais
  let filename = (req.body?.filename || req.query?.filename || 'FC 200 Frases em Japonês S01.apkg').toString();
  let onDuplicate = (req.body?.onDuplicate || req.query?.onDuplicate || 'overwrite').toString().toLowerCase();
  if (!['ask','skip','overwrite'].includes(onDuplicate)) onDuplicate = 'overwrite';

  // Localizar o arquivo na raiz do projeto e copiar para uploads do usuário
  let sourceAbs = path.join(__dirname, '..', '..', filename);
  if (!fs.existsSync(sourceAbs)) {
    // fallback: tentar no diretório corrente do servidor
    const alt = path.join(__dirname, '..', filename);
    if (fs.existsSync(alt)) sourceAbs = alt;
  }
  if (!fs.existsSync(sourceAbs)) {
    return res.status(404).json({ error: 'APKG FC200 não encontrado na raiz', code: 'FC200_NOT_FOUND', requestId, filename });
  }

  // Copiar para uploads do usuário em um diretório estável
  const baseName = 'FC200';
  const uploadsDir = path.join(__dirname, '../uploads/apkg', String(userId), baseName);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outName = `${ts}.apkg`;
  const absApkg = path.join(uploadsDir, outName);
  fs.copyFileSync(sourceAbs, absApkg);
  const relApkgPath = `/uploads/apkg/${userId}/${baseName}/${outName}`;

  // Extrair conteúdo do APKG
  const baseDir = path.dirname(absApkg);
  const extractDir = path.join(baseDir, 'extract');
  if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
  try {
    await fs.createReadStream(absApkg)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        const name = entry.path;
        if (name === 'collection.anki2') {
          entry.pipe(fs.createWriteStream(path.join(extractDir, 'collection.anki2')));
        } else if (name === 'collection.anki21') {
          entry.pipe(fs.createWriteStream(path.join(extractDir, 'collection.anki21')));
        } else if (name === 'media') {
          entry.pipe(fs.createWriteStream(path.join(extractDir, 'media.json')));
        } else {
          const outName = path.basename(name);
          const mediaOut = path.join(extractDir, 'media', outName);
          const mediaDir = path.dirname(mediaOut);
          if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
          entry.pipe(fs.createWriteStream(mediaOut));
        }
      })
      .promise();
  } catch (extractErr) {
    console.error('❌ [IMPORT/FC200] Falha na extração:', { requestId, error: extractErr?.message });
    return res.status(400).json({ error: 'Falha ao extrair APKG FC200', code: 'FC200_EXTRACT_FAILED', requestId, details: extractErr?.message });
  }

  const anki2Path = path.join(extractDir, 'collection.anki2');
  const altCollectionPath = path.join(extractDir, 'collection.anki21');
  const mediaJsonPath = path.join(extractDir, 'media.json');
  let collectionPath;
  if (fs.existsSync(altCollectionPath)) {
    collectionPath = altCollectionPath;
  } else if (fs.existsSync(anki2Path)) {
    collectionPath = anki2Path;
  } else {
    return res.status(400).json({ error: 'collection anki2/anki21 ausente', code: 'FC200_COLLECTION_MISSING', requestId });
  }

  let mediaMap = {};
  if (fs.existsSync(mediaJsonPath)) {
    try { mediaMap = JSON.parse(fs.readFileSync(mediaJsonPath, 'utf-8')); } catch { mediaMap = {}; }
  }

  // Ajustar nomes de mídia pela media.json e achatar diretórios numéricos
  try {
    const mediaDir = path.join(extractDir, 'media');
    if (fs.existsSync(mediaDir) && mediaMap && typeof mediaMap === 'object') {
      for (const [key, originalNameRaw] of Object.entries(mediaMap)) {
        const originalName = path.basename(String(originalNameRaw || ''));
        if (!originalName) continue;
        const srcNumeric = path.join(mediaDir, key);
        const dstNamed = path.join(mediaDir, originalName);
        if (fs.existsSync(srcNumeric)) {
          if (!fs.existsSync(dstNamed)) {
            try { fs.renameSync(srcNumeric, dstNamed); } catch { try { fs.copyFileSync(srcNumeric, dstNamed); } catch {} }
          }
        }
      }
      try {
        const children = fs.readdirSync(mediaDir, { withFileTypes: true });
        for (const d of children) {
          if (d.isDirectory() && /^\d+$/.test(d.name)) {
            const fromDir = path.join(mediaDir, d.name);
            const subItems = fs.readdirSync(fromDir, { withFileTypes: true });
            for (const it of subItems) {
              if (it.isFile()) {
                const src = path.join(fromDir, it.name);
                const dst = path.join(mediaDir, it.name);
                try { if (!fs.existsSync(dst)) fs.renameSync(src, dst); } catch { try { if (!fs.existsSync(dst)) fs.copyFileSync(src, dst); } catch {} }
              }
            }
          }
        }
      } catch {}
    }
  } catch {}

  // Helpers dedicados à rota FC200
  const mediaBaseRel = `${relApkgPath.replace(/\/[^/]+$/, '')}/extract/media`;
  const resolveMediaName = (name) => {
    const raw = String(name || '').trim();
    if (!raw) return raw;
    if (/^\d+$/.test(raw) && mediaMap && Object.prototype.hasOwnProperty.call(mediaMap, raw)) {
      return path.basename(String(mediaMap[raw] || raw));
    }
    return raw;
  };
  const extractAudio = (text) => {
    const m = String(text || '').match(/\[sound:([^\]]+)\]/i);
    if (!m) return null;
    const mapped = resolveMediaName(m[1]);
    return `${mediaBaseRel}/${mapped}`;
  };
  const extractAudioHtml = (text) => {
    const s = String(text || '');
    let m = s.match(/<audio[^>]*\bsrc=(["']?)([^"'>\s]+)\1/ig);
    if (m && m.length > 0) {
      const last = m[m.length - 1];
      const mm = last.match(/<audio[^>]*\bsrc=(["']?)([^"'>\s]+)\1/i);
      const name = mm && mm[2] ? resolveMediaName(mm[2]) : null;
      if (name) return `${mediaBaseRel}/${name}`;
    }
    let m2 = s.match(/<audio[\s\S]*?<source[^>]*\bsrc=(["']?)([^"'>\s]+)\1[\s\S]*?<\/audio>/i);
    if (m2 && m2[2]) {
      const name = resolveMediaName(m2[2]);
      if (name) return `${mediaBaseRel}/${name}`;
    }
    return null;
  };
  const extractVideo = (text) => {
    const s = String(text || '');
    let m = s.match(/<video[^>]*\bsrc=["']([^"']+)["']/i);
    if (!m) m = s.match(/<source[^>]*\bsrc=["']([^"']+)["']/i);
    if (!m) return null;
    const mapped = resolveMediaName(m[1]);
    return `${mediaBaseRel}/${mapped}`;
  };
  const extractVideoFromSound = (text) => {
    const s = String(text || '');
    const m = s.match(/\[sound:([^\]]+)\]/i);
    if (!m) return null;
    const name = resolveMediaName(m[1]);
    if (/\.(mp4|webm|ogv)$/i.test(name)) {
      return `${mediaBaseRel}/${name}`;
    }
    return null;
  };
  const extractAnyAudioFromFlds = (flds) => {
    if (!Array.isArray(flds)) return null;
    for (const f of flds) {
      const a = extractAudio(f) || extractAudioHtml(f);
      if (a) return a;
    }
    return null;
  };
  const extractAnyVideoFromFlds = (flds) => {
    if (!Array.isArray(flds)) return null;
    for (const f of flds) {
      const v = extractVideo(f);
      if (v) return v;
    }
    return null;
  };
  const extractAnyVideoFromSoundFlds = (flds) => {
    if (!Array.isArray(flds)) return null;
    for (const f of flds) {
      const v = extractVideoFromSound(f);
      if (v) return v;
    }
    return null;
  };
  const stripAudioTag = (text) => String(text || '').replace(/\[sound:[^\]]+\]/ig, '').trim();
  const stripVideoTag = (text) => String(text || '')
    .replace(/<video[^>]*>[\s\S]*?<\/video>/ig, '')
    .replace(/<source[^>]*>/ig, '')
    .trim();
  const countImgTags = (html) => {
    const s = String(html || '');
    const matches = s.match(/<img[^>]+src=(["']?)[^"'>\s]+\1[^>]*>/ig);
    return matches ? matches.length : 0;
  };
  const prefixImgSrc = (html) => {
    const s = String(html || '');
    let out = s.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/ig, (m, p1, src, p3) => {
      const val = String(src || '').trim();
      if (!val) return m;
      if (/^(https?:\/\/|data:|\/)/i.test(val)) return `${p1}${val}${p3}`;
      let clean = val.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
      clean = resolveMediaName(clean);
      return `${p1}${mediaBaseRel}/${clean}${p3}`;
    });
    out = out.replace(/(<img[^>]*\bsrc=)([^"'>\s]+)([^>]*>)/ig, (m, p1, src, p3) => {
      const val = String(src || '').trim();
      if (!val) return m;
      if (/^(https?:\/\/|data:|\/)/i.test(val)) return `${p1}${val}${p3}`;
      let clean = val.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
      clean = resolveMediaName(clean);
      return `${p1}${mediaBaseRel}/${clean}${p3}`;
    });
    return out;
  };

  const adb = new sqlite3.Database(collectionPath, sqlite3.OPEN_READONLY);
  const getAsync = (sql, params=[]) => new Promise((resolve, reject) => {
    adb.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
  const allAsync = (sql, params=[]) => new Promise((resolve, reject) => {
    adb.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });

  let countCards = null, countNotes = null;
  try { const r1 = await getAsync('SELECT COUNT(*) AS c FROM cards'); countCards = r1?.c ?? null; } catch {}
  try { const r2 = await getAsync('SELECT COUNT(*) AS c FROM notes'); countNotes = r2?.c ?? null; } catch {}

  let cards = []; let notes = [];
  try { cards = await allAsync('SELECT id AS cid, nid, did FROM cards'); } catch { cards = []; }
  try { notes = await allAsync('SELECT id, flds FROM notes'); } catch { notes = []; }

  const deckMap = {}; // FC200: importar como um único deck alvo
  const perDeck = { fc200: [] };
  for (const n of notes) {
    const flds = String(n.flds || '').split('\x1f');
    perDeck.fc200.push(flds);
  }

  const results = [];
  const totals = { cardsCreated: 0, audioRefs: 0, imageRefs: 0, videoRefs: 0 };
  const targetDeckName = 'FC 200 Japonês — S01';
  const existing = await query('SELECT id FROM decks WHERE user_id = $1 AND name = $2', [userId, targetDeckName]);
  let deckId;
  if (existing[0]?.id) {
    deckId = existing[0].id;
  } else {
    const ins = await query(
      'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, targetDeckName, 'Importado do Anki (FC200 S01)', 'ja', JSON.stringify(['import','anki','fc200'])]
    );
    deckId = getInsertId(ins);
  }

  let created = 0;
  for (const flds of perDeck.fc200) {
    const frontRaw = flds[0] || '';
    let backParts = [];
    if (flds[1]) backParts.push(flds[1]);
    if (flds[2]) backParts.push(flds[2]);
    if (flds.length > 3) {
      for (let i = 3; i < flds.length; i++) { const val = flds[i]; if (val) backParts.push(val); }
    }
    if (backParts.length === 0) backParts = flds.slice(1).filter(Boolean);
    const backRaw = (backParts.join('\n') || flds[0] || '').trim();

    const front_video_url = extractVideo(frontRaw) || extractAnyVideoFromFlds(flds) || extractVideoFromSound(frontRaw) || extractAnyVideoFromSoundFlds(flds);
    const back_video_url = extractVideo(backRaw) || extractAnyVideoFromFlds(flds) || extractVideoFromSound(backRaw) || extractAnyVideoFromSoundFlds(flds);

    const back_audio_url = extractAudio(backRaw) || extractAudioHtml(backRaw) || extractAnyAudioFromFlds(flds);
    const front_audio_url = front_video_url ? null : (extractAudio(frontRaw) || extractAudioHtml(frontRaw) || extractAnyAudioFromFlds(flds) || back_audio_url || null);

    if (front_audio_url) totals.audioRefs++;
    if (back_audio_url) totals.audioRefs++;
    if (front_video_url) totals.videoRefs = (totals.videoRefs || 0) + 1;
    if (back_video_url) totals.videoRefs = (totals.videoRefs || 0) + 1;
    totals.imageRefs += countImgTags(frontRaw) + countImgTags(backRaw);

    const front_text = prefixImgSrc(stripVideoTag(stripAudioTag(frontRaw)));
    const back_text = prefixImgSrc(stripVideoTag(stripAudioTag(backRaw)));

    const orderKey = null; // FC200 S01: não depende de ordenação por vídeo
    await query(
      `INSERT INTO cards (
        deck_id, front_text, back_text,
        front_audio_url, front_video_url,
        back_audio_url, back_video_url,
        video_order_key, hint, notes,
        ease_factor, interval_days, repetitions, due_date, last_reviewed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        deckId, front_text, back_text,
        front_audio_url, front_video_url,
        back_audio_url, back_video_url,
        orderKey, 'FC200 S01', null,
        2.5, 0, 0, new Date().toISOString().slice(0, 10), null
      ]
    );
    created++;
  }

  await query('UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [deckId]);
  totals.cardsCreated += created;
  results.push({ deckId, name: targetDeckName, createdCards: created });

  adb.close();
  return res.status(201).json({ message: 'FC200 importado com sucesso', requestId, results, totals, relApkgPath });
}));

// GET /api/flashcards/decks/:deckId/stats
router.get('/decks/:deckId/stats', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const deckId = req.params.deckId;
  await ensureDeckAccessible(deckId, userId);
  const rows = await query('SELECT repetitions, interval_days, due_date FROM cards WHERE deck_id = $1', [deckId]);
  let total = rows.length;
  let New = 0, Learn = 0, Review = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows) {
    const reps = Number(r.repetitions || 0);
    const interval = Number(r.interval_days || 0);
    const due = (r.due_date || '').toString().slice(0, 10);
    if (reps === 0) {
      New++;
    } else if (interval <= 3) {
      Learn++;
    } else {
      Review++;
    }
    // Caso queira considerar somente vencidos, trocar por:
    // if (reps === 0) New++
    // else if (due && due <= today && interval <= 3) Learn++
    // else if (due && due <= today && interval > 3) Review++
  }
  res.json({ total, New, Learn, Review });
}));

// ============================
// Seed: criar decks globais (todos os usuários)
// ============================
const seedGlobalDialogueDecks = async (sourceLang = 'en', targetLang = 'pt') => {
  try {
    const keys = listDialogueKeys(sourceLang);
    if (!keys || keys.length === 0) return;

    for (const dialogueKey of keys) {
      const deckName = `${toTitle(dialogueKey)} (${sourceLang} → ${targetLang})`;
      const existing = await query('SELECT id FROM decks WHERE name = $1 AND user_id IS NULL', [deckName]);
      if (existing[0]?.id) {
        // Reset: remover deck e seus cards para reconstruir com parsing correto
        const deckIdToReset = existing[0].id;
        await query('DELETE FROM cards WHERE deck_id = $1', [deckIdToReset]);
        await query('DELETE FROM decks WHERE id = $1', [deckIdToReset]);
      }

      const srcLines = readDialogueLines(sourceLang, dialogueKey);
      const tgtLines = readDialogueLines(targetLang, dialogueKey) || [];
      if (!srcLines || srcLines.length === 0) {
        continue;
      }

      const deckRows = await query(
        'INSERT INTO decks (user_id, name, description, language, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [
          null,
          deckName,
          `Deck padrão importado do diálogo ${dialogueKey}`,
          sourceLang,
          JSON.stringify(['dialogue', dialogueKey, 'global'])
        ]
      );
      const deckId = getInsertId(deckRows);

      for (let i = 0; i < srcLines.length; i++) {
        const front_text = srcLines[i];
        // Nunca gravar "Tradução indisponível"; usar a frente como fallback
        const back_text = tgtLines[i] || front_text;
        const front_audio_url = resolveAudioUrl(sourceLang, dialogueKey, i);
        const back_audio_url = null;

        const ease_factor = 2.5;
        const interval_days = 0;
        const repetitions = 0;
        const due_date = new Date().toISOString().slice(0, 10);
        const last_reviewed = null;

        await query(
          `INSERT INTO cards (
            deck_id, front_text, back_text,
            front_audio_url, back_audio_url,
            ease_factor, interval_days, repetitions, due_date, last_reviewed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            deckId, front_text, back_text,
            front_audio_url, back_audio_url,
            ease_factor, interval_days, repetitions, due_date, last_reviewed
          ]
        );
      }
    }
  } catch (e) {
    console.error('Falha ao criar decks globais:', e);
  }
};

// Inicializar seed de decks globais (EN → PT)
seedGlobalDialogueDecks().catch(() => {});

// Cleanup: substituir versos "Tradução indisponível" por fallback da frente
const cleanupDialogueFallbacks = async () => {
  try {
    // SQLite: tags é TEXT; usar LIKE para detectar decks de diálogo
    await query(
      `UPDATE cards
       SET back_text = front_text
       WHERE back_text = 'Tradução indisponível'
         AND deck_id IN (
           SELECT id FROM decks
           WHERE (tags LIKE '%dialogue%' OR name LIKE '%→%')
         )`
    );
  } catch (err) {
    console.error('Falha ao limpar versos com "Tradução indisponível":', err?.message || err);
  }
};

cleanupDialogueFallbacks().catch(() => {});

// Limpar duplicatas de decks globais de diálogo por chave
const cleanupDuplicateDialogueDecks = async () => {
  try {
    const rows = await query(
      'SELECT id, name, language, tags, updated_at FROM decks WHERE user_id IS NULL'
    );
    const byKey = new Map();
    const deriveKeyFromName = (nm) => {
      const baseName = String(nm || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const keys = listDialogueKeys('en');
      for (const k of keys) {
        if (toTitle(k).toLowerCase() === baseName.toLowerCase()) return k;
      }
      return null;
    };
    for (const row of rows) {
      const tags = parseTagsCompat(row?.tags);
      const isDialogue = Array.isArray(tags) && tags.includes('dialogue');
      const hasPattern = /\(([a-z]{2})\s*→\s*(ALL|[a-z]{2})\)/i.test(String(row?.name || ''));
      if (!isDialogue && !hasPattern) continue;
      const key = Array.isArray(tags) && tags[1] ? tags[1] : deriveKeyFromName(row.name);
      if (!key) continue;
      const lang = (row.language || 'en').toLowerCase();
      const groupKey = `${key}__${lang}`;
      if (!byKey.has(groupKey)) byKey.set(groupKey, []);
      byKey.get(groupKey).push(row);
    }
    for (const [groupKey, decks] of byKey.entries()) {
      if (decks.length <= 1) continue;
      decks.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      const toDelete = decks.slice(1);
      for (const d of toDelete) {
        try {
          await query('DELETE FROM cards WHERE deck_id = $1', [d.id]);
          await query('DELETE FROM decks WHERE id = $1', [d.id]);
        } catch (err) {
          console.error('Erro ao remover deck duplicado', d.id, err);
        }
      }
    }
  } catch (err) {
    console.error('cleanupDuplicateDialogueDecks error:', err);
  }
};

// ============================
// Limpeza de uploads APKG órfãos
// ============================
// POST /api/flashcards/uploads/apkg/cleanup - remove diretórios APKG do usuário sem referências em cards
router.post('/uploads/apkg/cleanup', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const root = path.join(__dirname, '..', 'uploads', 'apkg', String(userId));
  const removed = [];
  const kept = [];
  const errors = [];
  if (!fs.existsSync(root)) {
    return res.json({ removed, kept, errors, message: 'Nenhum diretório APKG encontrado para o usuário' });
  }
  let dirs = [];
  try {
    dirs = fs.readdirSync(root).filter((d) => {
      const p = path.join(root, d);
      try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
    });
  } catch (e) {
    const requestId = req.requestId;
    return res.status(500).json({
      code: 'APKG_DIR_LIST_FAILED',
      error: 'Falha ao listar diretórios APKG',
      message: e?.message || String(e),
      requestId
    });
  }
  for (const base of dirs) {
    try {
      const like = `%/uploads/apkg/${String(userId)}/${base}/%`;
      const [cntRow] = await query(
        `SELECT COUNT(*) AS cnt FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = $1)
         AND (front_text LIKE $2 OR back_text LIKE $2 OR front_audio_url LIKE $2 OR back_audio_url LIKE $2)`,
        [userId, like]
      );
      const cnt = Number((cntRow && (cntRow.cnt || cntRow.count)) || 0);
      const absDir = path.join(root, base);
      if (cnt === 0) {
        try {
          fs.rmSync(absDir, { recursive: true, force: true });
          removed.push(`/uploads/apkg/${userId}/${base}`);
        } catch (rmErr) {
          errors.push({ base, error: rmErr?.message || String(rmErr) });
        }
      } else {
        kept.push({ base, refs: cnt });
      }
    } catch (chkErr) {
      errors.push({ base, error: chkErr?.message || String(chkErr) });
    }
  }
  res.json({ removed, kept, errors, message: 'Limpeza de APKG concluída' });
}));

module.exports = router;