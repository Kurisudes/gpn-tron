#!/bin/bash

# --- CONFIGURATION ---
# Load configuration from external file
source "$(dirname "$0")/deploy.config"

# --- 1. STOP DOCKER ---
echo "🛑 Stopping old containers..."

ssh -t $NAS_USER@$NAS_HOST "cd $REMOTE_DIR && sudo /usr/local/bin/docker-compose down"

# --- 2. COPY FILES (RSYNC) ---
echo "🚀 Starting synchronization..."

# NOTE: --rsync-path=/bin/rsync forces the correct path on Synology
rsync -avz --delete \
  --rsync-path=/bin/rsync \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'venv' \
  $LOCAL_DIR/ $NAS_USER@$NAS_HOST:$REMOTE_DIR

# --- 3. RESTART DOCKER ---
echo "🐳 Building and starting new containers..."

ssh -t $NAS_USER@$NAS_HOST "cd $REMOTE_DIR && sudo /usr/local/bin/docker-compose up -d --build"

echo "✅ Done!"