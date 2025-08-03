'use client'

import type { ReactNode } from 'react'
import { SidebarProvider } from '@/components/navigation/Sidebar'
import { AnimatedGradient } from '@/components/ui/AnimatedGradient'

interface DashboardLayoutProps {
  children: ReactNode
}

/**
 * Layout for authenticated dashboard pages.
 * Auth protection handled by middleware - this only provides UI structure.
 * Features collapsible sidebar for desktop experience.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <AnimatedGradient />
      <div className="min-h-screen">
        {children}
      </div>
    </SidebarProvider>
  )
}
