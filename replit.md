# Replit.md - Aquecedor Turbo

## Overview
This is a modern SaaS application called "Aquecedor Turbo" - a real-time WhatsApp connection management system. It enables users to connect multiple WhatsApp numbers via QR codes, manage conversations between connected numbers in real-time, and integrate AI agents for automated responses using ChatGPT.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter (lightweight React router)
- **Build Tool**: Vite for development and bundling
- **UI Theme**: Dark theme with custom turquoise and fluorescent pink accent colors

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Real-time Communication**: WebSocket server for live updates
- **External APIs**: OpenAI GPT-4o integration for AI agents

### Key Components

#### Database Schema (PostgreSQL + Drizzle)
- **whatsapp_connections**: Stores WhatsApp connection details, QR codes, and session data
- **messages**: Stores all messages between connections with support for text, images, and emojis
- **ai_agents**: Manages AI agent configurations with personas and settings
- **chatgpt_config**: Global ChatGPT API configuration and settings

#### Real-time Features
- WebSocket server at `/ws` endpoint for live updates
- Real-time message synchronization between connected WhatsApp numbers
- Live QR code generation and connection status updates
- Instant notifications for connection events

#### WhatsApp Integration
- Placeholder service for WhatsApp connectivity (designed for WPPConnect, Baileys, or Venom-bot)
- QR code generation for device pairing
- Session management and persistence
- Message sending/receiving capabilities

#### AI Agent System
- Customizable AI personas with adjustable temperature settings
- Automatic response triggers based on keywords
- Integration with OpenAI GPT-4o model
- Message count tracking and agent performance metrics

## Data Flow

1. **Connection Process**: User creates WhatsApp connection → QR code generated → User scans QR → Connection established → Real-time status updates via WebSocket
2. **Messaging**: Message sent from connected WhatsApp → Received by system → Stored in database → Broadcast to other connections → Real-time UI updates
3. **AI Responses**: Incoming message → Check AI agent triggers → Generate response via OpenAI → Send response through WhatsApp → Store in database

## External Dependencies

### Production Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL driver
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Headless UI components foundation
- **drizzle-orm**: Type-safe SQL ORM
- **ws**: WebSocket implementation
- **openai**: Official OpenAI API client
- **express**: Web framework

### Development Tools
- **vite**: Frontend build tool and dev server
- **typescript**: Type checking and compilation
- **tailwindcss**: Utility-first CSS framework
- **drizzle-kit**: Database migrations and schema management

## Deployment Strategy

### Build Process
1. Frontend: Vite builds React app to `dist/public`
2. Backend: esbuild compiles TypeScript server to `dist/index.js`
3. Database: Drizzle migrations applied via `db:push` command

### Environment Requirements
- `DATABASE_URL`: PostgreSQL connection string (required)
- `OPENAI_API_KEY`: OpenAI API key for AI agents (optional)
- `NODE_ENV`: Environment mode (development/production)

### Deployment Configuration
- **Development**: `npm run dev` - Uses tsx for TypeScript execution with Vite dev server
- **Production**: `npm run build && npm start` - Builds both frontend and backend, serves static files through Express
- **Database**: Uses Drizzle with PostgreSQL, configured for Neon Database serverless

### Special Features
- Replit-specific configurations for development environment
- WebSocket support for real-time features
- Font Awesome icons integration
- Responsive design with mobile support
- Error boundary and runtime error handling in development