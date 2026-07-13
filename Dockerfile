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

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/ai/node_modules ./packages/ai/node_modules
COPY --from=deps /app/packages/ws/node_modules ./packages/ws/node_modules

COPY . .

# Build Next.js
RUN pnpm --filter @repo/web build

# --- Stage 3: Production runner ---
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

ENV NODE_ENV=production

# Copy built Next.js app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy WebSocket server source + deps
COPY --from=deps /app/packages/ws/node_modules ./packages/ws/node_modules
COPY packages/ws/src ./packages/ws/src
COPY packages/ws/package.json ./packages/ws/
COPY packages/ws/tsconfig.json ./packages/ws/

# Copy seed scripts + data (for initial setup)
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY packages/db/src ./packages/db/src
COPY packages/db/package.json ./packages/db/
COPY packages/db/tsconfig.json ./packages/db/

# Copy AI package
COPY packages/ai/src ./packages/ai/src
COPY packages/ai/package.json ./packages/ai/

# Install tsx for WS server + seed scripts
RUN npm install -g tsx

# Start script
COPY deploy/start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 3000 3333

CMD ["./start.sh"]
