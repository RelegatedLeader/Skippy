/**
 * Skippy — Electron Main Process
 *
 * This is the entry point for the desktop/portable version of Skippy.
 * It starts the Next.js server internally and opens a browser window
 * bound exclusively to localhost — no external network exposure.
 *
 * Security model:
 * - Server binds to 127.0.0.1 only
 * - All data lives in the app's user-data directory (which should be
 *   inside a VeraCrypt volume when running from USB)
 * - No remote debugging ports open
 * - Content Security Policy enforced
 * - nodeIntegration disabled, contextIsolation enabled
 */

const { app, BrowserWindow, shell, dialog, Menu } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────
const PORT = 3747  // Uncommon port — less likely to collide
const HOST = '127.0.0.1'
const BASE_URL = `http://${HOST}:${PORT}`

// Determine paths based on whether we're packaged
const isPackaged = app.isPackaged
const appRoot = isPackaged
  ? path.dirname(process.execPath)
  : path.join(__dirname, '..')

// Database lives in app directory (inside VeraCrypt volume when on USB)
const dataDir = isPackaged
  ? path.join(appRoot, 'data')
  : path.join(appRoot, 'prisma')

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Set environment variables for the bundled server
process.env.DATABASE_URL = `file:${path.join(dataDir, 'skippy.db')}`
process.env.PORT = String(PORT)
process.env.HOST = HOST
process.env.HOSTNAME = HOST
process.env.NODE_ENV = 'production'

// Load .env from app root (the encrypted volume)
const envPath = path.join(appRoot, '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
}

// ──────────────────────────────────────────────
// Global state
// ──────────────────────────────────────────────
let mainWindow = null
let serverProcess = null
let serverReady = false

// ──────────────────────────────────────────────
// Start Next.js server
// ──────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const serverScript = isPackaged
      ? path.join(appRoot, 'server-standalone.js')
      : path.join(appRoot, 'node_modules', '.bin', 'next')

    const args = isPackaged ? [] : ['start', '--port', String(PORT), '--hostname', HOST]
    const env = {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: HOST,
    }

    if (isPackaged) {
      // For packaged app, run the bundled standalone server
      serverProcess = spawn(process.execPath, [serverScript], {
        env,
        cwd: appRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else {
      serverProcess = spawn(process.execPath, [serverScript, ...args], {
        env,
        cwd: appRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString()
      console.log('[Server]', msg.trim())
      if (msg.includes('ready') || msg.includes('started') || msg.includes(String(PORT))) {
        serverReady = true
        resolve()
      }
    })

    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString().trim())
    })

    serverProcess.on('error', reject)

    // Fallback: poll until server responds
    const startTime = Date.now()
    const poll = setInterval(() => {
      if (serverReady) {
        clearInterval(poll)
        return
      }
      if (Date.now() - startTime > 30000) {
        clearInterval(poll)
        reject(new Error('Server startup timed out'))
        return
      }
      http.get(`${BASE_URL}/api/conversations`, (res) => {
        if (res.statusCode) {
          clearInterval(poll)
          serverReady = true
          resolve()
        }
      }).on('error', () => { /* still starting */ })
    }, 500)
  })
}

// ──────────────────────────────────────────────
// Create browser window
// ──────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Skippy',
    backgroundColor: '#0a0a0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      // Security: disable node integration in renderer
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Prevent loading remote content
      webSecurity: true,
      allowRunningInsecureContent: false,
      // No remote debugging
      devTools: !isPackaged,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  })

  // Show loading screen
  mainWindow.loadURL(`data:text/html,
    <html>
      <head>
        <style>
          body {
            background: #0a0a0f;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: system-ui, sans-serif;
          }
          .loader { text-align: center; color: #7c3aed; }
          .title { font-size: 2rem; font-weight: bold; margin-bottom: 1rem; }
          .dots { display: flex; gap: 8px; justify-content: center; }
          .dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: #7c3aed;
            animation: pulse 1.4s ease-in-out infinite;
          }
          .dot:nth-child(2) { animation-delay: 0.2s; }
          .dot:nth-child(3) { animation-delay: 0.4s; }
          @keyframes pulse { 0%, 60%, 100% { opacity: 1; } 30% { opacity: 0.2; } }
          .sub { color: #64748b; margin-top: 1rem; font-size: 0.875rem; }
        </style>
      </head>
      <body>
        <div class="loader">
          <div class="title">Skippy</div>
          <div class="dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
          <div class="sub">Starting secure local server...</div>
        </div>
      </body>
    </html>
  `)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Intercept navigation — only allow localhost
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(BASE_URL) && !url.startsWith('data:')) {
      event.preventDefault()
      // Open external links in system browser
      if (url.startsWith('http')) shell.openExternal(url)
    }
  })

  // Block new window creation (no popups, no external browser)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE_URL)) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self' ${BASE_URL}; ` +
          `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${BASE_URL}; ` +
          `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ` +
          `font-src 'self' https://fonts.gstatic.com data:; ` +
          `img-src 'self' data: blob:; ` +
          `connect-src 'self' ${BASE_URL} https://api.x.ai;`
        ],
      },
    })
  })
}

// ──────────────────────────────────────────────
// App lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(async () => {
  // Check for API key
  if (!process.env.GROK_API_KEY) {
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Skippy — API Key Required',
      message: 'GROK_API_KEY not found',
      detail: `Please create a .env file in the Skippy folder:\n\n${appRoot}\n\nWith the contents:\nGROK_API_KEY=your_key_here\n\nGet your key at: console.x.ai`,
      buttons: ['Continue Anyway', 'Quit'],
    })
    if (result === 1) {
      app.quit()
      return
    }
  }

  createWindow()

  try {
    await startServer()
    if (mainWindow) {
      mainWindow.loadURL(BASE_URL)
    }
  } catch (err) {
    console.error('Failed to start server:', err)
    dialog.showErrorBox('Skippy — Startup Failed', `Could not start the local server:\n\n${err.message}`)
    app.quit()
  }

  // Set up application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'Skippy',
      submenu: [
        { label: 'About Skippy', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Chat', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.loadURL(`${BASE_URL}/chat`) },
        { label: 'Notes', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.loadURL(`${BASE_URL}/notes`) },
        { label: 'Memory', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.loadURL(`${BASE_URL}/memory`) },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
})

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
