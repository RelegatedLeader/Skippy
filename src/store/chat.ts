import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIModel = 'grok' | 'claude'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: Date | string
}

export interface Conversation {
  id: string
  title: string
  model?: AIModel
  createdAt: Date | string
  updatedAt: Date | string
  messages?: Message[]
}

interface ChatStore {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  selectedModel: AIModel

  setConversations: (conversations: Conversation[]) => void
  addConversation: (conversation: Conversation) => void
  updateConversationTitle: (id: string, title: string) => void
  removeConversation: (id: string) => void
  setCurrentConversation: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateLastMessage: (content: string) => void
  setLoading: (loading: boolean) => void
  setStreaming: (streaming: boolean) => void
  setStreamingContent: (content: string) => void
  appendStreamingContent: (chunk: string) => void
  setSelectedModel: (model: AIModel) => void
  reset: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      conversations: [],
      currentConversationId: null,
      messages: [],
      isLoading: false,
      isStreaming: false,
      streamingContent: '',
      selectedModel: 'grok',

      setConversations: (conversations) => set({ conversations }),

      addConversation: (conversation) =>
        set((state) => ({
          conversations: [conversation, ...state.conversations],
        })),

      updateConversationTitle: (id, title) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        })),

      removeConversation: (id) =>
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          currentConversationId:
            state.currentConversationId === id ? null : state.currentConversationId,
          messages: state.currentConversationId === id ? [] : state.messages,
        })),

      setCurrentConversation: (id) => set({ currentConversationId: id }),
      setMessages: (messages) => set({ messages }),

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      updateLastMessage: (content) =>
        set((state) => {
          const messages = [...state.messages]
          if (messages.length > 0) {
            messages[messages.length - 1] = { ...messages[messages.length - 1], content }
          }
          return { messages }
        }),

      setLoading: (isLoading) => set({ isLoading }),
      setStreaming: (isStreaming) => set({ isStreaming }),
      setStreamingContent: (streamingContent) => set({ streamingContent }),

      appendStreamingContent: (chunk) =>
        set((state) => ({ streamingContent: state.streamingContent + chunk })),

      setSelectedModel: (selectedModel) => set({ selectedModel }),

      reset: () =>
        set({
          currentConversationId: null,
          messages: [],
          isLoading: false,
          isStreaming: false,
          streamingContent: '',
        }),
    }),
    {
      name: 'skippy-chat',
      partialize: (state) => ({ selectedModel: state.selectedModel }),
    }
  )
)

