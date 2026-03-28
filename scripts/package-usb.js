/**
 * Skippy — USB Package Script
 *
 * Creates a final zip archive ready to copy onto a VeraCrypt USB volume.
 * Includes the portable build + launcher scripts + setup guide.
 *
 * Usage:
 *   node scripts/package-usb.js --platform win
 *   node scripts/package-usb.js --platform mac
 *   node scripts/package-usb.js --platform linux
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const archiver = require('archiver')

const args = process.argv.slice(2)
const platformIdx = args.indexOf('--platform')
const platform = platformIdx >= 0 ? args[platformIdx + 1] : 'all'

const ROOT = path.join(__dirname, '..')
const PORTABLE = path.join(ROOT, 'skippy-portable')
const DIST = path.join(ROOT, 'dist')

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true })

async function createZip(srcDir, outFile) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(`Created: ${outFile} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`)
      resolve()
    })
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(srcDir, 'skippy')
    archive.finalize()
  })
}

async function main() {
  console.log('Packaging Skippy for USB...\n')

  // Build if not already built
  if (!fs.existsSync(PORTABLE)) {
    console.log('Running portable build first...')
    execSync('node scripts/build-portable.js', { cwd: ROOT, stdio: 'inherit' })
  }

  const platforms = platform === 'all' ? ['win', 'mac', 'linux'] : [platform]

  for (const p of platforms) {
    const zipName = `Skippy-USB-${p}.zip`
    const zipPath = path.join(DIST, zipName)
    console.log(`Creating ${zipName}...`)
    await createZip(PORTABLE, zipPath)
  }

  console.log('\nUSB packages ready in dist/')
  console.log('\nTo use:')
  console.log('  1. Mount your VeraCrypt volume on USB')
  console.log('  2. Extract the zip into the volume')
  console.log('  3. Create .env with GROK_API_KEY=your_key')
  console.log('  4. Run the launcher script')
}

main().catch((err) => {
  console.error('Package failed:', err)
  process.exit(1)
})
