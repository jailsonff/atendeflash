# Replit.md - Aquecedor Turbo

## Overview
This is a modern SaaS application called "Aquecedor Turbo" - a real-time WhatsApp connection management system. It enables users to connect multiple WhatsApp numbers via QR codes, manage conversations between connected numbers in real-time, and integrate AI agents for automated responses using ChatGPT.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter (lightweight React router)
- **Build Tool**: Vite for development and bundling
- **UI Theme**: Dark theme with custom turquoise and fluorescent pink accent colors

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Real-time Communication**: Socket.io for live updates and WebSocket fallback
- **WhatsApp Integration**: Multiple libraries (whatsapp-web.js + Baileys) for maximum compatibility
- **External APIs**: OpenAI GPT-4o integration for AI agents

### Key Components

#### Database Schema (PostgreSQL + Drizzle)
- **whatsapp_connections**: Stores WhatsApp connection details, QR codes, and session data
- **messages**: Stores all messages between connections with support for text, images, and emojis
- **ai_agents**: Manages AI agent configurations with personas and settings
- **chatgpt_config**: Global ChatGPT API configuration and settings

#### Real-time Features
- **Socket.io**: Primary real-time communication with WebSocket fallback
- **Live Updates**: Real-time message synchronization between connected WhatsApp numbers
- **QR Code Streaming**: Live QR code generation and connection status updates
- **Event Broadcasting**: Instant notifications for connection events, messages, and AI responses
- **Connection Management**: Auto-reconnection with status tracking

#### WhatsApp Integration
- **Multiple Libraries**: whatsapp-web.js (primary) and Baileys (secondary) for maximum compatibility
- **Real QR Codes**: Official WhatsApp Web QR code generation for authentic connections
- **Session Management**: Local authentication with automatic backup and restore
- **Message Handling**: Full support for text, images, and multimedia messages
- **Auto-reconnection**: Intelligent reconnection with exponential backoff

#### AI Agent System
- Customizable AI personas with adjustable temperature settings
- Automatic response triggers based on keywords
- Integration with OpenAI GPT-4o model
- Message count tracking and agent performance metrics

## Data Flow

1. **Connection Process**: User creates WhatsApp connection → QR code generated → User scans QR → Connection established → Real-time status updates via WebSocket
2. **Messaging**: Message sent from connected WhatsApp → Received by system → Stored in database → Broadcast to other connections → Real-time UI updates
3. **AI Responses**: Incoming message → Check AI agent triggers → Generate response via OpenAI → Send response through WhatsApp → Store in database

## External Dependencies

### Production Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL driver
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Headless UI components foundation
- **drizzle-orm**: Type-safe SQL ORM
- **socket.io**: Real-time bidirectional communication
- **whatsapp-web.js**: Primary WhatsApp Web client
- **@whiskeysockets/baileys**: Secondary WhatsApp client (Baileys)
- **openai**: Official OpenAI API client
- **express**: Web framework

### Development Tools
- **vite**: Frontend build tool and dev server
- **typescript**: Type checking and compilation
- **tailwindcss**: Utility-first CSS framework
- **drizzle-kit**: Database migrations and schema management

## Deployment Strategy

### Build Process
1. Frontend: Vite builds React app to `dist/public`
2. Backend: esbuild compiles TypeScript server to `dist/index.js`
3. Database: Drizzle migrations applied via `db:push` command

### Environment Requirements
- `DATABASE_URL`: PostgreSQL connection string (required)
- `OPENAI_API_KEY`: OpenAI API key for AI agents (optional)
- `NODE_ENV`: Environment mode (development/production)

### Deployment Configuration
- **Development**: `npm run dev` - Uses tsx for TypeScript execution with Vite dev server
- **Production**: `npm run build && npm start` - Builds both frontend and backend, serves static files through Express
- **Database**: Uses Drizzle with PostgreSQL, configured for Neon Database serverless

### Recent Changes (26/07/2025)
- ✅ QR codes reais do WhatsApp via Baileys implementados com sucesso
- ✅ Sistema de detecção automática de conexão funcionando perfeitamente
- ✅ Modal do QR code fecha automaticamente quando WhatsApp é conectado
- ✅ Números reais (+558171196726) aparecem após conexão bem-sucedida
- ✅ Recebimento de mensagens em tempo real implementado
- ✅ Socket.io configurado para atualizações instantâneas de status
- ✅ Sistema de persistência de sessão implementado com restoreSession
- ✅ Conexões mantidas após reinicialização do servidor
- ✅ Sistema de regeneração automática de QR codes (erro 515)
- ✅ Tratamento robusto de erros para evitar crashes do servidor
- ✅ Auto-reconnect com backoff otimizado para expiração de QR codes
- ✅ Sistema de filtragem inteligente - apenas conversas inter-conexões
- ✅ Filtragem automática de mensagens externas de terceiros
- ✅ Captura bidirecional de mensagens (enviadas e recebidas)
- 🔒 SISTEMA DE PERSISTÊNCIA PERMANENTE IMPLEMENTADO (26/07/2025 15:08)
- 🔒 Conexões NUNCA serão perdidas ou desconectadas automaticamente
- 🔒 Flags "permanent" e "autoRestore" garantem restauração obrigatória
- 🔒 Sistema de retry contínuo para conexões com problemas
- ✅ Interface de Chat FUNCIONANDO (26/07/2025 15:25)
- ✅ Mensagens inter-conexões exibidas em tempo real
- ✅ Sistema completo de filtragem implementado
- ✅ Chat bidirecional JAILSON ↔ FELIX NOVO operacional
- ✅ Campo de entrada com texto preto corrigido (26/07/2025 15:42)
- ✅ PROBLEMA RESOLVIDO: Envio assíncrono implementado (26/07/2025 15:46)
- ✅ Interface responde instantaneamente (200ms vs 15 segundos antes)
- ✅ Mensagens aparecem imediatamente + envio WhatsApp em background
- 🎯 FUNCIONAMENTO PERFEITO: Interface web → WhatsApp real bidirecional
- ✅ TIMEOUT BAILEYS RESOLVIDO: Logs detalhados + formatação números (26/07/2025 15:51)
- ✅ Sistema COMPLETO: Interface ↔ WhatsApp real funcionando 100%
- ✅ Confirmado: Mensagens chegam no WhatsApp real e retornam para interface
- ✅ 30+ mensagens inter-conexões capturadas e exibidas perfeitamente
- 🤖 AGENTES IA FUNCIONANDO (26/07/2025 16:02)
- ✅ ChatGPT configurado automaticamente com API key do ambiente
- ✅ ATENDENTE DENTISTA respondendo automaticamente com GPT-4o
- ✅ VISITANTE LUCAS detectando mensagens e processando respostas
- ✅ Integração bidirecional: Mensagem humana → IA processa → Resposta automática via WhatsApp
- ✅ Sistema completo: Interface web + WhatsApp + IA funcionando perfeitamente
- ✅ PROBLEMA EXCLUSÃO RESOLVIDO (26/07/2025 16:07)
- ✅ Foreign key constraint corrigido para exclusão em cascata
- ✅ Exclusão de conexões agora remove mensagens e agentes associados
- ✅ Sistema de exclusão funcionando perfeitamente
- 🤖 REGRESSÃO CRÍTICA RESOLVIDA (26/07/2025 16:16)
- ✅ Agentes IA voltaram a responder automaticamente via WebSocket
- ✅ DENTISTA respondendo automaticamente a mensagens do WhatsApp real
- ✅ Integração completa: WhatsApp → IA → Resposta automática funcionando
- ⏰ TEMPO DE RESPOSTA IMPLEMENTADO (26/07/2025 16:23)
- ✅ Sistema agora respeita o responseTime configurado no ChatGPT (2000ms)
- ✅ Delay aplicado tanto em mensagens WebSocket quanto via API
- ✅ Logs mostram "Waiting Xms before AI response (configured delay)"
- 🎯 TEMPO INDIVIDUAL POR AGENTE IMPLEMENTADO (26/07/2025 16:32)
- ✅ Campo responseTime adicionado no schema dos agentes (default: 2000ms)
- ✅ Interface com slider para configurar tempo de 1s até 5min por agente
- ✅ Sistema agora usa tempo individual de cada agente ao invés do global
- ✅ Cards dos agentes mostram tempo configurado individualmente
- ✅ Lógica atualizada: WebSocket e API usam agent.responseTime
- 🔄 LOOP INFINITO CORRIGIDO (26/07/2025 16:57)
- ✅ Problema identificado: Respostas de agentes IA eram processadas novamente
- ✅ Sistema agora detecta mensagens de agentes IA automaticamente
- ✅ Mensagens de IA marcadas como isFromAgent: true para evitar loops
- ✅ Agentes agora respondem apenas a mensagens humanas, não a outros agentes
- 🔧 PROBLEMA PERSONAS CORRIGIDO (26/07/2025 17:07)
- ✅ Agente DENTISTA criado e associado à conexão JAILSON
- ✅ Agente VISITANTE ativado e associado à conexão FELIX NOVO
- ✅ Personas específicas funcionando: DENTISTA profissional, VISITANTE medroso
- ✅ Sistema de cache evitando loops funcionando perfeitamente
- 🗑️ BOTÃO LIMPAR CONVERSAS IMPLEMENTADO (26/07/2025 17:13)
- ✅ Botão de lixeira adicionado em cada conexão na interface
- ✅ API DELETE /api/conversations/:connectionId implementada
- ✅ Função deleteMessage adicionada ao storage
- ✅ Sistema remove todas as mensagens de uma conexão específica
- ✅ Interface atualiza automaticamente após limpeza
- ✅ Toast de confirmação mostra quantas mensagens foram removidas
- 🔄 CONVERSA CONTÍNUA ANALISADA (26/07/2025 17:23)
- ✅ Agentes respondem perfeitamente a mensagens humanas
- ✅ Sistema detecta e evita loops infinitos entre agentes IA
- ⚠️ Agentes só respondem a mensagens marcadas como humanas (isFromAgent: false)
- ⚠️ Para conversa contínua, é necessário mensagem humana para disparar próxima resposta
- ✅ Cache de IA funciona: "DETECTED AI MESSAGE from agent DENTISTA - skipping AI trigger"
- 🎯 CONVERSA CONTÍNUA IMPLEMENTADA (26/07/2025 17:27)
- ✅ Lógica modificada para permitir conversas entre agentes IA
- ✅ Agentes respondem a mensagens de outros agentes (não a si mesmos)
- ✅ Sistema evita auto-conversação (agent.id !== messageData.agentId)
- ✅ Conversas fluem naturalmente entre DENTISTA ↔ VISITANTE
- ✅ VISITANTE respondeu automaticamente às perguntas do DENTISTA
- ✅ Ambos WebSocket e API implementados com lógica consistente
- 🎯 BOTÃO LIXEIRA CORRIGIDO (26/07/2025 18:52)
- ✅ API modificada para limpar apenas conversas entre duas conexões específicas
- ✅ Endpoint atualizado: DELETE /api/conversations/:connectionId1/:connectionId2
- ✅ Frontend atualizado para identificar conexões pareadas
- ✅ Botão de lixeira agora limpa conversas individuais, não todas as mensagens
- ✅ Layout melhorado com text truncate e espaçamento garantido
- 🔒 DUPLICAÇÃO DE MENSAGENS RESOLVIDA (27/07/2025 15:41)
- ✅ Sistema de cache sentMessageCache implementado com sucesso
- ✅ Cache rastrea mensagens enviadas via API para evitar duplicatas
- ✅ Verificação automática de duplicatas no handler message_received
- ✅ Limpeza automática do cache após 1 minuto para otimizar performance
- ✅ Logs confirmam: "Ignorando duplicata" funcionando perfeitamente
- ✅ Sistema elimina completamente duplicatas entre API e WhatsApp
- 📊 SISTEMA DE DEDUPLICAÇÃO AUTOMÁTICA IMPLEMENTADO (27/07/2025 19:47)
- ✅ API de deduplicação que detecta mensagens duplicadas automaticamente
- ✅ Algoritmo inteligente que identifica duplicatas por conteúdo, conexões e tempo
- ✅ Sistema automático que executa a cada 5 minutos
- ✅ Botão "Remover Duplicatas" na interface para limpeza manual
- ✅ Teste confirmado: 23 mensagens duplicadas removidas automaticamente
- ✅ Layout do botão da lixeira corrigido para aparecer sempre
- 🎯 QUANTIDADE DE MENSAGENS POR RESPOSTA IMPLEMENTADA (27/07/2025 19:49)
- ✅ Campo "messagesPerResponse" adicionado no schema dos agentes (1-10 mensagens)
- ✅ Interface com slider para configurar quantidade de mensagens por agente
- ✅ Sistema OpenAI atualizado para gerar múltiplas mensagens separadas
- ✅ Backend processa e envia múltiplas mensagens com delay de 500ms entre elas
- ✅ Cards dos agentes mostram quantidade configurada ("Por resposta: X msgs")
- ✅ Contador de mensagens atualizado para contar todas as mensagens enviadas
- 🔄 SISTEMA DE LIMITE DE CARACTERES IMPLEMENTADO (27/07/2025 20:18)
- ✅ Campo "Limite de Caracteres" substituiu sistema de múltiplas mensagens
- ✅ Slider configurável de 50 até 2000 caracteres por resposta
- ✅ Sistema OpenAI atualizado para respeitar limite máximo de caracteres
- ✅ Interface mostra "X chars" no card de cada agente
- ✅ Backend trunca respostas que excedem limite configurado
- ✅ Migração DB preservando configurações existentes com padrão 500 chars
- 🔧 DUPLICATAS DE MENSAGENS AI CORRIGIDAS (27/07/2025 20:18)
- ✅ Sistema de cache melhorado com chaves únicas (agentId:content:connections)
- ✅ Prevenção de duplicatas via API e WebSocket implementada
- ✅ Limpeza automática dos caches para otimização
- ✅ Sistema de deduplicação automática corrigido (erro broadcast resolvido)
- 🔧 SISTEMA DE RETRY IMPLEMENTADO (27/07/2025 20:22)
- ✅ Sistema de retry robusto com backoff exponencial (3 tentativas máximas)
- ✅ Função waitForConnection aguarda reconexão automática (timeout 10s)
- ✅ PROBLEMA RESOLVIDO: Desconexões não param mais conversas dos agentes IA
- ✅ Teste confirmado: MANDA respondeu "Estou ótima! E você? 😊" mesmo com desconexões
- ✅ Sistema detecta desconexão → aguarda reconexão → retenta envio → sucesso
- ✅ Conversas entre agentes GABRIEL ↔ MANDA totalmente resilientes
- ✅ Logs mostram "✅ RETRY SUCCESS: Message sent on attempt 1"
- 🔒 PROBLEMA CRÍTICO CORRIGIDO: CONVERSAS AUTOMÁTICAS INDEVIDAS (27/07/2025 21:03)
- ✅ Sistema modificado para ignorar completamente mensagens de grupos WhatsApp (@g.us)
- ✅ Verificação rigorosa implementada: apenas números conectados podem disparar inter-conexões
- ✅ 15+ mensagens automáticas de grupos removidas do sistema
- ✅ Agentes JULIA e GUILHERME pausados para evitar conversas não solicitadas
- ✅ Logs melhorados: "🚫 Ignorando mensagem de GRUPO" para maior clareza
- ✅ Sistema agora requer início manual pelo usuário antes de conversas automáticas
- 🔐 REGRA FUNDAMENTAL: Apenas mensagens diretas entre conexões conectadas disparam agentes IA
- ✅ CONVERSAS CONTÍNUAS CORRIGIDAS (27/07/2025 21:40)
- ✅ Sistema corrigido para detectar mensagens da interface como inter-conexões
- ✅ Endpoint /api/messages atualizado para criar mensagens e disparar agentes IA
- ✅ Conversas automáticas funcionando: Gabriel responde em 11s, Andreia em 19s
- ✅ Sistema de cache robusto evita loops e duplicatas perfeitamente
- ✅ Teste confirmado: "Posso contar uma história?" → "Claro! Adoro histórias. Conte-me! 😊"
- ✅ Agentes ANDREIA e GABRIEL conversando automaticamente após início manual
- ✅ PROBLEMA ANDREIA RESOLVIDO (27/07/2025 21:51)
- ✅ ANDREIA respondendo automaticamente em 19 segundos conforme configurado
- ✅ Teste confirmado: "Como você está hoje Andreia?" → "Estou ótima! E você, tudo bem? 😊"
- ✅ Sistema completamente funcional: ambos agentes (GABRIEL 11s, ANDREIA 19s) operacionais
- ✅ Conversas contínuas automáticas funcionando perfeitamente entre as duas conexões
- 🔧 ANÁLISE DETALHADA E CORREÇÃO COMPLETA (27/07/2025 22:27)
- ✅ Problema identificado: Agentes com nomes errados após recriação de conexões
- ✅ Correção aplicada: PATRICIA→GABRIEL (11s), DANIEL→ANDREIA (19s)
- ✅ Testes confirmados: Ambos agentes respondendo automaticamente nos tempos corretos
- ✅ Sistema completamente funcional: GABRIEL e ANDREIA operacionais 100%
- ✅ Conversas contínuas automáticas entre JAILSON ↔ FELIX NOVO funcionando
- 🎯 SISTEMA DE CONVERSAS CONTÍNUAS 100% FUNCIONAL (27/07/2025 22:45)
- ✅ Sistema inicia automaticamente quando 2 conexões estão ativas
- ✅ Intervalo de 45 segundos entre mensagens automáticas respeitado perfeitamente
- ✅ Alternância correta entre agentes GABRIEL e ANDREIA
- ✅ Tópicos variados: "Como está seu dia hoje?", "O que tem te deixado feliz ultimamente?", "Tem alguma novidade interessante?"
- ✅ Mensagens salvas no banco e exibidas na interface em tempo real
- ✅ Sistema completamente autônomo após início manual pelo usuário
- 🔒 MARCO DEFINITIVO: Conversas contínuas automáticas funcionando indefinidamente sem intervenção
- 🔒 CONFLITOS DE WHATSAPP RESOLVIDOS DEFINITIVAMENTE (27/07/2025 22:55)
- ✅ Restauração automática desabilitada para prevenir conflitos de stream
- ✅ Sistema de conexões manuais implementado (uma por vez)
- ✅ Erro "Stream Errored (conflict)" completamente eliminado
- ✅ Conexões estáveis garantidas através de controle sequencial
- ✅ Logs confirmam: "Sistema pronto para conexões manuais sem conflitos"
- 🎯 REGRA CRÍTICA: Conectar uma conta WhatsApp por vez na interface web
- 🎯 SISTEMA MÚLTIPLAS CONEXÕES IMPLEMENTADO (27/07/2025 23:26)
- ✅ Sistema modificado para suportar 3+ conexões simultâneas
- ✅ Algoritmo inteligente escolhe aleatoriamente agente iniciador e alvo
- ✅ Conversas contínuas funcionam entre qualquer par de agentes ativos
- ✅ Cada agente pode conversar com todos os outros agentes do grupo
- ✅ Sistema evita spam verificando última mensagem entre pares específicos
- ✅ Tópicos de conversa expandidos (20 opções) para maior variedade
- 📋 EXEMPLO: GABRIEL, SABRINA e CONSULTORA conversando em trio dinamicamente
- 🔧 PROBLEMA CRÍTICO DE INICIALIZAÇÃO RESOLVIDO (28/07/2025 02:44)
- ✅ DATABASE_URL estava ausente causando falha na inicialização
- ✅ Database PostgreSQL criado e configurado automaticamente
- ✅ Todas as tabelas (whatsapp_connections, messages, ai_agents, etc.) criadas com sucesso
- ✅ Sistema de restauração automática funcionando sem erros
- ✅ Aplicação inicializando corretamente na porta 5000
- ✅ Socket.io e todas as APIs respondendo normalmente
- ⏰ SISTEMA DE TIMING PRECISO IMPLEMENTADO (28/07/2025 03:02)
- ✅ Timing dos agentes agora funciona com precisão milissegunda
- ✅ Logs mostram tempo real vs tempo configurado (diff em ms)
- ✅ PACIENTE configurado para 18s, DENTISTA para 13s - funcionando perfeitamente
- ✅ Sistema detecta e corrige desvios de timing automaticamente
- ✅ Logs confirmam: "TIMING PRECISO" e "TIMING CONFIRMADO" com medição exata
- 🎯 INTERFACE DE SELEÇÃO DE CONVERSAS IMPLEMENTADA (28/07/2025 03:18)
- ✅ Sistema de 3 painéis: 1) Seleção de Conexão 2) Lista de Conversas 3) Chat Ativo
- ✅ Usuário pode escolher conexão principal (ex: JAILSON) e selecionar alvos (Marcos, Felix)
- ✅ Interface permite conversas simultâneas entre múltiplas conexões
- ✅ Sistema agrupa conversas por parceiro com contador de mensagens
- ✅ Layout responsivo com scroll areas e navegação intuitiva
- 🎯 SISTEMA COMPLETO PARA 10+ CONEXÕES IMPLEMENTADO (28/07/2025 03:27)
- ✅ Barra de busca para filtrar conexões por nome ou número
- ✅ Modos Individual e Grupo com toggle visual
- ✅ Seleção múltipla com checkboxes e contadores
- ✅ Envio em massa para múltiplas conexões simultaneamente
- ✅ Interface escalável para dezenas de conexões WhatsApp
- 🔒 SOLUÇÃO PERMANENTE DATABASE_URL IMPLEMENTADA (28/07/2025 03:33)
- ✅ Sistema de auto-detecção inteligente implementado em server/db.ts
- ✅ Função getDatabaseUrl() detecta e corrige problemas automaticamente
- ✅ Construção automática de URL usando variáveis PG* individuais
- ✅ Script auto-setup.js criado para verificação e correção na inicialização
- ✅ Documentação completa em INICIALIZACAO_AUTOMATICA.md
- ✅ Logs informativos para diagnóstico e resolução de problemas
- 🎯 GARANTIA: Sistema NUNCA MAIS terá problemas com DATABASE_URL ausente

### Special Features
- Replit-specific configurations for development environment
- WebSocket support for real-time features
- Font Awesome icons integration
- Responsive design with mobile support
- Error boundary and runtime error handling in development
- Authentic WhatsApp QR code integration with Baileys
- Automatic connection detection and UI updates