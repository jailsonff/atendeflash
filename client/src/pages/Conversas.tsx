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

// 🎨 SISTEMA DE CORES DINÂMICAS - Cada conexão tem sua própria cor
const CONNECTION_COLORS = [
  { name: 'Turquesa', border: 'border-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/20', text: 'text-cyan-600 dark:text-cyan-400', badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' },
  { name: 'Rosa', border: 'border-pink-400', bg: 'bg-pink-50 dark:bg-pink-950/20', text: 'text-pink-600 dark:text-pink-400', badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300' },
  { name: 'Violeta', border: 'border-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/20', text: 'text-purple-600 dark:text-purple-400', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  { name: 'Verde', border: 'border-green-400', bg: 'bg-green-50 dark:bg-green-950/20', text: 'text-green-600 dark:text-green-400', badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  { name: 'Amarelo', border: 'border-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/20', text: 'text-yellow-600 dark:text-yellow-400', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  { name: 'Azul', border: 'border-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  { name: 'Índigo', border: 'border-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20', text: 'text-indigo-600 dark:text-indigo-400', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  { name: 'Laranja', border: 'border-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20', text: 'text-orange-600 dark:text-orange-400', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  { name: 'Teal', border: 'border-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/20', text: 'text-teal-600 dark:text-teal-400', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
  { name: 'Esmeralda', border: 'border-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  { name: 'Vermelho', border: 'border-red-400', bg: 'bg-red-50 dark:bg-red-950/20', text: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  { name: 'Slate', border: 'border-slate-400', bg: 'bg-slate-50 dark:bg-slate-950/20', text: 'text-slate-600 dark:text-slate-400', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300' }
];

// Função para obter cor da conexão baseada no ID (consistente entre reloads)
const getConnectionColor = (connectionId: string) => {
  const hash = connectionId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  const index = Math.abs(hash) % CONNECTION_COLORS.length;
  return CONNECTION_COLORS[index];
};

export default function Conversas() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [selectedTargetConnections, setSelectedTargetConnections] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [globalAgentsPaused, setGlobalAgentsPaused] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'individual' | 'group'>('individual');
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConnectionId || !activeChat) return;
    
    // 🎯 AUTOMATICAMENTE ATIVAR CONVERSA QUANDO USUÁRIO ENVIA MENSAGEM MANUAL
    try {
      await apiRequest("POST", `/api/active-conversations/toggle`, {
        connection1Id: selectedConnectionId,
        connection2Id: activeChat,
        startedBy: "user"
      });
    } catch (error) {
      console.log("Aviso: Não foi possível ativar conversa automática:", error);
    }

    if (viewMode === 'individual') {
      // Send message to single target
      sendMessageMutation.mutate({
        content: newMessage,
        fromConnectionId: selectedConnectionId,
        toConnectionId: activeChat,
      });
    } else {
      // For group mode, use the dedicated function
      sendToMultipleTargets();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (viewMode === 'individual') {
        handleSendMessage();
      } else {
        sendToMultipleTargets();
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChatMessages]);

  const selectedConnection = connections.find(c => c.id === selectedConnectionId);
  const activeConnection = connections.find(c => c.id === activeChat);

  // Filter connections by search term
  const filteredConnections = connections
    .filter(conn => conn.status === 'connected')
    .filter(conn => 
      conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conn.phoneNumber.includes(searchTerm)
    );

  // Filter available targets (exclude selected connection)
  const availableTargets = connections
    .filter(conn => conn.status === 'connected' && conn.id !== selectedConnectionId)
    .filter(conn => 
      conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conn.phoneNumber.includes(searchTerm)
    );

  const handleToggleTargetConnection = (connectionId: string) => {
    setSelectedTargetConnections(prev => 
      prev.includes(connectionId) 
        ? prev.filter(id => id !== connectionId)
        : [...prev, connectionId]
    );
  };

  const sendToMultipleTargets = async () => {
    if (!newMessage.trim() || !selectedConnectionId || selectedTargetConnections.length === 0) return;
    
    // 🎯 ATIVAR CONVERSA PARA CADA ALVO QUANDO USUÁRIO ENVIA MENSAGEM EM MASSA
    for (const targetId of selectedTargetConnections) {
      try {
        await apiRequest("POST", `/api/active-conversations/toggle`, {
          connection1Id: selectedConnectionId,
          connection2Id: targetId,
          startedBy: "user"
        });
        
        // Send message to each target
        sendMessageMutation.mutate({
          content: newMessage,
          fromConnectionId: selectedConnectionId,
          toConnectionId: targetId,
        });
      } catch (error) {
        console.log("Aviso: Não foi possível ativar conversa automática:", error);
      }
    }
    
    toast({
      title: "Mensagem enviada",
      description: `Mensagem enviada para ${selectedTargetConnections.length} conexões e conversas automáticas ativadas`,
    });
    
    setNewMessage("");
  };

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
            
            {/* Search Bar */}
            <div className="mt-3">
              <Input
                placeholder="Buscar conexões..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex mt-3 bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'individual' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('individual')}
                className="flex-1 text-xs"
              >
                Individual
              </Button>
              <Button
                variant={viewMode === 'group' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('group')}
                className="flex-1 text-xs"
              >
                Grupo
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {filteredConnections.length > 0 ? (
                filteredConnections.map(connection => {
                  const connectionColor = getConnectionColor(connection.id);
                  return (
                    <Card 
                      key={connection.id}
                      className={`cursor-pointer transition-all border-2 ${
                        selectedConnectionId === connection.id 
                          ? `${connectionColor.border} ${connectionColor.bg}` 
                          : `border-border hover:${connectionColor.border}`
                      }`}
                      onClick={() => {
                        setSelectedConnectionId(connection.id);
                        setActiveChat(null);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 ${connectionColor.bg} rounded-full flex items-center justify-center`}>
                            <i className={`fas fa-whatsapp ${connectionColor.text}`}></i>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-foreground flex items-center gap-2">
                              {connection.name}
                              <div className={`w-3 h-3 rounded-full ${connectionColor.border.replace('border-', 'bg-')}`} title={`Cor: ${connectionColor.name}`}></div>
                            </h4>
                            <p className="text-sm text-muted-foreground">{connection.phoneNumber}</p>
                          </div>
                          {selectedConnectionId === connection.id && (
                            <Badge className={connectionColor.badge}>Selecionado</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-4">
                  <i className="fas fa-search text-2xl text-muted-foreground mb-2"></i>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? 'Nenhuma conexão encontrada' : 'Digite para buscar'}
                  </p>
                </div>
              )}
              
              {connections.filter(conn => conn.status === 'connected').length === 0 && !searchTerm && (
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

        {/* Target Selection */}
        {selectedConnectionId && viewMode === 'individual' && (
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

                  return conversations.map((conv) => {
                    const selectedConnectionColor = getConnectionColor(selectedConnectionId);
                    return (
                      <Card 
                        key={conv.partnerId}
                        className={`cursor-pointer transition-all border-2 ${
                          activeChat === conv.partnerId 
                            ? `${selectedConnectionColor.border} ${selectedConnectionColor.bg}` 
                            : `border-border hover:${selectedConnectionColor.border}`
                        }`}
                        onClick={() => setActiveChat(conv.partnerId)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h5 className="font-medium text-foreground flex items-center gap-2">
                                {conv.partnerName}
                                <div className={`w-3 h-3 rounded-full ${selectedConnectionColor.border.replace('border-', 'bg-')}`} title={`Grupo de ${selectedConnection?.name}`}></div>
                              </h5>
                              <p className="text-sm text-muted-foreground truncate">
                                {conv.lastMessage}
                              </p>
                            </div>
                            <div className="text-right ml-4 flex flex-col items-end gap-1">
                              <Badge className={`text-xs ${selectedConnectionColor.badge}`}>
                                {conv.messageCount}
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                {new Date(conv.lastTime).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                              {/* Botão Lixeira */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearConversationMutation.mutate({
                                    connectionId1: selectedConnectionId,
                                    connectionId2: conv.partnerId
                                  });
                                }}
                                className="w-6 h-6 p-0 text-muted-foreground hover:text-destructive"
                                disabled={clearConversationMutation.isPending}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  });
                })()}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Multi-Target Selection */}
        {selectedConnectionId && viewMode === 'group' && (
          <div className="w-80 bg-card border-r border-border">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Selecionar Alvos</h3>
              <p className="text-sm text-muted-foreground">
                Escolha múltiplas conexões para {selectedConnection?.name}
              </p>
              <div className="mt-2">
                <Badge variant="secondary" className="text-xs">
                  {selectedTargetConnections.length} selecionadas
                </Badge>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {availableTargets.map(connection => (
                  <Card 
                    key={connection.id}
                    className={`cursor-pointer transition-all border ${
                      selectedTargetConnections.includes(connection.id)
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => handleToggleTargetConnection(connection.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                          <i className="fas fa-whatsapp text-primary text-sm"></i>
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-foreground text-sm">{connection.name}</h5>
                          <p className="text-xs text-muted-foreground">{connection.phoneNumber}</p>
                        </div>
                        {selectedTargetConnections.includes(connection.id) && (
                          <i className="fas fa-check text-primary"></i>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {availableTargets.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                      <i className="fas fa-users text-2xl text-muted-foreground"></i>
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma conexão disponível</h3>
                    <p className="text-muted-foreground text-sm">
                      Conecte mais contas WhatsApp para criar grupos
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Individual Chat Area */}
        {activeChat && selectedConnectionId && viewMode === 'individual' ? (
          <div className="flex-1 flex flex-col bg-card">
            {/* Chat Header */}
            <div className={`px-6 py-4 border-b border-border bg-card ${getConnectionColor(selectedConnectionId).bg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getConnectionColor(selectedConnectionId).border.replace('border-', 'bg-')}`}></div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {selectedConnection?.name} → {activeConnection?.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Conversa entre duas conexões WhatsApp • Grupo {getConnectionColor(selectedConnectionId).name}
                    </p>
                  </div>
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
                    const senderColor = senderConnection ? getConnectionColor(senderConnection.id) : getConnectionColor(selectedConnectionId);
                    
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
                              ? `${senderColor.bg} border-2 ${senderColor.border}`
                              : isFromSelected
                              ? `${senderColor.bg} border-2 ${senderColor.border}`
                              : "bg-muted-foreground"
                          }`}
                        >
                          <i
                            className={`fas ${
                              message.isFromAgent
                                ? "fa-robot"
                                : "fa-whatsapp"
                            } ${message.isFromAgent || isFromSelected ? senderColor.text : 'text-white'} text-xs`}
                          ></i>
                        </div>
                        <div className="flex-1 max-w-xs">
                          {!isFromSelected && (
                            <p className="text-xs mb-1 flex items-center gap-1">
                              <span className={senderColor.text}>
                                {senderConnection?.name || 'Desconhecido'}
                              </span>
                              <div className={`w-2 h-2 rounded-full ${senderColor.border.replace('border-', 'bg-')}`}></div>
                            </p>
                          )}
                          <div
                            className={`rounded-lg px-3 py-2 ${
                              isFromSelected
                                ? `${senderColor.bg} border-2 ${senderColor.border}`
                                : message.isFromAgent
                                ? `${senderColor.bg} border-2 ${senderColor.border}`
                                : "bg-muted"
                            }`}
                          >
                            <p className={`text-sm ${
                              isFromSelected || message.isFromAgent 
                                ? senderColor.text 
                                : 'text-foreground'
                            }`}>{message.content}</p>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            {message.isFromAgent && (
                              <Badge className={`text-xs ${senderColor.badge}`}>
                                <i className="fas fa-robot mr-1"></i>
                                IA {senderColor.name}
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
        ) : selectedConnectionId && viewMode === 'group' && selectedTargetConnections.length > 0 ? (
          <div className="flex-1 flex flex-col bg-card">
            {/* Group Chat Header */}
            <div className="px-6 py-4 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Envio para Múltiplas Conexões
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedConnection?.name} → {selectedTargetConnections.length} conexões
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTargetConnections([])}
                  className="text-red-400 border-red-500/30 hover:bg-red-500/20"
                >
                  <i className="fas fa-times mr-2"></i>
                  Limpar Seleção
                </Button>
              </div>
            </div>

            {/* Selected Targets Display */}
            <div className="px-6 py-4 border-b border-border">
              <h4 className="text-sm font-medium text-foreground mb-3">Conexões Selecionadas:</h4>
              <div className="flex flex-wrap gap-2">
                {selectedTargetConnections.map(targetId => {
                  const target = connections.find(c => c.id === targetId);
                  return target ? (
                    <Badge key={targetId} variant="secondary" className="text-xs">
                      <i className="fas fa-whatsapp mr-1"></i>
                      {target.name}
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>

            {/* Group Message Input */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/20 rounded-full flex items-center justify-center">
                  <i className="fas fa-paper-plane text-2xl text-primary"></i>
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Envio em Massa</h3>
                <p className="text-muted-foreground mb-4">
                  Escreva uma mensagem que será enviada para todas as {selectedTargetConnections.length} conexões selecionadas
                </p>
              </div>
            </div>

            {/* Group Message Input */}
            <div className="border-t border-border p-4">
              <div className="flex space-x-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Mensagem para ${selectedTargetConnections.length} conexões...`}
                  className="flex-1"
                  disabled={sendMessageMutation.isPending}
                />
                <Button
                  onClick={sendToMultipleTargets}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending || selectedTargetConnections.length === 0}
                  className="bg-primary hover:bg-primary/80"
                >
                  {sendMessageMutation.isPending ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane mr-2"></i>
                      Enviar para {selectedTargetConnections.length}
                    </>
                  )}
                </Button>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-muted-foreground">
                  Pressione Enter para enviar para todas as conexões selecionadas
                </p>
                <p className="text-xs text-primary">
                  De: {selectedConnection?.name}
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
              <h3 className="text-lg font-medium text-foreground mb-2">
                {viewMode === 'individual' ? 'Selecione uma conversa' : 'Selecione conexões para grupo'}
              </h3>
              <p className="text-muted-foreground">
                {viewMode === 'individual' 
                  ? `Escolha com qual conexão ${selectedConnection?.name} deve conversar`
                  : `Escolha múltiplas conexões para ${selectedConnection?.name} enviar mensagens em massa`
                }
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