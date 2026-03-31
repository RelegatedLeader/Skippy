/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for portable/USB builds — creates a self-contained .next/standalone
  // that includes all dependencies in a single directory
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,

  // Reduce bundle size in production
  compress: true,

  // Security headers for web version
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()' },
          { key: 'X-Powered-By', value: '' },
          // Strict-Transport-Security — helps on any deployed version
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      // Protect API routes with stricter no-cache headers
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
