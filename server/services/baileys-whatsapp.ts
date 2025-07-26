import { EventEmitter } from 'events';
import { Boom } from '@hapi/boom';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { 
  makeWASocket,
  DisconnectReason, 
  useMultiFileAuthState
} = require('@whiskeysockets/baileys');
import { pino } from 'pino';
import fs from 'fs';
import path from 'path';

export interface BaileysSession {
  id: string;
  qrCode?: string;
  isReady: boolean;
  clientInfo?: any;
  socket?: any;
}

export class BaileysWhatsAppService extends EventEmitter {
  private sessions: Map<string, BaileysSession> = new Map();
  private storage: any;
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    // Import storage dynamically to avoid circular dependency
    import('../storage.js').then(module => {
      this.storage = module.storage;
    });
  }

  async generateQRCode(connectionId: string): Promise<string> {
    console.log(`Creating Baileys WhatsApp session for connection: ${connectionId}`);
    
    // Check if session already exists and is connecting
    const existingSession = this.sessions.get(connectionId);
    if (existingSession && existingSession.socket) {
      console.log(`Session already exists for ${connectionId}, skipping duplicate connection`);
      return existingSession.qrCode || '';
    }
    
    // Create session directory
    const sessionDir = path.join(process.cwd(), '.baileys_auth', `session_${connectionId}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const session: BaileysSession = {
      id: connectionId,
      qrCode: undefined,
      isReady: false,
      clientInfo: null
    };

    this.sessions.set(connectionId, session);

    return new Promise(async (resolve, reject) => {
      try {
        // Get auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        // Create socket
        const socket = makeWASocket({
          auth: state,
          printQRInTerminal: true,
          logger: pino({ level: 'warn' }),
          generateHighQualityLinkPreview: true,
          defaultQueryTimeoutMs: 60000,
        });

        session.socket = socket;

        // Handle QR code
        socket.ev.on('connection.update', (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr && !session.qrCode) {
            console.log(`QR Code generated for ${connectionId}`);
            session.qrCode = qr;
            this.emit('qr', { connectionId, qrCode: qr });
            resolve(qr);
          }

          if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            
            session.isReady = false;
            this.emit('disconnected', { connectionId });
            
            if (shouldReconnect) {
              // Clear any existing timeout
              if (this.reconnectTimeouts.has(connectionId)) {
                clearTimeout(this.reconnectTimeouts.get(connectionId)!);
              }
              
              // For QR code expiration (error 515), reconnect faster
              const isQRExpired = (lastDisconnect?.error as Boom)?.output?.statusCode === 515;
              const delay = isQRExpired ? 2000 : 10000; // 2 seconds for QR expiry, 10 for others
              
              // Auto reconnect with backoff - only if not already reconnecting
              const timeout = setTimeout(() => {
                this.reconnectTimeouts.delete(connectionId);
                try {
                  console.log(`Attempting ${isQRExpired ? 'QR regeneration' : 'reconnect'} for ${connectionId}`);
                  // Remove existing session to force fresh QR generation
                  this.sessions.delete(connectionId);
                  this.generateQRCode(connectionId);
                } catch (reconnectError) {
                  console.error(`Failed to reconnect ${connectionId}:`, reconnectError);
                }
              }, delay);
              
              this.reconnectTimeouts.set(connectionId, timeout);
            }
          } else if (connection === 'open') {
            console.log(`Baileys WhatsApp connected for ${connectionId}`);
            session.isReady = true;
            session.qrCode = undefined; // Clear QR code
            session.clientInfo = {
              pushname: socket.user?.name || 'WhatsApp User',
              id: socket.user?.id || null,
              platform: 'baileys'
            };
            
            const phoneNumber = socket.user?.id?.split(':')[0]?.replace(/\D/g, '') || 'unknown';
            const formattedPhone = phoneNumber !== 'unknown' && phoneNumber.length > 10 ? `+${phoneNumber}` : phoneNumber;
            
            // CRITICAL: Save session data with PERMANENT persistence flag
            if (this.storage) {
              const persistentSessionData = {
                id: socket.user?.id,
                name: socket.user?.name,
                platform: 'baileys',
                authState: 'connected',
                persistent: true,
                permanent: true, // NEVER delete this connection
                autoRestore: true,
                savedAt: new Date().toISOString(),
                connectionTimestamp: Date.now()
              };

              this.storage.updateWhatsappConnection(connectionId, {
                sessionData: JSON.stringify(persistentSessionData),
                phoneNumber: formattedPhone,
                status: 'connected',
                qrCode: null,
                lastSeen: new Date()
              }).then(() => {
                console.log(`🔒 CONEXÃO SALVA PERMANENTEMENTE: ${formattedPhone} (${connectionId})`);
              }).catch((error: any) => {
                console.error('❌ ERRO CRÍTICO - Falha ao salvar conexão persistente:', error);
              });
            }
            
            this.emit('connected', { 
              connectionId, 
              phoneNumber: formattedPhone
            });
          }
        });

        // Handle credentials update
        socket.ev.on('creds.update', saveCreds);

        // Handle incoming and outgoing messages
        socket.ev.on('messages.upsert', ({ messages, type }) => {
          if (type === 'notify') {
            for (const message of messages) {
              if (message.message) {
                console.log(`Message ${message.key.fromMe ? 'sent' : 'received'} on ${connectionId}:`, message.message);
                
                const messageContent = this.extractMessageContent(message);
                
                // Emit both incoming and outgoing messages
                this.emit('message_received', {
                  connectionId,
                  from: message.key.remoteJid,
                  body: messageContent,
                  timestamp: new Date(message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now()),
                  type: 'text',
                  fromMe: message.key.fromMe || false
                });
              }
            }
          }
        });

        // Timeout after 45 seconds if no QR code - regenerate automatically
        setTimeout(() => {
          if (!session.qrCode && !session.isReady) {
            console.log(`QR code generation timeout for ${connectionId} - regenerating`);
            // Remove session and try again
            this.sessions.delete(connectionId);
            setTimeout(() => {
              this.generateQRCode(connectionId).catch(error => {
                console.error(`Failed to regenerate QR for ${connectionId}:`, error);
              });
            }, 1000);
          }
        }, 45000);

      } catch (error) {
        console.error(`Failed to initialize Baileys client for ${connectionId}:`, error);
        // Don't reject to prevent server crash - emit error instead
        this.emit('error', { connectionId, error: error.message });
        resolve(''); // Resolve with empty string to prevent hanging
      }
    });
  }

  private extractMessageContent(message: any): string {
    if (message.message?.conversation) {
      return message.message.conversation;
    }
    
    if (message.message?.extendedTextMessage?.text) {
      return message.message.extendedTextMessage.text;
    }
    
    if (message.message?.imageMessage?.caption) {
      return message.message.imageMessage.caption;
    }
    
    if (message.message?.videoMessage?.caption) {
      return message.message.videoMessage.caption;
    }
    
    return '[Mensagem não suportada]';
  }

  async connectWhatsApp(connectionId: string, phoneNumber: string): Promise<void> {
    console.log(`Connecting Baileys WhatsApp session: ${connectionId}`);
    
    const session = this.sessions.get(connectionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.emit('connecting', { connectionId });

    return new Promise((resolve, reject) => {
      if (session.isReady) {
        resolve();
        return;
      }

      const onReady = (data: any) => {
        if (data.connectionId === connectionId) {
          this.removeListener('connected', onReady);
          this.removeListener('error', onError);
          resolve();
        }
      };

      const onError = (data: any) => {
        if (data.connectionId === connectionId) {
          this.removeListener('connected', onReady);
          this.removeListener('error', onError);
          reject(new Error(data.error));
        }
      };

      this.on('connected', onReady);
      this.on('error', onError);

      setTimeout(() => {
        this.removeListener('connected', onReady);
        this.removeListener('error', onError);
        reject(new Error('Connection timeout'));
      }, 60000);
    });
  }

  async disconnectWhatsApp(connectionId: string): Promise<void> {
    console.log(`Disconnecting Baileys WhatsApp session: ${connectionId}`);
    
    const session = this.sessions.get(connectionId);
    if (session && session.socket) {
      await session.socket.logout();
      session.isReady = false;
      session.clientInfo = null;
    }
    
    this.emit('disconnected', { connectionId });
  }

  async sendMessage(connectionId: string, to: string, message: string, type: 'text' | 'image' = 'text'): Promise<boolean> {
    console.log(`Sending message from ${connectionId} to ${to}: ${message}`);
    
    const session = this.sessions.get(connectionId);
    if (!session || !session.socket || !session.isReady) {
      throw new Error('Baileys WhatsApp connection not available');
    }

    try {
      // Format phone number to WhatsApp format
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      
      if (type === 'text') {
        await session.socket.sendMessage(jid, { text: message });
      }
      
      console.log(`Message sent successfully from ${connectionId} to ${to}`);
      
      this.emit('message_sent', {
        connectionId,
        to,
        message,
        type,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error(`Failed to send message:`, error);
      throw error;
    }
  }

  async getConnectionStatus(connectionId: string): Promise<'connected' | 'disconnected' | 'connecting' | 'error'> {
    const session = this.sessions.get(connectionId);
    if (!session) {
      return 'disconnected';
    }
    
    if (session.isReady) {
      return 'connected';
    }
    
    if (session.socket && session.qrCode) {
      return 'connecting';
    }
    
    return 'disconnected';
  }

  isConnected(connectionId: string): boolean {
    const session = this.sessions.get(connectionId);
    return session?.isReady || false;
  }

  getSession(connectionId: string): BaileysSession | undefined {
    return this.sessions.get(connectionId);
  }

  async deleteSession(connectionId: string): Promise<void> {
    console.log(`Deleting Baileys WhatsApp session: ${connectionId}`);
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeouts.has(connectionId)) {
      clearTimeout(this.reconnectTimeouts.get(connectionId)!);
      this.reconnectTimeouts.delete(connectionId);
    }
    
    const session = this.sessions.get(connectionId);
    if (session && session.socket) {
      try {
        await session.socket.logout();
      } catch (error) {
        console.error(`Error during logout for ${connectionId}:`, error);
      }
    }
    
    // Remove session directory
    const sessionDir = path.join(process.cwd(), '.baileys_auth', `session_${connectionId}`);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`Error removing session directory for ${connectionId}:`, error);
      }
    }
    
    this.sessions.delete(connectionId);
  }

  getActiveSessions(): BaileysSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isReady);
  }

  async restoreSession(connectionId: string): Promise<void> {
    console.log(`Restoring Baileys WhatsApp session for connection: ${connectionId}`);
    
    // Create session directory path
    const sessionDir = path.join(process.cwd(), '.baileys_auth', `session_${connectionId}`);
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory not found for connection ${connectionId}`);
    }

    const session: BaileysSession = {
      id: connectionId,
      qrCode: undefined,
      isReady: false,
      clientInfo: null
    };

    this.sessions.set(connectionId, session);

    try {
      // Get auth state
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      
      // Create socket
      const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'warn' }),
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: 60000,
      });

      session.socket = socket;

      // Handle connection updates
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('Restored connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
          
          session.isReady = false;
          this.emit('disconnected', { connectionId });
          
          if (shouldReconnect) {
            // Auto reconnect after delay with error handling
            setTimeout(() => {
              try {
                this.restoreSession(connectionId);
              } catch (reconnectError) {
                console.error(`Failed to auto-reconnect restored session ${connectionId}:`, reconnectError);
              }
            }, 5000);
          }
        } else if (connection === 'open') {
          console.log(`Baileys WhatsApp restored and connected for ${connectionId}`);
          session.isReady = true;
          session.clientInfo = {
            pushname: socket.user?.name || 'WhatsApp User',
            id: socket.user?.id || null,
            platform: 'baileys'
          };
          
          const phoneNumber = socket.user?.id?.split(':')[0]?.replace(/\D/g, '') || 'unknown';
          const formattedPhone = phoneNumber !== 'unknown' && phoneNumber.length > 10 ? `+${phoneNumber}` : phoneNumber;
          
          // CRITICAL: Update session data with PERMANENT persistence
          if (this.storage) {
            const persistentSessionData = {
              id: socket.user?.id,
              name: socket.user?.name,
              platform: 'baileys',
              authState: 'connected',
              persistent: true,
              permanent: true, // NEVER delete this connection
              autoRestore: true,
              restoredAt: new Date().toISOString(),
              connectionTimestamp: Date.now()
            };

            this.storage.updateWhatsappConnection(connectionId, {
              sessionData: JSON.stringify(persistentSessionData),
              phoneNumber: formattedPhone,
              status: 'connected',
              lastSeen: new Date()
            }).then(() => {
              console.log(`🔄 CONEXÃO RESTAURADA E SALVA: ${formattedPhone} (${connectionId})`);
            }).catch((storageError: any) => {
              console.error('❌ ERRO CRÍTICO - Falha ao salvar conexão restaurada:', storageError);
            });
          }
          
          this.emit('connected', { 
            connectionId, 
            phoneNumber: formattedPhone
          });
        }
      });

      // Handle credentials update
      socket.ev.on('creds.update', saveCreds);

      // Handle incoming and outgoing messages
      socket.ev.on('messages.upsert', ({ messages, type }) => {
        if (type === 'notify') {
          for (const message of messages) {
            if (message.message) {
              console.log(`Message ${message.key.fromMe ? 'sent' : 'received'} on restored ${connectionId}:`, message.message);
              
              const content = this.extractMessageContent(message);
              
              this.emit('message_received', {
                connectionId,
                from: message.key.remoteJid,
                body: content,
                timestamp: new Date(message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now()),
                type: 'text',
                fromMe: message.key.fromMe || false
              });
            }
          }
        }
      });

    } catch (error) {
      console.error(`Failed to restore Baileys session for ${connectionId}:`, error);
      throw error;
    }
  }

  setStorage(storage: any) {
    this.storage = storage;
  }
}

export const baileysWhatsAppService = new BaileysWhatsAppService();