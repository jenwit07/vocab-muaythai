# CLAUDE.md

## Project

Vocab Bubble Pop — TOEIC vocabulary game with solo, multiplayer, and ranked online modes. Uses RAG (MongoDB Vector Search + Gemini) for AI-powered explanations.

## Tech Stack

- **Frontend**: Next.js 15 App Router, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Atlas Vector Search (mongodb-atlas-local Docker image)
- **AI/RAG**: Google Gemini (gemini-embedding-001 for embeddings, gemini-flash-latest for LLM)
- **WebSocket**: Game server for multiplayer + ranked matchmaking (@repo/ws)
- **Monorepo**: Turborepo + pnpm workspaces

## Commands

- `pnpm install` - Install all dependencies
- `pnpm dev` - Start all servers (Next.js + WebSocket game server)
- `pnpm seed` - Seed vocab data into MongoDB (bulk upsert)
- `docker compose up -d` - Start MongoDB Atlas Local

## Structure

- `apps/web/` - Next.js app (@repo/web)
- `packages/db/` - MongoDB client, models, seed scripts (@repo/db)
- `packages/ai/` - Embeddings, vector search, RAG explain (@repo/ai)
- `packages/ws/` - WebSocket game server: rooms, matchmaking, ranked ELO (@repo/ws)

## Key Pages

- `/` - Game menu (fullscreen, game-first)
- `/game` - Solo bubble pop (60s)
- `/game/online` - Ranked matchmaking with ELO
- `/game/multi` - Private room with friends
- `/explore` - Vector-projected bubble map
- `/quiz` - English→Thai quiz with AI explain
- `/dashboard` - Stats + weakness tracking
- `/learn` - Confusion clusters + AI mini-lessons
- `/review` - Priority-scored weak word review

## Conventions

- Workspace packages use `@repo/` prefix
- Vocab words use `canonicalWord` (lowercase trimmed) as unique key
- Seed uses bulkWrite upsert to skip existing words
- ESM modules throughout (`"type": "module"`)
- Fullscreen pages hide nav via `useFullscreen()` hook
- White/light theme throughout
