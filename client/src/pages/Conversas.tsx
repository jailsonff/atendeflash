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

interface Conversation {
  connectionId: string;
  connectionName: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
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
  const [selectedTargetConnections, setSelectedTargetConnections] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [globalAgentsPaused, setGlobalAgentsPaused] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null); // Para chat individual ativo
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  useSocket();

  const { data: connections = [] } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: allMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    refetchInterval: 5000,
  });

  // Check if all agents are paused on component mount
  useEffect(() => {
    if (agents.length > 0) {
      const allAgentsPaused = agents.every(agent => agent.isPaused);
      setGlobalAgentsPaused(allAgentsPaused);
    }
  }, [agents]);

  // Get messages for active individual chat
  const activeChatMessages = allMessages.filter(message => {
    if (!activeChat || !selectedConnectionId) return false;
    
    // Show messages between the selected connection and the active chat target
    return ((message.fromConnectionId === selectedConnectionId && message.toConnectionId === activeChat) ||
            (message.fromConnectionId === activeChat && message.toConnectionId === selectedConnectionId)) &&
           // Only show inter-connection messages (not system messages)
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

    // Group by conversation partner
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
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
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

  const handleConnectionSelect = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    setActiveChat(null); // Reset active chat when switching connection
    setSelectedTargetConnections([]);
  };

  const handleChatSelect = (targetConnectionId: string) => {
    setActiveChat(targetConnectionId);
  };

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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChatMessages]);

  // Create conversations list from connections and messages
  const conversations: Conversation[] = connections
    .filter(conn => conn.status === 'connected')
    .map(connection => {
      const connectionMessages = allMessages.filter(
        msg => msg.fromConnectionId === connection.id || msg.toConnectionId === connection.id
      );
      
      const lastMessage = connectionMessages
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      
      return {
        connectionId: connection.id,
        connectionName: connection.name,
        lastMessage: lastMessage?.content,
        lastMessageTime: lastMessage?.timestamp,
        unreadCount: 0, // Would be calculated based on read status
      };
    });



  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedConnection = connections.find(c => c.id === selectedConnectionId);

  return (
    <>
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Conversas</h2>
            <p className="text-muted-foreground text-sm">
              Chat em tempo real entre conexões do sistema
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

      {/* Chat Interface */}
      <main className="flex-1 flex overflow-hidden">
        {/* Conversations List */}
        <div className="w-80 bg-card border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Conexões Ativas</h3>
            <p className="text-sm text-muted-foreground">
              {conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}
            </p>
          </div>
          
          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <i className="fas fa-comments text-4xl mb-2 opacity-50"></i>
                <p className="text-sm">Nenhuma conexão ativa</p>
                <p className="text-xs">Conecte um WhatsApp primeiro</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.connectionId}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedConnectionId === conversation.connectionId
                        ? 'bg-primary/20 border border-primary/30'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                        onClick={() => setSelectedConnectionId(conversation.connectionId)}
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
                            <i className="fab fa-whatsapp text-green-400"></i>
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-secondary"></div>
                        </div>
                        <div className="flex-1 min-w-0 max-w-[180px]">
                          <p className="font-medium text-white truncate">
                            {conversation.connectionName}
                          </p>
                          {conversation.lastMessage && (
                            <p className="text-sm text-gray-400 truncate">
                              {conversation.lastMessage.length > 30 
                                ? conversation.lastMessage.substring(0, 30) + '...'
                                : conversation.lastMessage
                              }
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end space-y-1 flex-shrink-0 w-16">
                        {conversation.lastMessageTime && (
                          <p className="text-xs text-gray-400">
                            {new Date(conversation.lastMessageTime).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                        <div className="flex items-center justify-end w-full">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Find the other active connection to clear conversation between both
                              const otherConnection = connections.find(conn => 
                                conn.id !== conversation.connectionId && conn.status === 'connected'
                              );
                              if (otherConnection) {
                                clearConversationMutation.mutate({
                                  connectionId1: conversation.connectionId,
                                  connectionId2: otherConnection.id
                                });
                              }
                            }}
                            disabled={clearConversationMutation.isPending}
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-500 hover:bg-red-400/20 border border-red-400/30 rounded-md"
                            title="Limpar conversa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {conversation.unreadCount > 0 && (
                            <Badge className="bg-[hsl(328,100%,54%)] text-white text-xs ml-1">
                              {conversation.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {!selectedConnectionId ? (
            <div className="flex-1 flex items-center justify-center bg-dark-bg">
              <div className="text-center">
                <div className="w-16 h-16 bg-[hsl(180,100%,41%)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-comments text-[hsl(180,100%,41%)] text-3xl"></i>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Selecione uma conversa
                </h3>
                <p className="text-gray-400">
                  Escolha uma conexão para começar a conversar
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="bg-dark-secondary border-b border-gray-800 px-6 py-4">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
                    <i className="fab fa-whatsapp text-green-400"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {selectedConnection?.name}
                    </h3>
                    <div className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse-glow"></div>
                      <span className="text-green-400">Online</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                  {conversationMessages.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <i className="fas fa-message text-4xl mb-2 opacity-50"></i>
                      <p>Nenhuma mensagem ainda</p>
                      <p className="text-sm">Envie a primeira mensagem!</p>
                    </div>
                  ) : (
                    conversationMessages.map((message) => {
                      const isFromSelected = message.fromConnectionId === selectedConnectionId;
                      const senderConnection = connections.find(c => c.id === message.fromConnectionId);
                      const receiverConnection = connections.find(c => c.id === message.toConnectionId);
                      
                      return (
                        <div
                          key={message.id}
                          className={`chat-bubble flex items-start space-x-3 ${
                            isFromSelected ? "flex-row-reverse" : ""
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              message.isFromAgent
                                ? "bg-[hsl(328,100%,54%)]"
                                : isFromSelected
                                ? "bg-[hsl(180,100%,41%)]"
                                : "bg-gray-600"
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
                          <div className="flex-1">
                            {!isFromSelected && (
                              <p className="text-xs text-gray-400 mb-1">
                                {senderConnection?.name || 'Desconhecido'}
                              </p>
                            )}
                            <div
                              className={`rounded-lg px-3 py-2 ${
                                isFromSelected
                                  ? "bg-[hsl(180,100%,41%)]/20 border border-[hsl(180,100%,41%)]/30"
                                  : message.isFromAgent
                                  ? "bg-[hsl(328,100%,54%)]/20 border border-[hsl(328,100%,54%)]/30"
                                  : "bg-dark-tertiary"
                              }`}
                            >
                              <p className="text-sm text-white">{message.content}</p>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs text-gray-400">
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
              <div className="bg-dark-secondary border-t border-gray-800 p-4">
                <div className="flex space-x-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-white border-gray-600 text-black placeholder:text-gray-500"
                    disabled={sendMessageMutation.isPending}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
                    className="bg-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/80"
                  >
                    {sendMessageMutation.isPending ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fas fa-paper-plane"></i>
                    )}
                  </Button>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-400">
                    Pressione Enter para enviar via WhatsApp
                  </p>
                  {selectedConnection && (
                    <p className="text-xs text-[hsl(180,100%,41%)]">
                      Enviando de: {selectedConnection.name}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
