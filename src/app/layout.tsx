import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Skippy — Your Personal AI',
  description: 'An AI that truly knows you. Remembers everything. Anticipates everything.',
  keywords: ['AI', 'personal assistant', 'memory', 'notes', 'productivity'],
}

export const viewport: Viewport = {
  themeColor: '#060d1a',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-background text-foreground antialiased min-h-screen`}
      >
        {children}
      </body>
    </html>
  )
}
