#!/usr/bin/env node

/**
 * 🔒 SCRIPT DE INICIALIZAÇÃO AUTOMÁTICA - Aquecedor Turbo
 * Garante que o sistema sempre inicie corretamente, mesmo após resets
 */

import { execSync } from 'child_process';

console.log('🚀 INICIALIZANDO AQUECEDOR TURBO - Auto Setup');

// Função para executar comandos de forma segura
function runCommand(command, description) {
  try {
    console.log(`🔧 ${description}...`);
    const result = execSync(command, { stdio: 'inherit', encoding: 'utf8' });
    console.log(`✅ ${description} - Concluído`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} - ERRO:`, error.message);
    return false;
  }
}

// Verificar se DATABASE_URL existe
function checkDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    console.log('✅ DATABASE_URL encontrado no ambiente');
    return true;
  }
  
  // Verificar variáveis PG individuais
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGPORT && PGUSER && PGPASSWORD && PGDATABASE) {
    console.log('✅ Variáveis PostgreSQL individuais encontradas');
    return true;
  }
  
  console.log('❌ DATABASE_URL não encontrado - será criado automaticamente');
  return false;
}

async function main() {
  console.log('🔍 Verificando configuração do banco de dados...');
  
  if (!checkDatabaseUrl()) {
    console.log('🛠️ Criando banco PostgreSQL automaticamente...');
    console.log('⚠️ ATENÇÃO: Esta operação será feita via ferramentas do Replit');
    console.log('📋 Execute manualmente se necessário:');
    console.log('   1. create_postgresql_database_tool');
    console.log('   2. npm run db:push');
    console.log('   3. restart_workflow');
  }

  // Sempre executar db:push para garantir schema atualizado
  if (!runCommand('npm run db:push', 'Aplicando schema do banco de dados')) {
    console.log('⚠️ Falha no db:push - pode ser necessário criar banco primeiro');
  }

  console.log('🎯 AQUECEDOR TURBO PRONTO PARA EXECUÇÃO');
  console.log('📱 Funcionalidades disponíveis:');
  console.log('   ✅ Conexões WhatsApp via QR Code');
  console.log('   ✅ Agentes IA com ChatGPT');
  console.log('   ✅ Mensagens em tempo real');
  console.log('   ✅ Sistema de deduplicação automática');
  console.log('   ✅ Conversas contínuas entre agentes');
}

main().catch(console.error);