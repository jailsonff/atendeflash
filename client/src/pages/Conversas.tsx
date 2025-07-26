import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function Conversas() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
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

  const { data: conversationMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConnectionId, "system"],
    enabled: !!selectedConnectionId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { content: string; toConnectionId: string }) => {
      const response = await apiRequest("POST", "/api/messages", {
        content: data.content,
        toConnectionId: data.toConnectionId,
        fromConnectionId: "system", // System connection
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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationMessages]);

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

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConnectionId) return;
    
    sendMessageMutation.mutate({
      content: newMessage.trim(),
      toConnectionId: selectedConnectionId,
    });
  };

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
      <header className="bg-dark-secondary border-b border-gray-800 px-6 py-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Conversas</h2>
          <p className="text-gray-400 text-sm">
            Chat em tempo real entre conexões do sistema
          </p>
        </div>
      </header>

      {/* Chat Interface */}
      <main className="flex-1 flex overflow-hidden">
        {/* Conversations List */}
        <div className="w-80 bg-dark-secondary border-r border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-800">
            <h3 className="font-semibold text-white">Conexões Ativas</h3>
            <p className="text-sm text-gray-400">
              {conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}
            </p>
          </div>
          
          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-400">
                <i className="fas fa-comments text-4xl mb-2 opacity-50"></i>
                <p className="text-sm">Nenhuma conexão ativa</p>
                <p className="text-xs">Conecte um WhatsApp primeiro</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.connectionId}
                    onClick={() => setSelectedConnectionId(conversation.connectionId)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedConnectionId === conversation.connectionId
                        ? 'bg-[hsl(180,100%,41%)]/20 border border-[hsl(180,100%,41%)]/30'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
                          <i className="fab fa-whatsapp text-green-400"></i>
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-secondary"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">
                          {conversation.connectionName}
                        </p>
                        {conversation.lastMessage && (
                          <p className="text-sm text-gray-400 truncate">
                            {conversation.lastMessage}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {conversation.lastMessageTime && (
                          <p className="text-xs text-gray-400">
                            {new Date(conversation.lastMessageTime).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                        {conversation.unreadCount > 0 && (
                          <Badge className="bg-[hsl(328,100%,54%)] text-white text-xs">
                            {conversation.unreadCount}
                          </Badge>
                        )}
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
                    conversationMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`chat-bubble flex items-start space-x-3 ${
                          message.fromConnectionId === "system" ? "flex-row-reverse" : ""
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            message.isFromAgent
                              ? "bg-[hsl(328,100%,54%)]"
                              : message.fromConnectionId === "system"
                              ? "bg-[hsl(180,100%,41%)]"
                              : "bg-gray-600"
                          }`}
                        >
                          <i
                            className={`fas ${
                              message.isFromAgent
                                ? "fa-robot"
                                : message.fromConnectionId === "system"
                                ? "fa-user"
                                : "fa-whatsapp"
                            } text-white text-xs`}
                          ></i>
                        </div>
                        <div className="flex-1">
                          <div
                            className={`rounded-lg px-3 py-2 ${
                              message.fromConnectionId === "system"
                                ? "bg-[hsl(180,100%,41%)]/20 border border-[hsl(180,100%,41%)]/30"
                                : message.isFromAgent
                                ? "bg-[hsl(328,100%,54%)]/20 border border-[hsl(328,100%,54%)]/30"
                                : "bg-dark-tertiary"
                            }`}
                          >
                            <p className="text-sm text-white">{message.content}</p>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p
                              className={`text-xs text-gray-400 ${
                                message.fromConnectionId === "system" ? "text-right" : ""
                              }`}
                            >
                              {new Date(message.timestamp).toLocaleTimeString('pt-BR')}
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
                    ))
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
                    className="flex-1 bg-dark-tertiary border-gray-600 text-white"
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
                <p className="text-xs text-gray-400 mt-2">
                  Pressione Enter para enviar, Shift + Enter para quebrar linha
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
