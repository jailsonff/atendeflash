import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

export interface AgentResponse {
  message: string;
  confidence: number;
}

export class OpenAIService {
  async generateAgentResponse(
    persona: string,
    userMessage: string,
    temperature: number = 0.7,
    conversationHistory: string[] = []
  ): Promise<AgentResponse> {
    try {
      const systemPrompt = `Você é um agente de atendimento virtual com a seguinte persona: ${persona}. 
      Responda de forma natural, útil e sempre mantendo o tom da persona definida. 
      Mantenha as respostas concisas e diretas para WhatsApp.`;

      const messages: any[] = [
        { role: "system", content: systemPrompt }
      ];

      // Add conversation history
      conversationHistory.slice(-10).forEach((msg, index) => {
        messages.push({
          role: index % 2 === 0 ? "user" : "assistant",
          content: msg
        });
      });

      // Add current user message
      messages.push({ role: "user", content: userMessage });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        temperature,
        max_tokens: 500,
      });

      const assistantMessage = response.choices[0].message.content || "";
      
      return {
        message: assistantMessage,
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
