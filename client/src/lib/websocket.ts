import { io, Socket } from 'socket.io-client';

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnected = false;

  connect() {
    if (this.socket) {
      return;
    }

    console.log('Iniciando conexão Socket.io...');

    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      forceNew: true
    });

    this.socket.on('connect', () => {
      console.log('Socket.io conectado:', this.socket?.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.io desconectado:', reason);
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Erro de conexão Socket.io:', error);
      this.reconnectAttempts++;
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  onConnect(callback: () => void) {
    if (this.socket) {
      this.socket.on('connect', callback);
    }
  }

  onDisconnect(callback: () => void) {
    if (this.socket) {
      this.socket.on('disconnect', callback);
    }
  }

  onError(callback: (error: any) => void) {
    if (this.socket) {
      this.socket.on('connect_error', callback);
    }
  }

  onMessage(event: string, callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  emit(event: string, data?: any) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

const wsClient = new WebSocketClient();
export default wsClient;