import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { whatsappService } from "./services/whatsapp";
import { openaiService } from "./services/openai";
import { 
  insertWhatsappConnectionSchema,
  insertMessageSchema,
  insertAiAgentSchema,
  insertChatgptConfigSchema 
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const connectedClients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log('Cliente WebSocket conectado');

    ws.on('close', () => {
      connectedClients.delete(ws);
      console.log('Cliente WebSocket desconectado');
    });

    ws.on('error', (error) => {
      console.error('Erro WebSocket:', error);
      connectedClients.delete(ws);
    });
  });

  // Broadcast function for real-time updates
  function broadcast(type: string, data: any) {
    const message = JSON.stringify({ type, data });
    connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // WhatsApp service event listeners
  whatsappService.on('qr', (data) => {
    broadcast('qr_generated', data);
  });

  whatsappService.on('connected', async (data) => {
    await storage.updateWhatsappConnection(data.connectionId, { 
      status: 'connected',
      lastSeen: new Date()
    });
    broadcast('connection_status', { connectionId: data.connectionId, status: 'connected' });
  });

  whatsappService.on('disconnected', async (data) => {
    await storage.updateWhatsappConnection(data.connectionId, { status: 'disconnected' });
    broadcast('connection_status', { connectionId: data.connectionId, status: 'disconnected' });
  });

  whatsappService.on('message_sent', (data) => {
    broadcast('message_sent', data);
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
      const connectionData = insertWhatsappConnectionSchema.parse(req.body);
      const connection = await storage.createWhatsappConnection(connectionData);
      
      // Generate QR code for new connection
      const qrCode = await whatsappService.generateQRCode(connection.id);
      const updatedConnection = await storage.updateWhatsappConnection(connection.id, { 
        qrCode,
        status: 'connecting'
      });

      broadcast('new_connection', updatedConnection);
      res.json(updatedConnection);
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
      await whatsappService.disconnectWhatsApp(id);
      await storage.deleteWhatsappConnection(id);
      broadcast('connection_deleted', { id });
      res.json({ success: true });
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

      await whatsappService.connectWhatsApp(id, connection.phoneNumber);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao conectar WhatsApp: " + (error as Error).message });
    }
  });

  app.post("/api/connections/:id/disconnect", async (req, res) => {
    try {
      const { id } = req.params;
      await whatsappService.disconnectWhatsApp(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao desconectar WhatsApp: " + (error as Error).message });
    }
  });

  // Messages API
  app.get("/api/messages", async (_req, res) => {
    try {
      const messages = await storage.getMessages();
      res.json(messages);
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

  app.post("/api/messages", async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage(messageData);

      // Send via WhatsApp if connections are active
      if (messageData.fromConnectionId && messageData.toConnectionId) {
        const toConnection = await storage.getWhatsappConnection(messageData.toConnectionId);
        if (toConnection && whatsappService.isConnected(messageData.fromConnectionId)) {
          await whatsappService.sendMessage(
            messageData.fromConnectionId,
            toConnection.phoneNumber,
            messageData.content,
            (messageData.messageType === 'emoji' ? 'text' : messageData.messageType) || 'text'
          );
        }
      }

      // Check for AI agent response
      if (messageData.toConnectionId && !messageData.isFromAgent) {
        const agent = await storage.getAiAgentByConnection(messageData.toConnectionId);
        if (agent && agent.isActive) {
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

            // Create AI response message
            const aiMessage = await storage.createMessage({
              fromConnectionId: messageData.toConnectionId,
              toConnectionId: messageData.fromConnectionId,
              content: response.message,
              messageType: 'text',
              isFromAgent: true,
              agentId: agent.id
            });

            // Update agent message count
            await storage.updateAiAgent(agent.id, {
              messageCount: (agent.messageCount || 0) + 1
            });

            // Send AI response via WhatsApp
            if (messageData.fromConnectionId) {
              const fromConnection = await storage.getWhatsappConnection(messageData.fromConnectionId);
              if (fromConnection && whatsappService.isConnected(messageData.toConnectionId)) {
                await whatsappService.sendMessage(
                  messageData.toConnectionId,
                  fromConnection.phoneNumber,
                  response.message
                );
              }
            }

            broadcast('ai_response', aiMessage);
          } catch (error) {
            console.error('AI response error:', error);
          }
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
      const agentData = insertAiAgentSchema.parse(req.body);
      const agent = await storage.createAiAgent(agentData);
      broadcast('new_agent', agent);
      res.json(agent);
    } catch (error) {
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
      if (!config) {
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
