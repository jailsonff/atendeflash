import OpenAI from "openai";
import { storage } from "../storage";

export interface AgentResponse {
  messages: string[];
  confidence: number;
}

export class OpenAIService {
  private openai: OpenAI | null = null;

  // 🔒 CORREÇÃO CRÍTICA: Buscar API key do banco antes do ambiente
  private async getOpenAIClient(): Promise<OpenAI> {
    if (this.openai) return this.openai;

    let apiKey = process.env.OPENAI_API_KEY;
    
    // Primeiro: tentar buscar do banco de dados
    try {
      const config = await storage.getChatgptConfig();
      if (config?.apiKey) {
        apiKey = config.apiKey;
        console.log("✅ OpenAI API Key carregada do banco de dados");
      }
    } catch (error) {
      console.log("⚠️ Erro ao buscar config do banco, usando variável de ambiente");
    }

    if (!apiKey) {
      throw new Error("🔑 API Key do OpenAI não encontrada. Configure em ChatGPT Config ou variável OPENAI_API_KEY");
    }

    this.openai = new OpenAI({ apiKey });
    return this.openai;
  }
  async generateAgentResponse(
    persona: string,
    userMessage: string,
    temperature: number = 0.7,
    conversationHistory: string[] = [],
    maxTokens: number = 500
  ): Promise<AgentResponse> {
    try {
      const openai = await this.getOpenAIClient();
      
      const systemPrompt = `Você é um agente de atendimento virtual com a seguinte persona: ${persona}. 
      
      INSTRUÇÕES IMPORTANTES:
      - Mantenha CONTINUIDADE com a conversa anterior (use o histórico fornecido)
      - NÃO repita frases ou informações já ditas
      - Seja NATURAL e HUMANO na conversa
      - Responda de forma contextual baseado no que já foi conversado
      - Varie seu vocabulário e estilo de resposta
      - Sua resposta deve ter no máximo ${maxTokens} caracteres
      - Seja direto e objetivo para WhatsApp
      
      PERSONA: ${persona}`;

      const messages: any[] = [
        { role: "system", content: systemPrompt }
      ];

      // 🧠 MEMÓRIA INTELIGENTE: Adicionar contexto das conversas anteriores
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-10); // Últimas 10 mensagens
        recentHistory.forEach((msg: any) => {
          const role = msg.isFromAgent ? "assistant" : "user";
          messages.push({
            role,
            content: msg.content
          });
        });
      }

      // Add current user message
      messages.push({ role: "user", content: userMessage });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        temperature,
        max_tokens: Math.min(maxTokens, 1000), // Use configured limit but cap at 1000 tokens
      });

      let assistantMessage = response.choices[0].message.content || "";
      
      // Truncate message if it exceeds character limit
      if (assistantMessage.length > maxTokens) {
        assistantMessage = assistantMessage.substring(0, maxTokens - 3) + "...";
      }
      
      return {
        messages: [assistantMessage], // Always return single message with character limit
        confidence: 0.9 // Simple confidence score
      };
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw new Error("Falha ao gerar resposta do agente IA: " + (error as Error).message);
    }
  }

  async analyzeKeywordTrigger(message: string, keywords: string[]): Promise<boolean> {
    try {
      if (keywords.length === 0) return false;

      const openai = await this.getOpenAIClient();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Analise se a mensagem contém alguma das palavras-chave ou conceitos relacionados: ${keywords.join(", ")}. 
            Responda com JSON no formato: { "triggered": boolean, "matchedKeyword": string }`,
          },
          {
            role: "user",
            content: message,
          },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result.triggered || false;
    } catch (error) {
      console.error("Keyword analysis error:", error);
      return false;
    }
  }

  async testApiKey(apiKey: string): Promise<boolean> {
    try {
      const testOpenai = new OpenAI({ apiKey });
      const response = await testOpenai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Teste de conexão" }],
        max_tokens: 10,
      });
      
      return !!response.choices[0].message.content;
    } catch (error) {
      console.error("API key test failed:", error);
      return false;
    }
  }
}

export const openaiService = new OpenAIService();
