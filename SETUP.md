# Skippy — First Run Setup

## Prerequisites
- Node.js 18+ (https://nodejs.org)
- A Grok API key (https://console.x.ai)

## Setup (one time)

```bash
# 1. Navigate to project
cd /Users/relegatedleader/Desktop/PROJECTS/Skippy

# 2. Create your .env file
cp .env.example .env
# Open .env and fill in: GROK_API_KEY=xai-your_key_here

# 3. Install dependencies
npm install

# 4. Initialize the database
npm run db:push

# 5. Start the dev server
npm run dev
# Open http://localhost:3000
```

## Production / Web Deployment

```bash
npm run build
npm run start
# Runs at http://localhost:3000
```

## USB / Portable Version

```bash
# Build as standalone (required for portable)
BUILD_STANDALONE=1 npm run build

# Create portable folder (copy to USB)
node scripts/build-portable.js

# Output: skippy-portable/
# - Copy this folder into your VeraCrypt USB volume
# - Create .env with GROK_API_KEY inside the volume
# - Run launch.bat (Windows) or ./launch.sh (Mac/Linux)
```

## Electron Desktop App

```bash
npm install  # installs electron devDependencies
npm run electron:dev   # development mode
npm run electron:build # build distributable
# Output: dist/electron/
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (hot reload) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run electron:dev` | Run Electron in dev mode |
| `npm run electron:build` | Build Electron distributable |
| `node scripts/build-portable.js` | Build portable USB version |
