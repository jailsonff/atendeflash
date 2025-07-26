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
    
    // Restore active WhatsApp connections on server startup - CRITICAL for consistency
    setTimeout(async () => {
      try {
        log('🔄 INICIANDO RESTAURAÇÃO DE CONEXÕES WHATSAPP...');
        const connections = await storage.getWhatsappConnections();
        const persistentConnections = connections.filter(conn => {
          try {
            if (!conn.sessionData) return false;
            const sessionData = JSON.parse(conn.sessionData);
            return sessionData.persistent === true && conn.status === 'connected';
          } catch {
            return false;
          }
        });
        
        if (persistentConnections.length > 0) {
          log(`📱 Encontradas ${persistentConnections.length} conexões WhatsApp para restaurar...`);
          
          for (const connection of persistentConnections) {
            try {
              log(`🔗 Restaurando: ${connection.name} (${connection.phoneNumber})`);
              await baileysWhatsAppService.restoreSession(connection.id);
              log(`✅ Conexão ${connection.name} restaurada com sucesso!`);
            } catch (error) {
              console.error(`❌ Falha ao restaurar ${connection.id}:`, error);
              // Keep as connected - don't mark as disconnected to preserve user data
              log(`⚠️  Mantendo ${connection.name} como conectada para nova tentativa`);
            }
          }
        } else {
          log('📝 Nenhuma conexão persistente encontrada para restaurar');
        }
      } catch (error) {
        console.error('❌ Erro crítico na restauração de conexões:', error);
      }
    }, 5000); // Wait 5 seconds after server startup
  });
})();
