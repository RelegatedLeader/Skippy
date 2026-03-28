/**
 * Skippy — Standalone Server Entry Point
 *
 * This file is used when running Skippy as a portable/packaged app.
 * It starts the Next.js production server bound to localhost only.
 *
 * When packaged with `pkg` or run via Electron, this starts the
 * Next.js server on a fixed localhost port. The Electron shell
 * (or a launch script) then opens a browser to that port.
 *
 * Security: server ALWAYS binds to 127.0.0.1, never 0.0.0.0
 */

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')
const fs = require('fs')

const PORT = parseInt(process.env.PORT || '3747', 10)
const HOST = process.env.HOST || '127.0.0.1'
const DEV = process.env.NODE_ENV !== 'production'

// Determine app directory
const dir = process.env.APP_DIR || __dirname

// Initialize Next.js
const app = next({ dev: DEV, dir })
const handle = app.getRequestHandler()

async function main() {
  console.log(`[Skippy] Preparing server... (${DEV ? 'dev' : 'production'})`)

  await app.prepare()

  const server = createServer((req, res) => {
    // Extra security: reject requests not from localhost
    const remoteAddr = req.socket.remoteAddress
    const isLocalhost = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1'

    if (!isLocalhost) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden: Skippy only accepts local connections')
      return
    }

    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  server.listen(PORT, HOST, () => {
    console.log(`[Skippy] Server ready on http://${HOST}:${PORT}`)
    console.log(`[Skippy] Accepting connections from localhost only`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Skippy] Port ${PORT} is already in use. Is Skippy already running?`)
      process.exit(1)
    }
    throw err
  })
}

main().catch((err) => {
  console.error('[Skippy] Fatal startup error:', err)
  process.exit(1)
})
