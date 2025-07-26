import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

export interface SimpleWhatsAppSession {
  id: string;
  qrCode?: string;
  isReady: boolean;
  clientInfo?: any;
  phoneNumber?: string;
}

export class SimpleWhatsAppService extends EventEmitter {
  private sessions: Map<string, SimpleWhatsAppSession> = new Map();

  async generateQRCode(connectionId: string): Promise<string> {
    console.log(`Gerando QR Code para conexão: ${connectionId}`);
    
    const session: SimpleWhatsAppSession = {
      id: connectionId,
      qrCode: undefined,
      isReady: false,
      clientInfo: null
    };

    this.sessions.set(connectionId, session);

    // Simular geração de QR code real
    const qrData = this.generateQRData();
    session.qrCode = qrData;
    
    console.log(`QR Code gerado para ${connectionId}`);
    this.emit('qr', { connectionId, qrCode: qrData });
    
    // Simular tempo para escaneamento (demo)
    setTimeout(() => {
      this.simulateConnection(connectionId);
    }, 5000); // 5 segundos para demo
    
    return qrData;
  }

  private generateQRData(): string {
    // Gerar um QR code simulado mas realista
    const timestamp = Date.now();
    const randomId = randomBytes(16).toString('hex');
    const qrString = `whatsapp://qr/${timestamp}/${randomId}`;
    
    // Converter para formato base64 simulado
    return Buffer.from(qrString).toString('base64');
  }

  private simulateConnection(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    if (!session) return;

    // Simular conexão bem-sucedida
    session.isReady = true;
    session.phoneNumber = `+55${Math.floor(Math.random() * 90 + 10)}${Math.floor(Math.random() * 900000000 + 100000000)}`;
    session.clientInfo = {
      pushname: 'WhatsApp User',
      id: session.phoneNumber,
      platform: 'simple-whatsapp'
    };

    console.log(`WhatsApp conectado para ${connectionId}: ${session.phoneNumber}`);
    this.emit('connected', { 
      connectionId, 
      phoneNumber: session.phoneNumber 
    });
  }

  async connectWhatsApp(connectionId: string, phoneNumber?: string): Promise<void> {
    console.log(`Conectando WhatsApp: ${connectionId}`);
    
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
    console.log(`Desconectando WhatsApp: ${connectionId}`);
    
    const session = this.sessions.get(connectionId);
    if (session) {
      session.isReady = false;
      session.clientInfo = null;
      session.phoneNumber = undefined;
    }
    
    this.emit('disconnected', { connectionId });
  }

  async sendMessage(connectionId: string, to: string, message: string, type: 'text' | 'image' = 'text'): Promise<boolean> {
    console.log(`Enviando mensagem de ${connectionId} para ${to}: ${message}`);
    
    const session = this.sessions.get(connectionId);
    if (!session || !session.isReady) {
      throw new Error('WhatsApp connection not available');
    }

    // Simular envio de mensagem
    console.log(`Mensagem enviada com sucesso de ${connectionId} para ${to}`);
    
    this.emit('message_sent', {
      connectionId,
      to,
      message,
      type,
      timestamp: new Date()
    });

    return true;
  }

  async getConnectionStatus(connectionId: string): Promise<'connected' | 'disconnected' | 'connecting' | 'error'> {
    const session = this.sessions.get(connectionId);
    if (!session) {
      return 'disconnected';
    }
    
    if (session.isReady) {
      return 'connected';
    }
    
    if (session.qrCode) {
      return 'connecting';
    }
    
    return 'disconnected';
  }

  isConnected(connectionId: string): boolean {
    const session = this.sessions.get(connectionId);
    return session?.isReady || false;
  }

  getSession(connectionId: string): SimpleWhatsAppSession | undefined {
    return this.sessions.get(connectionId);
  }

  async deleteSession(connectionId: string): Promise<void> {
    console.log(`Deletando sessão WhatsApp: ${connectionId}`);
    this.sessions.delete(connectionId);
  }

  getActiveSessions(): SimpleWhatsAppSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isReady);
  }
}

export const simpleWhatsAppService = new SimpleWhatsAppService();