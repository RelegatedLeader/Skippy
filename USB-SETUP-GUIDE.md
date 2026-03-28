# Skippy USB Setup Guide — Ultra-Secure Portable Installation

## Overview

This guide walks you through setting up Skippy on a VeraCrypt-encrypted USB drive. When done correctly:

- Your conversations, notes, and memories are **encrypted at rest** with military-grade encryption
- Your API key never leaves the encrypted volume
- The local server only accepts connections from `127.0.0.1` — impossible to access remotely
- Removing the USB immediately locks everything

---

## Part 1: VeraCrypt USB Setup

### Step 1: Get the tools
- VeraCrypt: https://veracrypt.fr/en/Downloads.html
- A USB drive (8GB+ recommended; 16GB+ if storing notes/files)

### Step 2: Create an encrypted volume

**Option A — Encrypt the entire USB (recommended)**
1. Open VeraCrypt → Create Volume
2. Select **Encrypt a non-system partition/drive**
3. Choose **Standard VeraCrypt volume**
4. Select your USB drive
5. Algorithm settings (maximum security):
   - Encryption: **AES-Twofish** (cascade)
   - Hash: **SHA-512**
6. Set a strong passphrase (20+ characters, mix of letters/numbers/symbols)
7. Format as exFAT (for cross-platform compatibility)
8. Move mouse randomly to generate entropy → Format

**Option B — Create a hidden volume (plausible deniability)**
1. Follow Option A but choose "Hidden VeraCrypt volume"
2. Create an outer volume with non-sensitive files
3. Create the inner (hidden) volume where Skippy lives
4. Use different passwords for each — if coerced, give the outer password

### Step 3: Mount the volume
1. Open VeraCrypt
2. Click **Select Device** → choose your USB
3. Click **Mount** → enter your passphrase
4. The volume appears as a new drive letter (e.g., `E:` on Windows, `/Volumes/SKIPPY` on Mac)

---

## Part 2: Install Skippy on the USB

### Step 4: Build the portable version

On your development machine (with Node.js installed):

```bash
# Clone or copy Skippy project
cd /path/to/Skippy

# Install dependencies
npm install

# Build portable version (creates skippy-portable/ directory)
BUILD_STANDALONE=1 npm run build:portable

# OR: package as a zip for USB
npm run portable:win    # Windows .exe package
npm run portable:mac    # macOS package
npm run portable:linux  # Linux AppImage
```

### Step 5: Copy to USB

1. Mount your VeraCrypt volume
2. Copy the `skippy-portable/` folder into the mounted volume root
3. Create a `.env` file inside `skippy-portable/`:

```
GROK_API_KEY=xai-your_actual_key_here
```

**Get your Grok API key at:** https://console.x.ai

Your USB volume should look like:

```
[VeraCrypt Volume E:\]
└── skippy/
    ├── server-standalone.js
    ├── .next/
    ├── prisma/schema.prisma
    ├── data/               ← Database lives here after first run
    ├── .env                ← YOUR API KEY (never share this)
    ├── launch.bat          ← Windows launcher
    ├── launch.sh           ← Mac/Linux launcher
    └── README-USB.txt
```

---

## Part 3: Running Skippy

### Windows
1. Mount VeraCrypt volume
2. Navigate to the `skippy/` folder
3. Double-click `launch.bat`
4. Browser opens at `http://127.0.0.1:3747`

### Mac/Linux
1. Mount VeraCrypt volume
2. Open terminal, navigate to the `skippy/` folder
3. Run: `./launch.sh`
4. Browser opens at `http://127.0.0.1:3747`

### Electron Desktop App (Optional)

For a cleaner experience without a browser:

```bash
# Install Electron dependencies
npm install

# Build Electron app
npm run electron:build

# Copy the output from dist/electron/ to your USB
```

The Electron version:
- Opens in a dedicated window (no browser needed)
- Tighter Content Security Policy
- No external navigation possible
- `--no-sandbox` mode disabled — full sandbox enabled

---

## Part 4: Security Hardening

### Network Security
The server is hardcoded to bind `127.0.0.1` — it is **physically impossible** to connect to it from another machine on the network. The server rejects any request not originating from localhost.

### API Key Security
Your Grok API key lives only in `.env` inside the VeraCrypt volume. When the volume is unmounted, the key is inaccessible. The key is transmitted via HTTPS to `api.x.ai` — it is never logged locally.

### Database Security
SQLite database at `data/skippy.db` is encrypted by VeraCrypt. An attacker with the USB but without the passphrase sees only random bytes.

### Additional Hardening (Optional)

**Add a keyfile** (second factor beyond passphrase):
1. In VeraCrypt mount dialog → Use keyfiles
2. Select any file as a keyfile (keep it separate from the USB)
3. Both the passphrase AND the keyfile are required to mount

**Enable Hidden Volume** for plausible deniability (see Part 1, Option B)

**Physical security:**
- Use a USB drive with hardware encryption + physical PIN pad (Kingston IronKey, etc.)
- VeraCrypt + hardware encryption = double-encrypted

---

## Part 5: Backup

### Backing up your Skippy data

Your entire Skippy life is in `data/skippy.db`. Back it up regularly:

```bash
# Copy the database to a second encrypted location
cp /path/to/usb/skippy/data/skippy.db /path/to/backup/skippy-backup-$(date +%Y%m%d).db
```

Or use VeraCrypt's volume backup feature to create an encrypted backup of the entire volume.

---

## Quick Reference

| Action | Command/Step |
|--------|-------------|
| Mount volume | VeraCrypt → Select Device → Mount |
| Start Skippy (Win) | Double-click `launch.bat` |
| Start Skippy (Mac/Linux) | `./launch.sh` |
| Access Skippy | `http://127.0.0.1:3747` |
| Stop Skippy | Close terminal / Ctrl+C |
| Dismount volume | VeraCrypt → Dismount |
| Backup data | Copy `data/skippy.db` to encrypted backup |
