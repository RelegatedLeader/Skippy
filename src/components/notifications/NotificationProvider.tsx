'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

// ── Utility: convert base64url VAPID public key to Uint8Array ───────────────
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr.buffer as ArrayBuffer
}

export interface ReminderItem {
  id: string
  content: string
  dueDate: string | null
  timeframeLabel: string | null
  isDone: boolean
  isNotified: boolean
  xpReward: number
  sourceType: string | null
  createdAt: string
}

export interface TodoItem {
  id: string
  content: string
  isDone: boolean
  priority: string
  dueDate: string | null
  xpReward: number
  createdAt: string
}

export interface UserStatsData {
  totalXP: number
  currentStreak: number
  longestStreak: number
  level: number
  name: string
  nextXP: number
  currentXP: number
  remindersCompleted: number
  todosCompleted: number
}

interface NotificationContextType {
  urgentCount: number
  pendingReminders: ReminderItem[]
  pendingTodos: TodoItem[]
  userStats: UserStatsData | null
  refreshReminders: () => void
  refreshTodos: () => void
  refreshStats: () => void
  awardXP: (xp: number, type?: 'reminder' | 'todo') => Promise<number>
}

const NotificationContext = createContext<NotificationContextType>({
  urgentCount: 0,
  pendingReminders: [],
  pendingTodos: [],
  userStats: null,
  refreshReminders: () => {},
  refreshTodos: () => {},
  refreshStats: () => {},
  awardXP: async () => 0,
})

export function useNotifications() {
  return useContext(NotificationContext)
}

function isUrgent(reminder: ReminderItem): boolean {
  if (!reminder.dueDate) return false
  const due = new Date(reminder.dueDate)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)
  return due <= tomorrow
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [pendingReminders, setPendingReminders] = useState<ReminderItem[]>([])
  const [pendingTodos, setPendingTodos] = useState<TodoItem[]>([])
  const [userStats, setUserStats] = useState<UserStatsData | null>(null)
  const notifiedIds = useRef<Set<string>>(new Set())
  const permissionRequested = useRef(false)

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders?pending=true')
      if (res.ok) {
        const data: ReminderItem[] = await res.json()
        setPendingReminders(data)
        return data
      }
    } catch { /* ignore */ }
    return []
  }, [])

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos?status=pending')
      if (res.ok) setPendingTodos(await res.json())
    } catch { /* ignore */ }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/user-stats')
      if (res.ok) setUserStats(await res.json())
    } catch { /* ignore */ }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (permissionRequested.current) return
    permissionRequested.current = true
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    // After permission is granted (or was already granted), register for Web Push
    // so notifications arrive even when the app is closed.
    if (Notification.permission === 'granted') {
      await registerPushSubscription()
    }
  }, [])

  // Register this device for Web Push using VAPID.
  // Upserts the subscription to the server so cron jobs can reach it.
  async function registerPushSubscription() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

      const reg = await navigator.serviceWorker.ready

      // Fetch the VAPID public key from the server
      const keyRes = await fetch('/api/push/vapid-public-key')
      if (!keyRes.ok) return
      const { publicKey } = await keyRes.json() as { publicKey?: string }
      if (!publicKey) return

      // Get existing subscription or create a new one
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }

      // Save to DB (upsert — handles re-installs / key rotation)
      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subJson),
      })
    } catch (e) {
      // Non-fatal: push is a bonus feature — in-app polling still works
      console.warn('[push] Registration failed:', e)
    }
  }

  const fireNotification = useCallback((reminder: ReminderItem) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (notifiedIds.current.has(reminder.id)) return

    notifiedIds.current.add(reminder.id)

    const due = reminder.dueDate ? new Date(reminder.dueDate) : null
    const body = due
      ? `Due: ${due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : reminder.timeframeLabel || 'No due date'

    new Notification(`⏰ ${reminder.content}`, {
      body,
      icon: '/img/skippyENHANCED3D-removebg.png',
      tag: `skippy-reminder-${reminder.id}`,
      requireInteraction: true,
    })

    // Mark as notified in DB
    fetch(`/api/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isNotified: true }),
    }).catch(() => {})
  }, [])

  const checkAndNotify = useCallback(async () => {
    if (document.hidden) return // skip when tab not visible
    const reminders = await fetchReminders()
    const now = new Date()
    reminders.forEach(r => {
      if (!r.dueDate || r.isNotified || r.isDone) return
      if (new Date(r.dueDate) <= now) {
        fireNotification(r)
      }
    })
  }, [fetchReminders, fireNotification])

  const awardXP = useCallback(async (xp: number, type?: 'reminder' | 'todo'): Promise<number> => {
    try {
      const res = await fetch('/api/user-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp, type }),
      })
      if (res.ok) {
        const data = await res.json()
        setUserStats(data)
        return data.xpEarned ?? xp
      }
    } catch { /* ignore */ }
    return xp
  }, [])

  useEffect(() => {
    requestPermission()
    fetchReminders()
    fetchTodos()
    fetchStats()

    // If permission was already granted (e.g. re-opened after install),
    // re-register push subscription silently so the DB stays current.
    if (typeof window !== 'undefined' && Notification.permission === 'granted') {
      registerPushSubscription()
    }

    const interval = setInterval(() => { checkAndNotify(); fetchTodos() }, 30_000)
    const visibilityHandler = () => { if (!document.hidden) { checkAndNotify(); fetchTodos() } }
    document.addEventListener('visibilitychange', visibilityHandler)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', visibilityHandler)
    }
  }, [requestPermission, fetchReminders, fetchTodos, fetchStats, checkAndNotify])

  const urgentCount = pendingReminders.filter(isUrgent).length

  return (
    <NotificationContext.Provider value={{
      urgentCount,
      pendingReminders,
      pendingTodos,
      userStats,
      refreshReminders: fetchReminders,
      refreshTodos: fetchTodos,
      refreshStats: fetchStats,
      awardXP,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}
