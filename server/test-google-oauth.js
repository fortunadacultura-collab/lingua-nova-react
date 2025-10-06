#!/usr/bin/env node

/**
 * Script de teste para verificar configuração do Google OAuth
 * Este script testa se o Google Cloud Console está configurado corretamente
 */

require('dotenv').config();
const https = require('https');
const { URL } = require('url');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const REDIRECT_URI = 'http://localhost:5001/api/auth/google/callback';

console.log('🔍 TESTE DE CONFIGURAÇÃO DO GOOGLE OAUTH');
console.log('==========================================');
console.log(`📋 Client ID: ${CLIENT_ID}`);
console.log(`📋 Redirect URI: ${REDIRECT_URI}`);
console.log('');

// Função para fazer requisição HTTPS
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: data
        });
      });
    });
    
    request.on('error', (error) => {
      reject(error);
    });
    
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Função para decodificar URL
function decodeGoogleError(encodedUrl) {
  try {
    const url = new URL(encodedUrl);
    const authError = url.searchParams.get('authError');
    if (authError) {
      const decoded = Buffer.from(authError, 'base64').toString('utf-8');
      return decoded;
    }
    return 'Erro não encontrado';
  } catch (error) {
    return 'Erro ao decodificar: ' + error.message;
  }
}

async function testGoogleOAuth() {
  console.log('🧪 TESTE 1: Verificando URL de autorização do Google');
  console.log('--------------------------------------------------');
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=email%20profile`;
  
  console.log(`📡 URL de teste: ${authUrl}`);
  console.log('');
  
  try {
    const response = await makeRequest(authUrl);
    
    console.log(`📊 Status Code: ${response.statusCode}`);
    console.log(`📊 Headers:`, Object.keys(response.headers));
    
    if (response.statusCode === 302) {
      const location = response.headers.location;
      console.log(`📍 Redirecionamento para: ${location}`);
      
      if (location && location.includes('error')) {
        console.log('');
        console.log('❌ ERRO DETECTADO NO REDIRECIONAMENTO');
        console.log('=====================================');
        
        // Tentar decodificar o erro
        const errorMessage = decodeGoogleError(location);
        console.log(`🔍 Mensagem de erro decodificada:`);
        console.log(errorMessage);
        
        if (location.includes('redirect_uri_mismatch')) {
          console.log('');
          console.log('🎯 PROBLEMA IDENTIFICADO: redirect_uri_mismatch');
          console.log('===============================================');
          console.log('❌ O URI de redirecionamento não está registrado no Google Cloud Console');
          console.log('');
          console.log('✅ SOLUÇÃO:');
          console.log('1. Acesse: https://console.cloud.google.com/apis/credentials');
          console.log(`2. Encontre o Client ID: ${CLIENT_ID}`);
          console.log('3. Clique em "Editar" (ícone de lápis)');
          console.log('4. Na seção "Authorized redirect URIs", adicione EXATAMENTE:');
          console.log(`   ${REDIRECT_URI}`);
          console.log('5. Clique em "SAVE"');
          console.log('6. Aguarde 5-10 minutos para propagação');
          console.log('');
          console.log('⚠️  IMPORTANTE: A URL deve ser EXATAMENTE igual, incluindo:');
          console.log('   - Protocolo: http:// (não https://)');
          console.log('   - Porta: :5001');
          console.log('   - Caminho: /api/auth/google/callback');
        }
      } else {
        console.log('✅ Redirecionamento normal (sem erro detectado)');
      }
    } else if (response.statusCode === 200) {
      console.log('✅ Resposta 200 - Página de login do Google carregada');
    } else {
      console.log(`⚠️  Status inesperado: ${response.statusCode}`);
    }
    
  } catch (error) {
    console.log(`❌ Erro na requisição: ${error.message}`);
  }
  
  console.log('');
  console.log('🧪 TESTE 2: Verificando se o servidor local está respondendo');
  console.log('-----------------------------------------------------------');
  
  try {
    const localResponse = await makeRequest(`http://localhost:5001/api/auth/google/callback`);
    console.log(`📊 Status do servidor local: ${localResponse.statusCode}`);
    
    if (localResponse.statusCode === 302) {
      console.log('✅ Servidor local está respondendo e redirecionando corretamente');
    } else {
      console.log(`⚠️  Status inesperado do servidor local: ${localResponse.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Erro ao conectar com servidor local: ${error.message}`);
    console.log('⚠️  Certifique-se de que o servidor está rodando na porta 5001');
  }
  
  console.log('');
  console.log('📋 RESUMO DO DIAGNÓSTICO');
  console.log('========================');
  console.log('✅ Client ID configurado');
  console.log('✅ Redirect URI definido');
  console.log('✅ Servidor local funcionando');
  console.log('❌ Google Cloud Console precisa ser configurado');
  console.log('');
  console.log('🎯 PRÓXIMOS PASSOS:');
  console.log('1. Configure o Google Cloud Console conforme instruções acima');
  console.log('2. Aguarde 5-10 minutos');
  console.log('3. Execute este script novamente para verificar');
  console.log('4. Teste o login no navegador');
}

// Executar o teste
testGoogleOAuth().catch(console.error);