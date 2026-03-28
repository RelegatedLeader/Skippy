'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Send, Mic, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, isLoading, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 6 * 24 + 32)}px`
  }, [])

  useEffect(() => { adjustHeight() }, [value, adjustHeight])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isLoading || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, isLoading, disabled, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  const charCount = value.length
  const canSend = value.trim().length > 0 && !isLoading && !disabled

  return (
    <div className="p-4">
      <div
        className={cn('relative rounded-2xl transition-all duration-250')}
        style={{
          background: 'rgba(10,26,53,0.9)',
          border: `1px solid ${isFocused ? 'rgba(41,194,230,0.5)' : 'rgba(30,58,110,0.9)'}`,
          boxShadow: isFocused
            ? '0 0 0 3px rgba(41,194,230,0.08), 0 0 24px rgba(41,194,230,0.14)'
            : undefined,
        }}
      >
        {/* Cyan inner glow when focused */}
        {isFocused && (
          <div className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ background: 'rgba(41,194,230,0.02)' }} />
        )}

        <div className="relative flex items-end gap-2 p-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { if (e.target.value.length <= 4000) setValue(e.target.value) }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Message Skippy…"
            disabled={isLoading || disabled}
            rows={1}
            className="flex-1 bg-transparent text-foreground text-sm leading-6 resize-none outline-none placeholder:text-muted/40 disabled:opacity-50 disabled:cursor-not-allowed py-1 max-h-36 overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          />

          <div className="flex items-center gap-2 pb-0.5">
            {charCount > 0 && (
              <span className={cn(
                'text-xs tabular-nums transition-colors',
                charCount >= 4000 ? 'text-red-400' : charCount > 3500 ? 'text-accent' : 'text-muted/40'
              )}>
                {charCount}/4k
              </span>
            )}

            <button
              type="button" disabled
              className="p-2 rounded-xl text-muted/30 cursor-not-allowed"
              title="Voice input (coming soon)"
            >
              <Mic className="w-4 h-4" />
            </button>

            <motion.button
              whileHover={canSend ? { scale: 1.07 } : {}}
              whileTap={canSend ? { scale: 0.93 } : {}}
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200',
                canSend
                  ? 'btn-cyan shadow-glow-cyan-sm'
                  : 'text-muted/30 cursor-not-allowed'
              )}
              style={!canSend ? { background: 'rgba(15,39,89,0.6)' } : {}}
            >
              {isLoading
                ? <Loader2 className="w-4 h-4 animate-spin text-accent" />
                : <Send className={cn('w-4 h-4', canSend ? 'text-background relative z-10' : '')} />
              }
            </motion.button>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted/30 text-center mt-2">
        Skippy uses your memories to personalise every response.
      </p>
    </div>
  )
}
