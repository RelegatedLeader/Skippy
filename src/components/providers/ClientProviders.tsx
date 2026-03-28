'use client'

import { NotificationProvider } from '@/components/notifications/NotificationProvider'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <NotificationProvider>
        {children}
        <NotificationBell />
        <MobileBottomNav />
      </NotificationProvider>
    </SidebarProvider>
  )
}
