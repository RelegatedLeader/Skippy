#!/usr/bin/env bash
# Skippy — Launch Script (Mac/Linux)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         SKIPPY — Personal AI         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Load .env if it exists
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs) 2>/dev/null || true
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js not found."
  echo "Install from https://nodejs.org or via your package manager."
  exit 1
fi

# Warn if no API key
if [ -z "$GROK_API_KEY" ]; then
  echo "WARNING: GROK_API_KEY not set."
  echo "Create a .env file with: GROK_API_KEY=your_key_here"
  echo ""
fi

# First run: build if needed
if [ ! -d ".next" ]; then
  echo "First run — building Skippy (takes 1-2 minutes)..."
  npm install
  npm run build
  echo ""
fi

# Initialize database if needed
if [ ! -f "prisma/skippy.db" ]; then
  echo "Initializing database..."
  npm run db:push
  echo ""
fi

export PORT=3747
export HOSTNAME=127.0.0.1
export NODE_ENV=production
export DATABASE_URL="file:${SCRIPT_DIR}/prisma/skippy.db"

echo "Starting Skippy server..."
node server-standalone.js &
SERVER_PID=$!

# Wait for server
echo "Waiting for server..."
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s "http://127.0.0.1:3747" > /dev/null 2>&1; then
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "ERROR: Server failed to start within ${MAX_WAIT} seconds."
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# Open browser
echo "Opening Skippy in your browser..."
if command -v open &> /dev/null; then
  open "http://127.0.0.1:3747"
elif command -v xdg-open &> /dev/null; then
  xdg-open "http://127.0.0.1:3747"
elif command -v gnome-open &> /dev/null; then
  gnome-open "http://127.0.0.1:3747"
fi

echo ""
echo "✓ Skippy is running at http://127.0.0.1:3747"
echo "  (PID: $SERVER_PID)"
echo "  Press Ctrl+C to stop."
echo ""

# Keep running until killed
wait $SERVER_PID
