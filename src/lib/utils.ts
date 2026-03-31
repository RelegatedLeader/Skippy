import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + '...' : str
}

export function parseJsonSafe<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    fact: '#3b82f6',
    preference: '#7c3aed',
    goal: '#10b981',
    mood: '#f59e0b',
    skill: '#06b6d4',
    context: '#ec4899',
    identity: '#8b5cf6',
    relationship: '#f43f5e',
    health: '#22c55e',
    finance: '#16a34a',
    routine: '#0ea5e9',
    event: '#f97316',
    belief: '#a855f7',
    pattern: '#eab308',
    project: '#14b8a6',
  }
  return colors[category] || '#64748b'
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    fact: '📌',
    preference: '❤️',
    goal: '🎯',
    mood: '🌊',
    skill: '⚡',
    context: '🔍',
    identity: '🪪',
    relationship: '👥',
    health: '🏃',
    finance: '💰',
    routine: '🔄',
    event: '📅',
    belief: '💭',
    pattern: '🔁',
    project: '🚀',
  }
  return icons[category] || '💡'
}

export const ALL_MEMORY_CATEGORIES = [
  'fact', 'preference', 'goal', 'mood', 'skill', 'context',
  'identity', 'relationship', 'health', 'finance', 'routine',
  'event', 'belief', 'pattern', 'project',
] as const

export type MemoryCategory = typeof ALL_MEMORY_CATEGORIES[number]
