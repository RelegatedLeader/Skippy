'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || '/'

  const [form, setForm] = useState({ username: '', password: '', accessCode: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      router.replace(from)
      router.refresh()
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl backdrop-blur"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Username
        </label>
        <input
          type="text"
          autoComplete="username"
          autoFocus
          value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
          placeholder="skippy-xxxxxxxx"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          placeholder="••••••••••••••••"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Access Code
        </label>
        <input
          type="text"
          autoComplete="one-time-code"
          value={form.accessCode}
          onChange={e => setForm(f => ({ ...f, accessCode: e.target.value.toUpperCase() }))}
          placeholder="XXXX-XXXX-XXXX"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition font-mono tracking-widest"
          required
        />
      </div>

      {error && (
        <div className="bg-red-950/60 border border-red-800/60 rounded-lg px-4 py-2.5 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#060d1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/img/skippyENHANCED3D-removebg.png"
            alt="Skippy"
            width={72}
            height={72}
            className="drop-shadow-[0_0_20px_rgba(124,58,237,0.6)]"
          />
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-zinc-400">Sign in to your Skippy instance</p>
        </div>

        <Suspense fallback={
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 text-zinc-400 text-sm text-center">
            Loading…
          </div>
        }>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-zinc-600 mt-6">
          First time?{' '}
          <a href="/setup" className="text-violet-400 hover:text-violet-300 transition-colors">
            Generate your credentials
          </a>
        </p>
      </div>
    </div>
  )
}
