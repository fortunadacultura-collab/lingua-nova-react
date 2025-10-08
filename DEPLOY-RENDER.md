# Deploy do Backend no Render (Passo a passo)

Este guia descreve exatamente o que você precisa fazer no Render para publicar o backend e conectar o frontend (GitHub Pages). Eu já preparei o código para múltiplas origens CORS e callbacks OAuth com `BACKEND_URL`, além de um `render.yaml` no repositório.

## O que você precisa preparar

- Uma conta no Render (https://render.com/)
- Acesso ao repositório GitHub `fortunadacultura-collab/lingua-nova-react`
- Segredos/credenciais que só você tem: `SESSION_SECRET`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, credenciais de banco de dados (Postgres) e IDs/segredos OAuth (Google/GitHub/Facebook, conforme desejar usar)

## Passos no Render

1. Entrar no Render e conectar sua conta GitHub.
2. A partir do repositório, criar um novo serviço usando o Blueprint:
   - Vá em "Blueprints" → "New Blueprint" → selecione o repositório.
   - O Render vai detectar `render.yaml` na raiz e propor criar um Web Service `lingua-nova-backend`.
3. Configure as variáveis de ambiente no serviço (sem colocar segredos no repositório):
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://fortunadacultura-collab.github.io` (ou use `CORS_ORIGINS` abaixo)
   - `CORS_ORIGINS=https://fortunadacultura-collab.github.io,https://fortunadacultura-collab.github.io/lingua-nova-react`
   - `SESSION_SECRET` (valor forte e único)
   - `JWT_SECRET` (valor forte e único)
   - `JWT_REFRESH_SECRET` (valor forte e único)
   - `BACKEND_URL=https://<seu-domínio-render>` (ex.: `https://linguanova-backend.onrender.com`)
   - Banco de dados (se usar Postgres gerenciado fora do Render):
     - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - OAuth (se usar):
     - Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
     - GitHub: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
     - Facebook (opcional): `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
   - (Opcional) APKG: `APKG_UPLOAD_MAX_AGE_DAYS=30`, `APKG_CLEANUP_CONCURRENCY=2`
4. Deploy: confirme a criação do serviço e aguarde o build. O health check está em `/api/health`.
5. Teste rápido:
   - Abra `https://<seu-domínio-render>/api/health` → deve retornar `{ status: 'OK' }`.
   - Verifique se o CORS está aceitando seu domínio do GitHub Pages.

### Discos persistentes (uploads)

Se quiser persistir uploads (ex.: APKG e avatares) entre deploys, configure um Persistent Disk no Render (requer plano pago). O `render.yaml` tem um bloco comentado com um exemplo; se optar por usar, ative-o e ajuste `mountPath`.

## Configurar OAuth nos provedores

Com o backend publicado e `BACKEND_URL` definido, crie os apps nos provedores e cadastre os callbacks:

- Google (Google Cloud Console → OAuth consent + Credentials):
  - Authorized redirect URIs:
    - `https://<seu-domínio-render>/api/auth/google/callback`
- GitHub (Settings → Developer settings → OAuth Apps):
  - Authorization callback URL:
    - `https://<seu-domínio-render>/api/auth/github/callback`
- Facebook (opcional):
  - Valid OAuth Redirect URIs:
    - `https://<seu-domínio-render>/auth/facebook/callback`

Depois, copie `CLIENT_ID` e `CLIENT_SECRET` para o Render (variáveis de ambiente do serviço).

## Apontar o frontend para a API

No GitHub, vá em `Settings → Secrets and variables → Actions → New repository secret` e crie:

- `API_BASE_URL` com o origin HTTPS do backend no Render (sem barra final, por exemplo: `https://linguanova-backend.onrender.com`).

O workflow do GitHub Pages já injeta essa URL no build do frontend. O CORS no backend foi preparado para aceitar múltiplos domínios.

## Validações pós-deploy

- Abra o site do GitHub Pages e faça login normal para validar JWT.
- Teste login social (Google/GitHub) se habilitou os provedores.
- Use o endpoint `POST /api/flashcards/decks/sync-all` (com token) para sincronizar decks globais.
- Verifique uploads de avatar e/ou APKG conforme seu plano no Render (persistência de disco).

## Dúvidas comuns

- Erro de CORS: confira `CORS_ORIGINS` no Render e garanta que o domínio exato do Pages esteja listado.
- Callback inválido no OAuth: revise `BACKEND_URL` e as URIs cadastradas nos provedores.
- Banco de dados: se não configurar Postgres, o backend tenta usar SQLite como fallback, adequado só para testes.