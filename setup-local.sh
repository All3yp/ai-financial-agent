#!/bin/bash
# Local Development Setup Script for AI Financial Agent
# Installs PostgreSQL, creates database, generates secrets, and configures .env

set -e  # Exit on error

echo "🚀 Setting up AI Financial Agent for local development..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install PostgreSQL based on OS
install_postgres() {
    echo -e "${YELLOW}📦 Installing PostgreSQL...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install postgresql@16
            brew services start postgresql@16
        else
            echo -e "${RED}❌ Homebrew not found. Please install Homebrew first: https://brew.sh${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux (Ubuntu/Debian)
        if command_exists apt; then
            sudo apt update
            sudo apt install -y postgresql-16 postgresql-client-16
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        elif command_exists dnf; then
            sudo dnf install -y postgresql16 postgresql16-server
            sudo postgresql-setup --initdb
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        elif command_exists pacman; then
            sudo pacman -S postgresql
            sudo -u postgres initdb -D /var/lib/postgres/data
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        else
            echo -e "${RED}❌ Unsupported Linux distribution. Please install PostgreSQL 16 manually.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Unsupported OS: $OSTYPE${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ PostgreSQL installed${NC}"
}

# Check and install PostgreSQL
if ! command_exists psql; then
    install_postgres
else
    echo -e "${GREEN}✅ PostgreSQL already installed${NC}"
fi

# Create database and user
echo -e "${YELLOW}🗄️  Setting up database...${NC}"

DB_NAME="ai_financial_agent"
DB_USER="postgres"
DB_PASS="postgres"

# Create database if it doesn't exist
if psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo -e "${GREEN}✅ Database '$DB_NAME' already exists${NC}"
else
    createdb -U "$DB_USER" "$DB_NAME"
    echo -e "${GREEN}✅ Database '$DB_NAME' created${NC}"
fi

# Generate AUTH_SECRET
echo -e "${YELLOW}🔐 Generating AUTH_SECRET...${NC}"
AUTH_SECRET=$(openssl rand -base64 32)
echo -e "${GREEN}✅ AUTH_SECRET generated${NC}"

# Clean up .env file
echo -e "${YELLOW}🧹 Cleaning up .env file...${NC}"

cat > .env << EOF
# AI Financial Agent - Local Development Configuration
# Generated on $(date)

# ============================================
# REQUIRED - Core Configuration
# ============================================

# NextAuth.js - Session encryption (auto-generated)
AUTH_SECRET=$AUTH_SECRET

# OpenAI-compatible Provider (OpenRouter configured)
OPENAI_API_KEY=
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_PROVIDER_NAME=openrouter

# Database - Local PostgreSQL
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/ai_financial_agent

# ============================================
# OPTIONAL - External Services
# ============================================

# Financial Datasets API (for financial tools)
# Get key at: https://financialdatasets.ai/
FINANCIAL_DATASETS_API_KEY=

# LangSmith Tracing (for observability)
# Get key at: https://smith.langchain.com/
LANGCHAIN_API_KEY=
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=ai-financial-agent

# Vercel Blob Storage (for file uploads)
# Created automatically when deploying to Vercel
BLOB_READ_WRITE_TOKEN=
EOF

echo -e "${GREEN}✅ .env file cleaned and configured${NC}"

# Install npm dependencies
echo -e "${YELLOW}📦 Installing npm dependencies...${NC}"
pnpm install
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Run database migrations
echo -e "${YELLOW}🔄 Running database migrations...${NC}"
pnpm db:migrate
echo -e "${GREEN}✅ Migrations completed${NC}"

# Final summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Local setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. Edit .env and add your API keys:"
echo "   - OPENAI_API_KEY (your OpenRouter key)"
echo "   - FINANCIAL_DATASETS_API_KEY (optional)"
echo "   - LANGCHAIN_API_KEY (optional)"
echo ""
echo "2. Start the development server:"
echo -e "   ${GREEN}pnpm dev${NC}"
echo ""
echo "3. Open http://localhost:3000"
echo ""
echo -e "${YELLOW}📝 Database info:${NC}"
echo "   - Host: localhost:5432"
echo "   - Database: ai_financial_agent"
echo "   - User: postgres"
echo "   - Password: postgres"
echo ""
echo -e "${YELLOW}🔧 Useful commands:${NC}"
echo "   - View logs: pnpm dev"
echo "   - Reset DB: dropdb -U postgres ai_financial_agent && createdb -U postgres ai_financial_agent && pnpm db:migrate"
echo "   - PostgreSQL shell: psql -U postgres -d ai_financial_agent"