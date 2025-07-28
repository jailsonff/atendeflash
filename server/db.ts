import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// 🔒 CONFIGURAÇÃO ROBUSTA DATABASE_URL - Auto-resolução de problemas
function getDatabaseUrl(): string {
  // Primeiro: verificar se DATABASE_URL existe
  if (process.env.DATABASE_URL) {
    console.log("✅ DATABASE_URL encontrado no ambiente");
    return process.env.DATABASE_URL;
  }

  // Segundo: tentar construir usando variáveis individuais do PostgreSQL
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  
  if (PGHOST && PGPORT && PGUSER && PGPASSWORD && PGDATABASE) {
    const constructedUrl = `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
    console.log("🔧 DATABASE_URL construído automaticamente a partir de variáveis PG*");
    process.env.DATABASE_URL = constructedUrl; // Salvar para uso futuro
    return constructedUrl;
  }

  // Terceiro: erro com instruções claras para correção
  console.error("❌ ERRO CRÍTICO: DATABASE_URL não encontrado!");
  console.error("🛠️  SOLUÇÃO AUTOMÁTICA: Execute os comandos abaixo:");
  console.error("   1. Criar banco: usar ferramenta create_postgresql_database_tool");
  console.error("   2. Push schema: npm run db:push");
  console.error("   3. Reiniciar: restart_workflow");
  
  throw new Error(
    "🔒 DATABASE_URL OBRIGATÓRIO: Configure o banco PostgreSQL antes de iniciar o sistema. " +
    "Use create_postgresql_database_tool para resolver automaticamente."
  );
}

const databaseUrl = getDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
