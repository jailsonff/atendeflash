import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { baileysWhatsAppService } from "./services/baileys-whatsapp";
import { openaiService } from "./services/openai";
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

      // Extract sender number from WhatsApp ID (format: number@s.whatsapp.net)
      const fromNumber = data.from?.split('@')[0]?.replace(/\D/g, '') || '';
      const senderConnection = connectedNumbers[fromNumber];
      
      // Determine if this is an inter-connection message
      let messageData;
      if (senderConnection && senderConnection.id !== data.connectionId) {
        // This is a message FROM one of our connections TO another
        console.log(`📨 Inter-conexão detectada: ${senderConnection.name} → ${connections.find(c => c.id === data.connectionId)?.name}`);
        
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
      } else {
        // Skip external messages and duplicates - we only want inter-connection messages
        if (!senderConnection && !data.fromMe) {
          console.log(`🚫 Ignorando mensagem externa para: ${connections.find(c => c.id === data.connectionId)?.name}`);
        } else {
          console.log(`⏭️  Ignorando duplicata: ${senderConnection?.name || 'desconhecido'} (própria mensagem)`);
        }
        return;
      }
      
      const message = await storage.createMessage(messageData);
      broadcast('message_received', message);
      
      // Check for AI agent response - CONTINUOUS CONVERSATION ENABLED
      if (messageData.toConnectionId) {
        const agent = await storage.getAiAgentByConnection(messageData.toConnectionId);
        if (agent && agent.isActive) {
          
          // CONTINUOUS CONVERSATION LOGIC:
          // 1. Always respond to human messages (isFromAgent: false)
          // 2. Respond to AI messages from OTHER agents (prevent self-talk)
          // 3. Skip if it's from the same agent (prevent agent talking to itself)
          
          const shouldRespond = !messageData.isFromAgent || // Always respond to human messages
            (messageData.isFromAgent && messageData.agentId !== agent.id); // Respond to other agents only
          
          if (shouldRespond) {
            console.log(`🤖 Processing message with AI agent: ${agent.name} (${messageData.isFromAgent ? 'AI-to-AI continuous' : 'Human-to-AI'})`);
            
            // Use agent's individual response time
            const responseTime = agent?.responseTime || 2000; // Default 2 seconds if not set
            
            console.log(`⏰ WEBSOCKET: Agent "${agent.name}" waiting ${responseTime}ms before response (individual delay)`);
            
            // Respect the configured response time delay
            setTimeout(async () => {
            try {
              const conversationHistory = await storage.getConversation(
                messageData.fromConnectionId || '',
                messageData.toConnectionId
              );

              const response = await openaiService.generateAgentResponse(
                agent.persona,
                messageData.content,
                (agent.temperature || 70) / 100,
                conversationHistory.slice(-10).map(m => m.content),
                agent.maxTokens || 500
              );

              // Send multiple messages if configured
              const messagesToSend = response.messages;
              const createdMessages = [];

              for (let i = 0; i < messagesToSend.length; i++) {
                const messageContent = messagesToSend[i];
                
                // Create AI response message - WEBSOCKET VERSION
                const aiMessage = await storage.createMessage({
                  fromConnectionId: messageData.toConnectionId,
                  toConnectionId: messageData.fromConnectionId,
                  content: messageContent,
                  messageType: 'text',
                  isFromAgent: true, // CRITICAL: Mark as AI message to prevent infinite loops
                  agentId: agent.id
                });

                createdMessages.push(aiMessage);

                // CRITICAL: Add to cache to prevent infinite loops when message comes back from WhatsApp
                recentAiResponses.set(messageContent, Date.now());
                
                // Also add to AI message cache with unique key to prevent duplicates
                const aiMsgKey = `${agent.id}:${messageContent}:${messageData.toConnectionId}:${messageData.fromConnectionId}`;
                aiMessageCache.set(aiMsgKey, { timestamp: Date.now(), processed: true });
                
                console.log(`🔒 CACHE: Added AI response ${i+1}/${messagesToSend.length} to loop prevention cache: "${messageContent.slice(0, 50)}..."`);

                // Send AI response via WhatsApp with small delay between messages
                if (messageData.fromConnectionId) {
                  const fromConnection = await storage.getWhatsappConnection(messageData.fromConnectionId);
                  if (fromConnection && fromConnection.phoneNumber && baileysWhatsAppService.isConnected(messageData.toConnectionId)) {
                    console.log(`🚀 Sending AI response ${i+1}/${messagesToSend.length} from ${agent.name} to ${fromConnection.phoneNumber}: "${messageContent}"`);
                    await baileysWhatsAppService.sendMessage(
                      messageData.toConnectionId,
                      fromConnection.phoneNumber,
                      messageContent
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

              console.log(`✅ WEBSOCKET: AI Agent ${agent.name} sent response (${messagesToSend[0]?.length || 0} chars) successfully after ${responseTime}ms individual delay`);
            } catch (error) {
              console.error(`❌ AI response error for agent ${agent.name}:`, error);
            }
          }, responseTime);
          } else {
            console.log(`🚫 WEBSOCKET: Agent "${agent.name}" SKIPPED - Same agent would be talking to itself`);
          }
        } else {
          console.log(`🚫 WEBSOCKET: Agent "${agent.name}" SKIPPED - Not active or no agent found`);
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
        if (agent && agent.isActive) {
          
          // CONTINUOUS CONVERSATION LOGIC: Same as WebSocket version
          const shouldRespond = !messageData.isFromAgent || // Always respond to human messages
            (messageData.isFromAgent && messageData.agentId !== agent.id); // Respond to other agents only
          
          if (shouldRespond) {
            // Use agent's individual response time
            const responseTime = agent?.responseTime || 2000; // Default 2 seconds if not set
            
            console.log(`⏰ API: Agent "${agent.name}" waiting ${responseTime}ms before response (${messageData.isFromAgent ? 'AI-to-AI continuous' : 'Human-to-AI'}) (individual delay)`);
            
            // Respect the configured response time delay
            setTimeout(async () => {
            try {
              const conversationHistory = await storage.getConversation(
                messageData.fromConnectionId || '',
                messageData.toConnectionId
              );

              const response = await openaiService.generateAgentResponse(
                agent.persona,
                messageData.content,
                (agent.temperature || 70) / 100,
                conversationHistory.slice(-10).map(m => m.content),
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
                      messageData.toConnectionId,
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
      
      // Check if OpenAI API key exists in environment
      const hasApiKey = !!process.env.OPENAI_API_KEY;
      console.log('🔑 OpenAI API Key available:', hasApiKey);
      console.log('📋 Existing config:', !!config);
      
      if (!config && hasApiKey) {
        // Create default config if we have API key but no config
        const defaultConfig = {
          apiKey: process.env.OPENAI_API_KEY!,
          responseTime: 2000,
          autoResponse: true,
          keywordTriggers: []
        };
        
        const newConfig = await storage.createOrUpdateChatgptConfig(defaultConfig);
        const safeConfig = { ...newConfig, apiKey: '***masked***' };
        return res.json({ ...safeConfig, configured: true });
      }
      
      if (!config || !hasApiKey) {
        return res.json({ configured: false });
      }
      
      // Don't expose the API key
      const safeConfig = { ...config, apiKey: '***masked***' };
      res.json({ ...safeConfig, configured: true });
    } catch (error) {
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
