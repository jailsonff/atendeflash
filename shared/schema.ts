import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const whatsappConnections = pgTable("whatsapp_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phoneNumber: text("phone_number"), // Now optional, filled after connection
  status: text("status", { enum: ["connecting", "connected", "disconnected", "error"] }).notNull().default("disconnected"),
  qrCode: text("qr_code"),
  sessionData: jsonb("session_data"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromConnectionId: varchar("from_connection_id").references(() => whatsappConnections.id),
  toConnectionId: varchar("to_connection_id").references(() => whatsappConnections.id),
  content: text("content").notNull(),
  messageType: text("message_type", { enum: ["text", "image", "emoji"] }).notNull().default("text"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isFromAgent: boolean("is_from_agent").default(false),
  agentId: varchar("agent_id"),
});

export const aiAgents = pgTable("ai_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  persona: text("persona").notNull(),
  temperature: integer("temperature").default(70), // Store as integer (0.7 * 100)
  connectionId: varchar("connection_id").references(() => whatsappConnections.id),
  isActive: boolean("is_active").default(true),
  messageCount: integer("message_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatgptConfig = pgTable("chatgpt_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKey: text("api_key").notNull(),
  responseTime: integer("response_time").default(2000), // milliseconds
  autoResponse: boolean("auto_response").default(true),
  keywordTriggers: jsonb("keyword_triggers").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWhatsappConnectionSchema = createInsertSchema(whatsappConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const insertAiAgentSchema = createInsertSchema(aiAgents).omit({
  id: true,
  messageCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatgptConfigSchema = createInsertSchema(chatgptConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWhatsappConnection = z.infer<typeof insertWhatsappConnectionSchema>;
export type WhatsappConnection = typeof whatsappConnections.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertAiAgent = z.infer<typeof insertAiAgentSchema>;
export type AiAgent = typeof aiAgents.$inferSelect;

export type InsertChatgptConfig = z.infer<typeof insertChatgptConfigSchema>;
export type ChatgptConfig = typeof chatgptConfig.$inferSelect;
