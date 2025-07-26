class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number = 1000;
  private maxReconnectAttempts: number = 5;
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;
  private listeners: Map<string, Function[]> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${protocol}//${window.location.host}/ws`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
        resolve();
        return;
      }

      this.isConnecting = true;
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket conectado');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connect');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit('message', data);
          
          // Emit specific event types
          if (data.type) {
            this.emit(data.type, data.payload || data);
          }
        } catch (error) {
          console.error('Erro ao processar mensagem WebSocket:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket desconectado:', event.code, event.reason);
        this.isConnecting = false;
        this.emit('close', event);
        
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('Erro WebSocket:', error);
        this.isConnecting = false;
        this.emit('error', error);
        reject(error);
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * this.reconnectAttempts;
    
    console.log(`Tentando reconectar em ${delay}ms (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(() => {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('Máximo de tentativas de reconnexão atingido');
          this.emit('maxReconnectAttemptsReached');
        }
      });
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Desconexão manual');
      this.ws = null;
    }
  }

  send(type: string, payload?: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('WebSocket não está conectado. Mensagem não enviada:', { type, payload });
    }
  }

  // Event listener methods
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data));
    }
  }

  // Convenience methods for common events
  onConnect(callback: Function) {
    this.on('connect', callback);
  }

  onDisconnect(callback: Function) {
    this.on('close', callback);
  }

  onError(callback: Function) {
    this.on('error', callback);
  }

  onMessage(event: string, callback: Function) {
    this.on(event, callback);
  }

  // Connection status
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get connectionState(): string {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();
export default wsClient;