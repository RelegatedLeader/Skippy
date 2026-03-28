'use client'

import { NotificationProvider } from '@/components/notifications/NotificationProvider'
import { NotificationBell } from '@/components/notifications/NotificationBell'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      {children}
      <NotificationBell />
    </NotificationProvider>
  )
}
