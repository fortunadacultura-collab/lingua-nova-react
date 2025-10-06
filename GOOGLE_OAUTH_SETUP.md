# Configuração do Google OAuth - Solução para "redirect_uri_mismatch"

## ❌ PROBLEMA IDENTIFICADO

**Erro 400: redirect_uri_mismatch**
```
Não é possível fazer login no app porque ele não obedece à política do OAuth 2.0 do Google.
Se você é o desenvolvedor do app, registre o URI de redirecionamento no Console do Google Cloud.
```

**CAUSA**: O URI de redirecionamento `http://localhost:5001/api/auth/google/callback` não está registrado no Google Cloud Console.

## ✅ SOLUÇÃO DEFINITIVA - PASSO A PASSO

### 1. Acessar o Google Cloud Console

1. **Abra**: https://console.cloud.google.com/apis/credentials
2. **IMPORTANTE**: Verifique se está no projeto correto
3. **Client ID atual**: `YOUR_GOOGLE_CLIENT_ID`

### 2. Localizar e Editar as Credenciais OAuth

**PASSO 1**: Encontre suas credenciais
- Procure pelo Client ID: `YOUR_GOOGLE_CLIENT_ID`
- Clique no ícone de **lápis (editar)** ao lado das credenciais

**PASSO 2**: Configurar URLs CORRETAS

⚠️ **ATENÇÃO**: As URLs devem ser EXATAMENTE como mostrado abaixo:

**Authorized JavaScript origins**:
```
http://localhost:3000
http://localhost:5001
```

**Authorized redirect URIs** (CRÍTICO - adicione esta URL):
```
http://localhost:5001/api/auth/google/callback
```

**PASSO 3**: Salvar e Aguardar
- Clique em **SAVE**
- ⏰ **Aguarde 5-10 minutos** para as mudanças se propagarem nos servidores do Google

### 3. Verificar Configuração Atual

As credenciais atuais no `.env` devem ser configuradas assim (não comite valores reais):
- `GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET`

### 3. ✅ VERIFICAÇÃO APÓS CONFIGURAÇÃO

**AGUARDE 5-10 MINUTOS** após salvar no Google Console, então siga estes passos:

**Método 1**: Verificar no Console
1. Volte para https://console.cloud.google.com/apis/credentials
2. Clique nas suas credenciais OAuth 2.0
3. ✅ Confirme que `http://localhost:5001/api/auth/google/callback` está listado em "Authorized redirect URIs"

**Método 2**: Testar a API
```bash
curl -X POST "http://localhost:5001/api/auth/google/url" -H "Content-Type: application/json" -d '{}'
```
✅ Deve retornar uma URL válida do Google OAuth (sem erros).

### 4. 🧪 TESTE FINAL

1. Acesse `http://localhost:3000/login`
2. Clique no botão **"Entrar com Google"**
3. ✅ Deve redirecionar para o Google (sem erro 400)
4. ✅ Após autorizar, deve retornar para a aplicação logado

### 5. 🚨 SE O ERRO PERSISTIR

**Checklist de Troubleshooting**:

1. ⏰ **Aguarde mais tempo**: As mudanças podem levar até 15 minutos
2. 🔍 **Verifique o Client ID**: 
   - Console: `YOUR_GOOGLE_CLIENT_ID`
   - Arquivo `.env`: Deve ser idêntico
3. 🧹 **Limpe o cache**: Feche e reabra o navegador (ou use modo incógnito)
4. 📁 **Verifique o projeto**: Certifique-se de estar no projeto correto no Google Console
5. 🔄 **Reinicie o servidor**: `npm run server:dev` no terminal

### 6. 📋 CONFIGURAÇÃO FINAL CORRETA

**No Google Cloud Console deve ter**:

**Authorized JavaScript origins**:
```
http://localhost:3000
http://localhost:5001
```

**Authorized redirect URIs**:
```
http://localhost:5001/api/auth/google/callback
```

**No arquivo `.env` deve ter (não comitar valores reais)**:
```
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
```

## 🔄 FLUXO DE AUTENTICAÇÃO

1. **Usuário clica "Login with Google"** → Frontend chama `/api/auth/google/url`
2. **Backend gera URL** → `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=http://localhost:5001/api/auth/google/callback`
3. **Google redireciona** → `http://localhost:5001/api/auth/google/callback?code=...`
4. **Backend processa** → Cria usuário/sessão e redireciona para `http://localhost:3000/auth/callback`
5. **Frontend finaliza** → Processa dados da sessão e redireciona para `/`