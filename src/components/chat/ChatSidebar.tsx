'use client'

import { useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, FileText, Brain, Plus, Trash2, Home, X, Settings,
} from 'lucide-react'
import { cn, formatRelativeTime, truncate } from '@/lib/utils'
import { useChatStore } from '@/store/chat'

interface ChatSidebarProps {
  isOpen: boolean
  onClose: () => void
  onNewChat: () => void
  onSelectConversation: (id: string) => void
}

const navItems = [
  { href: '/',        icon: Home,     label: 'Home' },
  { href: '/notes',   icon: FileText, label: 'Notes' },
  { href: '/memory',  icon: Brain,    label: 'Memory' },
  { href: '/settings',icon: Settings, label: 'Settings' },
]

export function ChatSidebar({ isOpen, onClose, onNewChat, onSelectConversation }: ChatSidebarProps) {
  const pathname = usePathname()
  const { conversations, currentConversationId, setConversations, removeConversation } =
    useChatStore()

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) setConversations(await res.json())
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    }
  }, [setConversations])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      removeConversation(id)
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 backdrop-blur-sm"
            style={{ background: 'rgba(6,13,26,0.75)' }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col w-64 shadow-2xl"
        style={{
          background: 'rgba(10, 26, 53, 0.99)',
          borderRight: '1px solid rgba(30,58,110,0.9)',
        }}
      >
        {/* Logo + close */}
        <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'rgba(30,58,110,0.7)' }}>
          <div className="relative flex-shrink-0">
            {/* Glow ring */}
            <div
              className="absolute inset-[-4px] rounded-full animate-pulse-cyan pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(41,194,230,0.2) 0%, transparent 70%)' }}
            />
            <div className="relative w-10 h-10">
              <Image
                src="/img/skippyENHANCED3D-removebg.png"
                alt="Skippy"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(41,194,230,0.7)]"
              />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border-2 border-background animate-blink" />
          </div>
          <div className="flex-1">
            <span className="font-display font-black text-lg text-foreground tracking-tight">Skippy</span>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-blink" />
              <span className="text-[10px] text-muted/60 uppercase tracking-wider">Online</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground transition-colors"
            style={{ background: 'rgba(15,39,89,0.0)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,39,89,0.8)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(15,39,89,0.0)')}
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New chat button */}
        <div className="p-3 border-b" style={{ borderColor: 'rgba(30,58,110,0.7)' }}>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => { onNewChat(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{
              background: 'rgba(41,194,230,0.1)',
              border: '1px solid rgba(41,194,230,0.25)',
              color: '#29c2e6',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.1)')}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </motion.button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <p className="px-3 py-2 text-[10px] font-semibold text-muted/50 uppercase tracking-widest">
            Conversations
          </p>
          <AnimatePresence mode="popLayout">
            {conversations.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-3 py-8 text-center"
              >
                <div className="relative w-10 h-10 mx-auto mb-3 opacity-20">
                  <Image src="/img/skippyENHANCED3D-removebg.png" alt="Skippy" fill className="object-contain" />
                </div>
                <p className="text-muted/50 text-xs">No conversations yet.<br />Start one!</p>
              </motion.div>
            ) : (
              conversations.map((conv) => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className={cn(
                    'group flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 border',
                    currentConversationId === conv.id
                      ? 'border-transparent'
                      : 'border-transparent hover:border-transparent'
                  )}
                  style={currentConversationId === conv.id ? {
                    background: 'rgba(41,194,230,0.1)',
                    borderColor: 'rgba(41,194,230,0.25)',
                  } : {}}
                  onMouseEnter={e => {
                    if (currentConversationId !== conv.id)
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(15,39,89,0.6)'
                  }}
                  onMouseLeave={e => {
                    if (currentConversationId !== conv.id)
                      (e.currentTarget as HTMLDivElement).style.background = ''
                  }}
                  onClick={() => { onSelectConversation(conv.id); onClose() }}
                >
                  <MessageSquare
                    className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                    style={{ color: currentConversationId === conv.id ? '#29c2e6' : 'rgba(77,112,153,0.5)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate"
                      style={{ color: currentConversationId === conv.id ? '#29c2e6' : 'rgba(216,232,248,0.8)' }}>
                      {truncate(conv.title, 28)}
                    </p>
                    <p className="text-[10px] text-muted/40 mt-0.5">
                      {formatRelativeTime(conv.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-muted/30 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Bottom navigation */}
        <div className="p-3 border-t space-y-0.5" style={{ borderColor: 'rgba(30,58,110,0.7)' }}>
          {navItems.map((nav) => (
            <Link key={nav.href} href={nav.href} onClick={onClose}>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150',
                  pathname === nav.href ? 'text-accent' : 'text-muted hover:text-foreground'
                )}
                style={pathname === nav.href ? { background: 'rgba(41,194,230,0.1)' } : {}}
                onMouseEnter={e => {
                  if (pathname !== nav.href) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,39,89,0.6)'
                }}
                onMouseLeave={e => {
                  if (pathname !== nav.href) (e.currentTarget as HTMLButtonElement).style.background = ''
                }}
              >
                <nav.icon className="w-3.5 h-3.5" />
                {nav.label}
              </button>
            </Link>
          ))}
        </div>
      </motion.aside>
    </>
  )
}
