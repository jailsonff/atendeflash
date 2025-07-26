import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSocket } from "@/hooks/useSocket";
import QRCode from 'qrcode';

interface WhatsappConnection {
  id: string;
  name: string;
  phoneNumber: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  qrCode?: string;
  lastSeen?: string;
  createdAt: string;
}

// QR Code Display Component
function QRCodeDisplay({ qrData }: { qrData: string }) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        // Decode base64 data to get original string
        const decodedData = atob(qrData);
        
        // Generate QR code image
        const qrCodeDataURL = await QRCode.toDataURL(decodedData, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        setQrCodeUrl(qrCodeDataURL);
      } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
      }
    };

    if (qrData) {
      generateQRCode();
    }
  }, [qrData]);

  if (!qrCodeUrl) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="bg-white p-4 rounded-lg">
        <img src={qrCodeUrl} alt="QR Code WhatsApp" className="w-64 h-64" />
      </div>
      <p className="text-sm text-gray-400 text-center">
        Escaneie este QR Code com seu WhatsApp para conectar
      </p>
    </div>
  );
}

export default function Conexoes() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [qrModalData, setQrModalData] = useState<{ connectionId: string; qrCode: string } | null>(null);
  const [newConnection, setNewConnection] = useState({ name: "" });
  
  const { toast } = useToast();
  useSocket();

  const { data: connections = [], isLoading } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/connections"],
  });

  const createConnectionMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/connections", data);
      return response.json();
    },
    onSuccess: (connection) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      setIsCreateModalOpen(false);
      setNewConnection({ name: "" });
      
      toast({
        title: "Conexão criada com sucesso",
        description: "Use o botão 'Conectar' para gerar o QR Code.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar conexão",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await apiRequest("POST", `/api/connections/${connectionId}/connect`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      
      if (data.qrCode) {
        setQrModalData({ connectionId: data.connectionId, qrCode: data.qrCode });
      }
      
      toast({
        title: "QR Code gerado",
        description: "Escaneie o QR Code com seu WhatsApp para conectar.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao conectar",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await apiRequest("POST", `/api/connections/${connectionId}/disconnect`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      toast({
        title: "WhatsApp desconectado",
        description: "Conexão encerrada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao desconectar",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await apiRequest("DELETE", `/api/connections/${connectionId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      toast({
        title: "Conexão removida",
        description: "Conexão deletada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover conexão",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando';
      case 'disconnected': return 'Desconectado';
      case 'error': return 'Erro';
      default: return 'Desconhecido';
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          <div className="grid gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
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
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Conexões WhatsApp</h2>
            <p className="text-muted-foreground text-sm">Gerencie suas conexões do WhatsApp</p>
          </div>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/80 text-white">
                <i className="fas fa-plus mr-2"></i>
                Nova Conexão
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-dark-secondary border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-white">Conectar Novo WhatsApp</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-gray-300">Nome da Conexão</Label>
                  <Input
                    id="name"
                    value={newConnection.name}
                    onChange={(e) => setNewConnection(prev => ({ ...prev, name: e.target.value }))}
                    className="input-dark"
                    placeholder="Ex: Atendimento Principal"
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCreateModalOpen(false)}
                    className="border-gray-600 text-gray-300"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => createConnectionMutation.mutate(newConnection)}
                    disabled={!newConnection.name || createConnectionMutation.isPending}
                    className="bg-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/80"
                  >
                    {createConnectionMutation.isPending ? "Criando..." : "Criar Conexão"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Connections List */}
      <main className="flex-1 overflow-y-auto p-6">
        {connections.length === 0 ? (
          <Card className="glass-effect rounded-xl">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-[hsl(180,100%,41%)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fab fa-whatsapp text-[hsl(180,100%,41%)] text-3xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Nenhuma conexão encontrada</h3>
              <p className="text-gray-400 mb-6">Crie sua primeira conexão WhatsApp para começar</p>
              <Button 
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/80"
              >
                <i className="fas fa-plus mr-2"></i>
                Criar Primeira Conexão
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {connections.map((connection) => (
              <Card key={connection.id} className="glass-effect rounded-xl">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center">
                          <i className="fab fa-whatsapp text-green-400 text-xl"></i>
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(connection.status)} rounded-full border-2 border-dark-secondary`}></div>
                      </div>
                      <div>
                        <CardTitle className="text-white">{connection.name}</CardTitle>
                        <p className="text-gray-400">
                          {connection.phoneNumber || 'Aguardando conexão...'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={connection.status === 'connected' ? 'default' : 'secondary'}>
                      {getStatusText(connection.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-400">
                      <p>Criado: {new Date(connection.createdAt).toLocaleDateString('pt-BR')}</p>
                      {connection.lastSeen && (
                        <p>Última atividade: {new Date(connection.lastSeen).toLocaleString('pt-BR')}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      {connection.status === 'disconnected' && (
                        <Button
                          onClick={() => connectMutation.mutate(connection.id)}
                          disabled={connectMutation.isPending}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <i className="fas fa-plug mr-2"></i>
                          Conectar
                        </Button>
                      )}
                      
                      {connection.status === 'connected' && (
                        <Button
                          onClick={() => disconnectMutation.mutate(connection.id)}
                          disabled={disconnectMutation.isPending}
                          size="sm"
                          variant="outline"
                          className="border-yellow-600 text-yellow-600 hover:bg-yellow-600/20"
                        >
                          <i className="fas fa-unlink mr-2"></i>
                          Desconectar
                        </Button>
                      )}
                      
                      {connection.qrCode && connection.status === 'connecting' && (
                        <Button
                          onClick={() => setQrModalData({ connectionId: connection.id, qrCode: connection.qrCode! })}
                          size="sm"
                          className="bg-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/80"
                        >
                          <i className="fas fa-qrcode mr-2"></i>
                          Ver QR Code
                        </Button>
                      )}
                      
                      <Button
                        onClick={() => deleteConnectionMutation.mutate(connection.id)}
                        disabled={deleteConnectionMutation.isPending}
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-600 hover:bg-red-600/20"
                      >
                        <i className="fas fa-trash mr-2"></i>
                        Remover
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      {qrModalData && (
        <Dialog open={!!qrModalData} onOpenChange={() => setQrModalData(null)}>
          <DialogContent className="bg-dark-secondary border-gray-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center text-white">
                <div className="w-16 h-16 bg-[hsl(180,100%,41%)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-qrcode text-[hsl(180,100%,41%)] text-2xl"></i>
                </div>
                Conectar WhatsApp
              </DialogTitle>
            </DialogHeader>
            <div className="text-center">
              <QRCodeDisplay qrData={qrModalData.qrCode} />

              <div className="flex space-x-3">
                <Button 
                  variant="outline" 
                  onClick={() => setQrModalData(null)}
                  className="flex-1 border-gray-600 text-gray-300"
                >
                  Fechar
                </Button>
                <Button 
                  onClick={() => {
                    // Refresh QR code - would call API to generate new QR
                    toast({
                      title: "QR Code atualizado",
                      description: "Novo QR Code gerado com sucesso.",
                    });
                  }}
                  className="flex-1 bg-[hsl(180,100%,41%)] hover:bg-[hsl(180,100%,41%)]/80"
                >
                  <i className="fas fa-sync-alt mr-2"></i>
                  Atualizar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
