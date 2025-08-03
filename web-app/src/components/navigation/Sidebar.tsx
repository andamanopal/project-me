'use client'

import { useState, createContext, useContext, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Clock, Settings, LogOut, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'
import { useAuth } from '@/hooks/useAuth'

interface SidebarContextType {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
  showText: boolean
}

const SidebarContext = createContext<SidebarContextType | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

interface NavItem {
  href: string
  label: string
  icon: typeof Home
}

const navItems: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/journey', label: 'Journey', icon: Clock },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  children: React.ReactNode
}

export function SidebarProvider({ children }: SidebarProps) {
  // Default to collapsed, expands on hover
  const [isCollapsed, setIsCollapsed] = useState(true)
  // Delayed text visibility to prevent text wrapping during expand animation
  const [showText, setShowText] = useState(false)

  useEffect(() => {
    if (isCollapsed) {
      // Immediately hide text when collapsing
      setShowText(false)
    } else {
      // Delay showing text until sidebar width has expanded
      const timer = setTimeout(() => setShowText(true), 150)
      return () => clearTimeout(timer)
    }
  }, [isCollapsed])

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, showText }}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main
          className={cn(
            'flex-1 transition-all duration-300',
            isCollapsed ? 'ml-[72px]' : 'ml-[240px]'
          )}
        >
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isCollapsed, setIsCollapsed, showText } = useSidebar()
  const { profile, userEmail } = useProfile()
  const { signOut, isSigningOut } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const displayName = profile?.display_name || userEmail?.split('@')[0] || 'User'
  const initials = displayName.charAt(0).toUpperCase()

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu])

  // Close menu when sidebar collapses
  useEffect(() => {
    if (isCollapsed) {
      setShowUserMenu(false)
    }
  }, [isCollapsed])

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/login')
    } catch {
      // Error handled silently - user stays on page
    }
  }

  return (
    <aside
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => {
        setIsCollapsed(true)
        setShowUserMenu(false)
      }}
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r border-white/5 bg-[#0a0a0a] transition-all duration-300',
        isCollapsed ? 'w-[72px]' : 'w-[240px]'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo / Brand */}
        <div className="flex h-16 items-center pl-5">
          <Image
            src="/project-me-icon.png"
            alt="Project Me"
            width={32}
            height={32}
            className="h-8 w-8 flex-shrink-0"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg pl-[14px] pr-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-blue-600/10 text-blue-400'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 flex-shrink-0 transition-colors',
                    isActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'
                  )}
                />
                {showText && (
                  <span className="whitespace-nowrap animate-in fade-in duration-200">
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Section with Click Menu */}
        <div className="relative border-t border-white/5 p-3" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="group relative flex w-full cursor-pointer items-center gap-3 rounded-lg pl-2 pr-3 py-2.5 transition-colors hover:bg-white/5"
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500">
                  <span className="text-xs font-semibold text-white">{initials}</span>
                </div>
              )}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a] bg-green-500" />
            </div>

            {showText && (
              <div className="min-w-0 flex-1 text-left animate-in fade-in duration-200">
                <p className="truncate text-sm font-medium text-white">{displayName}</p>
                <p className="truncate text-xs text-gray-500">{userEmail}</p>
              </div>
            )}
          </button>

          {/* Click Menu Dropdown */}
          {showUserMenu && (
            <div
              className={cn(
                'absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-white/10 bg-[#1a1a1f] p-2 shadow-xl',
                isCollapsed && 'left-full ml-2 bottom-0 mb-0'
              )}
            >
              {/* User Info Header */}
              <div className="flex items-center gap-3 rounded-lg px-3 py-3 mb-1">
                {profile?.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500">
                    <span className="text-sm font-semibold text-white">{initials}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{displayName}</p>
                  <p className="truncate text-xs text-gray-400">{userEmail}</p>
                </div>
              </div>

              <div className="h-px bg-white/10 my-1" />

              {/* Menu Items */}
              <Link
                href="/settings/profile"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <User className="h-4 w-4" />
                <span>Profile</span>
              </Link>

              <Link
                href="/settings"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>

              <div className="h-px bg-white/10 my-1" />

              {/* Sign Out */}
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
