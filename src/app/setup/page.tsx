'use client'

import { useState } from 'react'
import Image from 'next/image'

type Credentials = {
  username: string
  password: string
  accessCode: string
}

export default function SetupPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleGenerate() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/setup', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Setup failed')
        return
      }

      setCredentials(data)
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  async function copyField(label: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  function buildEmailLink(creds: Credentials) {
    const subject = encodeURIComponent('Skippy — Your Login Credentials')
    const body = encodeURIComponent(
      `Keep this email safe — these credentials are generated once and cannot be recovered.\n\n` +
      `Username:    ${creds.username}\n` +
      `Password:    ${creds.password}\n` +
      `Access Code: ${creds.accessCode}\n\n` +
      `Login at your Skippy URL.\n`
    )
    return `mailto:?subject=${subject}&body=${body}`
  }

  return (
    <div className="min-h-screen bg-[#060d1a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/img/skippyENHANCED3D-removebg.png"
            alt="Skippy"
            width={72}
            height={72}
            className="drop-shadow-[0_0_20px_rgba(124,58,237,0.6)]"
          />
          <h1 className="text-2xl font-bold text-white tracking-tight">First-run Setup</h1>
          <p className="text-sm text-zinc-400 text-center max-w-sm">
            Generate your one-time credentials. They are hashed and stored — the plain text is shown
            only once. Email them to yourself before closing this page.
          </p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-5 shadow-2xl backdrop-blur">
          {!credentials ? (
            <>
              {error && (
                <div className="bg-red-950/60 border border-red-800/60 rounded-lg px-4 py-2.5 text-red-400 text-sm">
                  {error === 'Already configured'
                    ? 'Credentials already exist. Go to the login page.'
                    : error}
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-3 text-sm transition-colors"
              >
                {loading ? 'Generating…' : 'Generate My Credentials'}
              </button>
              <p className="text-xs text-zinc-600 text-center">
                Already have credentials?{' '}
                <a href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">
                  Sign in
                </a>
              </p>
            </>
          ) : (
            <>
              <div className="bg-amber-950/40 border border-amber-700/40 rounded-lg px-4 py-3 text-amber-400 text-sm flex gap-2">
                <span>⚠️</span>
                <span>
                  <strong>Save these now.</strong> The plain-text credentials are shown once and
                  cannot be recovered. Click "Email to Myself" immediately.
                </span>
              </div>

              {/* Credential fields */}
              {[
                { label: 'Username', value: credentials.username, mono: false },
                { label: 'Password', value: credentials.password, mono: false },
                { label: 'Access Code', value: credentials.accessCode, mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {label}
                  </label>
                  <div className="flex gap-2">
                    <div
                      className={`flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm select-all ${mono ? 'font-mono tracking-widest' : ''}`}
                    >
                      {value}
                    </div>
                    <button
                      onClick={() => copyField(label, value)}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg px-3 py-2 text-xs transition-colors whitespace-nowrap"
                    >
                      {copied === label ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-3 pt-1">
                <a
                  href={buildEmailLink(credentials)}
                  className="w-full text-center bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  📧 Email to Myself
                </a>
                <a
                  href="/login"
                  className="w-full text-center bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  Go to Login →
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
