import { EventEmitter } from 'events';
import { Boom } from '@hapi/boom';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  WAMessage,
  WASocket,
  AuthenticationState,
  SignalDataTypeMap,
  ConnectionState,
  proto
} from '@whiskeysockets/baileys';
import { pino } from 'pino';
import fs from 'fs';
import path from 'path';

export interface BaileysSession {
  id: string;
  qrCode?: string;
  isReady: boolean;
  clientInfo?: any;
  socket?: WASocket;
}

export class BaileysWhatsAppService extends EventEmitter {
  private sessions: Map<string, BaileysSession> = new Map();

  async generateQRCode(connectionId: string): Promise<string> {
    console.log(`Creating Baileys WhatsApp session for connection: ${connectionId}`);
    
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
              // Auto reconnect
              setTimeout(() => {
                this.generateQRCode(connectionId);
              }, 3000);
            }
          } else if (connection === 'open') {
            console.log(`Baileys WhatsApp connected for ${connectionId}`);
            session.isReady = true;
            session.clientInfo = {
              pushname: socket.user?.name || 'WhatsApp User',
              id: socket.user?.id || null,
              platform: 'baileys'
            };
            
            this.emit('connected', { 
              connectionId, 
              phoneNumber: socket.user?.id?.split(':')[0] || 'unknown' 
            });
          }
        });

        // Handle credentials update
        socket.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        socket.ev.on('messages.upsert', ({ messages, type }) => {
          if (type === 'notify') {
            for (const message of messages) {
              if (!message.key.fromMe && message.message) {
                console.log(`Message received on ${connectionId}:`, message.message);
                
                const messageContent = this.extractMessageContent(message);
                
                this.emit('message_received', {
                  connectionId,
                  from: message.key.remoteJid,
                  body: messageContent,
                  timestamp: new Date(message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now()),
                  type: 'text'
                });
              }
            }
          }
        });

        // Timeout after 30 seconds if no QR code
        setTimeout(() => {
          if (!session.qrCode) {
            reject(new Error('QR code generation timeout'));
          }
        }, 30000);

      } catch (error) {
        console.error(`Failed to initialize Baileys client for ${connectionId}:`, error);
        reject(error);
      }
    });
  }

  private extractMessageContent(message: WAMessage): string {
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
    
    const session = this.sessions.get(connectionId);
    if (session && session.socket) {
      await session.socket.logout();
    }
    
    // Remove session directory
    const sessionDir = path.join(process.cwd(), '.baileys_auth', `session_${connectionId}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    
    this.sessions.delete(connectionId);
  }

  getActiveSessions(): BaileysSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isReady);
  }
}

export const baileysWhatsAppService = new BaileysWhatsAppService();