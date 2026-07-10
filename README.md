# TOEIC Vocab Coach

Personalized TOEIC vocabulary learning app that identifies your weak spots and helps you review smarter using RAG (Retrieval-Augmented Generation).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    apps/web                         │
│              (Next.js App Router)                   │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  /quiz   │  │ /review  │  │  /api/explain    │  │
│  │  page    │  │  page    │  │  (RAG endpoint)  │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                 │            │
├───────┼──────────────┼─────────────────┼────────────┤
│       ▼              ▼                 ▼            │
│  ┌─────────────┐         ┌──────────────────┐       │
│  │ @repo/db    │         │    @repo/ai      │       │
│  │             │         │                  │       │
│  │ • models    │         │ • embeddings     │       │
│  │ • seed      │         │ • vector search  │       │
│  │ • client    │         │ • RAG explain    │       │
│  └──────┬──────┘         └────────┬─────────┘       │
│         │                        │                  │
│         ▼                        ▼                  │
│  ┌──────────────────────────────────────────┐       │
│  │     MongoDB Atlas Local (Docker)          │       │
│  │  • Document store (vocab, user stats)     │       │
│  │  • Vector Search (semantic similarity)    │       │
│  └──────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

## Features

- **Vocab Quiz** — test yourself across 10 TOEIC business categories
- **Weakness Detection** — tracks per-word and per-category accuracy
- **AI Explanations** — RAG-powered explanations for confused word pairs (e.g., invoice vs receipt)
- **Daily Review** — prioritized word review based on weakness scoring
- **Smart Seeding** — bulk upsert with `canonicalWord` unique index to prevent duplicates

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | MongoDB with Atlas Vector Search |
| AI/RAG | Google Gemini (Embeddings + LLM) |
| Monorepo | Turborepo + pnpm |
| Dev Infra | Docker Compose (`mongodb-atlas-local`) |

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker

### Setup

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/toeic-vocab-coach.git
cd toeic-vocab-coach
pnpm install

# 2. Start MongoDB
docker compose up -d

# 3. Set up environment
cp .env.example .env
# Edit .env with your OpenAI API key

# 4. Seed the vocab database
pnpm seed

# 5. Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
toeic-vocab-coach/
├── apps/
│   └── web/                    # Next.js App Router
│       ├── app/
│       │   ├── page.tsx              # Landing page
│       │   ├── quiz/page.tsx         # Quiz flow
│       │   ├── review/page.tsx       # Daily review
│       │   └── api/
│       │       ├── vocab/route.ts    # Vocab CRUD
│       │       ├── quiz/route.ts     # Quiz questions & answers
│       │       └── explain/route.ts  # RAG explanation
│       └── ...
├── packages/
│   ├── db/                     # MongoDB client & models
│   │   └── src/
│   │       ├── client.ts             # Connection helper
│   │       ├── models/               # TypeScript types
│   │       └── seed/                 # Bulk upsert seed script
│   └── ai/                     # RAG & embeddings
│       └── src/
│           ├── embeddings.ts         # OpenAI embedding helper
│           ├── vector-search.ts      # MongoDB $vectorSearch
│           └── explain.ts            # Confused word explainer
├── docker-compose.yml          # MongoDB Atlas Local
├── turbo.json
└── package.json
```

## RAG Flow

```
User gets "invoice" wrong (chose "receipt")
        │
        ▼
  Vector Search: find words related to "invoice receipt"
        │
        ▼
  Retrieved: [invoice, receipt, quotation, refund, billing]
        │
        ▼
  LLM Prompt: "Explain difference between invoice and receipt
               using these related words as context..."
        │
        ▼
  Personalized explanation with Thai + English
```

## Weakness Scoring

```
priorityScore = wrongCount × 4
              + categoryWeakness × 3
              + confusedWordPenalty × 3
              + daysSinceLastReview
              - masteryScore
```

Higher score = review this word first.

## License

MIT
