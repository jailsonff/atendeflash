import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSocket } from "@/hooks/useSocket";

interface ChatGPTConfig {
  id: string;
  apiKey: string;
  responseTime: number;
  autoResponse: boolean;
  keywordTriggers: string[];
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ChatGPT() {
  const [config, setConfig] = useState({
    apiKey: "",
    responseTime: 2000,
    autoResponse: true,
    keywordTriggers: [] as string[],
  });
  const [newKeyword, setNewKeyword] = useState("");
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ valid: boolean; tested: boolean }>({
    valid: false,
    tested: false,
  });

  const { toast } = useToast();
  useSocket();

  const { data: currentConfig, isLoading } = useQuery<ChatGPTConfig>({
    queryKey: ["/api/chatgpt/config"],
  });

  // Update local state when data loads
  useEffect(() => {
    if (currentConfig && currentConfig.configured) {
      setConfig({
        apiKey: "", // Don't show the actual API key
        responseTime: currentConfig.responseTime || 2000,
        autoResponse: currentConfig.autoResponse ?? true,
        keywordTriggers: currentConfig.keywordTriggers || [],
      });
    }
  }, [currentConfig]);

  const saveConfigMutation = useMutation({
    mutationFn: async (data: typeof config) => {
      const response = await apiRequest("POST", "/api/chatgpt/config", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatgpt/config"] });
      toast({
        title: "Configuração salva",
        description: "As configurações do ChatGPT foram salvas com sucesso.",
      });
      setApiTestResult({ valid: true, tested: true });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar configuração",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const testApiMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await apiRequest("POST", "/api/chatgpt/test", { apiKey });
      return response.json();
    },
    onSuccess: (result) => {
      setApiTestResult({ valid: result.valid, tested: true });
      if (result.valid) {
        toast({
          title: "API Key válida",
          description: "A conexão com a OpenAI foi estabelecida com sucesso.",
        });
      } else {
        toast({
          title: "API Key inválida",
          description: "Não foi possível conectar com a OpenAI. Verifique sua chave.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setApiTestResult({ valid: false, tested: true });
      toast({
        title: "Erro ao testar API",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleTestApi = async () => {
    if (!config.apiKey.trim()) {
      toast({
        title: "API Key obrigatória",
        description: "Digite sua chave da API OpenAI para testar.",
        variant: "destructive",
      });
      return;
    }

    setIsTestingApi(true);
    try {
      await testApiMutation.mutateAsync(config.apiKey);
    } finally {
      setIsTestingApi(false);
    }
  };

  const addKeyword = () => {
    if (!newKeyword.trim()) return;
    
    const keyword = newKeyword.trim().toLowerCase();
    if (!config.keywordTriggers.includes(keyword)) {
      setConfig(prev => ({
        ...prev,
        keywordTriggers: [...prev.keywordTriggers, keyword]
      }));
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setConfig(prev => ({
      ...prev,
      keywordTriggers: prev.keywordTriggers.filter(k => k !== keyword)
    }));
  };

  const handleSave = () => {
    if (!config.apiKey.trim()) {
      toast({
        title: "API Key obrigatória",
        description: "Digite sua chave da API OpenAI antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    saveConfigMutation.mutate(config);
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          <div className="grid gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
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
            <h2 className="text-2xl font-bold text-foreground">Configuração ChatGPT</h2>
            <p className="text-muted-foreground text-sm">Configure a integração com OpenAI para agentes IA</p>
          </div>
          <div className="flex items-center space-x-4">
            {currentConfig?.configured && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <i className="fas fa-check-circle mr-2"></i>
                Configurado
              </Badge>
            )}
            <Button
              onClick={handleSave}
              disabled={!config.apiKey || saveConfigMutation.isPending}
              className="bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              {saveConfigMutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Salvando...
                </>
              ) : (
                <>
                  <i className="fas fa-save mr-2"></i>
                  Salvar Configuração
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Configuration Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* API Configuration */}
        <Card className="bg-card border-border rounded-xl">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center">
              <i className="fas fa-key text-primary mr-3"></i>
              Configuração da API OpenAI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="apiKey" className="text-foreground">Chave da API OpenAI</Label>
              <div className="flex space-x-2 mt-2">
                <Input
                  id="apiKey"
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => {
                    setConfig(prev => ({ ...prev, apiKey: e.target.value }));
                    setApiTestResult({ valid: false, tested: false });
                  }}
                  placeholder="sk-..."
                  className="flex-1 bg-white border-border text-black"
                />
                <Button
                  onClick={handleTestApi}
                  disabled={isTestingApi || !config.apiKey.trim()}
                  variant="outline"
                  className="border-primary/30 text-primary hover:bg-primary/20"
                >
                  {isTestingApi ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <>
                      <i className="fas fa-test-tube mr-2"></i>
                      Testar
                    </>
                  )}
                </Button>
              </div>
              
              {apiTestResult.tested && (
                <div className={`mt-2 text-sm flex items-center ${
                  apiTestResult.valid ? 'text-green-400' : 'text-red-400'
                }`}>
                  <i className={`fas ${
                    apiTestResult.valid ? 'fa-check-circle' : 'fa-times-circle'
                  } mr-2`}></i>
                  {apiTestResult.valid 
                    ? 'API Key válida e funcional' 
                    : 'API Key inválida ou com problemas'
                  }
                </div>
              )}
              
              <p className="text-xs text-gray-400 mt-2">
                Obtenha sua chave em{" "}
                <a 
                  href="https://platform.openai.com/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[hsl(180,100%,41%)] hover:underline"
                >
                  platform.openai.com/api-keys
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Response Settings */}
        <Card className="glass-effect rounded-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <i className="fas fa-cogs text-[hsl(328,100%,54%)] mr-3"></i>
              Configurações de Resposta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-gray-300">
                Tempo de Resposta: {config.responseTime / 1000}s
              </Label>
              <div className="mt-2">
                <Slider
                  value={[config.responseTime]}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, responseTime: value[0] }))}
                  max={10000}
                  min={1000}
                  step={500}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Imediato (1s)</span>
                  <span>Lento (10s)</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Delay antes do agente IA responder automaticamente
              </p>
            </div>

            <Separator className="bg-gray-700" />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-300 font-medium">Respostas Automáticas</Label>
                <p className="text-sm text-gray-400 mt-1">
                  Permitir que agentes respondam automaticamente às mensagens
                </p>
              </div>
              <Switch
                checked={config.autoResponse}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoResponse: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Keyword Triggers */}
        <Card className="glass-effect rounded-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <i className="fas fa-search text-yellow-400 mr-3"></i>
              Palavras-Chave de Ativação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="newKeyword" className="text-gray-300">Adicionar Palavra-Chave</Label>
              <div className="flex space-x-2 mt-2">
                <Input
                  id="newKeyword"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                  placeholder="Ex: ajuda, suporte, problema..."
                  className="flex-1 bg-white border-gray-600 text-black"
                />
                <Button
                  onClick={addKeyword}
                  disabled={!newKeyword.trim()}
                  className="bg-[hsl(328,100%,54%)] hover:bg-[hsl(328,100%,54%)]/80"
                >
                  <i className="fas fa-plus"></i>
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Agentes serão ativados quando estas palavras forem detectadas
              </p>
            </div>

            {config.keywordTriggers.length > 0 && (
              <div>
                <Label className="text-gray-300">Palavras-Chave Ativas ({config.keywordTriggers.length})</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {config.keywordTriggers.map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className="bg-gray-700 text-white hover:bg-gray-600 cursor-pointer group"
                      onClick={() => removeKeyword(keyword)}
                    >
                      {keyword}
                      <i className="fas fa-times ml-2 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Clique em uma palavra-chave para removê-la
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Information */}
        <Card className="glass-effect rounded-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <i className="fas fa-info-circle text-blue-400 mr-3"></i>
              Informações do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Modelo IA:</span>
                  <span className="text-white font-medium">GPT-4o</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status da API:</span>
                  <span className={`font-medium ${
                    apiTestResult.tested && apiTestResult.valid 
                      ? 'text-green-400' 
                      : currentConfig?.configured 
                      ? 'text-yellow-400' 
                      : 'text-red-400'
                  }`}>
                    {apiTestResult.tested && apiTestResult.valid 
                      ? 'Conectado' 
                      : currentConfig?.configured 
                      ? 'Configurado' 
                      : 'Não configurado'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Respostas Automáticas:</span>
                  <span className={`font-medium ${config.autoResponse ? 'text-green-400' : 'text-gray-400'}`}>
                    {config.autoResponse ? 'Ativadas' : 'Desativadas'}
                  </span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Delay de Resposta:</span>
                  <span className="text-white font-medium">{config.responseTime / 1000}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Palavras-Chave:</span>
                  <span className="text-white font-medium">{config.keywordTriggers.length}</span>
                </div>
                {currentConfig?.updatedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Última Atualização:</span>
                    <span className="text-white font-medium">
                      {new Date(currentConfig.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
