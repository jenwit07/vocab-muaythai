# --- Stage 1: Install dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/ws/package.json packages/ws/

RUN pnpm install --frozen-lockfile

# --- Stage 2: Build Next.js ---
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY --from=deps /app/ ./
COPY . .

# Build Next.js
RUN pnpm --filter @repo/web build

# --- Stage 3: Production runner ---
FROM node:22-alpine AS runner
RUN npm install -g tsx
WORKDIR /app

ENV NODE_ENV=production

# Copy everything from builder (includes node_modules + built .next)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy all packages with their node_modules for seed + ws + ai
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/ ./packages/
COPY packages/ ./packages/

# Start script
COPY deploy/start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 3000 3333

CMD ["./start.sh"]
