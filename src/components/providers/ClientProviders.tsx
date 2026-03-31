'use client'

import { NotificationProvider } from '@/components/notifications/NotificationProvider'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { GlobalVoiceListener } from '@/components/voice/GlobalVoiceListener'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <NotificationProvider>
        {children}
        <NotificationBell />
        <MobileBottomNav />
        <GlobalVoiceListener />
      </NotificationProvider>
    </SidebarProvider>
  )
}
