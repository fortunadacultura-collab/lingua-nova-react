import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { selectStudyLayout } from '../config/studyLayouts';
import '../styles/globals.css';
import '../styles/study.css';
import '../styles/ui.css';
import '../styles/dialogues.css';
import { apiFetch } from '../utils/apiBase';

const Study = () => {
  const { t, nativeLanguage } = useLanguage();
  const location = useLocation();
  const isNestedUnderFlashcards = location.pathname.startsWith('/flashcards');
  const { isAuthenticated } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ answered: 0, easy: 0, medium: 0, hard: 0 });
  const audioRefFront = useRef(null);
  const audioRefBack = useRef(null);
  const videoRefFront = useRef(null);
  const videoRefBack = useRef(null);

  // Exemplo de cards com suporte a texto, áudio e vídeo
  const sampleCards = useMemo(() => ([
    {
      id: 'c1',
      front: {
        text: 'Hello = Olá',
        audioUrl: '',
        videoUrl: ''
      },
      back: {
        text: 'Tradução correta: Olá',
        audioUrl: '',
        videoUrl: ''
      }
    },
    {
      id: 'c2',
      front: {
        text: 'Good morning = Bom dia',
        audioUrl: '',
        videoUrl: ''
      },
      back: {
        text: 'Resposta: Bom dia',
        audioUrl: '',
        videoUrl: ''
      }
    },
    {
      id: 'c3',
      front: {
        text: 'Vídeo: Como pronunciar “Thank you”',
        audioUrl: '',
        videoUrl: ''
      },
      back: {
        text: 'Pronúncia: /θæŋk juː/',
        audioUrl: '',
        videoUrl: ''
      }
    }
  ]), []);

  const [cards, setCards] = useState(sampleCards);
  const [deckName, setDeckName] = useState('');
  const [loadingCards, setLoadingCards] = useState(false);

  // Resolver URLs de mídia, adicionando prefixo quando for apenas nome de arquivo
  const resolveMediaUrl = (url) => {
    let u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u; // já absoluto
    // Se já é caminho conhecido, manter como está
    if (u.startsWith('/uploads/') || u.startsWith('/audio/')) {
      return u;
    }
    // Se parece ser apenas um nome de arquivo de mídia, prefixar uploads/apkg
    if (/^[^\s\/]+\.(mp3|wav|m4a|mp4|webm|ogv)$/i.test(u)) {
      return `/uploads/apkg/${u}`;
    }
    return u;
  };

  // Buscar cards do backend quando houver deckId na URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const deckId = params.get('deckId');
    const token = localStorage.getItem('linguanova_token');

    if (!deckId) return;

    const fetchCards = async () => {
      try {
        setLoadingCards(true);
        let data = null;

        // Tenta rota autenticada primeiro se houver token
        if (token) {
          const resp = await apiFetch(`/api/flashcards/decks/${deckId}/cards`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Target-Lang': nativeLanguage || ''
            }
          });
          if (resp.ok) {
            data = await resp.json();
          } else if (resp.status === 401 || resp.status === 403) {
            // Fallback para rota pública em dev
            const pub = await apiFetch(`/api/flashcards/public/decks/${deckId}/cards`, {
              headers: { 'X-Target-Lang': nativeLanguage || '' }
            });
            if (pub.ok) {
              data = await pub.json();
            } else {
              console.error('Erro ao buscar cards (public):', pub.status);
              return;
            }
          } else {
            console.error('Erro ao buscar cards:', resp.status);
            return;
          }
        } else {
          // Sem token: tenta direto a rota pública
          const pub = await apiFetch(`/api/flashcards/public/decks/${deckId}/cards`, {
            headers: { 'X-Target-Lang': nativeLanguage || '' }
          });
          if (pub.ok) {
            data = await pub.json();
          } else {
            console.error('Erro ao buscar cards (public):', pub.status);
            return;
          }
        }

        const isLikelyEpisodeTitle = (txt) => {
          const s = String(txt || '').trim();
          if (!s) return false;
          // Heurísticas comuns em títulos: Season, SxEy, "The One ..."
          if (/S\d+E\d+/i.test(s)) return true;
          if (/Season\s*\d+/i.test(s)) return true;
          // Títulos longos com "The One" no início costumam ser metadados
          if (/^Friends\s*S\d+E\d+\s*-\s*/i.test(s)) return true;
          return false;
        };

        // Selecionar preset de layout ativo (override via ?layout= e detecção Friends)
        const layoutOverride = (() => { try { const p = new URLSearchParams(location.search || ''); return p.get('layout') || ''; } catch { return ''; } })();
        const activeLayout = selectStudyLayout({ rows: Array.isArray(data?.cards) ? data.cards : [], override: layoutOverride });

        const mapped = Array.isArray(data?.cards) ? data.cards.map((row, origIndex) => {
          // Descobrir a base de mídia do deck (ex.: /uploads/apkg/<user>/<deck>/extract/media)
          const discoverMediaBase = () => {
            const candidates = [row.front_video_url, row.back_video_url, row.front_audio_url, row.back_audio_url];
            for (const c of candidates) {
              const u = String(c || '').trim();
              if (!u) continue;
              // Remover host absoluto se houver
              const rel = u.replace(/^https?:\/\/[^/]+/, '');
              // Só considerar caminhos sob /uploads/apkg
              if (!rel.startsWith('/uploads/apkg/')) continue;
              // Base = diretório do arquivo
              const baseDir = rel.replace(/\/[^/]+$/, '');
              // Se a base terminar com /extract/media, é ideal
              return baseDir;
            }
            return '';
          };
          const mediaBase = discoverMediaBase();
          const resolveWithBase = (url) => {
            let u = String(url || '').trim();
            if (!u) return '';
            if (/^https?:\/\//i.test(u)) return u; // já absoluto
            if (u.startsWith('/uploads/') || u.startsWith('/audio/')) return u;
            // filename simples: usar base do deck se disponível
            if (/^[^\s\/]+\.(mp3|wav|m4a|mp4|webm|ogv)$/i.test(u)) {
              if (mediaBase) return `${mediaBase}/${u}`;
              return `/uploads/apkg/${u}`; // fallback genérico
            }
            return u;
          };
          // Texto da frente: se parecer título de episódio, usar a primeira linha (inglês) do verso
          const rawFrontText = String(row.front_text || '');
          const rawBackText = String(row.back_text || '');
          const englishLineFromBack = rawBackText.split('\n')[0] || '';
          const frontText = isLikelyEpisodeTitle(rawFrontText) && englishLineFromBack
            ? englishLineFromBack
            : rawFrontText;

          // Resolver URLs
          const audioFrontResolved = resolveWithBase(row.front_audio_url || (row.front_video_url ? '' : row.back_audio_url) || '');
          let videoFrontResolved = resolveWithBase(row.front_video_url || '');
          // Se o "áudio" vier como .mp4, tratar como vídeo para garantir reprodução
          if (!videoFrontResolved && /\.mp4($|\?)/i.test(String(audioFrontResolved))) {
            videoFrontResolved = audioFrontResolved;
          }
          // Fallback: alguns APKGs referenciam vídeo via [sound:arquivo.mp4] em campos de texto.
          if (!videoFrontResolved) {
            const extractVideoFromSoundTag = (text) => {
              const m = String(text || '').match(/\[sound:\s*([^\]]+)\s*\]/i);
              if (!m) return '';
              const name = String(m[1] || '').trim();
              if (/\.(mp4|webm|ogv)(\s*$|\?|#)/i.test(name)) return resolveWithBase(name);
              return '';
            };
            const vFromFront = extractVideoFromSoundTag(rawFrontText);
            const vFromBack = vFromFront ? '' : extractVideoFromSoundTag(rawBackText);
            videoFrontResolved = vFromFront || vFromBack || '';
          }
          // Fallback extra: se ainda não houver vídeo na frente, usar o do verso
          // Função para derivar vídeo do verso, inclusive via áudio .mp4 ou tag [sound:]
          const deriveBackVideoCandidate = () => {
            let v = resolveWithBase(row.back_video_url || '');
            const a = resolveWithBase(row.back_audio_url || '');
            if (!v && /\.mp4($|\?)/i.test(String(a))) v = a;
            if (!v) {
              const extractVideoFromSoundTag = (text) => {
                const m = String(text || '').match(/\[sound:\s*([^\]]+)\s*\]/i);
                if (!m) return '';
                const name = String(m[1] || '').trim();
                if (/\.(mp4|webm|ogv)(\s*$|\?|#)/i.test(name)) return resolveWithBase(name);
                return '';
              };
              v = extractVideoFromSoundTag(rawBackText) || extractVideoFromSoundTag(rawFrontText) || '';
            }
            return v;
          };
          // Fallback: usar candidato do verso mesmo quando back_video_url estiver vazio
          if (!videoFrontResolved) {
            const backVideoCandidate = deriveBackVideoCandidate();
            if (backVideoCandidate) videoFrontResolved = backVideoCandidate;
          }
          // Se promovemos o áudio para vídeo, não manter o áudio para evitar duplicidade
          const audioFrontFinal = (videoFrontResolved === audioFrontResolved) ? '' : audioFrontResolved;

          // Extrair etiqueta de episódio e ordem via preset ativo
          const epi = activeLayout.extractEpisodeInfo(row, mediaBase);
          const episodeLabel = epi.episodeLabel;
          const dialogueIndex = epi.dialogueIndex;
          const episodeOrder = epi.episodeOrder;
          const seasonNumber = epi.seasonNumber;
          const episodeNumber = epi.episodeNumber;
          const seasonEpisodeOrder = epi.seasonEpisodeOrder;
          const sceneOrder = epi.sceneOrder;

          // Extrair chave de ordenação diretamente do MP4 escolhido para frente
          const videoOrderKey = (() => {
            const src = videoFrontResolved || deriveBackVideoCandidate() || '';
            const fname = String(src).split('/').pop() || '';
            const base = fname.replace(/\.[a-z0-9]+$/i, '');
            // Formato com pontos e intervalo: 0.MM.SS.mmm-0.MM.SS.mmm
            const mDotRange = base.match(/(\d+)\.(\d{2})\.(\d{2})\.(\d{3})-(\d+)\.(\d{2})\.(\d{2})\.(\d{3})/);
            if (mDotRange) {
              const hh = parseInt(mDotRange[1], 10) || 0;
              const mm = parseInt(mDotRange[2], 10) || 0;
              const ss = parseInt(mDotRange[3], 10) || 0;
              const ms = parseInt(mDotRange[4], 10) || 0;
              return (hh * 3600000) + (mm * 60000) + (ss * 1000) + ms;
            }
            // Formato com pontos single timestamp: 0.MM.SS.mmm
            const mDot = base.match(/(\d+)\.(\d{2})\.(\d{2})\.(\d{3})/);
            if (mDot) {
              const hh = parseInt(mDot[1], 10) || 0;
              const mm = parseInt(mDot[2], 10) || 0;
              const ss = parseInt(mDot[3], 10) || 0;
              const ms = parseInt(mDot[4], 10) || 0;
              return (hh * 3600000) + (mm * 60000) + (ss * 1000) + ms;
            }
            // Padrão HH_MM_SS_ms -> converter para milissegundos
            const mTime = base.match(/^(\d{1,2})[_-](\d{1,2})[_-](\d{1,2})(?:[_-](\d{1,6}))?$/);
            if (mTime) {
              const hh = parseInt(mTime[1], 10) || 0;
              const mm = parseInt(mTime[2], 10) || 0;
              const ss = parseInt(mTime[3], 10) || 0;
              const ms = mTime[4] ? parseInt(mTime[4], 10) || 0 : 0;
              return (hh * 3600000) + (mm * 60000) + (ss * 1000) + ms;
            }
            // Caso geral: números no nome — pegar o último, priorizando números longos
            const nums = base.match(/(\d{3,12})/g);
            if (nums && nums.length) {
              const n = parseInt(nums[nums.length - 1], 10);
              if (!Number.isNaN(n)) return n;
            }
            return null;
          })();

          return {
            id: row.id,
            front: {
              text: frontText,
              audioUrl: audioFrontFinal,
              videoUrl: videoFrontResolved
            },
            back: {
              text: rawBackText,
              // Resolver mídia do verso: promover MP4 a vídeo quando aplicável
              audioUrl: (() => {
                const a = resolveWithBase(row.back_audio_url || '');
                const v = resolveWithBase(row.back_video_url || '');
                // Se vamos usar o áudio como vídeo, não retornar áudio
                if (!v && /\.mp4($|\?)/i.test(String(a))) return '';
                return a;
              })(),
              videoUrl: deriveBackVideoCandidate()
            },
            hint: row.hint || row.notes || '',
            episodeLabel,
            episodeOrder,
            dialogueIndex,
            seasonNumber,
            episodeNumber,
            seasonEpisodeOrder,
            sceneOrder,
            videoOrderKey,
            origIndex
          };
          // Debug: logar URLs resolvidas para diagnóstico (dev)
          try {
            console.debug('[Study] Media map', {
              cardId: row.id,
              mediaBase,
              frontAudio: audioFrontResolved,
              frontVideo: videoFrontResolved,
              backAudio: row.back_audio_url,
              backVideo: row.back_video_url,
              backVideoCandidate: deriveBackVideoCandidate()
            });
          } catch (_) {}
        }) : [];

        // Ordenar por episódio/diálogo mantendo estabilidade de origem
        const sorted = mapped.slice().sort(activeLayout.sortComparator);
        // Normalizar índices de diálogo iniciando em 0 dentro de cada episódio
        const normalized = (() => {
          const result = [];
          let lastKey = null;
          let counter = 0;
          const makeKey = (c) => {
            if (c?.seasonNumber != null && c?.episodeNumber != null) return `S${c.seasonNumber}E${c.episodeNumber}`;
            if (typeof c?.seasonEpisodeOrder === 'number') return `SEO:${c.seasonEpisodeOrder}`;
            if (c?.episodeLabel) return `L:${String(c.episodeLabel).trim()}`;
            if (typeof c?.episodeOrder === 'number') return `EO:${c.episodeOrder}`;
            return '__none__';
          };
          for (const c of sorted) {
            const k = makeKey(c);
            if (k !== lastKey) { lastKey = k; counter = 0; }
            result.push({ ...c, dialogueDisplayIndex: counter });
            counter += 1;
          }
          return result;
        })();

        if (normalized.length > 0) {
          setCards(normalized);
          setCurrentIndex(0);
          setRevealed(false);
        } else {
          setCards(sampleCards);
        }

        // Definir nome do deck se veio no payload da rota pública
        const deckInfo = data?.deck;
        if (deckInfo?.name) setDeckName(deckInfo.name);
        else if (token) {
          // Buscar nome do deck autenticado se possível
          const decksResp = await apiFetch('/api/flashcards/decks', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Target-Lang': nativeLanguage || ''
            }
          });
          if (decksResp.ok) {
            const decksData = await decksResp.json();
            const list = Array.isArray(decksData.decks) ? decksData.decks : [];
            const d = list.find((x) => String(x.id) === String(deckId));
            if (d?.display_name || d?.name) setDeckName(d.display_name || d.name);
          }
        }
      } catch (err) {
        console.error('Falha ao carregar cards:', err);
      } finally {
        setLoadingCards(false);
      }
    };

    fetchCards();
  }, [location.search, isAuthenticated, sampleCards, nativeLanguage]);

  const currentCard = cards[currentIndex];

  // Remover imagens da frente para que só apareçam no verso
  const stripFrontImages = (html) => {
    const s = String(html || '');
    return s.replace(/<img[^>]*>/ig, '');
  };

  // Formata legendas bilíngues: força PT na linha abaixo da EN
  const formatCaptionHTML = (html) => {
    const s = String(html || '').trim();
    if (!s) return '';
    // Já possui quebra explícita? mantém
    if (/\n|<br\s*\/?>/i.test(s)) return s;

    // Remover tags para decidir com base no texto puro
    const plain = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Separadores comuns "en = pt" ou "en - pt"
    const sepSplit = plain.split(/\s*(?:=|\||—|–|-)\s*/);
    if (sepSplit.length === 2) {
      return `${sepSplit[0]}<br />${sepSplit[1]}`;
    }

    // Quebra por pontuação se o trecho seguinte aparenta ser PT
    const m = plain.match(/^(.*?[.!?]+)\s+(.*)$/);
    if (m) {
      const first = m[1];
      const second = m[2];
      const looksPt = /[áéíóúãõâêôç]|\b(você|eu|ela|ele|nós|vocês|eles|elas|então|ok|sim|não|que|pra|estou|tirando|queria|disse)\b/i.test(second);
      if (looksPt) {
        return `${first}<br />${second}`;
      }
    }

    // fallback: inserir quebra após pontuação antes de termos PT em HTML
    return s.replace(/([.!?])\s+(?=[^<]*(?:[áéíóúãõâêôç]|\b(você|eu|ela|ele|nós|vocês|eles|elas|então|ok|sim|não)\b))/i, '$1<br /> ');
  };

  // Extrai somente a parte em Português para exibir no verso
  const extractPortuguese = (html) => {
    const s = String(html || '').trim();
    if (!s) return '';
    // Se houver quebras explícitas, assumir que a tradução vem após a primeira quebra
    const brSplit = s.split(/<br\s*\/?>|\n/);
    if (brSplit.length > 1) {
      const candidate = brSplit.slice(1).join(' ').trim();
      const looksPt = /[áéíóúãõâêôç]|\b(você|eu|ela|ele|nós|vocês|eles|elas|então|ok|sim|não|que|pra|estou|tirando|queria|disse|porque|agora|isso|aquilo|aqui|ali|vamos|tá|tudo|bem|o|a|os|as|um|uma|de|do|da|dos|das|para|por|com|sem|e|ou|mas|também|muito|pouco|meu|minha|meus|minhas|seu|sua|seus|suas|dele|dela|perna)\b/i.test(candidate);
      if (looksPt) return candidate;
    }
    const plain = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Separadores comuns "en = pt", "en - pt", "en : pt"
    const sepSplit = plain.split(/\s*(?:=|\||—|–|-|:)\s*/);
    if (sepSplit.length >= 2) {
      const tail = sepSplit.slice(1).join(' ').trim();
      const looksPt = /[áéíóúãõâêôç]|\b(você|eu|ela|ele|nós|vocês|eles|elas|então|ok|sim|não|que|pra|estou|tirando|queria|disse|porque|agora|isso|aquilo|aqui|ali|vamos|tá|tudo|bem|o|a|os|as|um|uma|de|do|da|dos|das|para|por|com|sem|e|ou|mas|também|muito|pouco|meu|minha|meus|minhas|seu|sua|seus|suas|dele|dela|perna)\b/i.test(tail);
      if (looksPt) return tail;
    }
    // Quebra por pontuação: pegar o trecho após a primeira sentença, se parecer PT
    const m = plain.match(/^(.*?[.!?]+)\s+(.*)$/);
    if (m) {
      const first = m[1].trim();
      const second = m[2].trim();
      const looksPt = /[áéíóúãõâêôç]|\b(você|eu|ela|ele|nós|vocês|eles|elas|então|ok|sim|não|que|pra|estou|tirando|queria|disse|porque|agora|isso|aquilo|aqui|ali|vamos|tá|tudo|bem|o|a|os|as|um|uma|de|do|da|dos|das|para|por|com|sem|e|ou|mas|também|muito|pouco|meu|minha|meus|minhas|seu|sua|seus|suas|dele|dela|perna)\b/i.test(second);
      if (looksPt) return second;
      // Se o primeiro trecho parece claramente inglês, prefira o segundo
      const looksEnFirst = /\b(the|a|an|you|he|she|her|his|say|said|leg|do|to|of|and|is|are|not|in|on|with)\b/i.test(first);
      if (looksEnFirst) return second;
    }
    // Se só houver PT, retornar tudo
    const looksPtWhole = /[áéíóúãõâêôç]|\b(você|eu|ela|ele|nós|vocês|eles|elas|então|ok|sim|não|que|pra|estou|tirando|queria|disse|porque|agora|isso|aquilo|aqui|ali|vamos|tá|tudo|bem|o|a|os|as|um|uma|de|do|da|dos|das|para|por|com|sem|e|ou|mas|também|muito|pouco|meu|minha|meus|minhas|seu|sua|seus|suas|dele|dela|perna)\b/i.test(plain);
    if (looksPtWhole) return plain;
    // Fallback: retornar texto sem alteração
    return plain;
  };

  // Utilitários para extrair/limpar imagens do HTML
  const getFirstImageSrc = (html) => {
    const m = String(html || '').match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    return m ? m[1] : '';
  };
  const stripImages = (html) => String(html || '').replace(/<img[^>]*>/ig, '');

  // Preparar áudio da frente ao trocar de card (com auto-play quando na frente)
  const [frontIsPlaying, setFrontIsPlaying] = useState(false);
  const [backIsPlaying, setBackIsPlaying] = useState(false);
  const [frontVideoPlaying, setFrontVideoPlaying] = useState(false);
  const [backVideoPlaying, setBackVideoPlaying] = useState(false);
  useEffect(() => {
    if (audioRefFront.current && currentCard?.front?.audioUrl) {
      try {
        audioRefFront.current.load();
        audioRefFront.current.currentTime = 0;
      } catch {}
      if (!revealed) {
        try {
          const p = audioRefFront.current.play();
          setFrontIsPlaying(true);
          if (p && typeof p.then === 'function') {
            p.catch(() => { setFrontIsPlaying(false); });
          }
        } catch { setFrontIsPlaying(false); }
      } else {
        setFrontIsPlaying(false);
      }
    }
  }, [currentIndex, revealed, currentCard]);

  // Garantir que o ícone volte para "play" quando o áudio terminar ou pausar
  useEffect(() => {
    const audio = audioRefFront.current;
    if (!audio) return;
    const handleEnded = () => { setFrontIsPlaying(false); };
    const handlePause = () => { setFrontIsPlaying(false); };
    const handlePlay = () => { setFrontIsPlaying(true); };
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [currentCard, revealed]);

  // Autoplay do vídeo da frente ao carregar o card
  useEffect(() => {
    const video = videoRefFront.current;
    if (!video || !currentCard?.front?.videoUrl) return;
    try {
      video.load();
      // Iniciar já com áudio habilitado
      video.muted = false;
      video.volume = 1;
      video.currentTime = 0;
    } catch {}
    if (!revealed) {
      try {
        const p = video.play();
        setFrontVideoPlaying(true);
        if (p && typeof p.then === 'function') {
          p.catch(() => { setFrontVideoPlaying(false); });
        }
      } catch { setFrontVideoPlaying(false); }
    } else {
      setFrontVideoPlaying(false);
    }
  }, [currentIndex, revealed, currentCard]);

  // Autoplay do vídeo do verso ao revelar a resposta
  useEffect(() => {
    const video = videoRefBack.current;
    if (!video || !currentCard?.back?.videoUrl) return;
    try {
      video.load();
      video.muted = false;
      video.volume = 1;
      video.currentTime = 0;
    } catch {}
    if (revealed) {
      try {
        const p = video.play();
        setBackVideoPlaying(true);
        if (p && typeof p.then === 'function') {
          p.catch(() => { setBackVideoPlaying(false); });
        }
      } catch { setBackVideoPlaying(false); }
    } else {
      setBackVideoPlaying(false);
    }
  }, [currentIndex, revealed, currentCard]);

  // Removida lógica de desbloqueio por gesto: iniciamos desmutado desde o início

  // Atualiza estado do botão de vídeo da frente conforme eventos do vídeo
  useEffect(() => {
    const video = videoRefFront.current;
    if (!video) return;
    const handleEnded = () => { setFrontVideoPlaying(false); };
    const handlePause = () => { setFrontVideoPlaying(false); };
    const handlePlay = () => { setFrontVideoPlaying(true); };
    video.addEventListener('ended', handleEnded);
    video.addEventListener('pause', handlePause);
    video.addEventListener('play', handlePlay);
    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('play', handlePlay);
    };
  }, [currentCard, revealed]);

  // Atualiza estado do botão de vídeo do verso conforme eventos do vídeo
  useEffect(() => {
    const video = videoRefBack.current;
    if (!video) return;
    const handleEnded = () => { setBackVideoPlaying(false); };
    const handlePause = () => { setBackVideoPlaying(false); };
    const handlePlay = () => { setBackVideoPlaying(true); };
    video.addEventListener('ended', handleEnded);
    video.addEventListener('pause', handlePause);
    video.addEventListener('play', handlePlay);
    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('play', handlePlay);
    };
  }, [currentCard, revealed]);

  // Atualiza estado do botão do verso conforme eventos do áudio
  useEffect(() => {
    const audio = audioRefBack.current;
    if (!audio) return;
    const handleEnded = () => { setBackIsPlaying(false); };
    const handlePause = () => { setBackIsPlaying(false); };
    const handlePlay = () => { setBackIsPlaying(true); };
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [currentCard, revealed]);

  const handleReveal = () => {
    setRevealed(true);
    // Pausar áudio da frente e preparar mídia da resposta
    if (audioRefFront.current) {
      try { audioRefFront.current.pause(); } catch {}
    }
  };

  // Reproduzir novamente o vídeo da frente (reiniciar e tocar)
  const replayFrontVideo = () => {
    const video = videoRefFront.current;
    if (!video || !currentCard?.front?.videoUrl) return;
    try { video.load(); } catch {}
    try {
      // Ao acionar pelo botão, habilitar áudio do vídeo
      video.muted = false;
      video.volume = 1;
      video.currentTime = 0;
      const p = video.play();
      setFrontVideoPlaying(true);
      if (p && typeof p.then === 'function') {
        p.catch(() => { setFrontVideoPlaying(false); });
      }
    } catch { setFrontVideoPlaying(false); }
  };

  // Reproduzir novamente o vídeo do verso (reiniciar e tocar)
  const replayBackVideo = () => {
    const video = videoRefBack.current;
    if (!video || !currentCard?.back?.videoUrl) return;
    try { video.load(); } catch {}
    try {
      video.muted = false;
      video.volume = 1;
      video.currentTime = 0;
      const p = video.play();
      setBackVideoPlaying(true);
      if (p && typeof p.then === 'function') {
        p.catch(() => { setBackVideoPlaying(false); });
      }
    } catch { setBackVideoPlaying(false); }
  };

  const nextCard = () => {
    const nextIndex = (currentIndex + 1) % cards.length;
    setCurrentIndex(nextIndex);
    setRevealed(false);
    // Garantir que áudios sejam pausados ao trocar de card
    if (audioRefFront.current) { try { audioRefFront.current.pause(); } catch {} }
    if (audioRefBack.current) { try { audioRefBack.current.pause(); } catch {} }
    if (videoRefFront.current) { try { videoRefFront.current.pause(); } catch {} }
    if (videoRefBack.current) { try { videoRefBack.current.pause(); } catch {} }
    setFrontIsPlaying(false);
    setBackIsPlaying(false);
    setFrontVideoPlaying(false);
    setBackVideoPlaying(false);
  };

  const prevCard = () => {
    const prevIndex = (currentIndex - 1 + cards.length) % cards.length;
    setCurrentIndex(prevIndex);
    setRevealed(false);
    if (audioRefFront.current) { try { audioRefFront.current.pause(); } catch {} }
    if (audioRefBack.current) { try { audioRefBack.current.pause(); } catch {} }
    if (videoRefFront.current) { try { videoRefFront.current.pause(); } catch {} }
    if (videoRefBack.current) { try { videoRefBack.current.pause(); } catch {} }
    setFrontIsPlaying(false);
    setBackIsPlaying(false);
    setFrontVideoPlaying(false);
    setBackVideoPlaying(false);
  };

  const restartSession = () => {
    setCurrentIndex(0);
    setRevealed(false);
    setStats({ answered: 0, easy: 0, medium: 0, hard: 0 });
    if (audioRefFront.current) { try { audioRefFront.current.pause(); } catch {} }
    if (audioRefBack.current) { try { audioRefBack.current.pause(); } catch {} }
    if (videoRefFront.current) { try { videoRefFront.current.pause(); } catch {} }
    if (videoRefBack.current) { try { videoRefBack.current.pause(); } catch {} }
    setFrontIsPlaying(false);
    setBackIsPlaying(false);
    setFrontVideoPlaying(false);
    setBackVideoPlaying(false);
  };

  const toggleFrontPlay = () => {
    const audio = audioRefFront.current;
    if (!audio || !currentCard?.front?.audioUrl) return;
    if (audio.paused) {
      try { audio.load(); } catch {}
      try {
        audio.currentTime = 0;
        const p = audio.play();
        setFrontIsPlaying(true);
        if (p && typeof p.then === 'function') {
          p.catch(() => { setFrontIsPlaying(false); });
        }
      } catch { setFrontIsPlaying(false); }
    } else {
      try { audio.pause(); } catch {}
      setFrontIsPlaying(false);
    }
  };

  const toggleBackPlay = () => {
    const audio = audioRefBack.current;
    if (!audio || !currentCard?.back?.audioUrl) return;
    if (audio.paused) {
      try { audio.load(); } catch {}
      try {
        audio.muted = false;
        audio.volume = 1;
        audio.currentTime = 0;
        const p = audio.play();
        setBackIsPlaying(true);
        if (p && typeof p.then === 'function') {
          p.catch(() => { setBackIsPlaying(false); });
        }
      } catch { setBackIsPlaying(false); }
    } else {
      try { audio.pause(); } catch {}
      setBackIsPlaying(false);
    }
  };

  const handleRate = (level) => {
    // Atualiza estatísticas e avança
    setStats(prev => ({
      answered: prev.answered + 1,
      easy: prev.easy + (level === 'easy' ? 1 : 0),
      medium: prev.medium + (level === 'medium' ? 1 : 0),
      hard: prev.hard + (level === 'hard' ? 1 : 0),
    }));

    // Exemplo de integração futura com SM-2 / agendamento (placeholder)
    // scheduleNextReview(currentCard.id, level)

    // Avança suavemente
    setTimeout(nextCard, 150);
  };

  // Atalhos de teclado: espaço = revelar; 1/2/3 = difícil/médio/fácil
  useEffect(() => {
    const onKeyDown = (e) => {
      // Atalho para play/pause do áudio da frente (P)
      if (e.key && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (!revealed) {
          if (currentCard?.front?.videoUrl) {
            replayFrontVideo();
          } else {
            toggleFrontPlay();
          }
        } else {
          if (currentCard?.back?.videoUrl) {
            replayBackVideo();
          } else {
            toggleBackPlay();
          }
        }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (!revealed) handleReveal();
      }
      if (!revealed) return; // Só permite rating após revelar
      if (e.key === '1') handleRate('hard');
      if (e.key === '2') handleRate('medium');
      if (e.key === '3') handleRate('easy');
      if (e.key === 'ArrowRight') nextCard();
      if (e.key === 'ArrowLeft') prevCard();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed, currentIndex]);

  return (
    <div className="study-page">
      {!isNestedUnderFlashcards && (
        <div className="page-header">
          <h1>
            <i className="fas fa-graduation-cap"></i>
            {t('navStudy', 'Estudar')}
          </h1>
          <p>{t('studyPageDesc', 'Pratique com seus flashcards')}</p>
        </div>
      )}

      {/* Navegação de páginas quando fora do container de Flashcards */}
      {!isNestedUnderFlashcards && (
        <div className="toolbar" style={{ margin: '0 1rem 1rem 1rem' }}>
          <Link to="/flashcards" className="toolbar-btn">
            <i className="fas fa-layer-group"></i>
            <span>{t('pageTitle_flashcards', 'Flashcards')}</span>
          </Link>
          <Link to="/flashcards/my-decks" className="toolbar-btn">
            <i className="fas fa-layer-group"></i>
            <span>{t('navMyDecks', 'Meus Decks')}</span>
          </Link>
          <Link to="/flashcards/new-deck" className="toolbar-btn">
            <i className="fas fa-plus-circle"></i>
            <span>{t('navNewDeck', 'Novo Deck')}</span>
          </Link>
          <Link to="/flashcards/add-cards" className="toolbar-btn">
            <i className="fas fa-plus"></i>
            <span>{t('navAddCards', 'Adicionar Cards')}</span>
          </Link>
          <Link to="/flashcards/import-export" className="toolbar-btn">
            <i className="fas fa-file-export"></i>
            <span>{t('navImportExport', 'Importar/Exportar')}</span>
          </Link>
        </div>
      )}

      <div className="container">
        {/* Toolbar de sessão compacta */}
        <div className="session-toolbar" aria-label={t('sessionControls','Controles da sessão')}>
          <button className="toolbar-btn prev" onClick={prevCard} title={t('previous','Anterior')}>
            <i className="fas fa-arrow-left"></i>
            <span>{t('previous','Anterior')}</span>
          </button>
          <button className="toolbar-btn restart" onClick={restartSession} title={t('restart','Reiniciar')}>
            <i className="fas fa-undo"></i>
            <span>{t('restart','Reiniciar')}</span>
          </button>
          <button className="toolbar-btn next" onClick={nextCard} title={t('next','Próximo')}>
            <i className="fas fa-arrow-right"></i>
            <span>{t('next','Próximo')}</span>
          </button>
        </div>
        {/* Progresso da sessão */}
        <div className="study-progress" style={{ marginBottom: '1rem' }}>
          <div className="progress-header">
            <div>
              <span className="progress-title">{t('studyProgress', 'Progresso')}</span>
            </div>
            <div className="progress-stats">
              {t('cards', 'Cards')}: {currentIndex + 1}/{cards.length} · {t('answered', 'Respondidos')}: {stats.answered}
            </div>
          </div>
          <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${cards.length ? (((currentIndex + 1) / cards.length) * 100) : 0}%` }}></div>
        </div>
        </div>

        {/* Área do flashcard com flip */}
        <div 
          className={`flashcard ${revealed ? 'flipped' : ''}`} 
          role="button" 
          aria-label="Flashcard" 
          onClick={() => { 
            if (!revealed) { 
              handleReveal(); 
            } else {
              // Voltar para a frente
              setRevealed(false);
              if (audioRefBack.current) { try { audioRefBack.current.pause(); } catch {} }
              setBackIsPlaying(false);
            }
          }}
        >
          {/* Frente */}
          <div className="flashcard-face flashcard-front">
            {deckName ? (
              <div
                className="dialogue-title-hint"
                style={{
                  position: 'absolute',
                  top: '0.5rem',
                  left: '0.5rem',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.35)',
                  color: '#fff',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  backdropFilter: 'blur(2px)'
                }}
              >
                {deckName}
              </div>
            ) : null}
            {(() => {
              const hasSE = (currentCard?.seasonNumber != null && currentCard?.episodeNumber != null);
              const base = (currentCard?.episodeLabel || currentCard?.hint || '').trim();
              const seText = hasSE ? `S${currentCard.seasonNumber}E${currentCard.episodeNumber}` : '';
              const sceneExplicit = (typeof currentCard?.sceneOrder === 'number') ? currentCard.sceneOrder : null;
              const sceneFallback = (() => {
                if (sceneExplicit != null) return null;
                if (typeof currentCard?.episodeOrder === 'number') return currentCard.episodeOrder;
                if (typeof currentCard?.origIndex === 'number') return currentCard.origIndex + 1; // 1-based para visual
                return null;
              })();
              const scene = sceneExplicit != null ? sceneExplicit : sceneFallback;
              const dlg = (typeof currentCard?.dialogueIndex === 'number')
                ? currentCard.dialogueIndex
                : null; // número global do diálogo
              // Preferir índice normalizado por episódio (1-based) quando disponível
              const dlgDisplay = (typeof currentCard?.dialogueDisplayIndex === 'number')
                ? (currentCard.dialogueDisplayIndex + 1)
                : dlg;
              const parts = [];
              if (base) parts.push(base);
              if (seText) parts.push(seText);
              if (scene != null) parts.push(`${t('scene','Cena')} ${scene}`);
              if (dlgDisplay != null) parts.push(`${t('dialogue','Diálogo')} ${dlgDisplay}`);
              const badgeText = parts.join(' · ');
              return badgeText ? (
                <div
                  className="episode-badge"
                  title={badgeText}
                  style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    background: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.35)',
                    color: '#fff',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    maxWidth: '80%',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    backdropFilter: 'blur(2px)'
                  }}
                >
                  {badgeText}
                </div>
              ) : null;
            })()}
            <div className={`flashcard-content ${currentCard?.front?.videoUrl ? 'has-video' : ''}`}>
              {currentCard?.front?.videoUrl ? (
                <>
                  <video
                    key={`${currentCard.id}-front-video`}
                    ref={videoRefFront}
                    preload="metadata"
                    playsInline
                    className="flashcard-video"
                  >
                    <source src={currentCard.front.videoUrl} />
                  </video>
                  <div className="flashcard-overlay">
                    <div
                      className="flashcard-caption"
                      dangerouslySetInnerHTML={{ __html: formatCaptionHTML(stripFrontImages(currentCard?.front?.text || '')) }}
                    ></div>
                  </div>
                </>
              ) : (
                (() => {
                  const html = currentCard?.front?.text || '';
                  const sanitized = stripFrontImages(html);
                  if (sanitized) {
                    return (
                      <div
                        className="flashcard-text"
                        dangerouslySetInnerHTML={{ __html: sanitized }}
                      ></div>
                    );
                  }
                  return <div className="flashcard-text">{t('noContent', 'Sem conteúdo')}</div>;
                })()
              )}
            </div>
            {/* Mídias opcionais - áudio e vídeo na frente */}
            {currentCard?.front?.audioUrl && !currentCard?.front?.videoUrl ? (
              // Forçar recarregamento do elemento de áudio ao trocar de card
              <audio
                key={`${currentCard.id}-front`}
                ref={audioRefFront}
                preload="none"
                src={currentCard.front.audioUrl}
                controlsList="nodownload"
                style={{ display: 'none' }}
              />
            ) : null}
            {/* Botão de play dentro do card, alinhado ao rodapé do conteúdo */}
            {(currentCard?.front?.audioUrl || currentCard?.front?.videoUrl) ? (
              <div className="flashcard-controls">
                {currentCard?.front?.videoUrl ? (
                  <button
                    className="player-btn"
                    onClick={(e) => { e.stopPropagation(); replayFrontVideo(); }}
                    title={t('play','Reproduzir')}
                    aria-label={t('play','Reproduzir')}
                  >
                    <i className="fas fa-play"></i>
                  </button>
                ) : (
                  currentCard?.front?.audioUrl ? (
                    <button
                      className="player-btn"
                      onClick={(e) => { e.stopPropagation(); toggleFrontPlay(); }}
                      title={frontIsPlaying ? 'Pause' : 'Play'}
                      aria-label={frontIsPlaying ? t('pause','Pausar') : t('play','Reproduzir')}
                    >
                      <i className={`fas fa-${frontIsPlaying ? 'pause' : 'play'}`}></i>
                    </button>
                  ) : null
                )}
              </div>
            ) : null}
          </div>

          {/* Verso (resposta) */}
          <div className="flashcard-face flashcard-back">
            {(() => {
              const raw = currentCard?.back?.text || '';
              const imgSrc = getFirstImageSrc(raw);
              const html = stripImages(raw);
              const hasText = !!html.trim();
              const hasVideo = !!currentCard?.back?.videoUrl;
              return (
                <div className={`flashcard-content ${hasVideo ? 'has-video' : (imgSrc ? 'has-image' : '')}`}>
                  {hasVideo ? (
                    <>
                      <video
                        key={`${currentCard.id}-back-video`}
                        ref={videoRefBack}
                        preload="metadata"
                        playsInline
                        className="flashcard-video"
                      >
                        <source src={currentCard.back.videoUrl} />
                      </video>
                      <div className="flashcard-overlay">
                        {hasText ? (
                          <div
                            className="flashcard-caption"
                            dangerouslySetInnerHTML={{ __html: extractPortuguese(html) }}
                          ></div>
                        ) : (
                          <div className="flashcard-caption">{t('noAnswer', 'Sem resposta')}</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {imgSrc ? (<img className="flashcard-image" src={imgSrc} alt="" />) : null}
                      <div className="flashcard-overlay">
                        {hasText ? (
                          <div
                            className="flashcard-text"
                            dangerouslySetInnerHTML={{ __html: extractPortuguese(html) }}
                          ></div>
                        ) : (
                          <div className="flashcard-text">{t('noAnswer', 'Sem resposta')}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            {/* Mídias opcionais - áudio e vídeo na resposta */}
            {currentCard?.back?.videoUrl || currentCard?.back?.audioUrl ? (
              <>
                <div className="flashcard-controls">
                  {currentCard?.back?.videoUrl ? (
                    <button
                      className="player-btn"
                      onClick={(e) => { e.stopPropagation(); replayBackVideo(); }}
                      title={t('play','Reproduzir')}
                      aria-label={t('play','Reproduzir')}
                    >
                      <i className="fas fa-play"></i>
                    </button>
                  ) : (
                    currentCard?.back?.audioUrl ? (
                      <>
                        <audio
                          key={`${currentCard.id}-back`}
                          ref={audioRefBack}
                          preload="none"
                          src={currentCard.back.audioUrl}
                          controlsList="nodownload"
                          style={{ display: 'none' }}
                        />
                        <button
                          className="player-btn"
                          onClick={(e) => { e.stopPropagation(); toggleBackPlay(); }}
                          title={backIsPlaying ? 'Pause' : 'Play'}
                          aria-label={backIsPlaying ? t('pause','Pausar') : t('play','Reproduzir')}
                        >
                          <i className={`fas fa-${backIsPlaying ? 'pause' : 'play'}`}></i>
                        </button>
                      </>
                    ) : null
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Controles de áudio fora do card removidos para evitar duplicidade */}

        {/* Controles: revelar e rating */}
        <div className="study-controls" style={{ marginTop: '1rem' }}>
          {!revealed ? (
            <button className="study-btn" onClick={handleReveal} aria-label={t('showAnswer', 'Mostrar resposta')}>
              <i className="fas fa-eye"></i> {t('showAnswer', 'Mostrar resposta')} <span style={{ opacity: 0.7 }}>({t('shortcut_space', 'Espaço')})</span>
            </button>
          ) : (
            <>
              <button className="study-btn secondary" onClick={() => { setRevealed(false); if (audioRefBack.current) { try { audioRefBack.current.pause(); } catch {} } }} aria-label={t('backToFront','Voltar para frente')} title={t('backToFront','Voltar para frente')}>
                <i className="fas fa-undo"></i>
              </button>
              <button className="study-btn secondary rate-hard" onClick={() => handleRate('hard')} aria-label={t('rateHard', 'Difícil')}>
                <i className="fas fa-bolt"></i> {t('rateHard', 'Difícil')} <span style={{ opacity: 0.7 }}>(1)</span>
              </button>
              <button className="study-btn secondary rate-medium" onClick={() => handleRate('medium')} aria-label={t('rateMedium', 'Médio')}>
                <i className="fas fa-adjust"></i> {t('rateMedium', 'Médio')} <span style={{ opacity: 0.7 }}>(2)</span>
              </button>
              <button className="study-btn rate-easy" onClick={() => handleRate('easy')} aria-label={t('rateEasy', 'Fácil')}>
                <i className="fas fa-check-circle"></i> {t('rateEasy', 'Fácil')} <span style={{ opacity: 0.7 }}>(3)</span>
              </button>
            </>
          )}
        </div>
        <div className="hotkeys-hint" aria-hidden="true">
          <div className="hotkeys-container" role="note" aria-label={t('keyboardShortcuts','Atalhos de teclado')}>
            <div className="hotkeys-list">
              <span className="hotkey-chip">
                <i className="fas fa-play-circle"></i>
                <span><span className="kbd">P</span>: {t('play','Reproduzir')}/{t('pause','Pausar')}</span>
              </span>
              <span className="hotkey-chip">
                <i className="fas fa-keyboard"></i>
                <span><span className="kbd">Espaço</span>: {t('showAnswer','Mostrar resposta')}</span>
              </span>
              <span className="hotkey-chip">
                <i className="fas fa-arrows-alt-h"></i>
                <span><i className="fas fa-arrow-left" aria-hidden="true"></i>/<i className="fas fa-arrow-right" aria-hidden="true"></i> {t('navigate','Navegar')}</span>
              </span>
              <span className="hotkey-chip">
                <i className="fas fa-hashtag"></i>
                <span><span className="kbd">1</span>/<span className="kbd">2</span>/<span className="kbd">3</span> {t('rate','Avaliar')}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Study;