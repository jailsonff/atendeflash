import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSocket } from "@/hooks/useSocket";

interface AiAgent {
  id: string;
  name: string;
  description?: string;
  persona: string;
  temperature?: number;
  responseTime?: number; // Response time in milliseconds
  connectionId?: string;
  isActive?: boolean;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface WhatsappConnection {
  id: string;
  name: string;
  phoneNumber: string;
  status: string;
}

export default function Agentes() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null);
  const [agentForm, setAgentForm] = useState({
    name: "",
    description: "",
    persona: "",
    temperature: 70,
    responseTime: 2000, // Default 2 seconds
    connectionId: "",
    isActive: true,
  });

  const { toast } = useToast();
  useSocket();

  const { data: agents = [], isLoading } = useQuery<AiAgent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: connections = [] } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/connections"],
  });

  const createAgentMutation = useMutation({
    mutationFn: async (data: typeof agentForm) => {
      const response = await apiRequest("POST", "/api/agents", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setIsCreateModalOpen(false);
      setEditingAgent(null);
      resetForm();
      toast({
        title: "Agente criado com sucesso",
        description: "Seu agente IA está pronto para uso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar agente",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof agentForm> }) => {
      const response = await apiRequest("PUT", `/api/agents/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setEditingAgent(null);
      resetForm();
      toast({
        title: "Agente atualizado",
        description: "As alterações foram salvas com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar agente",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const response = await apiRequest("DELETE", `/api/agents/${agentId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Agente removido",
        description: "Agente deletado com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover agente",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const toggleAgentStatus = (agent: AiAgent) => {
    updateAgentMutation.mutate({
      id: agent.id,
      data: { isActive: !agent.isActive }
    });
  };

  const resetForm = () => {
    setAgentForm({
      name: "",
      description: "",
      persona: "",
      temperature: 70,
      responseTime: 2000, // Default 2 seconds
      connectionId: "",
      isActive: true,
    });
  };

  const openEditModal = (agent: AiAgent) => {
    setEditingAgent(agent);
    setAgentForm({
      name: agent.name,
      description: agent.description || "",
      persona: agent.persona,
      temperature: agent.temperature || 70,
      responseTime: agent.responseTime || 2000,
      connectionId: agent.connectionId || "",
      isActive: agent.isActive || true,
    });
    setIsCreateModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingAgent) {
      updateAgentMutation.mutate({ id: editingAgent.id, data: agentForm });
    } else {
      createAgentMutation.mutate(agentForm);
    }
  };

  const availableConnections = connections.filter(conn => 
    conn.status === 'connected' && 
    !agents.some(agent => agent.connectionId === conn.id && agent.id !== editingAgent?.id)
  );

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-gray-700 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Agentes IA</h2>
            <p className="text-muted-foreground text-sm">Gerencie seus agentes de inteligência artificial</p>
          </div>
          <Dialog open={isCreateModalOpen} onOpenChange={(open) => {
            setIsCreateModalOpen(open);
            if (!open) {
              setEditingAgent(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(328,100%,54%)] hover:bg-[hsl(328,100%,54%)]/80 text-white">
                <i className="fas fa-plus mr-2"></i>
                Novo Agente
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-dark-secondary border-gray-700 max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-white">
                  {editingAgent ? "Editar Agente IA" : "Criar Novo Agente IA"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-gray-300">Nome do Agente</Label>
                    <Input
                      id="name"
                      value={agentForm.name}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-white border-gray-600 text-black"
                      placeholder="Ex: Atendente Virtual"
                    />
                  </div>
                  <div>
                    <Label htmlFor="connection" className="text-gray-300">Conexão WhatsApp</Label>
                    <Select 
                      value={agentForm.connectionId} 
                      onValueChange={(value) => setAgentForm(prev => ({ ...prev, connectionId: value }))}
                    >
                      <SelectTrigger className="bg-white border-gray-600 text-black">
                        <SelectValue placeholder="Selecione uma conexão" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-600">
                        {availableConnections.map((connection) => (
                          <SelectItem key={connection.id} value={connection.id}>
                            {connection.name} ({connection.phoneNumber})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description" className="text-gray-300">Descrição</Label>
                  <Input
                    id="description"
                    value={agentForm.description}
                    onChange={(e) => setAgentForm(prev => ({ ...prev, description: e.target.value }))}
                    className="bg-white border-gray-600 text-black"
                    placeholder="Ex: Especialista em atendimento ao cliente"
                  />
                </div>

                <div>
                  <Label htmlFor="persona" className="text-gray-300">Persona do Agente</Label>
                  <Textarea
                    id="persona"
                    value={agentForm.persona}
                    onChange={(e) => setAgentForm(prev => ({ ...prev, persona: e.target.value }))}
                    className="bg-white border-gray-600 text-black min-h-24"
                    placeholder="Descreva como o agente deve se comportar, seu tom de voz, conhecimentos específicos, etc."
                  />
                </div>

                <div>
                  <Label className="text-gray-300">Temperatura ({(agentForm.temperature / 100).toFixed(1)})</Label>
                  <div className="mt-2">
                    <Slider
                      value={[agentForm.temperature]}
                      onValueChange={(value) => setAgentForm(prev => ({ ...prev, temperature: value[0] }))}
                      max={100}
                      min={0}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>Conservador (0.0)</span>
                      <span>Criativo (1.0)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="responseTime" className="text-gray-300">
                    Tempo de Resposta ({Math.floor(agentForm.responseTime / 60000) > 0 ? `${Math.floor(agentForm.responseTime / 60000)}min ` : ''}{Math.floor((agentForm.responseTime % 60000) / 1000)}s)
                  </Label>
                  <div className="mt-2">
                    <Slider
                      value={[agentForm.responseTime]}
                      onValueChange={(value) => setAgentForm(prev => ({ ...prev, responseTime: value[0] }))}
                      max={300000} // 5 minutes
                      min={1000} // 1 second
                      step={1000} // 1 second steps
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>Imediato (1s)</span>
                      <span>5 minutos</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Switch
                    checked={agentForm.isActive}
                    onCheckedChange={(checked) => setAgentForm(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label className="text-gray-300">Agente ativo</Label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-700">
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="border-gray-600 text-gray-300"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!agentForm.name || !agentForm.persona || createAgentMutation.isPending || updateAgentMutation.isPending}
                  className="bg-[hsl(328,100%,54%)] hover:bg-[hsl(328,100%,54%)]/80"
                >
                  {createAgentMutation.isPending || updateAgentMutation.isPending 
                    ? "Salvando..." 
                    : editingAgent ? "Atualizar Agente" : "Criar Agente"
                  }
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Agents Grid */}
      <main className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <Card className="glass-effect rounded-xl">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-[hsl(328,100%,54%)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-robot text-[hsl(328,100%,54%)] text-3xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Nenhum agente encontrado</h3>
              <p className="text-gray-400 mb-6">Crie seu primeiro agente IA para automatizar atendimentos</p>
              <Button 
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-[hsl(328,100%,54%)] hover:bg-[hsl(328,100%,54%)]/80"
              >
                <i className="fas fa-plus mr-2"></i>
                Criar Primeiro Agente
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => {
              const connection = connections.find(c => c.id === agent.connectionId);
              
              return (
                <Card key={agent.id} className="glass-effect rounded-xl hover:glow-pink transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-[hsl(328,100%,54%)] to-[hsl(180,100%,41%)] rounded-lg flex items-center justify-center">
                          <i className="fas fa-robot text-white text-xl"></i>
                        </div>
                        <div>
                          <CardTitle className="text-white">{agent.name}</CardTitle>
                          <p className="text-sm text-gray-400">{agent.description || "Sem descrição"}</p>
                        </div>
                      </div>
                      <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                        <div className={`w-2 h-2 rounded-full mr-1 ${
                          agent.isActive ? 'bg-green-400 animate-pulse-glow' : 'bg-gray-400'
                        }`}></div>
                        {agent.isActive ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="bg-dark-tertiary rounded-lg p-3">
                        <p className="text-sm text-gray-300 line-clamp-3">
                          {agent.persona.length > 100 
                            ? `${agent.persona.substring(0, 100)}...` 
                            : agent.persona
                          }
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-400">Temperatura:</span>
                          <span className="text-[hsl(180,100%,41%)] font-medium ml-1">
                            {(agent.temperature || 70) / 100}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Mensagens:</span>
                          <span className="text-white font-medium ml-1">
                            {agent.messageCount || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Tempo:</span>
                          <span className="text-[hsl(328,100%,54%)] font-medium ml-1">
                            {Math.floor((agent.responseTime || 2000) / 60000) > 0 
                              ? `${Math.floor((agent.responseTime || 2000) / 60000)}min ` 
                              : ''
                            }{Math.floor(((agent.responseTime || 2000) % 60000) / 1000)}s
                          </span>
                        </div>
                      </div>

                      {connection && (
                        <div className="flex items-center space-x-2 text-sm">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span className="text-gray-400">Vinculado a:</span>
                          <span className="text-white font-medium">{connection.name}</span>
                        </div>
                      )}

                      <div className="flex space-x-2 pt-2">
                        <Button
                          onClick={() => toggleAgentStatus(agent)}
                          disabled={updateAgentMutation.isPending}
                          size="sm"
                          variant="outline"
                          className={agent.isActive 
                            ? "border-yellow-600 text-yellow-600 hover:bg-yellow-600/20"
                            : "border-green-600 text-green-600 hover:bg-green-600/20"
                          }
                        >
                          <i className={`fas ${agent.isActive ? 'fa-pause' : 'fa-play'} mr-2`}></i>
                          {agent.isActive ? 'Pausar' : 'Ativar'}
                        </Button>
                        
                        <Button
                          onClick={() => openEditModal(agent)}
                          size="sm"
                          variant="outline"
                          className="border-[hsl(180,100%,41%)]/30 text-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/20"
                        >
                          <i className="fas fa-edit mr-2"></i>
                          Editar
                        </Button>
                        
                        <Button
                          onClick={() => deleteAgentMutation.mutate(agent.id)}
                          disabled={deleteAgentMutation.isPending}
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-600 hover:bg-red-600/20"
                        >
                          <i className="fas fa-trash"></i>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
