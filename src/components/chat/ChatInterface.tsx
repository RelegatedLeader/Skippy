'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { Zap, Brain, FileText, TrendingUp, Cpu, AlertTriangle, Swords, X, Sparkles, Menu, BookOpen, GraduationCap } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useChatStore, type AIModel } from '@/store/chat'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { useNotifications } from '@/components/notifications/NotificationProvider'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const SUGGESTED_PROMPTS = [
  { icon: Zap,         title: 'What should I work on?', prompt: 'Based on what you know about me, what should I prioritize working on right now?',                         color: '#29c2e6' },
  { icon: Brain,       title: 'How am I doing?',        prompt: "Give me an honest assessment of my recent patterns and how I've been doing overall.",                      color: '#7ee8fa' },
  { icon: FileText,    title: 'Help me think',          prompt: 'I need to think through a complex problem. Ask me about it and help me break it down.',                   color: '#29c2e6' },
  { icon: TrendingUp,  title: "What's next for me?",    prompt: "Based on my goals and patterns, what's the single most impactful next step I should take?",              color: '#7ee8fa' },
]

const MODEL_OPTIONS: { id: AIModel; label: string; desc: string; color: string }[] = [
  { id: 'grok',   label: 'Grok',   desc: 'xAI · Default',     color: '#29c2e6' },
  { id: 'claude', label: 'Claude', desc: 'Anthropic · Opus',  color: '#8b5cf6' },
]

interface ChatInterfaceProps {
  conversationId: string | null
  onConversationCreated: (id: string) => void
  onToggleSidebar?: () => void
}

export function ChatInterface({ conversationId, onConversationCreated, onToggleSidebar }: ChatInterfaceProps) {
  const {
    messages, setMessages, addMessage,
    isLoading, setLoading,
    isStreaming, setStreaming,
    streamingContent, setStreamingContent,
    updateConversationTitle, addConversation,
    selectedModel, setSelectedModel,
  } = useChatStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const justCreatedIdRef = useRef<string | null>(null)
  const [currentConvId, setCurrentConvId] = useState<string | null>(conversationId)
  const [escalation, setEscalation] = useState<string | null>(null)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const { refreshReminders } = useNotifications()

  useEffect(() => { setCurrentConvId(conversationId) }, [conversationId])

  useEffect(() => {
    if (!conversationId) { setMessages([]); return }
    if (justCreatedIdRef.current === conversationId) {
      justCreatedIdRef.current = null
      return
    }
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setMessages(d.messages || []) })
      .catch(console.error)
  }, [conversationId, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading) return
      setEscalation(null)

      let convId = currentConvId
      if (!convId) {
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat' }),
          })
          if (!res.ok) throw new Error('Failed to create conversation')
          const newConv = await res.json()
          convId = newConv.id
          setCurrentConvId(convId)
          justCreatedIdRef.current = convId
          onConversationCreated(convId!)
          addConversation(newConv)
        } catch (err) { console.error(err); return }
      }

      const userMsg = { id: nanoid(), role: 'user' as const, content, createdAt: new Date() }
      addMessage(userMsg)
      setLoading(true)
      setStreaming(true)
      setStreamingContent('')

      const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      const streamingId = nanoid()
      addMessage({ id: streamingId, role: 'assistant', content: '', createdAt: new Date() })

      try {
        abortControllerRef.current = new AbortController()

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages, conversationId: convId, model: selectedModel }),
          signal: abortControllerRef.current.signal,
        })

        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          throw new Error(errText || `HTTP ${res.status}`)
        }
        if (!res.body) throw new Error('No body')

        if (res.headers.get('X-Skippy-Escalate') === '1') {
          setEscalation(content)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setStreamingContent(accumulated)
        }

        const finalMessages = useChatStore.getState().messages.map((m) =>
          m.id === streamingId ? { ...m, content: accumulated } : m
        )
        setMessages(finalMessages)
        setStreamingContent('')
        // Stream closed = saves complete. Refresh bell so new reminders show immediately.
        refreshReminders()

        setTimeout(async () => {
          try {
            const r2 = await fetch(`/api/conversations/${convId}`)
            if (r2.ok) {
              const d = await r2.json()
              if (d.title && d.title !== 'New Chat') updateConversationTitle(convId!, d.title)
            }
          } catch { /* ignore */ }
        }, 2000)

      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('Chat error:', err)
        const errMsg = err instanceof Error ? err.message : String(err)
        const display = errMsg && !errMsg.startsWith('HTTP ')
          ? `⚠️ ${errMsg}`
          : '⚠️ Error connecting to AI. Check console for details.'
        setMessages(
          useChatStore.getState().messages.map((m) =>
            m.id === streamingId
              ? { ...m, content: display }
              : m
          )
        )
      } finally {
        setLoading(false)
        setStreaming(false)
        setStreamingContent('')
      }
    },
    [isLoading, currentConvId, messages, selectedModel, addMessage, setLoading, setStreaming,
     setStreamingContent, setMessages, onConversationCreated, addConversation, updateConversationTitle,
     refreshReminders]
  )

  const displayMessages = messages.map((m) =>
    m.role === 'assistant' && m.content === '' && isStreaming
      ? { ...m, content: streamingContent }
      : m
  )

  const isEmpty = displayMessages.length === 0
  const activeModel = MODEL_OPTIONS.find((m) => m.id === selectedModel) || MODEL_OPTIONS[0]

  return (
    <div className="flex flex-col h-full relative" style={{ background: 'linear-gradient(135deg, #0f2759 0%, #0a1a35 55%, rgba(88,28,135,0.25) 100%)' }}>
      <div className="absolute inset-0 circuit-grid opacity-30 pointer-events-none" />

      {/* Top bar: hamburger | nav links | model picker */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 pb-1 border-b" style={{ borderColor: 'rgba(30,58,110,0.6)' }}>
        {/* Left: hamburger */}
        <button
          onClick={onToggleSidebar}
          className="p-2.5 rounded-xl text-muted hover:text-foreground transition-all flex-shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
          style={{ border: '1px solid transparent' }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'rgba(15,39,89,0.8)'
            el.style.borderColor = 'rgba(30,58,110,0.8)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = ''
            el.style.borderColor = 'transparent'
          }}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Center: nav links (hide labels on xs, show icon only) */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center overflow-hidden">
          {[
            { href: '/notes',     icon: FileText,       label: 'Notes' },
            { href: '/summaries', icon: Sparkles,       label: 'Sum.' },
            { href: '/memory',    icon: Brain,          label: 'Memory' },
            { href: '/debate',    icon: Swords,         label: 'Debate' },
            { href: '/learn',     icon: GraduationCap,  label: '中文' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1 px-2 sm:px-3 py-2 rounded-xl text-xs font-medium text-muted hover:text-accent transition-all duration-150 min-w-[36px] min-h-[36px] justify-center"
              style={{ border: '1px solid transparent' }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = 'rgba(41,194,230,0.08)'
                el.style.borderColor = 'rgba(41,194,230,0.2)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = ''
                el.style.borderColor = 'transparent'
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:block">{label}</span>
            </Link>
          ))}
        </nav>

        {/* Right: model picker */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowModelPicker((p) => !p)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200',
              'backdrop-blur-sm',
            )}
            style={{
              background: 'rgba(10,26,53,0.8)',
              borderColor: `${activeModel.color}35`,
              color: activeModel.color,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = `${activeModel.color}60`)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = `${activeModel.color}35`)}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-blink" style={{ backgroundColor: activeModel.color }} />
            {activeModel.label}
            <Cpu className="w-3 h-3 opacity-60" />
          </button>

          <AnimatePresence>
            {showModelPicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-card overflow-hidden z-30"
                style={{
                  background: 'rgba(10,26,53,0.98)',
                  border: '1px solid rgba(30,58,110,0.9)',
                  backdropFilter: 'blur(16px)',
                }}
              >
                <div className="p-1.5">
                  {MODEL_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setShowModelPicker(false) }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 border',
                        selectedModel === m.id ? '' : 'border-transparent'
                      )}
                      style={selectedModel === m.id ? {
                        background: `${m.color}10`,
                        borderColor: `${m.color}25`,
                      } : {}}
                      onMouseEnter={e => {
                        if (selectedModel !== m.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,39,89,0.8)'
                      }}
                      onMouseLeave={e => {
                        if (selectedModel !== m.id) (e.currentTarget as HTMLButtonElement).style.background = ''
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{m.label}</p>
                        <p className="text-[11px] text-muted/60">{m.desc}</p>
                      </div>
                      {selectedModel === m.id && (
                        <Sparkles className="w-3 h-3 ml-auto flex-shrink-0" style={{ color: m.color }} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 border-t" style={{ borderColor: 'rgba(30,58,110,0.7)', background: 'rgba(6,13,26,0.4)' }}>
                  <p className="text-[10px] text-muted/50 leading-tight">
                    Both models share your memories & notes for full personalization
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Escalation banner */}
      <AnimatePresence>
        {escalation && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative z-20 mx-4 mb-2"
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: 'rgba(10,26,53,0.9)',
                border: '1px solid rgba(41,194,230,0.3)',
                boxShadow: '0 0 20px rgba(41,194,230,0.08)',
              }}>
              <AlertTriangle className="w-4 h-4 text-accent flex-shrink-0" />
              <p className="text-xs text-foreground/80 flex-1">
                <span className="font-semibold text-accent">Big call ahead?</span>{' '}
                This sounds like a significant decision. Want to stress-test it with Skippy in a structured debate?
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href="/debate"
                  onClick={() => setEscalation(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-cyan text-xs relative"
                >
                  <Swords className="w-3 h-3 relative z-10" />
                  <span className="relative z-10">Debate it</span>
                </Link>
                <button onClick={() => setEscalation(null)} className="p-1 text-muted/50 hover:text-muted transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto relative z-10">
        {isEmpty ? (
          <div className="flex flex-col items-center px-4 sm:px-8 py-8 sm:py-16 min-h-full justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-6 sm:mb-10"
            >
              <div className="relative flex justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-[-16px] rounded-full border border-accent/12 animate-spin-slow" />
                  <div className="absolute inset-[-8px] rounded-full border border-accent/18"
                    style={{ animation: 'ringPulse 2.5s ease-in-out infinite' }} />
                  {/* Glow backdrop */}
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center animate-pulse-cyan"
                    style={{ background: 'radial-gradient(circle, rgba(41,194,230,0.1) 0%, transparent 70%)' }}
                  >
                    <div className="relative w-20 h-20">
                      <Image
                        src="/img/skippyENHANCED3D-removebg.png"
                        alt="Skippy"
                        fill
                        className="object-contain drop-shadow-[0_0_20px_rgba(41,194,230,0.8)]"
                      />
                    </div>
                  </div>
                  {['top-0 right-0 translate-x-1 -translate-y-1', 'bottom-0 right-0 translate-x-1 translate-y-1',
                    'top-0 left-0 -translate-x-1 -translate-y-1', 'bottom-0 left-0 -translate-x-1 translate-y-1'
                  ].map((pos, i) => (
                    <div key={i} className={`absolute ${pos} w-1.5 h-1.5 rounded-full bg-accent/60`}
                      style={{ animation: `blink ${1 + i * 0.35}s step-end infinite` }} />
                  ))}
                </div>
              </div>

              <h2 className="font-display text-3xl font-black text-foreground mb-2 tracking-tight">
                Hey — I&apos;m <span className="gradient-text">Skippy</span>
              </h2>
              <p className="text-muted text-base max-w-sm mx-auto leading-relaxed">
                Your personal AI. I learn from every conversation and remember everything.
              </p>

              <div className="flex items-center justify-center gap-2 mt-4">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border"
                  style={{ background: 'rgba(10,26,53,0.8)', borderColor: 'rgba(30,58,110,0.8)' }}>
                  <Cpu className="w-3 h-3" style={{ color: activeModel.color }} />
                  <span className="text-[10px] text-muted/60 font-mono uppercase tracking-wider">
                    {activeModel.label} · Ready
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full animate-blink" style={{ backgroundColor: activeModel.color }} />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl"
            >
              {SUGGESTED_PROMPTS.map((p, i) => (
                <motion.button
                  key={p.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.35 + i * 0.06 }}
                  whileHover={{ y: -2, transition: { duration: 0.15 } }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => sendMessage(p.prompt)}
                  className="group text-left p-4 rounded-xl transition-all duration-200 overflow-hidden relative"
                  style={{
                    background: 'linear-gradient(135deg, rgba(15,39,89,0.6) 0%, rgba(10,26,53,0.6) 100%)',
                    border: '1px solid rgba(30,58,110,0.8)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.3)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(30,58,110,0.8)')}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: `radial-gradient(circle at 0% 50%, ${p.color}08, transparent 70%)` }} />
                  <div className="flex items-start gap-3 relative z-10">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${p.color}15`, border: `1px solid ${p.color}25` }}>
                      <p.icon className="w-4 h-4" style={{ color: p.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-0.5">{p.title}</p>
                      <p className="text-xs text-muted line-clamp-2 leading-relaxed">{p.prompt}</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            <AnimatePresence mode="popLayout">
              {displayMessages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  model={selectedModel}
                  isStreaming={
                    isStreaming &&
                    idx === displayMessages.length - 1 &&
                    msg.role === 'assistant'
                  }
                />
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t relative z-10" style={{ borderColor: 'rgba(30,58,110,0.8)', background: 'rgba(6,13,26,0.6)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-3xl mx-auto md:pr-16">
          <ChatInput onSend={sendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}
