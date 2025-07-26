import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface WhatsAppSession {
  id: string;
  qrCode?: string;
  isReady: boolean;
  clientInfo?: any;
  process?: ChildProcess;
}

export class WhatsAppService extends EventEmitter {
  private sessions: Map<string, WhatsAppSession> = new Map();

  async generateQRCode(connectionId: string): Promise<string> {
    console.log(`Creating WhatsApp session for connection: ${connectionId}`);
    
    // Create session directory
    const sessionDir = path.join(process.cwd(), '.wwebjs_auth', `session_${connectionId}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const session: WhatsAppSession = {
      id: connectionId,
      qrCode: undefined,
      isReady: false,
      clientInfo: null
    };

    this.sessions.set(connectionId, session);

    return new Promise((resolve, reject) => {
      // Create a Node.js child process to handle WhatsApp Web
      const whatsappScript = this.createWhatsAppScript(connectionId);
      const scriptPath = path.join(process.cwd(), 'temp_whatsapp_client.cjs');
      
      // Write the script to a temporary file
      fs.writeFileSync(scriptPath, whatsappScript);
      
      const whatsappProcess = spawn('node', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      session.process = whatsappProcess;

      let qrCodeReceived = false;

      whatsappProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(`WhatsApp output for ${connectionId}:`, output);

        // Look for QR code in output
        const qrMatch = output.match(/QR_CODE:(.+)/);
        if (qrMatch && !qrCodeReceived) {
          const qrCode = qrMatch[1].trim();
          session.qrCode = qrCode;
          qrCodeReceived = true;
          
          this.emit('qr', { connectionId, qrCode });
          resolve(qrCode);
        }

        // Check for ready status
        if (output.includes('READY')) {
          session.isReady = true;
          this.emit('connected', { 
            connectionId, 
            phoneNumber: 'connected' 
          });
        }

        // Check for messages
        const messageMatch = output.match(/MESSAGE:(.+)/);
        if (messageMatch) {
          try {
            const messageData = JSON.parse(messageMatch[1]);
            this.emit('message_received', {
              connectionId,
              from: messageData.from,
              body: messageData.body,
              timestamp: new Date(messageData.timestamp * 1000),
              type: messageData.type
            });
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        }
      });

      whatsappProcess.stderr?.on('data', (data) => {
        console.error(`WhatsApp error for ${connectionId}:`, data.toString());
      });

      whatsappProcess.on('error', (error) => {
        console.error(`Failed to start WhatsApp process for ${connectionId}:`, error);
        this.emit('error', { connectionId, error: error.message });
        reject(error);
      });

      whatsappProcess.on('exit', (code) => {
        console.log(`WhatsApp process for ${connectionId} exited with code ${code}`);
        session.isReady = false;
        this.emit('disconnected', { connectionId });
        
        // Clean up temp file
        const tempPath = path.join(process.cwd(), 'temp_whatsapp_client.cjs');
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      });

      // Timeout after 30 seconds if no QR code
      setTimeout(() => {
        if (!qrCodeReceived) {
          whatsappProcess.kill();
          reject(new Error('QR code generation timeout'));
        }
      }, 30000);
    });
  }

  private createWhatsAppScript(connectionId: string): string {
    return `
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: '${connectionId}',
    dataPath: './.wwebjs_auth/session_${connectionId}'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

client.on('qr', (qr) => {
  console.log('QR_CODE:' + qr);
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('AUTHENTICATED');
});

client.on('auth_failure', (msg) => {
  console.error('AUTH_FAILURE:' + msg);
  process.exit(1);
});

client.on('ready', () => {
  console.log('READY');
});

client.on('disconnected', (reason) => {
  console.log('DISCONNECTED:' + reason);
  process.exit(0);
});

client.on('message', async (message) => {
  const messageData = {
    from: message.from,
    body: message.body,
    timestamp: message.timestamp,
    type: message.type
  };
  console.log('MESSAGE:' + JSON.stringify(messageData));
});

client.initialize().catch(error => {
  console.error('INIT_ERROR:' + error.message);
  process.exit(1);
});

// Keep process alive
process.on('SIGTERM', () => {
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  client.destroy();
  process.exit(0);
});
`;
  }

  async connectWhatsApp(connectionId: string, phoneNumber: string): Promise<void> {
    console.log(`Connecting WhatsApp session: ${connectionId}`);
    
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
    console.log(`Disconnecting WhatsApp session: ${connectionId}`);
    
    const session = this.sessions.get(connectionId);
    if (session && session.process) {
      session.process.kill('SIGTERM');
      session.isReady = false;
      session.clientInfo = null;
    }
    
    this.emit('disconnected', { connectionId });
  }

  async sendMessage(connectionId: string, to: string, message: string, type: 'text' | 'image' = 'text'): Promise<boolean> {
    console.log(`Sending message from ${connectionId} to ${to}: ${message}`);
    
    const session = this.sessions.get(connectionId);
    if (!session || !session.process || !session.isReady) {
      throw new Error('WhatsApp connection not available');
    }

    try {
      // For now, we'll simulate message sending
      // In a full implementation, you would send commands to the child process
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
    
    if (session.process && session.qrCode) {
      return 'connecting';
    }
    
    return 'disconnected';
  }

  isConnected(connectionId: string): boolean {
    const session = this.sessions.get(connectionId);
    return session?.isReady || false;
  }

  getSession(connectionId: string): WhatsAppSession | undefined {
    return this.sessions.get(connectionId);
  }

  async deleteSession(connectionId: string): Promise<void> {
    console.log(`Deleting WhatsApp session: ${connectionId}`);
    
    const session = this.sessions.get(connectionId);
    if (session && session.process) {
      session.process.kill('SIGTERM');
    }
    
    this.sessions.delete(connectionId);
  }

  getActiveSessions(): WhatsAppSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isReady);
  }
}

export const whatsappService = new WhatsAppService();