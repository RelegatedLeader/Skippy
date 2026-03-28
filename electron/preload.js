/**
 * Skippy — Electron Preload Script
 *
 * Runs in a sandboxed context before the renderer loads.
 * Only exposes what's absolutely necessary via contextBridge.
 * Node.js APIs are NOT exposed to the renderer — full isolation.
 */

const { contextBridge, ipcRenderer } = require('electron')

// Expose a minimal, safe API surface to the renderer
contextBridge.exposeInMainWorld('skippy', {
  // Platform info (read-only)
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',
  isPackaged: !process.env.ELECTRON_IS_DEV,

  // Minimal IPC for things that require main process access
  // (kept deliberately minimal — renderer doesn't need much)
  openExternal: (url) => {
    // Sanitize: only allow http/https URLs
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      ipcRenderer.send('open-external', url)
    }
  },
})

// Block any attempt to access node APIs from the page
delete window.require
delete window.exports
delete window.module
