'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, User, Swords } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Message, AIModel } from '@/store/chat'
import Link from 'next/link'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  model?: AIModel
}

const MODEL_COLORS: Record<string, string> = {
  grok:   '#29c2e6',
  claude: '#8b5cf6',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-md text-muted hover:text-accent transition-all duration-150"
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
      title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export function MessageBubble({ message, isStreaming, model = 'grok' }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const modelColor = MODEL_COLORS[model] || '#29c2e6'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('flex gap-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(15,39,89,0.8)', border: '1px solid rgba(30,58,110,0.8)' }}>
            <User className="w-3.5 h-3.5 text-muted" />
          </div>
        ) : (
          <div className="relative">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center animate-pulse-cyan overflow-hidden"
              style={{
                background: 'rgba(10,26,53,0.9)',
                border: `1px solid ${modelColor}55`,
              }}
            >
              <div className="relative w-7 h-7">
                <Image
                  src="/img/skippyENHANCED3D-removebg.png"
                  alt="Skippy"
                  fill
                  className="object-contain"
                  style={{ filter: `drop-shadow(0 0 6px ${modelColor}90)` }}
                />
              </div>
            </div>
            <div
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-background animate-blink"
              style={{ backgroundColor: modelColor }}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn('flex flex-col max-w-[80%]', isUser ? 'items-end' : 'items-start')}>

        {/* Label + model badge + time */}
        <div className={cn('flex items-center gap-2 mb-1.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
          <span className="text-xs font-semibold text-muted">
            {isUser ? 'You' : 'Skippy'}
          </span>
          {!isUser && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{ backgroundColor: `${modelColor}18`, color: modelColor }}
            >
              {model}
            </span>
          )}
          {message.createdAt && (
            <span className="text-[10px] text-muted/40">{formatRelativeTime(message.createdAt)}</span>
          )}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-4 py-3 transition-all duration-200',
            isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
          )}
          style={isUser ? {
            background: 'linear-gradient(135deg, #0a1a35, #0f2759)',
            border: '1px solid rgba(41,194,230,0.2)',
          } : {
            background: 'rgba(10,26,53,0.85)',
            border: '1px solid rgba(30,58,110,0.8)',
          }}
          onMouseEnter={e => {
            if (isAssistant) (e.currentTarget as HTMLDivElement).style.borderColor = `${modelColor}25`
          }}
          onMouseLeave={e => {
            if (isAssistant) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(30,58,110,0.8)'
          }}
        >
          {/* Colored left accent on Skippy messages */}
          {isAssistant && (
            <div
              className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full transition-colors duration-300"
              style={{ backgroundColor: `${modelColor}40` }}
            />
          )}

          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-dark text-sm pl-1">
              {isStreaming && message.content === '' ? (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children }) {
                      const match = /language-(\w+)/.exec(className || '')
                      if (match) {
                        return (
                          <div className="relative my-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(30,58,110,0.8)' }}>
                            <div className="flex items-center justify-between px-4 py-2 border-b"
                              style={{ background: 'rgba(15,39,89,0.8)', borderColor: 'rgba(30,58,110,0.8)' }}>
                              <span className="text-xs font-mono font-medium" style={{ color: `${modelColor}cc` }}>{match[1]}</span>
                              <CopyButton text={String(children).replace(/\n$/, '')} />
                            </div>
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{ margin: 0, borderRadius: 0, background: '#04111f', fontSize: '0.8125rem', padding: '1rem' }}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          </div>
                        )
                      }
                      return (
                        <code className="px-1.5 py-0.5 rounded text-[0.82em] font-mono"
                          style={{ background: 'rgba(41,194,230,0.1)', color: '#7ee8fa', border: '1px solid rgba(41,194,230,0.15)' }}>
                          {children}
                        </code>
                      )
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
              {isStreaming && message.content.length > 0 && (
                <span className="inline-block w-0.5 h-4 bg-accent animate-blink ml-0.5 align-middle" />
              )}
            </div>
          )}

          {/* Actions overlay on assistant messages */}
          {isAssistant && !isStreaming && message.content.length > 30 && (
            <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <div className="flex items-center gap-1 rounded-lg shadow-card p-0.5"
                style={{ background: 'rgba(10,26,53,0.98)', border: '1px solid rgba(41,194,230,0.2)' }}>
                <CopyButton text={message.content} />
                <Link
                  href="/debate"
                  title="Debate this with Skippy"
                  className="p-1.5 rounded-md text-muted hover:text-accent transition-all duration-150"
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <Swords className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex gap-3">
      <div className="relative flex-shrink-0 mt-1">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center animate-pulse-cyan overflow-hidden"
          style={{ background: 'rgba(10,26,53,0.9)', border: '1px solid rgba(41,194,230,0.4)' }}>
          <div className="relative w-7 h-7">
            <Image src="/img/skippyENHANCED3D-removebg.png" alt="Skippy" fill className="object-contain drop-shadow-[0_0_6px_rgba(41,194,230,0.8)]" />
          </div>
        </div>
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border-2 border-background animate-blink" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-4 py-3"
        style={{ background: 'rgba(10,26,53,0.85)', border: '1px solid rgba(30,58,110,0.8)' }}>
        <div className="flex items-center gap-1.5">
          <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
        </div>
      </div>
    </motion.div>
  )
}
