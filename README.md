# Vocab Bubble Pop

Learn TOEIC vocabulary by popping bubbles — solo, vs friends, or ranked online. Powered by RAG (MongoDB Vector Search + Google Gemini) for AI-generated lessons from your mistakes.

## Game Modes

| Mode | Description |
|------|-------------|
| **Solo** | 60s bubble pop — tap bubbles, pick Thai meanings, build combos |
| **Play Online** | Ranked matchmaking by ELO rating — race against a matched opponent |
| **VS Friend** | Private room with 4-digit code — same board, race to answer |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     apps/web (Next.js 15)                │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │  / game  │ │ /explore │ │  /quiz   │ │ /dashboard │  │
│  │  modes   │ │ bubble   │ │ eng→thai │ │  stats +   │  │
│  │  solo    │ │ map      │ │ + AI     │ │  weakness  │  │
│  │  online  │ │ (PCA)    │ │ explain  │ │  tracking  │  │
│  │  multi   │ │          │ │          │ │            │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       │             │            │              │         │
├───────┼─────────────┼────────────┼──────────────┼─────────┤
│       ▼             ▼            ▼              ▼         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ @repo/ws │  │ @repo/ai │  │ @repo/db │                │
│  │ WebSocket│  │ Gemini   │  │ MongoDB  │                │
│  │ server   │  │ embed +  │  │ client + │                │
│  │ rooms +  │  │ vector   │  │ models + │                │
│  │ matchmkg │  │ search + │  │ seed     │                │
│  │ + ELO    │  │ RAG      │  │          │                │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                │
│       │              │             │                      │
│       ▼              ▼             ▼                      │
│  ┌─────────────────────────────────────────────────┐      │
│  │          MongoDB Atlas Local (Docker)            │      │
│  │  • 150 vocab words with 3072d embeddings        │      │
│  │  • Atlas Vector Search (cosine similarity)      │      │
│  │  • User stats (word accuracy, category scores)  │      │
│  └─────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

## Features

### Game
- **Bubble Pop** — bubbles float with English words, tap to answer Thai meaning
- **Difficulty scoring** — Easy (+10), Medium (+25), Hard (+50) with combo multiplier up to x5
- **Wrong = penalty + bubble removed** — think before you tap
- **Flash explanation** — correct answer flashes on screen when wrong
- **Post-game RAG lesson** — "Why did I miss these?" generates AI lesson from mistakes

### Multiplayer
- **VS Friend** — create room, share 4-digit code, same board, race to pop
- **Play Online** — ELO-based matchmaking, rank tiers (Bronze → Diamond)
- **Real-time sync** — WebSocket server, first correct answer wins the bubble

### Learning
- **Explore** — vector-projected bubble map, words positioned by semantic similarity
- **Quiz** — English→Thai with difficulty/category filters, AI explain on wrong
- **Learn** — confusion cluster detection + RAG mini-lessons
- **Dashboard** — category weakness tracking, suggested focus areas
- **Review** — priority-scored weak word list

### RAG (Retrieval-Augmented Generation)
- **Vector Search** — finds semantically related words from 150-word vocab bank
- **Gemini LLM** — generates personalized lessons using retrieved context
- **Used in**: game result lessons, quiz explanations, confusion clusters, explore positioning

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | MongoDB with Atlas Vector Search |
| AI/RAG | Google Gemini (embedding-001 + flash-latest) |
| Multiplayer | WebSocket server (ws) with ELO matchmaking |
| Monorepo | Turborepo + pnpm workspaces |
| Dev Infra | Docker Compose (mongodb-atlas-local) |

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker

### Setup

```bash
# 1. Clone and install
git clone https://github.com/jenwit07/vocab-muaythai.git
cd vocab-muaythai
pnpm install

# 2. Start MongoDB
docker compose up -d

# 3. Set up environment
cp .env.example .env
# Edit .env — add your Gemini API key

# 4. Seed vocab + generate embeddings + create indexes
cd packages/db
pnpm seed
pnpm embeddings
pnpm indexes
cd ../..

# 5. Start dev servers (Next.js + WebSocket)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
vocab-muaythai/
├── apps/
│   └── web/                        # Next.js App Router
│       ├── app/
│       │   ├── page.tsx                  # Game menu (homepage)
│       │   ├── game/
│       │   │   ├── page.tsx              # Solo bubble pop
│       │   │   ├── online/page.tsx       # Ranked matchmaking
│       │   │   └── multi/page.tsx        # VS Friend (room code)
│       │   ├── explore/page.tsx          # Vector bubble map
│       │   ├── quiz/page.tsx             # English→Thai quiz
│       │   ├── dashboard/page.tsx        # Stats + weakness
│       │   ├── learn/page.tsx            # Confusion clusters + AI lessons
│       │   ├── review/page.tsx           # Weak word review
│       │   └── api/
│       │       ├── vocab/route.ts        # Vocab CRUD
│       │       ├── quiz/route.ts         # Quiz questions + submit
│       │       ├── explain/route.ts      # RAG word explanation
│       │       ├── lessons/route.ts      # RAG lesson generation
│       │       ├── clusters/route.ts     # Confusion cluster detection
│       │       ├── dashboard/route.ts    # Stats aggregation
│       │       ├── review/route.ts       # Weak word ranking
│       │       └── explore/route.ts      # PCA projection + collision
│       └── ...
├── packages/
│   ├── db/                         # @repo/db — MongoDB
│   │   └── src/
│   │       ├── client.ts                 # Connection (directConnection)
│   │       ├── models/                   # VocabWord, UserStats types
│   │       └── seed/
│   │           ├── run.ts                # Bulk upsert seed
│   │           ├── generate-embeddings.ts # Gemini embeddings
│   │           ├── create-indexes.ts     # Vector search index
│   │           ├── vocab-data.json       # 99 base words
│   │           └── vocab-hard.json       # 51 hard words
│   ├── ai/                         # @repo/ai — RAG
│   │   └── src/
│   │       ├── embeddings.ts             # Gemini embedding API
│   │       ├── vector-search.ts          # MongoDB $vectorSearch
│   │       └── explain.ts               # Confused word explainer
│   └── ws/                         # @repo/ws — Game Server
│       └── src/
│           └── server.ts                 # WebSocket: rooms, matchmaking, ELO
├── docker-compose.yml              # MongoDB Atlas Local
├── turbo.json
└── package.json
```

## RAG Flow

```
Player pops "invoice" bubble → answers wrong
        │
        ▼  Game over → clicks "✨ Why did I miss these?"
        │
        ▼  POST /api/lessons { words: [invoice, receipt] }
        │
        ▼  R: Vector Search → finds related words
        │     [transaction, quotation, refund, remittance, consignment]
        │
        ▼  G: Gemini generates lesson using retrieved context
        │     "invoice ส่งไปพร้อม consignment..."
        │     "ตรวจสอบเพื่อป้องกัน discrepancy..."
        │
        ▼  Fullscreen lesson with related word pills
```

## Ranking System

| Rating | Rank | Badge |
|--------|------|-------|
| 0–599 | Bronze | 🥉 |
| 600–999 | Silver | 🥈 |
| 1000–1399 | Gold | 🥇 |
| 1400–1799 | Platinum | 💎 |
| 1800+ | Diamond | 👑 |

ELO-based: beat higher-rated player = more points, lose to lower-rated = bigger penalty.

## License

MIT
