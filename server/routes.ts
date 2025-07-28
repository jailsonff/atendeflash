import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { baileysWhatsAppService } from "./services/baileys-whatsapp";
import { openaiService } from "./services/openai";

// SISTEMA DE CONVERSAS CONTÍNUAS AUTOMÁTICAS
let continuousConversationInterval: NodeJS.Timeout | null = null;
const CONVERSATION_INTERVAL = 45000; // 45 segundos entre mensagens automáticas

// Função para iniciar conversas contínuas entre agentes (SUPORTE MÚLTIPLAS CONEXÕES)
async function startContinuousConversations(broadcastFn?: (event: string, data: any) => void) {
  if (continuousConversationInterval) {
    clearInterval(continuousConversationInterval);
  }
  
  console.log(`🔄 SISTEMA DE CONVERSAS CONTÍNUAS INICIADO (intervalo: ${CONVERSATION_INTERVAL/1000}s)`);
  
  continuousConversationInterval = setInterval(async () => {
    try {
      // 🔒 NOVA LÓGICA: Verificar conversas ativas específicas ao invés de global
      const activeConversations = await storage.getActiveConversations();
      if (activeConversations.length === 0) {
        console.log(`⏸️ CONVERSAS CONTÍNUAS: Nenhuma conversa específica ativa`);
        return;
      }
      
      const connections = await storage.getWhatsappConnections();
      const activeConnections = connections.filter(c => c.status === 'connected');
      
      if (activeConnections.length < 2) {
        console.log(`⏭️ CONVERSAS CONTÍNUAS: Aguardando pelo menos 2 conexões ativas (atual: ${activeConnections.length})`);
        return;
      }
      
      // NOVO SISTEMA: Buscar TODOS os agentes ativos (não vinculados a conexões específicas)
      const allActiveAgents = await storage.getAllActiveAgents();
      
      if (allActiveAgents.length < 2) {
        const agentStatus = allActiveAgents.map(a => `${a.name}: ✅`).join(', ') || 'Nenhum agente ativo';
        console.log(`⏭️ CONVERSAS CONTÍNUAS: Aguardando pelo menos 2 agentes ativos (${agentStatus})`);
        return;
      }
      
      // 🎯 NOVA LÓGICA: Escolher par de conexões baseado em conversas ativas
      const activeConversation = activeConversations[Math.floor(Math.random() * activeConversations.length)];
      
      const initiatorConnection = activeConnections.find(c => c.id === activeConversation.connection1Id);
      const targetConnection = activeConnections.find(c => c.id === activeConversation.connection2Id);
      
      if (!initiatorConnection || !targetConnection) {
        console.log(`⚠️ CONVERSAS CONTÍNUAS: Conexões da conversa ativa não encontradas ou desconectadas`);
        return;
      }
      
      // Buscar agentes para as conexões específicas
      const initiatorAgent = allActiveAgents.find(agent => agent.connectionId === initiatorConnection.id);
      const targetAgent = allActiveAgents.find(agent => agent.connectionId === targetConnection.id);
      
      if (!initiatorAgent || !targetAgent) {
        console.log(`⚠️ CONVERSAS CONTÍNUAS: Agentes não encontrados para ${initiatorConnection.name} ou ${targetConnection.name}`);
        return;
      }
      
      // Verificar última mensagem entre essas duas conexões específicas para evitar spam
      const recentMessages = await storage.getConversation(initiatorConnection.id, targetConnection.id);
      const lastMessage = recentMessages[recentMessages.length - 1];
      
      if (lastMessage && (Date.now() - new Date(lastMessage.timestamp).getTime()) < 25000) {
        console.log(`⏭️ CONVERSAS CONTÍNUAS: Aguardando intervalo entre ${initiatorConnection.name} e ${targetConnection.name} (última mensagem há ${Math.round((Date.now() - new Date(lastMessage.timestamp).getTime())/1000)}s)`);
        return;
      }
      
      console.log(`🤖 CONVERSAS CONTÍNUAS: ${initiatorAgent.name} (via ${initiatorConnection.name}) iniciando conversa com ${targetAgent.name} (via ${targetConnection.name}) [${allActiveAgents.length} agentes livres]`);
      
      // Gerar tópicos de conversa aleatórios com mais variedade
      const topics = [
        "Como está seu dia hoje?",
        "O que você tem feito ultimamente?",
        "Tem alguma novidade interessante?",
        "Como você está se sentindo?",
        "Quer conversar sobre algo específico?",
        "O que acha de falarmos sobre nossos hobbies?",
        "Tem algum plano para hoje?",
        "Como foi sua semana?",
        "Quer contar alguma história interessante?",
        "O que tem te deixado feliz ultimamente?",
        "Qual sua opinião sobre isso?",
        "Como você passaria um dia perfeito?",
        "Qual foi a melhor coisa que aconteceu hoje?",
        "Tem alguma experiência interessante para compartilhar?",
        "O que mais te motiva ultimamente?",
        "Qual seu momento favorito do dia?",
        "Tem algum sonho que quer realizar?",
        "O que você faria se tivesse tempo livre?",
        "Qual sua memória mais especial?",
        "Como você descreveria seu humor hoje?"
      ];
      
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      
      // Criar mensagem de início de conversa
      const messageData = {
        fromConnectionId: initiatorConnection.id,
        toConnectionId: targetConnection.id,
        content: randomTopic,
        messageType: 'text' as const,
        isFromAgent: true,
        agentId: initiatorAgent.id
      };
      
      const message = await storage.createMessage(messageData);
      if (broadcastFn) {
        broadcastFn('message_received', message);
      }
      
      // Enviar via WhatsApp
      if (targetConnection.phoneNumber && baileysWhatsAppService.isConnected(initiatorConnection.id)) {
        await baileysWhatsAppService.sendMessage(
          initiatorConnection.id,
          targetConnection.phoneNumber,
          randomTopic
        );
        console.log(`🚀 CONVERSAS CONTÍNUAS: ${initiatorAgent.name} (${initiatorConnection.name}) → ${targetAgent.name} (${targetConnection.name})`);
      }
      
    } catch (error) {
      console.error('❌ Erro no sistema de conversas contínuas:', error);
    }
  }, CONVERSATION_INTERVAL);
}

import { 
  insertWhatsappConnectionSchema,
  insertMessageSchema,
  insertAiAgentSchema,
  insertChatgptConfigSchema 
} from "@shared/schema";

// WhatsApp Message Retry System - Handle disconnections gracefully
async function sendWhatsAppMessageWithRetry(
  fromConnectionId: string, 
  toPhoneNumber: string, 
  content: string, 
  maxRetries: number = 3
): Promise<void> {
  let attempt = 0;
  const retryDelay = 2000; // 2 seconds between retries
  
  while (attempt < maxRetries) {
    try {
      // Check if connection is available, if not wait for reconnection
      if (!baileysWhatsAppService.isConnected(fromConnectionId)) {
        console.log(`⏳ Connection ${fromConnectionId} not ready, waiting for reconnection (attempt ${attempt + 1}/${maxRetries})`);
        
        // Wait for connection with timeout
        const connected = await waitForConnection(fromConnectionId, 10000); // 10 second timeout
        if (!connected) {
          throw new Error('Connection timeout - unable to connect');
        }
      }
      
      // Attempt to send message
      await baileysWhatsAppService.sendMessage(fromConnectionId, toPhoneNumber, content, 'text');
      console.log(`✅ RETRY SUCCESS: Message sent on attempt ${attempt + 1}`);
      return; // Success - exit function
      
    } catch (error) {
      attempt++;
      console.log(`❌ RETRY ${attempt}/${maxRetries} FAILED: ${error.message}`);
      
      if (attempt >= maxRetries) {
        console.log(`🚨 FINAL FAILURE: All ${maxRetries} retry attempts failed for message: "${content.slice(0, 50)}..."`);
        throw error; // Final failure
      }
      
      // Wait before next retry with exponential backoff
      const delay = retryDelay * Math.pow(2, attempt - 1);
      console.log(`⏰ Waiting ${delay}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Helper function to wait for connection
async function waitForConnection(connectionId: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (baileysWhatsAppService.isConnected(connectionId)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Check every 500ms
  }
  
  return false;
}

// Global cache to track recent AI responses and prevent infinite loops
const recentAiResponses = new Map<string, number>(); // message content -> timestamp

// Global cache to track messages sent via API to prevent duplicates when they return from WhatsApp
const sentMessageCache = new Map<string, { timestamp: number; fromId: string; toId: string }>(); // message content -> metadata

// Enhanced cache to prevent AI message duplicates using unique keys
const aiMessageCache = new Map<string, { timestamp: number; processed: boolean }>(); // agentId:content:fromId:toId -> metadata

// Helper function to clean old entries from cache (older than 2 minutes)
const cleanAiResponseCache = () => {
  const now = Date.now();
  for (const [content, timestamp] of recentAiResponses.entries()) {
    if (now - timestamp > 120000) { // 2 minutes
      recentAiResponses.delete(content);
    }
  }
};

// Helper function to clean old entries from sent message cache (older than 1 minute)
const cleanSentMessageCache = () => {
  const now = Date.now();
  for (const [content, data] of sentMessageCache.entries()) {
    if (now - data.timestamp > 60000) { // 1 minute
      sentMessageCache.delete(content);
    }
  }
};

// Helper function to clean AI message cache (older than 2 minutes)
const cleanAiMessageCache = () => {
  const now = Date.now();
  for (const [key, data] of aiMessageCache.entries()) {
    if (now - data.timestamp > 120000) { // 2 minutes
      aiMessageCache.delete(key);
    }
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Socket.io server setup
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    console.log('Cliente Socket.io conectado:', socket.id);

    socket.on('disconnect', () => {
      console.log('Cliente Socket.io desconectado:', socket.id);
    });

    socket.on('error', (error) => {
      console.error('Erro Socket.io:', error);
    });
  });

  // Broadcast function for real-time updates via Socket.io
  function broadcast(event: string, data: any) {
    io.emit(event, data);
    console.log(`Broadcast ${event}:`, data);
  }

  // Baileys WhatsApp service event listeners
  baileysWhatsAppService.on('qr', (data) => {
    broadcast('qr_generated', data);
  });

  baileysWhatsAppService.on('connected', async (data) => {
    await storage.updateWhatsappConnection(data.connectionId, { 
      status: 'connected',
      phoneNumber: data.phoneNumber, // Save the phone number when connected
      lastSeen: new Date()
    });
    broadcast('connection_status', { 
      connectionId: data.connectionId, 
      status: 'connected',
      phoneNumber: data.phoneNumber 
    });
    
    // Iniciar conversas contínuas quando pelo menos 2 conexões estiverem ativas
    const connections = await storage.getWhatsappConnections();
    const activeConnections = connections.filter(c => c.status === 'connected');
    if (activeConnections.length >= 2) {
      console.log(`🎯 ${activeConnections.length} CONEXÕES ATIVAS DETECTADAS - Iniciando sistema de conversas contínuas`);
      startContinuousConversations(broadcast);
    }
  });

  baileysWhatsAppService.on('disconnected', async (data) => {
    await storage.updateWhatsappConnection(data.connectionId, { status: 'disconnected' });
    broadcast('connection_status', { connectionId: data.connectionId, status: 'disconnected' });
  });

  baileysWhatsAppService.on('message_sent', (data) => {
    broadcast('message_sent', data);
  });

  baileysWhatsAppService.on('message_received', async (data) => {
    console.log('Mensagem recebida:', data);
    try {
      // Get all connected WhatsApp numbers for intelligent routing
      const connections = await storage.getWhatsappConnections();
      const connectedNumbers = connections
        .filter(conn => conn.status === 'connected' && conn.phoneNumber)
        .reduce((acc, conn) => {
          const cleanNumber = conn.phoneNumber.replace(/\D/g, '');
          acc[cleanNumber] = { id: conn.id, name: conn.name };
          return acc;
        }, {} as Record<string, { id: string; name: string }>);

      console.log('🔍 DEBUG - Connected numbers:', Object.keys(connectedNumbers));
      console.log('🔍 DEBUG - Message from:', data.from);

      // Extract sender number from WhatsApp ID (format: number@s.whatsapp.net)
      const fromNumber = data.from?.split('@')[0]?.replace(/\D/g, '') || '';
      const senderConnection = connectedNumbers[fromNumber];
      
      console.log('🔍 DEBUG - From number extracted:', fromNumber);
      console.log('🔍 DEBUG - Sender connection found:', senderConnection?.name || 'NONE');
      console.log('🔍 DEBUG - Message receiving connection:', connections.find(c => c.id === data.connectionId)?.name);
      
      // Determine if this is an inter-connection message
      let messageData;
      
      // Check if message is from a connected WhatsApp number (direct inter-connection)
      const isDirectInterConnection = senderConnection && senderConnection.id !== data.connectionId;
      
      // Check if message is from our own system but not recognized (sent via web interface)
      // This happens when we send via API and it comes back from WhatsApp
      const receivingConnection = connections.find(c => c.id === data.connectionId);
      const allConnectedIds = connections.filter(c => c.status === 'connected').map(c => c.id);
      const isPotentialSystemMessage = receivingConnection && !data.fromMe;
      
      if (isDirectInterConnection) {
        // This is a message FROM one of our connections TO another
        console.log(`📨 Inter-conexão detectada: ${senderConnection.name} → ${receivingConnection?.name}`);
        
        // 🔒 CHECK FOR DUPLICATE MESSAGE - Skip if this message was sent via API
        cleanSentMessageCache(); // Clean old entries first
        cleanAiMessageCache(); // Clean AI message cache
        const cachedMessage = sentMessageCache.get(data.body);
        if (cachedMessage && 
            cachedMessage.fromId === senderConnection.id && 
            cachedMessage.toId === data.connectionId &&
            (Date.now() - cachedMessage.timestamp) < 60000) { // Within 1 minute
          
          console.log(`🔒 SKIP DUPLICATE: Message "${data.body.slice(0, 50)}..." was sent via API, ignoring WhatsApp duplicate`);
          sentMessageCache.delete(data.body); // Remove from cache to free memory
          return;
        }
        
        // Check if this message is from an AI agent (coming back from WhatsApp)
        // Clean old cache entries first
        cleanAiResponseCache();
        cleanAiMessageCache();
        
        const agentFromSender = await storage.getAiAgentByConnection(senderConnection.id);
        
        // Create unique key for AI message deduplication: agent+content+connections
        const aiMessageKey = agentFromSender ? 
          `${agentFromSender.id}:${data.body}:${senderConnection.id}:${data.connectionId}` : null;
        
        // Check if this exact AI message was already processed
        const isKnownAiMessage = aiMessageKey && aiMessageCache.has(aiMessageKey) && 
          (Date.now() - aiMessageCache.get(aiMessageKey)!.timestamp) < 120000; // Within 2 minutes
        
        // Skip known AI messages to prevent duplicates
        if (isKnownAiMessage) {
          console.log(`🔒 SKIP AI DUPLICATE: "${data.body.slice(0, 50)}..." from agent "${agentFromSender?.name}" already processed`);
          return;
        }
        
        // Check if this exact message content was recently sent by an AI agent
        const isAgentMessage = agentFromSender && agentFromSender.isActive && 
          recentAiResponses.has(data.body) && 
          (Date.now() - recentAiResponses.get(data.body)!) < 60000; // Within 1 minute
        
        if (isAgentMessage) {
          console.log(`🤖 DETECTED AI MESSAGE from agent "${agentFromSender.name}" - skipping AI trigger`);
          // Remove from cache to prevent issues
          recentAiResponses.delete(data.body);
        } else if (agentFromSender && agentFromSender.isActive) {
          console.log(`👤 HUMAN MESSAGE to connection with agent "${agentFromSender.name}" - will trigger AI if sent to other connection`);
        }
        
        messageData = {
          fromConnectionId: senderConnection.id, // The sender connection
          toConnectionId: data.connectionId,     // The receiver connection
          content: data.body,
          messageType: 'text' as const,
          isFromAgent: isAgentMessage, // Mark as AI message if from an agent connection
          agentId: isAgentMessage ? agentFromSender.id : null
        };
        
        // Mark AI message as processed in cache to prevent future duplicates
        if (isAgentMessage && aiMessageKey) {
          aiMessageCache.set(aiMessageKey, { 
            timestamp: Date.now(), 
            processed: true 
          });
          console.log(`🔒 AI MESSAGE CACHED: "${data.body.slice(0, 30)}..." from agent "${agentFromSender?.name}"`);
        }
      } else if (receivingConnection && allConnectedIds.length === 2 && !data.fromMe && 
                 !data.from.includes('@g.us') && 
                 data.from.includes('@s.whatsapp.net') &&
                 allConnectedIds.some(id => {
                   const conn = connections.find(c => c.id === id);
                   const phoneNumber = conn?.phoneNumber?.replace(/\D/g, '');
                   const fromNumber = data.from.replace('@s.whatsapp.net', '');
                   return phoneNumber && phoneNumber.includes(fromNumber);
                 })) { // ENABLED: Only for verified inter-connection messages from our connected numbers
        // SPECIAL CASE: When we have exactly 2 connections and message arrives from one of OUR connected numbers
        // This is specifically for AI agent responses that come back through WhatsApp
        // STRICT VERIFICATION: Only accept if the message comes from one of our connected phone numbers
        const otherConnectionId = allConnectedIds.find(id => id !== data.connectionId);
        if (otherConnectionId) {
          const otherConnection = connections.find(c => c.id === otherConnectionId);
          console.log(`🔄 VERIFIED inter-connection: ${otherConnection?.name} → ${receivingConnection.name} (from our connected number)`);
          
          // Clean caches
          cleanSentMessageCache();
          cleanAiMessageCache();
          
          // Check for agent messages
          const agentFromSender = await storage.getAiAgentByConnection(otherConnectionId);
          const aiMessageKey = agentFromSender ? 
            `${agentFromSender.id}:${data.body}:${otherConnectionId}:${data.connectionId}` : null;
          
          const isKnownAiMessage = aiMessageKey && aiMessageCache.has(aiMessageKey) && 
            (Date.now() - aiMessageCache.get(aiMessageKey)!.timestamp) < 120000;
          
          if (isKnownAiMessage) {
            console.log(`🔒 SKIP AI DUPLICATE: "${data.body.slice(0, 50)}..." from agent "${agentFromSender?.name}" already processed`);
            return;
          }
          
          const isAgentMessage = !!agentFromSender;
          
          messageData = {
            fromConnectionId: otherConnectionId,
            toConnectionId: data.connectionId,
            content: data.body,
            messageType: data.type,
            timestamp: data.timestamp || new Date(),
            isFromAgent: isAgentMessage,
            agentId: isAgentMessage ? agentFromSender.id : null
          };
          
          if (isAgentMessage && aiMessageKey) {
            aiMessageCache.set(aiMessageKey, { 
              timestamp: Date.now(), 
              processed: true 
            });
            console.log(`🔒 AI MESSAGE CACHED: "${data.body.slice(0, 30)}..." from agent "${agentFromSender?.name}"`);
          }
        } else {
          console.log(`🚫 Não foi possível determinar conexão de origem`);
          return;
        }
      } else {
        // Skip external messages and duplicates - we only want inter-connection messages
        if (!senderConnection && !data.fromMe) {
          if (data.from.includes('@g.us')) {
            console.log(`🚫 Ignorando mensagem de GRUPO para: ${receivingConnection?.name} (grupos não disparam agentes)`);
          } else {
            console.log(`🚫 Ignorando mensagem externa para: ${receivingConnection?.name} (${allConnectedIds.length} conexões)`);
          }
        } else {
          console.log(`⏭️  Ignorando duplicata: ${senderConnection?.name || 'desconhecido'} (própria mensagem)`);
        }
        return;
      }
      
      const message = await storage.createMessage(messageData);
      broadcast('message_received', message);
      
      // NOVO SISTEMA: Qualquer agente ativo pode responder a qualquer mensagem
      if (messageData.toConnectionId) {
        // Buscar um agente aleatório ativo para responder (não vinculado a conexão específica)
        const allActiveAgents = await storage.getAllActiveAgents();
        const availableAgents = allActiveAgents.filter(agent => 
          !messageData.agentId || agent.id !== messageData.agentId // Evitar que agente responda a si mesmo
        );
        
        if (availableAgents.length > 0) {
          // Escolher agente aleatório para responder
          const randomAgentIndex = Math.floor(Math.random() * availableAgents.length);
          const agent = availableAgents[randomAgentIndex];
          
          console.log(`🤖 SISTEMA LIVRE: Agente ${agent.name} escolhido aleatoriamente para responder (${messageData.isFromAgent ? 'AI-to-AI' : 'Human-to-AI'})`);
          
          // Use agent's individual response time - GARANTIA DE TIMING PRECISO
          const responseTime = agent?.responseTime || 2000;
          const startTime = Date.now();
          
          console.log(`⏰ TIMING PRECISO: Agente "${agent.name}" aguardando EXATOS ${responseTime}ms antes de responder (${responseTime/1000}s)`);
          
          setTimeout(async () => {
            const actualDelay = Date.now() - startTime;
            console.log(`✅ TIMING CONFIRMADO: Agente "${agent.name}" respondeu após ${actualDelay}ms (target: ${responseTime}ms, diff: ${actualDelay - responseTime}ms)`);
            try {
              // 🧠 BUSCAR MEMÓRIA DA CONVERSA para contexto do agente
              const memorySize = agent.memorySize || 10;
              const useMemory = agent.useMemory !== false; // Default true
              let conversationHistory: any[] = [];
              
              if (useMemory && messageData.fromConnectionId && messageData.toConnectionId) {
                conversationHistory = await storage.getConversationMemory(
                  messageData.fromConnectionId, 
                  messageData.toConnectionId, 
                  memorySize
                );
                console.log(`🧠 MEMÓRIA WebSocket: Carregadas ${conversationHistory.length} mensagens anteriores para contexto do agente ${agent.name}`);
              }

              const response = await openaiService.generateAgentResponse(
                agent.persona,
                messageData.content,
                (agent.temperature || 70) / 100,
                conversationHistory, // Pass full message objects with isFromAgent info
                agent.maxTokens || 500
              );

              const messageContent = response.messages[0];
              
              // Create AI response message
              const aiMessage = await storage.createMessage({
                fromConnectionId: messageData.toConnectionId,
                toConnectionId: messageData.fromConnectionId,
                content: messageContent,
                messageType: 'text',
                isFromAgent: true,
                agentId: agent.id
              });

              // Add to cache to prevent loops
              recentAiResponses.set(messageContent, Date.now());
              const aiMsgKey = `${agent.id}:${messageContent}:${messageData.toConnectionId}:${messageData.fromConnectionId}`;
              aiMessageCache.set(aiMsgKey, { timestamp: Date.now(), processed: true });

              // Send AI response via WhatsApp
              if (messageData.fromConnectionId) {
                const fromConnection = await storage.getWhatsappConnection(messageData.fromConnectionId);
                if (fromConnection && fromConnection.phoneNumber && baileysWhatsAppService.isConnected(messageData.toConnectionId)) {
                  console.log(`🚀 ${agent.name} → ${fromConnection.phoneNumber}: "${messageContent}"`);
                  await baileysWhatsAppService.sendMessage(
                    messageData.toConnectionId,
                    fromConnection.phoneNumber,
                    messageContent
                  );
                }
              }

              broadcast('ai_response', aiMessage);

              // Update agent message count
              await storage.updateAiAgent(agent.id, {
                messageCount: (agent.messageCount || 0) + 1
              });

              console.log(`✅ SISTEMA LIVRE: ${agent.name} respondeu com sucesso após ${responseTime}ms`);
            } catch (error) {
              console.error(`❌ Erro no agente ${agent.name}:`, error);
            }
          }, responseTime);
        } else {
          console.log(`🚫 SISTEMA LIVRE: Nenhum agente disponível para responder (${allActiveAgents.length} ativos, ${availableAgents.length} disponíveis)`);
        }
      }
    } catch (error) {
      console.error('Erro ao processar mensagem recebida:', error);
    }
  });

  baileysWhatsAppService.on('error', async (data) => {
    console.error('Erro no WhatsApp:', data);
    try {
      await storage.updateWhatsappConnection(data.connectionId, { 
        status: 'error' 
      });
      broadcast('error', data);
    } catch (error) {
      console.error('Erro ao atualizar status de erro:', error);
    }
  });

  // Dashboard API
  app.get("/api/dashboard/metrics", async (_req, res) => {
    try {
      const connections = await storage.getWhatsappConnections();
      const messages = await storage.getMessages();
      const agents = await storage.getAiAgents();

      const activeConnections = connections.filter(c => c.status === 'connected').length;
      const totalMessages = messages.length;
      const activeAgents = agents.filter(a => a.isActive).length;

      res.json({
        activeConnections,
        totalMessages,
        activeAgents,
        systemStatus: 'online'
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar métricas do dashboard" });
    }
  });

  // WhatsApp Connections API
  app.get("/api/connections", async (_req, res) => {
    try {
      const connections = await storage.getWhatsappConnections();
      res.json(connections);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar conexões" });
    }
  });

  app.post("/api/connections", async (req, res) => {
    try {
      // Only require name, phoneNumber will be filled after connection
      const connectionData = {
        name: req.body.name,
        phoneNumber: null, // Will be filled after WhatsApp connection
        status: 'disconnected' as const
      };
      
      const connection = await storage.createWhatsappConnection(connectionData);
      broadcast('new_connection', connection);
      res.json(connection);
    } catch (error) {
      res.status(400).json({ message: "Erro ao criar conexão: " + (error as Error).message });
    }
  });

  app.put("/api/connections/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const connection = await storage.updateWhatsappConnection(id, updates);
      broadcast('connection_updated', connection);
      res.json(connection);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar conexão: " + (error as Error).message });
    }
  });

  app.delete("/api/connections/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Delete from WhatsApp service first
      try {
        await baileysWhatsAppService.deleteSession(id);
      } catch (whatsappError) {
        console.error('Error deleting WhatsApp session:', whatsappError);
        // Continue with database deletion even if WhatsApp deletion fails
      }
      
      await storage.deleteWhatsappConnection(id);
      broadcast('connection_deleted', { id });
      res.json({ success: true, message: 'Conexão deletada com sucesso' });
    } catch (error) {
      res.status(500).json({ message: "Erro ao deletar conexão: " + (error as Error).message });
    }
  });

  app.post("/api/connections/:id/connect", async (req, res) => {
    try {
      const { id } = req.params;
      const connection = await storage.getWhatsappConnection(id);
      if (!connection) {
        return res.status(404).json({ message: "Conexão não encontrada" });
      }

      // Generate QR code and start connection process
      const qrCode = await baileysWhatsAppService.generateQRCode(id);
      await storage.updateWhatsappConnection(id, { 
        qrCode,
        status: 'connecting'
      });
      
      broadcast('qr_generated', { connectionId: id, qrCode });
      res.json({ success: true, qrCode, connectionId: id });
    } catch (error) {
      res.status(500).json({ message: "Erro ao conectar WhatsApp: " + (error as Error).message });
    }
  });

  app.post("/api/connections/:id/disconnect", async (req, res) => {
    try {
      const { id } = req.params;
      await baileysWhatsAppService.disconnectWhatsApp(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao desconectar WhatsApp: " + (error as Error).message });
    }
  });

  // Messages API - Show only inter-connection conversations
  app.get("/api/messages", async (_req, res) => {
    try {
      const allMessages = await storage.getMessages();
      const connections = await storage.getWhatsappConnections();
      const connectedIds = connections
        .filter(conn => conn.status === 'connected')
        .map(conn => conn.id);

      // Filter to show ONLY messages between our own connections
      const interConnectionMessages = allMessages.filter(message => {
        // Show messages where BOTH sender and receiver are our connections
        const fromIsOurConnection = message.fromConnectionId && connectedIds.includes(message.fromConnectionId);
        const toIsOurConnection = message.toConnectionId && connectedIds.includes(message.toConnectionId);
        
        // Only show if both sides are our connections (inter-connection chat)
        return fromIsOurConnection && toIsOurConnection;
      });

      console.log(`📋 Mensagens filtradas: ${interConnectionMessages.length} de ${allMessages.length} (apenas inter-conexões)`);
      res.json(interConnectionMessages);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar mensagens" });
    }
  });

  app.get("/api/conversations/:fromId/:toId", async (req, res) => {
    try {
      const { fromId, toId } = req.params;
      const messages = await storage.getConversation(fromId, toId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar conversa" });
    }
  });

  // Clear conversation between two specific connections
  app.delete("/api/conversations/:connectionId1/:connectionId2", async (req, res) => {
    try {
      const { connectionId1, connectionId2 } = req.params;
      
      // Get all messages between these two specific connections
      const allMessages = await storage.getMessages();
      const messagesToDelete = allMessages.filter(msg => 
        (msg.fromConnectionId === connectionId1 && msg.toConnectionId === connectionId2) ||
        (msg.fromConnectionId === connectionId2 && msg.toConnectionId === connectionId1)
      );
      
      // Delete each message
      for (const message of messagesToDelete) {
        await storage.deleteMessage(message.id);
      }
      
      console.log(`🗑️ CLEARED CONVERSATION: Deleted ${messagesToDelete.length} messages between ${connectionId1} and ${connectionId2}`);
      
      broadcast('conversation_cleared', { 
        connectionId1, 
        connectionId2, 
        deletedCount: messagesToDelete.length 
      });
      res.json({ success: true, deletedCount: messagesToDelete.length });
    } catch (error) {
      console.error('Error clearing conversation:', error);
      res.status(500).json({ message: "Erro ao limpar conversa: " + (error as Error).message });
    }
  });

  // 🎯 NOVA API: Gerenciar conversas ativas
  app.get("/api/active-conversations", async (req, res) => {
    try {
      const conversations = await storage.getActiveConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Erro ao buscar conversas ativas:", error);
      res.status(500).json({ error: "Failed to fetch active conversations" });
    }
  });

  app.post("/api/active-conversations/toggle", async (req, res) => {
    try {
      const { connection1Id, connection2Id, startedBy = "user" } = req.body;
      
      if (!connection1Id || !connection2Id) {
        return res.status(400).json({ error: "connection1Id and connection2Id are required" });
      }

      const conversation = await storage.toggleConversationStatus(connection1Id, connection2Id, startedBy);
      
      // Broadcast para notificar interface em tempo real
      io.emit('active_conversation_update', {
        conversation,
        action: conversation.isActive ? 'activated' : 'deactivated'
      });

      console.log(`🎯 CONVERSA ${conversation.isActive ? 'ATIVADA' : 'DESATIVADA'}: ${connection1Id} ↔ ${connection2Id} (iniciado por: ${startedBy})`);
      
      res.json({ 
        success: true, 
        conversation,
        message: `Conversa ${conversation.isActive ? 'ativada' : 'desativada'} com sucesso`
      });
    } catch (error) {
      console.error("Erro ao alternar conversa:", error);
      res.status(500).json({ error: "Failed to toggle conversation status" });
    }
  });

  // Auto-deduplication endpoint
  app.post("/api/messages/deduplicate", async (req, res) => {
    try {
      console.log('🔍 STARTING AUTOMATIC DEDUPLICATION...');
      
      // Find duplicates first to show what will be removed
      const duplicates = await storage.findDuplicateMessages();
      console.log(`🔍 FOUND ${duplicates.length} duplicate groups containing ${duplicates.reduce((sum, group) => sum + group.length, 0)} messages`);
      
      // Remove duplicates
      const removedCount = await storage.removeDuplicateMessages();
      
      console.log(`🔒 DEDUPLICATION COMPLETE: Removed ${removedCount} duplicate messages`);
      
      // Broadcast update to refresh UI
      broadcast('messages_deduplicated', { 
        removedCount,
        duplicateGroups: duplicates.length
      });
      
      res.json({ 
        success: true, 
        removedCount,
        duplicateGroups: duplicates.length,
        message: `Removidas ${removedCount} mensagens duplicadas em ${duplicates.length} grupos`
      });
    } catch (error) {
      console.error('Error during deduplication:', error);
      res.status(500).json({ message: "Erro na deduplicação: " + (error as Error).message });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage(messageData);

      // 🔒 ADD MESSAGE TO CACHE - Prevent duplicate when it returns from WhatsApp
      cleanSentMessageCache(); // Clean old entries first
      sentMessageCache.set(messageData.content, {
        timestamp: Date.now(),
        fromId: messageData.fromConnectionId || '',
        toId: messageData.toConnectionId || ''
      });
      console.log(`🔒 CACHE: Added API message to deduplication cache: "${messageData.content.slice(0, 50)}..."`);

      // Send via WhatsApp API - REAL SENDING IMPLEMENTATION
      if (messageData.fromConnectionId && messageData.toConnectionId) {
        const fromConnection = await storage.getWhatsappConnection(messageData.fromConnectionId);
        const toConnection = await storage.getWhatsappConnection(messageData.toConnectionId);
        
        console.log(`🔍 CHECKING CONNECTIONS:`, {
          from: fromConnection?.name,
          to: toConnection?.name,
          fromReady: baileysWhatsAppService.isConnected(messageData.fromConnectionId),
          toPhone: toConnection?.phoneNumber
        });
        
        if (fromConnection && toConnection && toConnection.phoneNumber) {
          
          console.log(`🚀 ATTEMPTING WHATSAPP SEND: ${fromConnection.name} → ${toConnection.name}`);
          
          // Send WhatsApp message with retry mechanism (asynchronously)
          sendWhatsAppMessageWithRetry(
            messageData.fromConnectionId,
            toConnection.phoneNumber,
            messageData.content,
            3 // Max 3 retries
          ).then(() => {
            console.log(`✅ WHATSAPP SUCCESS: "${messageData.content}" sent to ${toConnection.phoneNumber}`);
          }).catch((error) => {
            console.log(`❌ WHATSAPP FAILED AFTER RETRIES: ${error.message}`);
          });
        } else {
          console.log(`⚠️ SKIP WHATSAPP: Missing requirements`);
        }
      }

      // Check for AI agent response - CONTINUOUS CONVERSATION ENABLED  
      if (messageData.toConnectionId) {
        const agent = await storage.getAiAgentByConnection(messageData.toConnectionId);
        if (agent && agent.isActive && !agent.isPaused) {
          
          // CONTINUOUS CONVERSATION LOGIC: Same as WebSocket version
          const shouldRespond = !messageData.isFromAgent || // Always respond to human messages
            (messageData.isFromAgent && messageData.agentId !== agent.id); // Respond to other agents only
          
          if (shouldRespond) {
            // Use agent's individual response time - GARANTIA DE TIMING PRECISO
            const responseTime = agent?.responseTime || 2000; // Default 2 seconds if not set
            const startTime = Date.now();
            
            console.log(`⏰ TIMING PRECISO API: Agente "${agent.name}" aguardando EXATOS ${responseTime}ms (${responseTime/1000}s) - ${messageData.isFromAgent ? 'AI-to-AI contínua' : 'Humano-to-AI'}`);
            
            // Respect the configured response time delay with precise timing
            setTimeout(async () => {
              const actualDelay = Date.now() - startTime;
              console.log(`✅ TIMING CONFIRMADO API: Agente "${agent.name}" respondeu após ${actualDelay}ms (target: ${responseTime}ms, diff: ${actualDelay - responseTime}ms)`);
              
              try {
                // 🧠 BUSCAR MEMÓRIA DA CONVERSA para contexto do agente
                const memorySize = agent.memorySize || 10;
                const useMemory = agent.useMemory !== false; // Default true
                let conversationHistory: any[] = [];
                
                if (useMemory && messageData.fromConnectionId && messageData.toConnectionId) {
                  conversationHistory = await storage.getConversationMemory(
                    messageData.fromConnectionId, 
                    messageData.toConnectionId, 
                    memorySize
                  );
                  console.log(`🧠 MEMÓRIA API: Carregadas ${conversationHistory.length} mensagens anteriores para contexto do agente ${agent.name}`);
                }

                const response = await openaiService.generateAgentResponse(
                  agent.persona,
                  messageData.content,
                  (agent.temperature || 70) / 100,
                  conversationHistory, // Pass full message objects with isFromAgent info
                  agent.maxTokens || 500
                );

                // Send multiple messages if configured
                const messagesToSend = response.messages;

                for (let i = 0; i < messagesToSend.length; i++) {
                  const messageContent = messagesToSend[i];
                  
                  // Create AI response message - API VERSION
                  const aiMessage = await storage.createMessage({
                    fromConnectionId: messageData.toConnectionId,
                    toConnectionId: messageData.fromConnectionId,
                    content: messageContent,
                    messageType: 'text',
                    isFromAgent: true, // CRITICAL: Mark as AI message to prevent infinite loops
                    agentId: agent.id
                  });

                  // CRITICAL: Add to cache to prevent infinite loops when message comes back from WhatsApp
                  recentAiResponses.set(messageContent, Date.now());
                  
                  // Also add to AI message cache with unique key to prevent duplicates
                  const aiMsgKey = `${agent.id}:${messageContent}:${messageData.toConnectionId}:${messageData.fromConnectionId}`;
                  aiMessageCache.set(aiMsgKey, { timestamp: Date.now(), processed: true });
                  
                  console.log(`🔒 CACHE: Added AI response ${i+1}/${messagesToSend.length} to loop prevention cache: "${messageContent.slice(0, 50)}..."`);

                  // Send AI response via WhatsApp with retry mechanism for disconnections
                  if (messageData.fromConnectionId) {
                    const fromConnection = await storage.getWhatsappConnection(messageData.fromConnectionId);
                    if (fromConnection && fromConnection.phoneNumber) {
                      await sendWhatsAppMessageWithRetry(
                        messageData.toConnectionId || '',
                        fromConnection.phoneNumber,
                        messageContent,
                        3 // Max 3 retries
                      );
                      
                      // Small delay between multiple messages (500ms)
                      if (i < messagesToSend.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                      }
                    }
                  }

                  broadcast('ai_response', aiMessage);
                }

                // Update agent message count (count all messages sent)
                await storage.updateAiAgent(agent.id, {
                  messageCount: (agent.messageCount || 0) + messagesToSend.length
                });

                console.log(`✅ API: AI Agent ${agent.name} sent response (${messagesToSend[0]?.length || 0} chars) successfully after ${responseTime}ms individual delay`);
              } catch (error) {
                console.error('AI response error:', error);
              }
          }, responseTime);
          } else {
            console.log(`🚫 API: Agent "${agent.name}" SKIPPED - Same agent would be talking to itself`);
          }
        } else if (agent && agent.isPaused) {
          console.log(`⏸️ API: Agent "${agent.name}" SKIPPED - Agent is paused`);
        } else {
          console.log(`🚫 API: Agent "${agent.name}" SKIPPED - Not active or no agent found`);
        }
      }

      broadcast('new_message', message);
      res.json(message);
    } catch (error) {
      res.status(400).json({ message: "Erro ao enviar mensagem: " + (error as Error).message });
    }
  });

  // AI Agents API
  app.get("/api/agents", async (_req, res) => {
    try {
      const agents = await storage.getAiAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar agentes" });
    }
  });

  app.post("/api/agents", async (req, res) => {
    try {
      console.log('🔍 CREATING AGENT - Request body:', JSON.stringify(req.body, null, 2));
      
      // Validate that connectionId exists and is valid
      if (!req.body.connectionId) {
        return res.status(400).json({ message: "connectionId é obrigatório" });
      }
      
      // Check if connection exists
      const connection = await storage.getWhatsappConnection(req.body.connectionId);
      if (!connection) {
        return res.status(400).json({ message: "Conexão WhatsApp não encontrada" });
      }
      
      console.log('✅ Connection found:', connection.name);
      
      const agentData = insertAiAgentSchema.parse(req.body);
      console.log('✅ Schema validation passed:', JSON.stringify(agentData, null, 2));
      
      const agent = await storage.createAiAgent(agentData);
      console.log('✅ Agent created successfully:', agent.id);
      
      broadcast('new_agent', agent);
      res.json(agent);
    } catch (error) {
      console.error('❌ Error creating agent:', error);
      res.status(400).json({ message: "Erro ao criar agente: " + (error as Error).message });
    }
  });

  app.put("/api/agents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const agent = await storage.updateAiAgent(id, updates);
      broadcast('agent_updated', agent);
      res.json(agent);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar agente: " + (error as Error).message });
    }
  });

  app.delete("/api/agents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAiAgent(id);
      broadcast('agent_deleted', { id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao deletar agente: " + (error as Error).message });
    }
  });

  // ChatGPT Configuration API
  app.get("/api/chatgpt/config", async (_req, res) => {
    try {
      const config = await storage.getChatgptConfig();
      
      console.log('🔑 OpenAI API Key available:', !!process.env.OPENAI_API_KEY);
      console.log('📋 Existing config:', !!config);
      
      // If no config exists, return unconfigured state
      if (!config) {
        return res.json({ configured: false });
      }
      
      // Return config with masked API key
      const safeConfig = { ...config, apiKey: '***masked***' };
      res.json({ ...safeConfig, configured: true });
    } catch (error) {
      console.error('Error fetching ChatGPT config:', error);
      res.status(500).json({ message: "Erro ao buscar configuração" });
    }
  });

  app.post("/api/chatgpt/config", async (req, res) => {
    try {
      const configData = insertChatgptConfigSchema.parse(req.body);
      
      // Test API key if provided
      if (configData.apiKey) {
        const isValid = await openaiService.testApiKey(configData.apiKey);
        if (!isValid) {
          return res.status(400).json({ message: "Chave da API OpenAI inválida" });
        }
      }

      const config = await storage.createOrUpdateChatgptConfig(configData);
      const safeConfig = { ...config, apiKey: '***masked***' };
      
      broadcast('chatgpt_config_updated', safeConfig);
      res.json(safeConfig);
    } catch (error) {
      res.status(400).json({ message: "Erro ao salvar configuração: " + (error as Error).message });
    }
  });

  app.post("/api/chatgpt/test", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        return res.status(400).json({ message: "Chave da API é obrigatória" });
      }

      const isValid = await openaiService.testApiKey(apiKey);
      res.json({ valid: isValid });
    } catch (error) {
      res.status(500).json({ message: "Erro ao testar API: " + (error as Error).message });
    }
  });

  // Toggle global pause for all agents
  app.post("/api/agents/toggle-global-pause", async (req, res) => {
    try {
      const { paused } = req.body;
      
      // Update all agents with the new pause state
      const agents = await storage.getAiAgents();
      const updatePromises = agents.map(agent => 
        storage.updateAiAgent(agent.id, { isPaused: paused })
      );
      
      await Promise.all(updatePromises);
      
      console.log(`🔄 GLOBAL AGENT PAUSE: ${paused ? 'PAUSED' : 'RESUMED'} all ${agents.length} agents`);
      
      broadcast('agents_global_pause_toggled', { paused, affectedCount: agents.length });
      res.json({ success: true, paused, affectedCount: agents.length });
    } catch (error) {
      console.error('Error toggling global agent pause:', error);
      res.status(500).json({ message: "Erro ao pausar/despausar agentes: " + (error as Error).message });
    }
  });

  // Start automatic deduplication system
  startAutomaticDeduplication(broadcast);

  return httpServer;
}

// Automatic deduplication system - runs every 5 minutes
function startAutomaticDeduplication(broadcastFn: (event: string, data: any) => void) {
  console.log("🤖 SISTEMA DE DEDUPLICAÇÃO AUTOMÁTICA INICIADO (executa a cada 5 minutos)");
  
  setInterval(async () => {
    try {
      console.log('🔍 EXECUTANDO DEDUPLICAÇÃO AUTOMÁTICA...');
      
      const duplicates = await storage.findDuplicateMessages();
      if (duplicates.length === 0) {
        console.log('✅ DEDUPLICAÇÃO: Nenhuma duplicata encontrada');
        return;
      }
      
      const removedCount = await storage.removeDuplicateMessages();
      console.log(`🔒 DEDUPLICAÇÃO AUTOMÁTICA: Removidas ${removedCount} mensagens duplicadas automaticamente`);
      
      // Broadcast to update UI
      broadcastFn('messages_deduplicated', { 
        removedCount,
        duplicateGroups: duplicates.length,
        automatic: true
      });
      
    } catch (error) {
      console.error('❌ ERRO NA DEDUPLICAÇÃO AUTOMÁTICA:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
}
