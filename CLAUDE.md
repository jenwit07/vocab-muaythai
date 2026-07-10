# CLAUDE.md

## Project

TOEIC Vocab Coach — personalized TOEIC vocabulary learning app with RAG-powered explanations using MongoDB Vector Search.

## Tech Stack

- **Frontend**: Next.js 15 App Router, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Atlas Vector Search (mongodb-atlas-local Docker image)
- **AI/RAG**: Google Gemini (gemini-embedding-001 for embeddings, gemini-2.0-flash for LLM)
- **Monorepo**: Turborepo + pnpm workspaces

## Commands

- `pnpm install` - Install all dependencies
- `pnpm dev` - Start dev server (Turbopack)
- `pnpm build` - Build all packages and app
- `pnpm seed` - Seed vocab data into MongoDB (bulk upsert)
- `docker compose up -d` - Start MongoDB Atlas Local

## Structure

- `apps/web/` - Next.js app (@repo/web)
- `packages/db/` - MongoDB client, models, seed scripts (@repo/db)
- `packages/ai/` - Embeddings, vector search, RAG explain (@repo/ai)

## Conventions

- Workspace packages use `@repo/` prefix
- Vocab words use `canonicalWord` (lowercase trimmed) as unique key
- Seed uses bulkWrite upsert to skip existing words
- ESM modules throughout (`"type": "module"`)
