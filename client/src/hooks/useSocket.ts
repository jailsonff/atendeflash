import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { queryClient } from '@/lib/queryClient';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const maxReconnectAttempts = 5;

  const connect = () => {
    try {
      console.log('Conectando ao Socket.io...');
      
      const socket = io({
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000
      });
      
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Socket.io conectado:', socket.id);
        setIsConnected(true);
        setConnectionAttempts(0);
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket.io desconectado:', reason);
        setIsConnected(false);
      });

      socket.on('connect_error', (error) => {
        console.error('Erro de conexão Socket.io:', error);
        setConnectionAttempts(prev => prev + 1);
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Tentativa de reconexão ${attemptNumber}/${maxReconnectAttempts}`);
        setConnectionAttempts(attemptNumber);
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconectado após ${attemptNumber} tentativas`);
        setConnectionAttempts(0);
      });

      socket.on('reconnect_failed', () => {
        console.error('Falha ao reconectar após múltiplas tentativas');
      });

      // Listen to WhatsApp connection events
      socket.on('qr_generated', (data: { connectionId: string; qrCode: string }) => {
        console.log('QR Code received:', data);
        queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      });

      socket.on('connection_status', (data: { connectionId: string; status: string; phoneNumber?: string }) => {
        console.log('Connection status update:', data);
        queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
        
        // Emit custom event when WhatsApp is connected
        if (data.status === 'connected') {
          window.dispatchEvent(new CustomEvent('whatsapp-connected', { 
            detail: { connectionId: data.connectionId, phoneNumber: data.phoneNumber } 
          }));
        }
      });

      socket.on('new_connection', (data: any) => {
        console.log('New connection:', data);
        queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      });

      socket.on('connection_deleted', (data: { id: string }) => {
        console.log('Connection deleted:', data);
        queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      });

      socket.on('message_received', (data: any) => {
        console.log('Message received:', data);
        queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      });

      socket.on('message_sent', (data: any) => {
        console.log('Message sent:', data);
        queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      });

    } catch (error) {
      console.error('Erro ao conectar Socket.io:', error);
    }
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionAttempts(0);
  };

  const subscribe = (event: string, callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      
      return () => {
        if (socketRef.current) {
          socketRef.current.off(event, callback);
        }
      };
    }
    return () => {};
  };

  const emit = (event: string, data?: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
    }
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    connectionAttempts,
    subscribe,
    emit,
    disconnect
  };
}