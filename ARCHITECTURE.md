# Skippy — Deployment Architecture

## Two Modes of Operation

### 1. Web Version (Online)
- Standard Next.js app deployed to Vercel or any Node.js host
- Accessible from any browser
- Database stored on server

### 2. USB/VeraCrypt Version (Ultra-Secure Portable)
- Packaged as a self-contained executable via `pkg` or Electron
- Runs entirely from within a VeraCrypt-encrypted volume on a USB drive
- Zero network exposure — purely local
- Database encrypted at rest (VeraCrypt + SQLite encryption layer)
- Executable launches a local server on localhost only, opens browser
- Nothing persists outside the VeraCrypt container

## USB Security Model

```
USB Drive
└── VeraCrypt Volume (AES-256 + Twofish + Serpent cascade)
    └── skippy/
        ├── skippy.exe          ← Self-contained Node.js server
        ├── prisma/skippy.db    ← SQLite database (encrypted at rest by VeraCrypt)
        ├── .env                ← API keys (never leave the volume)
        └── launch.bat / launch.sh
```

### Threat Model Coverage
- Physical theft of USB → VeraCrypt volume is locked without password
- USB inspection → Volume appears as random data
- Memory forensics → App only runs while volume is mounted
- Network interception → API calls use HTTPS to xAI; local server binds to 127.0.0.1 only
- Key extraction → API key lives only inside the encrypted volume

## Build Commands

```bash
# Web version
npm run build
npm run start

# USB portable executable (after npm install)
npm run build:portable    # Creates skippy-portable/ with standalone Next.js
npm run build:exe         # Packages into a single executable with pkg

# First-time USB setup
npm run db:push           # Initialize SQLite database
```
