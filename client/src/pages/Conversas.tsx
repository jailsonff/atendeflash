import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSocket } from "@/hooks/useSocket";

interface WhatsappConnection {
  id: string;
  name: string;
  phoneNumber: string;
  status: string;
}

interface Message {
  id: string;
  fromConnectionId?: string;
  toConnectionId?: string;
  content: string;
  messageType: 'text' | 'image' | 'emoji';
  timestamp: string;
  isFromAgent?: boolean;
  agentId?: string;
}

interface Agent {
  id: string;
  name: string;
  isActive: boolean;
  isPaused: boolean;
  connectionId: string;
}

export default function Conversas() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [globalAgentsPaused, setGlobalAgentsPaused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  useSocket();

  const { data: connections = [] } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: allMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    refetchInterval: 5000,
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (agents.length > 0) {
      const allAgentsPaused = agents.every(agent => agent.isPaused);
      setGlobalAgentsPaused(allAgentsPaused);
    }
  }, [agents]);

  // Get messages for active individual chat
  const activeChatMessages = allMessages.filter(message => {
    if (!activeChat || !selectedConnectionId) return false;
    
    return ((message.fromConnectionId === selectedConnectionId && message.toConnectionId === activeChat) ||
            (message.fromConnectionId === activeChat && message.toConnectionId === selectedConnectionId)) &&
           message.fromConnectionId !== 'system' && 
           message.toConnectionId !== 'system';
  }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Get all conversations for selected connection grouped by target
  const getConversationsForConnection = (connectionId: string) => {
    const connectionMessages = allMessages.filter(message => {
      return (message.fromConnectionId === connectionId || message.toConnectionId === connectionId) &&
             message.fromConnectionId !== 'system' && 
             message.toConnectionId !== 'system';
    });

    const conversationMap = new Map<string, { 
      partnerId: string, 
      partnerName: string, 
      lastMessage: string, 
      lastTime: string,
      messageCount: number 
    }>();

    connectionMessages.forEach(msg => {
      const partnerId = msg.fromConnectionId === connectionId ? msg.toConnectionId : msg.fromConnectionId;
      if (!partnerId) return;

      const partner = connections.find(c => c.id === partnerId);
      if (!partner) return;

      const existing = conversationMap.get(partnerId);
      const msgTime = new Date(msg.timestamp).getTime();
      
      if (!existing || new Date(existing.lastTime).getTime() < msgTime) {
        conversationMap.set(partnerId, {
          partnerId,
          partnerName: partner.name,
          lastMessage: msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : ''),
          lastTime: msg.timestamp,
          messageCount: (existing?.messageCount || 0) + 1
        });
      } else if (existing) {
        existing.messageCount++;
      }
    });

    return Array.from(conversationMap.values()).sort((a, b) => 
      new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
    );
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { content: string; toConnectionId: string; fromConnectionId: string }) => {
      const response = await apiRequest("POST", "/api/messages", {
        content: data.content,
        toConnectionId: data.toConnectionId,
        fromConnectionId: data.fromConnectionId,
        messageType: "text",
        isFromAgent: false,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setNewMessage("");
      toast({
        title: "Mensagem enviada",
        description: "Sua mensagem foi enviada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const clearConversationMutation = useMutation({
    mutationFn: async ({ connectionId1, connectionId2 }: { connectionId1: string; connectionId2: string }) => {
      const response = await apiRequest("DELETE", `/api/conversations/${connectionId1}/${connectionId2}`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Conversa limpa",
        description: `${data.deletedCount} mensagens foram removidas entre as conexões.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao limpar conversa",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const deduplicateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/messages/deduplicate");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Deduplicação concluída",
        description: `${data.removedCount} mensagens duplicadas foram removidas automaticamente.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro na deduplicação",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const toggleAgentsPauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      const response = await apiRequest("POST", "/api/agents/toggle-global-pause", { paused });
      return response.json();
    },
    onSuccess: (data) => {
      setGlobalAgentsPaused(data.paused);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: data.paused ? "Agentes pausados" : "Agentes ativados",
        description: data.paused 
          ? "Os agentes não responderão automaticamente" 
          : "Os agentes voltaram a responder automaticamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: "Não foi possível alterar status dos agentes: " + (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConnectionId || !activeChat) return;
    
    sendMessageMutation.mutate({
      content: newMessage,
      fromConnectionId: selectedConnectionId,
      toConnectionId: activeChat,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChatMessages]);

  const selectedConnection = connections.find(c => c.id === selectedConnectionId);
  const activeConnection = connections.find(c => c.id === activeChat);

  return (
    <>
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Conversas</h2>
            <p className="text-muted-foreground text-sm">
              Selecione uma conexão e escolha com quem conversar
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => toggleAgentsPauseMutation.mutate(!globalAgentsPaused)}
              disabled={toggleAgentsPauseMutation.isPending}
              variant="outline"
              size="sm"
              className={globalAgentsPaused 
                ? "border-green-500/30 text-green-400 hover:bg-green-500/20"
                : "border-red-500/30 text-red-400 hover:bg-red-500/20"
              }
            >
              {toggleAgentsPauseMutation.isPending ? (
                <>
                  <i className="fas fa-spinner animate-spin mr-2"></i>
                  Alterando...
                </>
              ) : globalAgentsPaused ? (
                <>
                  <i className="fas fa-play mr-2"></i>
                  Ativar Agentes
                </>
              ) : (
                <>
                  <i className="fas fa-pause mr-2"></i>
                  Pausar Agentes
                </>
              )}
            </Button>
            <Button
              onClick={() => deduplicateMutation.mutate()}
              disabled={deduplicateMutation.isPending}
              variant="outline"
              size="sm"
              className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
            >
              {deduplicateMutation.isPending ? (
                <>
                  <i className="fas fa-spinner animate-spin mr-2"></i>
                  Removendo...
                </>
              ) : (
                <>
                  <i className="fas fa-broom mr-2"></i>
                  Remover Duplicatas
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Connection Selection */}
        <div className="w-80 bg-card border-r border-border">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Selecionar Conexão</h3>
            <p className="text-sm text-muted-foreground">Escolha quem vai enviar mensagens</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {connections
                .filter(conn => conn.status === 'connected')
                .map(connection => (
                  <Card 
                    key={connection.id}
                    className={`cursor-pointer transition-all border ${
                      selectedConnectionId === connection.id 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => {
                      setSelectedConnectionId(connection.id);
                      setActiveChat(null);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                          <i className="fas fa-whatsapp text-primary"></i>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">{connection.name}</h4>
                          <p className="text-sm text-muted-foreground">{connection.phoneNumber}</p>
                        </div>
                        {selectedConnectionId === connection.id && (
                          <Badge variant="default">Selecionado</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              
              {connections.filter(conn => conn.status === 'connected').length === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                    <i className="fas fa-plug text-2xl text-muted-foreground"></i>
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma conexão ativa</h3>
                  <p className="text-muted-foreground text-sm">Conecte pelo menos uma conta WhatsApp</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Conversation Selection */}
        {selectedConnectionId && (
          <div className="w-80 bg-card border-r border-border">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Conversas de {selectedConnection?.name}</h3>
              <p className="text-sm text-muted-foreground">Escolha com quem conversar</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {(() => {
                  const conversations = getConversationsForConnection(selectedConnectionId);
                  
                  if (conversations.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                          <i className="fas fa-comments text-2xl text-muted-foreground"></i>
                        </div>
                        <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma conversa ativa</h3>
                        <p className="text-muted-foreground text-sm">
                          {selectedConnection?.name} ainda não tem conversas
                        </p>
                      </div>
                    );
                  }

                  return conversations.map((conv) => (
                    <Card 
                      key={conv.partnerId}
                      className={`cursor-pointer transition-all border ${
                        activeChat === conv.partnerId 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setActiveChat(conv.partnerId)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h5 className="font-medium text-foreground">{conv.partnerName}</h5>
                            <p className="text-sm text-muted-foreground truncate">
                              {conv.lastMessage}
                            </p>
                          </div>
                          <div className="text-right ml-4">
                            <Badge variant="secondary" className="text-xs">
                              {conv.messageCount}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(conv.lastTime).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ));
                })()}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Chat Area */}
        {activeChat && selectedConnectionId ? (
          <div className="flex-1 flex flex-col bg-card">
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {selectedConnection?.name} → {activeConnection?.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Conversa entre duas conexões WhatsApp
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearConversationMutation.mutate({
                      connectionId1: selectedConnectionId,
                      connectionId2: activeChat
                    });
                  }}
                  className="text-red-400 border-red-500/30 hover:bg-red-500/20"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-6 py-4">
              <div className="space-y-4">
                {activeChatMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                      <i className="fas fa-comments text-2xl text-muted-foreground"></i>
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma mensagem ainda</h3>
                    <p className="text-muted-foreground">Envie a primeira mensagem!</p>
                  </div>
                ) : (
                  activeChatMessages.map((message) => {
                    const isFromSelected = message.fromConnectionId === selectedConnectionId;
                    const senderConnection = connections.find(c => c.id === message.fromConnectionId);
                    
                    return (
                      <div
                        key={message.id}
                        className={`flex items-start space-x-3 ${
                          isFromSelected ? "flex-row-reverse space-x-reverse" : ""
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            message.isFromAgent
                              ? "bg-pink-500"
                              : isFromSelected
                              ? "bg-primary"
                              : "bg-muted-foreground"
                          }`}
                        >
                          <i
                            className={`fas ${
                              message.isFromAgent
                                ? "fa-robot"
                                : "fa-whatsapp"
                            } text-white text-xs`}
                          ></i>
                        </div>
                        <div className="flex-1 max-w-xs">
                          {!isFromSelected && (
                            <p className="text-xs text-muted-foreground mb-1">
                              {senderConnection?.name || 'Desconhecido'}
                            </p>
                          )}
                          <div
                            className={`rounded-lg px-3 py-2 ${
                              isFromSelected
                                ? "bg-primary text-primary-foreground"
                                : message.isFromAgent
                                ? "bg-pink-500/20 border border-pink-500/30"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm">{message.content}</p>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            {message.isFromAgent && (
                              <Badge variant="secondary" className="text-xs">
                                <i className="fas fa-robot mr-1"></i>
                                IA
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t border-border p-4">
              <div className="flex space-x-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Digite sua mensagem..."
                  className="flex-1"
                  disabled={sendMessageMutation.isPending}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  className="bg-primary hover:bg-primary/80"
                >
                  {sendMessageMutation.isPending ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <i className="fas fa-paper-plane"></i>
                  )}
                </Button>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-muted-foreground">
                  Pressione Enter para enviar via WhatsApp
                </p>
                <p className="text-xs text-primary">
                  De: {selectedConnection?.name} → Para: {activeConnection?.name}
                </p>
              </div>
            </div>
          </div>
        ) : selectedConnectionId ? (
          <div className="flex-1 flex items-center justify-center bg-card">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                <i className="fas fa-mouse-pointer text-2xl text-muted-foreground"></i>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Selecione uma conversa</h3>
              <p className="text-muted-foreground">
                Escolha com qual conexão {selectedConnection?.name} deve conversar
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-card">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                <i className="fas fa-hand-pointer text-2xl text-muted-foreground"></i>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Selecione uma conexão</h3>
              <p className="text-muted-foreground">
                Primeiro escolha qual conexão WhatsApp vai enviar as mensagens
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}