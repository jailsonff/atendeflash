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

// Global cache to track recent AI responses and prevent infinite loops
const recentAiResponses = new Map<string, number>(); // message content -> timestamp

// Helper function to clean old entries from cache (older than 2 minutes)
const cleanAiResponseCache = () => {
  const now = Date.now();
  for (const [content, timestamp] of recentAiResponses.entries()) {
    if (now - timestamp > 120000) { // 2 minutes
      recentAiResponses.delete(content);
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
        
        // Check if this message is from an AI agent (coming back from WhatsApp)
        // Clean old cache entries first
        cleanAiResponseCache();
        
        const agentFromSender = await storage.getAiAgentByConnection(senderConnection.id);
        
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
      
      // Check for AI agent response (same logic as POST /api/messages)
      // IMPORTANT: Only trigger AI agents for human messages, NOT for AI-generated messages
      if (messageData.toConnectionId && !messageData.isFromAgent) {
        const agent = await storage.getAiAgentByConnection(messageData.toConnectionId);
        if (agent && agent.isActive) {
          console.log(`🤖 Processing message with AI agent: ${agent.name}`);
          
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
                conversationHistory.slice(-10).map(m => m.content)
              );

              // Create AI response message - WEBSOCKET VERSION
              const aiMessage = await storage.createMessage({
                fromConnectionId: messageData.toConnectionId,
                toConnectionId: messageData.fromConnectionId,
                content: response.message,
                messageType: 'text',
                isFromAgent: true, // CRITICAL: Mark as AI message to prevent infinite loops
                agentId: agent.id
              });

              // CRITICAL: Add to cache to prevent infinite loops when message comes back from WhatsApp
              recentAiResponses.set(response.message, Date.now());
              console.log(`🔒 CACHE: Added AI response to loop prevention cache: "${response.message.slice(0, 50)}..."`);;

              // Update agent message count
              await storage.updateAiAgent(agent.id, {
                messageCount: (agent.messageCount || 0) + 1
              });

              // Send AI response via WhatsApp
              if (messageData.fromConnectionId) {
                const fromConnection = await storage.getWhatsappConnection(messageData.fromConnectionId);
                if (fromConnection && fromConnection.phoneNumber && baileysWhatsAppService.isConnected(messageData.toConnectionId)) {
                  console.log(`🚀 Sending AI response from ${agent.name} to ${fromConnection.phoneNumber}: "${response.message}"`);
                  await baileysWhatsAppService.sendMessage(
                    messageData.toConnectionId,
                    fromConnection.phoneNumber,
                    response.message
                  );
                }
              }

              broadcast('ai_response', aiMessage);
              console.log(`✅ WEBSOCKET: AI Agent ${agent.name} responded successfully after ${responseTime}ms individual delay`);
            } catch (error) {
              console.error(`❌ AI response error for agent ${agent.name}:`, error);
            }
          }, responseTime);
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

  // Clear conversation between two connections
  app.delete("/api/conversations/:connectionId", async (req, res) => {
    try {
      const { connectionId } = req.params;
      
      // Get all messages where this connection is either sender or receiver
      const allMessages = await storage.getMessages();
      const messagesToDelete = allMessages.filter(msg => 
        msg.fromConnectionId === connectionId || msg.toConnectionId === connectionId
      );
      
      // Delete each message
      for (const message of messagesToDelete) {
        await storage.deleteMessage(message.id);
      }
      
      console.log(`🗑️ CLEARED CONVERSATION: Deleted ${messagesToDelete.length} messages for connection ${connectionId}`);
      
      broadcast('conversation_cleared', { connectionId, deletedCount: messagesToDelete.length });
      res.json({ success: true, deletedCount: messagesToDelete.length });
    } catch (error) {
      console.error('Error clearing conversation:', error);
      res.status(500).json({ message: "Erro ao limpar conversa: " + (error as Error).message });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage(messageData);

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
        
        if (fromConnection && toConnection && toConnection.phoneNumber && 
            baileysWhatsAppService.isConnected(messageData.fromConnectionId)) {
          
          console.log(`🚀 ATTEMPTING WHATSAPP SEND: ${fromConnection.name} → ${toConnection.name}`);
          
          // Send WhatsApp message asynchronously
          baileysWhatsAppService.sendMessage(
            messageData.fromConnectionId,
            toConnection.phoneNumber,
            messageData.content,
            'text'
          ).then(() => {
            console.log(`✅ WHATSAPP SUCCESS: "${messageData.content}" sent to ${toConnection.phoneNumber}`);
          }).catch((error) => {
            console.log(`❌ WHATSAPP FAILED: ${error.message}`);
          });
        } else {
          console.log(`⚠️ SKIP WHATSAPP: Missing requirements`);
        }
      }

      // Check for AI agent response with configured delay
      if (messageData.toConnectionId && !messageData.isFromAgent) {
        const agent = await storage.getAiAgentByConnection(messageData.toConnectionId);
        if (agent && agent.isActive) {
          // Use agent's individual response time
          const responseTime = agent?.responseTime || 2000; // Default 2 seconds if not set
          
          console.log(`⏰ API: Agent "${agent.name}" waiting ${responseTime}ms before response (individual delay)`);
          
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
                conversationHistory.slice(-10).map(m => m.content)
              );

              // Create AI response message - API VERSION
              const aiMessage = await storage.createMessage({
                fromConnectionId: messageData.toConnectionId,
                toConnectionId: messageData.fromConnectionId,
                content: response.message,
                messageType: 'text',
                isFromAgent: true, // CRITICAL: Mark as AI message to prevent infinite loops
                agentId: agent.id
              });

              // CRITICAL: Add to cache to prevent infinite loops when message comes back from WhatsApp
              recentAiResponses.set(response.message, Date.now());
              console.log(`🔒 CACHE: Added AI response to loop prevention cache: "${response.message.slice(0, 50)}..."`);;

              // Update agent message count
              await storage.updateAiAgent(agent.id, {
                messageCount: (agent.messageCount || 0) + 1
              });

              // Send AI response via WhatsApp
              if (messageData.fromConnectionId) {
                const fromConnection = await storage.getWhatsappConnection(messageData.fromConnectionId);
                if (fromConnection && fromConnection.phoneNumber && baileysWhatsAppService.isConnected(messageData.toConnectionId)) {
                  await baileysWhatsAppService.sendMessage(
                    messageData.toConnectionId,
                    fromConnection.phoneNumber,
                    response.message
                  );
                }
              }

              broadcast('ai_response', aiMessage);
              console.log(`✅ API: AI Agent ${agent.name} responded successfully after ${responseTime}ms individual delay`);
            } catch (error) {
              console.error('AI response error:', error);
            }
          }, responseTime);
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

  return httpServer;
}
