#!/bin/bash
# ============================================
# Vocab Bubble Pop — DigitalOcean Deploy Script
# Run this on a fresh Ubuntu 22.04+ Droplet
# ============================================
set -e

echo "=== 1. Install Docker ==="
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo "Docker installed. Log out and back in, then re-run this script."
  exit 0
fi

echo "=== 2. Clone repo ==="
if [ ! -d "vocab-muaythai" ]; then
  git clone https://github.com/jenwit07/vocab-muaythai.git
fi
cd vocab-muaythai

echo "=== 3. Set up environment ==="
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "!!! EDIT .env and set your GEMINI_API_KEY !!!"
  echo "Run: nano .env"
  echo "Then re-run this script."
  exit 1
fi

echo "=== 4. Build and start ==="
docker compose -f docker-compose.prod.yml up -d --build

echo "=== 5. Wait for MongoDB to be ready ==="
echo "Waiting 15s for MongoDB..."
sleep 15

echo "=== 6. Seed database ==="
docker compose -f docker-compose.prod.yml exec app sh -c "
  cd /app/packages/db && \
  tsx src/seed/run.ts && \
  tsx src/seed/generate-embeddings.ts && \
  tsx src/seed/create-indexes.ts
"

echo ""
echo "============================================"
echo "  Vocab Bubble Pop is running!"
echo "  http://$(curl -s ifconfig.me)"
echo "============================================"
