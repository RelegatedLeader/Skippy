/**
 * Skippy — Portable Build Script
 *
 * Creates a self-contained directory that can be copied to a USB drive
 * inside a VeraCrypt volume. The result is a folder with:
 *
 *   skippy-portable/
 *   ├── skippy.exe        (Windows) or skippy (Mac/Linux)
 *   ├── prisma/
 *   │   └── schema.prisma
 *   ├── data/             (empty — DB will be created on first run)
 *   ├── .env.example
 *   ├── launch.bat        (Windows launcher)
 *   ├── launch.sh         (Mac/Linux launcher)
 *   └── README-USB.txt
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'skippy-portable')
const NEXT_STANDALONE = path.join(ROOT, '.next', 'standalone')

// Check that Next.js standalone build exists
if (!fs.existsSync(NEXT_STANDALONE)) {
  console.error('ERROR: .next/standalone not found. Run `npm run build` first.')
  console.error('Make sure next.config.js has: output: "standalone"')
  process.exit(1)
}

console.log('Building portable package...\n')

// Clean output directory
if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true })
}
fs.mkdirSync(OUT, { recursive: true })

// Copy Next.js standalone build
console.log('Copying Next.js standalone server...')
copyDir(NEXT_STANDALONE, OUT)

// Copy static files
console.log('Copying static assets...')
const staticSrc = path.join(ROOT, '.next', 'static')
const staticDst = path.join(OUT, '.next', 'static')
if (fs.existsSync(staticSrc)) copyDir(staticSrc, staticDst)

const publicSrc = path.join(ROOT, 'public')
const publicDst = path.join(OUT, 'public')
if (fs.existsSync(publicSrc)) copyDir(publicSrc, publicDst)

// Copy prisma schema
console.log('Copying Prisma schema...')
const prismaDst = path.join(OUT, 'prisma')
fs.mkdirSync(prismaDst, { recursive: true })
fs.copyFileSync(
  path.join(ROOT, 'prisma', 'schema.prisma'),
  path.join(prismaDst, 'schema.prisma')
)

// Copy server entry
console.log('Copying server entry...')
fs.copyFileSync(
  path.join(ROOT, 'server-standalone.js'),
  path.join(OUT, 'server-standalone.js')
)

// Create data directory
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true })

// Create .env.example
fs.writeFileSync(
  path.join(OUT, '.env.example'),
  'GROK_API_KEY=your_grok_api_key_here\n'
)

// Create Windows launcher
const winLauncher = `@echo off
echo Starting Skippy...
set PORT=3747
set HOST=127.0.0.1
set NODE_ENV=production
set DATABASE_URL=file:%~dp0data\\skippy.db

REM Check for .env file
if exist "%~dp0.env" (
  for /f "tokens=1,* delims==" %%a in (%~dp0.env) do (
    if not "%%a"=="" set %%a=%%b
  )
)

REM Start server in background
start /b node server-standalone.js

REM Wait for server and open browser
timeout /t 3 /nobreak >nul
start http://127.0.0.1:3747

echo Skippy is running at http://127.0.0.1:3747
echo Close this window to stop Skippy.
pause
`
fs.writeFileSync(path.join(OUT, 'launch.bat'), winLauncher)

// Create Mac/Linux launcher
const unixLauncher = `#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PORT=3747
export HOST=127.0.0.1
export NODE_ENV=production
export DATABASE_URL="file:$SCRIPT_DIR/data/skippy.db"

# Load .env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

echo "[Skippy] Starting server..."
node server-standalone.js &
SERVER_PID=$!

# Wait for server to be ready
echo "[Skippy] Waiting for server..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:3747" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Open browser
echo "[Skippy] Opening browser..."
if command -v open > /dev/null; then
  open "http://127.0.0.1:3747"
elif command -v xdg-open > /dev/null; then
  xdg-open "http://127.0.0.1:3747"
fi

echo "[Skippy] Running at http://127.0.0.1:3747 (PID: $SERVER_PID)"
echo "[Skippy] Press Ctrl+C to stop."

wait $SERVER_PID
`
fs.writeFileSync(path.join(OUT, 'launch.sh'), unixLauncher)
fs.chmodSync(path.join(OUT, 'launch.sh'), 0o755)

// Create README
const readme = `SKIPPY — PORTABLE USB EDITION
================================

QUICK START
-----------
1. Mount your VeraCrypt volume
2. Copy this folder into the encrypted volume
3. Create a .env file (copy .env.example and fill in your API key):

   GROK_API_KEY=your_key_here

   Get your Grok API key at: https://console.x.ai

4. Run the launcher:
   - Windows: Double-click launch.bat
   - Mac/Linux: Run ./launch.sh in terminal

5. Skippy will open in your browser at http://127.0.0.1:3747

SECURITY
--------
- Server ONLY accepts connections from localhost (127.0.0.1)
- No external connections except to api.x.ai for AI responses
- Your API key lives only inside the encrypted volume
- Database (data/skippy.db) is encrypted by VeraCrypt

VERACRYPT SETUP (Recommended)
------------------------------
1. Download VeraCrypt from veracrypt.fr
2. Create a new encrypted volume on your USB drive
   - Algorithm: AES-256 + Twofish (cascade)
   - Hash: SHA-512
   - Use a strong passphrase (20+ characters)
3. Mount the volume
4. Copy this folder into the mounted volume
5. Always dismount the volume before removing the USB

DATA LOCATION
-------------
  data/skippy.db  — Your conversations, notes, and memories
  .env            — Your API key (create this, never commit it)
`
fs.writeFileSync(path.join(OUT, 'README-USB.txt'), readme)

console.log(`\nPortable build created at: ${OUT}`)
console.log('Files created:')
const files = listFiles(OUT, OUT)
files.forEach(f => console.log('  ' + f))
console.log('\nNext steps:')
console.log('  1. Copy skippy-portable/ to your VeraCrypt USB volume')
console.log('  2. Create a .env file with your GROK_API_KEY')
console.log('  3. Run launch.bat (Windows) or launch.sh (Mac/Linux)')

// Helpers
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}

function listFiles(dir, root) {
  const result = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full)
    if (entry.isDirectory()) {
      result.push(...listFiles(full, root))
    } else {
      result.push(rel)
    }
  }
  return result
}
