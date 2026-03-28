'use client'

import { useState, useCallback } from 'react'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { useChatStore } from '@/store/chat'

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const { setMessages, setCurrentConversation } = useChatStore()

  const handleNewChat = useCallback(() => {
    setConversationId(null)
    setCurrentConversation(null)
    setMessages([])
  }, [setMessages, setCurrentConversation])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setConversationId(id)
      setCurrentConversation(id)
    },
    [setCurrentConversation]
  )

  const handleConversationCreated = useCallback(
    (id: string) => {
      setConversationId(id)
      setCurrentConversation(id)
    },
    [setCurrentConversation]
  )

  return (
    <>
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <ChatInterface
          conversationId={conversationId}
          onConversationCreated={handleConversationCreated}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
      </main>
    </>
  )
}
