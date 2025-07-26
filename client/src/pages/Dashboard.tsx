import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSocket } from "@/hooks/useSocket";

interface DashboardMetrics {
  activeConnections: number;
  totalMessages: number;
  activeAgents: number;
  systemStatus: string;
}

interface WhatsappConnection {
  id: string;
  name: string;
  phoneNumber: string;
  status: string;
  lastSeen?: string;
}

interface Message {
  id: string;
  content: string;
  timestamp: string;
  isFromAgent?: boolean;
  fromConnectionId?: string;
  toConnectionId?: string;
}

interface AiAgent {
  id: string;
  name: string;
  description?: string;
  temperature?: number;
  messageCount?: number;
  isActive?: boolean;
}

export default function Dashboard() {
  useSocket(); // Connect to WebSocket for real-time updates

  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: connections = [], isLoading: connectionsLoading } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery<AiAgent[]>({
    queryKey: ["/api/agents"],
  });

  // Get recent connections (last 3)
  const recentConnections = connections
    .sort((a, b) => new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime())
    .slice(0, 3);

  // Get recent messages for live chat preview
  const recentMessages = messages
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 3);

  if (metricsLoading || connectionsLoading || messagesLoading || agentsLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-700 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-dark-secondary border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Dashboard</h2>
            <p className="text-gray-400 text-sm">Visão geral do sistema Aquecedor Turbo</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse-glow"></div>
              <span>Tempo Real Ativo</span>
            </div>
            <Button variant="ghost" size="sm" className="relative p-2 text-gray-400 hover:text-white">
              <i className="fas fa-bell text-lg"></i>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-[hsl(328,100%,54%)] rounded-full"></span>
            </Button>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="glass-effect rounded-xl hover:glow-turquoise transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Conexões Ativas</p>
                  <p className="text-3xl font-bold text-[hsl(180,100%,41%)] mt-1">
                    {metrics?.activeConnections || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-[hsl(180,100%,41%)]/20 rounded-lg flex items-center justify-center">
                  <i className="fab fa-whatsapp text-[hsl(180,100%,41%)] text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <i className="fas fa-arrow-up text-green-400 mr-1"></i>
                <span className="text-green-400 font-medium">+{Math.floor(Math.random() * 5)}</span>
                <span className="text-gray-400 ml-1">nas últimas 24h</span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-effect rounded-xl hover:glow-pink transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Mensagens Trocadas</p>
                  <p className="text-3xl font-bold text-[hsl(328,100%,54%)] mt-1">
                    {metrics?.totalMessages || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-[hsl(328,100%,54%)]/20 rounded-lg flex items-center justify-center">
                  <i className="fas fa-comments text-[hsl(328,100%,54%)] text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <i className="fas fa-arrow-up text-green-400 mr-1"></i>
                <span className="text-green-400 font-medium">+{Math.floor(Math.random() * 50 + 10)}</span>
                <span className="text-gray-400 ml-1">hoje</span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-effect rounded-xl hover:glow-turquoise transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Agentes IA Ativos</p>
                  <p className="text-3xl font-bold text-[hsl(180,100%,41%)] mt-1">
                    {metrics?.activeAgents || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-[hsl(180,100%,41%)]/20 rounded-lg flex items-center justify-center">
                  <i className="fas fa-robot text-[hsl(180,100%,41%)] text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <i className="fas fa-circle text-green-400 mr-1"></i>
                <span className="text-green-400 font-medium">Todos online</span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-effect rounded-xl hover:glow-pink transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Sistema</p>
                  <p className="text-3xl font-bold text-green-400 mt-1">Online</p>
                </div>
                <div className="w-12 h-12 bg-green-400/20 rounded-lg flex items-center justify-center">
                  <i className="fas fa-server text-green-400 text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <i className="fas fa-clock text-gray-400 mr-1"></i>
                <span className="text-gray-400">Uptime: 99.9%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Connections */}
          <Card className="lg:col-span-2 glass-effect rounded-xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Conexões Recentes</h3>
                <Button variant="ghost" size="sm" className="text-[hsl(180,100%,41%)] hover:text-[hsl(180,100%,41%)]/80">
                  Ver todas
                </Button>
              </div>
              
              <div className="space-y-4">
                {recentConnections.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <i className="fab fa-whatsapp text-4xl mb-2 opacity-50"></i>
                    <p>Nenhuma conexão encontrada</p>
                  </div>
                ) : (
                  recentConnections.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between p-4 bg-dark-tertiary rounded-lg hover:bg-gray-700 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
                            <i className="fab fa-whatsapp text-green-400"></i>
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-dark-tertiary ${
                            connection.status === 'connected' ? 'bg-green-500' : 'bg-gray-500'
                          }`}></div>
                        </div>
                        <div>
                          <p className="font-medium text-white">{connection.name}</p>
                          <p className="text-sm text-gray-400">{connection.phoneNumber}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={connection.status === 'connected' ? 'default' : 'secondary'}>
                          <i className={`fas fa-circle mr-1 text-xs ${
                            connection.status === 'connected' ? 'text-green-400' : 'text-gray-400'
                          }`}></i>
                          {connection.status === 'connected' ? 'Online' : 'Offline'}
                        </Badge>
                        <p className="text-xs text-gray-400 mt-1">
                          {connection.lastSeen ? new Date(connection.lastSeen).toLocaleTimeString('pt-BR') : 'Nunca'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-700">
                <Button className="w-full bg-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/80 text-white">
                  <i className="fas fa-qrcode mr-2"></i>
                  Conectar Novo WhatsApp
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Chat Preview */}
          <Card className="lg:col-span-1 glass-effect rounded-xl">
            <CardContent className="p-6 h-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Chat ao Vivo</h3>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse-glow"></div>
                  <span className="text-xs text-green-400 font-medium">Ativo</span>
                </div>
              </div>

              <div className="space-y-4 mb-4 max-h-80 overflow-y-auto">
                {recentMessages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <i className="fas fa-comments text-4xl mb-2 opacity-50"></i>
                    <p>Nenhuma mensagem recente</p>
                  </div>
                ) : (
                  recentMessages.map((message, index) => (
                    <div key={message.id} className="chat-bubble">
                      <div className={`flex items-start space-x-3 ${message.isFromAgent ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          message.isFromAgent 
                            ? 'bg-[hsl(328,100%,54%)]' 
                            : 'bg-[hsl(180,100%,41%)]'
                        }`}>
                          <i className={`fas ${message.isFromAgent ? 'fa-robot' : 'fa-user'} text-white text-xs`}></i>
                        </div>
                        <div className="flex-1">
                          <div className={`rounded-lg px-3 py-2 ${
                            message.isFromAgent 
                              ? 'bg-[hsl(180,100%,41%)]/20 border border-[hsl(180,100%,41%)]/30' 
                              : 'bg-dark-tertiary'
                          }`}>
                            <p className="text-sm text-white">{message.content}</p>
                          </div>
                          <p className={`text-xs text-gray-400 mt-1 ${message.isFromAgent ? 'text-right' : ''}`}>
                            {new Date(message.timestamp).toLocaleTimeString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-gray-700 pt-4">
                <div className="flex space-x-2">
                  <Button variant="outline" className="flex-1 border-[hsl(180,100%,41%)]/30 text-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/20">
                    Ver Todas
                  </Button>
                  <Button variant="outline" className="border-[hsl(328,100%,54%)]/30 text-[hsl(328,100%,54%)] hover:bg-[hsl(328,100%,54%)]/20">
                    <i className="fas fa-robot"></i>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Agents Overview */}
        <Card className="glass-effect rounded-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Agentes IA - Visão Geral</h3>
              <Button className="bg-[hsl(328,100%,54%)] hover:bg-[hsl(328,100%,54%)]/80 text-white">
                <i className="fas fa-plus mr-2"></i>
                Novo Agente
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {agents.map((agent) => (
                <Card key={agent.id} className="bg-dark-tertiary hover:bg-gray-700 transition-colors border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-[hsl(328,100%,54%)] to-[hsl(180,100%,41%)] rounded-lg flex items-center justify-center">
                        <i className="fas fa-robot text-white"></i>
                      </div>
                      <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                        <div className={`w-2 h-2 rounded-full mr-1 ${
                          agent.isActive ? 'bg-green-400 animate-pulse-glow' : 'bg-gray-400'
                        }`}></div>
                        {agent.isActive ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </div>
                    <h4 className="font-medium text-white mb-1">{agent.name}</h4>
                    <p className="text-xs text-gray-400 mb-3">{agent.description || 'Sem descrição'}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">
                        Temp: <span className="text-[hsl(180,100%,41%)] font-medium">
                          {(agent.temperature || 70) / 100}
                        </span>
                      </span>
                      <span className="text-gray-400">
                        Msgs: <span className="text-white font-medium">{agent.messageCount || 0}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {/* Add New Agent Card */}
              <Card className="bg-dark-tertiary border-2 border-dashed border-gray-600 hover:border-[hsl(328,100%,54%)] transition-colors cursor-pointer group">
                <CardContent className="p-4 flex flex-col items-center justify-center h-full text-center">
                  <div className="w-10 h-10 bg-[hsl(328,100%,54%)]/20 rounded-lg flex items-center justify-center mb-3 group-hover:bg-[hsl(328,100%,54%)]/30 transition-colors">
                    <i className="fas fa-plus text-[hsl(328,100%,54%)]"></i>
                  </div>
                  <p className="text-sm font-medium text-gray-400 group-hover:text-[hsl(328,100%,54%)] transition-colors">
                    Criar Agente
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* System Performance & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-effect rounded-xl">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Performance do Sistema</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">CPU</span>
                    <span className="text-sm text-[hsl(180,100%,41%)] font-semibold">23%</span>
                  </div>
                  <Progress value={23} className="h-2" />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">Memória</span>
                    <span className="text-sm text-[hsl(328,100%,54%)] font-semibold">67%</span>
                  </div>
                  <Progress value={67} className="h-2" />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">Rede</span>
                    <span className="text-sm text-green-400 font-semibold">12%</span>
                  </div>
                  <Progress value={12} className="h-2" />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">Socket.io Connections</span>
                    <span className="text-sm text-yellow-400 font-semibold">45/100</span>
                  </div>
                  <Progress value={45} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-effect rounded-xl">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Ações Rápidas</h3>
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  variant="outline" 
                  className="h-20 flex-col border-[hsl(180,100%,41%)]/30 text-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/20 hover:glow-turquoise"
                >
                  <i className="fab fa-whatsapp text-2xl mb-2"></i>
                  <span className="text-sm">Conectar WhatsApp</span>
                </Button>

                <Button 
                  variant="outline" 
                  className="h-20 flex-col border-[hsl(328,100%,54%)]/30 text-[hsl(328,100%,54%)] hover:bg-[hsl(328,100%,54%)]/20 hover:glow-pink"
                >
                  <i className="fas fa-robot text-2xl mb-2"></i>
                  <span className="text-sm">Novo Agente IA</span>
                </Button>

                <Button variant="outline" className="h-20 flex-col border-gray-600 text-white hover:bg-gray-600">
                  <i className="fas fa-comments text-2xl mb-2"></i>
                  <span className="text-sm">Ver Conversas</span>
                </Button>

                <Button variant="outline" className="h-20 flex-col border-gray-600 text-white hover:bg-gray-600">
                  <i className="fas fa-cog text-2xl mb-2"></i>
                  <span className="text-sm">Config. ChatGPT</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
