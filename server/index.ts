import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { baileysWhatsAppService } from "./services/baileys-whatsapp";
import { storage } from "./storage";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 3000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '8080', 10);
  server.listen({
    port,
    host: "127.0.0.1",
  }, async () => {
    log(`serving on port ${port}`);
    
    // 🔒 INICIALIZAÇÃO COM PRESERVAÇÃO DE CONVERSAS ATIVAS
    setTimeout(async () => {
      try {
        log('🔒 RESTAURAÇÃO AUTOMÁTICA DESABILITADA - Prevenção de conflitos ativada');
        
        // ✅ PRESERVAÇÃO PERMANENTE: Conversas iniciadas NUNCA são desativadas
        await storage.preserveActiveConversationsOnRestart();
        await storage.ensureConversationsPermanentlyActive();
        
        const connections = await storage.getWhatsappConnections();
        
        // RESETAR STATUS PARA FORÇAR CONEXÃO MANUAL (mas preservar conversas)
        for (const connection of connections) {
          await storage.updateWhatsappConnection(connection.id, { 
            status: 'disconnected',
            lastSeen: new Date()
          });
        }
        
        log(`🧹 Status de ${connections.length} conexões resetado para desconectado`);
        log('ℹ️ Para conectar: Use os botões "Conectar" na interface web');
        log('🎯 Isso previne conflitos de stream entre múltiplas contas WhatsApp');
        log('✅ Sistema pronto para conexões manuais sem conflitos');
      } catch (error) {
        console.error('❌ ERRO CRÍTICO na restauração permanente:', error);
      }
    }, 3000); // Inicia em 3 segundos

    // 🔒 SISTEMA DE MONITORAMENTO PERMANENTE DE CONVERSAS (executa a cada 30 segundos)
    setTimeout(() => {
      log('🔒 SISTEMA DE MONITORAMENTO PERMANENTE DE CONVERSAS INICIADO');
      
      setInterval(async () => {
        try {
          await storage.ensureConversationsPermanentlyActive();
        } catch (error) {
          console.error('❌ ERRO no monitoramento de conversas:', error);
        }
      }, 30 * 1000); // A cada 30 segundos
    }, 5000); // Inicia em 5 segundos
  });
})();
