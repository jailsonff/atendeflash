import { 
  type WhatsappConnection, 
  type InsertWhatsappConnection,
  type Message,
  type InsertMessage,
  type AiAgent,
  type InsertAiAgent,
  type ChatgptConfig,
  type InsertChatgptConfig,
  type ActiveConversation,
  type InsertActiveConversation
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // WhatsApp Connections
  getWhatsappConnections(): Promise<WhatsappConnection[]>;
  getWhatsappConnection(id: string): Promise<WhatsappConnection | undefined>;
  getWhatsappConnectionByPhone(phoneNumber: string): Promise<WhatsappConnection | undefined>;
  createWhatsappConnection(connection: InsertWhatsappConnection): Promise<WhatsappConnection>;
  updateWhatsappConnection(id: string, updates: Partial<WhatsappConnection>): Promise<WhatsappConnection>;
  deleteWhatsappConnection(id: string): Promise<void>;

  // Messages
  getMessages(): Promise<Message[]>;
  getMessagesByConnection(connectionId: string): Promise<Message[]>;
  getConversation(fromId: string, toId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessage(id: string): Promise<void>;
  // Deduplication
  findDuplicateMessages(): Promise<Message[][]>;
  removeDuplicateMessages(): Promise<number>;

  // AI Agents
  getAiAgents(): Promise<AiAgent[]>;
  getAiAgent(id: string): Promise<AiAgent | undefined>;
  getAiAgentByConnection(connectionId: string): Promise<AiAgent | undefined>;
  getAllActiveAgents(): Promise<AiAgent[]>;
  createAiAgent(agent: InsertAiAgent): Promise<AiAgent>;
  updateAiAgent(id: string, updates: Partial<AiAgent>): Promise<AiAgent>;
  deleteAiAgent(id: string): Promise<void>;

  // ChatGPT Config
  getChatgptConfig(): Promise<ChatgptConfig | undefined>;
  createOrUpdateChatgptConfig(config: InsertChatgptConfig): Promise<ChatgptConfig>;
  
  // Active Conversations
  getActiveConversations(): Promise<ActiveConversation[]>;
  preserveActiveConversationsOnRestart(): Promise<void>;
  ensureConversationsPermanentlyActive(): Promise<void>;
  getActiveConversation(connection1Id: string, connection2Id: string): Promise<ActiveConversation | undefined>;
  createActiveConversation(conversation: InsertActiveConversation): Promise<ActiveConversation>;
  updateActiveConversation(id: string, updates: Partial<ActiveConversation>): Promise<ActiveConversation>;
  deleteActiveConversation(id: string): Promise<void>;
  toggleConversationStatus(connection1Id: string, connection2Id: string, startedBy?: string): Promise<ActiveConversation>;
}

export class MemStorage implements IStorage {
  private connections: Map<string, WhatsappConnection>;
  private messages: Map<string, Message>;
  private agents: Map<string, AiAgent>;
  private chatgptConfig: ChatgptConfig | undefined;
  private activeConversations: Map<string, ActiveConversation>;

  constructor() {
    this.connections = new Map();
    this.messages = new Map();
    this.agents = new Map();
    this.chatgptConfig = undefined;
    this.activeConversations = new Map();
  }

  async getWhatsappConnections(): Promise<WhatsappConnection[]> {
    return Array.from(this.connections.values());
  }

  async getWhatsappConnection(id: string): Promise<WhatsappConnection | undefined> {
    return this.connections.get(id);
  }

  async getWhatsappConnectionByPhone(phoneNumber: string): Promise<WhatsappConnection | undefined> {
    return Array.from(this.connections.values()).find(conn => conn.phoneNumber === phoneNumber);
  }

  async createWhatsappConnection(connection: InsertWhatsappConnection): Promise<WhatsappConnection> {
    const id = randomUUID();
    const now = new Date();
    const newConnection: WhatsappConnection = {
      ...connection,
      id,
      status: connection.status || 'disconnected',
      qrCode: connection.qrCode || null,
      sessionData: connection.sessionData || null,
      lastSeen: connection.lastSeen || null,
      createdAt: now,
      updatedAt: now,
    };
    this.connections.set(id, newConnection);
    return newConnection;
  }

  async updateWhatsappConnection(id: string, updates: Partial<WhatsappConnection>): Promise<WhatsappConnection> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error("Connection not found");
    }
    const updated = { ...connection, ...updates, updatedAt: new Date() };
    this.connections.set(id, updated);
    return updated;
  }

  async deleteWhatsappConnection(id: string): Promise<void> {
    this.connections.delete(id);
  }

  async getMessages(): Promise<Message[]> {
    return Array.from(this.messages.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async getMessagesByConnection(connectionId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(msg => msg.fromConnectionId === connectionId || msg.toConnectionId === connectionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async getConversation(fromId: string, toId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(msg => 
        (msg.fromConnectionId === fromId && msg.toConnectionId === toId) ||
        (msg.fromConnectionId === toId && msg.toConnectionId === fromId)
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // 🧠 NOVA FUNÇÃO: Buscar histórico de conversa para memória do agente
  async getConversationMemory(connection1Id: string, connection2Id: string, memorySize: number = 10): Promise<Message[]> {
    const conversation = await this.getConversation(connection1Id, connection2Id);
    // Retorna as últimas N mensagens para contexto
    return conversation.slice(-memorySize);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const newMessage: Message = {
      ...message,
      id,
      fromConnectionId: message.fromConnectionId || null,
      toConnectionId: message.toConnectionId || null,
      messageType: message.messageType || 'text',
      isFromAgent: message.isFromAgent || false,
      agentId: message.agentId || null,
      timestamp: new Date(),
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  async deleteMessage(id: string): Promise<void> {
    this.messages.delete(id);
  }

  // Deduplication Functions for MemStorage
  async findDuplicateMessages(): Promise<Message[][]> {
    const allMessages = Array.from(this.messages.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const duplicates: Message[][] = [];
    const processed = new Set<string>();

    for (const message of allMessages) {
      if (processed.has(message.id)) continue;
      
      // Find messages with same content, same connections, within 1 minute
      const similar = allMessages.filter(msg => 
        msg.id !== message.id &&
        msg.content.trim() === message.content.trim() &&
        msg.fromConnectionId === message.fromConnectionId &&
        msg.toConnectionId === message.toConnectionId &&
        Math.abs(new Date(msg.timestamp).getTime() - new Date(message.timestamp).getTime()) < 60000 // 1 minute
      );

      if (similar.length > 0) {
        const group = [message, ...similar];
        duplicates.push(group);
        group.forEach(msg => processed.add(msg.id));
      }
    }

    return duplicates;
  }

  async removeDuplicateMessages(): Promise<number> {
    const duplicateGroups = await this.findDuplicateMessages();
    let removedCount = 0;

    for (const group of duplicateGroups) {
      // Keep the oldest message (first in group), remove the rest
      const toRemove = group.slice(1);
      
      for (const message of toRemove) {
        this.messages.delete(message.id);
        removedCount++;
      }
    }

    return removedCount;
  }

  async getAiAgents(): Promise<AiAgent[]> {
    return Array.from(this.agents.values());
  }

  async getAiAgent(id: string): Promise<AiAgent | undefined> {
    return this.agents.get(id);
  }

  async getAiAgentByConnection(connectionId: string): Promise<AiAgent | undefined> {
    return Array.from(this.agents.values()).find(agent => agent.connectionId === connectionId);
  }

  async getActiveAgentsForConnection(connectionId: string): Promise<AiAgent[]> {
    // Para compatibilidade: retorna agentes conectados via connectionId ou através de agentConnections
    return Array.from(this.agents.values()).filter(agent => 
      agent.connectionId === connectionId && agent.isActive && !agent.isPaused
    );
  }

  async getAllActiveAgents(): Promise<AiAgent[]> {
    return Array.from(this.agents.values()).filter(agent => 
      agent.isActive && !agent.isPaused
    );
  }

  async createAiAgent(agent: InsertAiAgent): Promise<AiAgent> {
    const id = randomUUID();
    const now = new Date();
    const newAgent: AiAgent = {
      ...agent,
      id,
      description: agent.description || null,
      temperature: agent.temperature || null,
      connectionId: agent.connectionId || null,
      isActive: agent.isActive !== undefined ? agent.isActive : true,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.agents.set(id, newAgent);
    return newAgent;
  }

  async updateAiAgent(id: string, updates: Partial<AiAgent>): Promise<AiAgent> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error("Agent not found");
    }
    const updated = { ...agent, ...updates, updatedAt: new Date() };
    this.agents.set(id, updated);
    return updated;
  }

  async deleteAiAgent(id: string): Promise<void> {
    this.agents.delete(id);
  }

  async getChatgptConfig(): Promise<ChatgptConfig | undefined> {
    return this.chatgptConfig;
  }

  async createOrUpdateChatgptConfig(config: InsertChatgptConfig): Promise<ChatgptConfig> {
    const id = this.chatgptConfig?.id || randomUUID();
    const now = new Date();
    
    this.chatgptConfig = {
      ...config,
      id,
      responseTime: config.responseTime || null,  
      autoResponse: config.autoResponse !== undefined ? config.autoResponse : null,
      continuousConversations: config.continuousConversations !== undefined ? config.continuousConversations : null,
      keywordTriggers: config.keywordTriggers || [],
      createdAt: this.chatgptConfig?.createdAt || now,
      updatedAt: now,
    };
    
    return this.chatgptConfig;
  }

  // Active Conversations - MemStorage
  async getActiveConversations(): Promise<ActiveConversation[]> {
    return Array.from(this.activeConversations.values());
  }

  async getActiveConversation(connection1Id: string, connection2Id: string): Promise<ActiveConversation | undefined> {
    return Array.from(this.activeConversations.values()).find(conv => 
      (conv.connection1Id === connection1Id && conv.connection2Id === connection2Id) ||
      (conv.connection1Id === connection2Id && conv.connection2Id === connection1Id)
    );
  }

  async createActiveConversation(conversation: InsertActiveConversation): Promise<ActiveConversation> {
    const id = randomUUID();
    const now = new Date();
    const newConversation: ActiveConversation = {
      ...conversation,
      id,
      isActive: conversation.isActive !== undefined ? conversation.isActive : true,
      lastMessageAt: conversation.lastMessageAt || now,
      createdAt: now,
      updatedAt: now,
    };
    this.activeConversations.set(id, newConversation);
    return newConversation;
  }

  async updateActiveConversation(id: string, updates: Partial<ActiveConversation>): Promise<ActiveConversation> {
    const conversation = this.activeConversations.get(id);
    if (!conversation) {
      throw new Error("Active conversation not found");
    }
    const updated = { ...conversation, ...updates, updatedAt: new Date() };
    this.activeConversations.set(id, updated);
    return updated;
  }

  async deleteActiveConversation(id: string): Promise<void> {
    this.activeConversations.delete(id);
  }

  async toggleConversationStatus(connection1Id: string, connection2Id: string, startedBy?: string): Promise<ActiveConversation> {
    const existing = await this.getActiveConversation(connection1Id, connection2Id);
    
    if (existing) {
      if (existing.isActive) {
        // Desativar conversa existente
        return await this.updateActiveConversation(existing.id, { isActive: false });
      } else {
        // Reativar conversa existente
        return await this.updateActiveConversation(existing.id, { 
          isActive: true, 
          lastMessageAt: new Date(),
          startedBy: startedBy || existing.startedBy 
        });
      }
    } else {
      // Criar nova conversa ativa
      return await this.createActiveConversation({
        connection1Id,
        connection2Id,
        isActive: true,
        startedBy: startedBy || "user",
        lastMessageAt: new Date()
      });
    }
  }
}

// Import database and create DatabaseStorage
import { db } from "./db";
import { 
  whatsappConnections, 
  messages, 
  aiAgents, 
  chatgptConfig,
  activeConversations
} from "@shared/schema";
import { eq, desc, and, or } from "drizzle-orm";

export class DatabaseStorage implements IStorage {
  // WhatsApp Connections
  async getWhatsappConnections(): Promise<WhatsappConnection[]> {
    return await db.select().from(whatsappConnections).orderBy(desc(whatsappConnections.createdAt));
  }

  async getWhatsappConnection(id: string): Promise<WhatsappConnection | undefined> {
    const [connection] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, id));
    return connection || undefined;
  }

  async getWhatsappConnectionByPhone(phoneNumber: string): Promise<WhatsappConnection | undefined> {
    const [connection] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.phoneNumber, phoneNumber));
    return connection || undefined;
  }

  async createWhatsappConnection(connection: InsertWhatsappConnection): Promise<WhatsappConnection> {
    const [newConnection] = await db
      .insert(whatsappConnections)
      .values({
        ...connection,
        id: randomUUID(),
        status: connection.status || 'disconnected',
        phoneNumber: connection.phoneNumber || null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newConnection;
  }

  async updateWhatsappConnection(id: string, updates: Partial<WhatsappConnection>): Promise<WhatsappConnection> {
    const [updatedConnection] = await db
      .update(whatsappConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(whatsappConnections.id, id))
      .returning();
    return updatedConnection;
  }

  async deleteWhatsappConnection(id: string): Promise<void> {
    // Delete all messages where this connection is the sender OR receiver
    await db.delete(messages).where(
      or(
        eq(messages.fromConnectionId, id),
        eq(messages.toConnectionId, id)
      )
    );
    
    // Delete all AI agents associated with this connection
    await db.delete(aiAgents).where(eq(aiAgents.connectionId, id));
    
    // Finally delete the connection itself
    await db.delete(whatsappConnections).where(eq(whatsappConnections.id, id));
  }

  // Messages
  async getMessages(): Promise<Message[]> {
    return await db.select().from(messages).orderBy(desc(messages.timestamp));
  }

  async getMessagesByConnection(connectionId: string): Promise<Message[]> {
    return await db.select().from(messages)
      .where(or(
        eq(messages.fromConnectionId, connectionId),
        eq(messages.toConnectionId, connectionId)
      ))
      .orderBy(desc(messages.timestamp));
  }

  async getConversation(fromId: string, toId: string): Promise<Message[]> {
    return await db.select().from(messages)
      .where(
        or(
          and(eq(messages.fromConnectionId, fromId), eq(messages.toConnectionId, toId)),
          and(eq(messages.fromConnectionId, toId), eq(messages.toConnectionId, fromId))
        )
      )
      .orderBy(desc(messages.timestamp));
  }

  // 🧠 FUNÇÃO DE MEMÓRIA: Buscar histórico de conversa para contexto do agente
  async getConversationMemory(connection1Id: string, connection2Id: string, memorySize: number = 10): Promise<Message[]> {
    const conversation = await this.getConversation(connection1Id, connection2Id);
    // Retorna as últimas N mensagens para contexto
    return conversation.slice(-memorySize);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values({
        ...message,
        id: randomUUID(),
        timestamp: new Date()
      })
      .returning();
    return newMessage;
  }

  async deleteMessage(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  // Deduplication Functions
  async findDuplicateMessages(): Promise<Message[][]> {
    const allMessages = await this.getMessages();
    const duplicates: Message[][] = [];
    const processed = new Set<string>();

    for (const message of allMessages) {
      if (processed.has(message.id)) continue;
      
      // Find messages with same content, same connections, within 1 minute
      const similar = allMessages.filter(msg => 
        msg.id !== message.id &&
        msg.content.trim() === message.content.trim() &&
        msg.fromConnectionId === message.fromConnectionId &&
        msg.toConnectionId === message.toConnectionId &&
        Math.abs(new Date(msg.timestamp).getTime() - new Date(message.timestamp).getTime()) < 60000 // 1 minute
      );

      if (similar.length > 0) {
        const group = [message, ...similar];
        duplicates.push(group);
        group.forEach(msg => processed.add(msg.id));
      }
    }

    return duplicates;
  }

  async removeDuplicateMessages(): Promise<number> {
    const duplicateGroups = await this.findDuplicateMessages();
    let removedCount = 0;

    for (const group of duplicateGroups) {
      // Keep the oldest message (first in group), remove the rest
      const toRemove = group.slice(1);
      
      for (const message of toRemove) {
        await this.deleteMessage(message.id);
        removedCount++;
      }
    }

    return removedCount;
  }

  // AI Agents
  async getAiAgents(): Promise<AiAgent[]> {
    return await db.select().from(aiAgents).orderBy(desc(aiAgents.createdAt));
  }

  async getAiAgent(id: string): Promise<AiAgent | undefined> {
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, id));
    return agent || undefined;
  }

  async getAiAgentByConnection(connectionId: string): Promise<AiAgent | undefined> {
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.connectionId, connectionId));
    return agent || undefined;
  }

  async createAiAgent(agent: InsertAiAgent): Promise<AiAgent> {
    const [newAgent] = await db
      .insert(aiAgents)
      .values({
        ...agent,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newAgent;
  }

  async updateAiAgent(id: string, updates: Partial<AiAgent>): Promise<AiAgent> {
    const [updatedAgent] = await db
      .update(aiAgents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(aiAgents.id, id))
      .returning();
    return updatedAgent;
  }

  async deleteAiAgent(id: string): Promise<void> {
    await db.delete(aiAgents).where(eq(aiAgents.id, id));
  }

  async getAllActiveAgents(): Promise<AiAgent[]> {
    return await db.select().from(aiAgents)
      .where(and(eq(aiAgents.isActive, true), eq(aiAgents.isPaused, false)))
      .orderBy(desc(aiAgents.createdAt));
  }

  // ChatGPT Config
  async getChatgptConfig(): Promise<ChatgptConfig | undefined> {
    const [config] = await db.select().from(chatgptConfig).limit(1);
    return config || undefined;
  }

  async createOrUpdateChatgptConfig(config: InsertChatgptConfig): Promise<ChatgptConfig> {
    const existing = await this.getChatgptConfig();
    
    if (existing) {
      const [updatedConfig] = await db
        .update(chatgptConfig)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(chatgptConfig.id, existing.id))
        .returning();
      return updatedConfig;
    } else {
      const [newConfig] = await db
        .insert(chatgptConfig)
        .values({
          ...config,
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newConfig;
    }
  }

  // Active Conversations - DatabaseStorage
  async getActiveConversations(): Promise<ActiveConversation[]> {
    return await db.select().from(activeConversations)
      .where(eq(activeConversations.isActive, true))
      .orderBy(desc(activeConversations.lastMessageAt));
  }

  // 🔒 PRESERVAÇÃO PERMANENTE: Conversas NUNCA são desativadas
  async preserveActiveConversationsOnRestart(): Promise<void> {
    // Buscar TODAS as conversas que foram iniciadas pelo usuário (não apenas as ativas)
    const allConversations = await db.select().from(activeConversations)
      .where(eq(activeConversations.startedBy, 'user'));
    
    if (allConversations.length > 0) {
      console.log(`🔄 PRESERVANDO ${allConversations.length} conversa(s) PERMANENTEMENTE após restart`);
      
      // FORÇAR REATIVAÇÃO: Todas as conversas iniciadas pelo usuário DEVEM estar ativas
      for (const conversation of allConversations) {
        await db.update(activeConversations)
          .set({ 
            isActive: true,  // 🔒 SEMPRE ATIVO
            updatedAt: new Date() 
          })
          .where(eq(activeConversations.id, conversation.id));
      }
      
      console.log(`🔒 CONVERSAS PERMANENTES GARANTIDAS: ${allConversations.length} conversas NUNCA serão desativadas`);
    }
  }

  // 🔒 NOVA FUNÇÃO: Garantir que conversas iniciadas nunca sejam desativadas
  async ensureConversationsPermanentlyActive(): Promise<void> {
    const inactiveConversations = await db.select().from(activeConversations)
      .where(and(
        eq(activeConversations.startedBy, 'user'),
        eq(activeConversations.isActive, false)
      ));
    
    if (inactiveConversations.length > 0) {
      console.log(`🔒 REATIVANDO ${inactiveConversations.length} conversa(s) que foram desativadas indevidamente`);
      
      for (const conversation of inactiveConversations) {
        await db.update(activeConversations)
          .set({ 
            isActive: true,
            updatedAt: new Date() 
          })
          .where(eq(activeConversations.id, conversation.id));
      }
      
      console.log(`✅ CONVERSAS REATIVADAS: ${inactiveConversations.length} conversas voltaram ao estado permanente`);
    }
  }

  async getActiveConversation(connection1Id: string, connection2Id: string): Promise<ActiveConversation | undefined> {
    const [conversation] = await db.select().from(activeConversations)
      .where(
        or(
          and(eq(activeConversations.connection1Id, connection1Id), eq(activeConversations.connection2Id, connection2Id)),
          and(eq(activeConversations.connection1Id, connection2Id), eq(activeConversations.connection2Id, connection1Id))
        )
      );
    return conversation || undefined;
  }

  async createActiveConversation(conversation: InsertActiveConversation): Promise<ActiveConversation> {
    const [newConversation] = await db
      .insert(activeConversations)
      .values({
        ...conversation,
        id: randomUUID(),
        isActive: conversation.isActive !== undefined ? conversation.isActive : true,
        lastMessageAt: conversation.lastMessageAt || new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newConversation;
  }

  async updateActiveConversation(id: string, updates: Partial<ActiveConversation>): Promise<ActiveConversation> {
    const [updatedConversation] = await db
      .update(activeConversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(activeConversations.id, id))
      .returning();
    return updatedConversation;
  }

  async deleteActiveConversation(id: string): Promise<void> {
    await db.delete(activeConversations).where(eq(activeConversations.id, id));
  }

  async toggleConversationStatus(connection1Id: string, connection2Id: string, startedBy?: string): Promise<ActiveConversation> {
    const existing = await this.getActiveConversation(connection1Id, connection2Id);
    
    if (existing) {
      if (existing.isActive) {
        // Desativar conversa existente
        return await this.updateActiveConversation(existing.id, { isActive: false });
      } else {
        // Reativar conversa existente
        return await this.updateActiveConversation(existing.id, { 
          isActive: true, 
          lastMessageAt: new Date(),
          startedBy: startedBy || existing.startedBy 
        });
      }
    } else {
      // Criar nova conversa ativa
      return await this.createActiveConversation({
        connection1Id,
        connection2Id,
        isActive: true,
        startedBy: startedBy || "user",
        lastMessageAt: new Date()
      });
    }
  }
}

export const storage = new DatabaseStorage();
