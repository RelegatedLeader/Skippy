'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

// ── Utility: convert base64url VAPID public key to Uint8Array ───────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
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
  notifPermission: NotificationPermission | 'unsupported'
  refreshReminders: () => void
  refreshTodos: () => void
  refreshStats: () => void
  requestPermission: () => Promise<void>
  subscribePush: (force?: boolean) => Promise<{ ok: boolean; error?: string }>
  awardXP: (xp: number, type?: 'reminder' | 'todo') => Promise<number>
}

const NotificationContext = createContext<NotificationContextType>({
  urgentCount: 0,
  pendingReminders: [],
  pendingTodos: [],
  userStats: null,
  notifPermission: 'unsupported',
  refreshReminders: () => {},
  refreshTodos: () => {},
  refreshStats: () => {},
  requestPermission: async () => {},
  subscribePush: async () => ({ ok: false }),
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
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
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
    permissionRequested.current = true
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission()
      setNotifPermission(result)
    }
    if (Notification.permission === 'granted') {
      setNotifPermission('granted')
    }
  }, [])

  // Register this device for Web Push using VAPID.
  // Returns { ok, error } so callers can surface problems in the UI.
  // Pass force=true to unsubscribe first (clears stale subscriptions).
  const subscribePush = useCallback(async (force = false): Promise<{ ok: boolean; error?: string }> => {
    if (typeof window === 'undefined') return { ok: false, error: 'Not in browser' }
    if (!('serviceWorker' in navigator)) return { ok: false, error: 'Service workers not supported' }
    if (!('PushManager' in window)) return { ok: false, error: 'Push not supported in this browser' }
    if (Notification.permission !== 'granted') return { ok: false, error: 'Notification permission not granted' }

    try {
      // Wait up to 8s for SW to become ready
      const swReady = navigator.serviceWorker.ready
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Service worker took too long to activate')), 8000)
      )
      const reg = await Promise.race([swReady, timeout])

      // Fetch VAPID public key
      const keyRes = await fetch('/api/push/vapid-public-key')
      if (!keyRes.ok) return { ok: false, error: 'Could not fetch VAPID key from server' }
      const { publicKey, error: keyErr } = await keyRes.json() as { publicKey?: string; error?: string }
      if (!publicKey) return { ok: false, error: keyErr || 'Push not configured on server' }

      // Optionally force-clear stale subscription
      if (force) {
        const existing = await reg.pushManager.getSubscription()
        if (existing) await existing.unsubscribe()
      }

      // Get or create subscription
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        })
      }

      // Save to DB
      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      if (!subJson.endpoint || !subJson.keys?.p256dh) {
        return { ok: false, error: 'Browser returned incomplete subscription — try reinstalling the PWA' }
      }

      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subJson),
      })
      if (!saveRes.ok) return { ok: false, error: 'Failed to save subscription to server' }

      return { ok: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[push] Registration failed:', msg)
      return { ok: false, error: msg }
    }
  }, [])

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
    // Initialise permission state (read only — no auto-prompt; Brave blocks auto-prompts)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
    fetchReminders()
    fetchTodos()
    fetchStats()

    // If permission was already granted (e.g. re-opened after install),
    // re-register push subscription silently so the DB stays current.
    if (typeof window !== 'undefined' && Notification.permission === 'granted') {
      subscribePush()
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
      notifPermission,
      refreshReminders: fetchReminders,
      refreshTodos: fetchTodos,
      refreshStats: fetchStats,
      requestPermission,
      subscribePush,
      awardXP,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}
