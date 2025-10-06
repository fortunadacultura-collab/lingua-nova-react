// Presets de layout para a página de estudo
// Inclui um perfil "Friends Classic" nomeado para fácil restauração

const extractMediaBase = (row) => {
  const candidates = [row.front_video_url, row.back_video_url, row.front_audio_url, row.back_audio_url];
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (!u) continue;
    const rel = u.replace(/^https?:\/\/[^/]+/, '');
    if (!rel.startsWith('/uploads/apkg/')) continue;
    return rel.replace(/\/[^/]+$/, '');
  }
  return '';
};

const extractEpisodeInfoCommon = (row, mediaBase) => {
  const episodeLabel = (() => {
    const h = String(row.hint || '').trim();
    if (h) return h;
    const m = String(mediaBase || '').match(/\/uploads\/apkg\/[^/]+\/([^/]+)\/extract\/media/i);
    if (m && m[1]) return m[1];
    return '';
  })();
  const dialogueIndex = (() => {
    const idStr = String(row.id || '');
    let m = idStr.match(/^v_\d+_(\d+)$/);
    if (m) return parseInt(m[1], 10);
    // Qualquer número no final do id
    m = idStr.match(/(\d{1,6})$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    // Procurar padrões nas URLs de mídia
    const urlText = [row.front_audio_url, row.back_audio_url, row.front_video_url, row.back_video_url]
      .map(u => String(u || '')).join(' ');
    let mx = urlText.match(/(?:^|[\\\/._-])line[_-]?(\d{1,6})(?=[\\\/._-]|\b)/i);
    if (mx) {
      const n = parseInt(mx[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    mx = urlText.match(/(?:^|[\\\/._-])dialogue[_-]?(\d{1,6})(?=[\\\/._-]|\b)/i);
    if (mx) {
      const n = parseInt(mx[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    // Último recurso: número final no nome do arquivo
    const names = [row.front_audio_url, row.back_audio_url, row.front_video_url, row.back_video_url]
      .map(u => String(u || '').split('/').pop());
    for (const nm of names) {
      const base = String(nm || '').replace(/\.[a-z0-9]+$/i, '');
      const nums = base.match(/(\d{1,6})/g);
      if (nums && nums.length) {
        const n = parseInt(nums[nums.length - 1], 10);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  })();
  // Extrair temporada e episódio de fontes diversas
  const sourcesText = [episodeLabel, row.notes, row.front_text, row.back_text]
    .map(x => String(x || '')).join(' ');
  const seasonEpisode = (() => {
    // SxxEyy
    const m1 = sourcesText.match(/S(\d+)\s*E(\d+)/i);
    if (m1) {
      const season = parseInt(m1[1], 10);
      const ep = parseInt(m1[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    // 1x01 (temporada x episódio)
    const m1x = sourcesText.match(/(\d{1,2})x(\d{1,2})/i);
    if (m1x) {
      const season = parseInt(m1x[1], 10);
      const ep = parseInt(m1x[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    // T1E01
    const mT = sourcesText.match(/T(\d{1,2})\s*E(\d{1,3})/i);
    if (mT) {
      const season = parseInt(mT[1], 10);
      const ep = parseInt(mT[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    // Season x + Ep y
    const m2 = sourcesText.match(/Season\s*(\d+)/i);
    const m3 = sourcesText.match(/\b(?:Ep|Episódio|Episode)\s*[:#-]?\s*(\d{1,3})/i);
    const m2pt = sourcesText.match(/Temporada\s*(\d+)/i);
    if (m2 && m3) {
      const season = parseInt(m2[1], 10);
      const ep = parseInt(m3[1], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    if (m2pt && m3) {
      const season = parseInt(m2pt[1], 10);
      const ep = parseInt(m3[1], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    // Deduções pelo caminho da mídia (ex.: .../Friends (Season 1)/extract/media)
    const seasonFromPath = (() => {
      const m = String(mediaBase || '').match(/Season\s*(\d+)/i) || String(mediaBase || '').match(/Temporada\s*(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    })();
    if (seasonFromPath && m3) {
      const ep = parseInt(m3[1], 10);
      if (!Number.isNaN(ep)) return { seasonNumber: seasonFromPath, episodeNumber: ep };
    }
    // Tentar extrair pelo hint também
    const seasonFromHint = (() => {
      const m = String(row.hint || '').match(/Season\s*(\d+)/i) || String(row.hint || '').match(/Temporada\s*(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    })();
    if (seasonFromHint && m3) {
      const ep = parseInt(m3[1], 10);
      if (!Number.isNaN(ep)) return { seasonNumber: seasonFromHint, episodeNumber: ep };
    }
    // Busca ampla nas URLs de mídia por SxxEyy e Eyy
    const urlText = [row.front_video_url, row.back_video_url, row.front_audio_url, row.back_audio_url]
      .map(u => String(u || '')).join(' ');
    const m4 = urlText.match(/S(\d{1,2})\s*E(\d{1,3})/i);
    if (m4) {
      const season = parseInt(m4[1], 10);
      const ep = parseInt(m4[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    const m4x = urlText.match(/(\d{1,2})x(\d{1,2})/i);
    if (m4x) {
      const season = parseInt(m4x[1], 10);
      const ep = parseInt(m4x[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    const m4T = urlText.match(/T(\d{1,2})\s*E(\d{1,3})/i);
    if (m4T) {
      const season = parseInt(m4T[1], 10);
      const ep = parseInt(m4T[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    // Padrões comuns: "E01", "Episode 01", separadores e underscores
    const epCandidates = urlText.match(/(?:^|[\/_\-])E(?:pisode)?\s*(\d{1,3})(?=[\/_\-\.\s]|$)/i);
    if (epCandidates) {
      const ep = parseInt(epCandidates[1], 10);
      const season = seasonFromPath || seasonFromHint || null;
      if (!Number.isNaN(ep)) return { seasonNumber: season, episodeNumber: ep };
    }
    return { seasonNumber: null, episodeNumber: null };
  })();
  const seasonNumber = seasonEpisode.seasonNumber;
  const episodeNumber = seasonEpisode.episodeNumber;
  const episodeOrder = (() => {
    const src = sourcesText;
    const m1 = src.match(/S(\d+)\s*E(\d+)/i);
    if (m1) {
      const season = parseInt(m1[1], 10);
      const ep = parseInt(m1[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(ep)) return season * 1000 + ep;
    }
    const m2 = src.match(/\b(?:Ep|Episódio|Episode)\s*[:#-]?\s*(\d{1,3})/i);
    if (m2) {
      const n = parseInt(m2[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    const m3 = src.match(/\bCap(?:ítulo)?\s*[:#-]?\s*(\d{1,3})/i);
    if (m3) {
      const n = parseInt(m3[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    const mediaNames = [row.front_audio_url, row.back_audio_url, row.front_video_url, row.back_video_url]
      .map(u => String(u || '').split('/').pop());
    for (const nm of mediaNames) {
      const m = String(nm || '').match(/(\d{1,3})/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n)) return n;
      }
    }
    if (dialogueIndex !== null) return dialogueIndex;
    return null;
  })();
  // Extrair ordem de cena com heurísticas: ignorar extensão (mp4/mp3), procurar "scene/cena", senão último número útil
  const extractSceneOrderFromName = (filename) => {
    const name = String(filename || '').trim();
    if (!name) return null;
    const base = name.replace(/\.[a-z0-9]+$/i, ''); // remove extensão para evitar pegar 4 de mp4/3 de mp3
    // Preferência: tokens explícitos de cena
    const mScene = base.match(/\b(?:scene|cena)[_\s-]?(\d{1,3})\b/i);
    if (mScene) {
      const n = parseInt(mScene[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    const mSc = base.match(/\bsc[_\s-]?(\d{1,3})\b/i);
    if (mSc) {
      const n = parseInt(mSc[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    const mClip = base.match(/\bclip[_\s-]?(\d{1,3})\b/i);
    if (mClip) {
      const n = parseInt(mClip[1], 10);
      if (!Number.isNaN(n)) return n;
    }
    // Senão, usar último número no nome (sem extensão)
    const nums = base.match(/(\d{1,4})/g);
    if (!nums || nums.length === 0) return null;
    const n = parseInt(nums[nums.length - 1], 10);
    return Number.isNaN(n) ? null : n;
  };
  const sceneOrder = (() => {
    const names = [row.front_video_url, row.back_video_url, row.front_audio_url, row.back_audio_url]
      .map(u => String(u || '').split('/').pop());
    const candidates = [];
    for (const nm of names) {
      const n = extractSceneOrderFromName(nm);
      if (n != null) candidates.push(n);
    }
    // Tentar extrair de hint/label
    const hintText = [row.hint, row.notes, episodeLabel].map(x => String(x || '')).join(' ');
    const mH1 = hintText.match(/\b(?:scene|cena)[_\s-]?(\d{1,3})\b/i);
    const mH2 = hintText.match(/\bsc[_\s-]?(\d{1,3})\b/i);
    const mH3 = hintText.match(/\bclip[_\s-]?(\d{1,3})\b/i);
    const hCands = [mH1, mH2, mH3].filter(Boolean).map(m => parseInt(m[1], 10)).filter(n => !Number.isNaN(n));
    candidates.push(...hCands);
    // Escolher o menor candidato para começar pela cena 1
    let best = candidates.length ? Math.min(...candidates) : null;
    // Fallback: usar índice interno do diálogo quando cena não existir
    if (best == null && dialogueIndex != null) return dialogueIndex;
    return best;
  })();
  const seasonEpisodeOrder = (seasonNumber != null && episodeNumber != null) ? (seasonNumber * 1000 + episodeNumber) : null;
  return { episodeLabel, episodeOrder, dialogueIndex, seasonNumber, episodeNumber, seasonEpisodeOrder, sceneOrder };
};

export const StudyLayouts = {
  default: {
    name: 'default',
    label: 'Default',
    isMatch: () => false,
    extractEpisodeInfo: extractEpisodeInfoCommon,
    sortComparator: (a, b) => {
      // Temporada/Episódio primeiro, quando disponível
      const aSE = a.seasonEpisodeOrder;
      const bSE = b.seasonEpisodeOrder;
      if (aSE != null || bSE != null) {
        if (aSE == null) return 1; // itens sem SE vão depois dos que possuem
        if (bSE == null) return -1;
        if (aSE !== bSE) return aSE - bSE;
      }

      // Dentro do mesmo episódio, seguir exatamente a ordem do MP4 quando disponível
      if (aSE != null && bSE != null && aSE === bSE) {
        const aVO = a.videoOrderKey;
        const bVO = b.videoOrderKey;
        if (aVO != null || bVO != null) {
          if (aVO == null) return 1;
          if (bVO == null) return -1;
          if (aVO !== bVO) return aVO - bVO;
        }
      }

      // Dentro do mesmo episódio, ordenar por ordem de cena e índice de diálogo
      if (aSE != null && bSE != null && aSE === bSE) {
        const aScene = a.sceneOrder;
        const bScene = b.sceneOrder;
        if (aScene != null && bScene != null && aScene !== bScene) return aScene - bScene;

        const aDlg = a.dialogueIndex;
        const bDlg = b.dialogueIndex;
        if (aDlg != null && bDlg != null && aDlg !== bDlg) return aDlg - bDlg;
      }

      // Fallback: usar ordem de episódio derivada
      const aEp = a.episodeOrder;
      const bEp = b.episodeOrder;
      if (aEp != null || bEp != null) {
        if (aEp == null) return 1; // sem episódio conhecido vai depois
        if (bEp == null) return -1;
        if (aEp !== bEp) return aEp - bEp;
      }

      // Último fallback: ordem original
      return a.origIndex - b.origIndex;
    }
  },
  friends_classic: {
    name: 'friends_classic',
    label: 'Friends Classic',
    isMatch: (rows = []) => {
      return rows.some(row => {
        const h = String(row.hint || '').toLowerCase();
        if (h.includes('friends')) return true;
        const mb = extractMediaBase(row);
        if (/friends\s*\(season/i.test(mb)) return true;
        const urls = [row.front_video_url, row.back_video_url, row.front_audio_url, row.back_audio_url].map(u => String(u || '').toLowerCase());
        return urls.some(u => u.includes('/friends') || /s\d+e\d+/.test(h));
      });
    },
    extractEpisodeInfo: extractEpisodeInfoCommon,
    sortComparator: (a, b) => {
      // Ordenar por temporada/episódio (ascendente)
      const aSE = a.seasonEpisodeOrder;
      const bSE = b.seasonEpisodeOrder;
      if (aSE != null || bSE != null) {
        if (aSE == null) return 1;
        if (bSE == null) return -1;
        if (aSE !== bSE) return aSE - bSE;
      }

      // Dentro do mesmo episódio, priorizar ordem do MP4
      if (aSE != null && bSE != null && aSE === bSE) {
        const aVO = a.videoOrderKey;
        const bVO = b.videoOrderKey;
        if (aVO != null || bVO != null) {
          if (aVO == null) return 1;
          if (bVO == null) return -1;
          if (aVO !== bVO) return aVO - bVO;
        }
      }

      // Dentro do mesmo episódio, priorizar cena e depois diálogo
      if (aSE != null && bSE != null && aSE === bSE) {
        const aScene = a.sceneOrder;
        const bScene = b.sceneOrder;
        if (aScene != null && bScene != null && aScene !== bScene) return aScene - bScene;

        const aDlg = a.dialogueIndex;
        const bDlg = b.dialogueIndex;
        if (aDlg != null && bDlg != null && aDlg !== bDlg) return aDlg - bDlg;
      }

      // Fallback: ordem de episódio simples
      const aEp = a.episodeOrder;
      const bEp = b.episodeOrder;
      if (aEp != null || bEp != null) {
        if (aEp == null) return 1;
        if (bEp == null) return -1;
        if (aEp !== bEp) return aEp - bEp;
      }

      // Último fallback: ordem original
      return a.origIndex - b.origIndex;
    }
  }
};

export function selectStudyLayout({ rows = [], override }) {
  const byName = override && StudyLayouts[override];
  if (byName) return byName;
  if (StudyLayouts.friends_classic.isMatch(rows)) return StudyLayouts.friends_classic;
  return StudyLayouts.default;
}

export function getLayoutNameFromQuery(search) {
  try {
    const params = new URLSearchParams(search || '');
    const layout = params.get('layout');
    return layout || '';
  } catch {
    return '';
  }
}