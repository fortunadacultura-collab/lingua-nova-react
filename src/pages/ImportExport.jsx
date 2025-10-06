import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import '../styles/globals.css';
import '../styles/study.css';
import '../styles/ui.css';
import { apiFetch } from '../utils/apiBase';

const ImportExport = () => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
      UPLOAD_MISSING_FILE: 'Selecione um arquivo .apkg para enviar.',
      UPLOAD_INVALID_FORMAT: 'Arquivo selecionado não parece ser APKG válido.',
      UPLOAD_ERROR: 'Falha ao enviar arquivo. Tente novamente.',
      APKG_EXTRACT_FAILED: 'Falha ao extrair o APKG. Verifique o arquivo.',
      APKG_COLLECTION_MISSING: 'Arquivo principal do Anki (collection) ausente no pacote.',
      APKG_DIR_LIST_FAILED: 'Falha ao listar diretórios de upload do APKG.',
      ACCESS_DENIED: 'Você não tem permissão para acessar esse recurso.',
      NOT_FOUND: 'Recurso não encontrado.',
      DB_CONNECTION_FAILED: 'Não foi possível conectar ao banco. Tente mais tarde.',
      INVALID_JWT: 'Sessão inválida. Entre novamente.',
      EXPIRED_JWT: 'Sessão expirada. Entre novamente.'
    };
    return map[code] || data?.error || fallback || 'Ocorreu um erro.';
  };

  const onFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setMessage('');
    setError('');
  };

  const importApkg = async () => {
    setMessage('');
    setError('');
    if (!isAuthenticated) {
      setError('Você precisa estar autenticado para importar.');
      return;
    }
    if (!file) {
      setError('Selecione um arquivo .apkg');
      return;
    }
    const token = localStorage.getItem('linguanova_token');
    try {
      const safeRead = async (resp) => {
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
          try { return await resp.json(); } catch (e) {
            return { error: 'Resposta JSON inválida do servidor', code: 'INVALID_JSON', message: e?.message };
          }
        } else {
          // Tentar ler como texto; útil para respostas HTML (proxy/erro) ou vazias
          try {
            const txt = await resp.text();
            return txt ? { error: txt, code: 'NON_JSON_RESPONSE' } : { error: 'Resposta vazia do servidor', code: 'EMPTY_RESPONSE' };
          } catch (e) {
            return { error: 'Falha ao ler resposta do servidor', code: 'READ_RESPONSE_FAILED', message: e?.message };
          }
        }
      };

      setUploading(true);
      const form = new FormData();
      form.append('apkg', file);
      const up = await apiFetch('/api/upload/apkg', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });
      const upData = await safeRead(up);
      console.log('📤 Upload APKG status:', up.status);
      console.log('📤 Upload APKG resposta JSON:', upData);
      if (!up.ok) {
        setError(friendlyError(upData, 'Falha no upload do APKG'));
        return;
      }
      setUploading(false);
      setImporting(true);
      const apkgPath = upData?.apkg?.path;
      const baseDir = upData?.apkg?.baseDir;
      console.log('🧾 Import payload preparado:', { apkgPath, baseDir });
      if (!apkgPath && !baseDir) {
        setError('Falha ao identificar o arquivo APKG (path/baseDir ausentes)');
        return;
      }
      const imp = await apiFetch('/api/flashcards/import/apkg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        // Evitar 409 (duplicatas) utilizando sobrescrita por padrão
        // Enviar baseDir (chave esperada pela API) para compatibilidade
        body: JSON.stringify({ apkgPath, baseDir, onDuplicate: 'overwrite', deckStrategy: 'single' })
      });
      const impData = await safeRead(imp);
      console.log('📥 Import APKG status:', imp.status);
      console.log('📥 Import APKG resposta JSON:', impData);
      if (!imp.ok) {
        setError(friendlyError(impData, 'Falha na importação do APKG'));
        return;
      }
      const decksCount = impData?.results?.length || 0;
      const cardsCount = impData?.totals?.cardsCreated ?? (Array.isArray(impData?.results) ? impData.results.reduce((sum, r) => sum + (r?.createdCards || 0), 0) : 0);
      const audioCount = impData?.totals?.audioRefs ?? 0;
      const videoCount = impData?.totals?.videoRefs ?? 0;
      const imageCount = impData?.totals?.imageRefs ?? 0;
      setMessage(`Importado com sucesso: ${decksCount} deck(s), ${cardsCount} cards, ${videoCount} vídeos, ${audioCount} áudios, ${imageCount} imagens.`);
    } catch (e) {
      console.error('❌ Erro ao importar APKG:', e);
      setError(e?.message ? `Erro inesperado: ${e.message}` : 'Erro inesperado ao importar APKG');
    } finally {
      setUploading(false);
      setImporting(false);
    }
  };

  return (
    <div className="flashcard-container">
      <div className="page-title-container">
        <h2>{t('navImportExport', 'Importar/Exportar Decks')}</h2>
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>{t('importAnkiTitle', 'Importar Anki')}</h3>
        <p style={{ marginBottom: '0.75rem' }}>{t('importAnkiDesc', 'Importe decks do Anki (.apkg) mantendo toda a formatação.')}</p>
        <input type="file" accept=".apkg,application/zip" onChange={onFileChange} />
        <button className="study-btn" onClick={importApkg} disabled={uploading || importing} style={{ marginLeft: '0.75rem' }}>
          <i className="fas fa-file-import"></i>
          {uploading || importing ? 'Processando...' : t('importAnkiBtn', 'Importar Anki')}
        </button>
        {message ? (<p className="soft" style={{ marginTop: '0.75rem' }}>{message}</p>) : null}
        {error ? (<p className="error" style={{ marginTop: '0.75rem' }}>{error}</p>) : null}
      </div>
    </div>
  );
};

export default ImportExport;