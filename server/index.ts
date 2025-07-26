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
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // 🔒 SISTEMA DE RESTAURAÇÃO PERMANENTE - CONEXÕES NUNCA SERÃO PERDIDAS
    setTimeout(async () => {
      try {
        log('🚀 INICIANDO RESTAURAÇÃO PERMANENTE DE CONEXÕES WHATSAPP...');
        const connections = await storage.getWhatsappConnections();
        
        // Busca TODAS as conexões que foram conectadas alguma vez
        const permanentConnections = connections.filter(conn => {
          try {
            if (!conn.sessionData) return false;
            const sessionData = JSON.parse(conn.sessionData);
            // Restaura qualquer conexão que já foi conectada (persistent OU permanent)
            return (sessionData.persistent === true || sessionData.permanent === true) && 
                   (conn.status === 'connected' || sessionData.authState === 'connected');
          } catch {
            // Se já teve phoneNumber, significa que foi conectada antes
            return conn.phoneNumber && conn.phoneNumber !== 'null';
          }
        });
        
        if (permanentConnections.length > 0) {
          log(`🔒 RESTAURANDO ${permanentConnections.length} CONEXÕES PERMANENTES...`);
          
          for (const connection of permanentConnections) {
            try {
              log(`🔄 RESTAURANDO PERMANENTE: ${connection.name} (${connection.phoneNumber || 'Sem número'})`);
              
              // Força o status como conectado antes da restauração
              await storage.updateWhatsappConnection(connection.id, { 
                status: 'connected',
                lastSeen: new Date()
              });
              
              await baileysWhatsAppService.restoreSession(connection.id);
              log(`✅ CONEXÃO PERMANENTE RESTAURADA: ${connection.name}`);
            } catch (error) {
              console.error(`⚠️  Erro na restauração de ${connection.id}:`, error);
              // NUNCA marca como desconectada - mantém como conectada sempre
              log(`🔒 MANTENDO ${connection.name} COMO CONECTADA (tentativa contínua)`);
              
              // Agenda nova tentativa em 30 segundos
              setTimeout(async () => {
                try {
                  log(`🔄 NOVA TENTATIVA: ${connection.name}`);
                  await baileysWhatsAppService.restoreSession(connection.id);
                } catch (retryError) {
                  console.error(`Retry failed for ${connection.id}:`, retryError);
                }
              }, 30000);
            }
          }
        } else {
          log('📝 Nenhuma conexão permanente encontrada para restaurar');
        }
      } catch (error) {
        console.error('❌ ERRO CRÍTICO na restauração permanente:', error);
      }
    }, 3000); // Inicia em 3 segundos
  });
})();
