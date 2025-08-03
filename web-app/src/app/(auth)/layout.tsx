import type { ReactNode } from 'react'

interface AuthLayoutProps {
  children: ReactNode
}

/**
 * Layout for authentication pages (login, signup, etc.)
 * Provides centered, mobile-first design with dark theme.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
      <div className="w-full max-w-[480px]">
        {children}
      </div>
    </div>
  )
}
