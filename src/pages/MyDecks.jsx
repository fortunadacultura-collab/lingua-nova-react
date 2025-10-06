import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import '../styles/globals.css';
import '../styles/study.css';
import '../styles/ui.css';
import { apiFetch } from '../utils/apiBase';

const MyDecks = () => {
  const { t, nativeLanguage } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [decks, setDecks] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [normalizing, setNormalizing] = useState({});
  const [normalizeError, setNormalizeError] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllError, setSyncAllError] = useState('');
  const [editingDeckId, setEditingDeckId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  const toggleMenu = (id) => {
    setOpenMenuId(prev => (prev === id ? null : id));
  };

  const friendlyError = (data, fallback) => {
    const code = data?.code;
    const map = {
      DECK_NAME_REQUIRED: 'Informe um nome para o deck.',
      DIALOGUE_KEY_REQUIRED: 'Selecione um diálogo para importar.',
      DIALOGUE_FILE_NOT_FOUND: 'Arquivo do diálogo não foi encontrado.',
      TRANSLATIONS_NOT_FOUND: 'Nenhuma tradução disponível para este diálogo.',
      TARGET_LANG_REQUIRED: 'Escolha o seu idioma para o verso.',
      TRANSLATION_FILE_NOT_FOUND: 'Tradução do diálogo não foi encontrada.',
      NO_VALID_LINES: 'Não há linhas válidas para criar cards.',
      DECK_NORMALIZE_UNSUPPORTED: 'Este deck não é de diálogo; não pode ser normalizado.',
      DIALOGUE_KEY_UNRESOLVED: 'Não foi possível identificar qual diálogo corresponde ao deck.',
      CARD_TEXT_REQUIRED: 'Preencha texto da frente e do verso do card.',
      APKG_DIR_LIST_FAILED: 'Falha ao listar diretórios de upload do APKG.',
      ACCESS_DENIED: 'Você não tem permissão para acessar esse recurso.',
      NOT_FOUND: 'Recurso não encontrado.',
      DB_CONNECTION_FAILED: 'Não foi possível conectar ao banco. Tente mais tarde.',
      INVALID_JWT: 'Sessão inválida. Entre novamente.',
      EXPIRED_JWT: 'Sessão expirada. Entre novamente.'
    };
    return map[code] || data?.error || fallback || 'Ocorreu um erro.';
  };

  // Remover sufixos de idioma do título exibido (ex.: "(en → pt)")
  const formatDeckName = (name) => {
    if (!name) return '';
    return name.replace(/\s*\([^)]*\)\s*$/, '');
  };

  useEffect(() => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) return;
    const fetchDecks = async () => {
      try {
        setLoading(true);
        const resp = await apiFetch('/api/flashcards/decks', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Target-Lang': nativeLanguage || ''
          }
        });
        const data = await resp.json();
        if (!resp.ok) {
          setError(friendlyError(data, 'Falha ao carregar decks'));
          return;
        }
        const list = Array.isArray(data.decks) ? data.decks : [];
        setDecks(list);
        // Buscar stats por deck (New/Learn/Review)
        const statsEntries = await Promise.all(list.map(async (d) => {
          const sResp = await apiFetch(`/api/flashcards/decks/${d.id}/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!sResp.ok) return [d.id, { total: 0, New: 0, Learn: 0, Review: 0 }];
          const sData = await sResp.json();
          return [d.id, sData];
        }));
        setStats(Object.fromEntries(statsEntries));
      } catch (e) {
        console.error('Erro ao carregar decks:', e);
        setError('Falha ao carregar decks');
      } finally {
        setLoading(false);
      }
    };
    fetchDecks();
  }, [isAuthenticated, nativeLanguage]);

  const hasDialogueTag = (deck) => {
    const tags = typeof deck?.tags === 'string' ? (() => { try { return JSON.parse(deck.tags); } catch { return []; } })() : (deck?.tags || []);
    return Array.isArray(tags) && tags.includes('dialogue');
  };

  const importMorningRoutine = async () => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) {
      setError('Você precisa estar autenticado para importar.');
      return;
    }
    try {
      setImporting(true);
      setError('');
      const resp = await apiFetch('/api/flashcards/import/dialogue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          dialogueKey: 'morning_routine',
          sourceLang: 'en',
          includeAllTranslations: false,
          targetLang: nativeLanguage || 'pt'
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(friendlyError(data, 'Falha ao importar diálogo'));
        return;
      }
      // Recarregar lista de decks e navegar para estudo
      const deckId = data?.deck?.id;
      if (deckId) {
        // refresh decks
        const listResp = await apiFetch('/api/flashcards/decks', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Target-Lang': nativeLanguage || ''
          }
        });
        const listData = await listResp.json();
        setDecks(Array.isArray(listData.decks) ? listData.decks : []);
        // navegar para estudo
        window.location.href = `/flashcards/study?deckId=${deckId}`;
      }
    } catch (e) {
      console.error('Erro ao importar diálogo:', e);
      setError('Erro inesperado ao importar diálogo');
    } finally {
      setImporting(false);
    }
  };

  const importAllDialogues = async () => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) {
      setError('Você precisa estar autenticado para importar.');
      return;
    }
    try {
      setImporting(true);
      setError('');
      const resp = await apiFetch('/api/flashcards/import/all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sourceLang: 'en',
          includeAllTranslations: false,
          targetLang: nativeLanguage || 'pt'
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(friendlyError(data, 'Falha ao importar diálogos'));
        return;
      }
      // Recarregar lista de decks
      const listResp = await apiFetch('/api/flashcards/decks', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Lang': nativeLanguage || ''
        }
      });
      const listData = await listResp.json();
      setDecks(Array.isArray(listData.decks) ? listData.decks : []);
    } catch (e) {
      console.error('Erro ao importar todos os diálogos:', e);
      setError('Erro inesperado ao importar diálogos');
    } finally {
      setImporting(false);
    }
  };

  const deleteAllDecks = async () => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) {
      setError('Você precisa estar autenticado para apagar decks.');
      return;
    }
    const confirm = window.confirm('Tem certeza que deseja apagar TODOS os decks? Esta ação não pode ser desfeita.');
    if (!confirm) return;
    try {
      setLoading(true);
      setError('');
      const resp = await apiFetch('/api/flashcards/decks', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(friendlyError(data, 'Falha ao apagar decks'));
        return;
      }
      // Limpar UI
      setDecks([]);
      setStats({});
    } catch (e) {
      console.error('Erro ao apagar decks:', e);
      setError('Erro inesperado ao apagar decks');
    } finally {
      setLoading(false);
    }
  };

  const deleteDeck = async (deckId) => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) {
      setError('Você precisa estar autenticado para apagar um deck.');
      return;
    }
    const confirm = window.confirm('Tem certeza que deseja apagar este deck? Esta ação não pode ser desfeita.');
    if (!confirm) return;
    try {
      setLoading(true);
      setError('');
      const resp = await fetch(`/api/flashcards/decks/${deckId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(friendlyError(data, 'Falha ao apagar deck'));
        return;
      }
      // Atualizar estado local removendo o deck apagado
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
      setStats((prev) => {
        const next = { ...prev };
        delete next[deckId];
        return next;
      });
    } catch (e) {
      console.error('Erro ao apagar deck:', e);
      setError('Erro inesperado ao apagar deck');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (deck) => {
    setEditingDeckId(deck.id);
    setEditName(deck.display_name || deck.name || '');
    setEditDesc(deck.description || '');
  };

  const cancelEdit = () => {
    setEditingDeckId(null);
    setEditName('');
    setEditDesc('');
  };

  const saveEdit = async () => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) {
      setError('Você precisa estar autenticado para editar.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const deckId = editingDeckId;
      const resp = await fetch(`/api/flashcards/decks/${deckId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: editName, description: editDesc })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(friendlyError(data, 'Falha ao editar deck'));
        return;
      }
      const updated = data.deck;
      setDecks(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
      cancelEdit();
    } catch (e) {
      console.error('Erro ao editar deck:', e);
      setError('Erro inesperado ao editar deck');
    } finally {
      setLoading(false);
    }
  };

  const normalizeDeck = async (deckId) => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) {
      setNormalizeError('Você precisa estar autenticado para normalizar.');
      return;
    }
    try {
      setNormalizeError('');
      setNormalizing((prev) => ({ ...prev, [deckId]: true }));
      const resp = await apiFetch(`/api/flashcards/decks/${deckId}/normalize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Lang': nativeLanguage || ''
        }
      });
      const data = await resp.json();
      if (!resp.ok) {
        setNormalizeError(friendlyError(data, 'Falha ao normalizar deck'));
        return;
      }
      // Recarregar lista de decks e stats
      const listResp = await apiFetch('/api/flashcards/decks', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Lang': nativeLanguage || ''
        }
      });
      const listData = await listResp.json();
      const list = Array.isArray(listData.decks) ? listData.decks : [];
      setDecks(list);
      const statsEntries = await Promise.all(list.map(async (d) => {
        const sResp = await apiFetch(`/api/flashcards/decks/${d.id}/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!sResp.ok) return [d.id, { total: 0, New: 0, Learn: 0, Review: 0 }];
        const sData = await sResp.json();
        return [d.id, sData];
      }));
      setStats(Object.fromEntries(statsEntries));
    } catch (e) {
      console.error('Erro ao normalizar deck:', e);
      setNormalizeError('Erro inesperado ao normalizar deck');
    } finally {
      setNormalizing((prev) => ({ ...prev, [deckId]: false }));
    }
  };

  const syncAllDecks = async () => {
    const token = localStorage.getItem('linguanova_token');
    if (!isAuthenticated || !token) {
      setSyncAllError('Você precisa estar autenticado para sincronizar.');
      return;
    }
    try {
      setSyncAllError('');
      setSyncingAll(true);
      const resp = await apiFetch('/api/flashcards/decks/sync-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Lang': nativeLanguage || ''
        }
      });
      const data = await resp.json();
      if (!resp.ok) {
        setSyncAllError(friendlyError(data, 'Falha ao sincronizar decks'));
        return;
      }
      // Recarregar lista e stats
      const listResp = await apiFetch('/api/flashcards/decks', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Lang': nativeLanguage || ''
        }
      });
      const listData = await listResp.json();
      const list = Array.isArray(listData.decks) ? listData.decks : [];
      setDecks(list);
      const statsEntries = await Promise.all(list.map(async (d) => {
        const sResp = await apiFetch(`/api/flashcards/decks/${d.id}/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!sResp.ok) return [d.id, { total: 0, New: 0, Learn: 0, Review: 0 }];
        const sData = await sResp.json();
        return [d.id, sData];
      }));
      setStats(Object.fromEntries(statsEntries));
    } catch (e) {
      console.error('Erro ao sincronizar todos os decks:', e);
      setSyncAllError('Erro inesperado ao sincronizar decks');
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="my-decks-page">
      <div className="page-header">
        <h1>
          <i className="fas fa-layer-group"></i>
          {t('navMyDecks', 'Meus Decks')}
        </h1>
        <p>{t('myDecksPageDesc', 'Gerencie seus decks de flashcards')}</p>
      </div>
      
      <div className="container">
        {/* Ações gerais */}
      <div style={{ marginBottom: '1rem' }}>
        <button className="study-btn" onClick={syncAllDecks} disabled={syncingAll} style={{ marginLeft: '0.75rem', backgroundColor: '#34495e' }}>
          <i className="fas fa-sync-alt"></i>
          {syncingAll ? 'Sincronizando...' : 'Sincronizar todos os decks'}
        </button>
        <button className="study-btn" onClick={deleteAllDecks} style={{ marginLeft: '0.75rem', backgroundColor: '#c0392b' }}>
          <i className="fas fa-trash"></i>
          Apagar todos os decks
        </button>
      </div>
        {loading && <div className="hotkeys-hint">{t('loading','Carregando...')}</div>}
        {error && <div className="hotkeys-hint">{error}</div>}
        {normalizeError && <div className="hotkeys-hint">{normalizeError}</div>}
        {syncAllError && <div className="hotkeys-hint">{syncAllError}</div>}
        {!loading && !error && decks.length === 0 && (
          <div className="coming-soon">
            <i className="fas fa-layer-group"></i>
            <h2>{t('noDecks', 'Nenhum deck encontrado')}</h2>
            <p>{t('createFirstDeck', 'Crie seu primeiro deck')}</p>
            <Link to="/flashcards/new-deck" className="study-btn" style={{ marginTop: '0.5rem' }}>
              <i className="fas fa-plus-circle"></i> {t('navNewDeck','Novo Deck')}
            </Link>
          </div>
        )}
        {decks.length > 0 && (
          <div className="deck-grid-3">
            {decks.map(deck => (
              <div
                key={deck.id}
                className={`deck-card ${openMenuId === deck.id ? 'menu-open' : ''}`}
                onMouseLeave={() => { if (openMenuId === deck.id) setOpenMenuId(null); }}
                onClick={() => {
                  // Evitar navegação enquanto menu aberto ou em edição
                  if (openMenuId === deck.id || editingDeckId === deck.id) return;
                  window.location.href = `/flashcards/study?deckId=${deck.id}`;
                }}
                role="button"
                title="Abrir estudo do deck"
              >
                {/* Menu de ações no canto superior direito */}
                <div className="card-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn outline small card-menu-btn"
                    onClick={(e) => { e.stopPropagation(); toggleMenu(deck.id); }}
                    aria-label="Ações do deck"
                    title="Ações do deck"
                  >
                    <i className="fas fa-ellipsis-v"></i>
                  </button>
                  {openMenuId === deck.id && (
                    <div className="card-menu-list" onMouseLeave={() => setOpenMenuId(null)} onClick={(e) => e.stopPropagation()}>
                      <Link to={`/flashcards/study?deckId=${deck.id}`} className="icon-btn primary small" aria-label={t('study','Estudar')} title={t('study','Estudar')}>
                        <i className="fas fa-graduation-cap"></i>
                      </Link>
                      <Link to={`/flashcards/add-cards?deckId=${deck.id}`} className="icon-btn outline small" aria-label={t('navAddCards','Adicionar Cards')} title={t('navAddCards','Adicionar Cards')}>
                        <i className="fas fa-plus"></i>
                      </Link>
                      <button className="icon-btn outline small" onClick={() => { startEdit(deck); setOpenMenuId(null); }} aria-label="Editar deck" title="Editar deck">
                        <i className="fas fa-edit"></i>
                      </button>
                      {hasDialogueTag(deck) && (
                        <button
                          className="icon-btn warning small"
                          onClick={() => { normalizeDeck(deck.id); setOpenMenuId(null); }}
                          disabled={!!normalizing[deck.id]}
                          aria-label={normalizing[deck.id] ? 'Normalizando...' : 'Normalizar deck'}
                          title={normalizing[deck.id] ? 'Normalizando...' : 'Normalizar deck'}
                        >
                          <i className="fas fa-wrench"></i>
                        </button>
                      )}
                      <button className="icon-btn danger small" onClick={() => { deleteDeck(deck.id); setOpenMenuId(null); }} aria-label="Apagar deck" title="Apagar deck">
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  )}
                </div>
                <div className="card-title" style={{ fontWeight: 600 }}>{deck.display_name || deck.name}</div>
                {deck.description ? (
                  <div className="card-subtitle" style={{ marginTop: '0.25rem' }}>{deck.description}</div>
                ) : null}
                {/* Stats estilo Anki */}
                <div className="card-subtitle" style={{ marginTop: '0.5rem' }}>
                  {(() => {
                    const s = stats[deck.id] || { total: 0, New: 0, Learn: 0, Review: 0 };
                    return (
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span><strong>Total:</strong> {s.total}</span>
                        <span style={{ color: '#2f8f2f' }}><strong>New:</strong> {s.New}</span>
                        <span style={{ color: '#e0a100' }}><strong>Learn:</strong> {s.Learn}</span>
                        <span style={{ color: '#0077cc' }}><strong>Review:</strong> {s.Review}</span>
                      </div>
                    );
                  })()}
                </div>
                {/* Ícones migrados para o menu; removida a barra abaixo */}

                {editingDeckId === deck.id && (
                  <div className="card-form" style={{ marginTop: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                    <div className="form-group">
                      <label className="form-label">Nome do deck</label>
                      <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Descrição</label>
                      <input className="form-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                    </div>
                    <div className="form-actions">
                      <button className="study-btn" onClick={saveEdit}>
                        <i className="fas fa-save"></i> Salvar
                      </button>
                      <button className="study-btn secondary" onClick={cancelEdit}>
                        <i className="fas fa-times"></i> Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyDecks;