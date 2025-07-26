import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useToast } from './use-toast';
import wsClient from '@/lib/websocket';

export function useSocket() {
  const wsClientRef = useRef(wsClient);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize WebSocket connection
    wsClientRef.current.connect();

    // Connection event handlers
    wsClientRef.current.onConnect(() => {
      console.log('WebSocket conectado');
    });

    wsClientRef.current.onDisconnect(() => {
      console.log('WebSocket desconectado');
    });

    wsClientRef.current.onError((error: any) => {
      console.error('Erro WebSocket:', error);
      toast({
        title: "Erro de conexão",
        description: "Problema na conexão em tempo real. Tentando reconectar...",
        variant: "destructive",
      });
    });

    // Real-time event handlers
    wsClientRef.current.onMessage('qr_generated', (data: any) => {
      console.log('QR Code gerado:', data);
      // Invalidate connections to refresh QR code
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      
      toast({
        title: "QR Code gerado",
        description: "Novo QR Code disponível para escaneamento.",
      });
    });

    wsClientRef.current.onMessage('connection_status', (data: any) => {
      console.log('Status da conexão atualizado:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      
      if (data.status === 'connected') {
        toast({
          title: "WhatsApp conectado",
          description: "Conexão estabelecida com sucesso!",
        });
      }
    });

    wsClientRef.current.onMessage('new_connection', (data: any) => {
      console.log('Nova conexão criada:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
    });

    wsClientRef.current.onMessage('connection_updated', (data: any) => {
      console.log('Conexão atualizada:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
    });

    wsClientRef.current.onMessage('connection_deleted', (data: any) => {
      console.log('Conexão removida:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      
      toast({
        title: "Conexão removida",
        description: "A conexão foi removida com sucesso.",
      });
    });

    wsClientRef.current.onMessage('new_message', (data: any) => {
      console.log('Nova mensagem:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
    });

    wsClientRef.current.onMessage('ai_response', (data: any) => {
      console.log('Resposta IA:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      
      toast({
        title: "Resposta automática enviada",
        description: "Agente IA respondeu à mensagem.",
      });
    });

    wsClientRef.current.onMessage('message_sent', (data: any) => {
      console.log('Mensagem enviada:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    });

    wsClientRef.current.onMessage('new_agent', (data: any) => {
      console.log('Novo agente criado:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      
      toast({
        title: "Agente IA criado",
        description: `${data.name} está pronto para uso.`,
      });
    });

    wsClientRef.current.onMessage('agent_updated', (data: any) => {
      console.log('Agente atualizado:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
    });

    wsClientRef.current.onMessage('agent_deleted', (data: any) => {
      console.log('Agente removido:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      
      toast({
        title: "Agente removido",
        description: "Agente IA foi deletado com sucesso.",
      });
    });

    wsClientRef.current.onMessage('chatgpt_config_updated', (data: any) => {
      console.log('Configuração ChatGPT atualizada:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/chatgpt/config"] });
      
      toast({
        title: "Configuração atualizada",
        description: "Configurações do ChatGPT foram salvas.",
      });
    });

    // Cleanup on unmount
    return () => {
      wsClientRef.current.disconnect();
    };
  }, [toast]);

  return wsClientRef.current;
}
