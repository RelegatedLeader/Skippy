'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Settings, Shield, Lock, Download, Trash2, User, Bot,
  CheckCircle2, AlertTriangle, Eye, Copy, Check,
  Sparkles, Save, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4 } }),
}

export default function SettingsPage() {
  const [exportFormat, setExportFormat] = useState<'txt' | 'md' | 'json'>('md')
  const [copied, setCopied] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearDone, setClearDone] = useState(false)

  // Custom instructions
  const [customInstructions, setCustomInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(false)

  useEffect(() => {
    fetch('/api/user-instructions')
      .then((r) => r.ok ? r.json() : { customInstructions: '' })
      .then((d) => setCustomInstructions(d.customInstructions || ''))
      .catch(() => {})
  }, [])

  const saveInstructions = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/user-instructions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customInstructions }),
      })
      if (res.ok) {
        setSaveDone(true)
        setTimeout(() => setSaveDone(false), 2500)
      }
    } catch (err) {
      console.error('Failed to save instructions:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText('Set in your .env as ENCRYPTION_KEY')
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleExportNotes = () => window.open(`/api/export?type=notes&format=${exportFormat}`, '_blank')
  const handleExportSummaries = () => window.open(`/api/export?type=summaries&format=${exportFormat}`, '_blank')
  const handleExportFull = () => window.open('/api/export?type=full', '_blank')

  const handleClearMemories = async () => {
    setClearing(true)
    try {
      const res = await fetch('/api/memories')
      if (res.ok) {
        const { memories } = await res.json()
        await Promise.all(memories.map((m: { id: string }) =>
          fetch(`/api/memories?id=${m.id}`, { method: 'DELETE' })
        ))
      }
      setClearDone(true)
      setShowClearConfirm(false)
      setTimeout(() => setClearDone(false), 3000)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-8 py-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="font-display text-xl font-black text-foreground flex items-center gap-2.5 tracking-tight">
              <Settings className="w-5 h-5 text-accent" />
              Settings
            </h1>
            <p className="text-xs text-muted mt-0.5">Security, data, and preferences</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-8 py-8 relative z-10 space-y-6">

          {/* Custom Instructions */}
          <motion.section custom={0} variants={SECTION_VARIANTS} initial="hidden" animate="visible">
            <SectionHeader icon={Sparkles} title="Custom Instructions" color="text-accent" />
            <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                Tell Skippy exactly how you want it to behave — what tone to use, topics to focus on, how to format responses, or anything about your life it should always remember. These instructions shape <strong className="text-foreground/70">every single conversation</strong>.
              </p>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                maxLength={2000}
                rows={6}
                placeholder={`Examples:\n• Always be direct and skip the pleasantries.\n• I'm a software engineer — assume technical context.\n• When I talk about goals, push me to be specific.\n• Never give unsolicited advice about relationships.`}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted/30 outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] resize-none transition-all leading-relaxed font-sans"
              />
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted/40">{customInstructions.length} / 2000</span>
                <button
                  onClick={saveInstructions}
                  disabled={saving}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
                    saveDone
                      ? 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/25'
                      : 'btn-gold relative'
                  )}
                >
                  {saving
                    ? <Loader2 className="w-3 h-3 animate-spin relative z-10" />
                    : saveDone
                      ? <Check className="w-3 h-3" />
                      : <Save className="w-3 h-3 relative z-10" />}
                  <span className={saveDone ? '' : 'relative z-10'}>
                    {saving ? 'Saving…' : saveDone ? 'Saved!' : 'Save Instructions'}
                  </span>
                </button>
              </div>
            </div>
          </motion.section>

          {/* Security & Encryption */}
          <motion.section custom={1} variants={SECTION_VARIANTS} initial="hidden" animate="visible">
            <SectionHeader icon={Shield} title="Security & Encryption" color="text-emerald-400" />
            <div className="bg-surface border border-border rounded-2xl divide-y divide-border overflow-hidden">
              <SettingRow
                icon={Lock}
                iconColor="text-emerald-400"
                title="AES-256-GCM Encryption"
                description="All notes are encrypted at rest using AES-256-GCM before being written to the database. The server decrypts on read — data is never stored in plain text."
              >
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/25">
                  <CheckCircle2 className="w-3 h-3" />Active
                </span>
              </SettingRow>
              <SettingRow
                icon={Eye}
                iconColor="text-accent"
                title="Encryption Key"
                description="Your 256-bit key is stored in the server .env file and never sent to the client. Rotate it by generating a new key: node -e &quot;console.log(require('crypto').randomBytes(32).toString('hex'))&quot;"
              >
                <button
                  onClick={handleCopyKey}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border text-muted hover:text-foreground hover:border-accent/30 transition-all"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy hint'}
                </button>
              </SettingRow>
              <SettingRow
                icon={Shield}
                iconColor="text-blue-400"
                title="Encryption Standard"
                description="AES-256-GCM with a unique 128-bit IV per note. Authentication tags prevent tampered data from being decrypted silently. Rate limiting protects the chat API (20 req/min)."
              >
                <span className="text-xs text-muted font-mono bg-surface-2 px-2 py-1 rounded">AES-256-GCM</span>
              </SettingRow>
            </div>
          </motion.section>

          {/* Export Data */}
          <motion.section custom={2} variants={SECTION_VARIANTS} initial="hidden" animate="visible">
            <SectionHeader icon={Download} title="Export Your Data" color="text-accent" />
            <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                Your data is always yours. Export everything as plain text, Markdown, or structured JSON — decrypted and ready to use anywhere.
              </p>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted font-medium">Format:</span>
                <div className="flex gap-1.5">
                  {(['txt', 'md', 'json'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                        exportFormat === fmt
                          ? 'bg-accent text-background border-accent'
                          : 'bg-surface-2 text-muted border-border hover:text-foreground hover:border-accent/30'
                      )}
                    >
                      .{fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ExportButton
                  label="Export All Notes"
                  subtitle={`Download as .${exportFormat}`}
                  onClick={handleExportNotes}
                />
                <ExportButton
                  label="Export All Summaries"
                  subtitle={`Download as .${exportFormat}`}
                  onClick={handleExportSummaries}
                />
              </div>

              <div
                className="p-4 rounded-xl border cursor-pointer group transition-all text-left w-full flex items-start gap-3"
                style={{ background: 'rgba(41,194,230,0.04)', borderColor: 'rgba(41,194,230,0.2)' }}
                onClick={handleExportFull}
                role="button"
              >
                <div className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(41,194,230,0.12)', border: '1px solid rgba(41,194,230,0.25)' }}>
                  <Download className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground group-hover:text-accent transition-colors">
                    Full Data Export (USB / Backup)
                  </p>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">
                    Exports everything — notes, memories, summaries, debates, and your profile — as a single signed JSON file. Includes an HMAC-SHA256 integrity signature. Perfect for USB backup or migrating to a new machine.
                  </p>
                  <p className="text-[10px] text-accent/60 mt-1.5 font-mono">skippy_full_export_YYYY-MM-DD.json</p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* About Skippy */}
          <motion.section custom={3} variants={SECTION_VARIANTS} initial="hidden" animate="visible">
            <SectionHeader icon={Bot} title="About Skippy" color="text-accent" />
            <div className="bg-surface border border-border rounded-2xl divide-y divide-border overflow-hidden">
              <SettingRow icon={User} iconColor="text-accent" title="Version" description="Skippy Personal AI — built with Next.js 14, Grok API (grok-3-beta), Prisma + SQLite">
                <span className="text-xs font-mono text-muted bg-surface-2 px-2 py-1 rounded">v0.1.0</span>
              </SettingRow>
              <SettingRow icon={Lock} iconColor="text-muted" title="Data Storage" description="All data is stored locally in a SQLite database on your machine. Nothing is sent to external servers except AI inference calls to xAI/Anthropic.">
                <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded-full border border-blue-400/20 font-semibold">Local only</span>
              </SettingRow>
            </div>
          </motion.section>

          {/* Danger Zone */}
          <motion.section custom={4} variants={SECTION_VARIANTS} initial="hidden" animate="visible">
            <SectionHeader icon={AlertTriangle} title="Danger Zone" color="text-red-400" />
            <div className="bg-surface border border-red-400/15 rounded-2xl p-5 space-y-4">
              {clearDone && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />All memories cleared successfully.
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Clear All Memories</p>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">
                    Permanently delete everything Skippy has learned about you. Chats and notes are unaffected. This cannot be undone.
                  </p>
                </div>
                {!showClearConfirm ? (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/25 hover:bg-red-400/20 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />Clear Memories
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-red-400 font-semibold">Are you sure?</span>
                    <button
                      onClick={handleClearMemories}
                      disabled={clearing}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-background bg-red-500 hover:bg-red-400 transition-all disabled:opacity-60"
                    >
                      {clearing ? 'Clearing…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-foreground border border-border hover:border-accent/30 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.section>

        </div>
      </main>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <Icon className={cn('w-4 h-4', color)} />
      <h2 className="text-xs font-bold text-muted/60 uppercase tracking-widest">{title}</h2>
    </div>
  )
}

function SettingRow({
  icon: Icon, iconColor, title, description, children,
}: {
  icon: React.ElementType; iconColor: string; title: string; description: string; children?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={cn('mt-0.5 flex-shrink-0', iconColor)}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: description }} />
        </div>
      </div>
      {children && <div className="flex-shrink-0 mt-0.5">{children}</div>}
    </div>
  )
}

function ExportButton({ label, subtitle, onClick }: { label: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-1 p-4 rounded-xl bg-surface-2 border border-border hover:border-accent/30 hover:bg-accent/5 transition-all text-left"
    >
      <div className="flex items-center gap-2">
        <Download className="w-3.5 h-3.5 text-accent group-hover:text-accent transition-colors" />
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      <span className="text-[11px] text-muted pl-5">{subtitle}</span>
    </button>
  )
}
