#!/bin/bash

# Script de Deploy para o projeto Aquecedor Turbo em uma VPS Ubuntu 22.04
# Garante que o script pare se qualquer comando falhar
set -e

# --- Variáveis (ajuste se necessário) ---
REPO_URL="https://github.com/jailsonff/atendeflash.git"
PROJECT_DIR="atendeflash"
NODE_VERSION="20"

echo "🚀 Iniciando o deploy do Aquecedor Turbo..."

# --- 1. ATUALIZAÇÃO E DEPENDÊNCIAS DO SISTEMA ---
echo "
🔄 Atualizando pacotes do sistema..."
sudo apt-get update && sudo apt-get upgrade -y

echo "
🛠️ Instalando dependências essenciais (git, curl, postgresql)..."
sudo apt-get install -y git curl postgresql postgresql-contrib

# --- 2. INSTALAÇÃO DO NODE.JS ---
echo "
📦 Instalando Node.js v$NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | sudo -E bash -
sudo apt-get install -y nodejs

# --- 3. CLONAR O REPOSITÓRIO ---
echo "
📥 Clonando o projeto de $REPO_URL..."
if [ -d "$PROJECT_DIR" ]; then
  echo "Diretório do projeto já existe. Pulando clone."
else
  git clone $REPO_URL
fi
cd $PROJECT_DIR

# --- 4. INSTALAR DEPENDÊNCIAS DO PROJETO ---
echo "
⚙️ Instalando dependências do projeto com npm..."
npm install

# --- 5. CONFIGURAR O AMBIENTE (.env) ---
echo "
🔑 Configurando o arquivo de ambiente .env..."
# ATENÇÃO: Você precisará criar um usuário e senha no PostgreSQL.
# Exemplo de comandos para isso (rode manualmente no terminal do psql):
# CREATE DATABASE atendeflash;
# CREATE USER atendeflash_user WITH ENCRYPTED PASSWORD 'SUA_SENHA_FORTE_AQUI';
# GRANT ALL PRIVILEGES ON DATABASE atendeflash TO atendeflash_user;

DATABASE_URL_VALUE="postgresql://atendeflash_user:SUA_SENHA_FORTE_AQUI@localhost:5432/atendeflash"

if [ ! -f ".env" ]; then
  echo "DATABASE_URL=$DATABASE_URL_VALUE" > .env
  echo "
✅ Arquivo .env criado. IMPORTANTE: Edite-o com sua senha real do banco de dados!"
else
  echo "Arquivo .env já existe. Verifique se está correto."
fi

# --- 6. SINCRONIZAR O BANCO DE DADOS ---
echo "
🗄️ Sincronizando o esquema do banco de dados com Drizzle..."
npm run db:push

# --- 7. BUILDAR A APLICAÇÃO ---
echo "
🏗️  Buildando a aplicação para produção..."
npm run build

# --- 8. CONFIGURAR E INICIAR COM PM2 ---
echo "
🚀 Configurando o PM2 para manter a aplicação online..."
sudo npm install pm2 -g
pm2 start dist/index.js --name aquecedor-turbo

# Configura o PM2 para iniciar com o sistema
pm2 startup
# O comando acima pode retornar um comando que você precisa copiar e colar. Execute-o.
pm2 save

echo "

🎉 Deploy concluído com sucesso! 🎉"
echo "Sua aplicação está rodando em segundo plano gerenciada pelo PM2."
echo "Para ver os logs, use o comando: pm2 logs aquecedor-turbo"
echo "Para monitorar o status, use: pm2 status"
