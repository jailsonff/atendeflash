import { 
  type WhatsappConnection, 
  type InsertWhatsappConnection,
  type Message,
  type InsertMessage,
  type AiAgent,
  type InsertAiAgent,
  type ChatgptConfig,
  type InsertChatgptConfig
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

  // AI Agents
  getAiAgents(): Promise<AiAgent[]>;
  getAiAgent(id: string): Promise<AiAgent | undefined>;
  getAiAgentByConnection(connectionId: string): Promise<AiAgent | undefined>;
  createAiAgent(agent: InsertAiAgent): Promise<AiAgent>;
  updateAiAgent(id: string, updates: Partial<AiAgent>): Promise<AiAgent>;
  deleteAiAgent(id: string): Promise<void>;

  // ChatGPT Config
  getChatgptConfig(): Promise<ChatgptConfig | undefined>;
  createOrUpdateChatgptConfig(config: InsertChatgptConfig): Promise<ChatgptConfig>;
}

export class MemStorage implements IStorage {
  private connections: Map<string, WhatsappConnection>;
  private messages: Map<string, Message>;
  private agents: Map<string, AiAgent>;
  private chatgptConfig: ChatgptConfig | undefined;

  constructor() {
    this.connections = new Map();
    this.messages = new Map();
    this.agents = new Map();
    this.chatgptConfig = undefined;
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

  async getAiAgents(): Promise<AiAgent[]> {
    return Array.from(this.agents.values());
  }

  async getAiAgent(id: string): Promise<AiAgent | undefined> {
    return this.agents.get(id);
  }

  async getAiAgentByConnection(connectionId: string): Promise<AiAgent | undefined> {
    return Array.from(this.agents.values()).find(agent => agent.connectionId === connectionId);
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
      keywordTriggers: config.keywordTriggers || [],
      createdAt: this.chatgptConfig?.createdAt || now,
      updatedAt: now,
    };
    
    return this.chatgptConfig;
  }
}

// Import database and create DatabaseStorage
import { db } from "./db";
import { 
  whatsappConnections, 
  messages, 
  aiAgents, 
  chatgptConfig 
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
}

export const storage = new DatabaseStorage();
