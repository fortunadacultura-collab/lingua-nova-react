# Estrutura de Níveis de Assinatura - LinguaNova

## Análise das Funcionalidades Atuais

O LinguaNova possui as seguintes funcionalidades principais:

### 🎯 Funcionalidades Core
- **Diálogos Interativos**: Conversas autênticas com áudio
- **Histórias**: Conteúdo narrativo para aprendizado
- **Flashcards/Decks**: Sistema de repetição espaçada
- **Sistema de Estudo**: Algoritmo de aprendizado adaptativo
- **Comunidade**: Compartilhamento de decks
- **Estatísticas**: Acompanhamento de progresso
- **Múltiplos Idiomas**: Suporte a vários idiomas

### 🔧 Funcionalidades Administrativas
- **Admin Dashboard**: Gerenciamento de usuários
- **Sistema de Níveis de Acesso**: Controle de permissões
- **Autenticação Social**: Login com Google, Facebook, GitHub

## Estrutura de Níveis Recomendada

### 🆓 **FREE** (Gratuito)
**Objetivo**: Atrair usuários e demonstrar valor

**Funcionalidades Incluídas:**
- ✅ 3 diálogos por dia
- ✅ 2 histórias por semana
- ✅ 1 deck pessoal (máximo 50 cartas)
- ✅ Estudo básico (sem algoritmo avançado)
- ✅ Estatísticas básicas (últimos 7 dias)
- ✅ Acesso a 2 idiomas
- ✅ Comunidade (visualização apenas)

**Limitações:**
- ❌ Sem download offline
- ❌ Sem áudio premium
- ❌ Anúncios entre sessões

---

### 💎 **BASIC** (R$ 19,90/mês)
**Objetivo**: Usuários casuais que querem mais conteúdo

**Funcionalidades Incluídas:**
- ✅ 15 diálogos por dia
- ✅ 1 história por dia
- ✅ 5 decks pessoais (máximo 200 cartas cada)
- ✅ Algoritmo de repetição espaçada
- ✅ Estatísticas avançadas (30 dias)
- ✅ Acesso a 5 idiomas
- ✅ Comunidade (download de decks públicos)
- ✅ Sem anúncios

**Novos Recursos:**
- ✅ Modo offline básico
- ✅ Áudio de qualidade melhorada
- ✅ Sincronização entre dispositivos

---

### 🚀 **PREMIUM** (R$ 39,90/mês)
**Objetivo**: Estudantes sérios e profissionais

**Funcionalidades Incluídas:**
- ✅ Diálogos ilimitados
- ✅ Histórias ilimitadas
- ✅ Decks ilimitados (cartas ilimitadas)
- ✅ IA personalizada para aprendizado
- ✅ Estatísticas completas (histórico completo)
- ✅ Todos os idiomas disponíveis
- ✅ Comunidade completa (criar/compartilhar decks)
- ✅ Prioridade no suporte

**Recursos Premium:**
- ✅ Download offline completo
- ✅ Áudio premium com múltiplos sotaques
- ✅ Reconhecimento de voz
- ✅ Exercícios de pronúncia
- ✅ Relatórios de progresso detalhados
- ✅ Metas personalizadas

---

### 👑 **PRO** (R$ 79,90/mês)
**Objetivo**: Educadores, empresas e usuários avançados

**Funcionalidades Incluídas:**
- ✅ Tudo do Premium
- ✅ Criação de conteúdo personalizado
- ✅ API para integrações
- ✅ Dashboard de administração
- ✅ Relatórios de equipe (até 10 usuários)
- ✅ Suporte prioritário 24/7

**Recursos Exclusivos:**
- ✅ Criador de diálogos personalizados
- ✅ Upload de áudio próprio
- ✅ Branding personalizado
- ✅ Exportação de dados
- ✅ Integração com LMS
- ✅ Certificados de conclusão

## Estratégia de Conversão

### 🎯 **Free → Basic**
- Mostrar limitações quando atingidas
- Oferecer trial de 7 dias do Basic
- Destacar benefícios do algoritmo de repetição espaçada

### 🎯 **Basic → Premium**
- Demonstrar valor da IA personalizada
- Oferecer recursos de pronúncia como diferencial
- Trial de 14 dias do Premium

### 🎯 **Premium → Pro**
- Focar em usuários que criam muito conteúdo
- Oferecer para educadores e empresas
- Demonstrar ROI para uso profissional

## Implementação Técnica

### Banco de Dados
```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  payment_method VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscription_limits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  tier VARCHAR(20) NOT NULL,
  daily_dialogues_used INTEGER DEFAULT 0,
  weekly_stories_used INTEGER DEFAULT 0,
  decks_created INTEGER DEFAULT 0,
  reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Middleware de Verificação
- Verificar limites antes de cada ação
- Resetar contadores diários/semanais
- Bloquear funcionalidades premium para usuários free

## Preços Competitivos

**Análise de Mercado:**
- Duolingo Plus: R$ 34,90/mês
- Babbel: R$ 45,90/mês
- Busuu Premium: R$ 41,90/mês

**Nossa Estratégia:**
- Free: Mais generoso que concorrentes
- Basic: Preço acessível (R$ 19,90)
- Premium: Competitivo com recursos únicos (R$ 39,90)
- Pro: Valor premium para recursos avançados (R$ 79,90)

## Métricas de Sucesso

### KPIs Principais
- **Taxa de Conversão Free → Paid**: Meta 5-8%
- **Churn Rate**: Meta <5% mensal
- **ARPU (Average Revenue Per User)**: Meta R$ 25/mês
- **LTV (Lifetime Value)**: Meta R$ 300

### Métricas de Engajamento
- Tempo médio de sessão por tier
- Frequência de uso semanal
- Funcionalidades mais utilizadas por tier
- Taxa de conclusão de exercícios

---

**Próximos Passos:**
1. Implementar tabelas de assinatura no banco
2. Criar endpoints de verificação de limites
3. Desenvolver interface de planos
4. Implementar sistema de pagamento
5. Adicionar limitações nas funcionalidades existentes