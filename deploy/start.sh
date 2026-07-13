#!/bin/sh
set -e

echo "Starting WebSocket game server..."
cd /app/packages/ws
tsx src/server.ts &

echo "Starting Next.js..."
cd /app
node apps/web/server.js &

wait
